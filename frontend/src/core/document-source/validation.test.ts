import { describe, expect, it } from 'vitest';

import type { DocumentSourceError } from './errors';
import {
  assertDocumentSourceId,
  assertDocumentSourceReadRange,
  assertDocumentSourceSize,
} from './validation';

describe('DocumentSource validation', () => {
  it('rejects empty source ids', () => {
    expect(() => assertDocumentSourceId('   ')).toThrowError(
      expect.objectContaining({
        code: 'INVALID_SOURCE_ID',
      }) as DocumentSourceError,
    );
  });

  it.each([-1, 1.25, Number.POSITIVE_INFINITY])(
    'rejects invalid source size %s',
    (size) => {
      expect(() =>
        assertDocumentSourceSize('source', size),
      ).toThrowError(
        expect.objectContaining({
          code: 'INVALID_SOURCE_SIZE',
        }) as DocumentSourceError,
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
