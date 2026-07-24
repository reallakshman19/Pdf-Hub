import type { PsIsonoteScanResult, PsIsonoteTextReference } from './psIsonoteRecipe';
import type { PsIsonoteMapping } from './psIsonoteTable';

export type PsIsonoteAuditPhase = 'preview' | 'annotated' | 'failed';

export type PsIsonoteDiagnosticSeverity = 'info' | 'warning' | 'error';

export type PsIsonoteDiagnosticCode =
  | 'PS_ISONOTE_NOT_FOUND'
  | 'PS_ISONOTE_ALREADY_ANNOTATED'
  | 'PS_ISONOTE_MATCH_NORMALIZED'
  | 'PS_ISONOTE_MATCH_JOINED_TEXT_ITEMS'
  | 'PS_ISONOTE_REVIEW_REQUIRED'
  | 'PS_ISONOTE_CONFLICTING_MAPPING'
  | 'PS_ISONOTE_ANNOTATION_FAILED';

export interface PsIsonoteDiagnostic {
  code: PsIsonoteDiagnosticCode;
  severity: PsIsonoteDiagnosticSeverity;
  message: string;
  psNo?: string;
  pageNumber?: number;
}

export interface PsIsonoteConfidenceComponents {
  identity: number;
  geometry: number;
  mappingIntegrity: number;
  matchConfidence: number;
}

export interface PsIsonoteOccurrenceAudit {
  psNo: string;
  family?: string;
  isonote: string;
  sourceRow: number;
  pageNumber: number;
  occurrenceIndex: number;
  rawMatchedText: string;
  normalizedMatchedText: string;
  matchMethod: PsIsonoteTextReference['matchMethod'];
  textItemCount: number;
  rect: PsIsonoteTextReference['rect'];
  status: 'ready' | 'review' | 'annotated' | 'skipped-existing' | 'failed';
  confidence: PsIsonoteConfidenceComponents;
  diagnosticCodes: PsIsonoteDiagnosticCode[];
}

export interface PsIsonoteSummaryRow {
  psNo: string;
  family: string;
  mappings: number;
  foundPs: number;
  occurrences: number;
  annotated: number;
  review: number;
  missing: number;
  averageConfidence: number | null;
  minimumConfidence: number | null;
  errors: number;
}

export interface PsIsonoteAuditReport {
  phase: PsIsonoteAuditPhase;
  createdAt: string;
  summaryRows: PsIsonoteSummaryRow[];
  occurrences: PsIsonoteOccurrenceAudit[];
  diagnostics: PsIsonoteDiagnostic[];
}

export interface BuildPsIsonoteAuditOptions {
  phase?: PsIsonoteAuditPhase;
  parseWarnings?: string[];
  failureMessage?: string;
  createdAt?: string;
}

export const PS_ISONOTE_AUTO_RELEASE_THRESHOLD = 90;

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function scorePsIsonoteReference(
  reference: PsIsonoteTextReference,
): PsIsonoteConfidenceComponents {
  const identity = reference.matchMethod === 'exact'
    ? 100
    : reference.matchMethod === 'normalized'
      ? 95
      : 88;
  const geometry = reference.textItemCount <= 1
    ? 100
    : reference.textItemCount <= 3
      ? 90
      : 75;
  const mappingIntegrity = 100;
  const matchConfidence = roundScore(
    identity * 0.7 + geometry * 0.2 + mappingIntegrity * 0.1,
  );

  return {
    identity,
    geometry,
    mappingIntegrity,
    matchConfidence,
  };
}

function warningDiagnostics(
  mappings: PsIsonoteMapping[],
  warnings: string[],
): PsIsonoteDiagnostic[] {
  const diagnostics: PsIsonoteDiagnostic[] = [];

  for (const mapping of mappings) {
    const conflict = warnings.find((warning) =>
      warning.includes('conflicting ISONOTE') && warning.includes(mapping.psNo),
    );
    if (!conflict) continue;
    diagnostics.push({
      code: 'PS_ISONOTE_CONFLICTING_MAPPING',
      severity: 'error',
      psNo: mapping.psNo,
      message: conflict,
    });
  }

  return diagnostics;
}

function buildOccurrenceAudit(
  reference: PsIsonoteTextReference,
  occurrenceIndex: number,
  skippedExisting: boolean,
  phase: PsIsonoteAuditPhase,
): { occurrence: PsIsonoteOccurrenceAudit; diagnostics: PsIsonoteDiagnostic[] } {
  const confidence = scorePsIsonoteReference(reference);
  const diagnostics: PsIsonoteDiagnostic[] = [];

  if (reference.matchMethod === 'normalized') {
    diagnostics.push({
      code: 'PS_ISONOTE_MATCH_NORMALIZED',
      severity: 'info',
      psNo: reference.psNo,
      pageNumber: reference.pageNumber,
      message: `${reference.psNo} matched after dash or whitespace normalization.`,
    });
  }
  if (reference.matchMethod === 'joined-text-items') {
    diagnostics.push({
      code: 'PS_ISONOTE_MATCH_JOINED_TEXT_ITEMS',
      severity: 'warning',
      psNo: reference.psNo,
      pageNumber: reference.pageNumber,
      message: `${reference.psNo} was reconstructed from ${reference.textItemCount} PDF text items.`,
    });
  }
  if (skippedExisting) {
    diagnostics.push({
      code: 'PS_ISONOTE_ALREADY_ANNOTATED',
      severity: 'info',
      psNo: reference.psNo,
      pageNumber: reference.pageNumber,
      message: `${reference.psNo} already has an ISONOTE marker on page ${reference.pageNumber}.`,
    });
  }
  if (confidence.matchConfidence < PS_ISONOTE_AUTO_RELEASE_THRESHOLD) {
    diagnostics.push({
      code: 'PS_ISONOTE_REVIEW_REQUIRED',
      severity: 'warning',
      psNo: reference.psNo,
      pageNumber: reference.pageNumber,
      message: `${reference.psNo} match confidence is ${confidence.matchConfidence}; review is required.`,
    });
  }
  if (phase === 'failed' && !skippedExisting) {
    diagnostics.push({
      code: 'PS_ISONOTE_ANNOTATION_FAILED',
      severity: 'error',
      psNo: reference.psNo,
      pageNumber: reference.pageNumber,
      message: `${reference.psNo} was matched but the annotation run failed.`,
    });
  }

  const status = skippedExisting
    ? 'skipped-existing'
    : phase === 'failed'
      ? 'failed'
      : phase === 'annotated'
        ? 'annotated'
        : confidence.matchConfidence < PS_ISONOTE_AUTO_RELEASE_THRESHOLD
          ? 'review'
          : 'ready';

  return {
    occurrence: {
      psNo: reference.psNo,
      family: reference.mapping.family,
      isonote: reference.mapping.isonote,
      sourceRow: reference.mapping.sourceRow,
      pageNumber: reference.pageNumber,
      occurrenceIndex,
      rawMatchedText: reference.rawMatchedText,
      normalizedMatchedText: reference.psNo,
      matchMethod: reference.matchMethod,
      textItemCount: reference.textItemCount,
      rect: reference.rect,
      status,
      confidence,
      diagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
    },
    diagnostics,
  };
}

export function buildPsIsonoteAuditReport(
  mappings: PsIsonoteMapping[],
  scan: PsIsonoteScanResult,
  options: BuildPsIsonoteAuditOptions = {},
): PsIsonoteAuditReport {
  const phase = options.phase ?? 'preview';
  const diagnostics = warningDiagnostics(mappings, options.parseWarnings ?? []);
  const occurrences: PsIsonoteOccurrenceAudit[] = [];
  const detectedReferences = scan.detectedReferences ?? scan.references;
  const occurrenceCounter = new Map<string, number>();
  const skippedPageKeys = new Set(
    scan.skippedExisting.map((entry) => `${entry.psNo}|${entry.pageNumber}`),
  );

  for (const reference of detectedReferences) {
    const occurrenceIndex = (occurrenceCounter.get(reference.psNo) ?? 0) + 1;
    occurrenceCounter.set(reference.psNo, occurrenceIndex);
    const skippedExisting = skippedPageKeys.has(`${reference.psNo}|${reference.pageNumber}`);
    const built = buildOccurrenceAudit(reference, occurrenceIndex, skippedExisting, phase);
    occurrences.push(built.occurrence);
    diagnostics.push(...built.diagnostics);
  }

  for (const mapping of mappings) {
    if (!scan.missingPsNumbers.includes(mapping.psNo)) continue;
    diagnostics.push({
      code: 'PS_ISONOTE_NOT_FOUND',
      severity: 'warning',
      psNo: mapping.psNo,
      message: `${mapping.psNo} was not found in the selected searchable PDF pages.`,
    });
  }

  if (phase === 'failed' && options.failureMessage) {
    diagnostics.push({
      code: 'PS_ISONOTE_ANNOTATION_FAILED',
      severity: 'error',
      message: options.failureMessage,
    });
  }

  const summaryRows = mappings
    .map((mapping): PsIsonoteSummaryRow => {
      const psOccurrences = occurrences.filter((occurrence) => occurrence.psNo === mapping.psNo);
      const confidences = psOccurrences.map((occurrence) => occurrence.confidence.matchConfidence);
      const psDiagnostics = diagnostics.filter((diagnostic) => diagnostic.psNo === mapping.psNo);

      return {
        psNo: mapping.psNo,
        family: mapping.family ?? '',
        mappings: 1,
        foundPs: psOccurrences.length > 0 ? 1 : 0,
        occurrences: psOccurrences.length,
        annotated: psOccurrences.filter((occurrence) => occurrence.status === 'annotated').length,
        review: psOccurrences.filter((occurrence) =>
          occurrence.confidence.matchConfidence < PS_ISONOTE_AUTO_RELEASE_THRESHOLD,
        ).length,
        missing: psOccurrences.length === 0 ? 1 : 0,
        averageConfidence: confidences.length > 0
          ? roundScore(confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length)
          : null,
        minimumConfidence: confidences.length > 0 ? Math.min(...confidences) : null,
        errors: psDiagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
      };
    })
    .sort((left, right) => left.psNo.localeCompare(right.psNo, undefined, { numeric: true }));

  return {
    phase,
    createdAt: options.createdAt ?? new Date().toISOString(),
    summaryRows,
    occurrences,
    diagnostics,
  };
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializePsIsonoteSummaryCsv(report: PsIsonoteAuditReport): string {
  const headers = [
    'PS No.',
    'Family',
    'Mappings',
    'Found PS',
    'Occurrences',
    'Annotated',
    'Review',
    'Missing',
    'Average Confidence',
    'Minimum Confidence',
    'Errors',
  ];
  const rows = report.summaryRows.map((row) => [
    row.psNo,
    row.family,
    row.mappings,
    row.foundPs,
    row.occurrences,
    row.annotated,
    row.review,
    row.missing,
    row.averageConfidence,
    row.minimumConfidence,
    row.errors,
  ].map(csvCell).join(','));

  return [headers.join(','), ...rows].join('\n');
}
