/**
 * Rule-based staffing requirement parser and candidate matcher (POC, no external LLM).
 * Job titles, skills, certificates, and cities are driven by data/job_templates.json via lib/jobCatalog.js.
 */

const {
  normalizeText,
  canonicalizeJobTitle,
  parseJobTitleFromText,
  canonicalizeCity,
  parseCityFromText,
  parseSkillsFromText,
  canonicalizeSkills,
  parseCertificatesFromText,
  canonicalizeCertificates,
  jobTitlesMatch,
  skillMatches,
  certificateMatches,
  citiesMatch
} = require("./jobCatalog");

const EMPLOYMENT_KEYWORDS = [
  { type: "全职", patterns: [/全职|正式工/] },
  { type: "灵活用工", patterns: [/灵活用工|项目制|外包|派遣/] },
  { type: "兼职", patterns: [/兼职|小时工/] }
];

function parseCity(text) {
  return parseCityFromText(text);
}

function parseJobTitle(text) {
  return parseJobTitleFromText(text);
}

function parseHeadcount(text) {
  const m =
    text.match(/(?:找|需要|要|招聘)?(\d{1,3})\s*(?:名|人|个)/) ||
    text.match(/(\d{1,3})\s*(?:名|人)/);
  if (m) return Math.min(Number(m[1]), 999);
  if (/一名|一位|1名|1人/.test(text)) return 1;
  return 1;
}

function parseMinExperience(text) {
  const m = text.match(/(\d+)\s*年(?:以上|及以上|\+)?/);
  if (m) return Number(m[1]);
  if (/资深|高级/.test(text)) return 5;
  if (/中级/.test(text)) return 3;
  return 0;
}

function parseSkills(text) {
  return parseSkillsFromText(text);
}

function parseCertificates(text) {
  return parseCertificatesFromText(text);
}

function parseAvailableBefore(text) {
  if (/立即|马上|今天|尽快|即刻|上岗/.test(text)) return "立即";
  if (/明天/.test(text)) return "1天内";
  if (/下周|下星期/.test(text)) return "7天内";
  if (/本月|这个月/.test(text)) return "30天内";
  return "";
}

function parseEmploymentType(text) {
  for (const item of EMPLOYMENT_KEYWORDS) {
    if (item.patterns.some((p) => p.test(text))) return item.type;
  }
  return "";
}

function parseBudget(text) {
  const m = text.match(/(\d{3,5})\s*[-~到至]\s*(\d{3,5})/);
  if (m) return `${m[1]}-${m[2]}`;
  const daily = text.match(/(\d{2,4})\s*元?\/?天/);
  if (daily) return `${daily[1]}元/天`;
  return "";
}

function canonicalizeRequirementFields(req) {
  const out = { ...req };
  if (out.jobTitle) out.jobTitle = canonicalizeJobTitle(out.jobTitle);
  if (out.city) out.city = canonicalizeCity(out.city);
  if (out.requiredSkills?.length) out.requiredSkills = canonicalizeSkills(out.requiredSkills);
  if (out.requiredCertificates?.length) {
    out.requiredCertificates = canonicalizeCertificates(out.requiredCertificates);
  }
  return out;
}

function parseRequirement(rawQuery) {
  const raw = String(rawQuery || "").trim();
  const text = normalizeText(raw);
  const jobTitle = parseJobTitle(text);
  const city = parseCity(text);
  const skills = parseSkills(text);
  const certificates = parseCertificates(text);

  if (jobTitle === "后端开发" && /java/i.test(text) && !skills.some((s) => /java/i.test(s))) {
    skills.push("Java");
  }

  return canonicalizeRequirementFields({
    rawQuery: raw,
    jobTitle,
    city,
    headcount: parseHeadcount(text),
    minExperience: parseMinExperience(text),
    requiredSkills: skills,
    requiredCertificates: certificates,
    availableBefore: parseAvailableBefore(text),
    employmentType: parseEmploymentType(text),
    budgetRange: parseBudget(text),
    parsedTags: []
  });
}

function enrichParsedTags(req) {
  const normalized = canonicalizeRequirementFields(req);
  const tags = [];
  if (normalized.city) tags.push({ key: "city", label: "城市", value: normalized.city });
  if (normalized.jobTitle) tags.push({ key: "jobTitle", label: "岗位", value: normalized.jobTitle });
  if (normalized.headcount) tags.push({ key: "headcount", label: "人数", value: String(normalized.headcount) });
  if (normalized.minExperience) {
    tags.push({ key: "minExperience", label: "最低经验", value: `${normalized.minExperience}年` });
  }
  if (normalized.requiredSkills?.length) {
    tags.push({ key: "skills", label: "技能", value: normalized.requiredSkills.join("、") });
  }
  if (normalized.requiredCertificates?.length) {
    tags.push({ key: "certs", label: "证书", value: normalized.requiredCertificates.join("、") });
  }
  if (normalized.availableBefore) tags.push({ key: "available", label: "到岗", value: normalized.availableBefore });
  if (normalized.employmentType) {
    tags.push({ key: "employment", label: "用工类型", value: normalized.employmentType });
  }
  if (normalized.budgetRange) tags.push({ key: "budget", label: "预算", value: normalized.budgetRange });
  normalized.parsedTags = tags;
  return normalized;
}

function candidateCity(c) {
  return c.preferredCity || c.city || c.preferred_city || "";
}

function candidateJob(c) {
  return c.jobTitle || c.job_title || "";
}

function candidateYears(c) {
  return Number(c.yearsExperience ?? c.years_experience ?? 0) || 0;
}

function parseJsonList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return String(raw)
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function filterCandidates(requirement, candidates) {
  const req = canonicalizeRequirementFields(requirement);
  const list = Array.isArray(candidates) ? candidates : [];
  return list.filter((c) => {
    const avail = c.availabilityStatus || c.availability_status || "可用";
    if (avail === "不可用") return false;
    if (req.city) {
      const cc = candidateCity(c);
      if (cc && !citiesMatch(req.city, cc)) return false;
    }
    if (req.jobTitle) {
      const job = candidateJob(c);
      if (job && !jobTitlesMatch(req.jobTitle, job)) return false;
    }
    if (req.minExperience && candidateYears(c) < req.minExperience) return false;
    return true;
  });
}

function scoreCandidate(requirement, candidate) {
  const req = canonicalizeRequirementFields(requirement);
  let score = 0;
  const misses = [];
  const reasons = [];

  const city = candidateCity(candidate);
  if (req.city) {
    if (citiesMatch(req.city, city)) {
      score += 30;
      reasons.push(`工作城市匹配：${city}`);
    } else {
      misses.push(`期望城市 ${req.city}，当前 ${city || "未填"}`);
    }
  } else {
    score += 10;
  }

  const job = candidateJob(candidate);
  if (req.jobTitle) {
    if (jobTitlesMatch(req.jobTitle, job)) {
      score += 28;
      reasons.push(`岗位匹配：${job}`);
    } else {
      misses.push(`岗位不匹配（需要 ${req.jobTitle}，当前 ${job || "未填"}）`);
    }
  } else {
    score += 8;
  }

  const years = candidateYears(candidate);
  if (req.minExperience) {
    if (years >= req.minExperience) {
      score += 20;
      reasons.push(`工作经验 ${years} 年，满足 ${req.minExperience} 年要求`);
    } else {
      misses.push(`经验不足（需要 ${req.minExperience} 年，当前 ${years} 年）`);
    }
  } else if (years > 0) {
    score += Math.min(12, years * 2);
    reasons.push(`工作经验 ${years} 年`);
  }

  const skills = parseJsonList(candidate.skills);
  if (req.requiredSkills?.length) {
    const hit = req.requiredSkills.filter((s) => skillMatches(s, skills));
    if (hit.length) {
      score += Math.min(15, hit.length * 5);
      reasons.push(`技能命中：${hit.join("、")}`);
    } else {
      misses.push(`缺少技能：${req.requiredSkills.join("、")}`);
    }
  } else if (skills.length) {
    score += 5;
  }

  const certs = parseJsonList(candidate.certificates);
  if (req.requiredCertificates?.length) {
    const hit = req.requiredCertificates.filter((s) => certificateMatches(s, certs));
    if (hit.length) {
      score += Math.min(10, hit.length * 5);
      reasons.push(`证书命中：${hit.join("、")}`);
    } else {
      misses.push(`缺少证书：${req.requiredCertificates.join("、")}`);
    }
  }

  const avail = candidate.availabilityStatus || candidate.availability_status || "可用";
  if (avail === "可用") {
    score += 10;
    reasons.push("当前可用");
  } else if (avail === "已派驻") {
    score += 4;
    misses.push("当前已派驻其他项目");
  }

  const availDate = candidate.availableDate || candidate.available_date || "";
  if (req.availableBefore === "立即" && /立即|随时|今天/.test(availDate)) {
    score += 5;
    reasons.push("可到岗时间：立即");
  } else if (req.availableBefore && availDate) {
    reasons.push(`可到岗：${availDate}`);
    score += 3;
  }

  if (req.employmentType) {
    const et = candidate.employmentType || candidate.employment_type || "";
    if (et && et.includes(req.employmentType)) {
      score += 5;
      reasons.push(`用工类型：${et}`);
    }
  }

  return { score: Math.min(100, score), reasons, misses };
}

function explainMatch(requirement, candidate, scored) {
  const parts = scored.reasons.length ? scored.reasons.join("；") : "基础条件部分匹配";
  if (scored.misses.length) return `${parts}。风险提示：${scored.misses.join("；")}`;
  return parts;
}

function rankCandidates(requirement, candidates) {
  const filtered = filterCandidates(requirement, candidates);
  return filtered
    .map((c) => {
      const scored = scoreCandidate(requirement, c);
      return {
        candidate: c,
        score: scored.score,
        reasons: scored.reasons,
        misses: scored.misses,
        explanation: explainMatch(requirement, c, scored)
      };
    })
    .sort((a, b) => b.score - a.score);
}

function matchCandidates(rawQuery, candidates, limit = 20, preParsed = null) {
  const base = preParsed ? enrichParsedTags({ ...preParsed, rawQuery: preParsed.rawQuery || rawQuery }) : parseRequirement(rawQuery);
  const requirement = enrichParsedTags(base);
  const ranked = rankCandidates(requirement, candidates);
  return { requirement, matches: ranked.slice(0, limit) };
}

function maskSensitiveCandidate(candidate, isAdmin) {
  const row = { ...candidate };
  if (!isAdmin) {
    delete row.idNo;
    delete row.id_no;
    delete row.mobile;
    delete row.salaryRange;
    delete row.salary_range;
    row.mobileMasked = "已隐藏";
    row.idNoMasked = "已隐藏";
    row.salaryRangeMasked = "已隐藏";
  }
  return row;
}

module.exports = {
  parseRequirement,
  enrichParsedTags,
  filterCandidates,
  scoreCandidate,
  explainMatch,
  rankCandidates,
  matchCandidates,
  maskSensitiveCandidate,
  parseJsonList
};
