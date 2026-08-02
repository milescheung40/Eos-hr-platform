#!/usr/bin/env python3
"""Validate data/job_templates.json structure and domain rules."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_FILENAME = "job_templates.json"
TEMPLATE_PATH = ROOT / "data" / TEMPLATE_FILENAME

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

# Exact Unicode category strings (code points verified for roles 1-9).
CATEGORY_FUNCTIONAL = "\u804c\u80fd\u540e\u52e4"  # 职能后勤
CATEGORY_SALES = "业务销售"
CATEGORY_IT = "IT技术通用岗"
CATEGORY_MANUFACTURING = "实体生产通用岗"
CATEGORY_PROJECT = "项目管理/综合管理"

ALLOWED_CATEGORIES = {
    CATEGORY_FUNCTIONAL,
    CATEGORY_SALES,
    CATEGORY_IT,
    CATEGORY_MANUFACTURING,
    CATEGORY_PROJECT,
}

# Role index (1-based) -> required category.
ROLE_CATEGORY_BY_INDEX = {
    **{i: CATEGORY_FUNCTIONAL for i in range(1, 10)},
    **{i: CATEGORY_SALES for i in range(10, 15)},
    **{i: CATEGORY_IT for i in range(15, 21)},
    **{i: CATEGORY_MANUFACTURING for i in range(21, 24)},
    **{i: CATEGORY_PROJECT for i in range(24, 28)},
}

EXPECTED_CATEGORY_COUNTS = {
    CATEGORY_FUNCTIONAL: 9,
    CATEGORY_SALES: 5,
    CATEGORY_IT: 6,
    CATEGORY_MANUFACTURING: 3,
    CATEGORY_PROJECT: 4,
}

REQUIRED_FIELDS = [
    "jobCode",
    "jobTitle",
    "jobCategory",
    "aliases",
    "cities",
    "requiredSkills",
    "optionalSkills",
    "requiredCertificates",
    "optionalCertificates",
    "experienceMin",
    "experienceMax",
    "educationOptions",
    "salaryMin",
    "salaryMax",
    "salaryUnit",
    "employmentTypes",
    "availabilityOptions",
    "projectExperienceTemplates",
    "summaryTemplates",
]

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


def fail(msg: str) -> None:
    print(f"VALIDATION FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def validate_filename() -> None:
    if TEMPLATE_PATH.name != TEMPLATE_FILENAME:
        fail(f"template filename must be {TEMPLATE_FILENAME!r}, got {TEMPLATE_PATH.name!r}")
    if not TEMPLATE_PATH.is_file():
        fail(f"missing template file at {TEMPLATE_PATH}")


def validate_category_string(category: str) -> None:
    expected_codepoints = [0x804C, 0x80FD, 0x540E, 0x52E4]
    actual_codepoints = [ord(ch) for ch in CATEGORY_FUNCTIONAL]
    if actual_codepoints != expected_codepoints:
        fail(
            "functional category constant has wrong Unicode code points: "
            f"expected U+804C U+80FD U+540E U+52E4, got "
            + " ".join(f"U+{cp:04X}" for cp in actual_codepoints)
        )
    if category == CATEGORY_FUNCTIONAL and [ord(ch) for ch in category] != expected_codepoints:
        fail(f"category {category!r} is not the exact 职能后勤 string")


def main() -> None:
    validate_filename()

    raw = TEMPLATE_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)

    if data.get("schemaVersion") is None:
        fail("missing schemaVersion")
    if data.get("jobCount") != 27:
        fail(f"jobCount must be 27, got {data.get('jobCount')}")
    jobs = data.get("jobs")
    if not isinstance(jobs, list) or len(jobs) != 27:
        fail(f"jobs must be array of length 27, got {len(jobs) if isinstance(jobs, list) else type(jobs)}")

    titles = [j.get("jobTitle") for j in jobs]
    if titles != APPROVED_TITLES:
        fail(f"title order mismatch:\n  expected: {APPROVED_TITLES}\n  got:      {titles}")

    codes = set()
    for i, job in enumerate(jobs):
        role_index = i + 1
        for field in REQUIRED_FIELDS:
            if field not in job:
                fail(f"job[{i}] missing field {field}")
        if job["jobCode"] in codes:
            fail(f"duplicate jobCode {job['jobCode']}")
        codes.add(job["jobCode"])

        category = job["jobCategory"]
        if category not in ALLOWED_CATEGORIES:
            fail(f"invalid category {category!r} for {job['jobTitle']}")

        expected_category = ROLE_CATEGORY_BY_INDEX[role_index]
        if category != expected_category:
            fail(
                f"role {role_index:02d} ({job['jobTitle']}) must use category "
                f"{expected_category!r}, got {category!r}"
            )
        if role_index <= 9:
            validate_category_string(category)

        if not (0 <= job["experienceMin"] <= job["experienceMax"] <= 40):
            fail(f"invalid experience bounds for {job['jobTitle']}")
        if job["salaryMin"] > job["salaryMax"]:
            fail(f"invalid salary bounds for {job['jobTitle']}")
        city_set = set(job["cities"])
        if not city_set.issubset(ALLOWED_CITIES):
            fail(f"invalid cities for {job['jobTitle']}: {city_set - ALLOWED_CITIES}")
        if not city_set:
            fail(f"empty cities for {job['jobTitle']}")

    backend = next(j for j in jobs if j["jobTitle"] == "后端开发")
    req = set(backend["requiredSkills"])
    stacks = [{"Java", "Spring"}, {"Node.js", "Express"}, {"Python", "Django"}]
    if sum(1 for s in stacks if s.issubset(req)) > 1:
        fail("backend requiredSkills must not combine multiple full stacks")

    counts: dict[str, int] = {}
    for job in jobs:
        counts[job["jobCategory"]] = counts.get(job["jobCategory"], 0) + 1

    for category, expected_count in EXPECTED_CATEGORY_COUNTS.items():
        actual_count = counts.get(category, 0)
        if actual_count != expected_count:
            fail(
                f"category {category!r} count must be {expected_count}, got {actual_count}"
            )

    print("VALIDATION OK")
    print(f"Template file: {TEMPLATE_FILENAME}")
    print("Category counts:")
    for cat in [
        CATEGORY_FUNCTIONAL,
        CATEGORY_SALES,
        CATEGORY_IT,
        CATEGORY_MANUFACTURING,
        CATEGORY_PROJECT,
    ]:
        print(f"  {cat}: {counts.get(cat, 0)}")
    print("All 27 titles:")
    for idx, title in enumerate(titles, 1):
        print(f"  {idx:02d}. {title}")


if __name__ == "__main__":
    main()
