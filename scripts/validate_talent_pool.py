#!/usr/bin/env python3
"""Validate generated synthetic talent pool JSON and CSV."""
from __future__ import annotations

import csv
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "data" / "job_templates.json"
OUTPUT_DIR = ROOT / "data" / "generated"
JSON_PATH = OUTPUT_DIR / "talent_pool_candidates.json"
CSV_PATH = OUTPUT_DIR / "talent_pool_candidates.csv"
GENERATOR_SCRIPT = ROOT / "scripts" / "generate_talent_pool.py"

GENERATOR_SEED = 20260730
PER_ROLE_COUNT = 10
EXPECTED_JOB_COUNT = 27
EXPECTED_CANDIDATE_COUNT = EXPECTED_JOB_COUNT * PER_ROLE_COUNT

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

ALLOWED_CATEGORIES = {
    "职能后勤",
    "业务销售",
    "IT技术通用岗",
    "实体生产通用岗",
    "项目管理/综合管理",
}

ALLOWED_CITIES = {
    "上海",
    "北京",
    "深圳",
    "广州",
    "杭州",
    "苏州",
    "南京",
    "成都",
    "武汉",
    "重庆",
}

REQUIRED_CANDIDATE_FIELDS = [
    "candidateCode",
    "isSynthetic",
    "dataLabel",
    "name",
    "idNo",
    "mobile",
    "email",
    "gender",
    "jobCode",
    "jobTitle",
    "jobCategory",
    "currentCity",
    "preferredCity",
    "yearsExperience",
    "skills",
    "certificates",
    "employmentType",
    "availableDate",
    "availabilityStatus",
    "salaryMin",
    "salaryMax",
    "salaryUnit",
    "salaryRange",
    "projectExperience",
    "summary",
]

ALLOWED_GENDERS = {"男", "女"}
ALLOWED_AVAILABILITY_STATUSES = {"可用", "已派驻", "不可用"}

DEMO_ID_RE = re.compile(r"^DEMO\d{10,16}$")
MASKED_MOBILE_RE = re.compile(r"^1[3-9]\d\*\*\*\*\d{4}$")
EMAIL_RE = re.compile(r"^[a-z0-9.]+@example\.test$")

BACKEND_STACK_MARKERS = [
    {"Java", "Spring"},
    {"Node.js", "Express"},
    {"Python", "Django"},
]

CSV_FIELDS = [
    "candidateCode",
    "isSynthetic",
    "dataLabel",
    "name",
    "idNo",
    "mobile",
    "email",
    "gender",
    "jobCode",
    "jobTitle",
    "jobCategory",
    "currentCity",
    "preferredCity",
    "yearsExperience",
    "skills",
    "certificates",
    "employmentType",
    "availableDate",
    "availabilityStatus",
    "salaryMin",
    "salaryMax",
    "salaryUnit",
    "salaryRange",
    "projectExperience",
    "summary",
    "primaryStack",
]

PROTECTED_PATHS = [
    ROOT / "eos_hr.db",
    ROOT / "lib" / "talentSeed.js",
    ROOT / "data" / "job_templates.json",
]


def fail(msg: str) -> None:
    print(f"VALIDATION FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_templates() -> dict[str, dict]:
    data = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    jobs = data.get("jobs", [])
    if len(jobs) != EXPECTED_JOB_COUNT:
        fail(f"template job count must be {EXPECTED_JOB_COUNT}, got {len(jobs)}")
    by_code = {job["jobCode"]: job for job in jobs}
    return by_code


def validate_top_level(payload: dict) -> None:
    if payload.get("schemaVersion") is None:
        fail("missing schemaVersion")
    if payload.get("generatorSeed") != GENERATOR_SEED:
        fail(f"generatorSeed must be {GENERATOR_SEED}")
    if payload.get("isSynthetic") is not True:
        fail("top-level isSynthetic must be true")
    if payload.get("candidateCount") != EXPECTED_CANDIDATE_COUNT:
        fail(f"candidateCount must be {EXPECTED_CANDIDATE_COUNT}")
    if payload.get("count") != EXPECTED_CANDIDATE_COUNT:
        fail(f"count must be {EXPECTED_CANDIDATE_COUNT}")
    if payload.get("perRoleCount") != PER_ROLE_COUNT:
        fail(f"perRoleCount must be {PER_ROLE_COUNT}")

    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != EXPECTED_CANDIDATE_COUNT:
        fail("candidates must be an array of length 270")


def validate_candidate(candidate: dict, template: dict) -> None:
    for field in REQUIRED_CANDIDATE_FIELDS:
        if field not in candidate:
            fail(f"{candidate.get('candidateCode', '?')} missing field {field}")

    if candidate["isSynthetic"] is not True:
        fail(f"{candidate['candidateCode']} isSynthetic must be true")

    if not DEMO_ID_RE.match(candidate["idNo"]):
        fail(f"{candidate['candidateCode']} idNo must be safe DEMO format")
    if len(candidate["idNo"]) == 18 and candidate["idNo"].isdigit():
        fail(f"{candidate['candidateCode']} idNo must not look like a valid PRC ID")

    if not MASKED_MOBILE_RE.match(candidate["mobile"]):
        fail(f"{candidate['candidateCode']} mobile must be masked demo format")
    if not EMAIL_RE.match(candidate["email"]):
        fail(f"{candidate['candidateCode']} email must use example.test")

    if candidate["gender"] not in ALLOWED_GENDERS:
        fail(f"{candidate['candidateCode']} invalid gender")

    if candidate["jobTitle"] != template["jobTitle"]:
        fail(f"{candidate['candidateCode']} jobTitle mismatch")
    if candidate["jobCategory"] != template["jobCategory"]:
        fail(f"{candidate['candidateCode']} jobCategory mismatch")
    if candidate["jobCategory"] not in ALLOWED_CATEGORIES:
        fail(f"{candidate['candidateCode']} invalid category")

    for city_field in ("currentCity", "preferredCity"):
        city = candidate[city_field]
        if city not in ALLOWED_CITIES:
            fail(f"{candidate['candidateCode']} {city_field} not allowed: {city!r}")
        if city not in template["cities"]:
            fail(f"{candidate['candidateCode']} {city_field} not in template cities")

    years = candidate["yearsExperience"]
    if not isinstance(years, int):
        fail(f"{candidate['candidateCode']} yearsExperience must be int")
    if not (template["experienceMin"] <= years <= template["experienceMax"]):
        fail(f"{candidate['candidateCode']} yearsExperience out of template bounds")

    if not isinstance(candidate["skills"], list) or not candidate["skills"]:
        fail(f"{candidate['candidateCode']} skills must be non-empty list")
    if not isinstance(candidate["certificates"], list):
        fail(f"{candidate['candidateCode']} certificates must be list")

    for cert in template["requiredCertificates"]:
        if cert not in candidate["certificates"]:
            fail(f"{candidate['candidateCode']} missing required certificate {cert!r}")

    allowed_optional = set(template["optionalCertificates"])
    for cert in candidate["certificates"]:
        if cert in template["requiredCertificates"]:
            continue
        if cert not in allowed_optional:
            fail(f"{candidate['candidateCode']} unexpected certificate {cert!r}")

    if candidate["employmentType"] not in template["employmentTypes"]:
        fail(f"{candidate['candidateCode']} employmentType not in template options")
    if candidate["availableDate"] not in template["availabilityOptions"]:
        fail(f"{candidate['candidateCode']} availableDate not in template options")
    if candidate["availabilityStatus"] not in ALLOWED_AVAILABILITY_STATUSES:
        fail(f"{candidate['candidateCode']} invalid availabilityStatus")

    salary_min = candidate["salaryMin"]
    salary_max = candidate["salaryMax"]
    if not isinstance(salary_min, int) or not isinstance(salary_max, int):
        fail(f"{candidate['candidateCode']} salary bounds must be int")
    if salary_min > salary_max:
        fail(f"{candidate['candidateCode']} salaryMin > salaryMax")
    if not (template["salaryMin"] <= salary_min <= template["salaryMax"]):
        fail(f"{candidate['candidateCode']} salaryMin out of template bounds")
    if not (template["salaryMin"] <= salary_max <= template["salaryMax"]):
        fail(f"{candidate['candidateCode']} salaryMax out of template bounds")
    if candidate["salaryUnit"] != template["salaryUnit"]:
        fail(f"{candidate['candidateCode']} salaryUnit mismatch")

    if candidate["jobTitle"] == "后端开发":
        skill_set = set(candidate["skills"])
        matched = [stack for stack in BACKEND_STACK_MARKERS if stack.issubset(skill_set)]
        if len(matched) != 1:
            fail(f"{candidate['candidateCode']} backend must have exactly one primary stack")
        if "primaryStack" not in candidate:
            fail(f"{candidate['candidateCode']} backend missing primaryStack")


def validate_json_payload(payload: dict, templates: dict[str, dict]) -> None:
    validate_top_level(payload)

    codes: set[str] = set()
    id_nos: set[str] = set()
    mobiles: set[str] = set()
    emails: set[str] = set()
    role_counts: Counter[str] = Counter()

    for candidate in payload["candidates"]:
        code = candidate["candidateCode"]
        if code in codes:
            fail(f"duplicate candidateCode {code}")
        codes.add(code)

        id_no = candidate["idNo"]
        if id_no in id_nos:
            fail(f"duplicate idNo {id_no}")
        id_nos.add(id_no)

        mobile = candidate["mobile"]
        if mobile in mobiles:
            fail(f"duplicate mobile {mobile}")
        mobiles.add(mobile)

        email = candidate["email"]
        if email in emails:
            fail(f"duplicate email {email}")
        emails.add(email)

        template = templates.get(candidate["jobCode"])
        if template is None:
            fail(f"unknown jobCode {candidate['jobCode']}")
        validate_candidate(candidate, template)
        role_counts[candidate["jobTitle"]] += 1

    if set(role_counts.keys()) != set(APPROVED_TITLES):
        fail("role title set mismatch")

    for title in APPROVED_TITLES:
        if role_counts[title] != PER_ROLE_COUNT:
            fail(f"role {title!r} must have {PER_ROLE_COUNT} candidates, got {role_counts[title]}")


def csv_row_to_candidate(row: dict) -> dict:
    candidate: dict = {}
    for field in CSV_FIELDS:
        raw = row.get(field, "")
        if field in ("skills", "certificates"):
            candidate[field] = json.loads(raw) if raw else []
        elif field == "isSynthetic":
            candidate[field] = raw.lower() == "true"
        elif field in ("salaryMin", "salaryMax", "yearsExperience"):
            candidate[field] = int(raw) if raw != "" else raw
        elif field == "primaryStack":
            if raw:
                candidate[field] = raw
        else:
            candidate[field] = raw
    return candidate


def validate_csv_matches_json(payload: dict) -> None:
    if not CSV_PATH.is_file():
        fail(f"missing CSV at {CSV_PATH}")

    with CSV_PATH.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != CSV_FIELDS:
            fail("CSV header mismatch")
        rows = list(reader)

    if len(rows) != EXPECTED_CANDIDATE_COUNT:
        fail(f"CSV row count must be {EXPECTED_CANDIDATE_COUNT}, got {len(rows)}")

    csv_candidates = [csv_row_to_candidate(row) for row in rows]
    json_candidates = payload["candidates"]

    for index, (csv_candidate, json_candidate) in enumerate(zip(csv_candidates, json_candidates)):
        if csv_candidate["candidateCode"] != json_candidate["candidateCode"]:
            fail(f"CSV/JSON order mismatch at index {index}")
        for field in REQUIRED_CANDIDATE_FIELDS:
            if csv_candidate[field] != json_candidate[field]:
                fail(
                    f"CSV/JSON field mismatch at {csv_candidate['candidateCode']} field {field}"
                )
        csv_stack = csv_candidate.get("primaryStack")
        json_stack = json_candidate.get("primaryStack")
        if csv_stack != json_stack:
            fail(f"CSV/JSON primaryStack mismatch at {csv_candidate['candidateCode']}")


def verify_deterministic_generation() -> None:
    before_json = sha256(JSON_PATH)
    before_csv = sha256(CSV_PATH)

    for run in (1, 2):
        subprocess.run(
            [sys.executable, str(GENERATOR_SCRIPT)],
            check=True,
            cwd=ROOT,
        )
        after_json = sha256(JSON_PATH)
        after_csv = sha256(CSV_PATH)
        if after_json != before_json or after_csv != before_csv:
            fail(f"generation run {run} changed output hashes (non-deterministic)")
        before_json = after_json
        before_csv = after_csv


def print_counts(payload: dict) -> None:
    candidates = payload["candidates"]
    by_category: Counter[str] = Counter()
    by_role: Counter[str] = Counter()
    for c in candidates:
        by_category[c["jobCategory"]] += 1
        by_role[c["jobTitle"]] += 1

    print("VALIDATION OK")
    print(f"JSON: {JSON_PATH}")
    print(f"CSV:  {CSV_PATH}")
    print(f"SHA256 JSON: {sha256(JSON_PATH)}")
    print(f"SHA256 CSV:  {sha256(CSV_PATH)}")
    print("Per-category counts:")
    for cat in sorted(by_category):
        print(f"  {cat}: {by_category[cat]}")
    print("Per-role counts:")
    for title in APPROVED_TITLES:
        print(f"  {title}: {by_role[title]}")
    print("Sample records:")
    for sample in [candidates[0], candidates[10], candidates[100]]:
        print(json.dumps(sample, ensure_ascii=False))

    print("Protected paths unchanged (present):")
    for path in PROTECTED_PATHS:
        status = "exists" if path.exists() else "missing"
        print(f"  {path.relative_to(ROOT)}: {status}")


def main() -> None:
    if not JSON_PATH.is_file():
        fail(f"missing JSON at {JSON_PATH}")

    templates = load_templates()
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    validate_json_payload(payload, templates)
    validate_csv_matches_json(payload)
    verify_deterministic_generation()
    print_counts(payload)


if __name__ == "__main__":
    main()
