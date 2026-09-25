import {
  createExistingTextSpanId,
} from './model';

type UnknownRecord =
  Record<string, unknown>;

export function validateReconstructExistingTextCommandPayload(
  value: unknown,
  documentKey: string,
): string[] {
  return validateReplaceExistingTextCommandPayload(
    value,
    documentKey,
  );
}

export function validateReplaceExistingTextCommandPayload(
  value: unknown,
  documentKey: string,
): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return [
      'payload must be an object.',
    ];
  }

  if (value.schemaVersion !== 1) {
    errors.push(
      'payload.schemaVersion must be 1.',
    );
  }

  const span = value.span;
  const intent = value.intent;
  const provenance =
    value.provenance;

  if (!isRecord(span)) {
    errors.push(
      'payload.span must be an object.',
    );
  }
  if (!isRecord(intent)) {
    errors.push(
      'payload.intent must be an object.',
    );
  }
  if (!isRecord(provenance)) {
    errors.push(
      'payload.provenance must be an object.',
    );
  }

  if (
    !isRecord(span)
    || !isRecord(intent)
    || !isRecord(provenance)
  ) {
    return errors;
  }

  requireNonEmptyString(
    span.revisionId,
    'payload.span.revisionId',
    errors,
  );
  requireNonEmptyString(
    span.pageId,
    'payload.span.pageId',
    errors,
  );
  requireNonEmptyString(
    span.id,
    'payload.span.id',
    errors,
  );
  requireString(
    span.text,
    'payload.span.text',
    errors,
  );
  requireNonNegativeInteger(
    span.pageIndex,
    'payload.span.pageIndex',
    errors,
  );
  requireNonNegativeInteger(
    span.sourceIndex,
    'payload.span.sourceIndex',
    errors,
  );
  requireFiniteTuple6(
    span.transform,
    'payload.span.transform',
    errors,
  );

  if (!isRecord(span.originPt)) {
    errors.push(
      'payload.span.originPt must be an object.',
    );
  } else {
    requireFiniteNumber(
      span.originPt.x,
      'payload.span.originPt.x',
      errors,
    );
    requireFiniteNumber(
      span.originPt.y,
      'payload.span.originPt.y',
      errors,
    );
  }

  for (const field of [
    'advanceWidthPt',
    'sourceHeightPt',
    'horizontalScalePt',
    'fontSizePt',
    'rotationDegrees',
    'skewCosine',
  ] as const) {
    requireFiniteNumber(
      span[field],
      `payload.span.${field}`,
      errors,
    );
  }

  if (
    span.editability
    !== 'native-replacement-candidate'
  ) {
    errors.push(
      'payload.span.editability must be native-replacement-candidate.',
    );
  }

  if (!Array.isArray(span.reasons)) {
    errors.push(
      'payload.span.reasons must be an array.',
    );
  } else if (span.reasons.length > 0) {
    errors.push(
      'payload.span.reasons must be empty for a native replacement candidate.',
    );
  }

  if (
    typeof span.fontName
      !== 'string'
    || span.fontName.trim()
      .length === 0
  ) {
    errors.push(
      'payload.span.fontName must be a non-empty string for a native replacement candidate.',
    );
  }
  if (
    span.direction !== undefined
    && typeof span.direction
      !== 'string'
  ) {
    errors.push(
      'payload.span.direction must be a string when provided.',
    );
  }
  if (
    typeof span.hasEol
    !== 'boolean'
  ) {
    errors.push(
      'payload.span.hasEol must be boolean.',
    );
  }

  if (
    Array.isArray(span.transform)
    && span.transform.length === 6
    && span.transform.every(
      (entry) =>
        typeof entry === 'number'
        && Number.isFinite(entry),
    )
    && isRecord(span.originPt)
  ) {
    const [
      a,
      b,
      c,
      d,
      x,
      y,
    ] = span.transform as number[];
    const expectedHorizontalScale =
      Math.hypot(a, b);
    const expectedFontSize =
      Math.hypot(c, d);
    const expectedRotation =
      normalizeSignedDegrees(
        Math.atan2(b, a)
        * 180
        / Math.PI,
      );
    const expectedSkew =
      expectedHorizontalScale > 0
      && expectedFontSize > 0
        ? Math.abs(
            (
              a * c
              + b * d
            )
            / (
              expectedHorizontalScale
              * expectedFontSize
            ),
          )
        : Number.NaN;

    requireDerivedNumber(
      span.originPt.x,
      x,
      'payload.span.originPt.x',
      errors,
    );
    requireDerivedNumber(
      span.originPt.y,
      y,
      'payload.span.originPt.y',
      errors,
    );
    requireDerivedNumber(
      span.horizontalScalePt,
      expectedHorizontalScale,
      'payload.span.horizontalScalePt',
      errors,
    );
    requireDerivedNumber(
      span.fontSizePt,
      expectedFontSize,
      'payload.span.fontSizePt',
      errors,
    );
    requireDerivedNumber(
      span.rotationDegrees,
      expectedRotation,
      'payload.span.rotationDegrees',
      errors,
    );
    requireDerivedNumber(
      span.skewCosine,
      expectedSkew,
      'payload.span.skewCosine',
      errors,
    );
  }

  if (
    typeof span.revisionId
      === 'string'
    && span.revisionId
      !== documentKey
  ) {
    errors.push(
      'payload.span.revisionId must match command.documentKey.',
    );
  }

  if (
    typeof span.revisionId
      === 'string'
    && typeof span.pageId
      === 'string'
    && Number.isInteger(
      span.pageIndex,
    )
    && Number.isInteger(
      span.sourceIndex,
    )
    && (
      span.pageIndex as number
    ) >= 0
    && (
      span.sourceIndex as number
    ) >= 0
    && typeof span.id
      === 'string'
  ) {
    const expectedSpanId =
      createExistingTextSpanId(
        {
          revisionId:
            span.revisionId,
          pageId: span.pageId,
          pageIndex: span.pageIndex as number,
        },
        span.sourceIndex as number,
      );
    if (span.id !== expectedSpanId) {
      errors.push(
        'payload.span.id does not match revision/PageId/sourceIndex identity.',
      );
    }
  }

  if (intent.schemaVersion !== 1) {
    errors.push(
      'payload.intent.schemaVersion must be 1.',
    );
  }
  requireNonEmptyString(
    intent.sourceRevisionId,
    'payload.intent.sourceRevisionId',
    errors,
  );
  requireNonEmptyString(
    intent.pageId,
    'payload.intent.pageId',
    errors,
  );
  requireNonEmptyString(
    intent.spanId,
    'payload.intent.spanId',
    errors,
  );
  requireNonNegativeInteger(
    intent.sourceIndex,
    'payload.intent.sourceIndex',
    errors,
  );
  requireString(
    intent.expectedText,
    'payload.intent.expectedText',
    errors,
  );
  requireString(
    intent.replacementText,
    'payload.intent.replacementText',
    errors,
  );

  if (
    intent.sourceEditability
    !== 'native-replacement-candidate'
  ) {
    errors.push(
      'payload.intent.sourceEditability must be native-replacement-candidate.',
    );
  }

  if (
    typeof intent.replacementText
      === 'string'
    && !/^[\x20-\x7e]*$/.test(
      intent.replacementText,
    )
  ) {
    errors.push(
      'payload.intent.replacementText must contain printable ASCII U+0020..U+007E only.',
    );
  }

  if (
    intent.sourceRevisionId
    !== documentKey
  ) {
    errors.push(
      'payload.intent.sourceRevisionId must match command.documentKey.',
    );
  }
  if (
    intent.sourceRevisionId
    !== span.revisionId
  ) {
    errors.push(
      'payload.intent.sourceRevisionId must match payload.span.revisionId.',
    );
  }
  if (
    intent.pageId
    !== span.pageId
  ) {
    errors.push(
      'payload.intent.pageId must match payload.span.pageId.',
    );
  }
  if (
    intent.spanId
    !== span.id
  ) {
    errors.push(
      'payload.intent.spanId must match payload.span.id.',
    );
  }
  if (
    intent.sourceIndex
    !== span.sourceIndex
  ) {
    errors.push(
      'payload.intent.sourceIndex must match payload.span.sourceIndex.',
    );
  }
  if (
    intent.expectedText
    !== span.text
  ) {
    errors.push(
      'payload.intent.expectedText must match payload.span.text.',
    );
  }

  requireNonNegativeInteger(
    provenance.streamIndex,
    'payload.provenance.streamIndex',
    errors,
  );
  if (
    provenance.streamRef
      !== null
    && (
      typeof provenance.streamRef
        !== 'string'
      || provenance.streamRef
        .trim().length === 0
    )
  ) {
    errors.push(
      'payload.provenance.streamRef must be null or a non-empty string.',
    );
  }
  requirePositiveInteger(
    provenance.operatorIndex,
    'payload.provenance.operatorIndex',
    errors,
  );
  if (provenance.operator !== 'Tj') {
    errors.push(
      'payload.provenance.operator must be Tj.',
    );
  }

  validateRange(
    provenance.operatorRange,
    'payload.provenance.operatorRange',
    errors,
  );
  validateRange(
    provenance.operandRange,
    'payload.provenance.operandRange',
    errors,
  );

  if (
    isRecord(
      provenance.operatorRange,
    )
    && isRecord(
      provenance.operandRange,
    )
    && Number.isInteger(
      provenance.operandRange.end,
    )
    && Number.isInteger(
      provenance.operatorRange.start,
    )
    && (provenance.operandRange.end as number) >
      (provenance.operatorRange.start as number)
  ) {
    errors.push(
      'payload.provenance operand must end before the Tj operator begins.',
    );
  }

  requireString(
    provenance.decodedText,
    'payload.provenance.decodedText',
    errors,
  );
  if (
    provenance.encoding
      !== 'ascii-literal'
    && provenance.encoding
      !== 'ascii-hex'
  ) {
    errors.push(
      'payload.provenance.encoding must be ascii-literal or ascii-hex.',
    );
  }
  requireNonEmptyString(
    provenance.fontResourceName,
    'payload.provenance.fontResourceName',
    errors,
  );
  requirePositiveFiniteNumber(
    provenance.fontSizePt,
    'payload.provenance.fontSizePt',
    errors,
  );
  requireFiniteTuple6(
    provenance.textMatrix,
    'payload.provenance.textMatrix',
    errors,
  );

  if (
    provenance.decodedText
    !== intent.expectedText
  ) {
    errors.push(
      'payload.provenance.decodedText must match payload.intent.expectedText.',
    );
  }

  return errors;
}

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}

function requireString(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (typeof value !== 'string') {
    errors.push(
      `${field} must be a string.`,
    );
  }
}

function requireNonEmptyString(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
  ) {
    errors.push(
      `${field} must be a non-empty string.`,
    );
  }
}

function requireFiniteNumber(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
  ) {
    errors.push(
      `${field} must be finite.`,
    );
  }
}

function requirePositiveFiniteNumber(
  value: unknown,
  field: string,
  errors: string[],
): void {
  requireFiniteNumber(
    value,
    field,
    errors,
  );
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && value <= 0
  ) {
    errors.push(
      `${field} must be positive.`,
    );
  }
}

function requireNonNegativeInteger(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 0
  ) {
    errors.push(
      `${field} must be a non-negative integer.`,
    );
  }
}

function requirePositiveInteger(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 1
  ) {
    errors.push(
      `${field} must be an integer >= 1.`,
    );
  }
}

function requireFiniteTuple6(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (
    !Array.isArray(value)
    || value.length !== 6
    || value.some(
      (entry) =>
        typeof entry !== 'number'
        || !Number.isFinite(entry),
    )
  ) {
    errors.push(
      `${field} must contain exactly six finite numbers.`,
    );
  }
}

function requireDerivedNumber(
  actual: unknown,
  expected: number,
  field: string,
  errors: string[],
): void {
  if (
    typeof actual !== 'number'
    || !Number.isFinite(actual)
    || !Number.isFinite(expected)
    || Math.abs(
      actual - expected,
    ) > 1e-9
  ) {
    errors.push(
      `${field} must match the value derived from payload.span.transform.`,
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

function validateRange(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(
      `${field} must be an object.`,
    );
    return;
  }
  if (
    typeof value.start !== 'number'
    || !Number.isInteger(value.start)
    || value.start < 0
    || typeof value.end !== 'number'
    || !Number.isInteger(value.end)
    || value.end <= value.start
  ) {
    errors.push(
      `${field} must contain integer start/end with 0 <= start < end.`,
    );
  }
}
