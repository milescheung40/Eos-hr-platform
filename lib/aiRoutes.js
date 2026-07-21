const { parseRequirementWithFallback, parseResumeWithFallback } = require("./ai/parseService");

function registerAiRoutes(app, ctx) {
  const { auth, clampStr } = ctx;

  app.post("/api/ai/parse-requirement", auth(), async (req, res) => {
    const text = clampStr(req.body?.text ?? req.body?.query ?? "", 500);
    if (!text) return res.status(400).json({ message: "请提供岗位需求文本" });
    const result = await parseRequirementWithFallback(text);
    return res.json({
      requirement: result.data,
      parsedTags: result.data.parsedTags || [],
      parseSource: result.parseSource,
      parseSourceLabel: result.parseSourceLabel
    });
  });

  app.post("/api/ai/parse-resume", auth(), async (req, res) => {
    const text = clampStr(req.body?.text ?? req.body?.resume ?? "", 4000);
    if (!text) return res.status(400).json({ message: "请提供简历文本" });
    const result = await parseResumeWithFallback(text);
    return res.json({
      candidate: result.data,
      parseSource: result.parseSource,
      parseSourceLabel: result.parseSourceLabel
    });
  });
}

module.exports = { registerAiRoutes };
