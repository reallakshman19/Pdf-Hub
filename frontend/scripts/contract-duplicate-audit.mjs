import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
  {
    name: 'WriterTool',
    pattern: /\bexport\s+type\s+WriterTool\b/g,
    expected: 1,
  },
  {
    name: 'TransformHandle',
    pattern: /\bexport\s+type\s+TransformHandle\b/g,
    expected: 1,
  },
  {
    name: 'WriterStyles',
    pattern: /\bexport\s+interface\s+WriterStyles\b/g,
    expected: 1,
  },
  {
    name: 'WriterElementStyle',
    pattern: /\bexport\s+type\s+WriterElementStyle\b/g,
    expected: 1,
  },
  {
    name: 'WriterTableData',
    pattern: /\bexport\s+interface\s+WriterTableData\b/g,
    expected: 1,
  },
  {
    name: 'WriterTableModel',
    pattern: /\bexport\s+type\s+WriterTableModel\b/g,
    expected: 1,
  },
  {
    name: 'StepExecutor',
    pattern: /\bexport\s+type\s+StepExecutor\b/g,
    expected: 1,
  },
];

const files = collectFiles(path.join(root, 'src'));
let failures = 0;

for (const check of checks) {
  let count = 0;
  const locations = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(check.pattern);

    if (matches?.length) {
      count += matches.length;
      locations.push(path.relative(root, file).replaceAll('\\', '/'));
    }
  }

  if (count !== check.expected) {
    failures += 1;
    console.error(
      `[FAIL] ${check.name}: expected ${check.expected}, found ${count}. ` +
      `Files: ${Array.from(new Set(locations)).join(', ') || '-'}`
    );
  } else {
    console.log(`[PASS] ${check.name}`);
  }
}

if (failures > 0) {
  console.error(`\nContract duplicate audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nContract duplicate audit passed.');

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...collectFiles(full));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}