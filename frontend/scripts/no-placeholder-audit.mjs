import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const scanRoots = [
  'src/core',
  'src/components',
];

const forbidden = [
  /passThroughMutation/g,
  /placeholder kept deterministic/g,
  /TODO implementation/g,
  /mock-only implementation/g,
  /fake adapter/g,
  /return\s+passThrough/g,
];

const allowedTestPattern = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

let failures = 0;

for (const scanRoot of scanRoots) {
  const abs = path.join(root, scanRoot);

  if (!fs.existsSync(abs)) continue;

  for (const file of walk(abs)) {
    const rel = path.relative(root, file).replaceAll('\\', '/');

    if (allowedTestPattern.test(rel)) continue;

    const text = fs.readFileSync(file, 'utf8');

    for (const pattern of forbidden) {
      const matches = text.match(pattern);

      if (matches?.length) {
        failures += matches.length;
        console.error(`[FAIL] ${rel}: matched ${pattern}`);
      }
    }
  }
}

if (failures > 0) {
  console.error(`\nNo-placeholder audit failed: ${failures} active runtime match(es).`);
  process.exit(1);
}

console.log('No-placeholder audit passed.');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      yield* walk(full);
      continue;
    }

    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      yield full;
    }
  }
}