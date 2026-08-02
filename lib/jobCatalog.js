/**
 * Job template catalog loaded from data/job_templates.json (source of truth).
 */

const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "..", "data", "job_templates.json");

/** Stored requirement labels from earlier POC → canonical approved titles */
const LEGACY_REQUIREMENT_TITLES = {
  安保: "保安",
  Java开发: "后端开发",
  客服: "客服专员",
  仓储物流: "仓库管理员"
};

/** Demo DB / seed candidate titles → canonical */
const LEGACY_CANDIDATE_TITLES = {
  商场安保: "保安",
  园区安保: "保安",
  安保巡检: "保安",
  保安队长: "保安",
  安保: "保安",
  安保员: "保安",
  Java开发: "后端开发",
  Java工程师: "后端开发",
  Java开发工程师: "后端开发",
  服务端开发: "后端开发",
  客服: "客服专员",
  在线客服: "客服专员",
  客服主管: "客服专员",
  仓储员: "仓库管理员",
  物流操作: "仓库管理员",
  库管员: "仓库管理员",
  仓储物流: "仓库管理员",
  仓管: "仓库管理员"
};

/** Extra natural-language aliases not listed in templates (query parsing) */
const EXTRA_JOB_ALIASES = {
  保安: ["安保", "护卫", "安保人员", "安保巡逻"],
  后端开发: ["Java开发", "Java工程师", "Java开发工程师", "java开发", "java工程师", "程序员", "服务端工程师"],
  客服专员: ["客服", "呼叫中心", "话务", "客服主管", "客户服务"],
  仓库管理员: ["仓储物流", "仓储", "物流专员", "拣货员", "仓管", "库管", "仓储员"],
  运维工程师: ["运维", "DevOps", "devops", "系统运维工程师", "SRE"],
  运营专员: ["运营", "平台运营专员", "业务运营专员"],
  前端开发: ["Web前端", "前端工程师", "H5开发"],
  测试工程师: ["QA", "qa", "软件测试工程师", "测试"],
  网络工程师: ["网络运维工程师", "网管"],
  商务司机: ["司机", "专职司机", "行政司机"],
  出纳: ["现金出纳"],
  会计: ["财务会计", "财务会计"],
  客户经理: ["大客户经理", "客户成功"],
  项目经理: ["PM", "项目负责人", "项目主管"],
  资料员: ["文档管理员", "文档控制", "文档专员"],
  行政专员: ["行政助理", "办公室专员", "行政文员"],
  UI设计师: ["UI设计", "视觉设计", "界面设计"],
  电工: ["维修电工", "电气维修"],
  操作工: ["产线工人", "生产操作员", "普工"],
  质检专员: ["QC", "qc", "质量检验", "质检员"],
  文案策划: ["文案", "内容运营文案"],
  法务专员: ["法务", "合规"],
  人事专员: ["HR", "hr", "人力资源专员", "招聘专员"],
  市场专员: ["市场助理", "市场推广"],
  销售专员: ["销售代表", "业务员"],
  采购专员: ["采购", "供应链"],
  保洁: ["清洁员", "清洁工"]
};

const CITY_ALIASES = {
  上海: ["上海", "上海市", "\u6CAA"],
  北京: ["北京", "北京市", "\u4EAC"],
  深圳: ["深圳", "深圳市", "\u6DF1"],
  广州: ["广州", "广州市", "\u7A57"],
  杭州: ["杭州", "杭州市"],
  苏州: ["苏州", "苏州市"],
  南京: ["南京", "南京市"],
  成都: ["成都", "成都市"],
  武汉: ["武汉", "武汉市"],
  重庆: ["重庆", "重庆市"]
};

/** Skill text aliases → catalog token(s) used for recognition (case-insensitive) */
const EXTRA_SKILL_ALIASES = {
  java: "Java",
  spring: "Spring",
  springboot: "Spring",
  mysql: "MySQL",
  redis: "Redis",
  vue: "Vue",
  react: "React",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  html: "HTML/CSS",
  css: "HTML/CSS",
  node: "Node.js",
  nodejs: "Node.js",
  express: "Express",
  python: "Python",
  django: "Django",
  docker: "Docker",
  cicd: "CI/CD",
  "ci/cd": "CI/CD",
  linux: "Linux运维",
  devops: "CI/CD",
  api: "RESTful API",
  restful: "RESTful API",
  wms: "WMS系统",
  excel: "Excel",
  普通话: "普通话",
  figma: "Figma",
  sketch: "Sketch",
  plc: "PLC基础",
  spc: "SPC基础",
  erp: "ERP录入",
  crm: "CRM使用",
  seo: "SEO基础",
  pmp: "PMP",
  叉车: "叉车",
  巡逻: "巡逻",
  消防: "消防基础"
};

/** Certificate text aliases → canonical catalog certificate name */
const CERTIFICATE_ALIASES = {
  c1: "C1驾驶证",
  c1驾照: "C1驾驶证",
  c1驾驶: "C1驾驶证",
  c1驾驶证: "C1驾驶证",
  驾驶证: "C1驾驶证",
  电工证: "电工证",
  电工操作证: "电工证",
  电工上岗证: "电工证",
  保安证: "保安证",
  消防证: "消防证",
  叉车证: "叉车证",
  叉车驾驶证: "叉车证",
  健康证: "健康证",
  食品健康证: "健康证",
  pmp: "PMP",
  pmp证书: "PMP",
  pmp认证: "PMP",
  会计从业: "会计从业相关培训",
  会计从业证: "会计从业相关培训",
  初级会计: "初级会计职称",
  初级会计证: "初级会计职称",
  资料员证: "资料员证",
  质量检验员证: "质量检验员证",
  人力资源管理师: "人力资源管理师",
  网络工程师证: "网络工程师相关认证",
  网络认证: "网络工程师相关认证",
  法律职业资格: "法律职业资格相关",
  计算机二级: "计算机二级"
};

let _cache = null;

function normalizeText(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/，/g, ",")
    .trim();
}

function normalizeKey(raw) {
  return normalizeText(raw).toLowerCase();
}

function buildCatalog() {
  const data = JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf8"));
  const jobs = data.jobs || [];
  const canonicalTitles = jobs.map((j) => j.jobTitle);
  const titleSet = new Set(canonicalTitles);

  const aliasEntries = [];
  const aliasToCanonical = new Map();

  function addAlias(alias, canonical) {
    const a = String(alias || "").trim();
    if (!a || !canonical) return;
    aliasEntries.push({ alias: a, canonical, len: a.length });
    if (!aliasToCanonical.has(a)) aliasToCanonical.set(a, canonical);
    const key = normalizeKey(a);
    if (!aliasToCanonical.has(key)) aliasToCanonical.set(key, canonical);
  }

  for (const job of jobs) {
    addAlias(job.jobTitle, job.jobTitle);
    for (const a of job.aliases || []) addAlias(a, job.jobTitle);
    const extras = EXTRA_JOB_ALIASES[job.jobTitle] || [];
    for (const a of extras) addAlias(a, job.jobTitle);
  }

  for (const [legacy, canonical] of Object.entries(LEGACY_REQUIREMENT_TITLES)) {
    addAlias(legacy, canonical);
  }
  for (const [legacy, canonical] of Object.entries(LEGACY_CANDIDATE_TITLES)) {
    addAlias(legacy, canonical);
  }

  aliasEntries.sort((a, b) => b.len - a.len || b.alias.localeCompare(a.alias, "zh"));

  const catalogSkills = new Set();
  const skillAliasToCanonical = new Map();
  for (const job of jobs) {
    for (const s of [...(job.requiredSkills || []), ...(job.optionalSkills || [])]) {
      catalogSkills.add(s);
      skillAliasToCanonical.set(normalizeKey(s), s);
    }
  }
  for (const [alias, token] of Object.entries(EXTRA_SKILL_ALIASES)) {
    skillAliasToCanonical.set(normalizeKey(alias), token);
  }

  const catalogCertificates = new Set();
  const certAliasToCanonical = new Map();
  for (const job of jobs) {
    for (const c of [...(job.requiredCertificates || []), ...(job.optionalCertificates || [])]) {
      catalogCertificates.add(c);
      certAliasToCanonical.set(normalizeKey(c), c);
    }
  }
  for (const [alias, cert] of Object.entries(CERTIFICATE_ALIASES)) {
    certAliasToCanonical.set(normalizeKey(alias), cert);
  }

  const cityEntries = [];
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    for (const a of aliases) cityEntries.push({ alias: a, city, len: a.length });
  }
  cityEntries.sort((a, b) => b.len - a.len || b.alias.localeCompare(a.alias, "zh"));

  return {
    jobs,
    canonicalTitles,
    titleSet,
    aliasEntries,
    aliasToCanonical,
    cityEntries,
    catalogSkills: [...catalogSkills],
    skillAliasToCanonical,
    catalogCertificates: [...catalogCertificates],
    certAliasToCanonical
  };
}

function getCatalog() {
  if (!_cache) _cache = buildCatalog();
  return _cache;
}

function canonicalizeJobTitle(title) {
  const t = String(title || "").trim();
  if (!t) return "";
  const { titleSet, aliasToCanonical, aliasEntries } = getCatalog();
  if (titleSet.has(t)) return t;
  if (LEGACY_REQUIREMENT_TITLES[t]) return LEGACY_REQUIREMENT_TITLES[t];
  if (LEGACY_CANDIDATE_TITLES[t]) return LEGACY_CANDIDATE_TITLES[t];
  if (aliasToCanonical.has(t)) return aliasToCanonical.get(t);
  const key = normalizeKey(t);
  if (aliasToCanonical.has(key)) return aliasToCanonical.get(key);

  const lower = key;
  let best = null;
  for (const entry of aliasEntries) {
    const aliasKey = normalizeKey(entry.alias);
    if (lower.includes(aliasKey) && (!best || entry.len > best.len)) {
      best = entry;
    }
  }
  return best ? best.canonical : t;
}

function parseJobTitleFromText(text) {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  const { aliasEntries } = getCatalog();
  let best = null;
  for (const entry of aliasEntries) {
    const aliasKey = entry.alias.toLowerCase();
    if (lower.includes(aliasKey) && (!best || entry.len > best.len)) {
      best = entry;
    }
  }
  return best ? best.canonical : "";
}

function canonicalizeCity(city) {
  const c = String(city || "").trim();
  if (!c) return "";
  if (CITY_ALIASES[c]) return c;
  for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some((a) => c.includes(a) || a.includes(c))) return canonical;
  }
  return c;
}

function parseCityFromText(text) {
  const normalized = normalizeText(text);
  const { cityEntries } = getCatalog();
  for (const entry of cityEntries) {
    if (normalized.includes(entry.alias)) return entry.city;
  }
  return "";
}

function parseSkillsFromText(text) {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  const { catalogSkills, skillAliasToCanonical } = getCatalog();
  const found = new Set();

  const sortedSkills = [...catalogSkills].sort((a, b) => b.length - a.length);
  for (const skill of sortedSkills) {
    if (lower.includes(skill.toLowerCase())) found.add(skill);
  }

  const aliasKeys = [...skillAliasToCanonical.keys()].sort((a, b) => b.length - a.length);
  for (const aliasKey of aliasKeys) {
    if (lower.includes(aliasKey)) {
      const token = skillAliasToCanonical.get(aliasKey);
      if (token) found.add(token);
    }
  }

  return [...found];
}

function canonicalizeSkill(skill) {
  const s = String(skill || "").trim();
  if (!s) return "";
  const { catalogSkills, skillAliasToCanonical } = getCatalog();
  if (catalogSkills.includes(s)) return s;
  const mapped = skillAliasToCanonical.get(normalizeKey(s));
  if (mapped) return mapped;
  for (const cs of catalogSkills) {
    if (cs.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(cs.toLowerCase())) return cs;
  }
  return s;
}

function canonicalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  const out = [];
  const seen = new Set();
  for (const s of skills) {
    const c = canonicalizeSkill(s);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function parseCertificatesFromText(text) {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  const { catalogCertificates, certAliasToCanonical } = getCatalog();
  const found = new Set();

  const sorted = [...catalogCertificates].sort((a, b) => b.length - a.length);
  for (const cert of sorted) {
    if (normalized.includes(cert) || lower.includes(cert.toLowerCase())) found.add(cert);
  }

  const aliasKeys = [...certAliasToCanonical.keys()].sort((a, b) => b.length - a.length);
  for (const aliasKey of aliasKeys) {
    if (lower.includes(aliasKey)) {
      const cert = certAliasToCanonical.get(aliasKey);
      if (cert) found.add(cert);
    }
  }

  return [...found];
}

function canonicalizeCertificate(cert) {
  const c = String(cert || "").trim();
  if (!c) return "";
  const { catalogCertificates, certAliasToCanonical } = getCatalog();
  if (catalogCertificates.includes(c)) return c;
  const mapped = certAliasToCanonical.get(normalizeKey(c));
  if (mapped) return mapped;
  for (const cc of catalogCertificates) {
    if (cc.includes(c) || c.includes(cc)) return cc;
  }
  return c;
}

function canonicalizeCertificates(certs) {
  if (!Array.isArray(certs)) return [];
  const out = [];
  const seen = new Set();
  for (const c of certs) {
    const canon = canonicalizeCertificate(c);
    if (canon && !seen.has(canon)) {
      seen.add(canon);
      out.push(canon);
    }
  }
  return out;
}

function jobTitlesMatch(requirementTitle, candidateTitle) {
  const req = canonicalizeJobTitle(requirementTitle);
  const cand = canonicalizeJobTitle(candidateTitle);
  if (!req) return true;
  if (!cand) return false;
  return req === cand;
}

function skillMatches(requiredSkill, candidateSkills) {
  const req = canonicalizeSkill(requiredSkill);
  if (!req) return false;
  return candidateSkills.some((k) => {
    const ck = String(k || "");
    const canonK = canonicalizeSkill(ck);
    return (
      ck.toLowerCase().includes(req.toLowerCase()) ||
      req.toLowerCase().includes(ck.toLowerCase()) ||
      canonK.toLowerCase().includes(req.toLowerCase()) ||
      req.toLowerCase().includes(canonK.toLowerCase())
    );
  });
}

function certificateMatches(requiredCert, candidateCerts) {
  const req = canonicalizeCertificate(requiredCert);
  if (!req) return false;
  return candidateCerts.some((k) => {
    const ck = String(k || "");
    const canonK = canonicalizeCertificate(ck);
    return ck.includes(req) || req.includes(ck) || canonK === req || req.includes(canonK) || canonK.includes(req);
  });
}

function citiesMatch(requirementCity, candidateCity) {
  const req = canonicalizeCity(requirementCity);
  const cand = canonicalizeCity(candidateCity);
  if (!req) return true;
  if (!cand) return false;
  return cand.includes(req) || req.includes(cand);
}

module.exports = {
  getCatalog,
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
  citiesMatch,
  LEGACY_REQUIREMENT_TITLES,
  CITY_ALIASES
};
