import { describe, expect, it } from 'vitest';

import {
  assertDocumentSourceId,
  assertDocumentSourceReadRange,
  assertDocumentSourceSize,
} from './validation';

describe('DocumentSource validation', () => {
  it('rejects empty source ids', () => {
    expect(() =>
      assertDocumentSourceId('   '),
    ).toThrowError(/must not be empty/);
  });

  it.each([-1, 1.25, Number.POSITIVE_INFINITY])(
    'rejects invalid source size %s',
    (size) => {
      expect(() =>
        assertDocumentSourceSize('source', size),
      ).toThrowError(
        /non-negative safe integer/,
      );
    },
  );

  it('allows a zero-length source and EOF read', () => {
    expect(() =>
      assertDocumentSourceReadRange(
        'source',
        0,
        0,
        0,
      ),
    ).not.toThrow();
  });
});
