const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractResumeTextFromUpload,
  validateAndClassifyUpload,
  sanitizeFilename
} = require("../lib/ai/resumeFileExtractor");
const { buildResumeFromRule, canonicalizeResume } = require("../lib/ai/parseService");
const { makeDocxBuffer, makePdfBuffer } = require("./helpers/resumeFixtures");

test("DOCX resume extraction returns normalized real text", async () => {
  const buffer = await makeDocxBuffer("姓名：张三 北京 后端开发 5年工作经验 Java Spring 本科学历");
  const result = await extractResumeTextFromUpload({
    buffer,
    size: buffer.length,
    originalname: "张三 简历.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  assert.equal(result.fileType, "docx");
  assert.equal(result.filename, "张三 简历.docx");
  assert.match(result.text, /张三/);
  assert.ok(result.extractedCharCount >= result.text.length);
});

test("PDF resume extraction returns text", async () => {
  const buffer = await makePdfBuffer("Resume: Alice, frontend developer, 4 years experience, React");
  const result = await extractResumeTextFromUpload({
    buffer,
    size: buffer.length,
    originalname: "alice.pdf",
    mimetype: "application/pdf"
  });
  assert.equal(result.fileType, "pdf");
  assert.match(result.text, /Alice/);
});

test("upload validation rejects extension/signature mismatch and sanitizes filename", () => {
  assert.throws(
    () =>
      validateAndClassifyUpload({
        buffer: Buffer.from("not a pdf"),
        size: 9,
        originalname: "fake.pdf",
        mimetype: "application/pdf"
      }),
    /文件内容与扩展名不匹配/
  );
  assert.equal(sanitizeFilename("../../张三<script>.pdf"), "张三_script_.pdf");
});

test("local resume fallback extracts canonical evidenced fields", () => {
  const parsed = buildResumeFromRule(
    "姓名：张三\n现居北京，Java开发工程师，5年工作经验，本科学历，熟悉Java、Spring、MySQL，持计算机二级证书，可7天内到岗。"
  );
  assert.equal(parsed.name, "张三");
  assert.equal(parsed.jobTitle, "后端开发");
  assert.equal(parsed.city, "北京");
  assert.equal(parsed.yearsExperience, 5);
  assert.equal(parsed.education, "本科");
  assert.ok(parsed.skills.includes("Java"));
  assert.ok(parsed.certificates.includes("计算机二级"));
  assert.match(parsed.summary, /后端开发/);
});

test("AI resume fields are canonicalized against approved catalog", () => {
  const parsed = canonicalizeResume({
    name: "李四",
    jobTitle: "Java开发",
    city: "北京市",
    yearsExperience: 3,
    skills: ["springboot"],
    certificates: ["C1驾照"]
  });
  assert.equal(parsed.jobTitle, "后端开发");
  assert.equal(parsed.city, "北京");
  assert.ok(parsed.skills.includes("Spring"));
  assert.ok(parsed.certificates.includes("C1驾驶证"));
});
