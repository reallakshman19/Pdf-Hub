import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';

import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import type { DocumentSource } from '@/core/document-source/types';
import { error } from '@/core/logger/service';
import {
  PdfJsDocumentSourceTransport,
  type PdfJsRangeTransportDiagnostics,
} from './PdfJsDocumentSourceTransport';

export interface PdfDocumentLease {
  readonly doc: PDFDocumentProxy;
  readonly cacheKey: string;
  release: () => Promise<void>;
}

export interface PdfDocumentCacheDiagnostics {
  entries: number;
  activeLeases: number;
  idleEntries: number;
  maxEntries: number;
}

export interface AcquirePdfDocumentSourceInput {
  readonly source: DocumentSource;
  readonly cacheKey: string;
  readonly signal?: AbortSignal;
}

export interface PdfDocumentSourceCacheDiagnostics
  extends PdfJsRangeTransportDiagnostics {
  readonly cacheKey: string;
  readonly activeLeases: number;
  readonly loaded: boolean;
}

interface PdfDocumentCacheEntry {
  /** Internal namespace; source entries never collide with byte entries. */
  key: string;
  /** Content/revision identity exposed to callers. */
  publicKey: string;
  docPromise: Promise<PDFDocumentProxy>;
  doc: PDFDocumentProxy | null;
  loadingTask: PDFDocumentLoadingTask | null;
  sourceTransport: PdfJsDocumentSourceTransport | null;
  refCount: number;
  lastUsed: number;
  destroyed: boolean;
}

function clonePdfBytes(
  buffer: Uint8Array | ArrayBuffer,
): Uint8Array<ArrayBuffer> {
  return buffer instanceof Uint8Array
    ? Uint8Array.from(buffer)
    : new Uint8Array(buffer.slice(0));
}

function digestHex(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digestInput = Uint8Array.from(bytes).buffer;
  return crypto.subtle.digest('SHA-256', digestInput)
    .then((digest) =>
      Array.from(new Uint8Array(digest))
        .map((value) =>
          value.toString(16).padStart(2, '0'))
        .join(''),
    );
}

/**
 * Owns PDF.js loading tasks, document proxies and lease/LRU semantics.
 *
 * Byte-backed and source-backed documents intentionally use separate internal
 * namespaces. This prevents admission-time byte loading from masking the
 * range-backed renderer path for the same content hash.
 */
export class PdfDocumentLeaseCache {
  private static readonly MAX_CACHED_DOCUMENTS = 2;

  private readonly documentCache =
    new Map<string, PdfDocumentCacheEntry>();
  private readonly sourceKeyCache =
    new WeakMap<object, Promise<string>>();
  private accessCounter = 0;

  async acquireDocument(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<PdfDocumentLease> {
    const key = await this.keyForBuffer(buffer);
    const entry = this.documentCache.get(key)
      ?? this.createByteEntry(key, buffer);
    return this.acquireEntry(entry);
  }

  async acquireDocumentSource(
    input: AcquirePdfDocumentSourceInput,
  ): Promise<PdfDocumentLease> {
    const publicKey = input.cacheKey.trim();
    if (!publicKey) {
      throw new Error(
        'PDF.js DocumentSource cacheKey must not be empty.',
      );
    }

    throwIfAborted(
      input.signal,
      'acquire PDF.js DocumentSource',
    );

    const key = this.sourceCacheKey(publicKey);
    let entry = this.documentCache.get(key);
    if (!entry) {
      const size = await raceWithAbort(
        input.source.size(),
        input.signal,
        'inspect PDF.js DocumentSource size',
      );
      throwIfAborted(
        input.signal,
        'create PDF.js DocumentSource transport',
      );
      entry = this.documentCache.get(key)
        ?? this.createSourceEntry(
          publicKey,
          input.source,
          size,
        );
    }

    return this.acquireEntry(entry, input.signal);
  }

  getDiagnostics(): PdfDocumentCacheDiagnostics {
    const entries = Array.from(
      this.documentCache.values(),
    );
    return {
      entries: entries.length,
      activeLeases: entries.reduce(
        (sum, entry) => sum + entry.refCount,
        0,
      ),
      idleEntries: entries.filter(
        (entry) => entry.refCount === 0,
      ).length,
      maxEntries:
        PdfDocumentLeaseCache.MAX_CACHED_DOCUMENTS,
    };
  }

  getSourceDiagnostics():
  PdfDocumentSourceCacheDiagnostics[] {
    return Array.from(this.documentCache.values())
      .flatMap((entry) => {
        const transport = entry.sourceTransport;
        if (!transport) return [];
        return [{
          cacheKey: entry.publicKey,
          activeLeases: entry.refCount,
          loaded: entry.doc !== null,
          ...transport.getDiagnostics(),
        }];
      });
  }

  async clear(
    options: { force?: boolean } = {},
  ): Promise<void> {
    const targets = Array.from(
      this.documentCache.values(),
    ).filter(
      (entry) =>
        options.force === true || entry.refCount === 0,
    );

    for (const entry of targets) {
      if (
        this.documentCache.get(entry.key) !== entry
      ) {
        continue;
      }
      this.documentCache.delete(entry.key);
      await this.destroyEntry(entry);
    }
  }

  private async keyForBuffer(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<string> {
    const source = buffer as object;
    const cached = this.sourceKeyCache.get(source);
    if (cached) return cached;

    const keyPromise = digestHex(
      clonePdfBytes(buffer),
    ).then((hex) => `sha256:${hex}`);
    this.sourceKeyCache.set(source, keyPromise);
    return keyPromise;
  }

  private createByteEntry(
    key: string,
    buffer: Uint8Array | ArrayBuffer,
  ): PdfDocumentCacheEntry {
    const entry = this.emptyEntry(key, key, null);
    const task = getDocument({
      data: clonePdfBytes(buffer),
    });
    entry.loadingTask = task;
    entry.docPromise = this.trackLoad(
      entry,
      task.promise,
    );
    this.documentCache.set(key, entry);
    return entry;
  }

  private createSourceEntry(
    publicKey: string,
    source: DocumentSource,
    size: number,
  ): PdfDocumentCacheEntry {
    const key = this.sourceCacheKey(publicKey);
    let rejectFatal!: (error: Error) => void;
    const fatalPromise =
      new Promise<never>((_resolve, reject) => {
        rejectFatal = reject;
      });
    let task: PDFDocumentLoadingTask | null = null;
    let entry!: PdfDocumentCacheEntry;

    const transport =
      new PdfJsDocumentSourceTransport({
        source,
        size,
        onFatalError: (fatalError) => {
          if (
            this.documentCache.get(key) === entry
          ) {
            this.documentCache.delete(key);
          }
          rejectFatal(fatalError);
          if (task) {
            void task.destroy()
              .catch(() => undefined);
          }
          error(
            'pdf-renderer',
            'PDF.js DocumentSource range load failed',
            {
              cacheKey: publicKey,
              sourceId: source.id,
              sourceKind: source.kind,
              error: fatalError.message,
            },
          );
        },
      });

    entry = this.emptyEntry(
      key,
      publicKey,
      transport,
    );

    task = getDocument({
      range: transport,
      rangeChunkSize: 64 * 1024,
      disableRange: false,
      disableStream: true,
      disableAutoFetch: true,
    });
    entry.loadingTask = task;
    void task.promise.catch(() => undefined);
    entry.docPromise = this.trackLoad(
      entry,
      Promise.race([
        task.promise,
        fatalPromise,
      ]),
    );
    this.documentCache.set(key, entry);
    return entry;
  }

  private emptyEntry(
    key: string,
    publicKey: string,
    sourceTransport:
      PdfJsDocumentSourceTransport | null,
  ): PdfDocumentCacheEntry {
    return {
      key,
      publicKey,
      docPromise: Promise.resolve(
        null as unknown as PDFDocumentProxy,
      ),
      doc: null,
      loadingTask: null,
      sourceTransport,
      refCount: 0,
      lastUsed: ++this.accessCounter,
      destroyed: false,
    };
  }

  private trackLoad(
    entry: PdfDocumentCacheEntry,
    promise: Promise<PDFDocumentProxy>,
  ): Promise<PDFDocumentProxy> {
    const tracked = promise
      .then((doc) => {
        entry.doc = doc;
        return doc;
      })
      .catch((loadError) => {
        if (
          this.documentCache.get(entry.key) === entry
        ) {
          this.documentCache.delete(entry.key);
        }
        throw loadError;
      });
    void tracked.catch(() => undefined);
    return tracked;
  }

  private sourceCacheKey(
    publicKey: string,
  ): string {
    return `source:${publicKey}`;
  }

  private async acquireEntry(
    entry: PdfDocumentCacheEntry,
    signal?: AbortSignal,
  ): Promise<PdfDocumentLease> {
    entry.refCount += 1;
    entry.lastUsed = ++this.accessCounter;

    try {
      const doc = signal
        ? await raceWithAbort(
            entry.docPromise,
            signal,
            `load PDF document ${entry.publicKey}`,
          )
        : await entry.docPromise;

      await this.evictIdleDocuments();
      let released = false;

      return {
        doc,
        cacheKey: entry.publicKey,
        release: async () => {
          if (released) return;
          released = true;

          if (
            this.documentCache.get(entry.key)
            !== entry
          ) {
            return;
          }

          entry.refCount = Math.max(
            0,
            entry.refCount - 1,
          );
          entry.lastUsed = ++this.accessCounter;
          await this.evictIdleDocuments();
        },
      };
    } catch (loadError) {
      entry.refCount = Math.max(
        0,
        entry.refCount - 1,
      );

      if (
        isOperationCancelledError(loadError)
        && signal?.aborted
      ) {
        throw loadError;
      }

      if (
        this.documentCache.get(entry.key)
        === entry
      ) {
        this.documentCache.delete(entry.key);
      }
      await this.destroyEntry(entry);
      error('pdf-renderer', 'Failed to load document', {
        cacheKey: entry.publicKey,
        error: String(loadError),
      });
      throw loadError;
    }
  }

  private async evictIdleDocuments():
  Promise<void> {
    while (
      this.documentCache.size
      > PdfDocumentLeaseCache.MAX_CACHED_DOCUMENTS
    ) {
      const candidate = Array.from(
        this.documentCache.values(),
      )
        .filter(
          (entry) =>
            entry.refCount === 0
            && entry.doc !== null,
        )
        .sort(
          (left, right) =>
            left.lastUsed - right.lastUsed,
        )[0];
      if (!candidate) return;

      this.documentCache.delete(candidate.key);
      await this.destroyEntry(candidate);
    }
  }

  private async destroyEntry(
    entry: PdfDocumentCacheEntry,
  ): Promise<void> {
    if (entry.destroyed) return;
    entry.destroyed = true;
    entry.sourceTransport?.abort();

    try {
      if (entry.doc) {
        await entry.doc.destroy();
        return;
      }
      if (entry.loadingTask) {
        await entry.loadingTask.destroy();
      }
    } catch (destroyError) {
      error(
        'pdf-renderer',
        'Failed to destroy cached PDF document',
        {
          cacheKey: entry.publicKey,
          error: String(destroyError),
        },
      );
    }
  }
}

export const pdfDocumentLeaseCache =
  new PdfDocumentLeaseCache();
