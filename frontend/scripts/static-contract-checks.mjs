#!/usr/bin/env node
/**
 * Static contract checks for DocCraft.
 * Run: node scripts/static-contract-checks.mjs
 * Exits with code 1 if any check fails.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');

let failCount = 0;

function grepMatches(pattern, dir = null, includeTests = true) {
  const searchDir = dir ? path.join(srcDir, dir) : srcDir;
  const result = spawnSync(
    'grep',
    ['-rn', '--include=*.ts', '--include=*.tsx', '-E', pattern, searchDir],
    { encoding: 'utf8' },
  );

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `grep failed for ${pattern}`);
  }

  return (result.stdout ?? '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((line) => includeTests || !/[.](test|spec)[.]/.test(line));
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

console.log(`\n${failCount === 0 ? '✅ All checks passed' : `❌ ${failCount} check(s) failed`}\n`);
process.exit(failCount > 0 ? 1 : 0);
