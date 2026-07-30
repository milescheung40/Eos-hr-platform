function readBool(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true" || value === "1";
}

/** 官方推荐 base: https://api.deepseek.com （也兼容 .../v1 OpenAI SDK 风格） */
function normalizeBaseUrl(raw) {
  return String(raw || "https://api.deepseek.com").trim().replace(/\/+$/, "");
}

/**
 * 拼接 Chat Completions 完整 URL。
 * 官方文档: POST https://api.deepseek.com/chat/completions
 * OpenAI SDK 风格 base .../v1 → .../v1/chat/completions
 */
function getChatCompletionsUrl(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  return `${base}/chat/completions`;
}

function getAiConfig() {
  return {
    enabled: readBool(process.env.AI_ENABLED, false),
    provider: String(process.env.AI_PROVIDER || "deepseek").toLowerCase(),
    apiKey: String(process.env.AI_API_KEY || "").trim(),
    baseUrl: normalizeBaseUrl(process.env.AI_BASE_URL),
    model: String(process.env.AI_MODEL || "deepseek-v4-flash"),
    timeoutMs: Math.min(Math.max(Number(process.env.AI_TIMEOUT_MS) || 10000, 1000), 60000),
    maxTokens: Math.min(Math.max(Number(process.env.AI_MAX_TOKENS) || 1024, 256), 4096)
  };
}

function isAiReady() {
  const cfg = getAiConfig();
  return cfg.enabled && !!cfg.apiKey;
}

module.exports = { getAiConfig, isAiReady, readBool, normalizeBaseUrl, getChatCompletionsUrl };
