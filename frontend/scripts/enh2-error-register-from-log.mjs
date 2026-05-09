import fs from 'node:fs';

const input = fs.readFileSync(0, 'utf8');
const lines = input.split(/\r?\n/);
const rows = [];
let id = 1;

for (const line of lines) {
  if (/error TS\d+:/i.test(line) || /failed/i.test(line) || /error/i.test(line)) {
    rows.push({ id: `ENH2-ERR-${String(id).padStart(3, '0')}`, line });
    id += 1;
  }
}

const md = [
  '# ENH2 Error Register',
  '',
  '| ID | Module | Type | File | Error | Severity | Status |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((row) => {
    const fileMatch = row.line.match(/([A-Za-z0-9_\-./\\]+\.(ts|tsx|js|jsx|mjs|cjs))/);
    const file = fileMatch ? fileMatch[1].replaceAll('\\', '/') : 'TBD';
    const module = file.includes('/writer/') || file.includes('components/writer') ? 'Writer'
      : file.includes('/macro/') || file.includes('components/macro') ? 'Macro'
      : 'Shared/App';
    const type = /TS\d+/.test(row.line) ? 'TypeScript'
      : /test/i.test(row.line) ? 'Test'
      : /build/i.test(row.line) ? 'Build'
      : 'General';
    return `| ${row.id} | ${module} | ${type} | ${file} | ${escapeCell(row.line.trim())} | TBD | Open |`;
  }),
  '',
];

fs.writeFileSync('ENH2_ERROR_REGISTER.md', md.join('\n'), 'utf8');
console.log(`Wrote ENH2_ERROR_REGISTER.md with ${rows.length} row(s).`);

function escapeCell(value) {
  return value.replaceAll('|', '\\|').slice(0, 500);
}
