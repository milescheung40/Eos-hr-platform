/**
 * Rule-based staffing requirement parser and candidate matcher (POC, no external LLM).
 */

const CITY_ALIASES = {
  上海: ["上海", "沪"],
  北京: ["北京", "京"],
  深圳: ["深圳", "深"],
  广州: ["广州", "穗"],
  苏州: ["苏州", "苏"],
  杭州: ["杭州"],
  重庆: ["重庆"],
  南昌: ["南昌"]
};

const JOB_RULES = [
  { key: "安保", patterns: [/保安|安保|护卫|门卫/], titles: ["安保", "保安", "商场安保", "园区安保"] },
  { key: "Java开发", patterns: [/java|后端|开发工程师|程序员/i], titles: ["Java开发", "Java工程师", "后端开发"] },
  { key: "客服", patterns: [/客服|呼叫中心|话务/], titles: ["客服", "客服专员", "热线客服"] },
  { key: "仓储物流", patterns: [/仓储|仓库|物流|拣货|仓管/], titles: ["仓储员", "物流操作", "仓库管理员"] }
];

const SKILL_KEYWORDS = ["Java", "Spring", "MySQL", "Redis", "Vue", "Python", "Excel", "叉车", "WMS", "普通话"];

const CERT_KEYWORDS = ["保安证", "消防证", "C1", "叉车证", "健康证", "计算机二级"];

const EMPLOYMENT_KEYWORDS = [
  { type: "全职", patterns: [/全职|正式工/] },
  { type: "灵活用工", patterns: [/灵活用工|项目制|外包|派遣/] },
  { type: "兼职", patterns: [/兼职|小时工/] }
];

function normalizeText(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/，/g, ",")
    .trim();
}

function parseCity(text) {
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some((a) => text.includes(a))) return city;
  }
  return "";
}

function parseJobTitle(text) {
  for (const rule of JOB_RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.key;
  }
  return "";
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
  const found = SKILL_KEYWORDS.filter((s) => text.toLowerCase().includes(s.toLowerCase()));
  if (/java/i.test(text) && !found.includes("Java")) found.push("Java");
  return found;
}

function parseCertificates(text) {
  return CERT_KEYWORDS.filter((c) => text.includes(c));
}

function parseAvailableBefore(text) {
  if (/立即|马上|今天|尽快|即刻/.test(text)) return "立即";
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

function parseRequirement(rawQuery) {
  const raw = String(rawQuery || "").trim();
  const text = normalizeText(raw);
  const jobTitle = parseJobTitle(text);
  const city = parseCity(text);
  const skills = parseSkills(text);
  const certificates = parseCertificates(text);

  if (jobTitle === "Java开发" && !skills.includes("Java")) skills.push("Java");

  return {
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
  };
}

function enrichParsedTags(req) {
  const tags = [];
  if (req.city) tags.push({ key: "city", label: "城市", value: req.city });
  if (req.jobTitle) tags.push({ key: "jobTitle", label: "岗位", value: req.jobTitle });
  if (req.headcount) tags.push({ key: "headcount", label: "人数", value: String(req.headcount) });
  if (req.minExperience) tags.push({ key: "minExperience", label: "最低经验", value: `${req.minExperience}年` });
  if (req.requiredSkills?.length) tags.push({ key: "skills", label: "技能", value: req.requiredSkills.join("、") });
  if (req.requiredCertificates?.length) tags.push({ key: "certs", label: "证书", value: req.requiredCertificates.join("、") });
  if (req.availableBefore) tags.push({ key: "available", label: "到岗", value: req.availableBefore });
  if (req.employmentType) tags.push({ key: "employment", label: "用工类型", value: req.employmentType });
  if (req.budgetRange) tags.push({ key: "budget", label: "预算", value: req.budgetRange });
  req.parsedTags = tags;
  return req;
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
  const list = Array.isArray(candidates) ? candidates : [];
  return list.filter((c) => {
    const avail = c.availabilityStatus || c.availability_status || "可用";
    if (avail === "不可用") return false;
    if (requirement.city) {
      const cc = candidateCity(c);
      if (cc && !cc.includes(requirement.city) && !requirement.city.includes(cc)) return false;
    }
    if (requirement.jobTitle) {
      const job = candidateJob(c);
      const group = JOB_RULES.find((r) => r.key === requirement.jobTitle);
      const okTitle =
        job.includes(requirement.jobTitle) ||
        (group && group.titles.some((t) => job.includes(t) || requirement.jobTitle.includes(job)));
      if (job && !okTitle) return false;
    }
    if (requirement.minExperience && candidateYears(c) < requirement.minExperience) return false;
    return true;
  });
}

function scoreCandidate(requirement, candidate) {
  let score = 0;
  const misses = [];
  const reasons = [];

  const city = candidateCity(candidate);
  if (requirement.city) {
    if (city.includes(requirement.city)) {
      score += 30;
      reasons.push(`工作城市匹配：${city}`);
    } else {
      misses.push(`期望城市 ${requirement.city}，当前 ${city || "未填"}`);
    }
  } else {
    score += 10;
  }

  const job = candidateJob(candidate);
  if (requirement.jobTitle) {
    const group = JOB_RULES.find((r) => r.key === requirement.jobTitle);
    const jobOk =
      job.includes(requirement.jobTitle) ||
      (group && group.titles.some((t) => job.includes(t) || t.includes(job)));
    if (jobOk) {
      score += 28;
      reasons.push(`岗位匹配：${job}`);
    } else {
      misses.push(`岗位不匹配（需要 ${requirement.jobTitle}，当前 ${job || "未填"}）`);
    }
  } else {
    score += 8;
  }

  const years = candidateYears(candidate);
  if (requirement.minExperience) {
    if (years >= requirement.minExperience) {
      score += 20;
      reasons.push(`工作经验 ${years} 年，满足 ${requirement.minExperience} 年要求`);
    } else {
      misses.push(`经验不足（需要 ${requirement.minExperience} 年，当前 ${years} 年）`);
    }
  } else if (years > 0) {
    score += Math.min(12, years * 2);
    reasons.push(`工作经验 ${years} 年`);
  }

  const skills = parseJsonList(candidate.skills);
  if (requirement.requiredSkills?.length) {
    const hit = requirement.requiredSkills.filter((s) => skills.some((k) => k.toLowerCase().includes(s.toLowerCase())));
    if (hit.length) {
      score += Math.min(15, hit.length * 5);
      reasons.push(`技能命中：${hit.join("、")}`);
    } else {
      misses.push(`缺少技能：${requirement.requiredSkills.join("、")}`);
    }
  } else if (skills.length) {
    score += 5;
  }

  const certs = parseJsonList(candidate.certificates);
  if (requirement.requiredCertificates?.length) {
    const hit = requirement.requiredCertificates.filter((s) => certs.some((k) => k.includes(s)));
    if (hit.length) {
      score += Math.min(10, hit.length * 5);
      reasons.push(`证书命中：${hit.join("、")}`);
    } else {
      misses.push(`缺少证书：${requirement.requiredCertificates.join("、")}`);
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
  if (requirement.availableBefore === "立即" && /立即|随时|今天/.test(availDate)) {
    score += 5;
    reasons.push("可到岗时间：立即");
  } else if (requirement.availableBefore && availDate) {
    reasons.push(`可到岗：${availDate}`);
    score += 3;
  }

  if (requirement.employmentType) {
    const et = candidate.employmentType || candidate.employment_type || "";
    if (et && et.includes(requirement.employmentType)) {
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
  const requirement = enrichParsedTags(preParsed || parseRequirement(rawQuery));
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
