const fs = require("fs");
const path = require("path");
const os = require("os");
const sqlite3 = require("sqlite3").verbose();

const ROOT = path.join(__dirname, "../..");
const DEFAULT_DB = path.join(ROOT, "eos_hr.db");

function copyTempDb() {
  const tmp = path.join(os.tmpdir(), `eos-hr-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  fs.copyFileSync(DEFAULT_DB, tmp);
  return tmp;
}

function removeDb(dbPath) {
  try {
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  } catch {
    /* ignore */
  }
}

function queryCounts(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM staffing_requirements) AS staffing_requirements,
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM approvals) AS approvals,
        (SELECT COUNT(*) FROM employees) AS employees,
        (SELECT COUNT(*) FROM users) AS users
    `;
    db.get(sql, [], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

module.exports = { ROOT, DEFAULT_DB, copyTempDb, removeDb, queryCounts };
