import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const scanRoots = [
  'src/core/writer-v2',
  'src/components/writer-v2',
];

const forbiddenImports = [
  {
    name: 'macro dependency',
    pattern: /from\s+['"][^'"]*macro[^'"]*['"]/g,
  },
  {
    name: 'legacy annotation dependency',
    pattern: /from\s+['"][^'"]*annotations(?!-v2)[^'"]*['"]/g,
  },
  {
    name: 'server api dependency',
    pattern: /from\s+['"][^'"]*(server|api|backend|fastapi)[^'"]*['"]/g,
  },
  {
    name: 'legacy writer dependency',
    pattern: /from\s+['"][^'"]*core\/writer(?!-v2)[^'"]*['"]/g,
  },
  {
    name: 'legacy writer component dependency',
    pattern: /from\s+['"][^'"]*components\/writer(?!-v2)[^'"]*['"]/g,
  },
];

const findings = [];

for (const target of scanRoots) {
  const absolute = path.join(root, target);

  if (!fs.existsSync(absolute)) continue;

  for (const file of walk(absolute)) {
    const rel = normalize(path.relative(root, file));
    const text = fs.readFileSync(file, 'utf8');

    for (const rule of forbiddenImports) {
      const matches = [...text.matchAll(rule.pattern)];

      for (const match of matches) {
        findings.push({
          file: rel,
          rule: rule.name,
          match: compact(match[0]),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Writer Overlay V2 boundary audit failed.');
  console.error(JSON.stringify(findings, null, 2));
  process.exit(1);
}

console.log('Writer Overlay V2 boundary audit passed.');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walk(absolute);
      continue;
    }

    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      yield absolute;
    }
  }
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

function compact(value) {
  return value.replace(/\s+/g, ' ').slice(0, 220);
}
