import {
  freezePsIsonoteTextAdmissionEvidence,
  type PsIsonoteDelimiter,
  type PsIsonoteTextAdmissionDiagnostic,
  type PsIsonoteTextAdmissionEvidenceV1,
  type PsIsonoteTextAdmissionOutcome,
  type PsIsonoteTextInputKind,
} from './psIsonoteTextAdmissionEvidence';
import {
  PS_ISONOTE_TEXT_ADMISSION_POLICY_V1,
  type PsIsonoteTextAdmissionPolicyV1,
} from './psIsonoteTextAdmissionPolicy';
import {
  parsePsIsonoteTable,
  type PsIsonoteParseResult,
} from './psIsonoteTable';

export interface PsIsonoteTextCandidate {
  readonly inputKind: 'PASTE' | 'SAMPLE';
  readonly sourceText: string;
  readonly sourceName?: string;
}

export interface AdmittedPsIsonoteTextSource {
  readonly sourceText: string;
  readonly parsedResult: PsIsonoteParseResult | null;
  readonly parseError: string | null;
  readonly evidence: PsIsonoteTextAdmissionEvidenceV1;
}

export interface PsIsonoteTextAdmissionDependencies {
  readonly parseTable: (sourceText: string) => PsIsonoteParseResult;
  readonly decodeUtf8: (bytes: Uint8Array) => string;
}

interface StructuralMeasurement {
  readonly delimiter: PsIsonoteDelimiter;
  readonly logicalRowCount: number;
  readonly maximumObservedColumns: number;
  readonly maximumObservedCellUtf8Bytes: number;
}

interface DecodedSourceInput {
  readonly inputKind: PsIsonoteTextInputKind;
  readonly sourceText: string;
  readonly sourceUtf8Bytes: number;
  readonly hadUtf8Bom: boolean;
  readonly sourceName?: string;
}

const ALLOWED_EXTENSIONS = Object.freeze(['.csv', '.tsv', '.txt'] as const);
const ALLOWED_MIME_TYPES = Object.freeze([
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
] as const);

const PRODUCTION_DEPENDENCIES: PsIsonoteTextAdmissionDependencies = Object.freeze({
  parseTable: parsePsIsonoteTable,
  decodeUtf8: (bytes: Uint8Array) =>
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
});

export class PsIsonoteTextAdmissionError extends Error {
  readonly outcome: PsIsonoteTextAdmissionOutcome;
  readonly evidence: PsIsonoteTextAdmissionEvidenceV1;

  constructor(
    outcome: PsIsonoteTextAdmissionOutcome,
    message: string,
    evidence: PsIsonoteTextAdmissionEvidenceV1,
  ) {
    super(message);
    this.name = 'PsIsonoteTextAdmissionError';
    this.outcome = outcome;
    this.evidence = evidence;
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function countDelimiterOutsideQuotes(line: string, delimiter: PsIsonoteDelimiter): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectPsIsonoteDelimiter(sourceText: string): PsIsonoteDelimiter {
  const lines = sourceText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const candidates: readonly PsIsonoteDelimiter[] = [',', '\t', ';', '|'];
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

function measurePsIsonoteStructure(sourceText: string): StructuralMeasurement {
  const delimiter = detectPsIsonoteDelimiter(sourceText);
  const source = sourceText.replace(/^\uFEFF/, '');
  let quoted = false;
  let cell = '';
  let columns = 1;
  let rowHasContent = false;
  let logicalRowCount = 0;
  let maximumObservedColumns = 0;
  let maximumObservedCellUtf8Bytes = 0;

  const finishCell = (): void => {
    maximumObservedCellUtf8Bytes = Math.max(
      maximumObservedCellUtf8Bytes,
      utf8ByteLength(cell),
    );
    cell = '';
  };

  const finishRow = (): void => {
    finishCell();
    if (rowHasContent) {
      logicalRowCount += 1;
      maximumObservedColumns = Math.max(maximumObservedColumns, columns);
    }
    columns = 1;
    rowHasContent = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      rowHasContent = true;
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      rowHasContent = true;
      finishCell();
      columns += 1;
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      finishRow();
      continue;
    }
    cell += character;
    if (!/\s/.test(character)) rowHasContent = true;
  }
  finishRow();

  return {
    delimiter,
    logicalRowCount,
    maximumObservedColumns,
    maximumObservedCellUtf8Bytes,
  };
}

function buildEvidence(options: {
  readonly policy: PsIsonoteTextAdmissionPolicyV1;
  readonly inputKind: PsIsonoteTextInputKind;
  readonly sourceName?: string;
  readonly sourceUtf8Bytes: number;
  readonly decodedCodeUnits: number;
  readonly hadUtf8Bom: boolean;
  readonly measurement?: StructuralMeasurement;
  readonly uniqueMappingCount?: number;
  readonly totalWarningCount?: number;
  readonly retainedWarningCount?: number;
  readonly outcome: PsIsonoteTextAdmissionOutcome;
  readonly diagnostics?: readonly PsIsonoteTextAdmissionDiagnostic[];
}): PsIsonoteTextAdmissionEvidenceV1 {
  const measurement = options.measurement ?? {
    delimiter: ',' as const,
    logicalRowCount: 0,
    maximumObservedColumns: 0,
    maximumObservedCellUtf8Bytes: 0,
  };
  return freezePsIsonoteTextAdmissionEvidence({
    policy: options.policy,
    inputKind: options.inputKind,
    ...(options.sourceName ? { sourceName: options.sourceName } : {}),
    sourceUtf8Bytes: options.sourceUtf8Bytes,
    decodedCodeUnits: options.decodedCodeUnits,
    hadUtf8Bom: options.hadUtf8Bom,
    detectedDelimiter: measurement.delimiter,
    logicalRowCount: measurement.logicalRowCount,
    maximumObservedColumns: measurement.maximumObservedColumns,
    maximumObservedCellUtf8Bytes: measurement.maximumObservedCellUtf8Bytes,
    uniqueMappingCount: options.uniqueMappingCount ?? 0,
    totalWarningCount: options.totalWarningCount ?? 0,
    retainedWarningCount: options.retainedWarningCount ?? 0,
    admissionOutcome: options.outcome,
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
  });
}

function reject(options: {
  readonly policy: PsIsonoteTextAdmissionPolicyV1;
  readonly inputKind: PsIsonoteTextInputKind;
  readonly sourceName?: string;
  readonly sourceUtf8Bytes: number;
  readonly decodedCodeUnits: number;
  readonly hadUtf8Bom: boolean;
  readonly measurement?: StructuralMeasurement;
  readonly outcome: Exclude<PsIsonoteTextAdmissionOutcome, 'ADMITTED'>;
  readonly message: string;
  readonly observed?: number;
  readonly limit?: number;
}): never {
  const diagnostic: PsIsonoteTextAdmissionDiagnostic = Object.freeze({
    code: options.outcome,
    message: options.message,
    ...(options.observed !== undefined ? { observed: options.observed } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  });
  const evidence = buildEvidence({
    policy: options.policy,
    inputKind: options.inputKind,
    ...(options.sourceName ? { sourceName: options.sourceName } : {}),
    sourceUtf8Bytes: options.sourceUtf8Bytes,
    decodedCodeUnits: options.decodedCodeUnits,
    hadUtf8Bom: options.hadUtf8Bom,
    ...(options.measurement ? { measurement: options.measurement } : {}),
    outcome: options.outcome,
    diagnostics: [diagnostic],
  });
  throw new PsIsonoteTextAdmissionError(options.outcome, options.message, evidence);
}

function validateFileType(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const extensionAllowed = ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
  const mimeType = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  return extensionAllowed && (
    mimeType.length === 0 ||
    ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])
  );
}

function capWarnings(warnings: readonly string[], maximum: number): string[] {
  if (warnings.length <= maximum) return [...warnings];
  if (maximum <= 0) return [];
  const retainedOriginalCount = Math.max(0, maximum - 1);
  const suppressedCount = warnings.length - retainedOriginalCount;
  return [
    ...warnings.slice(0, retainedOriginalCount),
    `${suppressedCount} warning(s) suppressed by PS/ISONOTE admission policy.`,
  ];
}

function admitDecodedSource(
  input: DecodedSourceInput,
  policy: PsIsonoteTextAdmissionPolicyV1,
  dependencies: PsIsonoteTextAdmissionDependencies,
): AdmittedPsIsonoteTextSource {
  const measurement = measurePsIsonoteStructure(input.sourceText);
  const limits = policy.limits;

  if (measurement.logicalRowCount > limits.maxLogicalRows) {
    reject({
      policy,
      inputKind: input.inputKind,
      ...(input.sourceName ? { sourceName: input.sourceName } : {}),
      sourceUtf8Bytes: input.sourceUtf8Bytes,
      decodedCodeUnits: input.sourceText.length,
      hadUtf8Bom: input.hadUtf8Bom,
      measurement,
      outcome: 'REJECTED_ROW_COUNT',
      message: `PS/ISONOTE source exceeds the ${limits.maxLogicalRows} logical-row limit.`,
      observed: measurement.logicalRowCount,
      limit: limits.maxLogicalRows,
    });
  }
  if (measurement.maximumObservedColumns > limits.maxColumnsPerRow) {
    reject({
      policy,
      inputKind: input.inputKind,
      ...(input.sourceName ? { sourceName: input.sourceName } : {}),
      sourceUtf8Bytes: input.sourceUtf8Bytes,
      decodedCodeUnits: input.sourceText.length,
      hadUtf8Bom: input.hadUtf8Bom,
      measurement,
      outcome: 'REJECTED_COLUMN_COUNT',
      message: `PS/ISONOTE source exceeds the ${limits.maxColumnsPerRow}-column limit.`,
      observed: measurement.maximumObservedColumns,
      limit: limits.maxColumnsPerRow,
    });
  }
  if (measurement.maximumObservedCellUtf8Bytes > limits.maxCellUtf8Bytes) {
    reject({
      policy,
      inputKind: input.inputKind,
      ...(input.sourceName ? { sourceName: input.sourceName } : {}),
      sourceUtf8Bytes: input.sourceUtf8Bytes,
      decodedCodeUnits: input.sourceText.length,
      hadUtf8Bom: input.hadUtf8Bom,
      measurement,
      outcome: 'REJECTED_CELL_BYTES',
      message: `PS/ISONOTE source contains a cell larger than ${limits.maxCellUtf8Bytes} UTF-8 bytes.`,
      observed: measurement.maximumObservedCellUtf8Bytes,
      limit: limits.maxCellUtf8Bytes,
    });
  }

  let parsedResult: PsIsonoteParseResult | null = null;
  let parseError: string | null = null;
  let totalWarningCount = 0;
  let retainedWarningCount = 0;
  let uniqueMappingCount = 0;
  const diagnostics: PsIsonoteTextAdmissionDiagnostic[] = [];

  if (input.sourceText.trim()) {
    try {
      const parsed = dependencies.parseTable(input.sourceText);
      uniqueMappingCount = parsed.mappings.length;
      if (uniqueMappingCount > limits.maxUniqueMappings) {
        reject({
          policy,
          inputKind: input.inputKind,
          ...(input.sourceName ? { sourceName: input.sourceName } : {}),
          sourceUtf8Bytes: input.sourceUtf8Bytes,
          decodedCodeUnits: input.sourceText.length,
          hadUtf8Bom: input.hadUtf8Bom,
          measurement,
          outcome: 'REJECTED_MAPPING_COUNT',
          message: `PS/ISONOTE source exceeds the ${limits.maxUniqueMappings} unique-mapping limit.`,
          observed: uniqueMappingCount,
          limit: limits.maxUniqueMappings,
        });
      }
      totalWarningCount = parsed.warnings.length;
      const warnings = capWarnings(parsed.warnings, limits.maxRetainedWarnings);
      retainedWarningCount = warnings.length;
      parsedResult = {
        ...parsed,
        mappings: [...parsed.mappings],
        warnings,
      };
    } catch (error) {
      if (error instanceof PsIsonoteTextAdmissionError) throw error;
      parseError = error instanceof Error ? error.message : String(error);
      diagnostics.push(Object.freeze({
        code: 'SEMANTIC_PARSE_ERROR' as const,
        message: parseError,
      }));
    }
  }

  const evidence = buildEvidence({
    policy,
    inputKind: input.inputKind,
    ...(input.sourceName ? { sourceName: input.sourceName } : {}),
    sourceUtf8Bytes: input.sourceUtf8Bytes,
    decodedCodeUnits: input.sourceText.length,
    hadUtf8Bom: input.hadUtf8Bom,
    measurement,
    uniqueMappingCount,
    totalWarningCount,
    retainedWarningCount,
    outcome: 'ADMITTED',
    diagnostics,
  });

  return Object.freeze({
    sourceText: input.sourceText,
    parsedResult,
    parseError,
    evidence,
  });
}

function admitTextCandidateWithPolicy(
  candidate: PsIsonoteTextCandidate,
  policy: PsIsonoteTextAdmissionPolicyV1,
  dependencies: PsIsonoteTextAdmissionDependencies,
): AdmittedPsIsonoteTextSource {
  const limit = policy.limits.maxSourceUtf8Bytes;
  const hadUtf8Bom = candidate.sourceText.startsWith('\uFEFF');
  if (candidate.sourceText.length > limit) {
    reject({
      policy,
      inputKind: candidate.inputKind,
      ...(candidate.sourceName ? { sourceName: candidate.sourceName } : {}),
      sourceUtf8Bytes: candidate.sourceText.length,
      decodedCodeUnits: candidate.sourceText.length,
      hadUtf8Bom,
      outcome: 'REJECTED_SOURCE_BYTES',
      message: `PS/ISONOTE source exceeds the ${limit}-byte UTF-8 limit.`,
      observed: candidate.sourceText.length,
      limit,
    });
  }
  const sourceUtf8Bytes = utf8ByteLength(candidate.sourceText);
  if (sourceUtf8Bytes > limit) {
    reject({
      policy,
      inputKind: candidate.inputKind,
      ...(candidate.sourceName ? { sourceName: candidate.sourceName } : {}),
      sourceUtf8Bytes,
      decodedCodeUnits: candidate.sourceText.length,
      hadUtf8Bom,
      outcome: 'REJECTED_SOURCE_BYTES',
      message: `PS/ISONOTE source exceeds the ${limit}-byte UTF-8 limit.`,
      observed: sourceUtf8Bytes,
      limit,
    });
  }
  return admitDecodedSource({
    inputKind: candidate.inputKind,
    sourceText: candidate.sourceText,
    sourceUtf8Bytes,
    hadUtf8Bom,
    ...(candidate.sourceName ? { sourceName: candidate.sourceName } : {}),
  }, policy, dependencies);
}

async function admitFileWithPolicy(
  file: File,
  policy: PsIsonoteTextAdmissionPolicyV1,
  dependencies: PsIsonoteTextAdmissionDependencies,
): Promise<AdmittedPsIsonoteTextSource> {
  const limit = policy.limits.maxSourceUtf8Bytes;
  if (!validateFileType(file)) {
    reject({
      policy,
      inputKind: 'FILE',
      sourceName: file.name,
      sourceUtf8Bytes: file.size,
      decodedCodeUnits: 0,
      hadUtf8Bom: false,
      outcome: 'REJECTED_SOURCE_TYPE',
      message: 'Choose a CSV, TSV, or TXT PS/ISONOTE source file.',
    });
  }
  if (file.size > limit) {
    reject({
      policy,
      inputKind: 'FILE',
      sourceName: file.name,
      sourceUtf8Bytes: file.size,
      decodedCodeUnits: 0,
      hadUtf8Bom: false,
      outcome: 'REJECTED_SOURCE_BYTES',
      message: `PS/ISONOTE file exceeds the ${limit}-byte UTF-8 limit.`,
      observed: file.size,
      limit,
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > limit) {
    reject({
      policy,
      inputKind: 'FILE',
      sourceName: file.name,
      sourceUtf8Bytes: bytes.byteLength,
      decodedCodeUnits: 0,
      hadUtf8Bom: false,
      outcome: 'REJECTED_SOURCE_BYTES',
      message: `PS/ISONOTE file exceeds the ${limit}-byte UTF-8 limit.`,
      observed: bytes.byteLength,
      limit,
    });
  }

  const hadUtf8Bom = bytes.byteLength >= 3 &&
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let sourceText: string;
  try {
    sourceText = dependencies.decodeUtf8(bytes);
  } catch {
    reject({
      policy,
      inputKind: 'FILE',
      sourceName: file.name,
      sourceUtf8Bytes: bytes.byteLength,
      decodedCodeUnits: 0,
      hadUtf8Bom,
      outcome: 'REJECTED_UTF8',
      message: 'PS/ISONOTE file is not valid UTF-8 text.',
    });
  }

  return admitDecodedSource({
    inputKind: 'FILE',
    sourceName: file.name,
    sourceText,
    sourceUtf8Bytes: bytes.byteLength,
    hadUtf8Bom,
  }, policy, dependencies);
}

export function admitPsIsonoteTextCandidate(
  candidate: PsIsonoteTextCandidate,
): AdmittedPsIsonoteTextSource {
  return admitTextCandidateWithPolicy(
    candidate,
    PS_ISONOTE_TEXT_ADMISSION_POLICY_V1,
    PRODUCTION_DEPENDENCIES,
  );
}

export async function admitPsIsonoteTextFile(
  file: File,
): Promise<AdmittedPsIsonoteTextSource> {
  return admitFileWithPolicy(
    file,
    PS_ISONOTE_TEXT_ADMISSION_POLICY_V1,
    PRODUCTION_DEPENDENCIES,
  );
}

export function admitPsIsonoteTextCandidateForTest(
  candidate: PsIsonoteTextCandidate,
  policy: PsIsonoteTextAdmissionPolicyV1,
  dependencies: Partial<PsIsonoteTextAdmissionDependencies> = {},
): AdmittedPsIsonoteTextSource {
  return admitTextCandidateWithPolicy(candidate, policy, {
    ...PRODUCTION_DEPENDENCIES,
    ...dependencies,
  });
}

export async function admitPsIsonoteTextFileForTest(
  file: File,
  policy: PsIsonoteTextAdmissionPolicyV1,
  dependencies: Partial<PsIsonoteTextAdmissionDependencies> = {},
): Promise<AdmittedPsIsonoteTextSource> {
  return admitFileWithPolicy(file, policy, {
    ...PRODUCTION_DEPENDENCIES,
    ...dependencies,
  });
}
