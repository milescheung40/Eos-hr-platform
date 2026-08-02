const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe("AI parse service", () => {
  beforeEach(() => {
    restoreEnv();
    delete require.cache[require.resolve("../lib/ai/config")];
    delete require.cache[require.resolve("../lib/ai/validators")];
    delete require.cache[require.resolve("../lib/ai/deepseekProvider")];
    delete require.cache[require.resolve("../lib/ai/providerAdapter")];
    delete require.cache[require.resolve("../lib/ai/parseService")];
  });

  afterEach(() => {
    restoreEnv();
  });

  test("AI_ENABLED=false uses rule fallback", async () => {
    process.env.AI_ENABLED = "false";
    process.env.AI_API_KEY = "sk-test";
    const { parseRequirementWithFallback, PARSE_SOURCE } = require("../lib/ai/parseService");
    const result = await parseRequirementWithFallback("找3名北京Java开发，5年以上经验，下周到岗");
    assert.equal(result.parseSource, PARSE_SOURCE.RULE);
    assert.equal(result.parseSourceLabel, "规则兜底");
    assert.ok(result.data.jobTitle);
    assert.ok(result.data.parsedTags?.length);
  });

  test("missing API key uses rule fallback without throwing", async () => {
    process.env.AI_ENABLED = "true";
    delete process.env.AI_API_KEY;
    const { parseRequirementWithFallback, PARSE_SOURCE } = require("../lib/ai/parseService");
    const result = await parseRequirementWithFallback("需要10名上海保安，3年以上经验，立即到岗");
    assert.equal(result.parseSource, PARSE_SOURCE.RULE);
    assert.ok(result.data.city || result.data.jobTitle);
  });

  test("invalid AI JSON falls back to rule parser", async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_API_KEY = "sk-test";
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not-json-at-all" } }]
      })
    });
    try {
      const { parseRequirementWithFallback, PARSE_SOURCE } = require("../lib/ai/parseService");
      const result = await parseRequirementWithFallback("找3名北京Java开发，5年以上经验，下周到岗");
      assert.equal(result.parseSource, PARSE_SOURCE.RULE);
      assert.equal(result.data.jobTitle, "后端开发");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("AI timeout falls back to rule parser", async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_TIMEOUT_MS = "50";
    const originalFetch = global.fetch;
    global.fetch = (_url, opts) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    try {
      const { parseRequirementWithFallback, PARSE_SOURCE } = require("../lib/ai/parseService");
      const result = await parseRequirementWithFallback("招聘5名深圳客服，普通话标准，立即上岗");
      assert.equal(result.parseSource, PARSE_SOURCE.RULE);
      assert.ok(result.data.parsedTags?.length);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("valid AI JSON returns ai source", async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_MODEL = "deepseek-v4-flash";
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                jobTitle: "Java开发",
                city: "北京",
                headcount: 3,
                minExperience: 5,
                requiredSkills: ["Java", "Spring"],
                requiredCertificates: [],
                availableBefore: "7天内",
                employmentType: "全职",
                budgetRange: ""
              })
            }
          }
        ]
      })
    });
    try {
      const { parseRequirementWithFallback, PARSE_SOURCE } = require("../lib/ai/parseService");
      const result = await parseRequirementWithFallback("找3名北京Java开发，5年以上经验，下周到岗");
      assert.equal(result.parseSource, PARSE_SOURCE.AI);
      assert.equal(result.parseSourceLabel, "AI大模型解析");
      assert.equal(result.data.headcount, 3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("parse-resume without AI returns rule fallback empty shape", async () => {
    process.env.AI_ENABLED = "false";
    const { parseResumeWithFallback, PARSE_SOURCE } = require("../lib/ai/parseService");
    const result = await parseResumeWithFallback("姓名：演示员A，岗位：Java工程师，城市：北京，5年经验");
    assert.equal(result.parseSource, PARSE_SOURCE.RULE);
    assert.equal(typeof result.data, "object");
  });
});

describe("AI validators", () => {
  test("reject malformed requirement JSON", () => {
    const { validateRequirementShape } = require("../lib/ai/validators");
    assert.equal(validateRequirementShape(null), null);
    assert.equal(validateRequirementShape([]), null);
    assert.equal(validateRequirementShape({ jobTitle: "", city: "" }).jobTitle, "");
  });
});

describe("AI config and provider", () => {
  beforeEach(() => {
    restoreEnv();
    delete require.cache[require.resolve("../lib/ai/config")];
    delete require.cache[require.resolve("../lib/ai/deepseekProvider")];
    delete require.cache[require.resolve("../lib/ai/providerAdapter")];
    delete require.cache[require.resolve("../lib/ai/parseService")];
  });

  afterEach(() => {
    restoreEnv();
  });

  test("default model is deepseek-v4-flash", () => {
    delete process.env.AI_MODEL;
    const { getAiConfig } = require("../lib/ai/config");
    assert.equal(getAiConfig().model, "deepseek-v4-flash");
  });

  test("chat completions URL matches official docs", () => {
    const { getChatCompletionsUrl } = require("../lib/ai/config");
    assert.equal(getChatCompletionsUrl("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
    assert.equal(
      getChatCompletionsUrl("https://api.deepseek.com/v1"),
      "https://api.deepseek.com/v1/chat/completions"
    );
  });

  test("provider request includes max_tokens and does not call real API", async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_API_KEY = "sk-test-mock";
    process.env.AI_MODEL = "deepseek-v4-flash";
    process.env.AI_BASE_URL = "https://api.deepseek.com";
    process.env.AI_MAX_TOKENS = "1024";
    let capturedUrl = "";
    let capturedBody = null;
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  jobTitle: "Java开发",
                  city: "北京",
                  headcount: 2,
                  minExperience: 3,
                  requiredSkills: ["Java"],
                  requiredCertificates: [],
                  availableBefore: "立即",
                  employmentType: "全职",
                  budgetRange: ""
                })
              }
            }
          ]
        })
      };
    };
    try {
      const { parseRequirementWithFallback, PARSE_SOURCE } = require("../lib/ai/parseService");
      const result = await parseRequirementWithFallback("找2名北京Java开发，3年以上经验，立即到岗");
      assert.equal(capturedUrl, "https://api.deepseek.com/chat/completions");
      assert.equal(capturedBody.model, "deepseek-v4-flash");
      assert.equal(capturedBody.max_tokens, 1024);
      assert.equal(capturedBody.response_format?.type, "json_object");
      assert.equal(result.parseSource, PARSE_SOURCE.AI);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
