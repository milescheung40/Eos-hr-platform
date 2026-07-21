#!/usr/bin/env node
/**
 * 清理自动化测试产生的用工需求/项目/审批，不影响正式演示员工与企业数据。
 * 使用前请确保已备份 eos_hr.db（npm run backup:db）。
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "eos_hr.db");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  const testReqs = await all(
    `SELECT id FROM staffing_requirements
     WHERE requirement_no LIKE 'SR%'
        OR converted_project_id IS NOT NULL
        OR status IN ('待确认','已确认','已转项目')`
  );
  const reqIds = testReqs.map((r) => r.id);
  if (reqIds.length) {
    const ph = reqIds.map(() => "?").join(",");
    await run(`DELETE FROM staffing_requirement_candidates WHERE requirement_id IN (${ph})`, reqIds);
    await run(`DELETE FROM staffing_requirement_events WHERE requirement_id IN (${ph})`, reqIds);
    await run(`DELETE FROM staffing_requirements WHERE id IN (${ph})`, reqIds);
  }

  await run("DELETE FROM project_assignments WHERE project_id IN (SELECT id FROM projects WHERE code LIKE 'PRJ-AI-%')");
  await run("DELETE FROM projects WHERE code LIKE 'PRJ-AI-%'");
  await run("DELETE FROM approvals WHERE no LIKE 'AP-SR-%'");

  console.log(`reset-demo-data: removed ${reqIds.length} staffing requirement(s), PRJ-AI-* projects, AP-SR-* approvals`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.close());
