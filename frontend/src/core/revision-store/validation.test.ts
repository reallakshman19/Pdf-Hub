import { describe, expect, it } from 'vitest';

import { RevisionStoreError } from './errors';
import {
  assertRevisionId,
  assertRevisionStoreId,
  revisionSourceId,
} from './validation';

function errorFrom(action: () => void): RevisionStoreError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(RevisionStoreError);
    return error as RevisionStoreError;
  }
  throw new Error('Expected revision validation to throw.');
}

describe('revision-store validation', () => {
  it('rejects empty store and revision ids', () => {
    expect(
      errorFrom(() => assertRevisionStoreId('   ')).code,
    ).toBe('INVALID_STORE_ID');
    expect(
      errorFrom(() => assertRevisionId('store-a', '')).code,
    ).toBe('INVALID_REVISION_ID');
  });

  it('creates deterministic encoded source ids', () => {
    expect(
      revisionSourceId('working store', 'rev/1'),
    ).toBe('revision:working%20store:rev%2F1');
  });
});
