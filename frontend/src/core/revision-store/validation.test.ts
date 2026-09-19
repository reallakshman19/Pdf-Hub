import { describe, expect, it } from 'vitest';

import {
  assertRevisionId,
  assertRevisionStoreId,
  revisionSourceId,
} from './validation';

describe('revision-store validation', () => {
  it('rejects empty store and revision ids', () => {
    expect(() => assertRevisionStoreId('   ')).toThrowError(
      expect.objectContaining({ code: 'INVALID_STORE_ID' }),
    );
    expect(() => assertRevisionId('store-a', '')).toThrowError(
      expect.objectContaining({ code: 'INVALID_REVISION_ID' }),
    );
  });

  it('creates deterministic encoded source ids', () => {
    expect(
      revisionSourceId('working store', 'rev/1'),
    ).toBe('revision:working%20store:rev%2F1');
  });
});
