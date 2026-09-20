export const PHASE9_REQUIRED_FIXTURE_CLASSES = [
  'ordinary-native-text',
  'scanned-image-only',
  'mixed-geometry-rotation',
  'cropbox-mediabox',
  'nested-outlines',
  'page-labels',
  'acroform-populated',
  'native-annotations',
  'attachments-metadata',
  'tagged-pdf',
  'cid-subset-font',
  'arabic-cjk-rtl',
  'object-stream',
  'incremental-update',
  'encrypted',
  'signed',
  'malformed-readable-xref',
] as const;

export type FidelityFixtureClass =
  typeof PHASE9_REQUIRED_FIXTURE_CLASSES[number];

export const PHASE9_STRUCTURE_KINDS = [
  'pages-text',
  'image-only-pages',
  'page-geometry-boxes',
  'outline-tree',
  'page-labels',
  'acroform',
  'native-annotations',
  'embedded-files',
  'metadata',
  'tagged-structure',
  'font-resources',
  'unicode-text',
  'object-streams',
  'incremental-updates',
  'encryption',
  'signatures',
  'xref-readability',
] as const;

export type FidelityStructureKind =
  typeof PHASE9_STRUCTURE_KINDS[number];

export const PHASE9_MUTATION_CLASSES = [
  'rotate',
  'reorder',
  'delete',
  'duplicate',
  'donor-insert',
  'donor-replace',
  'donor-append',
  'save-export',
] as const;

export type FidelityMutationClass =
  typeof PHASE9_MUTATION_CLASSES[number];

export type FidelityDisposition =
  | 'preserve'
  | 'transform'
  | 'invalidate'
  | 'reject'
  | 'observe-only';

export type FidelityFixtureAvailability =
  | 'generated'
  | 'retained'
  | 'required-pending';

export interface FidelitySemanticExpectation {
  structure: FidelityStructureKind;
  expected: string;
}

export interface FidelityMutationExpectation {
  disposition: FidelityDisposition;
  rationale: string;
  expectedStructures: FidelitySemanticExpectation[];
}

export interface FidelityFixtureProvenance {
  kind:
    | 'deterministic-generator'
    | 'redistributable-retained'
    | 'required-source-pending';
  source: string;
  licenseOrOwnership: string;
  reproducible: boolean;
}

export interface FidelityFixtureManifestEntry {
  id: string;
  title: string;
  classes: FidelityFixtureClass[];
  availability: FidelityFixtureAvailability;
  provenance: FidelityFixtureProvenance;
  artifactPath: string | null;
  generatorId: string | null;
  structures: FidelityStructureKind[];
  baseline: FidelitySemanticExpectation[];
  mutations: Record<
    FidelityMutationClass,
    FidelityMutationExpectation
  >;
}

export interface FidelityCorpusManifest {
  schemaVersion: 1;
  corpusId: 'phase9-pdf-fidelity';
  fixtures: FidelityFixtureManifestEntry[];
}

export interface FidelityManifestDiagnostic {
  code:
    | 'INVALID_MANIFEST'
    | 'DUPLICATE_FIXTURE_ID'
    | 'UNKNOWN_CLASS'
    | 'MISSING_REQUIRED_CLASS'
    | 'MISSING_PROVENANCE'
    | 'MISSING_BASELINE_EXPECTATION'
    | 'MISSING_MUTATION_EXPECTATION'
    | 'INVALID_AVAILABILITY';
  message: string;
  fixtureId?: string;
  fixtureClass?: string;
}

export interface FidelityManifestValidation {
  valid: boolean;
  complete: boolean;
  diagnostics: FidelityManifestDiagnostic[];
  pendingFixtureIds: string[];
  missingRequiredClasses: FidelityFixtureClass[];
}
