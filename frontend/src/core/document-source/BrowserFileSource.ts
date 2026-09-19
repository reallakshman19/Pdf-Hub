import type {
  DocumentSource,
  DocumentSourceCapabilities,
} from './types';
import { DocumentSourceError } from './errors';
import {
  assertDocumentSourceId,
  assertDocumentSourceReadRange,
  assertDocumentSourceSize,
} from './validation';

const BROWSER_FILE_CAPABILITIES: Readonly<DocumentSourceCapabilities> =
  Object.freeze({
    randomAccess: true,
    immutableReads: true,
    persistent: false,
  });

export type BrowserFileReadable = Pick<Blob, 'size' | 'slice'>;

export interface BrowserFileSourceInput {
  id: string;
  file: BrowserFileReadable;
}

/**
 * Random-access source backed by a browser Blob/File snapshot.
 *
 * File extends Blob, so normal browser File objects can be passed directly.
 * Only the requested slice is materialized into an ArrayBuffer.
 */
export class BrowserFileSource implements DocumentSource {
  readonly id: string;
  readonly kind = 'browser-file' as const;
  readonly capabilities = BROWSER_FILE_CAPABILITIES;

  private readonly file: BrowserFileReadable;

  constructor(input: BrowserFileSourceInput) {
    assertDocumentSourceId(input.id);
    assertDocumentSourceSize(input.id, input.file.size);
    this.id = input.id;
    this.file = input.file;
  }

  async size(): Promise<number> {
    return this.file.size;
  }

  async read(
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    assertDocumentSourceReadRange(
      this.id,
      this.file.size,
      offset,
      length,
    );

    if (length === 0) {
      return new Uint8Array();
    }

    try {
      const blob = this.file.slice(offset, offset + length);
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (bytes.byteLength !== length) {
        throw new DocumentSourceError(
          'READ_FAILED',
          this.id,
          `BrowserFileSource returned ${bytes.byteLength} byte(s) for a requested ${length}-byte range.`,
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
        `BrowserFileSource failed to read range [${offset}, ${offset + length}).`,
        { cause: error },
      );
    }
  }
}
