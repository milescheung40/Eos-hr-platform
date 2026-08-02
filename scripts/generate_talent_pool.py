#!/usr/bin/env python3
"""Generate offline synthetic talent pool from data/job_templates.json."""
from __future__ import annotations

import csv
import json
import random
import sys
from pathlib import Path

from faker import Faker

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "data" / "job_templates.json"
OUTPUT_DIR = ROOT / "data" / "generated"
JSON_PATH = OUTPUT_DIR / "talent_pool_candidates.json"
CSV_PATH = OUTPUT_DIR / "talent_pool_candidates.csv"

GENERATOR_SEED = 20260730
PER_ROLE_COUNT = 10
EXPECTED_JOB_COUNT = 27
EXPECTED_CANDIDATE_COUNT = EXPECTED_JOB_COUNT * PER_ROLE_COUNT

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

BACKEND_STACKS = [
    ["Java", "Spring", "MySQL"],
    ["Node.js", "Express", "Redis"],
    ["Python", "Django", "PostgreSQL"],
]

PROJECT_NAMES = [
    "智慧园区",
    "ERP升级",
    "产线改造",
    "客户服务中心",
    "电商履约",
    "政务云平台",
]

AVAILABILITY_STATUSES = ["可用", "已派驻", "不可用"]

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


def load_jobs() -> list[dict]:
    data = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    jobs = data.get("jobs", [])
    if len(jobs) != EXPECTED_JOB_COUNT:
        raise SystemExit(f"expected {EXPECTED_JOB_COUNT} jobs, got {len(jobs)}")
    return jobs


def mask_mobile(unique_index: int) -> str:
    """Masked, non-callable demo mobile; unique across the pool."""
    suffix = f"{unique_index:04d}"
    prefix = 130 + (unique_index % 9)
    return f"{prefix}****{suffix[-4:]}"


def demo_id_no(job_index: int, seq: int) -> str:
    return f"DEMO{job_index:03d}{seq:02d}{GENERATOR_SEED % 100000:05d}"


def email_for(candidate_code: str) -> str:
    slug = candidate_code.lower().replace("-", ".")
    return f"{slug}@example.test"


def format_salary_range(salary_min: int, salary_max: int, unit: str) -> str:
    if unit == "月":
        lo = salary_min // 1000
        hi = max(lo + 1, salary_max // 1000)
        return f"{lo}k-{hi}k/月"
    return f"{salary_min}-{salary_max}/{unit}"


def fill_template(template: str, city: str, months: int, project: str) -> str:
    return (
        template.replace("{city}", city)
        .replace("{months}", str(months))
        .replace("{project}", project)
    )


def pick_skills(job: dict, rng: random.Random, seq: int, job_title: str) -> tuple[list[str], str | None]:
    required = list(job["requiredSkills"])
    optional = list(job["optionalSkills"])
    primary_stack: str | None = None

    if job_title == "后端开发":
        stack = BACKEND_STACKS[seq % len(BACKEND_STACKS)]
        primary_stack = "/".join(stack[:2])
        skills = required + stack
        extra = [s for s in optional if not any(x in s for x in ("Java", "Node", "Python"))]
        rng.shuffle(extra)
        skills.extend(extra[: rng.randint(0, min(2, len(extra)))])
        return skills, primary_stack

    skills = required.copy()
    rng.shuffle(optional)
    take = rng.randint(0, min(3, len(optional)))
    skills.extend(optional[:take])
    return skills, primary_stack


def pick_certificates(job: dict, rng: random.Random) -> list[str]:
    certs = list(job["requiredCertificates"])
    optional = list(job["optionalCertificates"])
    rng.shuffle(optional)
    for cert in optional:
        if rng.random() < 0.45:
            certs.append(cert)
    return certs


def pick_salary(job: dict, rng: random.Random) -> tuple[int, int]:
    lo = job["salaryMin"]
    hi = job["salaryMax"]
    span = hi - lo
    candidate_min = lo + rng.randint(0, max(0, span // 3))
    candidate_max = min(hi, candidate_min + rng.randint(max(500, span // 4), max(500, span)))
    if candidate_max < candidate_min:
        candidate_max = candidate_min
    return candidate_min, candidate_max


def generate_candidate(
    job: dict,
    job_index: int,
    seq: int,
    faker: Faker,
    rng: random.Random,
    global_index: int,
) -> dict:
    job_code = job["jobCode"]
    job_title = job["jobTitle"]
    candidate_code = f"CAND-{job_code}-{seq:02d}"

    cities = job["cities"]
    current_city = cities[(seq - 1) % len(cities)]
    preferred_city = cities[rng.randint(0, len(cities) - 1)]

    years = rng.randint(job["experienceMin"], job["experienceMax"])
    skills, primary_stack = pick_skills(job, rng, seq, job_title)
    certificates = pick_certificates(job, rng)

    employment_type = job["employmentTypes"][(seq - 1) % len(job["employmentTypes"])]
    available_date = job["availabilityOptions"][(seq - 1) % len(job["availabilityOptions"])]
    availability_status = AVAILABILITY_STATUSES[rng.randint(0, len(AVAILABILITY_STATUSES) - 1)]

    salary_min, salary_max = pick_salary(job, rng)
    salary_unit = job["salaryUnit"]
    salary_range = format_salary_range(salary_min, salary_max, salary_unit)

    months = rng.randint(6, 36)
    project = PROJECT_NAMES[rng.randint(0, len(PROJECT_NAMES) - 1)]
    project_tpl = job["projectExperienceTemplates"][(seq - 1) % len(job["projectExperienceTemplates"])]
    summary_tpl = job["summaryTemplates"][(seq - 1) % len(job["summaryTemplates"])]

    candidate = {
        "candidateCode": candidate_code,
        "isSynthetic": True,
        "dataLabel": "EOS-HR-SYNTHETIC-DEMO",
        "name": faker.name(),
        "idNo": demo_id_no(job_index, seq),
        "mobile": mask_mobile(global_index),
        "email": email_for(candidate_code),
        "gender": rng.choice(["男", "女"]),
        "jobCode": job_code,
        "jobTitle": job_title,
        "jobCategory": job["jobCategory"],
        "currentCity": current_city,
        "preferredCity": preferred_city,
        "yearsExperience": years,
        "skills": skills,
        "certificates": certificates,
        "employmentType": employment_type,
        "availableDate": available_date,
        "availabilityStatus": availability_status,
        "salaryMin": salary_min,
        "salaryMax": salary_max,
        "salaryUnit": salary_unit,
        "salaryRange": salary_range,
        "projectExperience": fill_template(project_tpl, current_city, months, project),
        "summary": summary_tpl,
    }
    if primary_stack:
        candidate["primaryStack"] = primary_stack
    return candidate


def generate_pool() -> dict:
    jobs = load_jobs()
    faker = Faker("zh_CN")
    Faker.seed(GENERATOR_SEED)
    rng = random.Random(GENERATOR_SEED)

    candidates: list[dict] = []
    global_index = 1
    for job_index, job in enumerate(jobs, start=1):
        for seq in range(1, PER_ROLE_COUNT + 1):
            candidates.append(
                generate_candidate(job, job_index, seq, faker, rng, global_index)
            )
            global_index += 1

    return {
        "schemaVersion": "1.0.0",
        "generatedFor": "eos-hr-rebuild demo synthetic talent pool (phase 2)",
        "generatorSeed": GENERATOR_SEED,
        "isSynthetic": True,
        "candidateCount": len(candidates),
        "count": len(candidates),
        "perRoleCount": PER_ROLE_COUNT,
        "candidates": candidates,
    }


def candidate_to_csv_row(candidate: dict) -> dict:
    row = {}
    for field in CSV_FIELDS:
        value = candidate.get(field, "")
        if field in ("skills", "certificates"):
            row[field] = json.dumps(value, ensure_ascii=False)
        elif field == "isSynthetic":
            row[field] = "true"
        elif value is None:
            row[field] = ""
        else:
            row[field] = value
    return row


def write_outputs(payload: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    json_text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False)
    json_text += "\n"
    JSON_PATH.write_text(json_text, encoding="utf-8")

    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, lineterminator="\n")
        writer.writeheader()
        for candidate in payload["candidates"]:
            writer.writerow(candidate_to_csv_row(candidate))


def print_summary(payload: dict) -> None:
    candidates = payload["candidates"]
    print(f"Generated {len(candidates)} candidates -> {JSON_PATH.name}, {CSV_PATH.name}")

    by_category: dict[str, int] = {}
    by_role: dict[str, int] = {}
    for c in candidates:
        by_category[c["jobCategory"]] = by_category.get(c["jobCategory"], 0) + 1
        by_role[c["jobTitle"]] = by_role.get(c["jobTitle"], 0) + 1

    print("Per-category counts:")
    for cat in sorted(by_category):
        print(f"  {cat}: {by_category[cat]}")

    print("Per-role counts:")
    for title in by_role:
        print(f"  {title}: {by_role[title]}")

    print("Sample records:")
    for sample in [candidates[0], candidates[10], candidates[100]]:
        print(json.dumps(sample, ensure_ascii=False))


def main() -> None:
    if not TEMPLATE_PATH.is_file():
        print(f"missing template: {TEMPLATE_PATH}", file=sys.stderr)
        sys.exit(1)

    payload = generate_pool()
    if payload["candidateCount"] != EXPECTED_CANDIDATE_COUNT:
        print(
            f"unexpected candidate count: {payload['candidateCount']}",
            file=sys.stderr,
        )
        sys.exit(1)

    write_outputs(payload)
    print_summary(payload)


if __name__ == "__main__":
    main()
