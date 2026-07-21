const { parseRequirement, scoreCandidate, matchCandidates } = require("../lib/staffingMatch");
const test = require("node:test");
const assert = require("node:assert/strict");

test("parseRequirement: Beijing Java with experience and availability", () => {
  const req = parseRequirement("找3名北京Java开发，5年以上经验，下周到岗");
  assert.equal(req.city, "北京");
  assert.equal(req.jobTitle, "Java开发");
  assert.equal(req.headcount, 3);
  assert.equal(req.minExperience, 5);
  assert.equal(req.availableBefore, "7天内");
  assert.ok(req.requiredSkills.includes("Java"));
});

test("parseRequirement: Shanghai security guards", () => {
  const req = parseRequirement("需要10名上海保安，3年以上经验，立即到岗");
  assert.equal(req.city, "上海");
  assert.equal(req.jobTitle, "安保");
  assert.equal(req.headcount, 10);
  assert.equal(req.minExperience, 3);
  assert.equal(req.availableBefore, "立即");
});

test("scoreCandidate: Shanghai security beats Beijing Java dev", () => {
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
  const javaDev = {
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
  const javaScore = scoreCandidate(req, javaDev).score;
  assert.ok(guardScore > javaScore);
});

test("matchCandidates: Java query does not rank Shanghai guard first", () => {
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
      name: "李Java",
      jobTitle: "Java开发",
      preferredCity: "北京",
      yearsExperience: 6,
      skills: '["Java","Spring","MySQL"]',
      certificates: '["计算机二级"]',
      availabilityStatus: "可用",
      availableDate: "7天内"
    }
  ];
  const { matches } = matchCandidates("找3名北京Java开发，5年以上经验，下周到岗", candidates, 5);
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].candidate.name, "李Java");
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
      name: "李Java",
      jobTitle: "Java开发",
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
