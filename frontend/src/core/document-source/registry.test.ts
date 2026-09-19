import { afterEach, describe, expect, it } from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import {
  clearDocumentSourceRegistryForTests,
  DocumentSourceRegistryError,
  registerDocumentSource,
  releaseDocumentSource,
  resolveDocumentSource,
} from './registry';

afterEach(() => {
  clearDocumentSourceRegistryForTests();
});

describe('DocumentSource runtime registry', () => {
  it('retains and releases an out-of-band source by sourceId', () => {
    const source = new MemorySource({
      id: 'source:one',
      bytes: Uint8Array.from([1, 2, 3]),
    });

    registerDocumentSource(source);
    expect(resolveDocumentSource('source:one')).toBe(source);

    releaseDocumentSource('source:one');
    expect(resolveDocumentSource('source:one')).toBeNull();
  });

  it('allows idempotent registration of the same source object', () => {
    const source = new MemorySource({
      id: 'source:same',
      bytes: new Uint8Array(),
    });

    registerDocumentSource(source);
    expect(() => registerDocumentSource(source)).not.toThrow();
  });

  it('rejects a different source object with an active duplicate id', () => {
    registerDocumentSource(
      new MemorySource({
        id: 'source:duplicate',
        bytes: Uint8Array.from([1]),
      }),
    );

    expect(() =>
      registerDocumentSource(
        new MemorySource({
          id: 'source:duplicate',
          bytes: Uint8Array.from([2]),
        }),
      ),
    ).toThrow(DocumentSourceRegistryError);
  });
});
