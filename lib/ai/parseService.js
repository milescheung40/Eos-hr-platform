const { parseRequirement, enrichParsedTags } = require("../staffingMatch");
const {
  canonicalizeJobTitle,
  parseJobTitleFromText,
  canonicalizeCity,
  parseCityFromText,
  parseSkillsFromText,
  canonicalizeSkills,
  parseCertificatesFromText,
  canonicalizeCertificates
} = require("../jobCatalog");
const { isAiReady } = require("./config");
const { invokeProvider } = require("./providerAdapter");
const {
  parseJsonFromModel,
  validateRequirementShape,
  validateResumeShape,
  clampStr
} = require("./validators");

const PARSE_SOURCE = {
  AI: "ai",
  RULE: "rule"
};

function logAiEvent(code) {
  console.info(`[ai-parse] fallback reason=${code}`);
}

function buildRequirementFromRule(rawQuery) {
  return enrichParsedTags({ ...parseRequirement(rawQuery), rawQuery: clampStr(rawQuery, 500) });
}

function normalizeResumeText(raw) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clampStr(match[1], 40);
  }
  return "";
}

function buildResumeFromRule(resumeText) {
  const text = normalizeResumeText(resumeText);
  const name = firstMatch(text, [
    /(?:^|\n)\s*姓\s*名\s*[:：]\s*([\u4e00-\u9fff·]{2,20})(?:\s|$)/m,
    /(?:^|\n)\s*姓名\s+([\u4e00-\u9fff·]{2,20})(?:\s|$)/m
  ]);
  const experienceText = firstMatch(text, [
    /(?:工作|从业|相关)?经验\s*[:：]?\s*(\d{1,2})\s*年/i,
    /(\d{1,2})\s*年(?:以上|及以上|左右)?(?:工作|从业|相关|开发|项目)?经验/i
  ]);
  const education = firstMatch(text, [/(博士|硕士|本科|大专|中专|高中)(?:学历|毕业)?/]);
  const availableDate = firstMatch(text, [
    /(?:到岗时间|可到岗)\s*[:：]?\s*([^\n，,；;]{1,20})/,
    /(立即到岗|随时到岗|\d{1,2}天内到岗|一周内到岗|两周内到岗|一个月内到岗)/
  ]);
  const employmentType = firstMatch(text, [/(全职|兼职|灵活用工|劳务派遣|项目制)/]);
  const salaryRange = firstMatch(text, [
    /(?:期望薪资|薪资要求|薪资范围)\s*[:：]?\s*([^\n，,；;]{1,30})/,
    /(\d{1,3}[kK]\s*[-~到至]\s*\d{1,3}[kK](?:\s*\/\s*月)?)/
  ]);
  const jobTitle = parseJobTitleFromText(text);
  const city = parseCityFromText(text);
  const skills = parseSkillsFromText(text);
  const certificates = parseCertificatesFromText(text);
  const evidenced = [
    name && `姓名${name}`,
    jobTitle && `目标岗位${jobTitle}`,
    city && `意向城市${city}`,
    experienceText && `${experienceText}年经验`,
    education && `${education}学历`,
    skills.length && `技能：${skills.slice(0, 6).join("、")}`,
    certificates.length && `证书：${certificates.slice(0, 4).join("、")}`
  ].filter(Boolean);

  return {
    name,
    jobTitle,
    city,
    yearsExperience: Number(experienceText) || 0,
    skills,
    certificates,
    availableDate,
    employmentType,
    salaryRange,
    education,
    summary: clampStr(evidenced.join("；"), 200)
  };
}

function canonicalizeResume(candidate, fallback = {}) {
  const shaped = validateResumeShape(candidate);
  if (!shaped) return null;
  return {
    ...shaped,
    name: shaped.name || fallback.name || "",
    jobTitle: canonicalizeJobTitle(shaped.jobTitle || fallback.jobTitle),
    city: canonicalizeCity(shaped.city || fallback.city),
    yearsExperience: shaped.yearsExperience || fallback.yearsExperience || 0,
    skills: canonicalizeSkills(shaped.skills.length ? shaped.skills : fallback.skills || []),
    certificates: canonicalizeCertificates(
      shaped.certificates.length ? shaped.certificates : fallback.certificates || []
    ),
    availableDate: shaped.availableDate || fallback.availableDate || "",
    employmentType: shaped.employmentType || fallback.employmentType || "",
    salaryRange: shaped.salaryRange || fallback.salaryRange || "",
    education: shaped.education || fallback.education || "",
    summary: shaped.summary || fallback.summary || ""
  };
}

async function parseRequirementWithFallback(rawQuery) {
  const text = clampStr(rawQuery, 500);
  const ruleResult = buildRequirementFromRule(text);
  if (!text) {
    return { data: ruleResult, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
  if (!isAiReady()) {
    return { data: ruleResult, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
  try {
    const content = await invokeProvider("requirement", text);
    const parsed = parseJsonFromModel(content);
    const shaped = validateRequirementShape(parsed);
    if (!shaped || (!shaped.jobTitle && !shaped.city)) {
      logAiEvent("invalid_requirement_shape");
      return { data: ruleResult, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
    }
    const merged = enrichParsedTags({
      rawQuery: text,
      jobTitle: shaped.jobTitle || ruleResult.jobTitle,
      city: shaped.city || ruleResult.city,
      headcount: shaped.headcount || ruleResult.headcount,
      minExperience: shaped.minExperience ?? ruleResult.minExperience,
      requiredSkills: shaped.requiredSkills.length ? shaped.requiredSkills : ruleResult.requiredSkills,
      requiredCertificates: shaped.requiredCertificates.length
        ? shaped.requiredCertificates
        : ruleResult.requiredCertificates,
      availableBefore: shaped.availableBefore || ruleResult.availableBefore,
      employmentType: shaped.employmentType || ruleResult.employmentType,
      budgetRange: shaped.budgetRange || ruleResult.budgetRange
    });
    return { data: merged, parseSource: PARSE_SOURCE.AI, parseSourceLabel: "AI大模型解析" };
  } catch (e) {
    logAiEvent(e.code || e.message || "error");
    return { data: ruleResult, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
}

async function parseResumeWithFallback(resumeText) {
  const text = clampStr(resumeText, 12000);
  const ruleFallback = buildResumeFromRule(text);
  if (!text) {
    return { data: ruleFallback, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
  if (!isAiReady()) {
    return { data: ruleFallback, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
  try {
    const content = await invokeProvider("resume", text);
    const parsed = parseJsonFromModel(content);
    const shaped = canonicalizeResume(parsed, ruleFallback);
    if (!shaped) {
      logAiEvent("invalid_resume_shape");
      return { data: ruleFallback, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
    }
    return { data: shaped, parseSource: PARSE_SOURCE.AI, parseSourceLabel: "AI大模型解析" };
  } catch (e) {
    logAiEvent(e.code || e.message || "error");
    return { data: ruleFallback, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
}

module.exports = {
  PARSE_SOURCE,
  parseRequirementWithFallback,
  parseResumeWithFallback,
  buildResumeFromRule,
  canonicalizeResume
};
