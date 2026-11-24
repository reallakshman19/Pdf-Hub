import { describe, expect, it } from 'vitest';
import {
  validateMoveExistingTextBlockCommandPayload,
  validateResizeExistingTextBlockCommandPayload,
} from '../commandValidation';

function frame(overrides: Record<string, unknown> = {}) {
  return {
    frameId: 'f',
    revisionId: 'r',
    pageIndex: 0,
    pageId: 'page-1',
    bounds: { x: 10, y: 10, width: 50, height: 20 },
    originalBounds: { x: 10, y: 10, width: 50, height: 20 },
    text: 'test',
    spanIds: [],
    fontSizePt: 12,
    leadingPt: 14,
    ...overrides,
  };
}

function movePayload(intent: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sourcePageIndex: 0,
    sourcePageId: 'page-1',
    intent: {
      schemaVersion: 1,
      sourceRevisionId: 'rev-1',
      pageIndex: 0,
      pageId: 'page-1',
      frame: frame(),
      targetPosition: { x: 20, y: 20 },
      ...intent,
    },
  };
}

function resizePayload(intent: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sourcePageIndex: 0,
    sourcePageId: 'page-1',
    intent: {
      schemaVersion: 1,
      sourceRevisionId: 'rev-1',
      pageIndex: 0,
      pageId: 'page-1',
      frame: frame(),
      newWidthPt: 120,
      handle: 'e',
      ...intent,
    },
  };
}

describe('text frame command validation', () => {
  it('accepts well-formed move and resize payloads', () => {
    expect(validateMoveExistingTextBlockCommandPayload(movePayload())).toEqual([]);
    expect(validateResizeExistingTextBlockCommandPayload(resizePayload())).toEqual([]);
    expect(validateMoveExistingTextBlockCommandPayload(
      movePayload({ backgroundColorHex: '#FFFFFF' }),
    )).toEqual([]);
  });

  it('rejects non-finite target coordinates', () => {
    const errors = validateMoveExistingTextBlockCommandPayload(
      movePayload({ targetPosition: { x: Number.NaN, y: Number.POSITIVE_INFINITY } }),
    );
    expect(errors).toContain('payload.intent.targetPosition.x must be finite.');
    expect(errors).toContain('payload.intent.targetPosition.y must be finite.');
  });

  it('rejects degenerate frame geometry and typography', () => {
    const errors = validateMoveExistingTextBlockCommandPayload(movePayload({
      frame: frame({ bounds: { x: 0, y: 0, width: 0, height: 20 }, fontSizePt: 0 }),
    }));
    expect(errors).toContain('payload.intent.frame.bounds.width must be positive.');
    expect(errors).toContain('payload.intent.frame.fontSizePt must be positive.');
  });

  it('rejects an intent that targets a different page than the command', () => {
    const errors = validateMoveExistingTextBlockCommandPayload(
      movePayload({ pageIndex: 1, pageId: 'page-2' }),
    );
    expect(errors).toContain('payload.intent.pageIndex must equal payload.sourcePageIndex.');
    expect(errors).toContain('payload.intent.pageId must equal payload.sourcePageId.');
  });

  it('rejects a malformed background colour instead of painting black', () => {
    expect(validateMoveExistingTextBlockCommandPayload(
      movePayload({ backgroundColorHex: 'white' }),
    )).toContain('payload.intent.backgroundColorHex must be a 6-digit hex colour (#RRGGBB).');
  });

  it('rejects unknown resize handles and non-finite widths', () => {
    const errors = validateResizeExistingTextBlockCommandPayload(
      resizePayload({ handle: 'middle', newWidthPt: Number.NaN }),
    );
    expect(errors).toContain('payload.intent.newWidthPt must be finite.');
    expect(errors).toContain('payload.intent.handle must be one of nw, n, ne, e, se, s, sw, w.');
  });
});
