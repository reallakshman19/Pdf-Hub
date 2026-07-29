#!/usr/bin/env node
/**
 * guard-ratchet.mjs — committed counters that may only move toward zero.
 * Prevents the classic agent failure of fixing three instances of a pattern
 * while introducing two new ones elsewhere.
 *
 * `--update` rewrites the baseline. CI must run it WITHOUT --update.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const COUNTERS = {
  'store-no-selector': String.raw`grep -rEn "use(Session|WriterV2|Ocr|Annotation|Editor|Review|Search)Store\(\)" frontend/src --include=*.tsx --include=*.ts | grep -v '\.test\.' | wc -l`,
  'static-pdflib':     String.raw`grep -rEn "^import .* from '(pdf-lib|html2canvas)'" frontend/src --include=*.ts --include=*.tsx | grep -v '\.test\.' | wc -l`,
  'createobjecturl-sites': String.raw`grep -rln "createObjectURL" frontend/src --include=*.ts --include=*.tsx | grep -v '\.test\.' | wc -l`,
  'set-state-in-effect': String.raw`grep -rn "react-hooks/set-state-in-effect" knownissues.md | wc -l`,
  'certify-scripts':   String.raw`grep -c '"certify:' frontend/package.json`,
};

const update = process.argv.includes('--update');
const path = 'tasks/RATCHET.json';
const baseline = JSON.parse(readFileSync(path, 'utf8'));
const current = {};

for (const [name, cmd] of Object.entries(COUNTERS)) {
  current[name] = Number(execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' }).trim()) || 0;
}

if (update) {
  writeFileSync(path, JSON.stringify(current, null, 2) + '\n');
  console.log('baseline updated:', current);
  process.exit(0);
}

let failed = false;
for (const [name, value] of Object.entries(current)) {
  const limit = baseline[name];
  if (limit === undefined) {
    console.error(`✗ ${name}: no baseline. Run --update on a clean tree.`);
    failed = true;
  } else if (value > limit) {
    console.error(`✗ ${name}: ${value} > baseline ${limit}. You added ${value - limit}.`);
    failed = true;
  } else {
    const moved = limit - value ? `  (−${limit - value})` : '';
    console.log(`✓ ${name}: ${value} ≤ ${limit}${moved}`);
  }
}
if (failed) { console.error('\nRatchet violated. Counters may only decrease.\n'); process.exit(1); }
console.log('\n✓ guard-ratchet: no regressions');
