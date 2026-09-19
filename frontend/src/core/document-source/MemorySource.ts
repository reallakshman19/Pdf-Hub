import type {
  DocumentSource,
  DocumentSourceCapabilities,
} from './types';
import {
  assertDocumentSourceId,
  assertDocumentSourceReadRange,
} from './validation';

const MEMORY_CAPABILITIES: Readonly<DocumentSourceCapabilities> =
  Object.freeze({
    randomAccess: true,
    immutableReads: true,
    persistent: false,
  });

export interface MemorySourceInput {
  id: string;
  bytes: Uint8Array;
}

/**
 * Immutable in-memory source.
 *
 * Construction snapshots the supplied bytes once. Every read then returns a
 * fresh Uint8Array so callers cannot mutate source state through an alias.
 */
export class MemorySource implements DocumentSource {
  readonly id: string;
  readonly kind = 'memory' as const;
  readonly capabilities = MEMORY_CAPABILITIES;

  private readonly bytes: Uint8Array;

  constructor(input: MemorySourceInput) {
    assertDocumentSourceId(input.id);
    this.id = input.id;
    this.bytes = Uint8Array.from(input.bytes);
  }

  async size(): Promise<number> {
    return this.bytes.byteLength;
  }

  async read(
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    assertDocumentSourceReadRange(
      this.id,
      this.bytes.byteLength,
      offset,
      length,
    );

    return this.bytes.slice(offset, offset + length);
  }
}
