export interface PsIsonoteMapping {
  psNo: string;
  isonote: string;
  family?: string;
  sourceRow: number;
}

export interface PsIsonoteParseResult {
  mappings: PsIsonoteMapping[];
  warnings: string[];
  delimiter: ',' | '\t' | ';' | '|';
  psColumn: string;
  isonoteColumn: string;
  familyColumn?: string;
}

const PS_HEADER_ALIASES = new Set([
  'ps',
  'psno',
  'psnumber',
  'psnum',
  'support',
  'supportid',
  'supportno',
  'supportnumber',
  'supportnum',
  'element',
  'elementname',
  'nameofelement',
  'nameoftheelement',
]);

const ISONOTE_HEADER_ALIASES = new Set([
  'isonote',
  'supportisonote',
  'isonoteinstruction',
  'supportnote',
  'note',
  'instruction',
  'supportinstruction',
  'restraintnote',
]);

const FAMILY_HEADER_ALIASES = new Set([
  'family',
  'supportfamily',
  'type',
  'supporttype',
  'category',
  'supportcategory',
]);

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeDash(value: string): string {
  return value.replace(/[‐‑‒–—−]/g, '-');
}

export function normalizePsNumber(value: string): string | null {
  const normalized = normalizeDash(value)
    .toUpperCase()
    .replace(/\b(?:PS|SUPPORT)\s*(?:NO\.?|NUMBER|NUM|ID)?\s*[-:#]?\s*/g, 'PS-')
    .trim();

  const prefixed = /\bPS\s*-?\s*([A-Z0-9]{2,12}(?:\s*\.\s*[A-Z0-9]{1,6})?)\b/.exec(normalized);
  if (prefixed) {
    return `PS-${prefixed[1].replace(/\s+/g, '')}`;
  }

  const bare = /^\s*([0-9]{2,12}(?:\s*\.\s*[A-Z0-9]{1,6})?)\s*$/.exec(normalized);
  if (bare) {
    return `PS-${bare[1].replace(/\s+/g, '')}`;
  }

  return null;
}

function cleanCell(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

function cleanIsonote(value: string): string {
  return cleanCell(value).replace(/\s+/g, ' ');
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(text: string): ',' | '\t' | ';' | '|' {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  const candidates: Array<',' | '\t' | ';' | '|'> = [',', '\t', ';', '|'];
  const scores = candidates.map((delimiter) => {
    const counts = lines.map((line) => countDelimiterOutsideQuotes(line, delimiter));
    const positive = counts.filter((count) => count > 0);
    return {
      delimiter,
      score: positive.length === 0
        ? 0
        : positive.length * 100 + positive.reduce((sum, count) => sum + count, 0),
    };
  });

  scores.sort((left, right) => right.score - left.score);
  return scores[0]?.score ? scores[0].delimiter : ',';
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cleanCell(cell));
      cell = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && source[index + 1] === '\n') {
        index += 1;
      }
      row.push(cleanCell(cell));
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cleanCell(cell));
  rows.push(row);

  return rows
    .map((candidate) => {
      if (delimiter !== '|') return candidate;
      const trimmed = [...candidate];
      if (trimmed[0] === '') trimmed.shift();
      if (trimmed.at(-1) === '') trimmed.pop();
      return trimmed;
    })
    .filter((candidate) => candidate.some((value) => value.length > 0))
    .filter((candidate) => !candidate.every((value) => /^:?-{3,}:?$/.test(value)));
}

function findHeaderIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(normalizeHeader(header)));
}

function inferPsColumn(rows: string[][]): number {
  const width = Math.max(0, ...rows.map((row) => row.length));
  let bestIndex = -1;
  let bestScore = 0;

  for (let column = 0; column < width; column += 1) {
    const values = rows.slice(0, 30).map((row) => row[column] ?? '').filter(Boolean);
    if (values.length === 0) continue;
    const score = values.filter((value) => normalizePsNumber(value) !== null).length / values.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = column;
    }
  }

  return bestScore >= 0.5 ? bestIndex : -1;
}

function inferIsonoteColumn(rows: string[][], psColumn: number): number {
  const width = Math.max(0, ...rows.map((row) => row.length));
  let bestIndex = -1;
  let bestScore = -1;

  for (let column = 0; column < width; column += 1) {
    if (column === psColumn) continue;
    const values = rows.slice(0, 30).map((row) => cleanIsonote(row[column] ?? '')).filter(Boolean);
    if (values.length === 0) continue;
    const averageLength = values.reduce((sum, value) => sum + value.length, 0) / values.length;
    const noteSignals = values.filter((value) => /\b(?:REST|GUIDE|STOP|HOLD|SPRING|GAP|KN)\b/i.test(value)).length;
    const score = averageLength + noteSignals * 20;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = column;
    }
  }

  return bestIndex;
}

export function parsePsIsonoteTable(text: string): PsIsonoteParseResult {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimitedText(text, delimiter);

  if (rows.length === 0) {
    throw new Error('The PS/ISONOTE table is empty.');
  }

  const firstRow = rows[0];
  const normalizedFirst = firstRow.map(normalizeHeader);
  const hasHeader = normalizedFirst.some((header) =>
    PS_HEADER_ALIASES.has(header) || ISONOTE_HEADER_ALIASES.has(header),
  );

  const headers = hasHeader
    ? firstRow
    : firstRow.map((_, index) => `Column ${index + 1}`);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  let psColumn = findHeaderIndex(headers, PS_HEADER_ALIASES);
  let isonoteColumn = findHeaderIndex(headers, ISONOTE_HEADER_ALIASES);
  const familyColumn = findHeaderIndex(headers, FAMILY_HEADER_ALIASES);

  if (psColumn < 0) psColumn = inferPsColumn(dataRows);
  if (isonoteColumn < 0) isonoteColumn = inferIsonoteColumn(dataRows, psColumn);

  if (psColumn < 0) {
    throw new Error('Could not identify the PS No. column. Use a header such as "PS No." or "Support Number".');
  }
  if (isonoteColumn < 0) {
    throw new Error('Could not identify the ISONOTE column. Use a header such as "ISONOTE" or "Support ISONOTE".');
  }

  const warnings: string[] = [];
  const byPsNumber = new Map<string, PsIsonoteMapping>();

  dataRows.forEach((row, dataIndex) => {
    const sourceRow = dataIndex + (hasHeader ? 2 : 1);
    const rawPs = row[psColumn] ?? '';
    const psNo = normalizePsNumber(rawPs);
    const isonote = cleanIsonote(row[isonoteColumn] ?? '');
    const family = familyColumn >= 0 ? cleanCell(row[familyColumn] ?? '') : '';

    if (!rawPs.trim() && !isonote) return;
    if (!psNo) {
      warnings.push(`Row ${sourceRow}: ignored invalid PS No. "${rawPs}".`);
      return;
    }
    if (!isonote) {
      warnings.push(`Row ${sourceRow}: ignored ${psNo} because ISONOTE is empty.`);
      return;
    }

    const existing = byPsNumber.get(psNo);
    if (existing) {
      if (existing.isonote !== isonote) {
        warnings.push(
          `Row ${sourceRow}: conflicting ISONOTE for ${psNo}; kept row ${existing.sourceRow}.`,
        );
      }
      return;
    }

    byPsNumber.set(psNo, {
      psNo,
      isonote,
      family: family || undefined,
      sourceRow,
    });
  });

  const mappings = Array.from(byPsNumber.values());
  if (mappings.length === 0) {
    throw new Error('No valid PS No. versus ISONOTE rows were found.');
  }

  return {
    mappings,
    warnings,
    delimiter,
    psColumn: headers[psColumn] ?? `Column ${psColumn + 1}`,
    isonoteColumn: headers[isonoteColumn] ?? `Column ${isonoteColumn + 1}`,
    familyColumn: familyColumn >= 0 ? headers[familyColumn] : undefined,
  };
}
