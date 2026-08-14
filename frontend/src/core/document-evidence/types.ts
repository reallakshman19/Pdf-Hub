export const DOCUMENT_EVIDENCE_CONTRACT = {
  repository: 'reallaksh19/XML_Compare_Utilities',
  commit: 'e7a394fd7f35c34cda5cad13df55cae2dd37bca2',
  path: 'contracts/document-evidence/v1',
  openApiVersion: '1.4.1',
  schemaMajor: 1,
  authority: 'external',
} as const;

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type Sha256 = `sha256:${string}`;

export interface SourceGitIdentity {
  readonly repository: string;
  readonly commit: string;
  readonly blobSha1: string;
}

export interface SourceIdentity {
  readonly schema: 'SourceIdentity.v1';
  readonly sourceId: string;
  readonly sha256: Sha256;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly logicalPath?: string;
  readonly git?: SourceGitIdentity;
}

export type ProviderRole =
  | 'native-text'
  | 'ocr'
  | 'pdf-geometry'
  | 'renderer'
  | 'docx-semantic'
  | 'other';

export type DeterminismClaim =
  | 'guaranteed'
  | 'profile-bound'
  | 'not-claimed'
  | 'not-applicable';

export interface ProviderProfile {
  readonly schema: 'ProviderProfile.v1';
  readonly profileId: string;
  readonly profileHash: Sha256;
  readonly role: ProviderRole;
  readonly provider: string;
  readonly providerVersion: string;
  readonly providerBinaryHash?: Sha256;
  readonly model?: string;
  readonly modelHash?: Sha256;
  readonly language?: string;
  readonly coordinateConvention?: string;
  readonly quantizationErrorPx?: number;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly determinism: {
    readonly semantic: DeterminismClaim;
    readonly artifact: DeterminismClaim;
    readonly bitwiseRaster: DeterminismClaim;
  };
}

export interface PointGeometry {
  readonly type: 'Point';
  readonly coordinates: readonly [number, number];
}

export interface QuadGeometry {
  readonly type: 'Quad';
  readonly coordinates: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
}

export interface PolygonGeometry {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly [number, number])[];
}

export type PathSegment =
  | { readonly op: 'M' | 'L'; readonly to: readonly [number, number] }
  | {
      readonly op: 'C';
      readonly c1: readonly [number, number];
      readonly c2: readonly [number, number];
      readonly to: readonly [number, number];
    }
  | { readonly op: 'Z' };

export interface PathGeometry {
  readonly type: 'Path';
  readonly segments: readonly PathSegment[];
}

export type Geometry = PointGeometry | QuadGeometry | PolygonGeometry | PathGeometry;

export interface Observation {
  readonly schema: 'Observation.v1';
  readonly observationId: string;
  readonly observationHash: Sha256;
  readonly kind: 'native-text' | 'ocr';
  readonly sourceHash: Sha256;
  readonly surfaceId: string;
  readonly surfaceHash: Sha256;
  readonly provider: string;
  readonly providerVersion: string;
  readonly providerProfileHash?: Sha256;
  readonly inputRasterHash?: Sha256;
  readonly rawText: string;
  readonly normalizedText: string;
  readonly providerConfidenceRaw?: number | null;
  readonly providerGeometry?: Geometry;
  readonly providerSurfaceId?: string;
  readonly providerSurfaceHash?: Sha256;
  readonly documentGeometry: Geometry;
  readonly preprocessingTransformHashes?: readonly Sha256[];
  readonly nativeQuality?: Readonly<Record<string, unknown>>;
  readonly rawProviderEvidenceHash?: Sha256;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export type EvidenceDecisionState =
  | 'accepted'
  | 'review_required'
  | 'blocked'
  | 'not_found';

export interface EvidenceDecision {
  readonly schema: 'EvidenceDecision.v1';
  readonly decisionId: string;
  readonly decisionHash: Sha256;
  readonly state: EvidenceDecisionState;
  readonly observationHashes: readonly Sha256[];
  readonly selectedObservationHash?: Sha256;
  readonly effectiveText?: string;
  readonly effectiveNumericValue?: number;
  readonly diagnosticCodes: readonly string[];
  readonly reconciliationProfileHash?: Sha256;
  readonly notes?: Readonly<Record<string, unknown>>;
}

export interface TableCandidate {
  readonly candidateId: string;
  readonly page: number;
  readonly strategy: string;
  readonly bbox: readonly [number, number, number, number];
  readonly rowCount: number;
  readonly columnCount: number;
}

export interface TablePassCell {
  readonly cellId: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly geometry: Geometry;
  readonly observationHashes: readonly Sha256[];
}

export interface TablePass {
  readonly schema: 'TablePass.v1';
  readonly tablePassId: string;
  readonly tablePassHash: Sha256;
  readonly tableCandidateId: string;
  readonly passId: string;
  readonly sourceHash: Sha256;
  readonly surfaceId: string;
  readonly surfaceHash: Sha256;
  readonly cells: readonly TablePassCell[];
}

export interface TableEvidence {
  readonly candidate: TableCandidate;
  readonly observations: readonly Observation[];
  readonly tablePass: TablePass;
  readonly cellDecisions: readonly EvidenceDecision[];
  readonly providerProfile?: ProviderProfile;
  readonly ocrPass?: unknown;
  readonly ocrAssignmentDiagnostics?: readonly unknown[];
}

export interface TableDiscovery {
  readonly schema: 'DocumentEvidenceTableDiscovery.v1';
  readonly sourceHash: Sha256;
  readonly source: SourceIdentity;
  readonly candidates: readonly TableCandidate[];
  readonly diagnostics: readonly unknown[];
}

export interface TableExtractionOptions {
  readonly ocr: 'never' | 'always';
  readonly ocrLanguage: string;
}

export interface TableExtraction {
  readonly schema: 'DocumentEvidenceTableExtraction.v1';
  readonly sourceHash: Sha256;
  readonly source: SourceIdentity;
  readonly pages: readonly number[];
  readonly tables: readonly TableEvidence[];
  readonly diagnostics: readonly unknown[];
  readonly options: TableExtractionOptions;
}

export interface DiscoverTablesRequest {
  readonly sourcePath: string;
  readonly signal?: AbortSignal;
}

export interface ExtractTablesRequest {
  readonly sourcePath: string;
  readonly sourceHash: Sha256;
  readonly pages: readonly number[];
  readonly options?: Partial<TableExtractionOptions>;
  readonly signal?: AbortSignal;
}
