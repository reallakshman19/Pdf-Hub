import {
  createTableModelFromMatrix,
} from '../content-model';
import type { WriterTableModel } from '../types';
import { sanitizeClipboardHtml } from './sanitizeClipboardHtml';

export function parseClipboardTableFromText(text: string): WriterTableModel | null {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trimEnd();

  if (!normalized) return null;

  const delimiter = normalized.includes('\t') ? '\t' : normalized.includes(',') ? ',' : null;

  if (!delimiter) return null;

  const rows = normalized
    .split('\n')
    .map((line) => parseDelimitedLine(line, delimiter));

  if (rows.length < 1) return null;

  const hasMultipleColumns = rows.some((row) => row.length > 1);
  if (!hasMultipleColumns) return null;

  return createTableModelFromMatrix(rows);
}

export function parseClipboardTableFromHtml(html: string): WriterTableModel | null {
  const sanitized = sanitizeClipboardHtml(html);

  if (typeof document === 'undefined') return null;

  const template = document.createElement('template');
  template.innerHTML = sanitized;

  const table = template.content.querySelector('table');
  if (!table) return null;

  const rows = Array.from(table.querySelectorAll('tr')).map((tr) => {
    return Array.from(tr.querySelectorAll('th,td')).map((cell) =>
      normalizeCellText(cell.textContent ?? ''),
    );
  });

  const nonEmptyRows = rows.filter((row) => row.length > 0);
  if (nonEmptyRows.length === 0) return null;

  return createTableModelFromMatrix(nonEmptyRows);
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t').map(normalizeCellText);
  return parseCsvLine(line).map(normalizeCellText);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function normalizeCellText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
