import type { PdfAnnotation } from '@/core/annotations/types';
import { ANNOTATION_TYPES, type AnnotationType } from '@/core/annotations/annotationTypes';
import manifest from './annotationManifest.json';

export interface AnnotationFixtureDefinition {
  type: AnnotationType;
  pdfSubtype: string;
  appearanceStreamRequired: boolean;
  standardPdfFields: string[];
  sampleAnnotation: PdfAnnotation;
  ambiguity: {
    sharedSubtype: string | null;
    candidateTypes: string[];
    disambiguationField: string | null;
    rule: string;
  };
}

export const PHASE10_SUPPORTED_TYPES: readonly AnnotationType[] = ANNOTATION_TYPES;

export function createDeterministicAnnotation(
  type: AnnotationType,
  overrides?: Partial<PdfAnnotation>,
): PdfAnnotation {
  const fixtureMeta = manifest.fixtures[type as keyof typeof manifest.fixtures];
  if (!fixtureMeta) {
    throw new Error(`Unsupported annotation type fixture: ${type}`);
  }

  const base: PdfAnnotation = {
    id: `phase10-fixture-${type}-1`,
    type,
    pageNumber: 1,
    rect: { ...fixtureMeta.geometry },
    data: { ...fixtureMeta.defaults } as PdfAnnotation['data'],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100,
  };

  return {
    ...base,
    ...overrides,
    data: {
      ...base.data,
      ...overrides?.data,
    },
  };
}

export function getAllPhase10Fixtures(): PdfAnnotation[] {
  return PHASE10_SUPPORTED_TYPES.map((type) => createDeterministicAnnotation(type));
}

export function getFixtureMetadata(type: AnnotationType): AnnotationFixtureDefinition {
  const entry = manifest.fixtures[type as keyof typeof manifest.fixtures];
  if (!entry) {
    throw new Error(`No fixture metadata found for ${type}`);
  }
  return {
    type,
    pdfSubtype: entry.pdfSubtype,
    appearanceStreamRequired: entry.appearanceStreamRequired,
    standardPdfFields: entry.standardPdfFields,
    sampleAnnotation: createDeterministicAnnotation(type),
    ambiguity: entry.ambiguity,
  };
}
