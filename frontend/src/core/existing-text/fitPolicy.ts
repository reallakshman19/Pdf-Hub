import {
  validateExistingTextEditIntentAgainstSpan,
} from './model';
import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from './types';
import type {
  ExistingTextEditPolicyBlockReason,
  ExistingTextEditPolicyResult,
  ExistingTextFitRect,
  ExistingTextNativeFitDiagnostic,
  ExistingTextReconstructedOverlayEvidence,
} from './fitTypes';

export function assessExistingTextEditPolicy(
  input: {
    span: ExistingTextSpan;
    intent: ExistingTextEditIntent;
    nativeFit?:
      ExistingTextNativeFitDiagnostic;
    fallbackEvidence?:
      ExistingTextReconstructedOverlayEvidence;
  },
): ExistingTextEditPolicyResult {
  if (
    input.span.editability
    === 'unsupported'
  ) {
    return {
      mode: 'blocked',
      reasons: [
        'UNSUPPORTED_SPAN',
      ],
      ...(input.nativeFit
        ? {
            nativeFit:
              input.nativeFit,
          }
        : {}),
    };
  }

  const intentValidation =
    validateExistingTextEditIntentAgainstSpan(
      input.intent,
      input.span,
    );
  if (!intentValidation.ok) {
    return {
      mode: 'blocked',
      reasons: [
        'STALE_EDIT_INTENT',
      ],
      ...(input.nativeFit
        ? {
            nativeFit:
              input.nativeFit,
          }
        : {}),
    };
  }

  if (
    input.span.editability
      === 'native-replacement-candidate'
    && input.nativeFit?.status
      === 'fits'
  ) {
    return {
      mode:
        'native-replacement',
      span: input.span,
      intent: input.intent,
      nativeFit:
        input.nativeFit,
    };
  }

  const nativeReasons:
    ExistingTextEditPolicyBlockReason[] = [];
  if (
    input.span.editability
    === 'native-replacement-candidate'
  ) {
    if (!input.nativeFit) {
      nativeReasons.push(
        'NATIVE_FIT_MISSING',
      );
    } else if (
      input.nativeFit.status
      === 'unmeasurable'
    ) {
      nativeReasons.push(
        'NATIVE_FIT_UNMEASURABLE',
      );
    } else if (
      input.nativeFit.status
      === 'overflows'
    ) {
      nativeReasons.push(
        'NATIVE_REPLACEMENT_OVERFLOW',
      );
    }
  }

  if (!input.fallbackEvidence) {
    return {
      mode: 'blocked',
      reasons: uniqueReasons([
        ...nativeReasons,
        'FALLBACK_EVIDENCE_MISSING',
      ]),
      ...(input.nativeFit
        ? {
            nativeFit:
              input.nativeFit,
          }
        : {}),
    };
  }

  const fallbackReasons =
    validateFallbackEvidence(
      input.span,
      input.fallbackEvidence,
    );
  if (
    fallbackReasons.length > 0
  ) {
    return {
      mode: 'blocked',
      reasons: uniqueReasons([
        ...nativeReasons,
        ...fallbackReasons,
      ]),
      ...(input.nativeFit
        ? {
            nativeFit:
              input.nativeFit,
          }
        : {}),
    };
  }

  return {
    mode:
      'future-reconstructed-overlay-candidate',
    span: input.span,
    intent: input.intent,
    evidence:
      input.fallbackEvidence,
    ...(input.nativeFit
      ? {
          nativeFit:
            input.nativeFit,
        }
      : {}),
  };
}

function validateFallbackEvidence(
  span: ExistingTextSpan,
  evidence:
    ExistingTextReconstructedOverlayEvidence,
): ExistingTextEditPolicyBlockReason[] {
  const reasons:
    ExistingTextEditPolicyBlockReason[] = [];

  if (
    evidence.schemaVersion !== 1
    || evidence.sourceRevisionId
      !== span.revisionId
    || evidence.pageId
      !== span.pageId
    || evidence.spanId
      !== span.id
  ) {
    reasons.push(
      'FALLBACK_EVIDENCE_STALE',
    );
  }

  if (
    evidence.sourceCoverage
    !== 'proved'
  ) {
    reasons.push(
      'FALLBACK_SOURCE_COVERAGE_UNPROVEN',
    );
  }

  if (
    evidence.background.kind
      !== 'solid'
    || !/^#[0-9a-f]{6}$/i.test(
      evidence.background
        .colorHex,
    )
  ) {
    reasons.push(
      'FALLBACK_BACKGROUND_NOT_SOLID',
    );
  }

  if (
    !validRect(
      evidence.clearanceRectPt,
    )
    || !validRect(
      evidence.replacementBoundsPt,
    )
  ) {
    reasons.push(
      'FALLBACK_CLEARANCE_INVALID',
    );
  } else if (
    !containsRect(
      evidence.clearanceRectPt,
      evidence.replacementBoundsPt,
    )
  ) {
    reasons.push(
      'FALLBACK_REPLACEMENT_OUTSIDE_CLEARANCE',
    );
  }

  if (
    !Number.isInteger(
      evidence.foreignPaintIntersections,
    )
    || evidence.foreignPaintIntersections
      !== 0
  ) {
    reasons.push(
      'FALLBACK_FOREIGN_PAINT_INTERSECTION',
    );
  }

  return uniqueReasons(reasons);
}

function validRect(
  rect: ExistingTextFitRect,
): boolean {
  return (
    Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0
  );
}

function containsRect(
  outer: ExistingTextFitRect,
  inner: ExistingTextFitRect,
): boolean {
  const epsilon = 1e-9;
  return (
    inner.x
      >= outer.x - epsilon
    && inner.y
      >= outer.y - epsilon
    && inner.x + inner.width
      <= outer.x
        + outer.width
        + epsilon
    && inner.y + inner.height
      <= outer.y
        + outer.height
        + epsilon
  );
}

function uniqueReasons(
  reasons:
    ExistingTextEditPolicyBlockReason[],
): ExistingTextEditPolicyBlockReason[] {
  return [
    ...new Set(reasons),
  ];
}
