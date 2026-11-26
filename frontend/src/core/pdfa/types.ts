/**
 * Pure TypeScript domain models for ISO 19005 (PDF/A) Preflight,
 * Remediation, and Archival Export.
 *
 * Invariant INV-4 & INV-11 compliant: zero UI, Canvas, Konva, or console.log dependencies.
 */

export type PdfAConformanceLevel = 'PDFA_1B' | 'PDFA_2B' | 'PDFA_2U' | 'PDFA_3B';

export type PdfACheckSeverity = 'pass' | 'warning' | 'blocker';

export type PdfACheckCategory =
  | 'structure'
  | 'encryption'
  | 'xmp-metadata'
  | 'color-intent'
  | 'fonts'
  | 'transparency'
  | 'annotations'
  | 'actions'
  | 'attachments'
  | 'signatures';

export interface PdfAProfileDescriptor {
  readonly id: PdfAConformanceLevel;
  readonly label: string;
  readonly shortLabel: string;
  readonly isoStandard: string;
  readonly part: 1 | 2 | 3;
  readonly conformance: 'B' | 'U';
  readonly pdfVersionLabel: string;
  readonly supportsTransparency: boolean;
  readonly supportsObjectStreams: boolean;
  readonly supportsAssociatedFiles: boolean;
  readonly requiresToUnicode: boolean;
  readonly description: string;
}

export const PDFA_PROFILES: Record<PdfAConformanceLevel, PdfAProfileDescriptor> = {
  PDFA_2B: {
    id: 'PDFA_2B',
    label: 'PDF/A-2b (Recommended Archival)',
    shortLabel: 'PDF/A-2b',
    isoStandard: 'ISO 19005-2:2011',
    part: 2,
    conformance: 'B',
    pdfVersionLabel: '1.7',
    supportsTransparency: true,
    supportsObjectStreams: true,
    supportsAssociatedFiles: false,
    requiresToUnicode: false,
    description:
      'Universal ISO 19005-2 archival standard preserving vector graphics, JPEG compression, and transparency.',
  },
  PDFA_2U: {
    id: 'PDFA_2U',
    label: 'PDF/A-2u (Archival + Unicode Mapping)',
    shortLabel: 'PDF/A-2u',
    isoStandard: 'ISO 19005-2:2011',
    part: 2,
    conformance: 'U',
    pdfVersionLabel: '1.7',
    supportsTransparency: true,
    supportsObjectStreams: true,
    supportsAssociatedFiles: false,
    requiresToUnicode: true,
    description:
      'Strict PDF/A-2 archival conformance requiring ToUnicode CMap text extraction coverage on every font.',
  },
  PDFA_3B: {
    id: 'PDFA_3B',
    label: 'PDF/A-3b (Archival + Associated Files)',
    shortLabel: 'PDF/A-3b',
    isoStandard: 'ISO 19005-3:2012',
    part: 3,
    conformance: 'B',
    pdfVersionLabel: '1.7',
    supportsTransparency: true,
    supportsObjectStreams: true,
    supportsAssociatedFiles: true,
    requiresToUnicode: false,
    description:
      'Supports PDF/A-2b archival guarantees plus structured /AF associated file attachments with AFRelationship metadata.',
  },
  PDFA_1B: {
    id: 'PDFA_1B',
    label: 'PDF/A-1b (Legacy ISO 19005-1)',
    shortLabel: 'PDF/A-1b',
    isoStandard: 'ISO 19005-1:2005',
    part: 1,
    conformance: 'B',
    pdfVersionLabel: '1.4',
    supportsTransparency: false,
    supportsObjectStreams: false,
    supportsAssociatedFiles: false,
    requiresToUnicode: false,
    description:
      'Legacy archival profile (%PDF-1.4, classic xref table). Forbids alpha transparency and embedded files.',
  },
};

export interface PdfACheckItem {
  id: string;
  category: PdfACheckCategory;
  severity: PdfACheckSeverity;
  autoFixable: boolean;
  title: string;
  detail: string;
  pages?: number[];
}

export type PdfAFontClassification =
  | 'embedded-with-tounicode'
  | 'embedded-missing-tounicode'
  | 'unembedded-standard14-remediable'
  | 'unembedded-external'
  | 'type3';

export interface PdfAFontAuditEntry {
  resourceName: string;
  baseFont: string;
  subtype: string;
  classification: PdfAFontClassification;
  pages: number[];
  embedded: boolean;
  hasToUnicode: boolean;
  mappedStandard14?: string | null;
}

export interface PdfAArchivalMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creatorTool: string;
  producer: string;
  language: string;
  createDateIso: string;
  modifyDateIso: string;
}

export interface PdfAAttachmentEntry {
  name: string;
  mimeType: string | null;
  hasAfRelationship: boolean;
  afRelationship: string | null;
}

export interface PdfAPreflightReport {
  targetConformance: PdfAConformanceLevel;
  pageCount: number;
  pdfHeaderVersion: string;
  hasBinaryHeaderComment: boolean;
  hasTrailerId: boolean;
  usesObjectStreams: boolean;
  isEncrypted: boolean;
  hasJavaScriptOrActions: boolean;
  hasTransparency: boolean;
  transparencyPages: number[];
  usesDeviceRgb: boolean;
  usesDeviceGray: boolean;
  usesDeviceCmyk: boolean;
  hasOutputIntent: boolean;
  outputIntentSummary: string | null;
  outputIntentComponentCount: number | null;
  hasXmpMetadata: boolean;
  xmpCompressed: boolean;
  declaredPdfAPart: number | null;
  declaredPdfAConformance: string | null;
  infoXmpSynchronized: boolean;
  attachments: PdfAAttachmentEntry[];
  fonts: PdfAFontAuditEntry[];
  annotationIssuesCount: number;
  hasNeedAppearances: boolean;
  signatureStatus: 'SIGNED' | 'UNSIGNED' | 'UNKNOWN';
  signatureCount: number;
  metadata: PdfAArchivalMetadata;
  checks: PdfACheckItem[];
  readyWithoutRemediation: boolean;
  canExportWithRemediation: boolean;
}

export interface PdfARemediationOptions {
  targetConformance: PdfAConformanceLevel;
  metadata: PdfAArchivalMetadata;
  embedStandard14Fonts: boolean;
  substituteExternalUnembeddedFonts: boolean;
  flattenAnnotations: boolean;
  stripUnsafeActionsAndJs: boolean;
  stripNonCompliantAttachments: boolean;
  attachAuditCertificateInPdfA3b: boolean;
  rasterizeTransparentPagesFor1b: boolean;
}

export interface PdfAComplianceCertificate {
  schemaVersion: 1;
  generator: string;
  generatedAt: string;
  targetConformance: PdfAConformanceLevel;
  isoStandard: string;
  passed: boolean;
  sourceSha256: string;
  exportedSha256: string;
  pageCount: number;
  metadata: PdfAArchivalMetadata;
  remediationsApplied: string[];
  remainingBlockers: PdfACheckItem[];
  remainingWarnings: PdfACheckItem[];
  fontAudit: PdfAFontAuditEntry[];
}

export interface ExportPdfAInput {
  pdfBytes: Uint8Array;
  options: PdfARemediationOptions;
  fileName?: string;
}

export interface ExportPdfAResult {
  bytes: Uint8Array;
  certificate: PdfAComplianceCertificate;
  postExportReport: PdfAPreflightReport;
  pageCount: number;
}

export function normalizeXmpTimestamp(value?: Date | string | null): string {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' && value.trim().length > 0
      ? new Date(value)
      : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  // Whole-second ISO UTC string matches both XMP Date and PDF /Info D:...Z seconds cleanly.
  return safe.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function createDefaultPdfAMetadata(
  fileName?: string | null,
  overrides: Partial<PdfAArchivalMetadata> = {},
): PdfAArchivalMetadata {
  const cleanBase =
    (fileName ?? '')
      .replace(/\.pdf$/i, '')
      .trim() || 'Archival Document';
  const nowIso = normalizeXmpTimestamp(new Date());

  return {
    title: overrides.title?.trim() || cleanBase,
    author: overrides.author?.trim() ?? '',
    subject: overrides.subject?.trim() ?? '',
    keywords: overrides.keywords?.trim() ?? '',
    creatorTool: overrides.creatorTool?.trim() || 'PDF Hub Archival Engine',
    producer: overrides.producer?.trim() || 'PDF Hub PDF/A Compliance Pipeline',
    language: overrides.language?.trim() || 'en-US',
    createDateIso: overrides.createDateIso
      ? normalizeXmpTimestamp(overrides.createDateIso)
      : nowIso,
    modifyDateIso: overrides.modifyDateIso
      ? normalizeXmpTimestamp(overrides.modifyDateIso)
      : nowIso,
  };
}

export function createDefaultPdfARemediationOptions(
  targetConformance: PdfAConformanceLevel = 'PDFA_2B',
  metadata: PdfAArchivalMetadata = createDefaultPdfAMetadata(),
): PdfARemediationOptions {
  return {
    targetConformance,
    metadata,
    embedStandard14Fonts: true,
    substituteExternalUnembeddedFonts: false,
    flattenAnnotations: true,
    stripUnsafeActionsAndJs: true,
    stripNonCompliantAttachments: targetConformance !== 'PDFA_3B',
    attachAuditCertificateInPdfA3b: targetConformance === 'PDFA_3B',
    rasterizeTransparentPagesFor1b: false,
  };
}
