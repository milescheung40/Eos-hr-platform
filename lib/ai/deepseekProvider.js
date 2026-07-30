const { getAiConfig, getChatCompletionsUrl } = require("./config");

async function chatJson(systemPrompt, userPrompt) {
  const cfg = getAiConfig();
  const url = getChatCompletionsUrl(cfg.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: cfg.maxTokens,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const err = new Error(`AI provider HTTP ${res.status}`);
      err.code = res.status === 429 ? "RATE_LIMIT" : "HTTP_ERROR";
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    if (!content) {
      const err = new Error("AI provider empty response");
      err.code = "EMPTY_RESPONSE";
      throw err;
    }
    return content;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("AI provider timeout");
      err.code = "TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatJson };
