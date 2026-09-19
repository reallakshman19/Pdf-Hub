import type {
  DocumentSource,
  DocumentSourceCapabilities,
} from '@/core/document-source/types';
import {
  assertDocumentSourceId,
  assertDocumentSourceReadRange,
} from '@/core/document-source/validation';

const BORROWED_BYTES_CAPABILITIES: Readonly<DocumentSourceCapabilities> =
  Object.freeze({
    randomAccess: true,
    immutableReads: true,
    persistent: false,
  });

export interface BorrowedBytesSourceInput {
  id: string;
  /**
   * Borrowed immutable bytes. The caller must not mutate this array while the
   * source is in use. Construction deliberately does not clone the full PDF.
   */
  bytes: Uint8Array;
}

/**
 * Short-lived no-full-copy DocumentSource for already-owned immutable bytes.
 *
 * Each read still returns a caller-owned slice; only construction avoids the
 * additional whole-document clone performed by MemorySource.
 */
export class BorrowedBytesSource implements DocumentSource {
  readonly id: string;
  readonly kind = 'memory' as const;
  readonly capabilities = BORROWED_BYTES_CAPABILITIES;

  private readonly bytes: Uint8Array;

  constructor(input: BorrowedBytesSourceInput) {
    assertDocumentSourceId(input.id);
    this.id = input.id;
    this.bytes = input.bytes;
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
