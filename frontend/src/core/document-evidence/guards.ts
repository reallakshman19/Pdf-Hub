import type {
  EvidenceDecision, Geometry, Observation, PathSegment, ProviderProfile, Sha256,
  SourceIdentity, TableCandidate, TableDiscovery, TableEvidence, TableExtraction,
  TableExtractionOptions, TablePass, TablePassCell,
} from './types';

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const AUTHORITY_KEYS = new Set(['engineeringAuthority', 'screeningAuthority', 'designAuthority', 'publicationState']);

export class DocumentEvidenceContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DocumentEvidenceContractError';
    this.code = code;
  }
}

export function parseTableDiscovery(value: unknown): TableDiscovery {
  assertNoAuthorityFields(value);
  const item = exact(value, 'TABLE_DISCOVERY_INVALID', ['schema', 'sourceHash', 'source', 'candidates', 'diagnostics']);
  literal(item.schema, 'DocumentEvidenceTableDiscovery.v1', 'TABLE_DISCOVERY_SCHEMA_INVALID');
  const sourceHash = sha(item.sourceHash, 'TABLE_DISCOVERY_SOURCE_HASH_INVALID');
  const source = sourceIdentity(item.source);
  if (source.sha256 !== sourceHash || source.mediaType !== 'application/pdf') {
    fail('TABLE_DISCOVERY_SOURCE_CONFLICT', 'discovery source identity does not match the PDF source');
  }
  return {
    schema: 'DocumentEvidenceTableDiscovery.v1', sourceHash, source,
    candidates: arr(item.candidates, 'TABLE_DISCOVERY_CANDIDATES_INVALID').map(candidate),
    diagnostics: arr(item.diagnostics, 'TABLE_DISCOVERY_DIAGNOSTICS_INVALID'),
  };
}

export function parseTableExtraction(
  value: unknown,
  expected?: { sourceHash?: Sha256; pages?: readonly number[] },
): TableExtraction {
  assertNoAuthorityFields(value);
  const item = exact(value, 'TABLE_EXTRACTION_INVALID', ['schema', 'sourceHash', 'source', 'pages', 'tables', 'diagnostics', 'options']);
  literal(item.schema, 'DocumentEvidenceTableExtraction.v1', 'TABLE_EXTRACTION_SCHEMA_INVALID');
  const sourceHash = sha(item.sourceHash, 'TABLE_EXTRACTION_SOURCE_HASH_INVALID');
  const source = sourceIdentity(item.source);
  const pages = explicitPages(item.pages);
  if (source.sha256 !== sourceHash || source.mediaType !== 'application/pdf' || expected?.sourceHash && expected.sourceHash !== sourceHash) {
    fail('TABLE_EXTRACTION_SOURCE_CONFLICT', 'extraction is bound to an unexpected PDF source');
  }
  if (expected?.pages && !samePages(pages, expected.pages)) {
    fail('TABLE_EXTRACTION_PAGE_CONFLICT', 'extraction pages differ from the explicit request');
  }
  return {
    schema: 'DocumentEvidenceTableExtraction.v1', sourceHash, source, pages,
    tables: arr(item.tables, 'TABLE_EXTRACTION_TABLES_INVALID').map((entry) => tableEvidence(entry, sourceHash)),
    diagnostics: arr(item.diagnostics, 'TABLE_EXTRACTION_DIAGNOSTICS_INVALID'),
    options: tableOptions(item.options),
  };
}

export function assertExplicitExtractionInput(input: { sourcePath: string; sourceHash: string; pages: readonly number[] }): void {
  if (input.sourcePath.trim().length === 0) fail('TABLE_SOURCE_PATH_REQUIRED', 'sourcePath must be non-empty');
  sha(input.sourceHash, 'TABLE_SOURCE_HASH_INVALID');
  explicitPages(input.pages);
}

function sourceIdentity(value: unknown): SourceIdentity {
  const item = exact(value, 'SOURCE_IDENTITY_INVALID', ['schema', 'sourceId', 'sha256', 'mediaType', 'sizeBytes', 'logicalPath', 'git']);
  literal(item.schema, 'SourceIdentity.v1', 'SOURCE_IDENTITY_SCHEMA_INVALID');
  const git = item.git === undefined ? undefined : sourceGit(item.git);
  return {
    schema: 'SourceIdentity.v1', sourceId: text(item.sourceId, 'SOURCE_IDENTITY_ID_INVALID'),
    sha256: sha(item.sha256, 'SOURCE_IDENTITY_HASH_INVALID'), mediaType: text(item.mediaType, 'SOURCE_IDENTITY_MEDIA_TYPE_INVALID'),
    sizeBytes: integer(item.sizeBytes, 0, 'SOURCE_IDENTITY_SIZE_INVALID'),
    ...(item.logicalPath === undefined ? {} : { logicalPath: text(item.logicalPath, 'SOURCE_IDENTITY_PATH_INVALID') }),
    ...(git === undefined ? {} : { git }),
  };
}

function sourceGit(value: unknown): NonNullable<SourceIdentity['git']> {
  const item = exact(value, 'SOURCE_GIT_INVALID', ['repository', 'commit', 'blobSha1']);
  const commit = text(item.commit, 'SOURCE_GIT_COMMIT_INVALID');
  const blobSha1 = text(item.blobSha1, 'SOURCE_GIT_BLOB_INVALID');
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^sha1:[0-9a-f]{40}$/.test(blobSha1)) fail('SOURCE_GIT_HASH_INVALID', 'invalid Git source identity');
  return { repository: text(item.repository, 'SOURCE_GIT_REPOSITORY_INVALID'), commit, blobSha1 };
}

function tableEvidence(value: unknown, sourceHash: Sha256): TableEvidence {
  const item = rec(value, 'TABLE_EVIDENCE_INVALID');
  const observations = arr(item.observations, 'TABLE_OBSERVATIONS_INVALID').map((entry) => observation(entry, sourceHash));
  const providerProfile = item.providerProfile === undefined ? undefined : providerProfileValue(item.providerProfile);
  return {
    candidate: candidate(item.candidate), observations, tablePass: tablePass(item.tablePass, sourceHash),
    cellDecisions: arr(item.cellDecisions, 'TABLE_DECISIONS_INVALID').map(decision),
    ...(providerProfile === undefined ? {} : { providerProfile }),
    ...(item.ocrPass === undefined ? {} : { ocrPass: item.ocrPass }),
    ...(Array.isArray(item.ocrAssignmentDiagnostics) ? { ocrAssignmentDiagnostics: item.ocrAssignmentDiagnostics } : {}),
  };
}

function observation(value: unknown, sourceHash: Sha256): Observation {
  const item = exact(value, 'OBSERVATION_INVALID', [
    'schema', 'observationId', 'observationHash', 'kind', 'sourceHash', 'surfaceId', 'surfaceHash', 'provider', 'providerVersion',
    'providerProfileHash', 'inputRasterHash', 'rawText', 'normalizedText', 'providerConfidenceRaw', 'providerGeometry', 'providerSurfaceId',
    'providerSurfaceHash', 'documentGeometry', 'preprocessingTransformHashes', 'nativeQuality', 'rawProviderEvidenceHash', 'extensions',
  ]);
  literal(item.schema, 'Observation.v1', 'OBSERVATION_SCHEMA_INVALID');
  const observedSource = sha(item.sourceHash, 'OBSERVATION_SOURCE_HASH_INVALID');
  if (observedSource !== sourceHash) fail('OBSERVATION_SOURCE_CONFLICT', 'observation is bound to another source');
  if (item.kind !== 'native-text' && item.kind !== 'ocr') fail('OBSERVATION_KIND_INVALID', 'unsupported observation kind');
  if (item.providerGeometry !== undefined && (item.providerSurfaceId === undefined || item.providerSurfaceHash === undefined)) {
    fail('OBSERVATION_PROVIDER_SURFACE_REQUIRED', 'provider geometry requires provider surface identity');
  }
  return {
    schema: 'Observation.v1', observationId: text(item.observationId, 'OBSERVATION_ID_INVALID'),
    observationHash: sha(item.observationHash, 'OBSERVATION_HASH_INVALID'), kind: item.kind, sourceHash: observedSource,
    surfaceId: text(item.surfaceId, 'OBSERVATION_SURFACE_ID_INVALID'), surfaceHash: sha(item.surfaceHash, 'OBSERVATION_SURFACE_HASH_INVALID'),
    provider: text(item.provider, 'OBSERVATION_PROVIDER_INVALID'), providerVersion: text(item.providerVersion, 'OBSERVATION_PROVIDER_VERSION_INVALID'),
    rawText: stringValue(item.rawText, 'OBSERVATION_RAW_TEXT_INVALID'), normalizedText: stringValue(item.normalizedText, 'OBSERVATION_NORMALIZED_TEXT_INVALID'),
    documentGeometry: geometry(item.documentGeometry),
    ...(item.providerProfileHash === undefined ? {} : { providerProfileHash: sha(item.providerProfileHash, 'OBSERVATION_PROVIDER_PROFILE_HASH_INVALID') }),
    ...(item.inputRasterHash === undefined ? {} : { inputRasterHash: sha(item.inputRasterHash, 'OBSERVATION_RASTER_HASH_INVALID') }),
    ...(item.providerConfidenceRaw === undefined ? {} : { providerConfidenceRaw: item.providerConfidenceRaw === null ? null : finite(item.providerConfidenceRaw, 'OBSERVATION_CONFIDENCE_INVALID') }),
    ...(item.providerGeometry === undefined ? {} : { providerGeometry: geometry(item.providerGeometry) }),
    ...(item.providerSurfaceId === undefined ? {} : { providerSurfaceId: text(item.providerSurfaceId, 'OBSERVATION_PROVIDER_SURFACE_ID_INVALID') }),
    ...(item.providerSurfaceHash === undefined ? {} : { providerSurfaceHash: sha(item.providerSurfaceHash, 'OBSERVATION_PROVIDER_SURFACE_HASH_INVALID') }),
    ...(item.preprocessingTransformHashes === undefined ? {} : { preprocessingTransformHashes: arr(item.preprocessingTransformHashes, 'OBSERVATION_TRANSFORMS_INVALID').map((entry) => sha(entry, 'OBSERVATION_TRANSFORM_HASH_INVALID')) }),
    ...(item.nativeQuality === undefined ? {} : { nativeQuality: rec(item.nativeQuality, 'OBSERVATION_NATIVE_QUALITY_INVALID') }),
    ...(item.rawProviderEvidenceHash === undefined ? {} : { rawProviderEvidenceHash: sha(item.rawProviderEvidenceHash, 'OBSERVATION_RAW_EVIDENCE_HASH_INVALID') }),
    ...(item.extensions === undefined ? {} : { extensions: rec(item.extensions, 'OBSERVATION_EXTENSIONS_INVALID') }),
  };
}

function decision(value: unknown): EvidenceDecision {
  const item = exact(value, 'EVIDENCE_DECISION_INVALID', ['schema', 'decisionId', 'decisionHash', 'state', 'observationHashes', 'selectedObservationHash', 'effectiveText', 'effectiveNumericValue', 'diagnosticCodes', 'reconciliationProfileHash', 'notes']);
  literal(item.schema, 'EvidenceDecision.v1', 'EVIDENCE_DECISION_SCHEMA_INVALID');
  if (!['accepted', 'review_required', 'blocked', 'not_found'].includes(String(item.state))) fail('EVIDENCE_DECISION_STATE_INVALID', 'unsupported decision state');
  if (item.state === 'accepted' && item.selectedObservationHash === undefined) fail('EVIDENCE_DECISION_SELECTION_REQUIRED', 'accepted evidence requires selectedObservationHash');
  if (item.state !== 'accepted' && (item.effectiveText !== undefined || item.effectiveNumericValue !== undefined)) fail('EVIDENCE_DECISION_EFFECTIVE_VALUE_FORBIDDEN', 'unaccepted evidence cannot publish an effective value');
  return {
    schema: 'EvidenceDecision.v1', decisionId: text(item.decisionId, 'EVIDENCE_DECISION_ID_INVALID'), decisionHash: sha(item.decisionHash, 'EVIDENCE_DECISION_HASH_INVALID'),
    state: item.state as EvidenceDecision['state'], observationHashes: arr(item.observationHashes, 'EVIDENCE_DECISION_OBSERVATIONS_INVALID').map((entry) => sha(entry, 'EVIDENCE_DECISION_OBSERVATION_HASH_INVALID')),
    diagnosticCodes: arr(item.diagnosticCodes, 'EVIDENCE_DECISION_DIAGNOSTICS_INVALID').map((entry) => text(entry, 'EVIDENCE_DECISION_DIAGNOSTIC_INVALID')),
    ...(item.selectedObservationHash === undefined ? {} : { selectedObservationHash: sha(item.selectedObservationHash, 'EVIDENCE_DECISION_SELECTION_INVALID') }),
    ...(item.effectiveText === undefined ? {} : { effectiveText: stringValue(item.effectiveText, 'EVIDENCE_DECISION_TEXT_INVALID') }),
    ...(item.effectiveNumericValue === undefined ? {} : { effectiveNumericValue: finite(item.effectiveNumericValue, 'EVIDENCE_DECISION_NUMBER_INVALID') }),
    ...(item.reconciliationProfileHash === undefined ? {} : { reconciliationProfileHash: sha(item.reconciliationProfileHash, 'EVIDENCE_DECISION_PROFILE_INVALID') }),
    ...(item.notes === undefined ? {} : { notes: rec(item.notes, 'EVIDENCE_DECISION_NOTES_INVALID') }),
  };
}

function tablePass(value: unknown, sourceHash: Sha256): TablePass {
  const item = exact(value, 'TABLE_PASS_INVALID', ['schema', 'tablePassId', 'tablePassHash', 'tableCandidateId', 'passId', 'sourceHash', 'surfaceId', 'surfaceHash', 'cells']);
  literal(item.schema, 'TablePass.v1', 'TABLE_PASS_SCHEMA_INVALID');
  const passSource = sha(item.sourceHash, 'TABLE_PASS_SOURCE_HASH_INVALID');
  if (passSource !== sourceHash) fail('TABLE_PASS_SOURCE_CONFLICT', 'table pass is bound to another source');
  return {
    schema: 'TablePass.v1', tablePassId: text(item.tablePassId, 'TABLE_PASS_ID_INVALID'), tablePassHash: sha(item.tablePassHash, 'TABLE_PASS_HASH_INVALID'),
    tableCandidateId: text(item.tableCandidateId, 'TABLE_PASS_CANDIDATE_INVALID'), passId: text(item.passId, 'TABLE_PASS_PASS_ID_INVALID'), sourceHash: passSource,
    surfaceId: text(item.surfaceId, 'TABLE_PASS_SURFACE_ID_INVALID'), surfaceHash: sha(item.surfaceHash, 'TABLE_PASS_SURFACE_HASH_INVALID'),
    cells: arr(item.cells, 'TABLE_PASS_CELLS_INVALID').map(tableCell),
  };
}

function tableCell(value: unknown): TablePassCell {
  const item = exact(value, 'TABLE_PASS_CELL_INVALID', ['cellId', 'rowIndex', 'columnIndex', 'geometry', 'observationHashes']);
  const hashes = arr(item.observationHashes, 'TABLE_PASS_CELL_OBSERVATIONS_INVALID');
  if (hashes.length === 0) fail('TABLE_PASS_CELL_OBSERVATION_REQUIRED', 'table cell requires observation evidence');
  return { cellId: text(item.cellId, 'TABLE_PASS_CELL_ID_INVALID'), rowIndex: integer(item.rowIndex, 0, 'TABLE_PASS_CELL_ROW_INVALID'), columnIndex: integer(item.columnIndex, 0, 'TABLE_PASS_CELL_COLUMN_INVALID'), geometry: geometry(item.geometry), observationHashes: hashes.map((entry) => sha(entry, 'TABLE_PASS_CELL_OBSERVATION_HASH_INVALID')) };
}

function providerProfileValue(value: unknown): ProviderProfile {
  const item = exact(value, 'PROVIDER_PROFILE_INVALID', ['schema', 'profileId', 'profileHash', 'role', 'provider', 'providerVersion', 'providerBinaryHash', 'model', 'modelHash', 'language', 'coordinateConvention', 'quantizationErrorPx', 'options', 'determinism']);
  literal(item.schema, 'ProviderProfile.v1', 'PROVIDER_PROFILE_SCHEMA_INVALID');
  const roles = ['native-text', 'ocr', 'pdf-geometry', 'renderer', 'docx-semantic', 'other'];
  if (!roles.includes(String(item.role))) fail('PROVIDER_PROFILE_ROLE_INVALID', 'unsupported provider role');
  const d = rec(item.determinism, 'PROVIDER_PROFILE_DETERMINISM_INVALID');
  return {
    schema: 'ProviderProfile.v1', profileId: text(item.profileId, 'PROVIDER_PROFILE_ID_INVALID'), profileHash: sha(item.profileHash, 'PROVIDER_PROFILE_HASH_INVALID'),
    role: item.role as ProviderProfile['role'], provider: text(item.provider, 'PROVIDER_PROFILE_PROVIDER_INVALID'), providerVersion: text(item.providerVersion, 'PROVIDER_PROFILE_VERSION_INVALID'),
    determinism: { semantic: claim(d.semantic), artifact: claim(d.artifact), bitwiseRaster: claim(d.bitwiseRaster) },
    ...(item.providerBinaryHash === undefined ? {} : { providerBinaryHash: sha(item.providerBinaryHash, 'PROVIDER_PROFILE_BINARY_HASH_INVALID') }),
    ...(item.model === undefined ? {} : { model: text(item.model, 'PROVIDER_PROFILE_MODEL_INVALID') }),
    ...(item.modelHash === undefined ? {} : { modelHash: sha(item.modelHash, 'PROVIDER_PROFILE_MODEL_HASH_INVALID') }),
    ...(item.language === undefined ? {} : { language: text(item.language, 'PROVIDER_PROFILE_LANGUAGE_INVALID') }),
    ...(item.coordinateConvention === undefined ? {} : { coordinateConvention: text(item.coordinateConvention, 'PROVIDER_PROFILE_COORDINATE_INVALID') }),
    ...(item.quantizationErrorPx === undefined ? {} : { quantizationErrorPx: finite(item.quantizationErrorPx, 'PROVIDER_PROFILE_QUANTIZATION_INVALID') }),
    ...(item.options === undefined ? {} : { options: rec(item.options, 'PROVIDER_PROFILE_OPTIONS_INVALID') }),
  };
}

function candidate(value: unknown): TableCandidate {
  const item = rec(value, 'TABLE_CANDIDATE_INVALID');
  const box = arr(item.bbox, 'TABLE_CANDIDATE_BBOX_INVALID').map((entry) => finite(entry, 'TABLE_CANDIDATE_BBOX_INVALID'));
  if (box.length !== 4) fail('TABLE_CANDIDATE_BBOX_INVALID', 'candidate bbox must contain four numbers');
  return { candidateId: text(item.candidateId, 'TABLE_CANDIDATE_ID_INVALID'), page: integer(item.page, 1, 'TABLE_CANDIDATE_PAGE_INVALID'), strategy: text(item.strategy, 'TABLE_CANDIDATE_STRATEGY_INVALID'), bbox: [box[0], box[1], box[2], box[3]], rowCount: integer(item.rowCount, 0, 'TABLE_CANDIDATE_ROWS_INVALID'), columnCount: integer(item.columnCount, 0, 'TABLE_CANDIDATE_COLUMNS_INVALID') };
}

function tableOptions(value: unknown): TableExtractionOptions {
  const item = exact(value, 'TABLE_OPTIONS_INVALID', ['ocr', 'ocrLanguage']);
  if (item.ocr !== 'never' && item.ocr !== 'always') fail('TABLE_OCR_MODE_INVALID', 'table OCR mode must be never or always');
  return { ocr: item.ocr, ocrLanguage: text(item.ocrLanguage, 'TABLE_OCR_LANGUAGE_INVALID') };
}

function geometry(value: unknown): Geometry {
  const item = rec(value, 'GEOMETRY_INVALID');
  if (item.type === 'Point') return { type: 'Point', coordinates: point(item.coordinates) };
  if (item.type === 'Quad') {
    const points = arr(item.coordinates, 'GEOMETRY_QUAD_INVALID').map(point);
    if (points.length !== 4) fail('GEOMETRY_QUAD_INVALID', 'quad requires four points');
    return { type: 'Quad', coordinates: [points[0], points[1], points[2], points[3]] };
  }
  if (item.type === 'Polygon') {
    const points = arr(item.coordinates, 'GEOMETRY_POLYGON_INVALID').map(point);
    if (points.length < 3) fail('GEOMETRY_POLYGON_INVALID', 'polygon requires at least three points');
    return { type: 'Polygon', coordinates: points };
  }
  if (item.type === 'Path') return { type: 'Path', segments: arr(item.segments, 'GEOMETRY_PATH_INVALID').map(pathSegment) };
  fail('GEOMETRY_TYPE_INVALID', 'unsupported geometry type');
}

function pathSegment(value: unknown): PathSegment {
  const item = rec(value, 'GEOMETRY_PATH_SEGMENT_INVALID');
  if (item.op === 'M' || item.op === 'L') return { op: item.op, to: point(item.to) };
  if (item.op === 'C') return { op: 'C', c1: point(item.c1), c2: point(item.c2), to: point(item.to) };
  if (item.op === 'Z') return { op: 'Z' };
  fail('GEOMETRY_PATH_SEGMENT_INVALID', 'unsupported path segment');
}

function point(value: unknown): [number, number] {
  const values = arr(value, 'GEOMETRY_POINT_INVALID');
  if (values.length !== 2) fail('GEOMETRY_POINT_INVALID', 'point requires two numbers');
  return [finite(values[0], 'GEOMETRY_POINT_INVALID'), finite(values[1], 'GEOMETRY_POINT_INVALID')];
}

function explicitPages(value: unknown): number[] {
  const values = arr(value, 'TABLE_PAGES_INVALID').map((entry) => integer(entry, 1, 'TABLE_PAGE_INVALID'));
  if (values.length === 0) fail('TABLE_EXPLICIT_PAGES_REQUIRED', 'at least one explicit 1-based page is required');
  if (new Set(values).size !== values.length) fail('TABLE_PAGE_DUPLICATE', 'explicit pages must be unique');
  return [...values].sort((a, b) => a - b);
}

function samePages(left: readonly number[], right: readonly number[]): boolean {
  const normalized = [...right].sort((a, b) => a - b);
  return left.length === normalized.length && left.every((value, index) => value === normalized[index]);
}

function assertNoAuthorityFields(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertNoAuthorityFields); return; }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (AUTHORITY_KEYS.has(key)) fail('EVIDENCE_AUTHORITY_FIELD_FORBIDDEN', `generic evidence payload contains authority field: ${key}`);
    assertNoAuthorityFields(child);
  }
}

function exact(value: unknown, code: string, allowed: readonly string[]): Record<string, unknown> {
  const item = rec(value, code);
  const unexpected = Object.keys(item).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(code, `unexpected field(s): ${unexpected.join(', ')}`);
  return item;
}
function rec(value: unknown, code: string): Record<string, unknown> { if (!isRecord(value)) fail(code, 'expected object'); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function arr(value: unknown, code: string): unknown[] { if (!Array.isArray(value)) fail(code, 'expected array'); return value; }
function text(value: unknown, code: string): string { if (typeof value !== 'string' || value.length === 0) fail(code, 'expected non-empty string'); return value; }
function stringValue(value: unknown, code: string): string { if (typeof value !== 'string') fail(code, 'expected string'); return value; }
function sha(value: unknown, code: string): Sha256 { if (typeof value !== 'string' || !SHA256.test(value)) fail(code, 'expected sha256:<64 lowercase hex>'); return value as Sha256; }
function integer(value: unknown, minimum: number, code: string): number { if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) fail(code, `expected integer >= ${minimum}`); return value; }
function finite(value: unknown, code: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) fail(code, 'expected finite number'); return value; }
function literal(value: unknown, expected: string, code: string): void { if (value !== expected) fail(code, `expected ${expected}`); }
function claim(value: unknown): ProviderProfile['determinism']['semantic'] { const allowed = ['guaranteed', 'profile-bound', 'not-claimed', 'not-applicable']; if (!allowed.includes(String(value))) fail('PROVIDER_PROFILE_DETERMINISM_INVALID', 'unsupported determinism claim'); return value as ProviderProfile['determinism']['semantic']; }
function fail(code: string, message: string): never { throw new DocumentEvidenceContractError(code, message); }
