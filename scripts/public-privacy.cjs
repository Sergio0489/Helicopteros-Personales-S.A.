'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

// Scan the entire tracked text tree: GitHub is public and Pages serves the root.
// Do not print matched values, store fingerprints, or copy production data into fixtures.
function decode(text) {
  return text.replace(/\\u\{([\da-f]{1,6})\}|\\u([\da-f]{4})|\\x([\da-f]{2})|&#(\d+);|&#x([\da-f]+);/gi,
    (match, cp, u, x, dec, hex) => {
      const n = dec ? Number(dec) : parseInt(cp || u || x || hex, 16);
      return n <= 0x10ffff ? String.fromCodePoint(n) : match;
    });
}

function findings(text) {
  const source = decode(text), hits = [];
  const rules = [
    ['personal-id', /(?<![\w.-])(?:PE|N|E)?\d{1,2}-\d{1,4}-\d{1,6}(?![\w.-])/gi],
    ['mobile-phone', /(?<![\w.])(?:\+?507[ ()-]*)?6\d{3}[ -]?\d{4}(?![\w.])/g],
    ['personal-field', /\b(?:phone|residentialPhone|emergencyPhone|identity|document|cedula|licenseNumber|telefono|celular)["']?\s*:\s*["'][^"'\n]*\d[^"'\n]*["']/gi]
  ];
  for (const [rule, expression] of rules) {
    for (const match of source.matchAll(expression)) {
      hits.push({rule, line: source.slice(0, match.index).split('\n').length});
    }
  }
  return hits;
}

function scan(root) {
  const files = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  const failures = [];
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file));
    if (bytes.includes(0)) continue; // Binary images require a separate visual review.
    for (const hit of findings(bytes.toString('utf8'))) failures.push({file, ...hit});
  }
  return {files: files.length, failures};
}

if (require.main === module) {
  const result = scan(path.resolve(__dirname, '..'));
  for (const {file, line, rule} of result.failures) console.error(`${file}:${line}: ${rule} (value redacted)`);
  console.log(`Privacy scan: ${result.files} tracked files; ${result.failures.length} findings.`);
  process.exitCode = result.failures.length ? 1 : 0;
}
module.exports = {findings, scan};
