const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("path");
const { copyTempDb, removeDb, queryCounts, DEFAULT_DB } = require("./helpers/testDb");
const { makeDocxBuffer, makePdfBuffer } = require("./helpers/resumeFixtures");

const PORT = process.env.TEST_PORT || "3001";
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc;
let tempDb;
let prodCountsBefore;

function waitForServer(ms = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(`${BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "x", password: "x", role: "admin" })
        });
        if (r.status === 401 || r.status === 400) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - start > ms) return reject(new Error("server start timeout"));
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function login(role) {
  const creds =
    role === "admin"
      ? { username: "admin", password: "admin123", role: "admin" }
      : { username: "enterprise", password: "enterprise123", role: "enterprise" };
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds)
  });
  const data = await r.json();
  return { token: data.token, user: data.user };
}

async function api(token, url, options = {}) {
  const r = await fetch(`${BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  let body = {};
  try {
    body = await r.json();
  } catch {
    body = {};
  }
  return { status: r.status, body };
}

async function uploadResume(token, buffer, filename, mime) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), filename);
  const r = await fetch(`${BASE}/api/ai/parse-resume-file`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  let body = {};
  try {
    body = await r.json();
  } catch {
    body = {};
  }
  return { status: r.status, body };
}

async function getRequirementStatus(token, id) {
  const r = await api(token, `/api/staffing/requirements/${id}`);
  return r.body.row?.status;
}

before(async () => {
  prodCountsBefore = await queryCounts(DEFAULT_DB);
  tempDb = copyTempDb();
  serverProc = spawn("node", ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT, DB_PATH: tempDb, AI_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer();
});

after(async () => {
  if (serverProc) serverProc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
  removeDb(tempDb);
  const prodCountsAfter = await queryCounts(DEFAULT_DB);
  assert.deepEqual(prodCountsAfter, prodCountsBefore, "正式 eos_hr.db 记录数不应被测试修改");
});

describe("staffing API acceptance", () => {
  test("enterprise blocked from admin datasets", async () => {
    const { token } = await login("enterprise");
    for (const p of ["/api/employees", "/api/contracts", "/api/invoices", "/api/companies", "/api/projects", "/api/dashboard", "/api/workspace"]) {
      const { status } = await api(token, p);
      assert.equal(status, 403, `${p} should be 403`);
    }
  });

  test("PATCH cannot change status", async () => {
    const ent = await login("enterprise");
    const admin = await login("admin");
    const created = await api(ent.token, "/api/staffing/requirements", {
      method: "POST",
      body: JSON.stringify({ rawQuery: "找1名北京Java开发，5年经验，下周到岗" })
    });
    const id = created.body.row.id;
    const before = created.body.row.status;

    let r = await api(admin.token, `/api/staffing/requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "已转项目" })
    });
    assert.equal(r.status, 400);
    assert.equal(await getRequirementStatus(admin.token, id), before);

    await api(ent.token, `/api/staffing/requirements/${id}/match`, { method: "POST" });
    const detail = await api(ent.token, `/api/staffing/requirements/${id}`);
    const cid = detail.body.candidates[0].candidateId;
    await api(ent.token, `/api/staffing/requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ selectedCandidateIds: [cid] })
    });
    await api(ent.token, `/api/staffing/requirements/${id}/submit`, { method: "POST" });
    await api(admin.token, `/api/staffing/requirements/${id}/confirm`, { method: "POST" });
    await api(admin.token, `/api/staffing/requirements/${id}/convert-project`, { method: "POST" });

    r = await api(admin.token, `/api/staffing/requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "已确认" })
    });
    assert.equal(r.status, 400);
    assert.equal(await getRequirementStatus(admin.token, id), "已转项目");
  });

  test("invalid state transitions return 409", async () => {
    const ent = await login("enterprise");
    const admin = await login("admin");
    const created = await api(ent.token, "/api/staffing/requirements", {
      method: "POST",
      body: JSON.stringify({ rawQuery: "找1名北京Java开发，5年经验，下周到岗" })
    });
    const id = created.body.row.id;

    let r = await api(admin.token, `/api/staffing/requirements/${id}/confirm`, { method: "POST" });
    assert.equal(r.status, 409);

    await api(ent.token, `/api/staffing/requirements/${id}/match`, { method: "POST" });
    const detail = await api(ent.token, `/api/staffing/requirements/${id}`);
    const cid = detail.body.candidates[0].candidateId;
    await api(ent.token, `/api/staffing/requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ selectedCandidateIds: [cid] })
    });
    await api(ent.token, `/api/staffing/requirements/${id}/submit`, { method: "POST" });

    r = await api(admin.token, `/api/staffing/requirements/${id}/convert-project`, { method: "POST" });
    assert.equal(r.status, 409);

    await api(admin.token, `/api/staffing/requirements/${id}/confirm`, { method: "POST" });
    const converted = await api(admin.token, `/api/staffing/requirements/${id}/convert-project`, { method: "POST" });
    assert.equal(converted.status, 200);

    r = await api(admin.token, `/api/staffing/requirements/${id}/convert-project`, { method: "POST" });
    assert.equal(r.status, 409);
  });

  test("illegal candidate id rejected", async () => {
    const ent = await login("enterprise");
    const created = await api(ent.token, "/api/staffing/requirements", {
      method: "POST",
      body: JSON.stringify({ rawQuery: "找1名北京Java开发，5年经验，下周到岗" })
    });
    const id = created.body.row.id;
    await api(ent.token, `/api/staffing/requirements/${id}/match`, { method: "POST" });
    const r = await api(ent.token, `/api/staffing/requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ selectedCandidateIds: [999999] })
    });
    assert.equal(r.status, 400);
  });

  test("enterprise cannot read other company requirement", async () => {
    const admin = await login("admin");
    const ent = await login("enterprise");
    const otherCo = await api(admin.token, "/api/companies");
    const other = (otherCo.body.rows || []).find((c) => c.code === "OTHER-ENT");
    assert.ok(other, "OTHER-ENT company should exist");
    const created = await api(admin.token, "/api/staffing/requirements", {
      method: "POST",
      body: JSON.stringify({ rawQuery: "找1名上海保安，3年经验，立即到岗", companyId: other.id, companyName: other.name })
    });
    const id = created.body.row.id;
    const r = await api(ent.token, `/api/staffing/requirements/${id}`);
    assert.equal(r.status, 403);
  });

  test("convert creates single project and approval", async () => {
    const ent = await login("enterprise");
    const admin = await login("admin");
    const created = await api(ent.token, "/api/staffing/requirements", {
      method: "POST",
      body: JSON.stringify({ rawQuery: "找2名北京Java开发，5年以上经验，下周到岗" })
    });
    const id = created.body.row.id;
    await api(ent.token, `/api/staffing/requirements/${id}/match`, { method: "POST" });
    const detail = await api(ent.token, `/api/staffing/requirements/${id}`);
    const cid = detail.body.candidates[0].candidateId;
    await api(ent.token, `/api/staffing/requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ selectedCandidateIds: [cid] })
    });
    await api(ent.token, `/api/staffing/requirements/${id}/submit`, { method: "POST" });
    await api(admin.token, `/api/staffing/requirements/${id}/confirm`, { method: "POST" });
    const conv = await api(admin.token, `/api/staffing/requirements/${id}/convert-project`, { method: "POST" });
    assert.equal(conv.status, 200);
    assert.equal(conv.body.row.status, "已转项目");

    const projects = await api(admin.token, "/api/projects");
    const code = conv.body.projectCode;
    const matches = (projects.body.rows || []).filter((p) => p.code === code);
    assert.equal(matches.length, 1);

    const approvals = await api(admin.token, "/api/approvals");
    const appr = (approvals.body.rows || []).filter((a) => a.no === conv.body.approvalNo);
    assert.equal(appr.length, 1);

    const conv2 = await api(admin.token, `/api/staffing/requirements/${id}/convert-project`, { method: "POST" });
    assert.equal(conv2.status, 409);
  });

  test("parse-requirement returns rule fallback when AI disabled", async () => {
    const ent = await login("enterprise");
    const r = await api(ent.token, "/api/ai/parse-requirement", {
      method: "POST",
      body: JSON.stringify({ text: "找3名北京Java开发，5年以上经验，下周到岗" })
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.parseSource, "rule");
    assert.equal(r.body.parseSourceLabel, "规则兜底");
    assert.ok(r.body.parsedTags?.length);
  });

  test("parse-resume returns structured candidate with fallback", async () => {
    const ent = await login("enterprise");
    const r = await api(ent.token, "/api/ai/parse-resume", {
      method: "POST",
      body: JSON.stringify({
        text: "姓名：演示员A，岗位：Java工程师，城市：北京，5年Java/Spring经验，可到岗：7天内"
      })
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.parseSource, "rule");
    assert.ok(r.body.candidate);
  });

  test("admin and enterprise can upload and parse DOCX/PDF resumes", async () => {
    const ent = await login("enterprise");
    const admin = await login("admin");
    const docx = await makeDocxBuffer(
      "姓名：张三 北京 Java开发工程师 5年工作经验 本科学历 Java Spring MySQL 计算机二级"
    );
    const entResult = await uploadResume(
      ent.token,
      docx,
      "张三简历.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    assert.equal(entResult.status, 200);
    assert.equal(entResult.body.fileType, "docx");
    assert.equal(entResult.body.candidate.jobTitle, "后端开发");
    assert.equal(entResult.body.candidate.city, "北京");
    assert.ok(entResult.body.extractedCharCount > 10);

    const pdf = await makePdfBuffer("Resume Alice frontend developer React 4 years experience");
    const adminResult = await uploadResume(admin.token, pdf, "alice.pdf", "application/pdf");
    assert.equal(adminResult.status, 200);
    assert.equal(adminResult.body.fileType, "pdf");
    assert.ok(adminResult.body.extractedCharCount > 10);
    assert.equal(adminResult.body.parseSource, "rule");
  });

  test("resume upload requires login and rejects invalid or oversized files", async () => {
    const noAuth = await uploadResume(null, Buffer.from("hello"), "resume.pdf", "application/pdf");
    assert.equal(noAuth.status, 401);

    const ent = await login("enterprise");
    const mismatch = await uploadResume(ent.token, Buffer.from("not a pdf"), "resume.pdf", "application/pdf");
    assert.equal(mismatch.status, 400);
    assert.match(mismatch.body.message, /扩展名不匹配|内容与扩展名不匹配/);

    const unsupported = await uploadResume(
      ent.token,
      Buffer.from("legacy word"),
      "resume.doc",
      "application/msword"
    );
    assert.equal(unsupported.status, 400);
    assert.match(unsupported.body.message, /仅支持 PDF 和 DOCX/);

    const oversized = await uploadResume(
      ent.token,
      Buffer.alloc(5 * 1024 * 1024 + 1, 0x41),
      "large.pdf",
      "application/pdf"
    );
    assert.equal(oversized.status, 413);
    assert.match(oversized.body.message, /5MB/);
  });

  test("ai match includes parseSource without API key", async () => {
    const ent = await login("enterprise");
    const r = await api(ent.token, "/api/ai/match", {
      method: "POST",
      body: JSON.stringify({ query: "需要10名上海保安，3年以上经验，立即到岗" })
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.parseSource, "rule");
    assert.ok(Array.isArray(r.body.rows));
  });
});
