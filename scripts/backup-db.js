#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "eos_hr.db");
const dir = path.join(root, "backups");

if (!fs.existsSync(src)) {
  console.error("eos_hr.db not found");
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
const dest = path.join(dir, `eos_hr_${stamp}.db`);
fs.copyFileSync(src, dest);
console.log(dest);
