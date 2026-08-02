const { parseRequirementWithFallback, parseResumeWithFallback } = require("./ai/parseService");
const {
  extractResumeTextFromUpload,
  resumeUploadMiddleware
} = require("./ai/resumeFileExtractor");

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
    const text = clampStr(req.body?.text ?? req.body?.resume ?? "", 12000);
    if (!text) return res.status(400).json({ message: "请提供简历文本" });
    const result = await parseResumeWithFallback(text);
    return res.json({
      candidate: result.data,
      parseSource: result.parseSource,
      parseSourceLabel: result.parseSourceLabel
    });
  });

  app.post(
    "/api/ai/parse-resume-file",
    auth(),
    resumeUploadMiddleware,
    async (req, res) => {
      try {
        const extracted = await extractResumeTextFromUpload(req.file);
        const result = await parseResumeWithFallback(extracted.text);
        return res.json({
          filename: extracted.filename,
          fileType: extracted.fileType,
          extractedCharCount: extracted.extractedCharCount,
          candidate: result.data,
          parseSource: result.parseSource,
          parseSourceLabel: result.parseSourceLabel
        });
      } catch (error) {
        const status = Number(error?.status) || 500;
        const message = status >= 500 ? "简历文件解析失败，请稍后重试" : error.message;
        if (status >= 500) console.error("[resume-upload]", error);
        return res.status(status).json({ message });
      }
    }
  );
}

module.exports = { registerAiRoutes };
