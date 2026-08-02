const fs = require("fs");
const path = require("path");
const { parseRequirement, scoreCandidate, matchCandidates } = require("../lib/staffingMatch");
const {
  getCatalog,
  canonicalizeJobTitle,
  parseJobTitleFromText,
  parseCityFromText,
  parseSkillsFromText,
  parseCertificatesFromText,
  jobTitlesMatch,
  CITY_ALIASES
} = require("../lib/jobCatalog");
const test = require("node:test");
const assert = require("node:assert/strict");

const { canonicalTitles } = getCatalog();
const TALENT_POOL_PATH = path.join(__dirname, "..", "data", "generated", "talent_pool_candidates.json");

const ROLE_QUERY_SUFFIX = {
  保安: "保安，3年以上经验，立即到岗",
  保洁: "清洁员，立即到岗",
  商务司机: "商务司机，持C1驾照",
  行政专员: "行政助理1名",
  人事专员: "HR专员",
  出纳: "出纳1人",
  会计: "财务会计",
  采购专员: "采购助理",
  仓库管理员: "仓储物流人员",
  销售专员: "销售代表",
  客户经理: "大客户经理",
  市场专员: "市场助理",
  客服专员: "客服，立即上岗",
  运营专员: "业务运营专员",
  运维工程师: "DevOps工程师",
  前端开发: "Web前端工程师",
  后端开发: "Java开发，5年以上经验，下周到岗",
  测试工程师: "QA工程师",
  网络工程师: "网络运维",
  UI设计师: "视觉设计师",
  操作工: "产线操作员",
  质检专员: "QC专员",
  电工: "维修电工，持电工证",
  项目经理: "项目经理",
  资料员: "文档管理员",
  法务专员: "法务助理",
  文案策划: "品牌文案"
};

const ROLE_PARSE_CASES = Object.entries(ROLE_QUERY_SUFFIX).map(([title, suffix]) => {
  const sampleCity = title === "保安" ? "上海" : "北京";
  const prefix = title === "保安" ? `需要10名${sampleCity}` : `招聘${sampleCity}`;
  return [title, `${prefix}${suffix}`];
});

const LEGACY_PARSE_CASES = [
  ["保安", "需要10名上海安保，3年以上经验，立即到岗"],
  ["后端开发", "找3名北京Java开发，5年以上经验，下周到岗"],
  ["客服专员", "招聘5名深圳客服，立即上岗"],
  ["仓库管理员", "找2名苏州仓储物流，7天内到岗"]
];

const CITY_CASES = Object.entries(CITY_ALIASES).flatMap(([city, aliases]) =>
  aliases.map((alias) => [city, `招聘${alias}保安1名`])
);

const SKILL_CASES = [
  [["Java"], "找北京Java开发，熟悉Spring"],
  [["Spring"], "招聘Java工程师，Spring经验"],
  [["Vue"], "找上海前端开发，熟悉Vue"],
  [["React"], "招聘Web前端，React项目经验"],
  [["Docker"], "找深圳运维工程师，熟悉Docker和CI/CD"],
  [["Linux运维"], "招聘运维，Linux运维经验"],
  [["RESTful API"], "找后端开发，RESTful API设计"],
  [["WMS系统"], "招聘仓库管理员，会用WMS"],
  [["巡逻"], "找保安，有巡逻经验"],
  [["Excel"], "招聘行政专员，熟练Excel"]
];

const CERT_CASES = [
  [["C1驾驶证"], "找北京商务司机，C1驾照"],
  [["C1驾驶证"], "招聘司机，持C1"],
  [["电工证"], "找重庆电工，有电工证"],
  [["保安证"], "招聘保安，需要保安证"],
  [["消防证"], "找安保，有消防证"],
  [["叉车证"], "招聘仓库管理员，叉车证"],
  [["PMP"], "找项目经理，PMP认证"],
  [["初级会计职称"], "招聘会计，初级会计证"],
  [["会计从业相关培训"], "找出纳，会计从业培训"],
  [["健康证"], "找保洁，健康证"]
];

const COLLISION_CASES = [
  ["前端开发", "招聘上海前端开发工程师，Vue经验", "后端开发"],
  ["后端开发", "找北京Java工程师，5年经验", "前端开发"],
  ["出纳", "招聘苏州出纳，现金管理", "会计"],
  ["会计", "找广州财务会计，报表编制", "出纳"],
  ["客户经理", "需要杭州大客户经理", "项目经理"],
  ["项目经理", "找成都项目经理，PMP", "客户经理"],
  ["运营专员", "招聘上海业务运营", "运维工程师"],
  ["运维工程师", "找北京DevOps运维", "运营专员"],
  ["资料员", "招聘北京文档管理员", "行政专员"],
  ["行政专员", "找深圳行政助理", "资料员"],
  ["UI设计师", "招聘上海UI设计师，Figma", "前端开发"],
  ["前端开发", "找杭州Web前端，Vue", "UI设计师"]
];

test("parseRequirement: all 27 approved roles resolve to canonical titles", () => {
  for (const [expected, query] of ROLE_PARSE_CASES) {
    const req = parseRequirement(query);
    assert.equal(req.jobTitle, expected, `query=${query}`);
  }
});

test("parseRequirement: legacy labels map to canonical titles", () => {
  for (const [expected, query] of LEGACY_PARSE_CASES) {
    const req = parseRequirement(query);
    assert.equal(req.jobTitle, expected, `legacy query=${query}`);
  }
});

test("parseRequirement: all ten approved cities and safe aliases", () => {
  for (const [expectedCity, query] of CITY_CASES) {
    const req = parseRequirement(query);
    assert.equal(req.city, expectedCity, `city query=${query}`);
  }
});

test("parseRequirement: safe one-character city aliases via Unicode escapes", () => {
  const SAFE_ONE_CHAR_ALIASES = [
    ["上海", "\u6CAA"],
    ["北京", "\u4EAC"],
    ["深圳", "\u6DF1"],
    ["广州", "\u7A57"]
  ];
  for (const [expectedCity, alias] of SAFE_ONE_CHAR_ALIASES) {
    const req = parseRequirement(`招聘${alias}保安1名`);
    assert.equal(req.city, expectedCity, `alias ${alias} should map to ${expectedCity}`);
    assert.equal(parseCityFromText(`招聘${alias}保安1名`), expectedCity);
  }
  assert.notEqual(parseCityFromText(`招聘\u82CF保安1名`), "苏州");
  assert.notEqual(parseRequirement("招聘\u82CF保安1名").city, "苏州");
});

test("parseRequirement: skill recognition from catalog and aliases", () => {
  for (const [expectedSkills, query] of SKILL_CASES) {
    const req = parseRequirement(query);
    for (const skill of expectedSkills) {
      assert.ok(
        req.requiredSkills.some((s) => s.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(s.toLowerCase())),
        `query=${query} missing skill ${skill}, got ${req.requiredSkills.join(",")}`
      );
    }
  }
});

test("parseRequirement: certificate aliases map to catalog values", () => {
  for (const [expectedCerts, query] of CERT_CASES) {
    const req = parseRequirement(query);
    for (const cert of expectedCerts) {
      assert.ok(req.requiredCertificates.includes(cert), `query=${query} missing cert ${cert}`);
    }
  }
});

test("parseRequirement: collision cases prefer longest specific alias", () => {
  for (const [expected, query, wrong] of COLLISION_CASES) {
    const req = parseRequirement(query);
    assert.equal(req.jobTitle, expected, `collision query=${query}`);
    assert.notEqual(req.jobTitle, wrong);
  }
});

test("canonicalizeJobTitle: stored legacy requirement labels stay match-compatible", () => {
  const legacyReqTitles = ["安保", "Java开发", "客服", "仓储物流"];
  const candidateTitles = ["商场安保", "Java开发", "在线客服", "仓储员", "保安", "后端开发", "客服专员", "仓库管理员"];
  for (const legacy of legacyReqTitles) {
    const canon = canonicalizeJobTitle(legacy);
    assert.ok(canonicalTitles.includes(canon), `${legacy} -> ${canon}`);
    for (const cand of candidateTitles) {
      const candCanon = canonicalizeJobTitle(cand);
      if (jobTitlesMatch(legacy, cand)) {
        assert.equal(canon, candCanon, `${legacy} should match ${cand}`);
      }
    }
  }
});

test("parseRequirement: Beijing backend with experience and availability", () => {
  const req = parseRequirement("找3名北京Java开发，5年以上经验，下周到岗");
  assert.equal(req.city, "北京");
  assert.equal(req.jobTitle, "后端开发");
  assert.equal(req.headcount, 3);
  assert.equal(req.minExperience, 5);
  assert.equal(req.availableBefore, "7天内");
  assert.ok(req.requiredSkills.some((s) => /java/i.test(s)));
});

test("parseRequirement: Shanghai security guards", () => {
  const req = parseRequirement("需要10名上海保安，3年以上经验，立即到岗");
  assert.equal(req.city, "上海");
  assert.equal(req.jobTitle, "保安");
  assert.equal(req.headcount, 10);
  assert.equal(req.minExperience, 3);
  assert.equal(req.availableBefore, "立即");
});

test("enrichParsedTags: canonicalizes preParsed legacy LLM job titles", () => {
  const { enrichParsedTags } = require("../lib/staffingMatch");
  const req = enrichParsedTags({
    rawQuery: "test",
    jobTitle: "Java开发",
    city: "北京市",
    headcount: 2,
    requiredSkills: ["java"],
    requiredCertificates: ["C1"],
    parsedTags: []
  });
  assert.equal(req.jobTitle, "后端开发");
  assert.equal(req.city, "北京");
  assert.ok(req.requiredSkills.some((s) => /java/i.test(s)));
  assert.equal(req.requiredCertificates[0], "C1驾驶证");
});

test("scoreCandidate: Shanghai security beats Beijing backend dev", () => {
  const req = parseRequirement("需要10名上海保安，3年以上经验，立即到岗");
  const guard = {
    jobTitle: "商场安保",
    preferredCity: "上海",
    yearsExperience: 4,
    skills: '["巡逻","消防"]',
    certificates: '["保安证","消防证"]',
    availabilityStatus: "可用",
    availableDate: "立即",
    employmentType: "灵活用工"
  };
  const backendDev = {
    jobTitle: "Java开发",
    preferredCity: "北京",
    yearsExperience: 6,
    skills: '["Java","Spring"]',
    certificates: '["计算机二级"]',
    availabilityStatus: "可用",
    availableDate: "7天内",
    employmentType: "全职"
  };
  const guardScore = scoreCandidate(req, guard).score;
  const backendScore = scoreCandidate(req, backendDev).score;
  assert.ok(guardScore > backendScore);
});

test("matchCandidates: backend query does not rank Shanghai guard first", () => {
  const candidates = [
    {
      id: 1,
      name: "赵安保",
      jobTitle: "商场安保",
      preferredCity: "上海",
      yearsExperience: 5,
      skills: '["巡逻"]',
      certificates: '["保安证"]',
      availabilityStatus: "可用",
      availableDate: "立即"
    },
    {
      id: 2,
      name: "李后端",
      jobTitle: "后端开发",
      preferredCity: "北京",
      yearsExperience: 6,
      skills: '["Java","Spring","MySQL"]',
      certificates: '[]',
      availabilityStatus: "可用",
      availableDate: "7天内"
    }
  ];
  const { matches, requirement } = matchCandidates("找3名北京Java开发，5年以上经验，下周到岗", candidates, 5);
  assert.equal(requirement.jobTitle, "后端开发");
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].candidate.name, "李后端");
});

test("matchCandidates: Shanghai security query ranks guard first", () => {
  const candidates = [
    {
      id: 1,
      name: "赵安保",
      jobTitle: "商场安保",
      preferredCity: "上海",
      yearsExperience: 4,
      skills: '["巡逻"]',
      certificates: '["保安证"]',
      availabilityStatus: "可用",
      availableDate: "立即"
    },
    {
      id: 2,
      name: "李后端",
      jobTitle: "后端开发",
      preferredCity: "北京",
      yearsExperience: 6,
      skills: '["Java"]',
      certificates: '[]',
      availabilityStatus: "可用",
      availableDate: "7天内"
    }
  ];
  const { matches } = matchCandidates("需要10名上海保安，3年以上经验，立即到岗", candidates, 5);
  assert.equal(matches[0].candidate.name, "赵安保");
});

test("matchCandidates: ranking prefers exact role and city over cross-role", () => {
  const req = parseRequirement("招聘深圳前端开发，Vue经验");
  const pool = [
    {
      name: "后端A",
      jobTitle: "后端开发",
      preferredCity: "深圳",
      yearsExperience: 8,
      skills: '["Java","Spring"]',
      availabilityStatus: "可用"
    },
    {
      name: "前端A",
      jobTitle: "前端开发",
      preferredCity: "深圳",
      yearsExperience: 4,
      skills: '["Vue","JavaScript"]',
      availabilityStatus: "可用"
    }
  ];
  const { matches } = matchCandidates(req.rawQuery, pool, 5, req);
  assert.equal(matches[0].candidate.name, "前端A");
});

test("talent pool integration: every approved role parses and ranks same-role candidate first", () => {
  const pool = JSON.parse(fs.readFileSync(TALENT_POOL_PATH, "utf8"));
  const candidates = pool.candidates;

  for (const title of canonicalTitles) {
    const roleCandidates = candidates.filter((c) => c.jobTitle === title);
    assert.equal(roleCandidates.length, 10, `${title} should have 10 synthetic candidates`);

    const suffix = ROLE_QUERY_SUFFIX[title];
    const probe = parseRequirement(`招聘上海${suffix}`);
    const minExp = probe.minExperience || 0;

    const eligible = roleCandidates.filter(
      (c) => c.availabilityStatus === "可用" && c.yearsExperience >= minExp
    );

    if (eligible.length === 0) {
      const query = title === "保安" ? `需要10名上海${suffix}` : `招聘上海${suffix}`;
      const parsed = parseRequirement(query);
      assert.equal(parsed.jobTitle, title, `parse failed for ${title}: ${query}`);
      const { matches } = matchCandidates(query, candidates, 20);
      assert.equal(matches.length, 0, `${title}: expected no matches when no eligible candidates`);
      continue;
    }

    const anchor = eligible.find((c) => c.preferredCity || c.currentCity) || eligible[0];
    const city = anchor.preferredCity || anchor.currentCity;
    assert.ok(city, `${title} anchor candidate needs a city`);

    const query = title === "保安" ? `需要10名${city}${suffix}` : `招聘${city}${suffix}`;

    const parsed = parseRequirement(query);
    assert.equal(parsed.jobTitle, title, `parse failed for ${title}: ${query}`);

    const { matches } = matchCandidates(query, candidates, 20);
    assert.ok(matches.length >= 1, `${title}: no matches for ${query}`);

    const top = matches[0].candidate;
    assert.equal(top.jobTitle, title, `${title}: top match was ${top.jobTitle} (${top.candidateCode || top.name})`);
    assert.notEqual(top.availabilityStatus, "不可用");

    const crossRoleFirst = matches.find((m) => m.candidate.jobTitle !== title);
    if (crossRoleFirst) {
      assert.ok(
        matches[0].score >= crossRoleFirst.score,
        `${title}: cross-role ${crossRoleFirst.candidate.jobTitle} outranked ${title}`
      );
    }
  }
});

test("jobCatalog helpers: direct title and city parsing smoke", () => {
  assert.equal(parseJobTitleFromText("Java工程师"), "后端开发");
  assert.equal(parseJobTitleFromText("安保巡逻"), "保安");
  assert.equal(parseJobTitleFromText("仓储物流专员"), "仓库管理员");
  assert.equal(parseCityFromText("深圳市"), "深圳");
  assert.ok(parseSkillsFromText("熟悉Vue和React").some((s) => /vue|react/i.test(s)));
  assert.ok(parseCertificatesFromText("持C1和电工证").includes("C1驾驶证"));
  assert.ok(parseCertificatesFromText("持C1和电工证").includes("电工证"));
});
