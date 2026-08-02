const path = require("path");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_MODEL_TEXT = 12000;
const MIN_MEANINGFUL_CHARS = 8;

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);

const MIME_BY_TYPE = {
  pdf: new Set(["application/pdf"]),
  docx: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream"
  ])
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 }
});

function sanitizeFilename(name) {
  const base = path.basename(String(name || "upload").replace(/\\/g, "/"));
  const cleaned = base
    .replace(/[^\w\u4e00-\u9fff.\-()+ ]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "upload";
}

function getExtension(filename) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : "";
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function detectSignature(buffer, ext) {
  if (!buffer || buffer.length < 4) return false;
  if (ext === ".pdf") {
    return buffer.slice(0, 5).toString("ascii").startsWith("%PDF");
  }
  if (ext === ".docx") {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  return false;
}

function validateMimeType(mime, ext) {
  const type = ext === ".pdf" ? "pdf" : "docx";
  const normalized = String(mime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  return MIME_BY_TYPE[type].has(normalized);
}

function normalizeResumeText(raw) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasMeaningfulText(text) {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < MIN_MEANINGFUL_CHARS) return false;
  return /[\u4e00-\u9fffA-Za-z]{2,}/.test(text);
}

async function extractRawText(buffer, fileType) {
  if (fileType === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return parsed.text || "";
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (fileType === "docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value || "";
  }
  throw httpError(400, "仅支持 PDF 和 DOCX 格式的简历文件");
}

function validateAndClassifyUpload(file) {
  if (!file || !file.buffer) {
    throw httpError(400, "请上传简历文件");
  }
  if (file.size === 0 || file.buffer.length === 0) {
    throw httpError(400, "上传的文件为空，无法解析");
  }

  const filename = sanitizeFilename(file.originalname);
  const ext = getExtension(filename);
  if (!ext) {
    throw httpError(400, "仅支持 PDF 和 DOCX 格式的简历文件");
  }

  if (!validateMimeType(file.mimetype, ext)) {
    throw httpError(400, "文件 MIME 类型与格式不符");
  }

  if (!detectSignature(file.buffer, ext)) {
    throw httpError(400, "文件内容与扩展名不匹配，请上传有效的 PDF 或 DOCX 文件");
  }

  return {
    filename,
    fileType: ext === ".pdf" ? "pdf" : "docx",
    buffer: file.buffer
  };
}

async function extractResumeTextFromUpload(file) {
  const classified = validateAndClassifyUpload(file);
  let rawText = "";
  try {
    rawText = await extractRawText(classified.buffer, classified.fileType);
  } catch (error) {
    if (error?.status) throw error;
    throw httpError(400, `无法解析该${classified.fileType === "pdf" ? " PDF" : " DOCX"}文件，请确认文件未损坏或加密`);
  }
  const normalized = normalizeResumeText(rawText);

  if (!hasMeaningfulText(normalized)) {
    throw httpError(400, "无法从文件中提取有效文本，请确认文件非扫描件或图片版简历");
  }

  const extractedCharCount = normalized.length;
  const text = normalized.slice(0, MAX_MODEL_TEXT);

  return {
    filename: classified.filename,
    fileType: classified.fileType,
    extractedCharCount,
    text
  };
}

function resumeUploadMiddleware(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "文件大小不能超过 5MB" });
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ message: "每次仅可上传一个简历文件" });
      }
      return res.status(400).json({ message: "文件上传失败，请重试" });
    }
    return next(err);
  });
}

module.exports = {
  MAX_BYTES,
  MAX_MODEL_TEXT,
  sanitizeFilename,
  normalizeResumeText,
  hasMeaningfulText,
  validateAndClassifyUpload,
  extractResumeTextFromUpload,
  resumeUploadMiddleware
};
