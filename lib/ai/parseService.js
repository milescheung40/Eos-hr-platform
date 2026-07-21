const { parseRequirement, enrichParsedTags } = require("../staffingMatch");
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
  const text = clampStr(resumeText, 4000);
  const ruleFallback = {
    name: "",
    jobTitle: "",
    city: "",
    yearsExperience: 0,
    skills: [],
    certificates: [],
    availableDate: "",
    employmentType: "",
    salaryRange: "",
    education: "",
    summary: ""
  };
  if (!text) {
    return { data: ruleFallback, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
  if (!isAiReady()) {
    return { data: ruleFallback, parseSource: PARSE_SOURCE.RULE, parseSourceLabel: "规则兜底" };
  }
  try {
    const content = await invokeProvider("resume", text);
    const parsed = parseJsonFromModel(content);
    const shaped = validateResumeShape(parsed);
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
  parseResumeWithFallback
};
