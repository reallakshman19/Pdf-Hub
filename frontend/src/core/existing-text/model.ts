import type {
  ExistingTextEditIntent,
  ExistingTextEditability,
  ExistingTextEditabilityReason,
  ExistingTextIntentValidation,
  ExistingTextPageContext,
  ExistingTextPageInspection,
  ExistingTextSourceItem,
  ExistingTextSpan,
} from './types';

const ROTATION_TOLERANCE_DEGREES = 0.5;
const SKEW_COSINE_TOLERANCE = 0.01;

export function buildExistingTextPageInspection(
  context: ExistingTextPageContext,
  items: readonly ExistingTextSourceItem[],
): ExistingTextPageInspection {
  assertPageContext(context);

  const spans = items.map((item) =>
    buildExistingTextSpan(
      context,
      item,
    ),
  );

  return {
    revisionId: context.revisionId,
    pageId: context.pageId,
    pageIndex: context.pageIndex,
    spans,
    counts: {
      nativeReplacementCandidates:
        spans.filter(
          (span) =>
            span.editability
            === 'native-replacement-candidate',
        ).length,
      reconstructedCandidates:
        spans.filter(
          (span) =>
            span.editability
            === 'reconstructed-candidate',
        ).length,
      unsupported:
        spans.filter(
          (span) =>
            span.editability
            === 'unsupported',
        ).length,
    },
  };
}

export function buildExistingTextSpan(
  context: ExistingTextPageContext,
  item: ExistingTextSourceItem,
): ExistingTextSpan {
  assertPageContext(context);

  const [
    a,
    b,
    c,
    d,
    x,
    y,
  ] = item.transform;

  const horizontalScalePt =
    Math.hypot(a, b);
  const fontSizePt =
    Math.hypot(c, d);
  const rotationDegrees =
    normalizeSignedDegrees(
      Math.atan2(b, a)
      * 180
      / Math.PI,
    );
  const skewCosine =
    horizontalScalePt > 0
    && fontSizePt > 0
      ? Math.abs(
          (
            a * c
            + b * d
          )
          / (
            horizontalScalePt
            * fontSizePt
          ),
        )
      : Number.NaN;

  const classification =
    classifyExistingTextSourceItem({
      ...item,
      horizontalScalePt,
      fontSizePt,
      rotationDegrees,
      skewCosine,
    });

  return {
    id: createExistingTextSpanId(
      context,
      item.sourceIndex,
    ),
    revisionId: context.revisionId,
    pageId: context.pageId,
    pageIndex: context.pageIndex,
    sourceIndex: item.sourceIndex,
    text: item.text,
    transform: [
      ...item.transform,
    ],
    originPt: {
      x,
      y,
    },
    advanceWidthPt: item.width,
    sourceHeightPt: item.height,
    horizontalScalePt,
    fontSizePt,
    rotationDegrees,
    skewCosine,
    ...(item.fontName
      ? { fontName: item.fontName }
      : {}),
    ...(item.direction
      ? {
          direction:
            item.direction,
        }
      : {}),
    hasEol: item.hasEol,
    editability:
      classification.editability,
    reasons: [
      ...classification.reasons,
    ],
  };
}

export function createExistingTextEditIntent(
  span: ExistingTextSpan,
  replacementText: string,
): ExistingTextEditIntent {
  if (
    span.editability === 'unsupported'
  ) {
    throw new Error(
      'Unsupported existing-text spans cannot create an edit intent.',
    );
  }
  if (
    typeof replacementText !== 'string'
  ) {
    throw new TypeError(
      'Existing-text replacement must be a string.',
    );
  }
  if (
    replacementText.includes('\u0000')
  ) {
    throw new Error(
      'Existing-text replacement cannot contain NUL characters.',
    );
  }

  return {
    schemaVersion: 1,
    sourceRevisionId:
      span.revisionId,
    pageId: span.pageId,
    spanId: span.id,
    sourceIndex:
      span.sourceIndex,
    expectedText: span.text,
    replacementText,
    sourceEditability:
      span.editability,
  };
}

export function validateExistingTextEditIntentAgainstSpan(
  intent: ExistingTextEditIntent,
  span: ExistingTextSpan,
): ExistingTextIntentValidation {
  const errors: string[] = [];

  if (
    intent.sourceRevisionId
    !== span.revisionId
  ) {
    errors.push(
      'source revision does not match the inspected span revision',
    );
  }
  if (
    intent.pageId !== span.pageId
  ) {
    errors.push(
      'PageId does not match the inspected span',
    );
  }
  if (
    intent.spanId !== span.id
  ) {
    errors.push(
      'spanId does not match the inspected span',
    );
  }
  if (
    intent.sourceIndex
    !== span.sourceIndex
  ) {
    errors.push(
      'source item index does not match the inspected span',
    );
  }
  if (
    intent.expectedText
    !== span.text
  ) {
    errors.push(
      'expected source text does not match the inspected span',
    );
  }
  if (
    span.editability
    === 'unsupported'
  ) {
    errors.push(
      'inspected span is unsupported',
    );
  }
  if (
    intent.sourceEditability
    !== span.editability
  ) {
    errors.push(
      'editability classification changed since intent creation',
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function createExistingTextSpanId(
  context: ExistingTextPageContext,
  sourceIndex: number,
): string {
  return [
    'existing-text',
    encodeURIComponent(
      context.revisionId,
    ),
    encodeURIComponent(
      context.pageId,
    ),
    String(sourceIndex),
  ].join(':');
}

function classifyExistingTextSourceItem(
  item: ExistingTextSourceItem & {
    horizontalScalePt: number;
    fontSizePt: number;
    rotationDegrees: number;
    skewCosine: number;
  },
): {
  editability: ExistingTextEditability;
  reasons: ExistingTextEditabilityReason[];
} {
  const unsupported:
    ExistingTextEditabilityReason[] = [];

  if (
    item.text.trim().length === 0
  ) {
    unsupported.push(
      'EMPTY_TEXT',
    );
  }
  if (
    !Number.isInteger(
      item.sourceIndex,
    )
    || item.sourceIndex < 0
  ) {
    unsupported.push(
      'INVALID_SOURCE_INDEX',
    );
  }

  const geometry = [
    ...item.transform,
    item.width,
    item.height,
    item.horizontalScalePt,
    item.fontSizePt,
    item.rotationDegrees,
    item.skewCosine,
  ];

  if (
    geometry.some(
      (value) =>
        !Number.isFinite(value),
    )
  ) {
    unsupported.push(
      'NON_FINITE_GEOMETRY',
    );
  }
  if (
    Number.isFinite(item.width)
    && item.width <= 0
  ) {
    unsupported.push(
      'NON_POSITIVE_ADVANCE',
    );
  }
  if (
    (
      Number.isFinite(
        item.horizontalScalePt,
      )
      && item.horizontalScalePt <= 0
    )
    || (
      Number.isFinite(
        item.fontSizePt,
      )
      && item.fontSizePt <= 0
    )
  ) {
    unsupported.push(
      'NON_POSITIVE_TEXT_SCALE',
    );
  }

  if (unsupported.length > 0) {
    return {
      editability: 'unsupported',
      reasons: uniqueReasons(
        unsupported,
      ),
    };
  }

  const reconstructed:
    ExistingTextEditabilityReason[] = [];

  if (!item.fontName?.trim()) {
    reconstructed.push(
      'MISSING_FONT_IDENTITY',
    );
  }
  if (
    item.direction
      ?.toLowerCase()
      === 'ttb'
  ) {
    reconstructed.push(
      'VERTICAL_WRITING_MODE',
    );
  }
  if (
    Math.abs(
      item.rotationDegrees,
    )
    > ROTATION_TOLERANCE_DEGREES
  ) {
    reconstructed.push(
      'ROTATED_TEXT',
    );
  }
  if (
    item.skewCosine
    > SKEW_COSINE_TOLERANCE
  ) {
    reconstructed.push(
      'SKEWED_TEXT',
    );
  }

  if (
    reconstructed.length > 0
  ) {
    return {
      editability:
        'reconstructed-candidate',
      reasons: uniqueReasons(
        reconstructed,
      ),
    };
  }

  return {
    editability:
      'native-replacement-candidate',
    reasons: [],
  };
}

function assertPageContext(
  context: ExistingTextPageContext,
): void {
  if (
    !context.revisionId.trim()
  ) {
    throw new Error(
      'Existing-text inspection requires a non-empty revisionId.',
    );
  }
  if (!context.pageId.trim()) {
    throw new Error(
      'Existing-text inspection requires a non-empty PageId.',
    );
  }
  if (
    !Number.isInteger(
      context.pageIndex,
    )
    || context.pageIndex < 0
  ) {
    throw new Error(
      'Existing-text pageIndex must be a non-negative integer coordinate.',
    );
  }
}

function normalizeSignedDegrees(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const normalized =
    ((value + 180) % 360 + 360)
    % 360
    - 180;
  return normalized === -180
    ? 180
    : normalized;
}

function uniqueReasons(
  reasons:
    readonly ExistingTextEditabilityReason[],
): ExistingTextEditabilityReason[] {
  return Array.from(
    new Set(reasons),
  );
}
