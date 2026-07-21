import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { queryCounts, DEFAULT_DB } = require("./helpers/testDb.js");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = process.env.TEST_PORT || "3002";
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

const FORBIDDEN_SNIPPETS = [
  "360102198908093212",
  "310101199511213456",
  "440105199408084785",
  "13812340001",
  "13912340002",
  "6222024000112233445",
  "6222024000112233446"
];

function copyTempDb() {
  const tmp = path.join(os.tmpdir(), `eos-hr-e2e-${Date.now()}.db`);
  fs.copyFileSync(DEFAULT_DB, tmp);
  return tmp;
}

function scanSensitiveText(text) {
  const hits = [];
  for (const s of FORBIDDEN_SNIPPETS) {
    if (text.includes(s)) hits.push(s);
  }
  if (/\b1[3-9]\d{9}\b/.test(text)) hits.push("full-mobile-pattern");
  if (/\b\d{17}[\dXx]\b/.test(text)) hits.push("full-id-pattern");
  if (/\b6222\d{12,}\b/.test(text)) hits.push("full-bank-pattern");
  return [...new Set(hits)];
}

async function startServer(dbPath) {
  const proc = spawn("node", ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT, DB_PATH: dbPath, AI_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "x", password: "x", role: "admin" })
      });
      if (r.status === 401 || r.status === 400) return proc;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill("SIGTERM");
  throw new Error("e2e server start timeout");
}

async function login(page, role) {
  const creds =
    role === "admin"
      ? { username: "admin", password: "admin123", role: "admin" }
      : { username: "enterprise", password: "enterprise123", role: "enterprise" };
  await page.goto(BASE);
  await page.selectOption("#loginRole", creds.role);
  await page.fill("#loginUsername", creds.username);
  await page.fill("#loginPassword", creds.password);
  await page.click("#loginBtn");
  await page.waitForSelector("#appShell:not([hidden])", { timeout: 10000 });
}

function actionVisible(page, id) {
  return page.evaluate((btnId) => {
    const btn = document.getElementById(btnId);
    return !!(btn && !btn.disabled && !btn.classList.contains("is-staffing-action-hidden"));
  }, id);
}

async function runFullFlow(page) {
  await login(page, "enterprise");
  await page.waitForSelector("#enterprise-home.is-active");
  await page.click('button[data-jump="ai-assistant"]');
  await page.waitForSelector("#ai-assistant.is-active");
  await page.fill("#aiQueryInput", "找3名北京Java开发，5年以上经验，下周到岗");
  await page.click("#runAiMatch");
  await page.waitForSelector(".ai-candidate-card", { timeout: 12000 });
  await page.locator(".ai-toggle-pick").first().click();
  await page.click("#aiSubmitRequirement");
  await page.waitForFunction(
    () => document.querySelector("#aiStatusBar")?.dataset?.requirementId,
    null,
    { timeout: 15000 }
  );
  const reqId = await page.evaluate(() => document.getElementById("aiStatusBar")?.dataset?.requirementId);
  if (!reqId) throw new Error("missing submitted requirement id");

  await page.click("#logoutBtn");
  await page.waitForSelector("#loginScreen:not(.is-hidden)");

  await login(page, "admin");
  await page.waitForFunction(() => !!document.getElementById("staffing-admin"));
  await page.click('[data-top-nav-target="ai"]');
  await page.click('.secondary-menu-item[data-target="staffing-admin"]');
  await page.waitForSelector("#staffing-admin.is-active", { timeout: 15000 });

  const targetRow = page.locator(`#staffingAdminRows tr[data-req-id="${reqId}"]`);
  await targetRow.waitFor({ state: "visible", timeout: 10000 });
  await targetRow.click();
  await page.waitForSelector("#staffingAdminDetail:not([hidden])");

  if (!(await actionVisible(page, "staffingDetailConfirm"))) throw new Error("confirm should be visible");
  if (await actionVisible(page, "staffingDetailConvert")) throw new Error("convert should be hidden before confirm");

  const [confirmResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/confirm") && r.request().method() === "POST"),
    page.click("#staffingDetailConfirm")
  ]);
  if (!confirmResp.ok()) throw new Error(`confirm failed: ${confirmResp.status()}`);
  await targetRow.click();
  await page.waitForFunction(
    () => {
      const convert = document.getElementById("staffingDetailConvert");
      const confirm = document.getElementById("staffingDetailConfirm");
      return (
        convert &&
        !convert.classList.contains("is-staffing-action-hidden") &&
        confirm &&
        confirm.classList.contains("is-staffing-action-hidden")
      );
    },
    null,
    { timeout: 15000 }
  );

  const [convertResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/convert-project") && r.request().method() === "POST"),
    page.click("#staffingDetailConvert")
  ]);
  if (!convertResp.ok()) throw new Error(`convert failed: ${convertResp.status()}`);
  await targetRow.click();
  await page.waitForFunction(
    () => {
      const convert = document.getElementById("staffingDetailConvert");
      const confirm = document.getElementById("staffingDetailConfirm");
      return (
        convert?.classList.contains("is-staffing-action-hidden") &&
        confirm?.classList.contains("is-staffing-action-hidden")
      );
    },
    null,
    { timeout: 10000 }
  );

  console.log(`✔ full flow OK (requirement #${reqId})`);
  return reqId;
}

async function runDomScans(page) {
  await page.goto(BASE);
  let hits = scanSensitiveText(await page.evaluate(() => document.body.innerText));
  if (hits.length) throw new Error(`unauthenticated DOM sensitive hits: ${hits.join(", ")}`);
  console.log("✔ unauthenticated DOM scan clean");

  await login(page, "enterprise");
  hits = scanSensitiveText(await page.evaluate(() => document.body.innerText));
  if (hits.length) throw new Error(`enterprise DOM sensitive hits: ${hits.join(", ")}`);
  console.log("✔ enterprise DOM scan clean");
}

const MODULE_TAB_SUITES = [
  { panel: "employee", topNav: "employee", tabs: ["roster", "archive", "work-exp", "edu-exp"] },
  { panel: "organization", topNav: "organization", tabs: ["org-tree", "org-post", "org-duty", "org-rank"] },
  { panel: "social", topNav: "social", tabs: ["daily-attend", "monthly-attend", "attend-report", "attend-setting", "social-insurance"] },
  { panel: "approval", topNav: "employee", tabs: ["pending-approval", "pending-offboard", "care-notice", "interview-schedule"] },
  { panel: "import", topNav: "import", tabs: ["salary-file", "salary-slip", "init-attend", "duty-roster"] },
  { panel: "reports", topNav: "reports", tabs: ["hr-report", "recruit-report", "employee-overview", "year-analysis"] }
];

async function activatePanel(page, panelId, topNav) {
  await page.click(`[data-top-nav-target="${topNav}"]`);
  await page.click(`.secondary-menu-item[data-target="${panelId}"]`);
  await page.waitForSelector(`#${panelId}.is-active`, { timeout: 10000 });
}

async function assertModuleViewActive(page, panelId, tabKey) {
  const ok = await page.evaluate(
    ({ panelId, tabKey }) => {
      const panel = document.getElementById(panelId);
      const view = panel?.querySelector(`.module-view[data-module-view="${tabKey}"]`);
      const tab = panel?.querySelector(`.module-tab[data-module="${tabKey}"]`);
      return !!(view?.classList.contains("is-active") && tab?.classList.contains("is-active"));
    },
    { panelId, tabKey }
  );
  if (!ok) throw new Error(`module-view not active: ${panelId}/${tabKey}`);
}

async function runModuleTabTests(page) {
  await login(page, "admin");
  await page.waitForFunction(() => !!document.getElementById("employee"));
  const archiveRows = await page.locator('#employee tbody[data-demo-table="archive"] tr').count();
  if (archiveRows < 1) throw new Error("admin demo archive rows not rendered");

  for (const suite of MODULE_TAB_SUITES) {
    await activatePanel(page, suite.panel, suite.topNav);
    for (const tabKey of suite.tabs) {
      await page.locator(`#${suite.panel} .module-tab[data-module="${tabKey}"]`).click();
      await assertModuleViewActive(page, suite.panel, tabKey);
    }
  }
  console.log("✔ admin module-tab switches OK");
}

async function runLogoutSecurityTest(page) {
  await page.click("#logoutBtn");
  await page.waitForSelector("#loginScreen:not(.is-hidden)", { timeout: 10000 });
  const state = await page.evaluate(() => ({
    employeePanel: !!document.getElementById("employee"),
    archiveRows: document.querySelector('tbody[data-demo-table="archive"]')?.children.length || 0,
    importRows: document.getElementById("importRows")?.children.length || 0
  }));
  if (state.employeePanel) throw new Error("admin panel still in DOM after logout");
  if (state.archiveRows > 0) throw new Error("demo archive data still in DOM after logout");
  if (state.importRows > 0) throw new Error("demo import data still in DOM after logout");
  console.log("✔ logout hides admin panels and demo data");
}

const tempDb = copyTempDb();
const prodCountsBefore = await queryCounts(DEFAULT_DB);
let serverProc;

try {
  serverProc = await startServer(tempDb);
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await runDomScans(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE);
    await runModuleTabTests(page);
    await runLogoutSecurityTest(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE);
    await runFullFlow(page);
    if (errors.length) throw new Error(`Console errors: ${errors.join("; ")}`);
    console.log("✔ no page errors");
  } finally {
    await browser.close();
  }
} finally {
  if (serverProc) serverProc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
  fs.unlinkSync(tempDb);
  const prodCountsAfter = await queryCounts(DEFAULT_DB);
  const same = JSON.stringify(prodCountsBefore) === JSON.stringify(prodCountsAfter);
  if (!same) throw new Error(`prod db counts changed: before=${JSON.stringify(prodCountsBefore)} after=${JSON.stringify(prodCountsAfter)}`);
  console.log("✔ prod eos_hr.db counts unchanged");
}
