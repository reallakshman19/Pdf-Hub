import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const scanRoots = [
  'src/core/macro',
  'src/components/macro',
  'src/pages/MacroBuilderPage.tsx',
];

const excludedFilePatterns = [
  /\.(test|spec)\.(ts|tsx|js|jsx)$/i,
  /slice\d+\.test\.(ts|tsx|js|jsx)$/i,
];

const forbiddenPatterns = [
  {
    name: 'pass-through mutation',
    pattern: /passThroughMutation/g,
  },
  {
    name: 'placeholder implementation',
    pattern: /\bplaceholder\b/gi,
  },
  {
    name: 'todo implementation',
    pattern: /TODO\s*:?\s*implement/gi,
  },
  {
    name: 'fake adapter',
    pattern: /fake\s+adapter/gi,
  },
  {
    name: 'mock-only production implementation',
    pattern: /mock-only/gi,
  },
  {
    name: 'successful unchanged workingBytes mutation',
    pattern: /status\s*:\s*['"]success['"][\s\S]{0,240}bytes\s*:\s*state\.workingBytes/g,
  },
  {
    name: 'not implemented success path',
    pattern: /not\s+implemented[\s\S]{0,180}status\s*:\s*['"]success['"]/gi,
  },
];

const allowedProductionOccurrences = [
  {
    file: 'src/components/macro/builder/MacroFieldEditor.tsx',
    pattern: /Nested step editing is handled by the nested branch controls/g,
    reason: 'UI explanatory text, not a placeholder implementation.',
  },
];

let failures = 0;
const findings = [];

for (const target of scanRoots) {
  const absolute = path.join(root, target);

  if (!fs.existsSync(absolute)) continue;

  const files = fs.statSync(absolute).isDirectory()
    ? [...walk(absolute)]
    : [absolute];

  for (const file of files) {
    const rel = normalize(path.relative(root, file));

    if (excludedFilePatterns.some((pattern) => pattern.test(rel))) continue;

    const text = fs.readFileSync(file, 'utf8');

    for (const forbidden of forbiddenPatterns) {
      const matches = [...text.matchAll(forbidden.pattern)];

      for (const match of matches) {
        if (isAllowed(rel, match[0])) continue;

        failures += 1;
        findings.push({
          file: rel,
          check: forbidden.name,
          match: compact(match[0]),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Active placeholder audit failed.');
  console.error(JSON.stringify(findings, null, 2));
  process.exit(1);
}

console.log('Active placeholder audit passed.');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      yield* walk(absolute);
      continue;
    }

    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      yield absolute;
    }
  }
}

function isAllowed(file, text) {
  return allowedProductionOccurrences.some((allowance) => {
    return allowance.file === file && allowance.pattern.test(text);
  });
}

function compact(value) {
  return value.replace(/\s+/g, ' ').slice(0, 240);
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}