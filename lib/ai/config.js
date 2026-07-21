function readBool(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true" || value === "1";
}

function getAiConfig() {
  return {
    enabled: readBool(process.env.AI_ENABLED, false),
    provider: String(process.env.AI_PROVIDER || "deepseek").toLowerCase(),
    apiKey: String(process.env.AI_API_KEY || "").trim(),
    baseUrl: String(process.env.AI_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, ""),
    model: String(process.env.AI_MODEL || "deepseek-chat"),
    timeoutMs: Math.min(Math.max(Number(process.env.AI_TIMEOUT_MS) || 10000, 1000), 60000)
  };
}

function isAiReady() {
  const cfg = getAiConfig();
  return cfg.enabled && !!cfg.apiKey;
}

module.exports = { getAiConfig, isAiReady, readBool };
