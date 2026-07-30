const { getAiConfig } = require("./config");
const { chatJson } = require("./deepseekProvider");

const REQUIREMENT_SYSTEM = `你是人力资源用工需求解析助手。根据用户输入提取结构化字段，仅返回 JSON 对象，不要输出其它文字。

字段说明：
- jobTitle: 岗位名称
- city: 工作城市
- headcount: 人数（整数）
- minExperience: 最低经验年数（整数）
- requiredSkills: 技能数组
- requiredCertificates: 证书数组
- availableBefore: 到岗时间（如"立即"、"7天内"）
- employmentType: 全职 / 灵活用工 / 兼职
- budgetRange: 预算描述（可为空字符串）

完整输出示例：
{
  "jobTitle": "Java开发",
  "city": "北京",
  "headcount": 3,
  "minExperience": 5,
  "requiredSkills": ["Java", "Spring"],
  "requiredCertificates": [],
  "availableBefore": "7天内",
  "employmentType": "全职",
  "budgetRange": ""
}`;

const RESUME_SYSTEM = `你是简历结构化解析助手。根据合成演示简历文本提取字段，仅返回 JSON 对象，不要输出其它文字。不要输出手机号、身份证号等联系方式。

字段说明：
- name: 姓名
- jobTitle: 岗位
- city: 城市
- yearsExperience: 经验年数（整数）
- skills: 技能数组
- certificates: 证书数组
- availableDate: 可到岗时间
- employmentType: 全职 / 灵活用工 / 兼职
- salaryRange: 薪资范围描述
- education: 学历
- summary: 一句话摘要（不含联系方式）

完整输出示例：
{
  "name": "演示员A",
  "jobTitle": "Java工程师",
  "city": "北京",
  "yearsExperience": 5,
  "skills": ["Java", "Spring", "MySQL"],
  "certificates": [],
  "availableDate": "7天内",
  "employmentType": "全职",
  "salaryRange": "20k-30k",
  "education": "本科",
  "summary": "5年后端开发经验，熟悉Java生态"
}`;

async function invokeProvider(kind, userText) {
  const cfg = getAiConfig();
  if (cfg.provider === "deepseek") {
    const system = kind === "requirement" ? REQUIREMENT_SYSTEM : RESUME_SYSTEM;
    return chatJson(system, userText.slice(0, 4000));
  }
  const err = new Error(`Unsupported AI provider: ${cfg.provider}`);
  err.code = "UNSUPPORTED_PROVIDER";
  throw err;
}

module.exports = { invokeProvider };
