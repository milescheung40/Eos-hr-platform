try {
  require("dotenv").config();
} catch {
  /* dotenv optional */
}

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { seedTalentPool } = require("./lib/talentSeed");
const { registerStaffingRoutes } = require("./lib/staffingRoutes");
const { registerAiRoutes } = require("./lib/aiRoutes");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "eos-hr-demo-secret-change-in-prod";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "eos_hr.db");
const db = new sqlite3.Database(DB_PATH);

const loginAttempts = new Map();
const MAX_LOGIN = 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const EMPLOYEE_STATUS = ["待入职", "试用期", "在职", "待离职", "已离职", "异动中"];
const EMPLOYMENT_TYPE = ["全职", "灵活用工", "兼职"];
const STATUS_TRANSITIONS = {
  待入职: ["试用期", "在职"],
  试用期: ["在职", "待离职", "异动中"],
  在职: ["异动中", "待离职"],
  异动中: ["在职", "待离职"],
  待离职: ["已离职"],
  已离职: []
};

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json({ limit: "512kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

async function withTransaction(fn) {
  await run("BEGIN IMMEDIATE");
  try {
    const result = await fn();
    await run("COMMIT");
    return result;
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function clampStr(s, max = 200) {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function safeJsonParse(raw, fallback = {}) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function audit(user, action, detail) {
  const uid = user?.id ?? null;
  const u = clampStr(user?.username || "", 80);
  const a = clampStr(action, 120);
  const d = clampStr(detail, 500);
  return run("INSERT INTO audit_logs (user_id, username, action, detail) VALUES (?, ?, ?, ?)", [uid, u, a, d]).catch(() => {});
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS workspace_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq INTEGER NOT NULL,
      name TEXT NOT NULL,
      id_no TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT NOT NULL,
      service TEXT NOT NULL,
      remark TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      id_no TEXT NOT NULL,
      mobile TEXT,
      gender TEXT,
      status TEXT,
      hire_date TEXT,
      city TEXT,
      social_city TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT,
      type TEXT,
      material TEXT,
      name TEXT,
      id_no TEXT,
      employment_status TEXT,
      sign_status TEXT,
      done_time TEXT
    )
  `);
  await ensureColumn("contracts", "contract_end", "TEXT");
  await run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no TEXT,
      customer_name TEXT,
      amount TEXT,
      month TEXT,
      status TEXT,
      action TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      city TEXT,
      service_type TEXT,
      status TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no TEXT NOT NULL,
      type TEXT,
      applicant TEXT,
      submitted_at TEXT,
      status TEXT,
      handler TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      client_company TEXT,
      manager TEXT,
      status TEXT,
      start_date TEXT,
      end_date TEXT,
      remark TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS project_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      company_id INTEGER,
      role_name TEXT,
      status TEXT,
      start_date TEXT,
      end_date TEXT,
      is_primary INTEGER DEFAULT 0
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS employee_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      effective_date TEXT,
      approval_id INTEGER,
      note TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      target_status TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL,
      approval_ref INTEGER,
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS employee_company_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      start_date TEXT,
      end_date TEXT,
      status TEXT,
      approval_id INTEGER
    )
  `);
  await ensureColumn("employees", "employment_type", "TEXT");
  await ensureColumn("employees", "probation_end", "TEXT");
  await ensureColumn("employees", "offboard_date", "TEXT");
  await ensureColumn("employees", "current_company_id", "INTEGER");
  await ensureColumn("employees", "current_project_id", "INTEGER");
  await ensureColumn("employees", "job_title", "TEXT");
  await ensureColumn("employees", "skills", "TEXT");
  await ensureColumn("employees", "years_experience", "REAL");
  await ensureColumn("employees", "certificates", "TEXT");
  await ensureColumn("employees", "available_date", "TEXT");
  await ensureColumn("employees", "availability_status", "TEXT");
  await ensureColumn("employees", "preferred_city", "TEXT");
  await ensureColumn("employees", "salary_range", "TEXT");
  await ensureColumn("employees", "project_experience", "TEXT");
  await ensureColumn("employees", "is_talent_pool", "INTEGER DEFAULT 0");
  await ensureColumn("users", "company_id", "INTEGER");
  await ensureColumn("users", "company_name", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS staffing_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_no TEXT NOT NULL UNIQUE,
      company_id INTEGER,
      company_name TEXT,
      raw_query TEXT NOT NULL,
      job_title TEXT,
      city TEXT,
      headcount INTEGER DEFAULT 1,
      min_experience REAL DEFAULT 0,
      required_skills TEXT,
      required_certificates TEXT,
      available_before TEXT,
      employment_type TEXT,
      budget_range TEXT,
      status TEXT NOT NULL DEFAULT '草稿',
      parsed_json TEXT,
      selected_candidate_ids TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS staffing_requirement_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      match_score REAL,
      match_reason TEXT,
      unmet_conditions TEXT,
      is_selected INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS staffing_requirement_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      detail TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  await ensureColumn("staffing_requirements", "converted_project_id", "INTEGER");
  await ensureColumn("staffing_requirements", "converted_approval_id", "INTEGER");
  await run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_staffing_req_candidate ON staffing_requirement_candidates(requirement_id, employee_id)"
  );
  await run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_project_assignment_unique ON project_assignments(project_id, employee_id)"
  );
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_no ON approvals(no)");

  let demoCompany = await get("SELECT id, name FROM companies WHERE code = 'DEMO-ENT'");
  if (!demoCompany) {
    await run(
      "INSERT INTO companies (name, code, city, service_type, status) VALUES (?, ?, ?, ?, ?)",
      ["演示企业客户", "DEMO-ENT", "上海市", "灵活用工", "合作中"]
    );
    demoCompany = await get("SELECT id, name FROM companies WHERE code = 'DEMO-ENT'");
  }
  let otherCompany = await get("SELECT id FROM companies WHERE code = 'OTHER-ENT'");
  if (!otherCompany) {
    await run(
      "INSERT INTO companies (name, code, city, service_type, status) VALUES (?, ?, ?, ?, ?)",
      ["其他演示企业", "OTHER-ENT", "北京市", "灵活用工", "合作中"]
    );
  }

  await seedTalentPool({ get, run });
  await run("UPDATE users SET company_id = ?, company_name = ? WHERE username = 'enterprise'", [
    demoCompany.id,
    demoCompany.name
  ]);
  await run("UPDATE staffing_requirements SET company_id = ? WHERE company_id IS NULL AND created_by = 'enterprise'", [
    demoCompany.id
  ]);
  await run("UPDATE staffing_requirements SET company_name = ? WHERE company_id = ? AND (company_name IS NULL OR company_name = '')", [
    demoCompany.name,
    demoCompany.id
  ]);

  const userCount = await get("SELECT COUNT(*) AS c FROM users");
  if (userCount.c === 0) {
    await run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?), (?, ?, ?)",
      ["admin", hashPassword("admin123"), "admin", "enterprise", hashPassword("enterprise123"), "enterprise"]
    );
  }

  const workspaceCount = await get("SELECT COUNT(*) AS c FROM workspace_items");
  if (workspaceCount.c === 0) {
    const seedRows = [
      [1, "胡寿文", "360102198908093212", "南昌市", "已提交", "员工", "等待确认"],
      [2, "吴振辉", "310101199511213456", "上海市", "已确认", "代理", "办理完成"],
      [3, "张丽", "440105199210054321", "广州市", "未确认", "员工", "信息待补充"],
      [4, "王晨", "500101199105121212", "重庆市", "已受理", "员工", "停保成功"],
      [5, "赵敏", "320101199702182233", "上海市", "已提交", "员工", "材料待补交"],
      [6, "杨帆", "110101199203034321", "北京市", "已确认", "代理", "流程完成"]
    ];
    for (const row of seedRows) {
      await run(
        "INSERT INTO workspace_items (seq, name, id_no, city, status, service, remark) VALUES (?, ?, ?, ?, ?, ?, ?)",
        row
      );
    }
  }

  const employeeCount = await get("SELECT COUNT(*) AS c FROM employees");
  if (employeeCount.c === 0) {
    const seed = [
      ["胡寿文", "360102198908093212", "13812340001", "男", "在职", "2024-09-01", "南昌市", "南昌市", "全职", "2024-12-01"],
      ["吴振辉", "310101199511213456", "13912340002", "男", "试用期", "2026-03-15", "上海市", "上海市", "灵活用工", "2026-06-15"],
      ["李娜", "440105199408084785", "13712340003", "女", "待离职", "2022-06-01", "深圳市", "深圳市", "全职", "2022-09-01"]
    ];
    for (const row of seed) {
      await run(
        "INSERT INTO employees (name, id_no, mobile, gender, status, hire_date, city, social_city, employment_type, probation_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        row
      );
    }
  }

  const contractCount = await get("SELECT COUNT(*) AS c FROM contracts");
  if (contractCount.c === 0) {
    const seed = [
      ["客户", "劳动合同", "劳动合同-标准版", "胡寿文", "360102198908093212", "入职", "已签署", "2026-04-11"],
      ["客户", "保密协议", "保密协议-v2", "吴振辉", "310101199511213456", "在职", "待签署", "-"]
    ];
    for (const row of seed) {
      await run(
        "INSERT INTO contracts (target, type, material, name, id_no, employment_status, sign_status, done_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        row
      );
    }
  }

  const invoiceCount = await get("SELECT COUNT(*) AS c FROM invoices");
  if (invoiceCount.c === 0) {
    const seed = [
      ["FP20260418001", "客户企业 A", "12,400.00", "2026-04", "已开票", "下载"],
      ["FP20260418002", "客户企业 B", "8,600.00", "2026-04", "未开票", "-"]
    ];
    for (const row of seed) {
      await run("INSERT INTO invoices (no, customer_name, amount, month, status, action) VALUES (?, ?, ?, ?, ?, ?)", row);
    }
  }

  const companyCount = await get("SELECT COUNT(*) AS c FROM companies");
  if (companyCount.c === 0) {
    const seed = [
      ["客户企业 A", "C0001", "上海市", "外包+派遣", "合作中"],
      ["客户企业 B", "C0002", "九江市", "代理招聘", "合作中"],
      ["客户企业 C", "C0003", "深圳市", "灵活用工", "待续签"]
    ];
    for (const row of seed) {
      await run("INSERT INTO companies (name, code, city, service_type, status) VALUES (?, ?, ?, ?, ?)", row);
    }
  }

  const projectCount = await get("SELECT COUNT(*) AS c FROM projects");
  if (projectCount.c === 0) {
    const seed = [
      ["临港园区仓配专项", "PRJ-2026-001", "客户企业 A", "张主管", "执行中", "2026-04-01", "2026-09-30", "灵活用工仓配团队"],
      ["华东商超促销外包", "PRJ-2026-002", "客户企业 B", "王经理", "筹备中", "2026-05-01", "2026-08-15", "分批上岗项目"]
    ];
    for (const row of seed) {
      await run(
        "INSERT INTO projects (name, code, client_company, manager, status, start_date, end_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        row
      );
    }
    const firstEmployee = await get("SELECT id FROM employees ORDER BY id ASC LIMIT 1");
    const secondEmployee = await get("SELECT id FROM employees ORDER BY id ASC LIMIT 1 OFFSET 1");
    const firstProject = await get("SELECT id FROM projects WHERE code = 'PRJ-2026-001'");
    if (firstEmployee && firstProject) {
      await run(
        "INSERT INTO project_assignments (project_id, employee_id, role_name, status, start_date, is_primary) VALUES (?, ?, ?, ?, ?, 1)",
        [firstProject.id, firstEmployee.id, "安保组长", "在岗", "2026-04-02"]
      );
      await run("UPDATE employees SET current_project_id = ? WHERE id = ?", [firstProject.id, firstEmployee.id]);
    }
    if (secondEmployee && firstProject) {
      await run(
        "INSERT INTO project_assignments (project_id, employee_id, role_name, status, start_date, is_primary) VALUES (?, ?, ?, ?, ?, 1)",
        [firstProject.id, secondEmployee.id, "安保队员", "在岗", "2026-04-10"]
      );
      await run("UPDATE employees SET current_project_id = ? WHERE id = ?", [firstProject.id, secondEmployee.id]);
    }
  }

  const approvalCount = await get("SELECT COUNT(*) AS c FROM approvals");
  if (approvalCount.c === 0) {
    const seed = [
      ["AP20260418001", "增员申请", "胡寿文", "2026-04-18 10:22", "已提交", "客户管理员"],
      ["AP20260418002", "合同盖章", "吴振辉", "2026-04-18 10:56", "已确认", "法务专员"],
      ["AP20260418003", "离职申请", "李娜", "2026-04-18 11:20", "已受理", "运营经理"]
    ];
    for (const row of seed) {
      await run("INSERT INTO approvals (no, type, applicant, submitted_at, status, handler) VALUES (?, ?, ?, ?, ?, ?)", row);
    }
  }

  const demoRow = await get("SELECT id FROM employees WHERE id_no = ?", ["110101199901011234"]);
  if (!demoRow) {
    await run(
      "INSERT INTO employees (name, id_no, mobile, gender, status, hire_date, city, social_city, employment_type, probation_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["演示-待入职", "110101199901011234", "13600000000", "女", "待入职", "2026-05-01", "上海市", "上海市", "灵活用工", ""]
    );
  }

  const settingKeys = ["mfa_enabled", "approval_notify", "policy_auto_sync", "social_api_placeholder", "payment_api_placeholder"];
  for (const key of settingKeys) {
    const row = await get("SELECT 1 FROM app_settings WHERE key = ?", [key]);
    if (!row) {
      const defaults = {
        mfa_enabled: "0",
        approval_notify: "1",
        policy_auto_sync: "0",
        social_api_placeholder: "1",
        payment_api_placeholder: "1"
      };
      await run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [key, defaults[key]]);
    }
  }
  await run("UPDATE employees SET status = '已离职' WHERE status = '离职'");
  await run("UPDATE employees SET status = '待入职' WHERE status IS NULL OR status = ''");
  await run("UPDATE employees SET employment_type = '灵活用工' WHERE employment_type IS NULL OR employment_type = ''");
}

function auth(requiredRole = null) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "未登录或 token 缺失" });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ message: "无权限访问" });
      }
      req.user = payload;
      return next();
    } catch (error) {
      return res.status(401).json({ message: "token 无效或已过期" });
    }
  };
}

function loginGuard(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(ip, rec);
  }
  if (rec.count >= MAX_LOGIN) {
    return res.status(429).json({ message: "登录尝试过多，请稍后再试" });
  }
  req._loginRec = rec;
  next();
}

app.post("/api/auth/login", loginGuard, async (req, res) => {
  const { username, password, role } = req.body || {};
  const u = clampStr(username, 64);
  const p = clampStr(password, 128);
  const r = clampStr(role, 32);
  if (!u || !p || !r) {
    return res.status(400).json({ message: "请填写用户名、密码和角色" });
  }
  if (r !== "admin" && r !== "enterprise") {
    return res.status(400).json({ message: "角色无效" });
  }
  const user = await get("SELECT * FROM users WHERE username = ? AND role = ?", [u, r]);
  if (!user || user.password_hash !== hashPassword(p)) {
    req._loginRec.count += 1;
    return res.status(401).json({ message: "用户名或密码错误" });
  }
  req._loginRec.count = 0;
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      companyId: user.company_id || null,
      companyName: user.company_name || null
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
  await audit({ id: user.id, username: user.username }, "login", `role=${user.role}`);
  return res.json({
    token,
    user: {
      username: user.username,
      role: user.role,
      companyId: user.company_id || null,
      companyName: user.company_name || null
    }
  });
});

app.get("/api/me", auth(), async (req, res) => {
  if (req.user.role === "enterprise") {
    const row = await get("SELECT company_id AS companyId, company_name AS companyName FROM users WHERE id = ?", [
      req.user.id
    ]);
    return res.json({
      user: {
        ...req.user,
        companyId: row?.companyId ?? req.user.companyId ?? null,
        companyName: row?.companyName ?? req.user.companyName ?? null
      }
    });
  }
  res.json({ user: req.user });
});

app.get("/api/dashboard", auth("admin"), async (req, res) => {
  const w = await get(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status='已提交' THEN 1 ELSE 0 END) AS submitted, SUM(CASE WHEN status='已确认' THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status='已受理' THEN 1 ELSE 0 END) AS accepted FROM workspace_items"
  );
  const emp = await get(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='在职' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status='试用期' THEN 1 ELSE 0 END) AS probation,
      SUM(CASE WHEN status='待离职' THEN 1 ELSE 0 END) AS pendingOffboard,
      SUM(CASE WHEN employment_type='全职' THEN 1 ELSE 0 END) AS fullTime,
      SUM(CASE WHEN employment_type='灵活用工' THEN 1 ELSE 0 END) AS flexible
    FROM employees`
  );
  const inv = await get("SELECT COUNT(*) AS total, SUM(CASE WHEN status='已开票' THEN 1 ELSE 0 END) AS issued FROM invoices");
  const appr = await get("SELECT COUNT(*) AS pending FROM approvals WHERE status = '已提交'");
  const ct = await get(
    "SELECT COUNT(*) AS expiring FROM contracts WHERE contract_end IS NOT NULL AND contract_end != '' AND date(contract_end) BETWEEN date('now') AND date('now', '+30 day')"
  );
  res.json({
    workspace: { total: w.total || 0, submitted: w.submitted || 0, confirmed: w.confirmed || 0, accepted: w.accepted || 0 },
    employees: {
      total: emp.total || 0,
      active: emp.active || 0,
      probation: emp.probation || 0,
      pendingOffboard: emp.pendingOffboard || 0,
      fullTime: emp.fullTime || 0,
      flexible: emp.flexible || 0
    },
    invoices: { total: inv.total || 0, issued: inv.issued || 0 },
    approvalsPending: appr?.pending || 0,
    contractExpiring30: ct?.expiring || 0
  });
});

app.get("/api/reports/summary", auth("admin"), async (req, res) => {
  const emp = await get(
    "SELECT SUM(CASE WHEN status='在职' THEN 1 ELSE 0 END) AS onjob, SUM(CASE WHEN status='已离职' THEN 1 ELSE 0 END) AS left FROM employees"
  );
  const on = emp.onjob || 0;
  const left = emp.left || 0;
  const total = on + left || 1;
  const pctOn = Math.round((on / total) * 100);
  const pctLeft = 100 - pctOn;
  res.json({
    employeeStructure: { onJobPct: pctOn, leftPct: pctLeft },
    hireCycleDays: 12,
    socialCostMom: 6.8
  });
});

app.get("/api/workspace", auth("admin"), async (req, res) => {
  const keyword = clampStr(req.query.keyword || "", 80);
  const status = clampStr(req.query.status || "", 40);
  const service = clampStr(req.query.service || "", 40);
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));

  const where = [];
  const params = [];
  if (keyword) {
    where.push("(name LIKE ? OR id_no LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (service) {
    where.push("service = ?");
    params.push(service);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = await get(`SELECT COUNT(*) AS c FROM workspace_items ${whereSql}`, params);
  const total = totalRow.c;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  let pageAdj = page;
  if (pageAdj > totalPages) pageAdj = totalPages;
  const offset = (pageAdj - 1) * pageSize;
  const rows = await all(
    `SELECT id, seq, name, id_no AS idNo, city, status, service, remark
     FROM workspace_items ${whereSql}
     ORDER BY seq ASC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ rows, total, page: pageAdj, pageSize });
});

app.patch("/api/workspace/:id/status", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const status = clampStr(req.body?.status || "", 20);
  const allowed = ["已提交", "已确认", "已受理"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: "非法状态值" });
  }
  await run("UPDATE workspace_items SET status = ?, remark = ? WHERE id = ?", [status, `流程更新：${status}`, id]);
  await audit(req.user, "workspace_status", `id=${id} status=${status}`);
  const row = await get(
    "SELECT id, seq, name, id_no AS idNo, city, status, service, remark FROM workspace_items WHERE id = ?",
    [id]
  );
  return res.json({ row });
});

app.get("/api/employees", auth("admin"), async (req, res) => {
  const q = clampStr(req.query.q || "", 80);
  const status = clampStr(req.query.status || "", 20);
  const sortBy = clampStr(req.query.sortBy || "id", 20);
  const sortDir = String(req.query.sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const sortFieldMap = { id: "id", hireDate: "hire_date", name: "name", status: "status" };
  const orderBy = sortFieldMap[sortBy] || "id";
  const where = [];
  const params = [];
  if (q) {
    where.push("(name LIKE ? OR id_no LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all(
    `SELECT id, name, id_no AS idNo, mobile, gender, status, hire_date AS hireDate, city, social_city AS socialCity,
            employment_type AS employmentType, probation_end AS probationEnd, offboard_date AS offboardDate,
            current_company_id AS currentCompanyId, current_project_id AS currentProjectId
     FROM employees ${whereSql}
     ORDER BY ${orderBy} ${sortDir}`,
    params
  );
  res.json({ rows });
});

app.post("/api/employees", auth("admin"), async (req, res) => {
  const b = req.body || {};
  const name = clampStr(b.name, 80);
  const idNo = clampStr(b.idNo, 24);
  if (!name || !idNo) return res.status(400).json({ message: "姓名与证件号码必填" });
  const status = clampStr(b.status || "待入职", 20);
  if (!EMPLOYEE_STATUS.includes(status)) return res.status(400).json({ message: "员工状态非法" });
  const employmentType = clampStr(b.employmentType || "灵活用工", 20);
  if (!EMPLOYMENT_TYPE.includes(employmentType)) return res.status(400).json({ message: "用工类型非法" });
  await run(
    "INSERT INTO employees (name, id_no, mobile, gender, status, hire_date, city, social_city, employment_type, probation_end, offboard_date, current_company_id, current_project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      idNo,
      clampStr(b.mobile, 20),
      clampStr(b.gender, 10),
      status,
      clampStr(b.hireDate, 20),
      clampStr(b.city, 40),
      clampStr(b.socialCity, 40),
      employmentType,
      clampStr(b.probationEnd, 20),
      clampStr(b.offboardDate, 20),
      b.currentCompanyId ? Number(b.currentCompanyId) : null,
      b.currentProjectId ? Number(b.currentProjectId) : null
    ]
  );
  const row = await get(
    `SELECT id, name, id_no AS idNo, mobile, gender, status, hire_date AS hireDate, city, social_city AS socialCity,
            employment_type AS employmentType, probation_end AS probationEnd, offboard_date AS offboardDate,
            current_company_id AS currentCompanyId, current_project_id AS currentProjectId
     FROM employees WHERE id = last_insert_rowid()`
  );
  await run(
    "INSERT INTO employee_events (employee_id, event_type, to_status, effective_date, note, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [row.id, "入职建档", row.status, row.hireDate || null, "员工档案创建", req.user?.username || "system"]
  );
  await audit(req.user, "employee_create", `id=${row.id} name=${name}`);
  res.status(201).json({ row });
});

app.patch("/api/employees/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if (b.status && !EMPLOYEE_STATUS.includes(clampStr(b.status, 20))) {
    return res.status(400).json({ message: "员工状态非法" });
  }
  if (b.employmentType && !EMPLOYMENT_TYPE.includes(clampStr(b.employmentType, 20))) {
    return res.status(400).json({ message: "用工类型非法" });
  }
  await run(
    `UPDATE employees SET name=?, id_no=?, mobile=?, gender=?, status=?, hire_date=?, city=?, social_city=?,
     employment_type=?, probation_end=?, offboard_date=?, current_company_id=?, current_project_id=? WHERE id=?`,
    [
      clampStr(b.name, 80),
      clampStr(b.idNo, 24),
      clampStr(b.mobile, 20),
      clampStr(b.gender, 10),
      clampStr(b.status, 20),
      clampStr(b.hireDate, 20),
      clampStr(b.city, 40),
      clampStr(b.socialCity, 40),
      clampStr(b.employmentType, 20),
      clampStr(b.probationEnd, 20),
      clampStr(b.offboardDate, 20),
      b.currentCompanyId ? Number(b.currentCompanyId) : null,
      b.currentProjectId ? Number(b.currentProjectId) : null,
      id
    ]
  );
  await audit(req.user, "employee_update", `id=${id}`);
  const row = await get(
    `SELECT id, name, id_no AS idNo, mobile, gender, status, hire_date AS hireDate, city, social_city AS socialCity,
            employment_type AS employmentType, probation_end AS probationEnd, offboard_date AS offboardDate,
            current_company_id AS currentCompanyId, current_project_id AS currentProjectId
     FROM employees WHERE id = ?`,
    [id]
  );
  res.json({ row });
});

app.delete("/api/employees/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  await run("DELETE FROM employees WHERE id = ?", [id]);
  await audit(req.user, "employee_delete", `id=${id}`);
  res.json({ ok: true });
});

app.get("/api/contracts", auth("admin"), async (req, res) => {
  const rows = await all(
    "SELECT id, target, type, material, name, id_no AS idNo, employment_status AS employmentStatus, sign_status AS signStatus, done_time AS doneTime, contract_end AS contractEnd FROM contracts ORDER BY id DESC"
  );
  res.json({ rows });
});

app.post("/api/contracts", auth("admin"), async (req, res) => {
  const b = req.body || {};
  await run(
    "INSERT INTO contracts (target, type, material, name, id_no, employment_status, sign_status, done_time, contract_end) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      clampStr(b.target, 80),
      clampStr(b.type, 80),
      clampStr(b.material, 120),
      clampStr(b.name, 80),
      clampStr(b.idNo, 24),
      clampStr(b.employmentStatus, 40),
      clampStr(b.signStatus, 40),
      clampStr(b.doneTime, 40),
      clampStr(b.contractEnd, 40)
    ]
  );
  const row = await get(
    "SELECT id, target, type, material, name, id_no AS idNo, employment_status AS employmentStatus, sign_status AS signStatus, done_time AS doneTime, contract_end AS contractEnd FROM contracts WHERE id = last_insert_rowid()"
  );
  await audit(req.user, "contract_create", `id=${row.id}`);
  res.status(201).json({ row });
});

app.patch("/api/contracts/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  await run(
    `UPDATE contracts SET target=?, type=?, material=?, name=?, id_no=?, employment_status=?, sign_status=?, done_time=?, contract_end=? WHERE id=?`,
    [
      clampStr(b.target, 80),
      clampStr(b.type, 80),
      clampStr(b.material, 120),
      clampStr(b.name, 80),
      clampStr(b.idNo, 24),
      clampStr(b.employmentStatus, 40),
      clampStr(b.signStatus, 40),
      clampStr(b.doneTime, 40),
      clampStr(b.contractEnd, 40),
      id
    ]
  );
  await audit(req.user, "contract_update", `id=${id}`);
  const row = await get(
    "SELECT id, target, type, material, name, id_no AS idNo, employment_status AS employmentStatus, sign_status AS signStatus, done_time AS doneTime, contract_end AS contractEnd FROM contracts WHERE id = ?",
    [id]
  );
  res.json({ row });
});

app.delete("/api/contracts/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  await run("DELETE FROM contracts WHERE id = ?", [id]);
  await audit(req.user, "contract_delete", `id=${id}`);
  res.json({ ok: true });
});

app.get("/api/invoices", auth("admin"), async (req, res) => {
  const rows = await all(
    "SELECT id, no, customer_name AS customerName, amount, month, status, action FROM invoices ORDER BY id DESC"
  );
  res.json({ rows });
});

app.post("/api/invoices", auth("admin"), async (req, res) => {
  const b = req.body || {};
  await run("INSERT INTO invoices (no, customer_name, amount, month, status, action) VALUES (?,?,?,?,?,?)", [
    clampStr(b.no, 40),
    clampStr(b.customerName, 120),
    clampStr(b.amount, 40),
    clampStr(b.month, 20),
    clampStr(b.status || "未开票", 20),
    clampStr(b.action || "-", 20)
  ]);
  const row = await get(
    "SELECT id, no, customer_name AS customerName, amount, month, status, action FROM invoices WHERE id = last_insert_rowid()"
  );
  await audit(req.user, "invoice_create", `id=${row.id}`);
  res.status(201).json({ row });
});

app.patch("/api/invoices/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  await run("UPDATE invoices SET no=?, customer_name=?, amount=?, month=?, status=?, action=? WHERE id=?", [
    clampStr(b.no, 40),
    clampStr(b.customerName, 120),
    clampStr(b.amount, 40),
    clampStr(b.month, 20),
    clampStr(b.status, 20),
    clampStr(b.action, 20),
    id
  ]);
  await audit(req.user, "invoice_update", `id=${id}`);
  const row = await get("SELECT id, no, customer_name AS customerName, amount, month, status, action FROM invoices WHERE id = ?", [id]);
  res.json({ row });
});

app.delete("/api/invoices/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  await run("DELETE FROM invoices WHERE id = ?", [id]);
  await audit(req.user, "invoice_delete", `id=${id}`);
  res.json({ ok: true });
});

app.get("/api/companies", auth("admin"), async (req, res) => {
  const rows = await all(
    "SELECT id, name, code, city, service_type AS serviceType, status FROM companies ORDER BY id ASC"
  );
  res.json({ rows });
});

app.post("/api/companies", auth("admin"), async (req, res) => {
  const b = req.body || {};
  const name = clampStr(b.name, 120);
  const code = clampStr(b.code, 40);
  if (!name || !code) return res.status(400).json({ message: "企业名称与客户编号必填" });
  await run("INSERT INTO companies (name, code, city, service_type, status) VALUES (?,?,?,?,?)", [
    name,
    code,
    clampStr(b.city, 40),
    clampStr(b.serviceType, 80),
    clampStr(b.status || "合作中", 40)
  ]);
  const row = await get(
    "SELECT id, name, code, city, service_type AS serviceType, status FROM companies WHERE id = last_insert_rowid()"
  );
  await audit(req.user, "company_create", `id=${row.id}`);
  res.status(201).json({ row });
});

app.patch("/api/companies/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  await run("UPDATE companies SET name=?, code=?, city=?, service_type=?, status=? WHERE id=?", [
    clampStr(b.name, 120),
    clampStr(b.code, 40),
    clampStr(b.city, 40),
    clampStr(b.serviceType, 80),
    clampStr(b.status, 40),
    id
  ]);
  await audit(req.user, "company_update", `id=${id}`);
  const row = await get("SELECT id, name, code, city, service_type AS serviceType, status FROM companies WHERE id = ?", [id]);
  res.json({ row });
});

app.delete("/api/companies/:id", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  await run("DELETE FROM companies WHERE id = ?", [id]);
  await audit(req.user, "company_delete", `id=${id}`);
  res.json({ ok: true });
});

app.get("/api/approvals", auth("admin"), async (req, res) => {
  const rows = await all(
    "SELECT id, no, type, applicant, submitted_at AS submittedAt, status, handler FROM approvals ORDER BY id DESC"
  );
  res.json({ rows });
});

app.patch("/api/approvals/:id/status", auth("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const status = clampStr(req.body?.status || "", 20);
  const allowed = ["已提交", "已确认", "已受理", "已驳回"];
  if (!allowed.includes(status)) return res.status(400).json({ message: "非法审批状态" });
  const reqRow = await get(
    "SELECT id, employee_id AS employeeId, request_type AS requestType, target_status AS targetStatus, payload, status AS reqStatus FROM approval_requests WHERE approval_ref = ?",
    [id]
  );
  if (reqRow && (status === "已确认" || status === "已受理")) {
    const prePayload = safeJsonParse(reqRow.payload, {});
    if (reqRow.requestType === "项目进场") {
      const projectId = Number(prePayload.projectId || 0);
      if (!projectId) return res.status(400).json({ message: "审批数据缺少 projectId" });
      const dup = await get(
        "SELECT id FROM project_assignments WHERE employee_id = ? AND project_id = ? AND (status IS NULL OR status != '已退出')",
        [reqRow.employeeId, projectId]
      );
      if (dup) return res.status(409).json({ message: "该员工已在该项目在岗，无法重复通过进场审批" });
    }
  }
  await run("UPDATE approvals SET status = ? WHERE id = ?", [status, id]);
  await audit(req.user, "approval_status", `id=${id} status=${status}`);
  if (reqRow) {
    await run(
      "UPDATE approval_requests SET status = ?, approved_by = ?, approved_at = datetime('now','localtime') WHERE id = ?",
      [status, req.user?.username || "admin", reqRow.id]
    );
    if (status === "已确认" || status === "已受理") {
      const payload = safeJsonParse(reqRow.payload, {});
      const empId = reqRow.employeeId;
      const rt = reqRow.requestType;

      if (rt === "项目进场") {
        const projectId = Number(payload.projectId || 0);
        if (!projectId) return res.status(400).json({ message: "审批数据缺少 projectId" });
        const proj = await get("SELECT id, name FROM projects WHERE id = ?", [projectId]);
        if (!proj) return res.status(404).json({ message: "项目不存在" });
        const startDate = clampStr(payload.effectiveDate || "", 20) || null;
        await run(
          "INSERT INTO project_assignments (project_id, employee_id, company_id, role_name, status, start_date, is_primary) VALUES (?, ?, ?, ?, ?, ?, 1)",
          [
            projectId,
            empId,
            payload.companyId ? Number(payload.companyId) : null,
            clampStr(payload.roleName || "项目成员", 40),
            "在岗",
            startDate
          ]
        );
        await run("UPDATE employees SET current_project_id = ? WHERE id = ?", [projectId, empId]);
        await run(
          "INSERT INTO employee_events (employee_id, event_type, from_status, to_status, effective_date, approval_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            empId,
            "项目进场",
            "",
            proj.name || String(projectId),
            startDate,
            id,
            clampStr(payload.note || "", 200),
            req.user?.username || "admin"
          ]
        );
        await audit(req.user, "project_join_applied", `emp=${empId} project=${projectId}`);
      } else if (rt === "项目退场") {
        const empRow = await get("SELECT id, current_project_id FROM employees WHERE id = ?", [empId]);
        if (!empRow) return res.status(404).json({ message: "员工不存在" });
        let projectId = Number(payload.projectId || 0) || empRow.current_project_id || 0;
        if (!projectId) return res.status(400).json({ message: "无关联项目可退场" });
        const endDate = clampStr(payload.endDate || payload.effectiveDate || "", 20) || null;
        await run(
          "UPDATE project_assignments SET status = '已退出', end_date = COALESCE(?, date('now','localtime')) WHERE employee_id = ? AND project_id = ? AND (status IS NULL OR status = '在岗')",
          [endDate, empId, projectId]
        );
        await run(
          "UPDATE employees SET current_project_id = CASE WHEN current_project_id = ? THEN NULL ELSE current_project_id END WHERE id = ?",
          [projectId, empId]
        );
        await run(
          "INSERT INTO employee_events (employee_id, event_type, from_status, to_status, effective_date, approval_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [empId, "项目退场", String(projectId), "已退出", endDate, id, clampStr(payload.note || "", 200), req.user?.username || "admin"]
        );
        await audit(req.user, "project_leave_applied", `emp=${empId} project=${projectId}`);
      } else if (rt === "签约企业变更") {
        const companyId = Number(payload.companyId || 0);
        if (!companyId) return res.status(400).json({ message: "审批数据缺少 companyId" });
        const co = await get("SELECT id, name FROM companies WHERE id = ?", [companyId]);
        if (!co) return res.status(404).json({ message: "企业不存在" });
        await run(
          "UPDATE employee_company_assignments SET end_date = date('now','localtime'), status = '已结束' WHERE employee_id = ? AND end_date IS NULL",
          [empId]
        );
        await run(
          "INSERT INTO employee_company_assignments (employee_id, company_id, start_date, status, approval_id) VALUES (?, ?, date('now','localtime'), '有效', ?)",
          [empId, companyId, id]
        );
        await run("UPDATE employees SET current_company_id = ? WHERE id = ?", [companyId, empId]);
        await run(
          "INSERT INTO employee_events (employee_id, event_type, from_status, to_status, effective_date, approval_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            empId,
            "签约企业变更",
            "",
            co.name || String(companyId),
            clampStr(payload.effectiveDate || "", 20),
            id,
            clampStr(payload.note || "", 200),
            req.user?.username || "admin"
          ]
        );
        await audit(req.user, "company_change_applied", `emp=${empId} company=${companyId}`);
      } else if (["入职手续", "转正", "人事异动", "离职申请"].includes(rt)) {
        const employee = await get("SELECT id, status FROM employees WHERE id = ?", [empId]);
        if (employee && EMPLOYEE_STATUS.includes(reqRow.targetStatus)) {
          const fromStatus = clampStr(employee.status || "", 20);
          const allowedNext = STATUS_TRANSITIONS[fromStatus] || [];
          if (!allowedNext.includes(reqRow.targetStatus)) {
            return res.status(409).json({ message: `审批生效失败，状态已变化：${fromStatus} 不能流转到 ${reqRow.targetStatus}` });
          }
          await run(
            "UPDATE employees SET status = ?, offboard_date = COALESCE(?, offboard_date), current_project_id = COALESCE(?, current_project_id), current_company_id = COALESCE(?, current_company_id) WHERE id = ?",
            [
              reqRow.targetStatus,
              clampStr(payload.offboardDate || "", 20) || null,
              payload.currentProjectId ? Number(payload.currentProjectId) : null,
              payload.currentCompanyId ? Number(payload.currentCompanyId) : null,
              empId
            ]
          );
          await run(
            "INSERT INTO employee_events (employee_id, event_type, from_status, to_status, effective_date, approval_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              empId,
              rt,
              employee.status || "",
              reqRow.targetStatus,
              clampStr(payload.effectiveDate || "", 20),
              id,
              clampStr(payload.note || "", 200),
              req.user?.username || "admin"
            ]
          );
        }
      }
    }
  }
  const row = await get(
    "SELECT id, no, type, applicant, submitted_at AS submittedAt, status, handler FROM approvals WHERE id = ?",
    [id]
  );
  res.json({ row });
});

app.post("/api/employees/:id/lifecycle-request", auth("admin"), async (req, res) => {
  const employeeId = Number(req.params.id);
  const b = req.body || {};
  const requestType = clampStr(b.requestType, 20);
  const targetStatus = clampStr(b.targetStatus, 20);
  const allowedType = ["转正", "人事异动", "离职申请", "入职手续"];
  if (!allowedType.includes(requestType)) return res.status(400).json({ message: "流程类型非法" });
  if (!EMPLOYEE_STATUS.includes(targetStatus)) return res.status(400).json({ message: "目标状态非法" });
  const employee = await get("SELECT id, name, status FROM employees WHERE id = ?", [employeeId]);
  if (!employee) return res.status(404).json({ message: "员工不存在" });
  const fromStatus = clampStr(employee.status || "", 20);
  const allowedNext = STATUS_TRANSITIONS[fromStatus] || [];
  if (!allowedNext.includes(targetStatus)) {
    return res.status(400).json({ message: `非法状态流转：${fromStatus || "未知"} -> ${targetStatus}` });
  }
  const approvalNo = `AP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  await run(
    "INSERT INTO approvals (no, type, applicant, submitted_at, status, handler) VALUES (?, ?, ?, datetime('now','localtime'), ?, ?)",
    [approvalNo, requestType, employee.name, "已提交", "审批中心"]
  );
  const approval = await get("SELECT id, no, type, applicant, submitted_at AS submittedAt, status, handler FROM approvals WHERE id = last_insert_rowid()");
  const payload = {
    note: clampStr(b.note || "", 200),
    effectiveDate: clampStr(b.effectiveDate || "", 20),
    offboardDate: clampStr(b.offboardDate || "", 20),
    currentProjectId: b.currentProjectId ? Number(b.currentProjectId) : null,
    currentCompanyId: b.currentCompanyId ? Number(b.currentCompanyId) : null
  };
  await run(
    "INSERT INTO approval_requests (employee_id, request_type, target_status, payload, status, approval_ref) VALUES (?, ?, ?, ?, ?, ?)",
    [employeeId, requestType, targetStatus, JSON.stringify(payload), "已提交", approval.id]
  );
  await audit(req.user, "employee_lifecycle_request", `employee=${employeeId} type=${requestType} to=${targetStatus}`);
  return res.status(201).json({ approval });
});

app.post("/api/employees/:id/project-request", auth("admin"), async (req, res) => {
  const employeeId = Number(req.params.id);
  const b = req.body || {};
  const action = clampStr(b.action || "", 10);
  if (action !== "join" && action !== "leave") return res.status(400).json({ message: "action 须为 join 或 leave" });
  const employee = await get("SELECT id, name, current_project_id FROM employees WHERE id = ?", [employeeId]);
  if (!employee) return res.status(404).json({ message: "员工不存在" });
  const typeLabel = action === "join" ? "项目进场" : "项目退场";
  const payload = {
    action,
    projectId: b.projectId ? Number(b.projectId) : null,
    effectiveDate: clampStr(b.effectiveDate || "", 20),
    endDate: clampStr(b.endDate || "", 20),
    roleName: clampStr(b.roleName || "", 40),
    companyId: b.companyId ? Number(b.companyId) : null,
    note: clampStr(b.note || "", 200)
  };
  if (action === "join" && !payload.projectId) return res.status(400).json({ message: "进场须指定项目" });
  const approvalNo = `AP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  await run(
    "INSERT INTO approvals (no, type, applicant, submitted_at, status, handler) VALUES (?, ?, ?, datetime('now','localtime'), ?, ?)",
    [approvalNo, typeLabel, employee.name, "已提交", "审批中心"]
  );
  const approval = await get("SELECT id, no, type, applicant, submitted_at AS submittedAt, status, handler FROM approvals WHERE id = last_insert_rowid()");
  await run(
    "INSERT INTO approval_requests (employee_id, request_type, target_status, payload, status, approval_ref) VALUES (?, ?, ?, ?, ?, ?)",
    [employeeId, typeLabel, "-", JSON.stringify(payload), "已提交", approval.id]
  );
  await audit(req.user, "employee_project_request", `employee=${employeeId} ${typeLabel}`);
  return res.status(201).json({ approval });
});

app.post("/api/employees/:id/company-request", auth("admin"), async (req, res) => {
  const employeeId = Number(req.params.id);
  const b = req.body || {};
  const companyId = Number(b.companyId || 0);
  if (!companyId) return res.status(400).json({ message: "请选择签约企业" });
  const co = await get("SELECT id FROM companies WHERE id = ?", [companyId]);
  if (!co) return res.status(404).json({ message: "企业不存在" });
  const employee = await get("SELECT id, name FROM employees WHERE id = ?", [employeeId]);
  if (!employee) return res.status(404).json({ message: "员工不存在" });
  const payload = {
    companyId,
    effectiveDate: clampStr(b.effectiveDate || "", 20),
    note: clampStr(b.note || "", 200)
  };
  const approvalNo = `AP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  await run(
    "INSERT INTO approvals (no, type, applicant, submitted_at, status, handler) VALUES (?, ?, ?, datetime('now','localtime'), ?, ?)",
    [approvalNo, "签约企业变更", employee.name, "已提交", "审批中心"]
  );
  const approval = await get("SELECT id, no, type, applicant, submitted_at AS submittedAt, status, handler FROM approvals WHERE id = last_insert_rowid()");
  await run(
    "INSERT INTO approval_requests (employee_id, request_type, target_status, payload, status, approval_ref) VALUES (?, ?, ?, ?, ?, ?)",
    [employeeId, "签约企业变更", "-", JSON.stringify(payload), "已提交", approval.id]
  );
  await audit(req.user, "employee_company_request", `employee=${employeeId} company=${companyId}`);
  return res.status(201).json({ approval });
});

app.get("/api/employees/:id/project-history", auth("admin"), async (req, res) => {
  const employeeId = Number(req.params.id);
  const rows = await all(
    `SELECT pa.id AS assignmentId, pa.project_id AS projectId, p.name AS projectName, p.code AS projectCode,
            pa.role_name AS roleName, pa.status, pa.start_date AS startDate, pa.end_date AS endDate
     FROM project_assignments pa
     JOIN projects p ON p.id = pa.project_id
     WHERE pa.employee_id = ?
     ORDER BY pa.id DESC`,
    [employeeId]
  );
  res.json({ rows });
});

app.get("/api/employees/:id/company-history", auth("admin"), async (req, res) => {
  const employeeId = Number(req.params.id);
  const rows = await all(
    `SELECT eca.id, eca.company_id AS companyId, c.name AS companyName, eca.start_date AS startDate, eca.end_date AS endDate, eca.status
     FROM employee_company_assignments eca
     JOIN companies c ON c.id = eca.company_id
     WHERE eca.employee_id = ?
     ORDER BY eca.id DESC`,
    [employeeId]
  );
  res.json({ rows });
});

app.get("/api/employee-events", auth("admin"), async (req, res) => {
  const employeeId = Number(req.query.employeeId || 0);
  const where = employeeId ? "WHERE ee.employee_id = ?" : "";
  const rows = await all(
    `SELECT ee.id, ee.employee_id AS employeeId, e.name AS employeeName, ee.event_type AS eventType,
            ee.from_status AS fromStatus, ee.to_status AS toStatus, ee.effective_date AS effectiveDate,
            ee.note, ee.created_by AS createdBy, ee.created_at AS createdAt
     FROM employee_events ee
     LEFT JOIN employees e ON e.id = ee.employee_id
     ${where}
     ORDER BY ee.id DESC
     LIMIT 200`,
    employeeId ? [employeeId] : []
  );
  res.json({ rows });
});

app.get("/api/projects", auth("admin"), async (req, res) => {
  const rows = await all(
    `SELECT p.id, p.name, p.code, p.client_company AS clientCompany, p.manager, p.status, p.start_date AS startDate, p.end_date AS endDate, p.remark,
            COUNT(pa.id) AS teamSize
     FROM projects p
     LEFT JOIN project_assignments pa ON pa.project_id = p.id AND (pa.status IS NULL OR pa.status != '已退出')
     GROUP BY p.id
     ORDER BY p.id DESC`
  );
  res.json({ rows });
});

app.post("/api/projects", auth("admin"), async (req, res) => {
  const b = req.body || {};
  const name = clampStr(b.name, 120);
  const code = clampStr(b.code, 40);
  if (!name || !code) return res.status(400).json({ message: "项目名称与项目编码必填" });
  await run(
    "INSERT INTO projects (name, code, client_company, manager, status, start_date, end_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      code,
      clampStr(b.clientCompany, 120),
      clampStr(b.manager, 80),
      clampStr(b.status || "筹备中", 20),
      clampStr(b.startDate, 20),
      clampStr(b.endDate, 20),
      clampStr(b.remark, 200)
    ]
  );
  const row = await get(
    "SELECT id, name, code, client_company AS clientCompany, manager, status, start_date AS startDate, end_date AS endDate, remark FROM projects WHERE id = last_insert_rowid()"
  );
  await audit(req.user, "project_create", `project=${row.id}`);
  res.status(201).json({ row });
});

app.get("/api/settings", auth("admin"), async (req, res) => {
  const rows = await all("SELECT key, value FROM app_settings");
  const out = {};
  rows.forEach((r) => {
    out[r.key] = r.value === "1";
  });
  res.json(out);
});

app.put("/api/settings", auth("admin"), async (req, res) => {
  const b = req.body || {};
  const entries = [
    ["mfa_enabled", b.mfaEnabled ? "1" : "0"],
    ["approval_notify", b.approvalNotify ? "1" : "0"],
    ["policy_auto_sync", b.policyAutoSync ? "1" : "0"],
    ["social_api_placeholder", b.socialApiPlaceholder ? "1" : "0"],
    ["payment_api_placeholder", b.paymentApiPlaceholder ? "1" : "0"]
  ];
  for (const [k, v] of entries) {
    await run("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [k, v]);
  }
  await audit(req.user, "settings_update", JSON.stringify(b));
  const rows = await all("SELECT key, value FROM app_settings");
  const out = {};
  rows.forEach((r) => {
    out[r.key] = r.value === "1";
  });
  res.json(out);
});

app.get("/api/audit-logs", auth("admin"), async (req, res) => {
  const rows = await all(
    "SELECT id, username, action, detail, created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT 100"
  );
  res.json({ rows });
});

registerStaffingRoutes(app, { run, get, all, audit, clampStr, auth, safeJsonParse, withTransaction });
registerAiRoutes(app, { auth, clampStr });

const staticDir = __dirname;
app.use(
  express.static(staticDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    }
  })
);

app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "接口不存在" });
  }
  res.sendFile(path.join(staticDir, "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      process.stdout.write(`Server running at http://localhost:${PORT} (db: ${DB_PATH})\n`);
    });
  })
  .catch((error) => {
    process.stderr.write(`DB init failed: ${error.message}\n`);
    process.exit(1);
  });
