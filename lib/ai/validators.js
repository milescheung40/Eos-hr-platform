function clampStr(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

function asStringArray(v, maxItems = 20, maxLen = 40) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => clampStr(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asPositiveInt(v, fallback = 1, max = 999) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function asNonNegativeInt(v, max = 50) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

function validateRequirementShape(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  return {
    jobTitle: clampStr(obj.jobTitle, 50),
    city: clampStr(obj.city, 30),
    headcount: asPositiveInt(obj.headcount, 1),
    minExperience: asNonNegativeInt(obj.minExperience),
    requiredSkills: asStringArray(obj.requiredSkills),
    requiredCertificates: asStringArray(obj.requiredCertificates),
    availableBefore: clampStr(obj.availableBefore, 20),
    employmentType: clampStr(obj.employmentType, 20),
    budgetRange: clampStr(obj.budgetRange, 40)
  };
}

function validateResumeShape(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const name = clampStr(obj.name, 30);
  const jobTitle = clampStr(obj.jobTitle, 50);
  if (!name && !jobTitle) return null;
  return {
    name,
    jobTitle,
    city: clampStr(obj.city, 30),
    yearsExperience: asNonNegativeInt(obj.yearsExperience),
    skills: asStringArray(obj.skills),
    certificates: asStringArray(obj.certificates),
    availableDate: clampStr(obj.availableDate, 30),
    employmentType: clampStr(obj.employmentType, 20),
    salaryRange: clampStr(obj.salaryRange, 40),
    education: clampStr(obj.education, 30),
    summary: clampStr(obj.summary, 200)
  };
}

function parseJsonFromModel(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

module.exports = {
  validateRequirementShape,
  validateResumeShape,
  parseJsonFromModel,
  clampStr
};
