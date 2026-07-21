const API = "";
const authState = {
  token: localStorage.getItem("eos_token") || "",
  user: JSON.parse(localStorage.getItem("eos_user") || "null")
};
const workspaceState = { page: 1, pageSize: 10, total: 0, rows: [] };
let employeeRowsCache = [];
let invoiceRowsCache = [];
let projectRowsCache = [];
let companySelectCache = [];
let drawerEmployeeId = null;
const STATUS_TRANSITIONS = {
  待入职: ["试用期", "在职"],
  试用期: ["在职", "待离职", "异动中"],
  在职: ["异动中", "待离职"],
  异动中: ["在职", "待离职"],
  待离职: ["已离职"],
  已离职: []
};

const staticRows = window.ADMIN_DEMO_TABLES || {};

const ENTERPRISE_PANEL_IDS = new Set(["enterprise-home", "ai-assistant"]);
const detachedAdminPanels = [];

const panels = [...document.querySelectorAll(".route-panels > section.panel")];
const roleSwitcher = document.getElementById("roleSwitcher");
const pageTitle = document.getElementById("pageTitle");
const breadcrumbTop = document.getElementById("breadcrumbTop");
const welcomeText = document.getElementById("welcomeText");
const topbarUser = document.getElementById("topbarUser");
const topbarUserAvatar = document.getElementById("topbarUserAvatar");
const topbarUserName = document.getElementById("topbarUserName");
const topbarUserRole = document.getElementById("topbarUserRole");
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginBtn = document.getElementById("loginBtn");
const loginTips = document.getElementById("loginTips");
const secondaryMenu = document.getElementById("secondaryMenu");
const sidebarToggle = document.getElementById("sidebarToggle");

const PANEL_MENU_ICONS = {
  dashboard: "fa-solid fa-house",
  workspace: "fa-solid fa-inbox",
  project: "fa-solid fa-briefcase",
  employee: "fa-regular fa-id-card",
  contract: "fa-regular fa-file-lines",
  retire: "fa-regular fa-clock",
  approval: "fa-regular fa-square-check",
  organization: "fa-solid fa-sitemap",
  company: "fa-regular fa-building",
  social: "fa-solid fa-calendar-check",
  policy: "fa-regular fa-map",
  import: "fa-solid fa-upload",
  invoice: "fa-regular fa-file",
  reports: "fa-solid fa-chart-column",
  settings: "fa-solid fa-gear",
  "ai-assistant": "fa-regular fa-lightbulb",
  "enterprise-home": "fa-solid fa-building-user",
  "staffing-admin": "fa-solid fa-list-check"
};

const panelTitleMap = {
  dashboard: "运营概览",
  workspace: "工单操作",
  project: "项目中心",
  employee: "员工名册",
  organization: "组织架构",
  company: "企业管理",
  social: "考勤管理",
  contract: "劳动合同",
  approval: "人事流程",
  invoice: "发票查询",
  retire: "退休办理",
  policy: "城市政策",
  import: "数据上传",
  reports: "报表中心",
  settings: "系统设置",
  "ai-assistant": "AI 用工助手",
  "enterprise-home": "企业工作台",
  "staffing-admin": "用工需求"
};

const topNavConfig = {
  workspace: {
    sections: [{ title: "工作台", items: ["dashboard", "workspace"] }]
  },
  employee: {
    sections: [
      { title: "员工管理", items: ["employee", "contract"] },
      { title: "人事流程", items: ["approval", "retire"] }
    ]
  },
  organization: {
    sections: [{ title: "组织管理", items: ["organization", "company"] }]
  },
  social: {
    sections: [{ title: "考勤假期", items: ["social", "policy"] }]
  },
  import: {
    sections: [{ title: "薪酬管理", items: ["import", "invoice"] }]
  },
  project: {
    sections: [{ title: "项目管理", items: ["project"] }]
  },
  ai: {
    sections: [
      { title: "AI用工助手", items: ["ai-assistant"] },
      { title: "需求管理", items: ["staffing-admin"] }
    ]
  },
  enterprise: {
    sections: [
      { title: "企业工作台", items: ["enterprise-home"] },
      { title: "智能用工", items: ["ai-assistant"] }
    ]
  },
  reports: {
    sections: [{ title: "更多", items: ["reports", "settings"] }]
  }
};
const topNavLabelMap = {
  workspace: "工作台",
  employee: "人事",
  organization: "组织",
  social: "考勤假期",
  import: "薪酬",
  project: "项目",
  ai: "AI用工助手",
  enterprise: "企业",
  reports: "更多"
};
const panelToTop = {
  dashboard: "workspace",
  workspace: "workspace",
  project: "project",
  employee: "employee",
  contract: "employee",
  retire: "employee",
  approval: "employee",
  organization: "organization",
  company: "organization",
  social: "social",
  policy: "social",
  import: "import",
  invoice: "import",
  reports: "reports",
  settings: "reports",
  "ai-assistant": "ai",
  "staffing-admin": "ai",
  "enterprise-home": "enterprise"
};
const topNavRoleMap = {
  workspace: ["admin"],
  employee: ["admin"],
  organization: ["admin"],
  social: ["admin"],
  import: ["admin"],
  project: ["admin"],
  ai: ["admin", "enterprise"],
  enterprise: ["enterprise"],
  reports: ["admin"]
};
const panelRoleMap = {
  dashboard: ["admin"],
  workspace: ["admin"],
  project: ["admin"],
  employee: ["admin"],
  organization: ["admin"],
  company: ["admin"],
  social: ["admin"],
  contract: ["admin"],
  approval: ["admin"],
  invoice: ["admin"],
  retire: ["admin"],
  policy: ["admin"],
  import: ["admin"],
  reports: ["admin"],
  settings: ["admin"],
  "ai-assistant": ["admin", "enterprise"],
  "enterprise-home": ["enterprise"],
  "staffing-admin": ["admin"]
};
let currentTopKey = "workspace";

const WORKBENCH_SHORTCUT_CATALOG = [
  { key: "workspace-orders", jump: "workspace", scrollTarget: "workspaceOrdersPanel", label: "增减员管理", icon: "fa-solid fa-right-left" },
  { key: "employee", jump: "employee", label: "员工名册", icon: "fa-solid fa-users" },
  { key: "contract", jump: "contract", label: "劳动合同", icon: "fa-regular fa-file-lines" },
  { key: "approval", jump: "approval", moduleTab: "pending-approval", label: "待处理审批", icon: "fa-solid fa-list-check" },
  { key: "social-daily", jump: "social", moduleTab: "daily-attend", label: "考勤管理", icon: "fa-solid fa-calendar-check" },
  { key: "social-insurance", jump: "social", moduleTab: "social-insurance", label: "社保办理", icon: "fa-solid fa-building-columns" },
  { key: "import", jump: "import", label: "薪资上传", icon: "fa-solid fa-upload" },
  { key: "invoice", jump: "invoice", label: "发票查询", icon: "fa-regular fa-file-lines" },
  { key: "policy", jump: "policy", label: "城市政策", icon: "fa-regular fa-map" },
  { key: "calculator", action: "calculator", label: "社保计算器", icon: "fa-solid fa-calculator" },
  { key: "reports", jump: "reports", label: "报表中心", icon: "fa-solid fa-chart-column" },
  { key: "project", jump: "project", label: "项目中心", icon: "fa-solid fa-briefcase" },
  { key: "company", jump: "company", label: "企业管理", icon: "fa-regular fa-building" },
  { key: "retire", jump: "retire", label: "退休办理", icon: "fa-regular fa-clock" }
];
const WORKBENCH_RECENT_STORAGE_KEY = "eos_workbench_recents";
const WORKBENCH_RECENT_MAX = 6;
const WORKBENCH_RECENT_DEFAULTS = ["workspace-orders", "employee", "approval", "contract", "social-daily", "invoice"];
const PANEL_TO_SHORTCUT_KEY = {
  workspace: "workspace-orders",
  employee: "employee",
  contract: "contract",
  approval: "approval",
  social: "social-daily",
  import: "import",
  invoice: "invoice",
  policy: "policy",
  reports: "reports",
  project: "project",
  company: "company",
  retire: "retire"
};

function getWorkbenchShortcut(key) {
  return WORKBENCH_SHORTCUT_CATALOG.find((item) => item.key === key);
}

function readWorkbenchRecents() {
  try {
    const raw = localStorage.getItem(WORKBENCH_RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key) => getWorkbenchShortcut(key));
  } catch {
    return [];
  }
}

function writeWorkbenchRecents(keys) {
  localStorage.setItem(WORKBENCH_RECENT_STORAGE_KEY, JSON.stringify(keys.slice(0, WORKBENCH_RECENT_MAX)));
}

function pushWorkbenchRecent(key) {
  if (!getWorkbenchShortcut(key)) return;
  const next = [key, ...readWorkbenchRecents().filter((item) => item !== key)].slice(0, WORKBENCH_RECENT_MAX);
  writeWorkbenchRecents(next);
  const query = document.getElementById("workbenchMenuSearch")?.value.trim();
  if (!query) renderWorkbenchTiles("");
}

function createWorkbenchTileButton(item) {
  const attrs = [
    `type="button"`,
    `class="quick-btn workbench-tile-btn"`,
    `data-shortcut-key="${item.key}"`,
    `data-label="${item.label}"`
  ];
  if (item.jump) attrs.push(`data-jump="${item.jump}"`);
  if (item.moduleTab) attrs.push(`data-module-tab="${item.moduleTab}"`);
  if (item.scrollTarget) attrs.push(`data-scroll-target="${item.scrollTarget}"`);
  if (item.action === "calculator") attrs.push(`id="openCalculatorFromWb"`);
  return `<button ${attrs.join(" ")}><i class="${item.icon}" aria-hidden="true"></i>${item.label}</button>`;
}

function bindWorkbenchTileButton(btn) {
  if (!(btn instanceof HTMLButtonElement) || btn.dataset.shortcutBound === "1") return;
  btn.dataset.shortcutBound = "1";
  if (!btn.dataset.labelHtml) btn.dataset.labelHtml = btn.innerHTML;
  if (!btn.dataset.displayLabel) btn.dataset.displayLabel = btn.textContent.trim();
  btn.addEventListener("click", () => {
    if (btn.id === "openCalculatorFromWb") {
      pushWorkbenchRecent(btn.dataset.shortcutKey || "calculator");
      showCalculatorDialog();
      return;
    }
    const jump = btn.dataset.jump;
    const moduleTab = btn.dataset.moduleTab;
    if (btn.dataset.shortcutKey) pushWorkbenchRecent(btn.dataset.shortcutKey);
    if (jump) {
      activate(jump);
      if (moduleTab) requestAnimationFrame(() => activateModuleTab(jump, moduleTab));
    }
    const scrollId = btn.dataset.scrollTarget;
    if (scrollId) {
      requestAnimationFrame(() => document.getElementById(scrollId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  });
}

function renderWorkbenchTiles(query = "") {
  const list = document.getElementById("workbenchTiles");
  if (!list) return;
  const norm = (query || "").trim().toLowerCase();
  let items = [];
  if (norm) {
    items = WORKBENCH_SHORTCUT_CATALOG.filter((item) => item.label.toLowerCase().includes(norm));
  } else {
    const recentKeys = readWorkbenchRecents();
    const keys = recentKeys.length ? recentKeys : WORKBENCH_RECENT_DEFAULTS;
    items = keys.map(getWorkbenchShortcut).filter(Boolean);
  }
  list.innerHTML = items.map((item) => `<li>${createWorkbenchTileButton(item)}</li>`).join("");
  list.querySelectorAll(".workbench-tile-btn").forEach(bindWorkbenchTileButton);
  const emptyEl = document.getElementById("workbenchMenuEmpty");
  if (emptyEl) {
    if (norm && items.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = "未找到匹配的菜单项";
    } else if (norm && items.length > 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = `共 ${items.length} 项匹配`;
    } else {
      emptyEl.hidden = true;
      emptyEl.textContent = "未找到匹配的菜单项";
    }
  }
  if (norm) {
    list.querySelectorAll(".workbench-tile-btn").forEach((btn) => applyWorkbenchBtnHighlight(btn, query.trim()));
  }
}

function getCurrentMenuItems() {
  return [...document.querySelectorAll(".secondary-menu-item[data-target]")];
}

function normalizeToastOpts(opts) {
  if (typeof opts === "boolean") return { variant: opts ? "error" : "success" };
  if (!opts || typeof opts !== "object") return { variant: "success" };
  if (opts.error) return { variant: "error" };
  return { variant: opts.variant || "success" };
}

function applyToastVariant(el, variant) {
  el.classList.remove("is-error", "is-success", "is-warn", "is-info");
  if (variant === "error") el.classList.add("is-error");
  else if (variant === "warn") el.classList.add("is-warn");
  else if (variant === "info") el.classList.add("is-info");
  else el.classList.add("is-success");
}

function showToast(message, opts) {
  const el = document.getElementById("toast");
  if (!el) return;
  const { variant } = normalizeToastOpts(opts);
  if (!Array.isArray(showToast._queue)) showToast._queue = [];
  const sameVisible =
    el.classList.contains("is-visible") &&
    el.textContent === message &&
    [...el.classList].some((c) => c === `is-${variant}`);
  if (sameVisible) return;
  if (el.classList.contains("is-visible")) {
    const dupQueued = showToast._queue.some(
      (item) => item.message === message && item.variant === variant
    );
    if (!dupQueued) showToast._queue.push({ message, variant });
    return;
  }
  const revealNext = () => {
    const next = showToast._queue.shift();
    if (next) showToast(next.message, { variant: next.variant });
  };
  el.textContent = message;
  applyToastVariant(el, variant);
  el.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.classList.remove("is-visible");
    revealNext();
  }, 3200);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let settingsSnapshot = null;

function getSettingsFormState() {
  return {
    mfaEnabled: !!document.getElementById("setMfa")?.checked,
    approvalNotify: !!document.getElementById("setNotify")?.checked,
    policyAutoSync: !!document.getElementById("setPolicySync")?.checked,
    socialApiPlaceholder: !!document.getElementById("setSocialApi")?.checked,
    paymentApiPlaceholder: !!document.getElementById("setPaymentApi")?.checked
  };
}

function captureSettingsSnapshot() {
  settingsSnapshot = JSON.stringify(getSettingsFormState());
  updateSettingsDirtyUi();
}

function isSettingsDirty() {
  if (!settingsSnapshot) return false;
  return JSON.stringify(getSettingsFormState()) !== settingsSnapshot;
}

function updateSettingsDirtyUi() {
  const status = document.getElementById("settingsSaveStatus");
  if (!status) return;
  if (isSettingsDirty()) {
    status.textContent = "有未保存的更改";
    return;
  }
  if (status.textContent === "有未保存的更改") status.textContent = "";
}

function highlightWorkbenchText(text, query) {
  const norm = (query || "").trim();
  if (!norm) return escapeHtml(text);
  const lower = text.toLowerCase();
  const needle = norm.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + needle.length);
  const after = text.slice(idx + needle.length);
  return `${escapeHtml(before)}<mark class="wb-search-hit">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
}

function restoreWorkbenchBtnLabel(btn) {
  if (btn.dataset.labelHtml) btn.innerHTML = btn.dataset.labelHtml;
}

function applyWorkbenchBtnHighlight(btn, query) {
  const icon = btn.querySelector("i");
  const iconHtml = icon ? icon.outerHTML : "";
  const labelText = (btn.dataset.displayLabel || btn.textContent || "").trim();
  if (!query) {
    restoreWorkbenchBtnLabel(btn);
    return;
  }
  btn.innerHTML = `${iconHtml}${highlightWorkbenchText(labelText, query)}`;
}

async function withButtonLoading(btn, defaultLabel, fn, loadingLabel = "查询中…") {
  if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
  const label = defaultLabel || btn.textContent;
  btn.disabled = true;
  btn.textContent = loadingLabel;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function bindFilterEnterSubmit(container, handler) {
  const root = typeof container === "string" ? document.querySelector(container) : container;
  if (!root || typeof handler !== "function") return;
  root.querySelectorAll('input:not([type="file"]):not([type="button"]):not([type="checkbox"]), select').forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handler();
      }
    });
  });
}

function bindAllFilterToolbars() {
  document.querySelectorAll(".toolbar").forEach((toolbar) => {
    const queryBtn = toolbar.querySelector(".filter-query-btn");
    if (!queryBtn || queryBtn.dataset.enterBound === "1") return;
    queryBtn.dataset.enterBound = "1";
    bindFilterEnterSubmit(toolbar, () => queryBtn.click());
  });
}

function bindSearchFields() {
  document.querySelectorAll(".search-field, .workbench-search-field").forEach((wrap) => {
    const input = wrap.querySelector("input[type='text'], input:not([type])");
    const clearBtn = wrap.querySelector(".search-field-clear, .workbench-search-clear");
    if (!(input instanceof HTMLInputElement) || !clearBtn) return;
    const sync = () => {
      clearBtn.hidden = !input.value.trim();
    };
    if (input.dataset.searchBound === "1") return;
    input.dataset.searchBound = "1";
    input.addEventListener("input", sync);
    clearBtn.addEventListener("click", () => {
      input.value = "";
      sync();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
    sync();
  });
}

function activateModuleTab(panelId, moduleKey) {
  const panel = document.getElementById(panelId);
  const tabs = panel?.querySelector(".module-tabs[data-module-scope]");
  const btn = tabs?.querySelector(`.module-tab[data-module="${moduleKey}"]`);
  if (btn instanceof HTMLButtonElement) btn.click();
}

function updateQueryResultHint(id, count, entityName) {
  const el = typeof id === "string" ? document.getElementById(id) : id;
  if (!el) return;
  el.textContent = count ? `共 ${count} 条${entityName}` : `未找到匹配的${entityName}`;
}

function updateDemoQueryHint(btn) {
  const view = btn.closest(".module-view");
  const hint = view?.querySelector(".query-result-hint");
  if (!hint) return;
  const rowCount = view.querySelectorAll("tbody tr").length;
  if (rowCount > 0) {
    hint.textContent = `共 ${rowCount} 条记录（演示）`;
    return;
  }
  const gridItems = view.querySelectorAll(".policy-grid > div").length;
  if (gridItems > 0) {
    hint.textContent = `共 ${gridItems} 个组织节点（演示）`;
    return;
  }
  if (view.querySelector(".metric-strip")) {
    hint.textContent = "查询完成，指标已刷新（演示）";
    return;
  }
  hint.textContent = "查询完成（演示）";
}

function updateReportsQueryHint() {
  const panel = document.getElementById("reports");
  const hint = document.getElementById("reportsQueryHint");
  const activeView = panel?.querySelector(".module-view.is-active");
  if (!hint || !activeView) return;
  const rowCount = activeView.querySelectorAll("tbody tr").length;
  if (rowCount > 0) {
    hint.textContent = `共 ${rowCount} 条记录（演示）`;
    return;
  }
  if (activeView.querySelector(".metric-strip")) {
    hint.textContent = "查询完成，指标已刷新（演示）";
    return;
  }
  hint.textContent = "查询完成（演示）";
}

let confirmDialogResolver = null;
let overlayReturnFocus = null;

function captureOverlayReturnFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) overlayReturnFocus = active;
}

function restoreOverlayReturnFocus() {
  const target = overlayReturnFocus;
  overlayReturnFocus = null;
  if (target instanceof HTMLElement && document.contains(target)) {
    requestAnimationFrame(() => target.focus());
  }
}

function focusDrawerChrome(drawerEl) {
  requestAnimationFrame(() => {
    const closeBtn = drawerEl.querySelector(".drawer-head button");
    closeBtn?.focus();
  });
}

function focusDialogFirstField(dialogEl) {
  requestAnimationFrame(() => {
    const field = dialogEl.querySelector(
      ".dialog-field input:not([type=hidden]), .dialog-field select, .dialog-field textarea"
    );
    field?.focus();
  });
}

function showDemoRowDetail(tr) {
  const label = tr.cells?.[0]?.textContent?.trim() || "记录";
  showToast(`「${label}」详情（演示）`, { variant: "info" });
}

function bindInteractiveTableRows(tbodyId, rowSelector, onActivate) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest(rowSelector);
    if (!tr || e.target.closest(".tiny-btn")) return;
    e.preventDefault();
    if (typeof onActivate === "function") {
      onActivate(tr);
      return;
    }
    const actionBtn = tr.querySelector(".tiny-btn");
    if (actionBtn instanceof HTMLElement) actionBtn.focus();
  });
}

function resetConfirmDialogForm() {
  const note = document.getElementById("confirmDialogNote");
  if (note) note.value = "";
  const noteWrap = document.getElementById("confirmDialogNoteWrap");
  if (noteWrap) noteWrap.hidden = true;
}

function closeConfirmDialog(confirmed, note = "") {
  const dialog = document.getElementById("confirmDialog");
  const resolver = confirmDialogResolver;
  confirmDialogResolver = null;
  resetConfirmDialogForm();
  if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  if (resolver) resolver({ confirmed, note });
  restoreOverlayReturnFocus();
}

function openConfirmDialog(options = {}) {
  const {
    title = "确认操作",
    message = "确定继续吗？",
    confirmLabel = "确定",
    cancelLabel = "取消",
    danger = false,
    showNote = false,
    notePlaceholder = "可填写说明"
  } = options;
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirmDialog");
    if (!(dialog instanceof HTMLDialogElement)) {
      resolve({ confirmed: false, note: "" });
      return;
    }
    confirmDialogResolver = resolve;
    resetConfirmDialogForm();
    const titleEl = document.getElementById("confirmDialogTitle");
    const messageEl = document.getElementById("confirmDialogMessage");
    const confirmBtn = document.getElementById("confirmDialogConfirm");
    const cancelBtn = document.getElementById("confirmDialogCancel");
    const noteWrap = document.getElementById("confirmDialogNoteWrap");
    const noteInput = document.getElementById("confirmDialogNote");
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (confirmBtn) {
      confirmBtn.textContent = confirmLabel;
      confirmBtn.classList.toggle("danger-btn", danger);
    }
    if (cancelBtn) cancelBtn.textContent = cancelLabel;
    if (noteWrap) noteWrap.hidden = !showNote;
    if (noteInput) noteInput.placeholder = notePlaceholder;
    captureOverlayReturnFocus();
    dialog.showModal();
    (showNote && noteInput instanceof HTMLElement ? noteInput : cancelBtn)?.focus();
  });
}

function statusCell(text) {
  if (["已确认", "已签署", "在职", "已开票", "已受理", "停保成功", "合作中"].includes(text)) {
    return `<td><span class="status status-success">${text}</span></td>`;
  }
  if (["未确认", "待签署", "未开票", "已驳回", "已终止", "待续签", "已离职"].includes(text)) {
    return `<td><span class="status status-warn">${text}</span></td>`;
  }
  if (["已提交", "签署中", "待入职", "试用期", "待离职", "异动中", "筹备中"].includes(text)) {
    return `<td><span class="status status-pending">${text}</span></td>`;
  }
  return `<td>${text}</td>`;
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (authState.token) headers.Authorization = `Bearer ${authState.token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (response.status === 401) {
    logout(true);
    throw new Error("登录已过期，请重新登录");
  }
  if (!response.ok) throw new Error(data.message || `请求失败 (${response.status})`);
  return data;
}

function syncEzwbWorkbenchTabs(targetId) {
  const home = document.getElementById("ezwbTabHome");
  const bench = document.getElementById("ezwbTabWorkbench");
  if (!home || !bench) return;
  if (targetId === "dashboard") {
    home.classList.add("is-active");
    bench.classList.remove("is-active");
  } else if (targetId === "workspace") {
    home.classList.remove("is-active");
    bench.classList.add("is-active");
  }
}

function syncWorkspaceDomainChrome(targetId) {
  const chrome = document.getElementById("workspaceDomainChrome");
  if (!chrome) return;
  const show = targetId === "dashboard" || targetId === "workspace";
  chrome.hidden = !show;
  if (show) syncEzwbWorkbenchTabs(targetId);
}

function setAppAuthed(authed) {
  if (appShell) appShell.hidden = !authed;
  document.body.classList.toggle("is-authed", authed);
}

function resetContractForm() {
  ["ctTarget", "ctSeal", "ctType", "ctMaterial", "ctName", "ctIdNo", "ctEmpSt", "ctSignSt"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) el.value = "";
  });
  ["ctDone", "ctEnd"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
}

function resetEmployeeForm() {
  ["empName", "empIdNo", "empMobile", "empCity", "empSocialCity"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
  ["empProbationEnd", "empHire"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
  const gender = document.getElementById("empGender");
  if (gender instanceof HTMLSelectElement) gender.selectedIndex = 0;
  const status = document.getElementById("empStatus");
  if (status instanceof HTMLSelectElement) status.selectedIndex = 0;
  const empType = document.getElementById("empEmploymentType");
  if (empType instanceof HTMLSelectElement) empType.selectedIndex = 0;
}

function resetCompanyForm() {
  ["coName", "coCode", "coCity", "coService"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
  const status = document.getElementById("coStatus");
  if (status instanceof HTMLSelectElement) status.selectedIndex = 0;
}

function resetInvoiceForm() {
  ["invNo", "invCustomer", "invAmount"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
  const month = document.getElementById("invMonth");
  if (month instanceof HTMLInputElement) month.value = "";
  const status = document.getElementById("invStatus");
  if (status instanceof HTMLSelectElement) status.selectedIndex = 0;
}

function resetProjectForm() {
  ["projName", "projCode", "projClient", "projManager"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
  ["projStart", "projEnd"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
  const status = document.getElementById("projStatus");
  if (status instanceof HTMLSelectElement) status.selectedIndex = 0;
}

const DRAWER_RESET_MAP = {
  contractDrawer: resetContractForm,
  employeeFormDrawer: resetEmployeeForm,
  companyDrawer: resetCompanyForm,
  invoiceDrawer: resetInvoiceForm,
  projectDrawer: resetProjectForm
};

function focusDrawerFirstField(drawerEl) {
  requestAnimationFrame(() => {
    const field = drawerEl.querySelector(
      ".drawer-form-body input:not([type=hidden]), .drawer-form-body select, .drawer-form-body textarea"
    );
    field?.focus();
  });
}

function getDrawerElements() {
  return [
    "employeeDrawer",
    "employeeFormDrawer",
    "contractDrawer",
    "companyDrawer",
    "invoiceDrawer",
    "projectDrawer"
  ]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function closeAllDrawers({ restoreFocus = true } = {}) {
  getDrawerElements().forEach((el) => {
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
  });
  document.getElementById("drawerMask")?.classList.remove("is-open");
  if (restoreFocus) restoreOverlayReturnFocus();
}

function openDrawer(drawerId, { reset = false } = {}) {
  const el = document.getElementById(drawerId);
  if (!el) return;
  closeAllDrawers({ restoreFocus: false });
  captureOverlayReturnFocus();
  clearDrawerFieldErrors(drawerId);
  if (reset && DRAWER_RESET_MAP[drawerId]) DRAWER_RESET_MAP[drawerId]();
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
  document.getElementById("drawerMask")?.classList.add("is-open");
  if (el.querySelector(".drawer-form-body")) focusDrawerFirstField(el);
  else focusDrawerChrome(el);
}

function closeDrawer(drawerId, { reset = false } = {}) {
  if (reset && DRAWER_RESET_MAP[drawerId]) DRAWER_RESET_MAP[drawerId]();
  const el = document.getElementById(drawerId);
  el?.classList.remove("is-open");
  el?.setAttribute("aria-hidden", "true");
  const anyOpen = getDrawerElements().some((drawer) => drawer.classList.contains("is-open"));
  if (!anyOpen) {
    document.getElementById("drawerMask")?.classList.remove("is-open");
    restoreOverlayReturnFocus();
  }
}

function syncTableEmptyState(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const shell = tbody.closest(".table-shell");
  if (!shell) return;
  shell.classList.toggle("is-empty", tbody.children.length === 0);
}

function clearDrawerFieldErrors(drawerId) {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;
  drawer.querySelectorAll(".drawer-field.is-invalid").forEach((field) => {
    field.classList.remove("is-invalid");
    field.querySelector(".field-hint")?.remove();
  });
}

function clearDialogFieldErrors(dialogId) {
  const dialog = document.getElementById(dialogId);
  if (!dialog) return;
  dialog.querySelectorAll(".dialog-field.is-invalid").forEach((field) => {
    field.classList.remove("is-invalid");
    field.querySelector(".field-hint")?.remove();
  });
}

function markFieldInvalid(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!(field instanceof HTMLElement)) return;
  const label = field.closest(".drawer-field, .dialog-field");
  if (!label) return;
  label.classList.add("is-invalid");
  let hint = label.querySelector(".field-hint");
  if (!hint) {
    hint = document.createElement("span");
    hint.className = "field-hint";
    hint.setAttribute("role", "alert");
    label.appendChild(hint);
  }
  hint.textContent = message;
  field.focus();
}

function bindDrawerEnterSubmit(drawerId, submitBtnId) {
  const drawer = document.getElementById(drawerId);
  const submitBtn = document.getElementById(submitBtnId);
  if (!drawer || !submitBtn) return;
  drawer.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const target = e.target;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
    e.preventDefault();
    submitBtn.click();
  });
}

function syncTopbarUser(user) {
  if (!topbarUser) return;
  if (!user) {
    topbarUser.hidden = true;
    return;
  }
  const roleLabel = user.role === "admin" ? "客户管理员" : "企业用户";
  const initial = (user.username || roleLabel).charAt(0).toUpperCase();
  topbarUserAvatar.textContent = initial;
  topbarUserName.textContent = user.username || "—";
  topbarUserRole.textContent = roleLabel;
  topbarUser.hidden = false;
}

function getSectionTitleForPanel(targetId) {
  const topKey = panelToTop[targetId] || "workspace";
  const cfg = topNavConfig[topKey];
  if (!cfg) return "";
  const section = cfg.sections.find((sec) => sec.items.includes(targetId));
  return section?.title || "";
}

function syncModuleHeaderActions(tabs) {
  const panel = tabs.closest("section.panel");
  const activeKey = tabs.querySelector(".module-tab.is-active")?.dataset.module;
  panel?.querySelectorAll(".module-page-header__actions[data-show-on-module]").forEach((actions) => {
    const allowed = (actions.dataset.showOnModule || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    actions.hidden = !allowed.includes(activeKey);
  });
}

function syncActiveModuleTabHeader(tabs) {
  const panel = tabs.closest("section.panel");
  const activeTab = tabs.querySelector(".module-tab.is-active");
  const headerText = panel?.querySelector("[data-module-header-text]");
  if (!headerText || !activeTab || !panel) return;
  const section = getSectionTitleForPanel(panel.id);
  const tabTitle = activeTab.textContent.trim();
  headerText.hidden = false;
  const sectionHtml =
    section && section !== tabTitle ? `<p class="module-page-section">${section}</p>` : "";
  headerText.innerHTML = `${sectionHtml}<p class="module-page-title">${tabTitle}</p>`;
  if (panel.classList.contains("is-active") && pageTitle) {
    pageTitle.textContent = tabTitle;
  }
}

function purgeSensitiveInlineDom() {
  document.querySelectorAll(".table-shell[data-demo-static] tbody, tbody[data-demo-table]").forEach((tb) => {
    tb.innerHTML = "";
    const shell = tb.closest(".table-shell");
    shell?.classList.add("is-empty");
  });
  const drawerBody = document.querySelector("#employeeDrawer .drawer-body");
  if (drawerBody) {
    drawerBody.innerHTML = '<p class="muted drawer-empty-hint">选择员工后加载详情</p>';
  }
}

function detachAdminPanels() {
  const container = document.querySelector(".route-panels");
  if (!container) return;
  [...container.querySelectorAll("section.panel")].forEach((panel) => {
    if (ENTERPRISE_PANEL_IDS.has(panel.id)) return;
    if (detachedAdminPanels.some((item) => item.id === panel.id)) return;
    detachedAdminPanels.push({ id: panel.id, node: panel });
    panel.remove();
  });
  purgeSensitiveInlineDom();
}

function restoreAdminPanels() {
  const container = document.querySelector(".route-panels");
  if (!container || !detachedAdminPanels.length) return;
  detachedAdminPanels
    .sort((a, b) => Number(a.node.dataset.panelOrder) - Number(b.node.dataset.panelOrder))
    .forEach(({ node }) => container.appendChild(node));
  detachedAdminPanels.length = 0;
  panels.length = 0;
  panels.push(...document.querySelectorAll(".route-panels > section.panel"));
}

function applyDomRoleSecurity(role) {
  if (role === "admin") {
    restoreAdminPanels();
    renderStaticTables();
    return;
  }
  detachAdminPanels();
}

function normNavLabel(text) {
  return String(text || "").replace(/\s/g, "");
}

function syncModulePageHeaders(targetId) {
  const panel = document.getElementById(targetId);
  if (panel?.classList.contains("panel-title-in-chrome")) {
    panel.querySelectorAll("[data-module-header-text]").forEach((el) => {
      el.innerHTML = "";
      el.hidden = true;
    });
    return;
  }
  const tabs = panel?.querySelector(".module-tabs[data-module-scope]");
  if (tabs) {
    syncActiveModuleTabHeader(tabs);
    syncModuleHeaderActions(tabs);
    return;
  }
  const title = panelTitleMap[targetId] || "";
  const section = getSectionTitleForPanel(targetId);
  document.querySelectorAll(`#${targetId} [data-module-header-text]`).forEach((el) => {
    if (!title) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const sectionHtml =
      section && section !== title ? `<p class="module-page-section">${section}</p>` : "";
    el.innerHTML = `${sectionHtml}<p class="module-page-title">${title}</p>`;
  });
}

function updatePageChrome(targetId) {
  const activeLabel = panelTitleMap[targetId] || "运营概览";
  const topKey = panelToTop[targetId] || "workspace";
  const topLabel = topNavLabelMap[topKey] || "工作台";
  const sectionLabel = getSectionTitleForPanel(targetId);
  const breadcrumbSection = document.getElementById("breadcrumbSection");
  const breadcrumbSectionWrap = document.getElementById("breadcrumbSectionWrap");
  const breadcrumbMidSep = document.getElementById("breadcrumbMidSep");
  const breadcrumbTitleSep = document.getElementById("breadcrumbTitleSep");
  const isChromeOnly = document.getElementById(targetId)?.classList.contains("panel-title-in-chrome");
  if (pageTitle) pageTitle.textContent = activeLabel;
  if (breadcrumbTop) breadcrumbTop.textContent = topLabel;
  if (breadcrumbSection && breadcrumbMidSep && breadcrumbSectionWrap) {
    const showSection =
      !isChromeOnly &&
      !!sectionLabel &&
      normNavLabel(sectionLabel) !== normNavLabel(activeLabel) &&
      normNavLabel(sectionLabel) !== normNavLabel(topLabel);
    breadcrumbSectionWrap.hidden = !showSection;
    breadcrumbMidSep.hidden = !showSection;
    if (showSection) breadcrumbSection.textContent = sectionLabel;
  }
  if (breadcrumbTitleSep) {
    const hideTitleSep =
      isChromeOnly || (breadcrumbSectionWrap?.hidden !== false && normNavLabel(topLabel) === normNavLabel(activeLabel));
    breadcrumbTitleSep.hidden = hideTitleSep;
  }
  syncModulePageHeaders(targetId);
}

function syncBizTopNav(targetId) {
  const resolved = panelToTop[targetId] || "workspace";
  currentTopKey = resolved;
  document.querySelectorAll(".biz-top-item[data-top-nav-target]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.topNavTarget === resolved);
  });
}

function renderSecondaryMenu(role, activeTarget) {
  if (!secondaryMenu) return;
  const cfg = topNavConfig[currentTopKey] || topNavConfig.workspace;
  const html = cfg.sections
    .map((sec) => {
      const items = sec.items
        .filter((target) => (panelRoleMap[target] || ["admin", "enterprise"]).includes(role))
        .map((target) => {
          const label = panelTitleMap[target] || target;
          const icon = PANEL_MENU_ICONS[target] || "fa-regular fa-circle";
          return `<button type="button" class="secondary-menu-item ${target === activeTarget ? "is-active" : ""}" data-target="${target}" title="${label}"><i class="${icon} secondary-menu-icon" aria-hidden="true"></i><span class="secondary-menu-label">${label}</span></button>`;
        })
        .join("");
      return `<div class="menu-section"><div class="menu-section-title">${sec.title}</div>${items}</div>`;
    })
    .join("");
  secondaryMenu.innerHTML = html;
  secondaryMenu.querySelectorAll(".secondary-menu-item[data-target]").forEach((item) => {
    item.addEventListener("click", () => activate(item.dataset.target));
  });
}

async function activate(targetId, options = {}) {
  const activePanel = panels.find((panel) => panel.classList.contains("is-active"));
  if (!options.force && activePanel?.id === "settings" && targetId !== "settings" && isSettingsDirty()) {
    const { confirmed } = await openConfirmDialog({
      title: "未保存的更改",
      message: "设置有未保存的更改，确定离开当前页面吗？",
      confirmLabel: "离开",
      cancelLabel: "留在此页"
    });
    if (!confirmed) return;
  }
  getCurrentMenuItems().forEach((item) => item.classList.toggle("is-active", item.dataset.target === targetId));
  panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === targetId));
  updatePageChrome(targetId);
  syncWorkspaceDomainChrome(targetId);
  syncBizTopNav(targetId);
  renderSecondaryMenu(authState.user?.role || "admin", targetId);
  const recentKey = PANEL_TO_SHORTCUT_KEY[targetId];
  if (recentKey) pushWorkbenchRecent(recentKey);
  if (targetId === "staffing-admin" && typeof window.loadStaffingAdminList === "function") {
    window.loadStaffingAdminList();
  }
  if (targetId === "enterprise-home" && typeof window.loadEnterpriseRequirements === "function") {
    window.loadEnterpriseRequirements();
  }
  if (targetId === "dashboard") renderDashboardWorkCalendar();
  document.getElementById("mainContent")?.focus({ preventScroll: true });
}

function applyRoleVisibility(role) {
  document.querySelectorAll(".biz-top-item[data-top-nav-target]").forEach((btn) => {
    const key = btn.dataset.topNavTarget;
    const allowed = topNavRoleMap[key] || ["admin"];
    btn.style.display = allowed.includes(role) ? "" : "none";
  });
  if (role === "enterprise") {
    currentTopKey = "enterprise";
    activate("enterprise-home");
  } else {
    const cfg = topNavConfig[currentTopKey] || topNavConfig.workspace;
    let firstVisibleTarget = cfg.sections.flatMap((s) => s.items).find((target) => (panelRoleMap[target] || []).includes(role));
    if (!firstVisibleTarget) {
      currentTopKey = "workspace";
      firstVisibleTarget = "dashboard";
    }
    if (firstVisibleTarget) activate(firstVisibleTarget);
  }
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = role === "admin" ? "" : "none";
  });
  applyDomRoleSecurity(role);
  if (typeof window.refreshStaffingPanels === "function") window.refreshStaffingPanels();
}

function syncDemoTableEmptyState(tbody) {
  const shell = tbody.closest(".table-shell");
  if (shell) shell.classList.toggle("is-empty", tbody.children.length === 0);
}

function renderStaticTables() {
  if (authState.user?.role !== "admin") return;
  Object.entries(staticRows).forEach(([key, rows]) => {
    const tbody = document.getElementById(`${key}Rows`) || document.querySelector(`tbody[data-demo-table="${key}"]`);
    if (!tbody) return;
    tbody.innerHTML = rows.map((r) => `<tr>${r.map((c) => statusCell(c)).join("")}</tr>`).join("");
    syncDemoTableEmptyState(tbody);
    if (tbody.id) syncTableEmptyState(tbody.id);
  });
  enhanceStaticDemoRows();
}

const DYNAMIC_TABLE_BODY_IDS = new Set([
  "employeeRows",
  "companyRows",
  "projectRows",
  "contractRows",
  "invoiceRows",
  "approvalRows",
  "workspaceRows",
  "importRows",
  "auditRows"
]);

function enhanceStaticDemoRows() {
  document.querySelectorAll(".module-view .table-scroll-wrap tbody tr, .table-shell[data-demo-static] tbody tr").forEach((tr) => {
    const tbodyId = tr.closest("tbody")?.id || "";
    if (DYNAMIC_TABLE_BODY_IDS.has(tbodyId)) return;
    if (
      tr.hasAttribute("data-emp-row") ||
      tr.hasAttribute("data-appr-row") ||
      tr.hasAttribute("data-ws-row") ||
      tr.hasAttribute("data-proj-row") ||
      tr.hasAttribute("data-co-row") ||
      tr.hasAttribute("data-ct-row") ||
      tr.hasAttribute("data-inv-row")
    ) {
      return;
    }
    const label = tr.cells?.[0]?.textContent?.trim() || "记录";
    tr.setAttribute("tabindex", "0");
    tr.setAttribute("data-demo-row", "1");
    tr.setAttribute("aria-label", `演示记录 ${label}`);
  });
}

function renderWorkspaceTable() {
  const tbody = document.getElementById("workspaceRows");
  const pageInfo = document.getElementById("workspacePageInfo");
  const prevBtn = document.getElementById("workspacePrev");
  const nextBtn = document.getElementById("workspaceNext");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = workspaceState.rows
    .map(
      (r) => `
      <tr tabindex="0" data-ws-row="${r.id}" aria-label="工单 ${r.seq}，${escapeHtml(r.name)}，${r.status}">
        <td>${r.seq}</td>
        <td>${r.name}</td>
        <td>${r.idNo}</td>
        <td>${r.city}</td>
        ${statusCell(r.status)}
        <td>${r.service}</td>
        <td>
          ${r.remark || "-"}
          ${
            isAdmin
              ? `<span class="row-actions">
            <button type="button" class="tiny-btn" data-action="submit" data-id="${r.id}">提交</button>
            <button type="button" class="tiny-btn" data-action="confirm" data-id="${r.id}">确认</button>
            <button type="button" class="tiny-btn" data-action="accept" data-id="${r.id}">受理</button>
          </span>`
              : ""
          }
        </td>
      </tr>
    `
    )
    .join("");
  const totalPages = Math.max(1, Math.ceil(workspaceState.total / workspaceState.pageSize));
  pageInfo.textContent = `${workspaceState.page} / ${totalPages}`;
  prevBtn.disabled = workspaceState.page <= 1;
  nextBtn.disabled = workspaceState.page >= totalPages;
  syncTableEmptyState("workspaceRows");
  updateQueryResultHint("workspaceQueryHint", workspaceState.total, "工单");
}

async function loadWorkspace() {
  const keyword = document.getElementById("workspaceKeyword")?.value.trim() || "";
  const status = document.getElementById("workspaceStatus")?.value || "";
  const service = document.getElementById("workspaceService")?.value || "";
  const query = new URLSearchParams({
    keyword,
    status,
    service,
    page: String(workspaceState.page),
    pageSize: String(workspaceState.pageSize)
  });
  const data = await apiRequest(`/api/workspace?${query.toString()}`);
  if (data.rows.length === 0 && data.page > 1) {
    workspaceState.page = data.page - 1;
    return loadWorkspace();
  }
  workspaceState.page = data.page;
  workspaceState.rows = data.rows;
  workspaceState.total = data.total;
  renderWorkspaceTable();
}

function renderEmployeeTable() {
  const tbody = document.getElementById("employeeRows");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = employeeRowsCache
    .map((r) => {
      const transitions = STATUS_TRANSITIONS[r.status] || [];
      const canConfirm = r.status === "试用期" && transitions.includes("在职");
      const canOnboard = r.status === "待入职" && transitions.includes("试用期");
      const canChange = transitions.includes("异动中");
      const canOffboard = transitions.includes("待离职");
      const transitionHint = transitions.length ? `可流转到：${transitions.join(" / ")}` : "当前状态不可流转";
      const actions = isAdmin
        ? `<td><span class="row-actions">
            ${canOnboard ? `<button type="button" class="tiny-btn" data-life="onboard" data-id="${r.id}">入职手续</button>` : ""}
            ${canConfirm ? `<button type="button" class="tiny-btn" data-life="confirm" data-id="${r.id}">转正申请</button>` : ""}
            ${canChange ? `<button type="button" class="tiny-btn" data-life="change" data-id="${r.id}">异动申请</button>` : ""}
            ${canOffboard ? `<button type="button" class="tiny-btn" data-life="offboard" data-id="${r.id}">离职申请</button>` : ""}
            <button type="button" class="tiny-btn danger-text" data-del-emp="${r.id}">删除</button>
          </span><div class="muted" style="margin-top:4px;font-size:11px;">${transitionHint}</div></td>`
        : "";
      return `<tr data-emp-row="${r.id}" tabindex="0" role="button" aria-label="查看员工 ${escapeHtml(r.name)}">
        <td>${r.name}</td><td>${r.idNo}</td><td>${r.mobile || "-"}</td><td>${r.gender || "-"}</td>
        ${statusCell(r.status)}<td>${r.employmentType || "-"}</td><td>${r.hireDate || "-"}</td><td>${r.city || "-"}</td><td>${r.socialCity || "-"}</td>
        ${isAdmin ? actions : ""}
      </tr>`;
    })
    .join("");
  syncTableEmptyState("employeeRows");
  updateQueryResultHint("employeeQueryHint", employeeRowsCache.length, "员工记录");
}

function renderProjectTable(rows) {
  const tbody = document.getElementById("projectRows");
  if (!tbody) return;
  tbody.innerHTML = rows
    .map(
      (r) => `<tr tabindex="0" data-proj-row="${r.id}" aria-label="查看项目 ${escapeHtml(r.name)}">
        <td>${r.name}</td>
        <td>${r.code}</td>
        <td>${r.clientCompany || "-"}</td>
        <td>${r.manager || "-"}</td>
        ${statusCell(r.status)}
        <td>${r.startDate || "-"} ~ ${r.endDate || "-"}</td>
        <td>${r.teamSize || 0}</td>
      </tr>`
    )
    .join("");
  syncTableEmptyState("projectRows");
  updateQueryResultHint("projectQueryHint", rows.length, "项目");
}

function filterProjects() {
  let rows = projectRowsCache;
  const q = document.getElementById("projectKeyword")?.value.trim().toLowerCase() || "";
  const st = document.getElementById("projectStatusFilter")?.value || "";
  if (q) {
    rows = rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.manager || "").toLowerCase().includes(q) ||
        (r.clientCompany || "").toLowerCase().includes(q)
    );
  }
  if (st) rows = rows.filter((r) => r.status === st);
  renderProjectTable(rows);
}

async function loadProjects() {
  if (authState.user?.role !== "admin") return;
  const data = await apiRequest("/api/projects");
  projectRowsCache = data.rows || [];
  filterProjects();
}

async function loadEmployees() {
  const q = document.getElementById("employeeKeyword")?.value.trim() || "";
  const st = document.getElementById("employeeStatusFilter")?.value || "";
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (st) qs.set("status", st);
  const data = await apiRequest(`/api/employees?${qs.toString()}`);
  employeeRowsCache = data.rows;
  renderEmployeeTable();
}

function renderCompanyTable(rows) {
  const tbody = document.getElementById("companyRows");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = rows
    .map((r) => {
      const del = isAdmin
        ? `<td><button type="button" class="tiny-btn danger-text" data-del-co="${r.id}">删除</button></td>`
        : "";
      return `<tr tabindex="0" data-co-row="${r.id}" aria-label="查看企业 ${escapeHtml(r.name)}"><td>${r.name}</td><td>${r.code}</td><td>${r.city || "-"}</td><td>${r.serviceType || "-"}</td>${statusCell(
        r.status
      )}${isAdmin ? del : ""}</tr>`;
    })
    .join("");
  syncTableEmptyState("companyRows");
  updateQueryResultHint("companyQueryHint", rows.length, "企业");
}

let companyRowsCache = [];

function filterCompanies() {
  let rows = companyRowsCache;
  const q = document.getElementById("companyKeyword")?.value.trim().toLowerCase() || "";
  const st = document.getElementById("companyStatusFilter")?.value || "";
  if (q) {
    rows = rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.city || "").toLowerCase().includes(q)
    );
  }
  if (st) rows = rows.filter((r) => r.status === st);
  renderCompanyTable(rows);
}

async function loadCompanies() {
  const data = await apiRequest("/api/companies");
  companyRowsCache = data.rows || [];
  companySelectCache = companyRowsCache;
  filterCompanies();
}

function renderApprovalTable(rows) {
  const tbody = document.getElementById("approvalRows");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = rows
    .map((r) => {
      const ops = isAdmin
        ? `<td><span class="row-actions">
          <button type="button" class="tiny-btn" data-appr="confirm" data-id="${r.id}">确认</button>
          <button type="button" class="tiny-btn" data-appr="accept" data-id="${r.id}">受理</button>
          <button type="button" class="tiny-btn" data-appr="reject" data-id="${r.id}">驳回</button>
        </span></td>`
        : "";
      return `<tr tabindex="0" data-appr-row="${r.id}" aria-label="审批单 ${r.no}，${r.type}，${r.applicant}，${r.status}"><td>${r.no}</td><td>${r.type}</td><td>${r.applicant}</td><td>${r.submittedAt}</td>${statusCell(
        r.status
      )}<td>${r.handler}</td>${isAdmin ? ops : ""}</tr>`;
    })
    .join("");
  syncTableEmptyState("approvalRows");
  updateQueryResultHint("approvalQueryHint", rows.length, "审批单");
}

let approvalRowsCache = [];

function filterApprovals() {
  let rows = approvalRowsCache;
  const tp = document.getElementById("approvalTypeFilter")?.value || "";
  const st = document.getElementById("approvalStatusFilter")?.value || "";
  if (tp) rows = rows.filter((r) => r.type === tp);
  if (st) rows = rows.filter((r) => r.status === st);
  renderApprovalTable(rows);
}

async function loadApprovals() {
  if (authState.user?.role !== "admin") return;
  const data = await apiRequest("/api/approvals");
  approvalRowsCache = data.rows || [];
  filterApprovals();
}

function renderInvoiceTable(rows) {
  const tbody = document.getElementById("invoiceRows");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = rows
    .map((r) => {
      const del = isAdmin ? `<td><button type="button" class="tiny-btn danger-text" data-del-inv="${r.id}">删除</button></td>` : "";
      return `<tr tabindex="0" data-inv-row="${r.id}" aria-label="发票 ${r.no}，${escapeHtml(r.customerName)}"><td>${r.no}</td><td>${r.customerName}</td><td>${r.amount}</td><td>${r.month}</td>${statusCell(
        r.status
      )}<td>${r.action}</td>${isAdmin ? del : ""}</tr>`;
    })
    .join("");
  syncTableEmptyState("invoiceRows");
  updateQueryResultHint("invoiceQueryHint", rows.length, "发票记录");
}

async function loadInvoices() {
  const data = await apiRequest("/api/invoices");
  let rows = data.rows;
  const m = document.getElementById("invFilterMonth")?.value || "";
  const st = document.getElementById("invFilterStatus")?.value || "";
  if (m) rows = rows.filter((r) => r.month === m);
  if (st) rows = rows.filter((r) => r.status === st);
  invoiceRowsCache = rows;
  renderInvoiceTable(rows);
}

let contractRowsCache = [];

function renderContractTable(rows) {
  const tbody = document.getElementById("contractRows");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = rows
    .map((r) => {
      const del = isAdmin ? `<td><button type="button" class="tiny-btn danger-text" data-del-ct="${r.id}">删除</button></td>` : "";
      return `<tr tabindex="0" data-ct-row="${r.id}" aria-label="合同 ${escapeHtml(r.name)}，${r.type}"><td>${r.target}</td><td>${r.type}</td><td>${r.material}</td><td>${r.name}</td><td>${r.idNo}</td><td>${r.employmentStatus}</td>${statusCell(
        r.signStatus
      )}<td>${r.doneTime}</td><td>${r.contractEnd || "-"}</td>${isAdmin ? del : ""}</tr>`;
    })
    .join("");
  syncTableEmptyState("contractRows");
  updateQueryResultHint("contractQueryHint", rows.length, "合同记录");
}

function filterContracts() {
  let rows = contractRowsCache;
  const q = document.getElementById("contractKeyword")?.value.trim().toLowerCase() || "";
  const st = document.getElementById("contractStatusFilter")?.value || "";
  if (q) {
    rows = rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.idNo || "").toLowerCase().includes(q) ||
        (r.material || "").toLowerCase().includes(q)
    );
  }
  if (st) rows = rows.filter((r) => r.signStatus === st);
  renderContractTable(rows);
}

async function loadContracts() {
  const data = await apiRequest("/api/contracts");
  contractRowsCache = data.rows || [];
  filterContracts();
}

async function loadDashboard() {
  try {
    const d = await apiRequest("/api/dashboard");
    const el = (id) => document.getElementById(id);
    if (el("dashWorkspaceTotal")) el("dashWorkspaceTotal").textContent = d.workspace.total;
    if (el("dashApprovalPending")) el("dashApprovalPending").textContent = d.approvalsPending;
    if (el("dashActiveEmp")) el("dashActiveEmp").textContent = d.employees.active;
    if (el("dashInvIssued")) el("dashInvIssued").textContent = d.invoices.issued;
    if (el("dashProbation")) el("dashProbation").textContent = d.employees.probation;
    if (el("dashPendingOffboard")) el("dashPendingOffboard").textContent = d.employees.pendingOffboard;
    if (el("dashFullTime")) el("dashFullTime").textContent = d.employees.fullTime;
    if (el("dashFlexible")) el("dashFlexible").textContent = d.employees.flexible;
    if (el("dashExpiringContract")) el("dashExpiringContract").textContent = d.contractExpiring30;
    if (el("dashApprovalPending2")) el("dashApprovalPending2").textContent = d.approvalsPending;
  } catch {
    /* ignore */
  }
  initDashboardWorkCalendar();
}

// --- 首页「工作日历」#dashboard：动态公历、月份导航、单选日期、控制台 YYYY-MM-DD（无第三方库）---
const dashboardCalendarState = {
  viewYear: null,
  viewMonth: null,
  selectedDate: null
};

const DASHBOARD_CALENDAR_DEMO_EVENTS = [
  { date: "2026-04-21", title: "部门周会 · 项目复盘" },
  { date: "2026-04-23", title: "薪资发放批次校验" },
  { date: "2026-04-24", title: "招聘终面日程" },
  { date: "2026-04-25", title: "合同续签节点" },
  { date: "2026-05-06", title: "社保基数窗口提醒" },
  { date: "2026-03-18", title: "上月考勤封账" }
];

let dashboardCalendarEventsBound = false;

function dashboardCalendarDateKey(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dashboardCalendarIsSameDay(a, b) {
  if (!a || !b) return false;
  return dashboardCalendarDateKey(a) === dashboardCalendarDateKey(b);
}

/** 构建 6×7 单元格：周一为首列，含上月/下月补位日期（公历，自动处理闰年等） */
function dashboardCalendarBuildCells(viewYear, viewMonth) {
  const first = new Date(viewYear, viewMonth, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const cells = [];
  let py = viewYear;
  let pm = viewMonth - 1;
  if (pm < 0) {
    pm = 11;
    py -= 1;
  }
  for (let i = 0; i < mondayIndex; i++) {
    const dayNum = prevMonthDays - mondayIndex + 1 + i;
    cells.push({ date: new Date(py, pm, dayNum, 12, 0, 0, 0), inViewMonth: false, label: dayNum });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewYear, viewMonth, d, 12, 0, 0, 0), inViewMonth: true, label: d });
  }
  let nDay = 1;
  let ny = viewYear;
  let nm = viewMonth + 1;
  if (nm > 11) {
    nm = 0;
    ny += 1;
  }
  while (cells.length < 42) {
    cells.push({ date: new Date(ny, nm, nDay, 12, 0, 0, 0), inViewMonth: false, label: nDay });
    nDay += 1;
  }
  return cells;
}

function dashboardCalendarEscapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderDashboardCalendarAgenda(viewYear, viewMonth) {
  const agenda = document.getElementById("dashboardCalendarAgenda");
  if (!agenda) return;
  const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const items = DASHBOARD_CALENDAR_DEMO_EVENTS.filter((e) => e.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) {
    agenda.innerHTML = '<div class="muted">当前月份暂无示例日程（后续可对接接口按 YYYY-MM 拉取）</div>';
    return;
  }
  agenda.innerHTML = items
    .map((e) => {
      const parts = e.date.split("-");
      const mm = parts[1];
      const dd = parts[2];
      return `<div><strong>${mm}/${dd}</strong> ${dashboardCalendarEscapeHtml(e.title)}</div>`;
    })
    .join("");
}

function renderDashboardWorkCalendar() {
  const titleEl = document.getElementById("dashboardCalendarTitle");
  const gridEl = document.getElementById("dashboardCalendarGrid");
  if (!titleEl || !gridEl) return;
  if (dashboardCalendarState.viewYear === null || dashboardCalendarState.viewMonth === null) {
    const n = new Date();
    dashboardCalendarState.viewYear = n.getFullYear();
    dashboardCalendarState.viewMonth = n.getMonth();
  }
  const vy = dashboardCalendarState.viewYear;
  const vm = dashboardCalendarState.viewMonth;
  titleEl.textContent = `${vy} 年 ${vm + 1} 月`;

  const cells = dashboardCalendarBuildCells(vy, vm);
  const now = new Date();
  const todayNorm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const sel = dashboardCalendarState.selectedDate
    ? new Date(
        dashboardCalendarState.selectedDate.getFullYear(),
        dashboardCalendarState.selectedDate.getMonth(),
        dashboardCalendarState.selectedDate.getDate(),
        12,
        0,
        0,
        0
      )
    : null;
  gridEl.innerHTML = cells
    .map((cell) => {
      const key = dashboardCalendarDateKey(cell.date);
      const muted = !cell.inViewMonth;
      const isToday = dashboardCalendarIsSameDay(cell.date, todayNorm);
      const isSel = sel && dashboardCalendarIsSameDay(cell.date, sel);
      const cls = ["calendar-day"];
      if (muted) cls.push("is-muted");
      if (isToday) cls.push("is-today");
      return `<button type="button" class="${cls.join(" ")}" data-iso-date="${key}" aria-label="${key}" aria-pressed="${isSel ? "true" : "false"}">${cell.label}</button>`;
    })
    .join("");

  renderDashboardCalendarAgenda(vy, vm);
}

function bindDashboardWorkCalendarOnce() {
  if (dashboardCalendarEventsBound) return;
  /** 委托绑在卡片根节点：不依赖接口、不依赖 #dashboardCalendarGrid 是否已 innerHTML，刷新即可点击 */
  const root = document.querySelector(".dashboard-calendar-card");
  if (!root || !document.getElementById("dashboardCalendarGrid")) return;
  dashboardCalendarEventsBound = true;

  root.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.closest("#dashboardCalPrev")) {
      if (dashboardCalendarState.viewYear === null || dashboardCalendarState.viewMonth === null) return;
      let y = dashboardCalendarState.viewYear;
      let m = dashboardCalendarState.viewMonth - 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      dashboardCalendarState.viewYear = y;
      dashboardCalendarState.viewMonth = m;
      renderDashboardWorkCalendar();
      return;
    }
    if (t.closest("#dashboardCalNext")) {
      if (dashboardCalendarState.viewYear === null || dashboardCalendarState.viewMonth === null) return;
      let y = dashboardCalendarState.viewYear;
      let m = dashboardCalendarState.viewMonth + 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      dashboardCalendarState.viewYear = y;
      dashboardCalendarState.viewMonth = m;
      renderDashboardWorkCalendar();
      return;
    }
    if (t.closest("#dashboardCalToday")) {
      const n = new Date();
      dashboardCalendarState.viewYear = n.getFullYear();
      dashboardCalendarState.viewMonth = n.getMonth();
      dashboardCalendarState.selectedDate = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
      console.log("[工作日历] 选中日期:", dashboardCalendarDateKey(dashboardCalendarState.selectedDate));
      renderDashboardWorkCalendar();
      return;
    }

    const btn = t.closest("button.calendar-day[data-iso-date]");
    if (!btn || !root.contains(btn)) return;
    const iso = btn.dataset.isoDate;
    if (!iso) return;
    const parts = iso.split("-").map(Number);
    const y = parts[0];
    const mo = parts[1] - 1;
    const day = parts[2];
    dashboardCalendarState.selectedDate = new Date(y, mo, day, 12, 0, 0, 0);
    if (btn.classList.contains("is-muted")) {
      dashboardCalendarState.viewYear = y;
      dashboardCalendarState.viewMonth = mo;
    }
    console.log("[工作日历] 选中日期:", iso);
    renderDashboardWorkCalendar();
  });
}

/** 首次进入首页时初始化视图月份；重复调用仅重绘 */
function initDashboardWorkCalendar() {
  if (!document.getElementById("dashboardCalendarGrid")) return;
  const n = new Date();
  if (dashboardCalendarState.viewYear === null || dashboardCalendarState.viewMonth === null) {
    dashboardCalendarState.viewYear = n.getFullYear();
    dashboardCalendarState.viewMonth = n.getMonth();
    dashboardCalendarState.selectedDate = null;
  }
  bindDashboardWorkCalendarOnce();
  renderDashboardWorkCalendar();
}

async function loadReports() {
  if (authState.user?.role !== "admin") return;
  try {
    const r = await apiRequest("/api/reports/summary");
    document.getElementById("repEmpStructure").textContent = `在职约 ${r.employeeStructure.onJobPct}% / 离职约 ${r.employeeStructure.leftPct}%`;
    document.getElementById("repHireCycle").textContent = `平均到岗周期（演示） ${r.hireCycleDays} 天`;
    document.getElementById("repSocialMom").textContent = `本月环比（演示） +${r.socialCostMom}%`;
  } catch {
    /* ignore */
  }
}

async function loadSettingsUi() {
  if (authState.user?.role !== "admin") return;
  const s = await apiRequest("/api/settings");
  document.getElementById("setMfa").checked = !!s.mfa_enabled;
  document.getElementById("setNotify").checked = !!s.approval_notify;
  document.getElementById("setPolicySync").checked = !!s.policy_auto_sync;
  const socialApi = document.getElementById("setSocialApi");
  const paymentApi = document.getElementById("setPaymentApi");
  if (socialApi) socialApi.checked = !!s.social_api_placeholder;
  if (paymentApi) paymentApi.checked = !!s.payment_api_placeholder;
  captureSettingsSnapshot();
}

async function loadAudit() {
  if (authState.user?.role !== "admin") return;
  const data = await apiRequest("/api/audit-logs");
  const tbody = document.getElementById("auditRows");
  if (!tbody) return;
  tbody.innerHTML = data.rows
    .map(
      (r) =>
        `<tr tabindex="0" data-audit-row="${r.id}" aria-label="审计记录 ${r.action}，${r.username || "未知用户"}"><td>${r.createdAt}</td><td>${r.username || "-"}</td><td>${r.action}</td><td>${r.detail || "-"}</td></tr>`
    )
    .join("");
  syncTableEmptyState("auditRows");
}

async function loadAllData() {
  setPageLoading(true);
  try {
    const role = authState.user?.role;
    if (role === "enterprise") {
      if (typeof window.loadEnterpriseRequirements === "function") {
        await window.loadEnterpriseRequirements();
      }
      return;
    }
    await loadWorkspace();
    await loadProjects();
    await loadEmployees();
    await loadCompanies();
    await loadContracts();
    await loadInvoices();
    await loadDashboard();
    if (authState.user?.role === "admin") {
      await loadApprovals();
      await loadReports();
      await loadSettingsUi();
      await loadAudit();
    }
    renderStaticTables();
  } finally {
    setPageLoading(false);
  }
}

function setPageLoading(loading) {
  const skeleton = document.getElementById("panelSkeleton");
  const panels = document.querySelector(".content-area.route-panels");
  if (skeleton) {
    skeleton.hidden = !loading;
    skeleton.setAttribute("aria-hidden", loading ? "false" : "true");
  }
  panels?.classList.toggle("is-page-loading", loading);
}

function resetTaskDialogForm() {
  ["taskName", "taskOwner"].forEach((id) => {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement) el.value = "";
  });
  const due = document.getElementById("taskDue");
  if (due instanceof HTMLInputElement) due.value = "";
  const city = document.getElementById("taskCity");
  if (city instanceof HTMLSelectElement) city.selectedIndex = 0;
}

function openTaskDialog() {
  resetTaskDialogForm();
  clearDialogFieldErrors("taskDialog");
  const dialog = document.getElementById("taskDialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  captureOverlayReturnFocus();
  dialog.showModal();
  focusDialogFirstField(dialog);
}

function closeTaskDialog(reset = true) {
  const dialog = document.getElementById("taskDialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.close();
  if (reset) {
    resetTaskDialogForm();
    clearDialogFieldErrors("taskDialog");
  }
  restoreOverlayReturnFocus();
}

function getTopOverlayLayer() {
  if (getDrawerElements().some((el) => el.classList.contains("is-open"))) return "drawer";
  const taskDialog = document.getElementById("taskDialog");
  if (taskDialog instanceof HTMLDialogElement && taskDialog.open) return "taskDialog";
  const calculator = document.getElementById("calculatorDialog");
  if (calculator instanceof HTMLDialogElement && calculator.open) return "calculatorDialog";
  const confirmDialogEl = document.getElementById("confirmDialog");
  if (confirmDialogEl instanceof HTMLDialogElement && confirmDialogEl.open) return "confirmDialog";
  const openDialog = document.querySelector("dialog[open]");
  if (openDialog instanceof HTMLDialogElement) return "dialog";
  return null;
}

function dismissTopOverlay() {
  const layer = getTopOverlayLayer();
  if (layer === "drawer") {
    closeAllDrawers();
    return true;
  }
  if (layer === "taskDialog") {
    closeTaskDialog(true);
    return true;
  }
  if (layer === "calculatorDialog") {
    document.getElementById("calculatorDialog")?.close();
    restoreOverlayReturnFocus();
    return true;
  }
  if (layer === "confirmDialog") {
    closeConfirmDialog(false);
    return true;
  }
  if (layer === "dialog") {
    const openDialog = document.querySelector("dialog[open]");
    if (openDialog instanceof HTMLDialogElement) {
      openDialog.close();
      restoreOverlayReturnFocus();
      return true;
    }
  }
  return false;
}

function showCalculatorDialog() {
  const dialog = document.getElementById("calculatorDialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  captureOverlayReturnFocus();
  dialog.showModal();
  focusDialogFirstField(dialog);
}

function exportCsv(filename, headers, rows) {
  const csvRows = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","));
  const blob = new Blob(["\ufeff" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setupEvents() {
  function syncSidebarAria() {
    const collapsed = document.body.classList.contains("sidebar-collapsed");
    sidebarToggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const label = collapsed ? "展开左侧菜单" : "收起左侧菜单";
    sidebarToggle?.setAttribute("title", label);
    sidebarToggle?.setAttribute("aria-label", label);
  }
  if (localStorage.getItem("hr_sidebar_collapsed") === "1") {
    document.body.classList.add("sidebar-collapsed");
  }
  syncSidebarAria();
  sidebarToggle?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("hr_sidebar_collapsed", document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
    syncSidebarAria();
  });

  roleSwitcher?.addEventListener("change", () => {
    const want = roleSwitcher.value;
    const actual = authState.user?.role;
    if (want !== actual) {
      showToast("切换视角请使用对应角色重新登录", true);
      roleSwitcher.value = actual;
    }
  });

  document.querySelectorAll(".quick-btn").forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.jump)));
  document.querySelectorAll(".tiny-btn[data-jump]").forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.jump)));
  document.querySelectorAll(".biz-top-item[data-top-nav-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTopKey = btn.dataset.topNavTarget;
      const role = authState.user?.role || "admin";
      const cfg = topNavConfig[currentTopKey] || topNavConfig.workspace;
      let firstVisibleTarget = cfg.sections.flatMap((s) => s.items).find((target) => (panelRoleMap[target] || []).includes(role));
      if (!firstVisibleTarget) {
        currentTopKey = "workspace";
        firstVisibleTarget = "dashboard";
      }
      if (firstVisibleTarget) activate(firstVisibleTarget);
    });
  });

  // Module tabs: document-level delegation (panels may restore after login).
  if (!document.documentElement.dataset.moduleTabBound) {
    document.documentElement.dataset.moduleTabBound = "1";
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".module-tab[data-module]");
      if (!btn) return;
      const tabs = btn.closest(".module-tabs[data-module-scope]");
      if (!tabs) return;
      const scope = tabs.dataset.moduleScope;
      const target = btn.dataset.module;
      tabs.querySelectorAll(".module-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
      const root = tabs.closest("article");
      if (!root) return;
      root.querySelectorAll(".module-view").forEach((view) => {
        view.classList.toggle("is-active", view.dataset.moduleView === target);
      });
      syncActiveModuleTabHeader(tabs);
      syncModuleHeaderActions(tabs);
      if (scope === "reports") {
        const hint = document.getElementById("reportsQueryHint");
        if (hint) hint.textContent = "";
      }
      enhanceStaticDemoRows();
    });
  }

  const calculator = document.getElementById("calculatorDialog");
  document.getElementById("openCalculator")?.addEventListener("click", showCalculatorDialog);
  document.getElementById("calculatorDialogClose")?.addEventListener("click", () => {
    calculator?.close();
    restoreOverlayReturnFocus();
  });
  document.getElementById("calculatorDialogConfirm")?.addEventListener("click", () => {
    calculator?.close();
    restoreOverlayReturnFocus();
    showToast("测算完成（演示）");
  });
  calculator?.addEventListener("close", () => restoreOverlayReturnFocus());

  const confirmDialog = document.getElementById("confirmDialog");
  document.getElementById("confirmDialogCancel")?.addEventListener("click", () => closeConfirmDialog(false));
  document.getElementById("confirmDialogConfirm")?.addEventListener("click", () => {
    const noteWrap = document.getElementById("confirmDialogNoteWrap");
    const note =
      noteWrap?.hidden || !(document.getElementById("confirmDialogNote") instanceof HTMLTextAreaElement)
        ? ""
        : document.getElementById("confirmDialogNote").value.trim();
    closeConfirmDialog(true, note);
  });
  confirmDialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeConfirmDialog(false);
  });
  confirmDialog?.addEventListener("close", () => {
    if (!confirmDialogResolver) return;
    const resolver = confirmDialogResolver;
    confirmDialogResolver = null;
    resetConfirmDialogForm();
    restoreOverlayReturnFocus();
    resolver({ confirmed: false, note: "" });
  });

  bindInteractiveTableRows("workspaceRows", "tr[data-ws-row]");
  bindInteractiveTableRows("approvalRows", "tr[data-appr-row]");
  bindInteractiveTableRows("companyRows", "tr[data-co-row]");
  bindInteractiveTableRows("contractRows", "tr[data-ct-row]");
  bindInteractiveTableRows("invoiceRows", "tr[data-inv-row]");
  bindInteractiveTableRows("auditRows", "tr[data-audit-row]", (tr) => {
    const action = tr.cells?.[2]?.textContent?.trim() || "操作";
    showToast(`审计记录：${action}（演示）`, { variant: "info" });
  });
  bindInteractiveTableRows("projectRows", "tr[data-proj-row]", (tr) => {
    const name = tr.querySelector("td")?.textContent?.trim() || "项目";
    showToast(`项目「${name}」详情（演示）`, { variant: "info" });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest("tr[data-demo-row]");
    if (!tr || e.target.closest(".tiny-btn")) return;
    e.preventDefault();
    showDemoRowDetail(tr);
  });
  document.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-demo-row]");
    if (!tr || e.target.closest(".tiny-btn")) return;
    showDemoRowDetail(tr);
  });

  renderWorkbenchTiles("");

  function syncWorkbenchSearchClearBtn() {
    const input = document.getElementById("workbenchMenuSearch");
    const clearBtn = document.getElementById("workbenchMenuSearchClear");
    if (!input || !clearBtn) return;
    clearBtn.hidden = !input.value.trim();
  }

  function filterWorkbenchMenu(query) {
    renderWorkbenchTiles(query || "");
    syncWorkbenchSearchClearBtn();
  }
  document.getElementById("workbenchMenuSearch")?.addEventListener("input", (e) => {
    filterWorkbenchMenu(e.target.value);
    syncWorkbenchSearchClearBtn();
  });
  document.getElementById("workbenchMenuSearchBtn")?.addEventListener("click", () => {
    filterWorkbenchMenu(document.getElementById("workbenchMenuSearch")?.value);
  });
  document.getElementById("workbenchMenuSearchClear")?.addEventListener("click", () => {
    const input = document.getElementById("workbenchMenuSearch");
    if (!(input instanceof HTMLInputElement)) return;
    input.value = "";
    filterWorkbenchMenu("");
    input.focus();
  });
  document.getElementById("workbenchMenuSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      filterWorkbenchMenu(e.target.value);
      return;
    }
    if (e.key === "Escape" && e.target.value) {
      e.preventDefault();
      e.target.value = "";
      filterWorkbenchMenu("");
    }
  });

  document.getElementById("ezwbTabHome")?.addEventListener("click", () => activate("dashboard"));
  document.getElementById("ezwbTabWorkbench")?.addEventListener("click", () => activate("workspace"));

  document.getElementById("retireQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("retireQuery"), "查询", () => {
      const tbody = document.getElementById("retireRows");
      const count = tbody ? tbody.querySelectorAll("tr").length : 0;
      updateQueryResultHint("retireQueryHint", count, "退休办理记录");
    })
  );
  document.getElementById("openTaskDialog")?.addEventListener("click", openTaskDialog);
  document.getElementById("retireAddFromEmpty")?.addEventListener("click", openTaskDialog);
  document.getElementById("taskDialogCancel")?.addEventListener("click", () => closeTaskDialog(true));
  document.getElementById("taskDialog")?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeTaskDialog(true);
  });
  document.getElementById("taskDialogForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("taskName")?.value.trim();
    if (!name) {
      markFieldInvalid("taskName", "请填写任务名称");
      showToast("请填写任务名称", true);
      return;
    }
    clearDialogFieldErrors("taskDialog");
    closeTaskDialog(false);
    showToast("退休办理任务已创建（演示）");
    resetTaskDialogForm();
  });
  document.querySelectorAll("#taskDialog .dialog-field input, #taskDialog .dialog-field select").forEach((el) => {
    const clearInvalid = () => {
      const field = el.closest(".dialog-field");
      field?.classList.remove("is-invalid");
      field?.querySelector(".field-hint")?.remove();
    };
    el.addEventListener("input", clearInvalid);
    el.addEventListener("change", clearInvalid);
  });

  const uploadInput = document.getElementById("salaryUpload");
  const validateBtn = document.getElementById("validateUpload");
  const uploadResult = document.getElementById("uploadResult");
  uploadInput?.addEventListener("change", () => {
    const file = uploadInput.files?.[0];
    if (!file) {
      uploadResult.innerHTML = '<span class="muted">尚未选择文件</span>';
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      uploadResult.innerHTML = '<span class="status status-warn">文件格式不正确，仅支持 xlsx/xls/csv</span>';
      uploadInput.value = "";
      return;
    }
    uploadResult.innerHTML = `<span class="muted">已选择：<strong>${escapeHtml(file.name)}</strong>（${formatFileSize(file.size)}），点击「上传并校验」继续</span>`;
  });
  validateBtn?.addEventListener("click", async () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) {
      uploadResult.innerHTML = '<span class="status status-warn">请先选择上传文件</span>';
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      uploadResult.innerHTML = '<span class="status status-warn">文件格式不正确，仅支持 xlsx/xls/csv</span>';
      return;
    }
    await withButtonLoading(validateBtn, "上传并校验", async () => {
      await new Promise((resolve) => setTimeout(resolve, 420));
      uploadResult.innerHTML = `<span class="status status-success">校验通过：${escapeHtml(file.name)}（演示模式，已加载预览数据）</span>`;
      renderStaticTables();
    }, "校验中…");
  });
  document.getElementById("salaryTemplateDownload")?.addEventListener("click", () => {
    showToast("模板下载已开始（演示）", { variant: "info" });
  });

  const employeeDrawer = document.getElementById("employeeDrawer");
  document.getElementById("drawerMask")?.addEventListener("click", closeAllDrawers);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    dismissTopOverlay();
  });


  document.getElementById("openDetailDrawer")?.addEventListener("click", async () => {
    const first = employeeRowsCache[0];
    if (first) {
      await fillDrawer(first);
      openDrawer("employeeDrawer");
    }
  });
  document.getElementById("closeDrawer")?.addEventListener("click", () => closeDrawer("employeeDrawer"));
  document.getElementById("openContractDrawer")?.addEventListener("click", () => openDrawer("contractDrawer", { reset: true }));
  document.getElementById("closeContractDrawer")?.addEventListener("click", () => closeDrawer("contractDrawer", { reset: true }));
  document.getElementById("contractDrawerCancel")?.addEventListener("click", () => closeDrawer("contractDrawer", { reset: true }));
  document.getElementById("openEmployeeDrawer")?.addEventListener("click", () => openDrawer("employeeFormDrawer", { reset: true }));
  document.getElementById("closeEmployeeFormDrawer")?.addEventListener("click", () => closeDrawer("employeeFormDrawer", { reset: true }));
  document.getElementById("employeeDrawerCancel")?.addEventListener("click", () => closeDrawer("employeeFormDrawer", { reset: true }));
  document.getElementById("openCompanyDrawer")?.addEventListener("click", () => openDrawer("companyDrawer", { reset: true }));
  document.getElementById("closeCompanyDrawer")?.addEventListener("click", () => closeDrawer("companyDrawer", { reset: true }));
  document.getElementById("companyDrawerCancel")?.addEventListener("click", () => closeDrawer("companyDrawer", { reset: true }));
  document.getElementById("openInvoiceDrawer")?.addEventListener("click", () => openDrawer("invoiceDrawer", { reset: true }));
  document.getElementById("closeInvoiceDrawer")?.addEventListener("click", () => closeDrawer("invoiceDrawer", { reset: true }));
  document.getElementById("invoiceDrawerCancel")?.addEventListener("click", () => closeDrawer("invoiceDrawer", { reset: true }));
  document.getElementById("openProjectDrawer")?.addEventListener("click", () => openDrawer("projectDrawer", { reset: true }));
  document.getElementById("closeProjectDrawer")?.addEventListener("click", () => closeDrawer("projectDrawer", { reset: true }));
  document.getElementById("projectDrawerCancel")?.addEventListener("click", () => closeDrawer("projectDrawer", { reset: true }));

  bindDrawerEnterSubmit("companyDrawer", "companyAdd");
  bindDrawerEnterSubmit("invoiceDrawer", "invoiceAdd");
  bindDrawerEnterSubmit("employeeFormDrawer", "employeeAdd");
  bindDrawerEnterSubmit("contractDrawer", "contractAdd");
  bindDrawerEnterSubmit("projectDrawer", "projectAdd");

  document.querySelectorAll(".drawer-form-body .drawer-field input, .drawer-form-body .drawer-field select").forEach((el) => {
    const clearInvalid = () => {
      const field = el.closest(".drawer-field");
      field?.classList.remove("is-invalid");
      field?.querySelector(".field-hint")?.remove();
    };
    el.addEventListener("input", clearInvalid);
    el.addEventListener("change", clearInvalid);
  });

  document.getElementById("companyAddFromEmpty")?.addEventListener("click", () => openDrawer("companyDrawer", { reset: true }));
  document.getElementById("invoiceAddFromEmpty")?.addEventListener("click", () => openDrawer("invoiceDrawer", { reset: true }));
  document.getElementById("contractAddFromEmpty")?.addEventListener("click", () => openDrawer("contractDrawer", { reset: true }));
  document.getElementById("projectAddFromEmpty")?.addEventListener("click", () => openDrawer("projectDrawer", { reset: true }));

  employeeDrawer?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !drawerEmployeeId) return;
    if (authState.user?.role !== "admin") return;
    const refreshDrawer = async () => {
      await loadEmployees();
      await loadProjects();
      await loadCompanies();
      const row = employeeRowsCache.find((x) => String(x.id) === String(drawerEmployeeId));
      if (row) await fillDrawer(row);
    };
    try {
      if (t.id === "drawerBtnJoin") {
        const pid = document.getElementById("drawerJoinProject")?.value;
        if (!pid) return showToast("请选择进场项目", true);
        await apiRequest(`/api/employees/${drawerEmployeeId}/project-request`, {
          method: "POST",
          body: JSON.stringify({ action: "join", projectId: Number(pid), effectiveDate: new Date().toISOString().slice(0, 10) })
        });
        showToast("已提交进场审批");
        await loadApprovals();
        await refreshDrawer();
        return;
      }
      if (t.id === "drawerBtnLeave") {
        const pid = document.getElementById("drawerLeaveProject")?.value;
        if (!pid) return showToast("请选择退场项目", true);
        await apiRequest(`/api/employees/${drawerEmployeeId}/project-request`, {
          method: "POST",
          body: JSON.stringify({ action: "leave", projectId: Number(pid), effectiveDate: new Date().toISOString().slice(0, 10) })
        });
        showToast("已提交退场审批");
        await loadApprovals();
        await refreshDrawer();
        return;
      }
      if (t.id === "drawerBtnCompany") {
        const cid = document.getElementById("drawerCompanySelect")?.value;
        if (!cid) return showToast("请选择签约企业", true);
        await apiRequest(`/api/employees/${drawerEmployeeId}/company-request`, {
          method: "POST",
          body: JSON.stringify({ companyId: Number(cid), effectiveDate: new Date().toISOString().slice(0, 10) })
        });
        showToast("已提交签约企业变更审批");
        await loadApprovals();
        await refreshDrawer();
      }
    } catch (err) {
      showToast(err.message || "操作失败", true);
    }
  });

  async function openEmployeeRowDrawer(rowId) {
    const row = employeeRowsCache.find((x) => String(x.id) === String(rowId));
    if (!row) return;
    await fillDrawer(row);
    openDrawer("employeeDrawer");
  }

  document.getElementById("employeeRows")?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest("tr[data-emp-row]");
    if (!tr || e.target.closest(".tiny-btn")) return;
    e.preventDefault();
    await openEmployeeRowDrawer(tr.getAttribute("data-emp-row"));
  });

  document.getElementById("employeeRows")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const life = t.dataset.life;
    if (life) {
      const employeeId = Number(t.dataset.id);
      const map = {
        onboard: { requestType: "入职手续", targetStatus: "试用期" },
        confirm: { requestType: "转正", targetStatus: "在职" },
        change: { requestType: "人事异动", targetStatus: "异动中" },
        offboard: { requestType: "离职申请", targetStatus: "待离职" }
      };
      const cfg = map[life];
      if (cfg) {
        const { confirmed, note } = await openConfirmDialog({
          title: `提交${cfg.requestType}`,
          message: `确认为该员工提交「${cfg.requestType}」审批申请？`,
          confirmLabel: "提交审批",
          showNote: true,
          notePlaceholder: "请输入审批备注（可选）"
        });
        if (!confirmed) return;
        try {
          await apiRequest(`/api/employees/${employeeId}/lifecycle-request`, {
            method: "POST",
            body: JSON.stringify({ ...cfg, note, effectiveDate: new Date().toISOString().slice(0, 10) })
          });
          showToast("已提交审批，请在审批中心处理");
          await loadApprovals();
        } catch (err) {
          showToast(err.message || "提交失败", true);
        }
      }
      return;
    }
    const id = t.dataset.delEmp;
    if (id) {
      const { confirmed } = await openConfirmDialog({
        title: "删除员工",
        message: "确定删除该员工？此操作不可撤销。",
        confirmLabel: "删除",
        danger: true
      });
      if (!confirmed) return;
      try {
        await apiRequest(`/api/employees/${id}`, { method: "DELETE" });
        showToast("已删除");
        await loadEmployees();
        await loadDashboard();
      } catch (err) {
        showToast(err.message || "删除失败", true);
      }
      return;
    }
    const tr = t.closest("tr[data-emp-row]");
    if (tr && !t.closest(".tiny-btn")) {
      await openEmployeeRowDrawer(tr.getAttribute("data-emp-row"));
    }
  });

  document.getElementById("employeeQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("employeeQuery"), "查询", () => loadEmployees())
  );
  document.getElementById("projectQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("projectQuery"), "查询", () => filterProjects())
  );
  document.getElementById("companyQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("companyQuery"), "查询", () => filterCompanies())
  );
  document.getElementById("contractQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("contractQuery"), "查询", () => filterContracts())
  );
  document.getElementById("approvalQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("approvalQuery"), "查询", () => filterApprovals())
  );
  document.getElementById("employeeExport")?.addEventListener("click", () => {
    const h = ["姓名", "证件号", "手机", "性别", "状态", "用工类型", "入职日", "工作地", "社保城市"];
    const rows = employeeRowsCache.map((r) => [
      r.name,
      r.idNo,
      r.mobile,
      r.gender,
      r.status,
      r.employmentType || "-",
      r.hireDate,
      r.city,
      r.socialCity
    ]);
    exportCsv("员工名册.csv", h, rows);
    showToast("已导出当前列表");
  });
  document.getElementById("employeeAddFromEmpty")?.addEventListener("click", () => {
    openDrawer("employeeFormDrawer", { reset: true });
  });

  document.getElementById("employeeAdd")?.addEventListener("click", async () => {
    const body = {
      name: document.getElementById("empName").value.trim(),
      idNo: document.getElementById("empIdNo").value.trim(),
      mobile: document.getElementById("empMobile").value.trim(),
      gender: document.getElementById("empGender").value,
      status: document.getElementById("empStatus").value,
      employmentType: document.getElementById("empEmploymentType").value,
      probationEnd: document.getElementById("empProbationEnd").value,
      hireDate: document.getElementById("empHire").value,
      city: document.getElementById("empCity").value.trim(),
      socialCity: document.getElementById("empSocialCity").value.trim()
    };
    if (!body.name) {
      markFieldInvalid("empName", "请填写员工姓名");
      showToast("请填写员工姓名", true);
      return;
    }
    try {
      await apiRequest("/api/employees", { method: "POST", body: JSON.stringify(body) });
      showToast("员工已新增");
      resetEmployeeForm();
      closeDrawer("employeeFormDrawer");
      await loadEmployees();
      await loadDashboard();
    } catch (err) {
      showToast(err.message || "新增失败", true);
    }
  });

  document.getElementById("companyRows")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.dataset.delCo) return;
    const { confirmed } = await openConfirmDialog({
      title: "删除企业",
      message: "确定删除该企业？此操作不可撤销。",
      confirmLabel: "删除",
      danger: true
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/api/companies/${t.dataset.delCo}`, { method: "DELETE" });
      showToast("企业已删除");
      await loadCompanies();
    } catch (err) {
      showToast(err.message || "删除失败", true);
    }
  });
  document.getElementById("companyAdd")?.addEventListener("click", async () => {
    const body = {
      name: document.getElementById("coName").value.trim(),
      code: document.getElementById("coCode").value.trim(),
      city: document.getElementById("coCity").value.trim(),
      serviceType: document.getElementById("coService").value.trim(),
      status: document.getElementById("coStatus").value
    };
    if (!body.name) {
      markFieldInvalid("coName", "请填写企业名称");
      showToast("请填写企业名称", true);
      return;
    }
    try {
      await apiRequest("/api/companies", { method: "POST", body: JSON.stringify(body) });
      showToast("企业已新增");
      resetCompanyForm();
      closeDrawer("companyDrawer");
      await loadCompanies();
    } catch (err) {
      showToast(err.message || "新增失败", true);
    }
  });

  document.getElementById("approvalRows")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.dataset.appr) return;
    const id = t.dataset.id;
    const map = { confirm: "已确认", accept: "已受理", reject: "已驳回" };
    await apiRequest(`/api/approvals/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: map[t.dataset.appr] })
    });
    showToast("审批已更新");
    await loadApprovals();
    await loadDashboard();
    await loadAudit();
  });

  document.getElementById("contractRows")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.dataset.delCt) return;
    const { confirmed } = await openConfirmDialog({
      title: "删除合同记录",
      message: "确定删除该合同记录？此操作不可撤销。",
      confirmLabel: "删除",
      danger: true
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/api/contracts/${t.dataset.delCt}`, { method: "DELETE" });
      showToast("已删除");
      await loadContracts();
    } catch (err) {
      showToast(err.message || "删除失败", true);
    }
  });
  document.getElementById("contractAdd")?.addEventListener("click", async () => {
    const entity = document.getElementById("ctTarget").value.trim();
    const seal = document.getElementById("ctSeal").value.trim();
    const target = [entity, seal].filter(Boolean).join(" · ") || entity || seal;
    const body = {
      target,
      type: document.getElementById("ctType").value.trim(),
      material: document.getElementById("ctMaterial").value.trim(),
      name: document.getElementById("ctName").value.trim(),
      idNo: document.getElementById("ctIdNo").value.trim(),
      employmentStatus: document.getElementById("ctEmpSt").value.trim(),
      signStatus: document.getElementById("ctSignSt").value.trim(),
      doneTime: document.getElementById("ctDone").value.trim(),
      contractEnd: document.getElementById("ctEnd").value.trim()
    };
    if (!body.name) {
      markFieldInvalid("ctName", "请填写员工姓名");
      showToast("请填写员工姓名", true);
      return;
    }
    try {
      await apiRequest("/api/contracts", { method: "POST", body: JSON.stringify(body) });
      showToast("合同记录已新增");
      resetContractForm();
      closeDrawer("contractDrawer");
      await loadContracts();
    } catch (err) {
      showToast(err.message || "新增失败", true);
    }
  });

  document.getElementById("invoiceRows")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.dataset.delInv) return;
    const { confirmed } = await openConfirmDialog({
      title: "删除发票记录",
      message: "确定删除该发票记录？此操作不可撤销。",
      confirmLabel: "删除",
      danger: true
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/api/invoices/${t.dataset.delInv}`, { method: "DELETE" });
      showToast("已删除");
      await loadInvoices();
      await loadDashboard();
    } catch (err) {
      showToast(err.message || "删除失败", true);
    }
  });
  document.getElementById("invoiceAdd")?.addEventListener("click", async () => {
    const body = {
      no: document.getElementById("invNo").value.trim(),
      customerName: document.getElementById("invCustomer").value.trim(),
      amount: document.getElementById("invAmount").value.trim(),
      month: document.getElementById("invMonth").value || "2026-04",
      status: document.getElementById("invStatus").value,
      action: document.getElementById("invStatus").value === "已开票" ? "下载" : "-"
    };
    if (!body.customerName) {
      markFieldInvalid("invCustomer", "请填写客户名称");
      showToast("请填写客户名称", true);
      return;
    }
    try {
      await apiRequest("/api/invoices", { method: "POST", body: JSON.stringify(body) });
      showToast("发票已新增");
      resetInvoiceForm();
      closeDrawer("invoiceDrawer");
      await loadInvoices();
      await loadDashboard();
    } catch (err) {
      showToast(err.message || "新增失败", true);
    }
  });
  document.getElementById("invoiceQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("invoiceQuery"), "查询", () => loadInvoices())
  );
  document.getElementById("invoiceExport")?.addEventListener("click", () => {
    const h = ["发票编号", "客户", "金额", "月份", "状态", "下载"];
    const rows = invoiceRowsCache.map((r) => [r.no, r.customerName, r.amount, r.month, r.status, r.action]);
    exportCsv("发票列表.csv", h, rows);
    showToast("已导出当前筛选结果");
  });

  ["setMfa", "setNotify", "setPolicySync", "setSocialApi", "setPaymentApi"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", updateSettingsDirtyUi);
  });

  document.getElementById("settingsSave")?.addEventListener("click", async () => {
    const btn = document.getElementById("settingsSave");
    const status = document.getElementById("settingsSaveStatus");
    const body = {
      mfaEnabled: document.getElementById("setMfa").checked,
      approvalNotify: document.getElementById("setNotify").checked,
      policyAutoSync: document.getElementById("setPolicySync").checked,
      socialApiPlaceholder: document.getElementById("setSocialApi")?.checked,
      paymentApiPlaceholder: document.getElementById("setPaymentApi")?.checked
    };
    const btnLabel = btn?.textContent || "保存设置";
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "保存中…";
    }
    if (status) status.textContent = "";
    try {
      await apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(body) });
      captureSettingsSnapshot();
      showToast("设置已保存");
      if (status) status.textContent = "已保存";
      await loadAudit();
    } catch (err) {
      showToast(err.message || "保存失败", true);
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = btnLabel;
      }
    }
  });

  document.getElementById("workspaceRows")?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.action) return;
    if (authState.user?.role !== "admin") return;
    const id = Number(target.dataset.id);
    const map = { submit: "已提交", confirm: "已确认", accept: "已受理" };
    await apiRequest(`/api/workspace/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: map[target.dataset.action] })
    });
    showToast("工单状态已更新");
    await loadWorkspace();
    await loadDashboard();
    await loadAudit();
  });

  document.getElementById("projectAdd")?.addEventListener("click", async () => {
    const body = {
      name: document.getElementById("projName").value.trim(),
      code: document.getElementById("projCode").value.trim(),
      clientCompany: document.getElementById("projClient").value.trim(),
      manager: document.getElementById("projManager").value.trim(),
      status: document.getElementById("projStatus").value,
      startDate: document.getElementById("projStart").value,
      endDate: document.getElementById("projEnd").value
    };
    if (!body.name) {
      markFieldInvalid("projName", "请填写项目名称");
      showToast("请填写项目名称", true);
      return;
    }
    try {
      await apiRequest("/api/projects", { method: "POST", body: JSON.stringify(body) });
      showToast("项目已新增");
      resetProjectForm();
      closeDrawer("projectDrawer");
      await loadProjects();
    } catch (err) {
      showToast(err.message || "新增失败", true);
    }
  });

  const runWorkspaceQuery = async () => {
    workspaceState.page = 1;
    await withButtonLoading(document.getElementById("queryWorkspace"), "查询", () => loadWorkspace());
  };
  document.getElementById("queryWorkspace")?.addEventListener("click", runWorkspaceQuery);
  document.getElementById("workspacePageSize")?.addEventListener("change", async (event) => {
    workspaceState.pageSize = Number(event.target.value) || 10;
    workspaceState.page = 1;
    await loadWorkspace();
  });
  document.getElementById("workspacePrev")?.addEventListener("click", async () => {
    workspaceState.page = Math.max(1, workspaceState.page - 1);
    await loadWorkspace();
  });
  document.getElementById("workspaceNext")?.addEventListener("click", async () => {
    workspaceState.page += 1;
    await loadWorkspace();
  });
  document.getElementById("exportWorkspace")?.addEventListener("click", () => {
    const headers = ["序号", "姓名", "证件号码", "城市", "提交状态", "服务类型", "备注"];
    const data = workspaceState.rows.map((r) => [r.seq, r.name, r.idNo, r.city, r.status, r.service, r.remark || ""]);
    exportCsv("工作台当前页.csv", headers, data);
    showToast("已导出当前页数据");
  });

  const cityPolicyMap = {
    上海市: { category: ["人员类别：单位自有员工", "人员类别：派遣外包员工"], base: "最低7310 / 最高36549", fund: "上海公积金（企业7%，个人7%）", extra: "补充2%", date: "2026-04-18" },
    重庆市: { category: ["人员类别：派遣外包员工、单位自有员工"], base: "最低4218 / 最高21090", fund: "重庆公积金（企业7%，个人7%）", extra: "0%", date: "2026-04-18" },
    深圳市: { category: ["人员类别：深户", "人员类别：非深户"], base: "最低2520 / 最高37926", fund: "深圳公积金（企业5%，个人5%）", extra: "补充1%", date: "2026-04-15" },
    广州市: { category: ["人员类别：派遣外包员工", "人员类别：自有员工"], base: "最低2300 / 最高38082", fund: "广州公积金（企业5%，个人5%）", extra: "0%", date: "2026-04-10" }
  };
  const updatePolicyByCity = (city) => {
    const data = cityPolicyMap[city];
    if (!data) return;
    document.getElementById("policyCategory").innerHTML = data.category.map((c) => `<option>${c}</option>`).join("");
    document.getElementById("policyBase").textContent = data.base;
    document.getElementById("policyFund").textContent = data.fund;
    document.getElementById("policyExtra").textContent = data.extra;
    document.getElementById("policyDate").textContent = data.date;
  };
  const policyCity = document.getElementById("policyCity");
  if (policyCity) {
    updatePolicyByCity(policyCity.value);
    policyCity.addEventListener("change", () => updatePolicyByCity(policyCity.value));
  }
  document.getElementById("policyQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("policyQuery"), "查询", () => {
      const city = document.getElementById("policyCity")?.value || "上海市";
      updatePolicyByCity(city);
      const hint = document.getElementById("policyQueryHint");
      if (hint) hint.textContent = `已加载 ${city} 政策指标（演示）`;
      showToast("政策指标已刷新", { variant: "info" });
    })
  );
  document.getElementById("contactSupportBtn")?.addEventListener("click", () => {
    showToast("客服功能演示中，请通过企业管理员联系支持", { variant: "info" });
  });

  const socialCity = document.getElementById("socialCity");
  if (socialCity) {
    const syncSocial = () => {
      const city = socialCity.value;
      const m = cityPolicyMap[city] || cityPolicyMap.上海市;
      const parts = m.base.split(" / ");
      const low = (parts[0] || "").replace("最低", "");
      const high = (parts[1] || "").replace("最高", "");
      document.getElementById("socialOldAge").textContent = `最低基数 ${low} / 最高基数 ${high}`;
      document.getElementById("socialMedical").textContent = `最低基数 ${low} / 最高基数 ${high}`;
      document.getElementById("socialFund").textContent = m.fund.replace(/上海|重庆|深圳|广州/, "");
    };
    socialCity.addEventListener("change", syncSocial);
    syncSocial();
  }

  document.querySelectorAll(".filter-query-btn[data-demo-query]").forEach((btn) => {
    btn.addEventListener("click", () => {
      withButtonLoading(btn, "查询", async () => {
        updateDemoQueryHint(btn);
        showToast("查询完成（演示）", { variant: "info" });
      });
    });
  });
  document.getElementById("reportsExportDemo")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (btn instanceof HTMLButtonElement) {
      withButtonLoading(btn, "导出报表", async () => {
        showToast("报表导出任务已创建（演示）");
      });
    }
  });
  document.getElementById("reportsQuery")?.addEventListener("click", () =>
    withButtonLoading(document.getElementById("reportsQuery"), "查询", () => {
      updateReportsQueryHint();
      showToast("查询完成（演示）", { variant: "info" });
    })
  );
  document.getElementById("salarySlipBatchSend")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (btn instanceof HTMLButtonElement) {
      withButtonLoading(btn, "批量发放", async () => {
        showToast("工资条批量发放任务已提交（演示）");
      });
    }
  });
  bindAllFilterToolbars();
  bindSearchFields();
  document.querySelectorAll(".table-shell table tbody").forEach((tbody) => {
    const shell = tbody.closest(".table-shell");
    if (!shell) return;
    if (tbody.id) syncTableEmptyState(tbody.id);
    else shell.classList.toggle("is-empty", tbody.children.length === 0);
  });
}

async function fillDrawer(r) {
  if (authState.user?.role !== "admin") return;
  drawerEmployeeId = r.id;
  const body = document.querySelector("#employeeDrawer .drawer-body");
  if (!body) return;
  body.innerHTML = '<p class="muted drawer-empty-hint">加载中…</p>';
  if (authState.user?.role === "admin") {
    if (!projectRowsCache.length) {
      try {
        await loadProjects();
      } catch {
        /* ignore */
      }
    }
    if (!companySelectCache.length) {
      try {
        const d = await apiRequest("/api/companies");
        companySelectCache = d.rows || [];
      } catch {
        companySelectCache = [];
      }
    }
  }
  let ph = { rows: [] };
  let ch = { rows: [] };
  if (authState.user?.role === "admin") {
    try {
      ph = await apiRequest(`/api/employees/${r.id}/project-history`);
    } catch {
      ph = { rows: [] };
    }
    try {
      ch = await apiRequest(`/api/employees/${r.id}/company-history`);
    } catch {
      ch = { rows: [] };
    }
  }
  const st =
    r.status === "在职"
      ? '<span class="status status-success">在职</span>'
      : r.status === "已离职"
        ? '<span class="status status-warn">已离职</span>'
        : `<span class="status status-pending">${r.status || "-"}</span>`;
  const projectOpts =
    projectRowsCache.map((p) => `<option value="${p.id}">${p.code} · ${p.name}</option>`).join("") || '<option value="">暂无项目</option>';
  const activeLeave = (ph.rows || []).filter((x) => x.status !== "已退出" && !x.endDate);
  const leaveOpts =
    activeLeave.length > 0
      ? activeLeave.map((x) => `<option value="${x.projectId}">${x.projectCode} · ${x.projectName}</option>`).join("")
      : '<option value="">当前无在岗项目</option>';
  const companyOpts =
    '<option value="">选择签约企业</option>' + (companySelectCache || []).map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  const projTbl = (ph.rows || [])
    .map(
      (x) =>
        `<tr><td>${x.projectCode || "-"}</td><td>${x.projectName || "-"}</td><td>${x.roleName || "-"}</td><td>${x.status || "-"}</td><td>${x.startDate || "-"}</td><td>${x.endDate || "-"}</td></tr>`
    )
    .join("");
  const coTbl = (ch.rows || [])
    .map((x) => `<tr><td>${x.companyName || "-"}</td><td>${x.status || "-"}</td><td>${x.startDate || "-"}</td><td>${x.endDate || "-"}</td></tr>`)
    .join("");
  const demoBlock =
    authState.user?.role === "admin"
      ? `<div class="drawer-demo admin-only">
      <h4>两周演示：项目进场 / 退场 / 签约企业</h4>
      <p class="muted">均需审批通过后生效</p>
      <div class="drawer-inline">
        <label>进场项目<select id="drawerJoinProject"><option value="">选择</option>${projectOpts}</select></label>
        <button type="button" class="tiny-btn" id="drawerBtnJoin">提交进场审批</button>
      </div>
      <div class="drawer-inline">
        <label>退场项目<select id="drawerLeaveProject">${leaveOpts}</select></label>
        <button type="button" class="tiny-btn" id="drawerBtnLeave">提交退场审批</button>
      </div>
      <div class="drawer-inline">
        <label>签约企业<select id="drawerCompanySelect">${companyOpts}</select></label>
        <button type="button" class="tiny-btn" id="drawerBtnCompany">提交签约企业变更</button>
      </div>
    </div>`
      : "";
  body.innerHTML = `
    <div class="kv"><span>姓名</span><strong>${r.name}</strong></div>
    <div class="kv"><span>证件号码</span><strong>${r.idNo}</strong></div>
    <div class="kv"><span>员工状态</span><strong>${st}</strong></div>
    <div class="kv"><span>用工类型</span><strong>${r.employmentType || "-"}</strong></div>
    <div class="kv"><span>入职日期</span><strong>${r.hireDate || "-"}</strong></div>
    <div class="kv"><span>社保缴费城市</span><strong>${r.socialCity || "-"}</strong></div>
    <div class="kv"><span>工作地</span><strong>${r.city || "-"}</strong></div>
    ${demoBlock}
    <h4 style="margin:12px 0 6px;font-size:14px;">项目挂靠记录</h4>
    <table class="mini-table"><thead><tr><th>编码</th><th>项目</th><th>岗位</th><th>状态</th><th>开始</th><th>结束</th></tr></thead><tbody>${
      projTbl || '<tr><td colspan="6" class="muted">暂无记录</td></tr>'
    }</tbody></table>
    <h4 style="margin:12px 0 6px;font-size:14px;">企业挂靠记录</h4>
    <table class="mini-table"><thead><tr><th>企业</th><th>状态</th><th>开始</th><th>结束</th></tr></thead><tbody>${
      coTbl || '<tr><td colspan="4" class="muted">暂无记录</td></tr>'
    }</tbody></table>
  `;
}

function replayLoginEnterAnimation() {
  const card = loginScreen?.querySelector(".login-card");
  if (!(card instanceof HTMLElement)) return;
  card.style.animation = "none";
  void card.offsetHeight;
  card.style.animation = "";
}

async function login(username, password, role) {
  const data = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, role })
  });
  authState.token = data.token;
  authState.user = data.user;
  localStorage.setItem("eos_token", authState.token);
  localStorage.setItem("eos_user", JSON.stringify(authState.user));
  if (roleSwitcher) roleSwitcher.value = data.user.role;
  welcomeText.textContent = `欢迎回来，${data.user.username}`;
  syncTopbarUser(data.user);
  setAppAuthed(true);
  loginScreen.classList.add("is-leaving");
  await new Promise((resolve) => setTimeout(resolve, 260));
  loginScreen.classList.add("is-hidden");
  loginScreen.classList.remove("is-leaving");
  applyRoleVisibility(data.user.role);
  await loadAllData();
}

function logout(expired = false) {
  authState.token = "";
  authState.user = null;
  localStorage.removeItem("eos_token");
  localStorage.removeItem("eos_user");
  syncTopbarUser(null);
  setAppAuthed(false);
  applyDomRoleSecurity(null);
  loginScreen.classList.remove("is-hidden", "is-leaving");
  replayLoginEnterAnimation();
  loginTips.textContent = expired ? "登录已过期，请重新登录" : "请先登录";
}

loginBtn?.closest("form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const role = document.getElementById("loginRole").value;
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const loginLabel = loginBtn.textContent;
  loginBtn.disabled = true;
  loginBtn.textContent = "登录中…";
  try {
    await login(username, password, role);
    showToast("登录成功");
  } catch (error) {
    loginTips.textContent = error.message;
    showToast(error.message, true);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = loginLabel;
  }
});

document.getElementById("loginPassword")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn?.closest("form")?.requestSubmit();
});
document.getElementById("loginUsername")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn?.closest("form")?.requestSubmit();
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  if (isSettingsDirty()) {
    const { confirmed } = await openConfirmDialog({
      title: "未保存的更改",
      message: "设置尚未保存，确定登出吗？未保存的更改将丢失。",
      confirmLabel: "登出",
      cancelLabel: "取消"
    });
    if (!confirmed) return;
  }
  logout(false);
  showToast("已登出");
});

document.documentElement.removeAttribute("data-theme");
localStorage.removeItem("hr_theme");
panels.forEach((panel, index) => {
  panel.dataset.panelOrder = String(index);
});
purgeSensitiveInlineDom();
detachAdminPanels();
window.__eosBridge = {
  apiRequest,
  showToast,
  activate,
  getUser: () => authState.user,
  openConfirmDialog,
  withButtonLoading
};
setupEvents();
/** 工作日历：页面一加载就完成绑定与首帧绘制，无需等待接口（刷新浏览器即可操作） */
initDashboardWorkCalendar();

if (authState.token && authState.user) {
  apiRequest("/api/me")
    .then(async () => {
      if (roleSwitcher) roleSwitcher.value = authState.user.role;
      welcomeText.textContent = `欢迎回来，${authState.user.username}`;
      syncTopbarUser(authState.user);
      setAppAuthed(true);
      loginScreen.classList.add("is-hidden");
      applyRoleVisibility(authState.user.role);
      await loadAllData();
    })
    .catch(() => logout(true));
}
