import { FileAdapter } from '@/adapters/file/FileAdapter';
import type { MacroRecipe, PageSelector } from '@/core/macro/types';
import type { PsIsonoteMapping } from './psIsonoteTable';

export const PS_ISONOTE_AUDIT_SCHEMA_VERSION = '2';
export const PS_ISONOTE_MARKER_SCHEMA_VERSION = 'v2';

export interface PsIsonoteMarkerIdentity {
  psNo: string;
  mappingHash: string;
  occurrenceId: string;
}

export interface ParsedPsIsonoteMarker extends PsIsonoteMarkerIdentity {
  raw: string;
}

export interface PsIsonoteAuditIdentity {
  runId: string;
  documentName: string;
  inputDocumentKey: string | null;
  outputDocumentKey?: string | null;
  inputSha256: string;
  outputSha256?: string;
  mappingSha256: string;
  recipeSha256: string;
  scopeSha256: string;
  auditSchemaVersion: string;
  markerSchemaVersion: string;
}

export interface PsIsonoteScopeIdentity {
  selector: PageSelector;
  currentPage?: number;
  selectedPages: number[];
  skipExisting: boolean;
  placement: 'auto' | 'right' | 'left';
  noteWidth: number;
  fontSize: number;
  includeFamily: boolean;
}

export interface CreatePsIsonoteAuditIdentityOptions {
  documentName: string;
  inputDocumentKey: string | null;
  outputDocumentKey?: string | null;
  inputSha256: string;
  outputBytes?: Uint8Array;
  sourceText: string;
  recipe: MacroRecipe;
  scope: PsIsonoteScopeIdentity;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortCanonical(entry)]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

export async function hashCanonical(value: unknown): Promise<string> {
  return FileAdapter.hashBytes(new TextEncoder().encode(canonicalJson(value)));
}

export async function hashText(value: string): Promise<string> {
  return FileAdapter.hashBytes(new TextEncoder().encode(value.replace(/\r\n/g, '\n')));
}

export async function computePsIsonoteMappingHash(
  mapping: PsIsonoteMapping,
): Promise<string> {
  return hashCanonical({
    psNo: mapping.psNo,
    family: mapping.family?.trim() ?? '',
    isonote: mapping.isonote.trim().replace(/\s+/g, ' '),
  });
}

export async function computePsIsonoteOccurrenceId(options: {
  /** Retained for caller compatibility; document hashes belong to run identity, not marker identity. */
  inputSha256?: string;
  pageNumber: number;
  psNo: string;
  rect: { x: number; y: number; width: number; height: number };
}): Promise<string> {
  const roundedRect = Object.fromEntries(
    Object.entries(options.rect).map(([key, value]) => [key, Math.round(value * 100) / 100]),
  );

  return hashCanonical({
    pageNumber: options.pageNumber,
    psNo: options.psNo,
    rect: roundedRect,
  });
}

export function normalizePsIsonoteMarkerText(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

function psSuffix(psNo: string): string {
  return psNo.replace(/^PS-/, '');
}

export function legacyMarkerForPs(psNo: string): string {
  return `PDFHUBISONOTE[${psSuffix(psNo)}]`;
}

export function versionedMarkerForOccurrence(
  identity: PsIsonoteMarkerIdentity,
): string {
  // Store only the suffix so the hidden marker cannot be rediscovered by the
  // PDF PS-reference search pattern as a false occurrence on later runs.
  return [
    'PDFHUBISONOTE[',
    PS_ISONOTE_MARKER_SCHEMA_VERSION,
    '|',
    psSuffix(identity.psNo),
    '|',
    identity.mappingHash,
    '|',
    identity.occurrenceId,
    ']',
  ].join('');
}

const VERSIONED_MARKER_PATTERN =
  /PDFHUBISONOTE\[V2\|([A-Z0-9.-]+)\|(SHA256:[A-F0-9]{64})\|(SHA256:[A-F0-9]{64})\]/g;

export function parseVersionedPsIsonoteMarkers(
  pageText: string,
): ParsedPsIsonoteMarker[] {
  const normalized = normalizePsIsonoteMarkerText(pageText);
  const markers: ParsedPsIsonoteMarker[] = [];
  VERSIONED_MARKER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = VERSIONED_MARKER_PATTERN.exec(normalized)) !== null) {
    markers.push({
      raw: match[0],
      psNo: `PS-${match[1]}`,
      mappingHash: match[2].toLowerCase(),
      occurrenceId: match[3].toLowerCase(),
    });
  }

  return markers;
}

export function hasLegacyPsIsonoteMarker(pageText: string, psNo: string): boolean {
  return normalizePsIsonoteMarkerText(pageText).includes(
    normalizePsIsonoteMarkerText(legacyMarkerForPs(psNo)),
  );
}

export async function createPsIsonoteAuditIdentity(
  options: CreatePsIsonoteAuditIdentityOptions,
): Promise<PsIsonoteAuditIdentity> {
  const [mappingSha256, recipeSha256, scopeSha256, outputSha256] = await Promise.all([
    hashText(options.sourceText),
    hashCanonical({ name: options.recipe.name, steps: options.recipe.steps }),
    hashCanonical(options.scope),
    options.outputBytes ? FileAdapter.hashBytes(options.outputBytes) : Promise.resolve(undefined),
  ]);
  const runHash = await hashCanonical({
    inputSha256: options.inputSha256,
    mappingSha256,
    recipeSha256,
    scopeSha256,
  });

  return {
    runId: `psiso-${runHash.replace(/^sha256:/, '').slice(0, 24)}`,
    documentName: options.documentName,
    inputDocumentKey: options.inputDocumentKey,
    ...(options.outputDocumentKey !== undefined
      ? { outputDocumentKey: options.outputDocumentKey }
      : {}),
    inputSha256: options.inputSha256,
    ...(outputSha256 ? { outputSha256 } : {}),
    mappingSha256,
    recipeSha256,
    scopeSha256,
    auditSchemaVersion: PS_ISONOTE_AUDIT_SCHEMA_VERSION,
    markerSchemaVersion: PS_ISONOTE_MARKER_SCHEMA_VERSION,
  };
}
