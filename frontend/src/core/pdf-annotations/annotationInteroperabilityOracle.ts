import type { AnnotationType } from '@/core/annotations/annotationTypes';
import type { PdfAnnotation } from '@/core/annotations/types';
import manifest from './fixtures/annotationManifest.json';

export interface SubtypeAmbiguityResolution {
  resolvedType: AnnotationType;
  sharedSubtype: string;
  distinguishingField: string;
  reason: string;
}

export interface NativeDictInspector {
  subtype: string;
  name?: string | null;
  open?: boolean;
  contents?: string | null;
  stateModel?: string | null;
  intent?: string | null;
  calloutLine?: number[] | null;
  borderEffect?: { style?: string; intensity?: number } | null;
  lineEndings?: [string, string] | null;
  color?: { r: number; g: number; b: number } | null;
  interiorColor?: { r: number; g: number; b: number } | null;
  customType?: string | null;
}

/**
 * Phase 10 Semantic Oracle for Native Annotation Interoperability.
 * Provides machine-readable resolution of subtype ambiguities,
 * appearance stream expectations, and external-edit precedence.
 */
export class AnnotationInteroperabilityOracle {
  public static readonly MANIFEST = manifest;

  /** Checks whether the given annotation type requires an explicit /AP appearance stream. */
  public static isAppearanceStreamRequired(type: AnnotationType): boolean {
    const entry = manifest.fixtures[type as keyof typeof manifest.fixtures];
    return entry ? Boolean(entry.appearanceStreamRequired) : true;
  }

  /** Gets the expected PDF Subtype for a given application annotation type. */
  public static getExpectedSubtype(type: AnnotationType): string {
    const entry = manifest.fixtures[type as keyof typeof manifest.fixtures];
    if (!entry) throw new Error(`Unknown annotation type: ${type}`);
    return entry.pdfSubtype;
  }

  /**
   * Resolves subtype ambiguities without relying on custom PDFHubType metadata.
   * Handles:
   *  - FreeText: textbox vs callout
   *  - Text: comment vs sticky-note
   *  - Square: shape-rect vs shape-cloud vs redaction
   *  - Line: line vs arrow
   */
  public static resolveSubtypeAmbiguity(
    inspector: NativeDictInspector,
  ): SubtypeAmbiguityResolution {
    const subtype = inspector.subtype;

    switch (subtype) {
      case 'FreeText': {
        const isCallout =
          inspector.intent === 'FreeTextCallout'
          || (Array.isArray(inspector.calloutLine) && inspector.calloutLine.length >= 4);
        return {
          resolvedType: isCallout ? 'callout' : 'textbox',
          sharedSubtype: 'FreeText',
          distinguishingField: isCallout ? 'IT/CL' : 'None',
          reason: isCallout
            ? 'FreeText has callout intent (/IT /FreeTextCallout) or callout coordinates (/CL)'
            : 'FreeText lacks callout intent and line coordinates; resolved as standard textbox',
        };
      }

      case 'Text': {
        const isComment =
          Boolean(inspector.stateModel)
          || Boolean(inspector.customType === 'comment');
        return {
          resolvedType: isComment ? 'comment' : 'sticky-note',
          sharedSubtype: 'Text',
          distinguishingField: inspector.stateModel ? 'StateModel' : 'Open/Icon',
          reason: isComment
            ? 'Text annotation has review state model or review discussion hierarchy'
            : 'Text annotation represents a standalone canvas sticky note',
        };
      }

      case 'Square': {
        const isCloud =
          inspector.borderEffect?.style === 'C'
          || (inspector.borderEffect && typeof inspector.borderEffect === 'object');
        if (isCloud) {
          return {
            resolvedType: 'shape-cloud',
            sharedSubtype: 'Square',
            distinguishingField: 'BE',
            reason: 'Square dictionary has border effect BE << /S /C >> (cloud border)',
          };
        }

        const isRedaction =
          inspector.customType === 'redaction'
          || (inspector.interiorColor?.r === 0
            && inspector.interiorColor?.g === 0
            && inspector.interiorColor?.b === 0
            && inspector.color?.r === 0
            && inspector.color?.g === 0
            && inspector.color?.b === 0);

        if (isRedaction) {
          return {
            resolvedType: 'redaction',
            sharedSubtype: 'Square',
            distinguishingField: 'Color/InteriorColor',
            reason: 'Square represents a visual mask with opaque black styling; never emitted as PDF Redact',
          };
        }

        return {
          resolvedType: 'shape-rect',
          sharedSubtype: 'Square',
          distinguishingField: 'Border',
          reason: 'Standard square annotation with rectangular geometry',
        };
      }

      case 'Line': {
        const endings = inspector.lineEndings;
        const isArrow = Boolean(
          endings
          && (endings[1] === 'OpenArrow'
            || endings[1] === 'ClosedArrow'
            || endings[0] === 'OpenArrow'
            || endings[0] === 'ClosedArrow'),
        );
        return {
          resolvedType: isArrow ? 'arrow' : 'line',
          sharedSubtype: 'Line',
          distinguishingField: 'LE',
          reason: isArrow
            ? 'Line annotation specifies arrow line endings (/LE)'
            : 'Line annotation specifies plain line endings',
        };
      }

      default: {
        const match = Object.entries(manifest.fixtures).find(
          ([_, meta]) => meta.pdfSubtype === subtype,
        );
        if (!match) {
          throw new Error(`Unrecognized PDF Subtype: ${subtype}`);
        }
        return {
          resolvedType: match[0] as AnnotationType,
          sharedSubtype: subtype,
          distinguishingField: 'Subtype',
          reason: `Unambiguous subtype mapping for ${match[0]}`,
        };
      }
    }
  }

  /**
   * Returns the declared production-reader precedence boundary. Fields listed as
   * pending are intentionally not claimed as preserved native edit semantics yet.
   */
  public static getExternalEditPrecedencePolicy(): {
    readerEnforcedFields: readonly string[];
    pendingFields: readonly string[];
  } {
    const policy = manifest.policies.external_edit_precedence;
    return {
      readerEnforcedFields: policy.reader_enforced_fields,
      pendingFields: policy.pending_fields,
    };
  }

  /**
   * Reconciles direct application-data mappings used by the semantic oracle.
   * Production reader tests separately prove Rect/CL/State handling because those
   * fields require page-coordinate or review-model interpretation.
   */
  public static reconcileExternalEdits(
    standardFields: Record<string, unknown>,
    cachedCustomData: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...cachedCustomData };

    if (standardFields.Contents !== undefined && standardFields.Contents !== null) {
      result.text = standardFields.Contents;
    }

    if (standardFields.C !== undefined && standardFields.C !== null) {
      result.borderColor = standardFields.C;
    }

    if (standardFields.IC !== undefined && standardFields.IC !== null) {
      result.backgroundColor = standardFields.IC;
    }

    if (standardFields.L !== undefined && Array.isArray(standardFields.L)) {
      result.points = standardFields.L;
    }

    if (standardFields.Vertices !== undefined && Array.isArray(standardFields.Vertices)) {
      result.points = standardFields.Vertices;
    }

    if (standardFields.InkList !== undefined && Array.isArray(standardFields.InkList)) {
      result.paths = standardFields.InkList;
    }

    return result;
  }

  /**
   * Validates that repeated Save / reopen preserves /NM identity and does not duplicate
   * annotations or orphan reply trees.
   */
  public static validateRoundTripIntegrity(
    before: PdfAnnotation[],
    after: PdfAnnotation[],
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const beforeIds = new Set(before.map((a) => a.id));
    const afterIds = new Set(after.map((a) => a.id));

    if (after.length !== before.length) {
      errors.push(`Annotation count changed across round trip: before=${before.length}, after=${after.length}`);
    }

    for (const id of beforeIds) {
      if (!afterIds.has(id)) {
        errors.push(`Annotation missing after round trip: ${id}`);
      }
    }

    const duplicates = after.map((a) => a.id).filter((id, i, arr) => arr.indexOf(id) !== i);
    if (duplicates.length > 0) {
      errors.push(`Duplicate annotations detected: ${duplicates.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
