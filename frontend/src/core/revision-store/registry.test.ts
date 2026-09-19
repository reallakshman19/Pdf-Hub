import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
  releaseWorkingRevisionStore,
  resolveWorkingRevisionStore,
} from './registry';

describe('WorkingRevisionStore registry', () => {
  beforeEach(() => {
    clearWorkingRevisionStoreRegistryForTests();
  });

  it('registers, resolves and releases a store by runtime id', () => {
    const store = new MemoryRevisionStore({ id: 'working' });
    registerWorkingRevisionStore(store);

    expect(resolveWorkingRevisionStore('working')).toBe(store);

    releaseWorkingRevisionStore('working');
    expect(resolveWorkingRevisionStore('working')).toBeNull();
  });

  it('rejects a different store instance under the same id', () => {
    registerWorkingRevisionStore(
      new MemoryRevisionStore({ id: 'working' }),
    );

    expect(() =>
      registerWorkingRevisionStore(
        new MemoryRevisionStore({ id: 'working' }),
      ),
    ).toThrow(/different WorkingRevisionStore/);
  });
});
