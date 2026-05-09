import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const REQUIRED_GROUPS = [
  {
    name: 'Writer core',
    requiredAny: [
      'src/core/writer/types.ts',
      'src/core/writer/content-model.ts',
      'src/core/writer/content-serialization.ts',
      'src/core/writer/migrations.ts',
    ],
  },
  {
    name: 'Writer clipboard',
    requiredAny: [
      'src/core/writer/clipboard/readClipboard.ts',
      'src/core/writer/clipboard/clipboardToElements.ts',
      'src/core/writer/clipboard/pasteController.ts',
    ],
  },
  {
    name: 'Writer rich text',
    requiredAny: [
      'src/core/writer/richTextHtml.ts',
      'src/core/writer/richTextCommands.ts',
      'src/components/writer/RichTextEditorPanel.tsx',
    ],
  },
  {
    name: 'Writer table',
    requiredAny: [
      'src/core/writer/tableSelection.ts',
      'src/core/writer/tableCommands.ts',
      'src/components/writer/TableEditorPanel.tsx',
    ],
  },
  {
    name: 'Writer image',
    requiredAny: [
      'src/core/writer/imageImport.ts',
      'src/core/writer/imageTransforms.ts',
      'src/components/writer/ImageEditorPanel.tsx',
    ],
  },
  {
    name: 'Writer inspector/templates/ribbon',
    requiredAny: [
      'src/components/writer/WriterInspectorPanel.tsx',
      'src/components/writer/WriterObjectListPanel.tsx',
      'src/components/writer/WriterTemplateGallery.tsx',
      'src/components/writer/WriterRibbon.tsx',
      'src/components/writer/WriterSidePanel.tsx',
    ],
  },
  {
    name: 'Writer export/certification',
    requiredAny: [
      'src/core/writer/exporter.ts',
      'scripts/writer-static-audit.mjs',
      'WRITER_CERTIFICATION.md',
    ],
  },
  {
    name: 'Macro engine',
    requiredAny: [
      'src/core/macro/types.ts',
      'src/core/macro/registry.ts',
      'src/core/macro/executor.ts',
      'src/core/macro/transaction.ts',
      'src/core/macro/dry-run.ts',
      'src/core/macro/register-all.ts',
    ],
  },
  {
    name: 'Macro validation/security',
    requiredAny: [
      'src/core/macro/validator.ts',
      'src/core/macro/security.ts',
      'src/core/macro/validation/guards.ts',
      'src/core/macro/validation/op-validators.ts',
    ],
  },
  {
    name: 'Macro schema/catalog/builder state',
    requiredAny: [
      'src/core/macro/schema/opSchema.ts',
      'src/core/macro/builder/recipeBuilderState.ts',
      'src/core/macro/recipes/builtInRecipes.ts',
      'src/core/macro/recipes/recipeStorage.ts',
    ],
  },
  {
    name: 'Macro UI',
    requiredAny: [
      'src/components/macro/MacroDropdown.tsx',
      'src/components/macro/MacroPanel.tsx',
      'src/components/macro/builder/MacroRecipeBuilder.tsx',
      'src/components/macro/builder/MacroStepEditor.tsx',
    ],
  },
  {
    name: 'Macro certification',
    requiredAny: [
      'src/core/macro/macroCertification.wave7.test.ts',
      'scripts/macro-static-audit.mjs',
      'MACRO_CERTIFICATION.md',
    ],
  },
];

const EXPECTED_DOCS = [
  'ENH2_INTEGRATION_AUDIT.md',
  'ENH2_ERROR_REGISTER.md',
  'ENH2_SHARED_CONTRACTS.md',
  'ENH2_CONFLICT_RESOLUTION.md',
  'ENH2_FINAL_CERTIFICATION.md',
];

const EXPECTED_SOURCE_ROOTS = [
  'src/core/writer',
  'src/components/writer',
  'src/core/macro',
  'src/components/macro',
];

const report = [];
const warnings = [];
const failures = [];

main();

function main() {
  section('PDF Hub Enh2 Integration Audit');

  report.push(`Working directory: ${root}`);
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('');

  auditPackageJson();
  auditExpectedRoots();
  auditRequiredGroups();
  auditDuplicateSuspiciousFiles();
  auditExpectedDocs();
  writeReports();

  if (failures.length > 0) {
    console.error(`ENH2 integration audit completed with ${failures.length} failure(s).`);
    process.exitCode = 1;
  } else {
    console.log('ENH2 integration audit passed.');
  }
}

function auditPackageJson() {
  section('Package scripts');

  const packagePath = path.join(root, 'package.json');

  if (!fs.existsSync(packagePath)) {
    fail('package.json not found in frontend root.');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const scripts = pkg.scripts ?? {};

  const scriptChecks = [
    'typecheck',
    'test',
    'build',
    'audit:writer',
    'audit:macro',
    'certify:writer',
    'certify:macro',
    'audit:enh2',
    'audit:enh2:shared',
    'errors:enh2',
    'certify:enh2',
  ];

  for (const script of scriptChecks) {
    if (scripts[script]) pass(`script ${script}: ${scripts[script]}`);
    else warn(`missing script ${script}`);
  }
}

function auditExpectedRoots() {
  section('Expected source roots');

  for (const rel of EXPECTED_SOURCE_ROOTS) {
    if (exists(rel)) {
      const fileCount = countFiles(rel);
      pass(`${rel} exists (${fileCount} file(s))`);
    } else {
      warn(`${rel} missing`);
    }
  }
}

function auditRequiredGroups() {
  section('Enhancement module groups');

  for (const group of REQUIRED_GROUPS) {
    const present = group.requiredAny.filter(exists);
    const missing = group.requiredAny.filter((rel) => !exists(rel));

    if (present.length > 0) {
      pass(`${group.name}: ${present.length}/${group.requiredAny.length} expected file(s) present`);
      for (const rel of present) report.push(`  PRESENT ${rel}`);
    } else {
      fail(`${group.name}: no expected files found`);
    }

    for (const rel of missing) report.push(`  MISSING ${rel}`);
    report.push('');
  }
}

function auditDuplicateSuspiciousFiles() {
  section('Duplicate/suspicious files');

  const all = listFiles('src');
  const suspicious = all.filter((file) => /(\.tmp$|\.bak$| copy\.| copy |old|backup|duplicate)/i.test(file));

  if (suspicious.length === 0) {
    pass('No suspicious duplicate/temp source files found.');
    return;
  }

  warn(`${suspicious.length} suspicious duplicate/temp file(s) found.`);
  for (const file of suspicious) report.push(`  ${file}`);
}

function auditExpectedDocs() {
  section('Expected integration documents');

  for (const rel of EXPECTED_DOCS) {
    if (exists(rel)) {
      pass(`${rel} exists`);
    } else {
      warn(`${rel} missing; script will create placeholder.`);
      const title = rel.replace(/_/g, ' ').replace(/\.md$/i, '');
      writePlaceholderDoc(rel, title);
    }
  }
}

function writeReports() {
  section('Summary');

  report.push(`Warnings: ${warnings.length}`);
  report.push(`Failures: ${failures.length}`);
  report.push('');

  if (warnings.length > 0) {
    report.push('Warnings:');
    for (const warning of warnings) report.push(`- ${warning}`);
    report.push('');
  }

  if (failures.length > 0) {
    report.push('Failures:');
    for (const failure of failures) report.push(`- ${failure}`);
    report.push('');
  }

  const auditPath = path.join(root, 'ENH2_INTEGRATION_AUDIT.md');
  fs.writeFileSync(auditPath, report.join('\n') + '\n', 'utf8');

  const errorRegisterPath = path.join(root, 'ENH2_ERROR_REGISTER.md');
  if (!fs.existsSync(errorRegisterPath)) {
    fs.writeFileSync(
      errorRegisterPath,
      [
        '# ENH2 Error Register',
        '',
        '| ID | Module | Type | File | Error | Severity | Status |',
        '|---|---|---|---|---|---|---|',
        '| ENH2-ERR-001 | Pending | Baseline | TBD | Populate after typecheck/test/build | TBD | Open |',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  console.log(`Wrote ${auditPath}`);
}

function section(title) {
  report.push('');
  report.push(`## ${title}`);
  report.push('');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function listFiles(relRoot) {
  const absRoot = path.join(root, relRoot);
  if (!fs.existsSync(absRoot)) return [];

  const out = [];
  walk(absRoot, out);
  return out.map((abs) => path.relative(root, abs).replaceAll(path.sep, '/'));
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
}

function countFiles(relRoot) {
  return listFiles(relRoot).length;
}

function pass(message) {
  report.push(`PASS: ${message}`);
}

function warn(message) {
  warnings.push(message);
  report.push(`WARN: ${message}`);
}

function fail(message) {
  failures.push(message);
  report.push(`FAIL: ${message}`);
}

function writePlaceholderDoc(rel, title) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) return;

  fs.writeFileSync(
    abs,
    [
      `# ${title}`,
      '',
      'Status: Placeholder generated by enh2-integration-audit.mjs.',
      '',
      'This file must be completed during the corresponding implementation phase.',
      '',
    ].join('\n'),
    'utf8',
  );
}
