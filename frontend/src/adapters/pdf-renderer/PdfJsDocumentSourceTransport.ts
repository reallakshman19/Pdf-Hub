import { PDFDataRangeTransport } from 'pdfjs-dist';

import type {
  DocumentSource,
  DocumentSourceKind,
} from '@/core/document-source/types';

export interface PdfJsDocumentSourceTransportInput {
  readonly source: DocumentSource;
  readonly size: number;
  readonly onFatalError: (error: Error) => void;
}

export interface PdfJsRangeTransportDiagnostics {
  readonly sourceId: string;
  readonly sourceKind: DocumentSourceKind;
  readonly sourceSize: number;
  readonly rangeRequests: number;
  readonly rangeBytesDelivered: number;
  readonly maxRequestedRangeBytes: number;
  readonly aborted: boolean;
  readonly failed: boolean;
}

/**
 * PDF.js range transport backed by the engine-neutral DocumentSource contract.
 *
 * DocumentSource.read() returns caller-owned bytes, which is required because
 * PDF.js may transfer supplied TypedArrays to its worker and take ownership.
 * Underlying Blob/OPFS reads are not cancellable in Phase 8D.1; abort() instead
 * suppresses delivery from any read that completes after the transport closes.
 */
export class PdfJsDocumentSourceTransport extends PDFDataRangeTransport {
  private readonly source: DocumentSource;
  private readonly sourceSize: number;
  private readonly onFatalErrorCallback: (error: Error) => void;

  private aborted = false;
  private failed = false;
  private fatalReported = false;
  private rangeRequests = 0;
  private rangeBytesDelivered = 0;
  private maxRequestedRangeBytes = 0;

  constructor(input: PdfJsDocumentSourceTransportInput) {
    if (!Number.isSafeInteger(input.size) || input.size < 0) {
      throw new RangeError(
        `PDF.js DocumentSource size must be a non-negative safe integer; received ${input.size}.`,
      );
    }

    super(input.size, null);
    this.source = input.source;
    this.sourceSize = input.size;
    this.onFatalErrorCallback = input.onFatalError;
  }

  override requestDataRange(begin: number, end: number): void {
    if (this.aborted || this.failed) return;

    const rangeError = this.validateRange(begin, end);
    if (rangeError) {
      this.reportFatal(rangeError);
      return;
    }

    const length = end - begin;
    this.rangeRequests += 1;
    this.maxRequestedRangeBytes = Math.max(
      this.maxRequestedRangeBytes,
      length,
    );

    void this.source.read(begin, length)
      .then((chunk) => {
        if (this.aborted || this.failed) return;

        if (chunk.byteLength !== length) {
          this.reportFatal(
            new Error(
              `DocumentSource ${this.source.id} returned ${chunk.byteLength} byte(s) for PDF.js range [${begin}, ${end}); expected ${length}.`,
            ),
          );
          return;
        }

        this.rangeBytesDelivered += chunk.byteLength;
        this.onDataRange(begin, chunk);
      })
      .catch((error: unknown) => {
        if (this.aborted || this.failed) return;
        this.reportFatal(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
      });
  }

  override abort(): void {
    this.aborted = true;
  }

  getDiagnostics(): Readonly<PdfJsRangeTransportDiagnostics> {
    return Object.freeze({
      sourceId: this.source.id,
      sourceKind: this.source.kind,
      sourceSize: this.sourceSize,
      rangeRequests: this.rangeRequests,
      rangeBytesDelivered: this.rangeBytesDelivered,
      maxRequestedRangeBytes: this.maxRequestedRangeBytes,
      aborted: this.aborted,
      failed: this.failed,
    });
  }

  private validateRange(
    begin: number,
    end: number,
  ): Error | null {
    if (
      !Number.isSafeInteger(begin)
      || !Number.isSafeInteger(end)
      || begin < 0
      || end <= begin
      || end > this.sourceSize
    ) {
      return new RangeError(
        `Invalid PDF.js range [${begin}, ${end}) for source ${this.source.id} with size ${this.sourceSize}.`,
      );
    }
    return null;
  }

  private reportFatal(error: Error): void {
    if (
      this.aborted
      || this.fatalReported
    ) {
      return;
    }

    this.failed = true;
    this.fatalReported = true;
    this.onFatalErrorCallback(error);
  }
}
