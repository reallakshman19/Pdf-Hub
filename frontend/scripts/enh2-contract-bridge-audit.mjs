import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
  {
    id: 'WRITER_TYPES_COMPAT_ALIASES',
    file: 'src/core/writer/types.ts',
    required: [
      /export\s+type\s+WriterTool/,
      /export\s+type\s+WriterStyles\s*=\s*WriterElementStyle/,
      /export\s+type\s+WriterTableData\s*=\s*WriterTableModel/,
    ],
  },
  {
    id: 'WRITER_EXPORTER_VISIBLE_REEXPORT',
    file: 'src/core/writer/exporter.ts',
    required: [
      /visibleWriterElementsForExport/,
      /from\s+['"]\.\/writerObjects['"]/,
    ],
  },
  {
    id: 'MACRO_REGISTRY_SYNC_ASYNC_EXECUTOR',
    file: 'src/core/macro/registry.ts',
    required: [
      /StepResult\s*\|\s*Promise<StepResult>/,
      /await\s+executor/,
    ],
  },
];

let failures = 0;

for (const check of checks) {
  const filePath = path.join(root, check.file);

  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] ${check.id}: missing ${check.file}`);
    failures += 1;
    continue;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  let failed = false;

  for (const pattern of check.required) {
    if (!pattern.test(text)) {
      console.error(`[FAIL] ${check.id}: missing ${pattern}`);
      failed = true;
      failures += 1;
    }
  }

  if (!failed) {
    console.log(`[PASS] ${check.id}`);
  }
}

if (failures > 0) {
  console.error(`\nContract bridge audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nContract bridge audit passed.');
