#!/usr/bin/env python3
"""Safe importer for validated synthetic talent pool JSON into employees."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "eos_hr.db"
JSON_PATH = ROOT / "data" / "generated" / "talent_pool_candidates.json"
VALIDATE_SCRIPT = ROOT / "scripts" / "validate_talent_pool.py"
BACKUP_DIR = ROOT / "backups"

EXPECTED_COUNT = 270
DEMO_PREFIX = "DEMO"
TALENT_STATUS = "待入职"

APPROVED_TITLES = [
    "保安",
    "保洁",
    "商务司机",
    "行政专员",
    "人事专员",
    "出纳",
    "会计",
    "采购专员",
    "仓库管理员",
    "销售专员",
    "客户经理",
    "市场专员",
    "客服专员",
    "运营专员",
    "运维工程师",
    "前端开发",
    "后端开发",
    "测试工程师",
    "网络工程师",
    "UI设计师",
    "操作工",
    "质检专员",
    "电工",
    "项目经理",
    "资料员",
    "法务专员",
    "文案策划",
]

EMPLOYEE_COLUMNS = [
    "id",
    "name",
    "id_no",
    "mobile",
    "gender",
    "status",
    "hire_date",
    "city",
    "social_city",
    "employment_type",
    "probation_end",
    "offboard_date",
    "current_company_id",
    "current_project_id",
    "job_title",
    "skills",
    "years_experience",
    "certificates",
    "available_date",
    "availability_status",
    "preferred_city",
    "salary_range",
    "project_experience",
    "is_talent_pool",
]

IMPORT_FIELDS = [
    "name",
    "id_no",
    "mobile",
    "gender",
    "status",
    "city",
    "social_city",
    "employment_type",
    "job_title",
    "years_experience",
    "skills",
    "certificates",
    "available_date",
    "availability_status",
    "preferred_city",
    "salary_range",
    "project_experience",
    "is_talent_pool",
]


def fail(msg: str) -> None:
    print(f"IMPORT FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def run_validation() -> None:
    """Validate JSON payload before apply (no regeneration; avoids generator deps)."""
    if not VALIDATE_SCRIPT.is_file():
        fail(f"validation script missing: {VALIDATE_SCRIPT}")
    import importlib.util

    spec = importlib.util.spec_from_file_location("validate_talent_pool", VALIDATE_SCRIPT)
    if spec is None or spec.loader is None:
        fail("could not load validation module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    templates = module.load_templates()
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    module.validate_json_payload(payload, templates)
    print("VALIDATION OK (import preflight)")


def load_candidates() -> list[dict[str, Any]]:
    if not JSON_PATH.is_file():
        fail(f"missing JSON at {JSON_PATH}")
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != EXPECTED_COUNT:
        fail(
            f"expected {EXPECTED_COUNT} candidates, "
            f"got {len(candidates) if isinstance(candidates, list) else 'invalid'}"
        )
    return candidates


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def normalize_json_text(raw: Any) -> str:
    if raw is None:
        return json_dumps([])
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return raw
        return json_dumps(parsed)
    return json_dumps(raw)


def normalize_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def candidate_to_row(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": candidate["name"],
        "id_no": candidate["idNo"],
        "mobile": candidate["mobile"],
        "gender": candidate["gender"],
        "status": TALENT_STATUS,
        "city": candidate["currentCity"],
        "social_city": candidate["currentCity"],
        "employment_type": candidate["employmentType"],
        "job_title": candidate["jobTitle"],
        "years_experience": float(candidate["yearsExperience"]),
        "skills": json_dumps(candidate["skills"]),
        "certificates": json_dumps(candidate["certificates"]),
        "available_date": candidate["availableDate"],
        "availability_status": candidate["availabilityStatus"],
        "preferred_city": candidate["preferredCity"],
        "salary_range": candidate["salaryRange"],
        "project_experience": candidate["projectExperience"],
        "is_talent_pool": 1,
    }


def row_values_equal(existing: sqlite3.Row, desired: dict[str, Any]) -> bool:
    for field in IMPORT_FIELDS:
        existing_val = existing[field]
        desired_val = desired[field]
        if field in ("skills", "certificates"):
            if normalize_json_text(existing_val) != normalize_json_text(desired_val):
                return False
            continue
        if field == "years_experience":
            if normalize_float(existing_val) != normalize_float(desired_val):
                return False
            continue
        if field == "is_talent_pool":
            if int(existing_val or 0) != int(desired_val):
                return False
            continue
        if (existing_val or "") != (desired_val or ""):
            return False
    return True


def fetch_employees(conn: sqlite3.Connection) -> dict[str, sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        f"SELECT {', '.join(EMPLOYEE_COLUMNS)} FROM employees ORDER BY id"
    ).fetchall()
    return {row["id_no"]: row for row in rows}


def snapshot_non_demo(rows: dict[str, sqlite3.Row]) -> dict[str, str]:
    snapshot: dict[str, str] = {}
    for id_no, row in rows.items():
        if id_no.startswith(DEMO_PREFIX):
            continue
        payload = {col: row[col] for col in EMPLOYEE_COLUMNS if col != "id"}
        snapshot[id_no] = hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
    return snapshot


def plan_import(
    candidates: list[dict[str, Any]], existing: dict[str, sqlite3.Row]
) -> tuple[
    list[dict[str, Any]],
    list[tuple[sqlite3.Row, dict[str, Any]]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    inserts: list[dict[str, Any]] = []
    updates: list[tuple[sqlite3.Row, dict[str, Any]]] = []
    unchanged: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    for candidate in candidates:
        desired = candidate_to_row(candidate)
        id_no = desired["id_no"]
        if not id_no.startswith(DEMO_PREFIX):
            conflicts.append({"id_no": id_no, "reason": "id_no does not start with DEMO"})
            continue

        current = existing.get(id_no)
        if current is None:
            inserts.append(desired)
            continue

        if not str(current["id_no"]).startswith(DEMO_PREFIX):
            conflicts.append({"id_no": id_no, "reason": "existing row is not DEMO-protected scope"})
            continue

        if row_values_equal(current, desired):
            unchanged.append(desired)
        else:
            updates.append((current, desired))

    return inserts, updates, unchanged, conflicts


def backup_database(db_path: Path) -> Path:
    if not db_path.is_file():
        fail(f"database not found: {db_path}")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"eos_hr_{stamp}.db"
    src = sqlite3.connect(str(db_path))
    dest = sqlite3.connect(str(backup_path))
    try:
        with dest:
            src.backup(dest)
    finally:
        dest.close()
        src.close()
    return backup_path


def apply_import(
    conn: sqlite3.Connection,
    inserts: list[dict[str, Any]],
    updates: list[tuple[sqlite3.Row, dict[str, Any]]],
) -> None:
    insert_sql = f"""
        INSERT INTO employees ({", ".join(IMPORT_FIELDS)})
        VALUES ({", ".join("?" for _ in IMPORT_FIELDS)})
    """
    update_sql = f"""
        UPDATE employees SET
          {", ".join(f"{field}=?" for field in IMPORT_FIELDS if field != "id_no")}
        WHERE id_no = ? AND id_no LIKE '{DEMO_PREFIX}%'
    """
    for row in inserts:
        conn.execute(insert_sql, [row[field] for field in IMPORT_FIELDS])
    for _existing, desired in updates:
        values = [desired[field] for field in IMPORT_FIELDS if field != "id_no"]
        values.append(desired["id_no"])
        conn.execute(update_sql, values)


def verify_post_apply(conn: sqlite3.Connection, before_non_demo: dict[str, str]) -> None:
    rows = fetch_employees(conn)
    after_non_demo = snapshot_non_demo(rows)
    if before_non_demo != after_non_demo:
        fail("non-DEMO employee rows changed after apply")

    total = conn.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    talent_pool = conn.execute("SELECT COUNT(*) FROM employees WHERE is_talent_pool = 1").fetchone()[0]
    demo_count = conn.execute(
        "SELECT COUNT(*) FROM employees WHERE id_no LIKE ?",
        (f"{DEMO_PREFIX}%",),
    ).fetchone()[0]
    visible = conn.execute(
        """
        SELECT COUNT(*) FROM employees
        WHERE is_talent_pool = 1 AND status IN ('在职','试用期','待入职')
          AND id_no LIKE ?
        """,
        (f"{DEMO_PREFIX}%",),
    ).fetchone()[0]

    role_rows = conn.execute(
        """
        SELECT job_title, COUNT(*) AS c FROM employees
        WHERE id_no LIKE ? GROUP BY job_title
        """,
        (f"{DEMO_PREFIX}%",),
    ).fetchall()
    role_counts = {row[0]: row[1] for row in role_rows}

    print("Post-apply verification:")
    print(f"  total employees: {total}")
    print(f"  talent pool (is_talent_pool=1): {talent_pool}")
    print(f"  DEMO rows: {demo_count}")
    print(f"  DEMO rows visible to staffingRoutes status filter: {visible}")
    print(f"  non-DEMO rows unchanged: {len(before_non_demo)}")

    if demo_count != EXPECTED_COUNT:
        fail(f"expected {EXPECTED_COUNT} DEMO rows, got {demo_count}")
    if visible != EXPECTED_COUNT:
        fail(f"expected {EXPECTED_COUNT} staffing-visible DEMO rows, got {visible}")

    for title in APPROVED_TITLES:
        count = role_counts.get(title, 0)
        if count != 10:
            fail(f"role {title!r} expected 10 DEMO rows, got {count}")
        print(f"  role {title}: {count}")


def report_plan(
    inserts: list[dict[str, Any]],
    updates: list[tuple[sqlite3.Row, dict[str, Any]]],
    unchanged: list[dict[str, Any]],
    conflicts: list[dict[str, Any]],
    protected_count: int,
    mode: str,
) -> None:
    print(f"Mode: {mode}")
    print(f"JSON: {JSON_PATH}")
    print(f"Database: {DB_PATH}")
    print(f"Candidates: {EXPECTED_COUNT}")
    print(f"Protected non-DEMO rows: {protected_count}")
    print(f"Planned inserts: {len(inserts)}")
    print(f"Planned updates: {len(updates)}")
    print(f"Unchanged: {len(unchanged)}")
    print(f"Conflicts: {len(conflicts)}")
    if conflicts:
        for item in conflicts[:5]:
            print(f"  conflict {item['id_no']}: {item['reason']}")
        if len(conflicts) > 5:
            print(f"  ... and {len(conflicts) - 5} more")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import synthetic talent pool into employees")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write to database (default is dry-run)",
    )
    args = parser.parse_args()

    if not DB_PATH.is_file():
        fail(f"database not found: {DB_PATH}")

    if args.apply:
        run_validation()

    candidates = load_candidates()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        existing = fetch_employees(conn)
        protected_snapshot = snapshot_non_demo(existing)
        inserts, updates, unchanged, conflicts = plan_import(candidates, existing)
        mode = "apply" if args.apply else "dry-run"
        report_plan(inserts, updates, unchanged, conflicts, len(protected_snapshot), mode)

        if conflicts:
            fail("conflicts detected; aborting")

        if len(inserts) + len(updates) + len(unchanged) != EXPECTED_COUNT:
            fail("plan does not cover all candidates")

        if not args.apply:
            return

        if len(inserts) == 0 and len(updates) == 0:
            verify_post_apply(conn, protected_snapshot)
            print("No-op OK: 0 inserts, 0 updates, 270 unchanged (skipped backup and writes)")
            return

        backup_path = backup_database(DB_PATH)
        print(f"Backup created: {backup_path}")

        conn.execute("BEGIN IMMEDIATE")
        try:
            apply_import(conn, inserts, updates)
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise

        verify_post_apply(conn, protected_snapshot)

        inserts2, updates2, unchanged2, conflicts2 = plan_import(candidates, fetch_employees(conn))
        report_plan(inserts2, updates2, unchanged2, conflicts2, len(protected_snapshot), "post-apply dry-run")
        if len(inserts2) != 0 or len(updates2) != 0 or len(unchanged2) != EXPECTED_COUNT or conflicts2:
            fail("post-apply idempotency check failed")
        print("Idempotency OK: 0 inserts, 0 updates, 270 unchanged")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
