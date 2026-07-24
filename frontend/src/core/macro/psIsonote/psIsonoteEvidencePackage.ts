import JSZip from 'jszip';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  serializePsIsonoteAuditManifest,
  serializePsIsonoteSummaryCsv,
  type PsIsonoteAuditReport,
  type PsIsonoteDiagnostic,
  type PsIsonoteOccurrenceAudit,
} from './psIsonoteAudit';
import {
  computePsIsonoteMappingHash,
  hashText,
} from './psIsonoteIdentity';
import type { PsIsonoteMapping } from './psIsonoteTable';

export const PS_ISONOTE_EVIDENCE_PACKAGE_SCHEMA_VERSION = 1;

export interface CreatePsIsonoteEvidencePackageOptions {
  report: PsIsonoteAuditReport;
  mappings: readonly PsIsonoteMapping[];
  sourceText: string;
  documentBytes: Uint8Array;
  documentName: string;
}

export interface PsIsonoteEvidencePackageEntry {
  name: string;
  sha256: string;
  sizeBytes: number;
}

export interface PsIsonoteEvidencePackageResult {
  bytes: Uint8Array;
  fileName: string;
  entries: PsIsonoteEvidencePackageEntry[];
  checksums: string;
}

interface PackagePayload {
  name: string;
  bytes: Uint8Array;
  compression: 'DEFLATE' | 'STORE';
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizedHash(hash: string): string {
  return hash.replace(/^sha256:/, '');
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document';
}

function packageDate(createdAt: string): Date {
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? new Date('1980-01-01T00:00:00.000Z') : parsed;
}

export function serializePsIsonoteOccurrenceCsv(report: PsIsonoteAuditReport): string {
  const headers = [
    'Run ID',
    'Phase',
    'PS No.',
    'Family',
    'ISONOTE',
    'Source Row',
    'Mapping SHA-256',
    'Occurrence ID',
    'Page',
    'Occurrence Index',
    'Status',
    'Raw Matched Text',
    'Normalized Matched Text',
    'Match Method',
    'Text Item Count',
    'Rect X',
    'Rect Y',
    'Rect Width',
    'Rect Height',
    'Existing Marker State',
    'Identity Score',
    'Geometry Score',
    'Mapping Integrity Score',
    'Match Confidence',
    'Diagnostic Codes',
  ];
  const rows = report.occurrences.map((occurrence) => [
    report.identity.runId,
    report.phase,
    occurrence.psNo,
    occurrence.family ?? '',
    occurrence.isonote,
    occurrence.sourceRow,
    occurrence.mappingHash,
    occurrence.occurrenceId,
    occurrence.pageNumber,
    occurrence.occurrenceIndex,
    occurrence.status,
    occurrence.rawMatchedText,
    occurrence.normalizedMatchedText,
    occurrence.matchMethod,
    occurrence.textItemCount,
    occurrence.rect.x,
    occurrence.rect.y,
    occurrence.rect.width,
    occurrence.rect.height,
    occurrence.existingMarkerState,
    occurrence.confidence.identity,
    occurrence.confidence.geometry,
    occurrence.confidence.mappingIntegrity,
    occurrence.confidence.matchConfidence,
    occurrence.diagnosticCodes.join('|'),
  ].map(csvCell).join(','));

  return [headers.join(','), ...rows].join('\n');
}

function occurrenceJsonRecord(
  report: PsIsonoteAuditReport,
  occurrence: PsIsonoteOccurrenceAudit,
): Record<string, unknown> {
  return {
    runId: report.identity.runId,
    phase: report.phase,
    createdAt: report.createdAt,
    inputSha256: report.identity.inputSha256,
    ...(report.identity.outputSha256
      ? { outputSha256: report.identity.outputSha256 }
      : {}),
    occurrence,
  };
}

export function serializePsIsonoteOccurrenceJsonl(report: PsIsonoteAuditReport): string {
  return report.occurrences
    .map((occurrence) => JSON.stringify(occurrenceJsonRecord(report, occurrence)))
    .join('\n');
}

function diagnosticRow(
  report: PsIsonoteAuditReport,
  diagnostic: PsIsonoteDiagnostic,
): string {
  return [
    report.identity.runId,
    report.phase,
    diagnostic.code,
    diagnostic.severity,
    diagnostic.psNo ?? '',
    diagnostic.pageNumber ?? null,
    diagnostic.occurrenceId ?? '',
    diagnostic.message,
  ].map(csvCell).join(',');
}

export function serializePsIsonoteDiagnosticsCsv(report: PsIsonoteAuditReport): string {
  const headers = [
    'Run ID',
    'Phase',
    'Code',
    'Severity',
    'PS No.',
    'Page',
    'Occurrence ID',
    'Message',
  ];
  return [
    headers.join(','),
    ...report.diagnostics.map((diagnostic) => diagnosticRow(report, diagnostic)),
  ].join('\n');
}

export async function serializePsIsonoteMappingSnapshotCsv(
  mappings: readonly PsIsonoteMapping[],
): Promise<string> {
  const rows = await Promise.all(mappings.map(async (mapping) => [
    mapping.psNo,
    mapping.family ?? '',
    mapping.isonote,
    mapping.sourceRow,
    await computePsIsonoteMappingHash(mapping),
  ].map(csvCell).join(',')));

  return [
    'PS No.,Family,ISONOTE,Source Row,Mapping SHA-256',
    ...rows,
  ].join('\n');
}

function packageReadme(report: PsIsonoteAuditReport, pdfName: string): string {
  return [
    'PDF Hub PS ISONOTE audit evidence package',
    '',
    `Package schema: ${PS_ISONOTE_EVIDENCE_PACKAGE_SCHEMA_VERSION}`,
    `Run ID: ${report.identity.runId}`,
    `Audit phase: ${report.phase}`,
    `Created at: ${report.createdAt}`,
    '',
    'Contents:',
    '- run-manifest.json: immutable run identity and verification summary',
    '- audit-report.json: complete audit report, occurrences, diagnostics, and verification evidence',
    '- ps-summary.csv: PS-number-wise operational summary',
    '- occurrence-audit.csv: occurrence-level tabular evidence',
    '- occurrence-audit.jsonl: one machine-readable occurrence per line',
    '- diagnostics.csv: informational, warning, and error diagnostics',
    '- mapping-source.txt: exact mapping input used for the run',
    '- mapping-snapshot.csv: normalized mappings with semantic SHA-256 values',
    `- ${pdfName}: PDF bytes to which this report is bound`,
    '- checksums.sha256: SHA-256 values for every other package file',
    '',
    'Verification:',
    'Run `sha256sum -c checksums.sha256` from the extracted package directory.',
    'The checksum file intentionally does not contain a checksum for itself.',
    '',
  ].join('\n');
}

async function payloadEntry(payload: PackagePayload): Promise<PsIsonoteEvidencePackageEntry> {
  return {
    name: payload.name,
    sha256: await FileAdapter.hashBytes(payload.bytes),
    sizeBytes: payload.bytes.byteLength,
  };
}

function serializeChecksums(entries: readonly PsIsonoteEvidencePackageEntry[]): string {
  return [...entries]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `${normalizedHash(entry.sha256)}  ${entry.name}`)
    .join('\n');
}

async function assertBoundInputs(
  options: CreatePsIsonoteEvidencePackageOptions,
): Promise<void> {
  const [documentSha256, sourceSha256] = await Promise.all([
    FileAdapter.hashBytes(options.documentBytes),
    hashText(options.sourceText),
  ]);
  const expectedDocumentSha256 = options.report.identity.outputSha256 ??
    options.report.identity.inputSha256;

  if (documentSha256 !== expectedDocumentSha256) {
    throw new Error(
      `Evidence PDF hash mismatch: expected ${expectedDocumentSha256}, received ${documentSha256}.`,
    );
  }
  if (sourceSha256 !== options.report.identity.mappingSha256) {
    throw new Error(
      `Evidence mapping source hash mismatch: expected ${options.report.identity.mappingSha256}, received ${sourceSha256}.`,
    );
  }
}

export async function createPsIsonoteEvidencePackage(
  options: CreatePsIsonoteEvidencePackageOptions,
): Promise<PsIsonoteEvidencePackageResult> {
  await assertBoundInputs(options);

  const pdfName = options.report.identity.outputSha256 ? 'annotated.pdf' : 'input.pdf';
  const mappingSnapshot = await serializePsIsonoteMappingSnapshotCsv(options.mappings);
  const payloads: PackagePayload[] = [
    {
      name: 'README.txt',
      bytes: encodeText(packageReadme(options.report, pdfName)),
      compression: 'DEFLATE',
    },
    {
      name: 'run-manifest.json',
      bytes: encodeText(serializePsIsonoteAuditManifest(options.report)),
      compression: 'DEFLATE',
    },
    {
      name: 'audit-report.json',
      bytes: encodeText(JSON.stringify(options.report, null, 2)),
      compression: 'DEFLATE',
    },
    {
      name: 'ps-summary.csv',
      bytes: encodeText(serializePsIsonoteSummaryCsv(options.report)),
      compression: 'DEFLATE',
    },
    {
      name: 'occurrence-audit.csv',
      bytes: encodeText(serializePsIsonoteOccurrenceCsv(options.report)),
      compression: 'DEFLATE',
    },
    {
      name: 'occurrence-audit.jsonl',
      bytes: encodeText(serializePsIsonoteOccurrenceJsonl(options.report)),
      compression: 'DEFLATE',
    },
    {
      name: 'diagnostics.csv',
      bytes: encodeText(serializePsIsonoteDiagnosticsCsv(options.report)),
      compression: 'DEFLATE',
    },
    {
      name: 'mapping-source.txt',
      bytes: encodeText(options.sourceText.replace(/\r\n/g, '\n')),
      compression: 'DEFLATE',
    },
    {
      name: 'mapping-snapshot.csv',
      bytes: encodeText(mappingSnapshot),
      compression: 'DEFLATE',
    },
    {
      name: pdfName,
      bytes: new Uint8Array(options.documentBytes),
      compression: 'STORE',
    },
  ];
  payloads.sort((left, right) => left.name.localeCompare(right.name));

  const entries = await Promise.all(payloads.map(payloadEntry));
  const checksums = serializeChecksums(entries);
  const zip = new JSZip();
  const date = packageDate(options.report.createdAt);
  const decoder = new TextDecoder();

  for (const payload of payloads) {
    const data = payload.compression === 'DEFLATE'
      ? decoder.decode(payload.bytes)
      : payload.bytes;
    zip.file(payload.name, data, {
      binary: payload.compression === 'STORE',
      date,
      compression: payload.compression,
      compressionOptions: payload.compression === 'DEFLATE' ? { level: 6 } : undefined,
    });
  }
  zip.file('checksums.sha256', checksums, {
    date,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  });
  const stem = safeFilePart(options.documentName);

  return {
    bytes,
    fileName: `${stem}-ps-isonote-evidence-${options.report.identity.runId}.zip`,
    entries,
    checksums,
  };
}
