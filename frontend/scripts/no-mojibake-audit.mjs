import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const TARGETS = [
  'src',
  'scripts',
  'package.json',
  'playwright.config.ts',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.app.json',
];

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'reports',
  '.git',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
]);

const BAD_PATTERNS = [
  { label: 'UTF-8 BOM rendered as text', pattern: '∩╗┐' },
  { label: 'Windows-1252 mojibake marker', pattern: 'Γ' },
  { label: 'middle-dot mojibake marker', pattern: '┬' },
  { label: 'replacement character', pattern: '\uFFFD' },
  { label: 'ellipsis mojibake', pattern: 'â€¦' },
  { label: 'em-dash mojibake', pattern: 'â€”' },
  { label: 'checkmark mojibake', pattern: 'âœ' },
];

const failures = [];

for (const target of TARGETS) {
  const fullPath = path.join(root, target);
  if (!fs.existsSync(fullPath)) continue;
  scan(fullPath);
}

if (failures.length > 0) {
  console.error('Mojibake audit failed. Fix corrupted text before certification.');
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line}: ${failure.label}: ${failure.preview}`);
  }
  process.exit(1);
}

console.log('No mojibake markers found in source/scripts.');

function scan(fullPath) {
  const stat = fs.statSync(fullPath);

  if (stat.isDirectory()) {
    const base = path.basename(fullPath);
    if (IGNORE_DIRS.has(base)) return;

    for (const entry of fs.readdirSync(fullPath)) {
      scan(path.join(fullPath, entry));
    }
    return;
  }

  if (!stat.isFile()) return;
  if (!isTextFile(fullPath)) return;

  const rel = normalize(path.relative(root, fullPath));
  if (rel === 'scripts/no-mojibake-audit.mjs') return;
  const text = fs.readFileSync(fullPath, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const item of BAD_PATTERNS) {
      if (line.includes(item.pattern)) {
        failures.push({
          file: rel,
          line: index + 1,
          label: item.label,
          preview: line.trim().slice(0, 180),
        });
      }
    }
  });
}

function isTextFile(fullPath) {
  return TEXT_EXTENSIONS.has(path.extname(fullPath).toLowerCase());
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}
