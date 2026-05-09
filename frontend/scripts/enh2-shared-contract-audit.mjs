import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const CANDIDATE_PATTERNS = [
  {
    id: 'PDF_BYTE_UPDATE',
    description: 'Potential PDF byte update functions/state',
    regex: /(set.*Pdf.*Bytes|update.*Pdf.*Bytes|finalBytes|workingBytes|pdfBytes|documentBytes)/i,
  },
  {
    id: 'DIRTY_STATE',
    description: 'Potential dirty-state functions/state',
    regex: /(mark.*Dirty|set.*Dirty|dirty|isDirty|unsaved)/i,
  },
  {
    id: 'SAVE_EXPORT',
    description: 'Potential save/export functions',
    regex: /(savePdf|save.*Document|exportPdf|export.*Document|downloadPdf|flatten)/i,
  },
  {
    id: 'PAGE_SELECTION',
    description: 'Potential selected page/current page state',
    regex: /(selectedPages|setSelectedPages|currentPage|setCurrentPage|pageCount)/i,
  },
  {
    id: 'WRITER_OVERLAY',
    description: 'Potential writer overlay integration',
    regex: /(WriterOverlay|WriterRibbon|WriterSidePanel|PlacedElement|contentModel)/i,
  },
  {
    id: 'MACRO_PANEL',
    description: 'Potential macro panel/dropdown integration',
    regex: /(MacroPanel|MacroDropdown|executeMacroRecipe|buildMacroExecutionContext)/i,
  },
];

const report = [];
main();

function main() {
  report.push('# ENH2 Shared Contracts Audit');
  report.push('');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Working directory: ${root}`);
  report.push('');

  const files = listFiles('src').filter(isSourceFile);

  for (const pattern of CANDIDATE_PATTERNS) {
    report.push(`## ${pattern.id} — ${pattern.description}`);
    report.push('');
    let count = 0;

    for (const file of files) {
      const abs = path.join(root, file);
      const text = safeRead(abs);
      if (!text) continue;
      const lines = text.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (pattern.regex.test(line)) {
          count += 1;
          report.push(`- ${file}:${index + 1}: ${line.trim().slice(0, 220)}`);
        }
      });
    }

    if (count === 0) report.push('- No candidates found.');
    report.push('');
  }

  report.push('## Required Final Contract Decisions');
  report.push('');
  report.push('| Contract | Chosen implementation | File/function | Status |');
  report.push('|---|---|---|---|');
  report.push('| PDF byte source | TBD | TBD | Open |');
  report.push('| PDF byte update function | TBD | TBD | Open |');
  report.push('| Dirty-state marker | TBD | TBD | Open |');
  report.push('| Page count source | TBD | TBD | Open |');
  report.push('| Selected pages source | TBD | TBD | Open |');
  report.push('| Writer save/commit path | TBD | TBD | Open |');
  report.push('| Macro apply result path | TBD | TBD | Open |');
  report.push('| Render cache refresh | TBD | TBD | Open |');
  report.push('');

  fs.writeFileSync(path.join(root, 'ENH2_SHARED_CONTRACTS.md'), report.join('\n') + '\n', 'utf8');
  console.log('Wrote ENH2_SHARED_CONTRACTS.md');
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
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
      walk(abs, out);
    } else {
      out.push(abs);
    }
  }
}

function isSourceFile(file) {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file);
}

function safeRead(abs) {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}
