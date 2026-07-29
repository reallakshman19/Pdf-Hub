#!/usr/bin/env node
/**
 * guard-forbidden.mjs — blocks known regressions repo-wide.
 * Every rule here encodes a bug that was fixed once and must never return.
 * Run from repo root. Exit 1 on any violation.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const RULES = [
  {
    id: 'FB-1',
    why: 'C-2: lockfile must be authoritative; deploys must be reproducible.',
    files: ['.github/workflows'],
    pattern: /--no-frozen-lockfile/,
    message: 'Use `pnpm install --frozen-lockfile`.',
  },
  {
    id: 'FB-2',
    why: 'M-1: object-URL download logic lived in 5 copies, 4 with a revoke-too-early bug.',
    files: ['frontend/src'],
    pattern: /createObjectURL/,
    message: 'Object URLs are created only in the allowlisted owners below. Import downloadBlob from @/core/document/download.',
    allow: [
      'frontend/src/core/document/download.ts',
      'frontend/src/adapters/pdf-renderer/PdfRendererAdapter.ts',
      'frontend/src/core/ocr/engines/tesseractJsEngine.ts',
      'frontend/src/components/ocr/OcrSearchablePdfExportPanel.tsx',
    ],
  },
  {
    id: 'FB-3',
    why: 'H-1: no-selector store subscriptions re-render on every state change.',
    files: ['frontend/src'],
    pattern: /use(Session|WriterV2|Ocr|Annotation|Editor|Review|Search)Store\(\)/,
    message: 'Subscribe with a selector; use useShallow for object selections.',
  },
  {
    id: 'FB-4',
    why: 'H-2: static pdf-lib/html2canvas imports defeat code splitting.',
    files: ['frontend/src'],
    pattern: /^import\s+[\s\S]{0,200}?\sfrom\s+['"](pdf-lib|html2canvas)['"]/m,
    message: 'Use await pdfLib() from @/core/pdf/lazyPdfLib, or dynamic import().',
    allow: ['frontend/src/core/pdf/lazyPdfLib.ts'],
  },
  {
    id: 'FB-5',
    why: 'H-4: the diverged shadow source tree must stay deleted.',
    paths: ['core', 'archive', 'LICENSE-backend'],
    message: 'This path was deleted as a diverged duplicate. Do not recreate it.',
  },
  {
    id: 'FB-6',
    why: 'C-3: whole-PDF copies in reactive state.',
    files: ['frontend/src/core/session'],
    pattern: /new Uint8Array\(bytes\)/,
    message: 'Session bytes are copy-on-write. Share the reference; copy only at a mutating call site.',
  },
];

let failed = 0;
const report = (rule, hits) => {
  failed += 1;
  console.error(`\n✗ ${rule.id}  ${rule.message}`);
  console.error(`  rationale: ${rule.why}`);
  hits.slice(0, 10).forEach((h) => console.error(`    ${h}`));
  if (hits.length > 10) console.error(`    …and ${hits.length - 10} more`);
};

for (const rule of RULES) {
  if (rule.paths) {
    const hits = rule.paths.filter((p) => existsSync(p));
    if (hits.length) report(rule, hits);
    continue;
  }
  const listed = execSync(
    `git ls-files ${rule.files.join(' ')} | grep -Ev '\\.(test|spec)\\.[tj]sx?$' || true`,
    { encoding: 'utf8' },
  ).trim();
  if (!listed) continue;

  const hits = [];
  for (const file of listed.split('\n')) {
    if (rule.allow?.includes(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (rule.pattern.test(text)) hits.push(file);
  }
  if (hits.length) report(rule, hits);
}

if (failed) {
  console.error(`\n${failed} forbidden-pattern rule(s) violated.\n`);
  process.exit(1);
}
console.log('✓ guard-forbidden: all rules clean');
