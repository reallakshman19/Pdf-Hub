import type {
  DocumentSource,
  DocumentSourceCapabilities,
} from '@/core/document-source/types';
import { DocumentSourceError } from '@/core/document-source/errors';
import {
  assertDocumentSourceId,
  assertDocumentSourceReadRange,
  assertDocumentSourceSize,
} from '@/core/document-source/validation';

const OPFS_CAPABILITIES: Readonly<DocumentSourceCapabilities> =
  Object.freeze({
    randomAccess: true,
    immutableReads: true,
    persistent: true,
  });

export interface OpfsSourceInput {
  id: string;
  handle: FileSystemFileHandle;
  expectedSize: number;
}

/**
 * Immutable random-access view of one committed OPFS revision.
 *
 * The expected size is captured when the revision is opened. If the backing
 * file changes unexpectedly, reads fail instead of silently observing mixed
 * revision bytes.
 */
export class OpfsSource implements DocumentSource {
  readonly id: string;
  readonly kind = 'opfs' as const;
  readonly capabilities = OPFS_CAPABILITIES;

  private readonly handle: FileSystemFileHandle;
  private readonly expectedSize: number;

  constructor(input: OpfsSourceInput) {
    assertDocumentSourceId(input.id);
    assertDocumentSourceSize(input.id, input.expectedSize);
    this.id = input.id;
    this.handle = input.handle;
    this.expectedSize = input.expectedSize;
  }

  async size(): Promise<number> {
    await this.assertBackingSize();
    return this.expectedSize;
  }

  async read(
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    assertDocumentSourceReadRange(
      this.id,
      this.expectedSize,
      offset,
      length,
    );
    if (length === 0) {
      return new Uint8Array();
    }

    try {
      const file = await this.handle.getFile();
      this.assertFileSize(file.size);
      const bytes = new Uint8Array(
        await file.slice(offset, offset + length).arrayBuffer(),
      );
      if (bytes.byteLength !== length) {
        throw new DocumentSourceError(
          'READ_FAILED',
          this.id,
          `OPFS source returned ${bytes.byteLength} byte(s) for a requested ${length}-byte range.`,
        );
      }
      return bytes;
    } catch (error) {
      if (error instanceof DocumentSourceError) {
        throw error;
      }
      throw new DocumentSourceError(
        'READ_FAILED',
        this.id,
        `OPFS source failed to read range [${offset}, ${offset + length}).`,
        { cause: error },
      );
    }
  }

  private async assertBackingSize(): Promise<void> {
    try {
      const file = await this.handle.getFile();
      this.assertFileSize(file.size);
    } catch (error) {
      if (error instanceof DocumentSourceError) {
        throw error;
      }
      throw new DocumentSourceError(
        'READ_FAILED',
        this.id,
        'OPFS source could not inspect its committed backing file.',
        { cause: error },
      );
    }
  }

  private assertFileSize(actualSize: number): void {
    if (actualSize !== this.expectedSize) {
      throw new DocumentSourceError(
        'READ_FAILED',
        this.id,
        `OPFS revision size changed from ${this.expectedSize} to ${actualSize} byte(s).`,
      );
    }
  }
}
