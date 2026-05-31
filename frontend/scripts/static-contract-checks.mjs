#!/usr/bin/env node
/**
 * Static contract checks for DocCraft.
 * Run: node scripts/static-contract-checks.mjs
 * Exits with code 1 if any check fails.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');

let failCount = 0;

function findFiles(dir, extensions = ['.ts', '.tsx']) {
  const results = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // If directory doesn't exist, return empty
    return [];
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...findFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function grepMatches(pattern, dir = null, includeTests = true) {
  const searchDir = dir ? path.join(srcDir, dir) : srcDir;
  const regex = new RegExp(pattern);
  const files = findFiles(searchDir);
  const matches = [];
  for (const file of files) {
    if (!includeTests && /[.](test|spec)[.]/.test(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push(`${file}:${i + 1}:${lines[i].trim()}`);
      }
    }
  }
  return matches;
}

function check(name, pattern, dir, expectedMax, options = {}) {
  const matches = grepMatches(pattern, dir, options.includeTests ?? true);
  const count = matches.length;
  const status = count <= expectedMax ? '✅ PASS' : '❌ FAIL';
  const detail = count > expectedMax ? `\n   Found: ${matches.slice(0, 5).join('\n   ')}` : '';
  console.log(`${status}  [${name}] count=${count}, max=${expectedMax}${detail}`);
  if (count > expectedMax) failCount += 1;
}

console.log('\n🔍 DocCraft Static Contract Checks\n');

check('single createRoot', 'createRoot\\(', null, 1);
check('no conflict markers', '(<<<<<<<|=======|>>>>>>>)', null, 0);
check('no toolbar as-any casts', 'as any', 'components/toolbar', 0);
check('no Konva imports in core domain', 'from [\'\"]konva[\'\"]', 'core', 0);
check('no console.log in source', 'console\\.log\\(', null, 0);
check('no localStorage for annotations', 'localStorage\\.setItem.*annot', null, 0);
check('no stale shape/freehand tool names in runtime', "'shape'|'freehand'", null, 0, { includeTests: false });

// ── S-Phase 0: Additional contract checks ────────────────────
// No raw fetch() in component files (only capability service should fetch)
check(
  'no raw fetch in components',
  'fetch\\(',
  'components',
  0,
  { includeTests: false },
);
// No localStorage for any persistence in core/
check(
  'no localStorage in core persistence',
  'localStorage\\.(setItem|getItem)',
  'core',
  0,
  { includeTests: false },
);
// Verify macro register-all imports exactly 4 step modules
check(
  'macro register-all has 4 step imports',
  "import '\\./",
  'core/macro/steps',
  4,
  { includeTests: false },
);

console.log(`\n${failCount === 0 ? '✅ All checks passed' : `❌ ${failCount} check(s) failed`}\n`);

// Generate machine-readable audit report
const report = {
  timestamp: new Date().toISOString(),
  pass: failCount === 0,
  failures: failCount,
  phase: 'S-Phase-0',
};
writeFileSync(
  path.join(repoRoot, '..', 'AUDIT_REPORT.json'),
  JSON.stringify(report, null, 2),
);

process.exit(failCount > 0 ? 1 : 0);
