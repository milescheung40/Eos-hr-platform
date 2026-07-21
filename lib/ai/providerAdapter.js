const { getAiConfig } = require("./config");
const { chatJson } = require("./deepseekProvider");

const REQUIREMENT_SYSTEM = `你是人力资源用工需求解析助手。根据用户输入提取结构化字段，仅返回 JSON 对象，不要输出其它文字。
字段：jobTitle(岗位), city(城市), headcount(人数整数), minExperience(最低经验年数), requiredSkills(技能数组), requiredCertificates(证书数组), availableBefore(到岗时间如"立即"/"7天内"), employmentType(全职/灵活用工/兼职), budgetRange(预算描述)`;

const RESUME_SYSTEM = `你是简历结构化解析助手。根据合成演示简历文本提取字段，仅返回 JSON 对象，不要输出其它文字。
字段：name(姓名), jobTitle(岗位), city(城市), yearsExperience(经验年数), skills(技能数组), certificates(证书数组), availableDate(可到岗时间), employmentType, salaryRange(薪资范围描述), education(学历), summary(一句话摘要，不含联系方式)`;

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
