// lib/bibleFiles.js
// Reads Joshua's Bible files for the owner-only /bible page. Fixed file names only, so no path input.
const fs = require("fs");
const path = require("path");

const FILES = ["README.md", "BIBLE.md", "LESSONS.md"];

function bibleDir() {
  return process.env.BIBLE_DIR || path.join("C:\Users\jjard\claude\joshua-bible");
}

function readBible(dir = bibleDir()) {
  const out = {};
  for (const name of FILES) {
    const file = path.join(dir, name);
    out[name] = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : `(missing: ${name})`;
  }
  return out;
}

module.exports = { readBible, FILES, bibleDir };
