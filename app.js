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

const staticRows = {
  retire: [
    ["陈建国", "310101196512123455", "上海市", "已受理", "2026-04-18 10:21", "补充材料审核中"],
    ["周晓梅", "500101196611093322", "重庆市", "已提交", "2026-04-18 11:36", "待初审"]
  ],
  import: [
    ["胡寿文", "身份证", "360102198908093212", "13812340001", "15600", "上海市", "6222024000112233445"],
    ["吴振辉", "身份证", "310101199511213456", "13912340002", "18800", "上海市", "6222024000112233446"]
  ]
};

const panels = [...document.querySelectorAll(".route-panels > section.panel")];
const roleSwitcher = document.getElementById("roleSwitcher");
const pageTitle = document.getElementById("pageTitle");
const welcomeText = document.getElementById("welcomeText");
const loginScreen = document.getElementById("loginScreen");
const loginBtn = document.getElementById("loginBtn");
const loginTips = document.getElementById("loginTips");
const secondaryMenu = document.getElementById("secondaryMenu");
const sidebarToggle = document.getElementById("sidebarToggle");

const PANEL_MENU_ICONS = {
  dashboard: "fa-home",
  workspace: "fa-inbox",
  project: "fa-briefcase",
  employee: "fa-id-card-o",
  contract: "fa-file-text-o",
  retire: "fa-clock-o",
  approval: "fa-check-square-o",
  organization: "fa-sitemap",
  company: "fa-building-o",
  social: "fa-medkit",
  policy: "fa-map-o",
  import: "fa-upload",
  invoice: "fa-file-o",
  reports: "fa-bar-chart",
  settings: "fa-cog",
  "ai-assistant": "fa-lightbulb-o"
};

const panelTitleMap = {
  dashboard: "首页",
  workspace: "工作台",
  project: "项目中心",
  employee: "员工名册",
  organization: "组织架构",
  company: "企业管理",
  social: "社保公积金",
  contract: "劳动合同",
  approval: "审批中心",
  invoice: "发票查询",
  retire: "退休办理",
  policy: "城市政策",
  import: "数据上传",
  reports: "报表中心",
  settings: "系统设置",
  "ai-assistant": "AI 用工助手"
};

const topNavConfig = {
  workspace: {
    sections: [{ title: "工作台", items: ["dashboard", "workspace", "project"] }]
  },
  employee: {
    sections: [
      { title: "员工管理", items: ["employee", "contract"] },
      { title: "员工关系", items: ["retire", "approval"] }
    ]
  },
  organization: {
    sections: [{ title: "组织管理", items: ["organization", "company"] }]
  },
  project: {
    sections: [{ title: "项目管理", items: ["project", "employee", "contract"] }]
  },
  approval: {
    sections: [{ title: "招聘审批", items: ["approval", "employee"] }]
  },
  social: {
    sections: [{ title: "考勤社保", items: ["social", "policy"] }]
  },
  import: {
    sections: [{ title: "薪酬管理", items: ["import", "invoice"] }]
  },
  reports: {
    sections: [{ title: "数据中心", items: ["reports", "settings", "ai-assistant"] }]
  }
};
const panelToTop = {
  dashboard: "workspace",
  workspace: "workspace",
  project: "project",
  employee: "employee",
  contract: "employee",
  retire: "employee",
  approval: "approval",
  organization: "organization",
  company: "organization",
  social: "social",
  policy: "social",
  import: "import",
  invoice: "import",
  reports: "reports",
  settings: "reports",
  "ai-assistant": "reports"
};
const panelRoleMap = {
  dashboard: ["admin", "enterprise"],
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
  "ai-assistant": ["admin"]
};
let currentTopKey = "workspace";

function getCurrentMenuItems() {
  return [...document.querySelectorAll(".secondary-menu-item[data-target]")];
}

function showToast(message, isError) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", !!isError);
  el.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("is-visible"), 3200);
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
          const icon = PANEL_MENU_ICONS[target] || "fa-circle-o";
          return `<button type="button" class="secondary-menu-item ${target === activeTarget ? "is-active" : ""}" data-target="${target}" title="${label}"><i class="fa ${icon} secondary-menu-icon" aria-hidden="true"></i><span class="secondary-menu-label">${label}</span></button>`;
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

function activate(targetId) {
  getCurrentMenuItems().forEach((item) => item.classList.toggle("is-active", item.dataset.target === targetId));
  panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === targetId));
  const activeLabel = panelTitleMap[targetId] || "首页";
  pageTitle.textContent = activeLabel;
  if (targetId === "dashboard" || targetId === "workspace") syncEzwbWorkbenchTabs(targetId);
  syncBizTopNav(targetId);
  renderSecondaryMenu(authState.user?.role || "admin", targetId);
  if (targetId === "dashboard") renderDashboardWorkCalendar();
}

function applyRoleVisibility(role) {
  const topButtons = [...document.querySelectorAll(".biz-top-item[data-top-nav-target]")];
  if (role === "enterprise") {
    topButtons.forEach((btn) => (btn.style.display = "none"));
    if (secondaryMenu) secondaryMenu.innerHTML = "";
    activate("dashboard");
    return;
  }
  topButtons.forEach((btn) => (btn.style.display = ""));
  const cfg = topNavConfig[currentTopKey] || topNavConfig.workspace;
  let firstVisibleTarget = cfg.sections.flatMap((s) => s.items).find((target) => (panelRoleMap[target] || []).includes(role));
  if (!firstVisibleTarget) {
    currentTopKey = "workspace";
    firstVisibleTarget = "dashboard";
  }
  if (firstVisibleTarget) activate(firstVisibleTarget);
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = role === "admin" ? "" : "none";
  });
}

function renderStaticTables() {
  Object.entries(staticRows).forEach(([key, rows]) => {
    const id = `${key}Rows`;
    const tbody = document.getElementById(id);
    if (!tbody) return;
    tbody.innerHTML = rows.map((r) => `<tr>${r.map((c) => statusCell(c)).join("")}</tr>`).join("");
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
      <tr>
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
            <button type="button" class="tiny-btn" data-del-emp="${r.id}">删除</button>
          </span><div class="muted" style="margin-top:4px;font-size:11px;">${transitionHint}</div></td>`
        : "";
      return `<tr data-emp-row="${r.id}" style="cursor:pointer">
        <td>${r.name}</td><td>${r.idNo}</td><td>${r.mobile || "-"}</td><td>${r.gender || "-"}</td>
        ${statusCell(r.status)}<td>${r.employmentType || "-"}</td><td>${r.hireDate || "-"}</td><td>${r.city || "-"}</td><td>${r.socialCity || "-"}</td>
        ${isAdmin ? actions : ""}
      </tr>`;
    })
    .join("");
}

function renderProjectTable(rows) {
  const tbody = document.getElementById("projectRows");
  if (!tbody) return;
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
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
}

async function loadProjects() {
  if (authState.user?.role !== "admin") return;
  const data = await apiRequest("/api/projects");
  projectRowsCache = data.rows || [];
  renderProjectTable(projectRowsCache);
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
        ? `<td><button type="button" class="tiny-btn" data-del-co="${r.id}">删除</button></td>`
        : "";
      return `<tr><td>${r.name}</td><td>${r.code}</td><td>${r.city || "-"}</td><td>${r.serviceType || "-"}</td>${statusCell(
        r.status
      )}${isAdmin ? del : ""}</tr>`;
    })
    .join("");
}

async function loadCompanies() {
  const data = await apiRequest("/api/companies");
  companySelectCache = data.rows || [];
  renderCompanyTable(data.rows);
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
      return `<tr><td>${r.no}</td><td>${r.type}</td><td>${r.applicant}</td><td>${r.submittedAt}</td>${statusCell(
        r.status
      )}<td>${r.handler}</td>${isAdmin ? ops : ""}</tr>`;
    })
    .join("");
}

async function loadApprovals() {
  if (authState.user?.role !== "admin") return;
  const data = await apiRequest("/api/approvals");
  renderApprovalTable(data.rows);
}

function renderInvoiceTable(rows) {
  const tbody = document.getElementById("invoiceRows");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = rows
    .map((r) => {
      const del = isAdmin ? `<td><button type="button" class="tiny-btn" data-del-inv="${r.id}">删除</button></td>` : "";
      return `<tr><td>${r.no}</td><td>${r.customerName}</td><td>${r.amount}</td><td>${r.month}</td>${statusCell(
        r.status
      )}<td>${r.action}</td>${isAdmin ? del : ""}</tr>`;
    })
    .join("");
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

async function loadContracts() {
  const data = await apiRequest("/api/contracts");
  const tbody = document.getElementById("contractRows");
  if (!tbody) return;
  const isAdmin = authState.user?.role === "admin";
  tbody.innerHTML = data.rows
    .map((r) => {
      const del = isAdmin ? `<td><button type="button" class="tiny-btn" data-del-ct="${r.id}">删除</button></td>` : "";
      return `<tr><td>${r.target}</td><td>${r.type}</td><td>${r.material}</td><td>${r.name}</td><td>${r.idNo}</td><td>${r.employmentStatus}</td>${statusCell(
        r.signStatus
      )}<td>${r.doneTime}</td><td>${r.contractEnd || "-"}</td>${isAdmin ? del : ""}</tr>`;
    })
    .join("");
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
}

async function loadAudit() {
  if (authState.user?.role !== "admin") return;
  const data = await apiRequest("/api/audit-logs");
  const tbody = document.getElementById("auditRows");
  if (!tbody) return;
  tbody.innerHTML = data.rows
    .map((r) => `<tr><td>${r.createdAt}</td><td>${r.username || "-"}</td><td>${r.action}</td><td>${r.detail || "-"}</td></tr>`)
    .join("");
}

async function loadAllData() {
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

function setupEvents() {
  function syncSidebarAria() {
    sidebarToggle?.setAttribute(
      "aria-expanded",
      document.body.classList.contains("sidebar-collapsed") ? "false" : "true"
    );
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

  // Module tabs: switch sub-views inside a panel (layout-only enhancement).
  document.querySelectorAll(".module-tabs[data-module-scope]").forEach((tabs) => {
    tabs.querySelectorAll(".module-tab[data-module]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const scope = tabs.dataset.moduleScope;
        const target = btn.dataset.module;
        tabs.querySelectorAll(".module-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
        const root = tabs.closest("article");
        if (!root) return;
        root.querySelectorAll(".module-view").forEach((view) => {
          view.classList.toggle("is-active", view.dataset.moduleView === target);
        });
        if (scope === "employee") showToast(`已切换到：${btn.textContent.trim()}`);
      });
    });
  });

  const calculator = document.getElementById("calculatorDialog");
  document.getElementById("openCalculator")?.addEventListener("click", () => calculator?.showModal());
  document.getElementById("openCalculatorFromWb")?.addEventListener("click", () => calculator?.showModal());

  function filterWorkbenchMenu(query) {
    const norm = (query || "").trim().toLowerCase();
    document.querySelectorAll("#side-menu .workbench-tiles li").forEach((li) => {
      const btn = li.querySelector(".workbenchBtn");
      if (!btn) return;
      const hay = `${btn.dataset.label || ""} ${btn.textContent || ""}`.toLowerCase();
      li.style.display = !norm || hay.includes(norm) ? "" : "none";
    });
  }
  document.getElementById("workbenchMenuSearch")?.addEventListener("input", (e) => filterWorkbenchMenu(e.target.value));
  document.getElementById("workbenchMenuSearchBtn")?.addEventListener("click", () => {
    filterWorkbenchMenu(document.getElementById("workbenchMenuSearch")?.value);
  });

  document.getElementById("ezwbTabHome")?.addEventListener("click", () => activate("dashboard"));
  document.getElementById("ezwbTabWorkbench")?.addEventListener("click", () => activate("workspace"));

  document.querySelectorAll(".workbenchBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.id === "openCalculatorFromWb") return;
      const jump = btn.dataset.jump;
      if (jump) activate(jump);
      const scrollId = btn.dataset.scrollTarget;
      if (scrollId) {
        requestAnimationFrame(() => document.getElementById(scrollId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    });
  });
  document.getElementById("openTaskDialog")?.addEventListener("click", () => document.getElementById("taskDialog").showModal());

  const uploadInput = document.getElementById("salaryUpload");
  const validateBtn = document.getElementById("validateUpload");
  const uploadResult = document.getElementById("uploadResult");
  validateBtn?.addEventListener("click", () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return (uploadResult.innerHTML = '<span class="status status-warn">请先选择上传文件</span>');
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      return (uploadResult.innerHTML = '<span class="status status-warn">文件格式不正确，仅支持 xlsx/xls/csv</span>');
    }
    uploadResult.innerHTML = `<span class="status status-success">校验通过：${file.name}（演示模式）</span>`;
  });

  const drawer = document.getElementById("employeeDrawer");
  const drawerMask = document.getElementById("drawerMask");
  const setDrawer = (open) => {
    drawer.classList.toggle("is-open", open);
    drawerMask.classList.toggle("is-open", open);
  };
  document.getElementById("openDetailDrawer")?.addEventListener("click", async () => {
    const first = employeeRowsCache[0];
    if (first) {
      await fillDrawer(first);
      setDrawer(true);
    }
  });
  document.getElementById("closeDrawer")?.addEventListener("click", () => setDrawer(false));
  drawerMask?.addEventListener("click", () => setDrawer(false));

  drawer?.addEventListener("click", async (e) => {
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
        const note = prompt("请输入审批备注（可选）", "") || "";
        await apiRequest(`/api/employees/${employeeId}/lifecycle-request`, {
          method: "POST",
          body: JSON.stringify({ ...cfg, note, effectiveDate: new Date().toISOString().slice(0, 10) })
        });
        showToast("已提交审批，请在审批中心处理");
        await loadApprovals();
      }
      return;
    }
    const id = t.dataset.delEmp;
    if (id) {
      if (!confirm("确定删除该员工？")) return;
      await apiRequest(`/api/employees/${id}`, { method: "DELETE" });
      showToast("已删除");
      await loadEmployees();
      await loadDashboard();
      return;
    }
    const tr = t.closest("tr[data-emp-row]");
    if (tr) {
      const rid = tr.getAttribute("data-emp-row");
      const row = employeeRowsCache.find((x) => String(x.id) === rid);
      if (row) {
        await fillDrawer(row);
        setDrawer(true);
      }
    }
  });

  document.getElementById("employeeQuery")?.addEventListener("click", () => loadEmployees());
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
    document.getElementById("employeeAdd")?.click();
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
    await apiRequest("/api/employees", { method: "POST", body: JSON.stringify(body) });
    showToast("员工已新增");
    await loadEmployees();
    await loadDashboard();
  });

  document.getElementById("companyRows")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.dataset.delCo) return;
    if (!confirm("确定删除该企业？")) return;
    await apiRequest(`/api/companies/${t.dataset.delCo}`, { method: "DELETE" });
    showToast("企业已删除");
    await loadCompanies();
  });
  document.getElementById("companyAdd")?.addEventListener("click", async () => {
    const body = {
      name: document.getElementById("coName").value.trim(),
      code: document.getElementById("coCode").value.trim(),
      city: document.getElementById("coCity").value.trim(),
      serviceType: document.getElementById("coService").value.trim(),
      status: document.getElementById("coStatus").value
    };
    await apiRequest("/api/companies", { method: "POST", body: JSON.stringify(body) });
    showToast("企业已新增");
    await loadCompanies();
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
    if (!confirm("确定删除该合同记录？")) return;
    await apiRequest(`/api/contracts/${t.dataset.delCt}`, { method: "DELETE" });
    showToast("已删除");
    await loadContracts();
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
    await apiRequest("/api/contracts", { method: "POST", body: JSON.stringify(body) });
    showToast("合同记录已新增");
    await loadContracts();
  });

  document.getElementById("invoiceRows")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.dataset.delInv) return;
    if (!confirm("确定删除该发票记录？")) return;
    await apiRequest(`/api/invoices/${t.dataset.delInv}`, { method: "DELETE" });
    showToast("已删除");
    await loadInvoices();
    await loadDashboard();
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
    await apiRequest("/api/invoices", { method: "POST", body: JSON.stringify(body) });
    showToast("发票已新增");
    await loadInvoices();
    await loadDashboard();
  });
  document.getElementById("invoiceQuery")?.addEventListener("click", () => loadInvoices());
  document.getElementById("invoiceExport")?.addEventListener("click", () => {
    const h = ["发票编号", "客户", "金额", "月份", "状态", "下载"];
    const rows = invoiceRowsCache.map((r) => [r.no, r.customerName, r.amount, r.month, r.status, r.action]);
    exportCsv("发票列表.csv", h, rows);
    showToast("已导出当前筛选结果");
  });

  document.getElementById("settingsSave")?.addEventListener("click", async () => {
    const body = {
      mfaEnabled: document.getElementById("setMfa").checked,
      approvalNotify: document.getElementById("setNotify").checked,
      policyAutoSync: document.getElementById("setPolicySync").checked,
      socialApiPlaceholder: document.getElementById("setSocialApi")?.checked,
      paymentApiPlaceholder: document.getElementById("setPaymentApi")?.checked
    };
    await apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(body) });
    showToast("设置已保存");
    await loadAudit();
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
    await apiRequest("/api/projects", { method: "POST", body: JSON.stringify(body) });
    showToast("项目已新增");
    await loadProjects();
  });

  document.getElementById("queryWorkspace")?.addEventListener("click", async () => {
    workspaceState.page = 1;
    await loadWorkspace();
  });
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

  document.getElementById("runAiMatch")?.addEventListener("click", async () => {
    const query = document.getElementById("aiQueryInput")?.value.trim();
    const aiResult = document.getElementById("aiResult");
    const aiTbody = document.getElementById("aiRows");
    if (!query) return (aiResult.innerHTML = '<span class="status status-warn">请输入需求描述后再匹配</span>');
    const data = await apiRequest("/api/ai/match", { method: "POST", body: JSON.stringify({ query }) });
    aiResult.innerHTML = `<span class="status status-success">${data.summary}</span>`;
    aiTbody.innerHTML = data.rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  });
}

async function fillDrawer(r) {
  drawerEmployeeId = r.id;
  const body = document.querySelector("#employeeDrawer .drawer-body");
  if (!body) return;
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
  welcomeText.textContent = `你好，${data.user.role === "admin" ? "客户管理员" : "企业用户"}（${data.user.username}）`;
  loginScreen.classList.add("is-hidden");
  applyRoleVisibility(data.user.role);
  await loadAllData();
}

function logout(expired = false) {
  authState.token = "";
  authState.user = null;
  localStorage.removeItem("eos_token");
  localStorage.removeItem("eos_user");
  loginScreen.classList.remove("is-hidden");
  loginTips.textContent = expired ? "登录已过期，请重新登录" : "请先登录";
}

loginBtn?.addEventListener("click", async () => {
  const role = document.getElementById("loginRole").value;
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  try {
    await login(username, password, role);
    showToast("登录成功");
  } catch (error) {
    loginTips.textContent = error.message;
    showToast(error.message, true);
  }
});

document.querySelector(".danger-btn")?.addEventListener("click", () => {
  logout(false);
  showToast("已登出");
});

renderStaticTables();
setupEvents();
/** 工作日历：页面一加载就完成绑定与首帧绘制，无需等待接口（刷新浏览器即可操作） */
initDashboardWorkCalendar();

if (authState.token && authState.user) {
  apiRequest("/api/me")
    .then(async () => {
      if (roleSwitcher) roleSwitcher.value = authState.user.role;
      welcomeText.textContent = `你好，${authState.user.role === "admin" ? "客户管理员" : "企业用户"}（${authState.user.username}）`;
      loginScreen.classList.add("is-hidden");
      applyRoleVisibility(authState.user.role);
      await loadAllData();
    })
    .catch(() => logout(true));
}
