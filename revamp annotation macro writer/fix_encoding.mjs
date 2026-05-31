import { readFileSync, writeFileSync } from 'fs';

const file = 'C:\\Users\\reall\\.gemini\\antigravity\\brain\\5d036229-e0af-4168-9509-0164c3a95e7e\\implementation_plan.md';

// Read file as binary buffer first
const buf = readFileSync(file);

// Try reading as UTF-8
let content = buf.toString('utf8');

// Remove BOM
content = content.replace(/^\uFEFF/, '');

// Let's find what the actual bad sequence is
const idx = content.indexOf('S-Phase 2 ');
const badChar = content.substring(idx + 10, idx + 12);
console.log('Bad chars code points:', [...badChar].map(c => 'U+' + c.codePointAt(0).toString(16).padStart(4, '0')));

// Just replace ALL instances of this bad character sequence with em-dash
// The bad sequence appears to be U+FFFD U+001D or similar
// Let's just replace any non-ASCII dash-like thing between "S-Phase N " and " " with " — "

// Actually, let's just use a regex to find "S-Phase N <garbage> " and fix it
content = content.replace(/(S-Phase [\d.]+[a-z]?\s+)([^A-Za-z\n]+?)(\s+)/g, (match, prefix, garbage, suffix) => {
  // If garbage doesn't contain a real dash, replace with em-dash
  if (!garbage.includes('—') && !garbage.includes('-')) {
    return prefix + '—' + suffix;
  }
  return match;
});

// Also fix "S-Phase N<garbage>headername" patterns in ## headers
content = content.replace(/## (S-Phase [\d.]+[a-z]?) [^\w\n—-]+/g, '## $1 — ');
content = content.replace(/### (S-Phase [\d.]+[a-z]?) [^\w\n—-]+/g, '### $1 — ');
content = content.replace(/#### (S-Phase [\d.]+[a-z]?) [^\w\n—-]+/g, '#### $1 — ');

// Fix other known broken patterns - search broadly for non-printable junk
// between words where em-dashes should be
content = content.replace(/ [^\x20-\x7E\u00A0-\uFFEF]{1,4} /g, (match) => {
  // Check if surrounded by normal text - likely an em-dash
  return ' — ';
});

// Fix specific patterns we know about
// "PDF ↔ viewport" has an arrow that might be broken
content = content.replace(/PDF [^\x20-\x7E]{1,4} viewport/g, 'PDF ↔ viewport');

// Fix arrows in bullet points
content = content.replace(/[^\x20-\x7E]{1,4}([A-Za-z])/g, (match, nextChar) => {
  // Don't replace legitimate unicode - only replace if it looks like corruption
  // Check the match chars - if they're in control character range, replace
  const badPart = match.slice(0, -1);
  const isBad = [...badPart].some(c => c.codePointAt(0) < 0x20 || (c.codePointAt(0) >= 0x80 && c.codePointAt(0) < 0xA0));
  return isBad ? '—' + nextChar : match;
});

writeFileSync(file, content, 'utf8');

// Verify
const check = readFileSync(file, 'utf8');
const verifyIdx = check.indexOf('S-Phase 2');
console.log('Verify:', JSON.stringify(check.substring(verifyIdx, verifyIdx + 70)));
console.log('Total lines:', check.split('\n').length);
