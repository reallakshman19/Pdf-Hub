from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding='utf-8')


def write(name: str, content: str) -> None:
    target = ROOT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(name: str, old: str, new: str) -> None:
    content = read(name)
    if old not in content:
        raise RuntimeError(f'anchor not found in {name}: {old[:120]!r}')
    write(name, content.replace(old, new, 1))


def replace_regex(name: str, pattern: str, replacement: str) -> None:
    content = read(name)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'expected one regex match in {name}, found {count}: {pattern[:120]!r}')
    write(name, updated)


# ---------------------------------------------------------------------------
# PDF.js cancellation boundaries
# ---------------------------------------------------------------------------
renderer = 'frontend/src/adapters/pdf-renderer/PdfRendererAdapter.ts'
replace_once(
    renderer,
    "import { error } from '@/core/logger/service';\nimport type { RenderToken } from './types';\n",
    "import { error } from '@/core/logger/service';\nimport {\n  isOperationCancelledError,\n  raceWithAbort,\n  throwIfAborted,\n} from '@/core/cancellation/operationCancellation';\nimport type { RenderToken } from './types';\n",
)
replace_regex(
    renderer,
    r"  static renderPage\(.*?\n  static async getPageTextItems",
    """  static renderPage(
    page: PDFPageProxy,
    canvas: HTMLCanvasElement,
    viewport: PageViewport,
    options: { annotationMode?: number; signal?: AbortSignal } = {},
  ): RenderToken {
    type RenderOptions = Parameters<PDFPageProxy['render']>[0];
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('[PdfRendererAdapter] Could not get 2d context from canvas');

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const renderTask = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      optionalContentConfigPromise:
        'getOptionalContentConfig' in page
          ? (
              page as unknown as {
                getOptionalContentConfig: () => NonNullable<RenderOptions['optionalContentConfigPromise']>;
              }
            ).getOptionalContentConfig()
          : undefined,
      annotationMode: options.annotationMode,
    });

    let cancelled = false;
    const renderPromise = renderTask.promise.catch((renderError) => {
      if (cancelled) return;
      throw renderError;
    });
    const completed = raceWithAbort(
      renderPromise,
      options.signal,
      `render PDF page ${page.pageNumber}`,
      () => {
        cancelled = true;
        renderTask.cancel();
      },
    );

    return {
      cancel: async () => {
        if (cancelled) return;
        cancelled = true;
        renderTask.cancel();
        await renderPromise;
      },
      completed,
    };
  }

  static async getPageTextItems""",
)
replace_regex(
    renderer,
    r"  static async getPageTextItems\(.*?\n  static getPageDimensions",
    """  static async getPageTextItems(
    page: PDFPageProxy,
    scale: number,
    signal?: AbortSignal,
  ): Promise<TextLayerItem[]> {
    try {
      throwIfAborted(signal, `read text from PDF page ${page.pageNumber}`);
      const viewport = page.getViewport({ scale });
      const textContent = await raceWithAbort(
        page.getTextContent(),
        signal,
        `read text from PDF page ${page.pageNumber}`,
      );
      throwIfAborted(signal, `build text layer for PDF page ${page.pageNumber}`);

      return textContent.items.flatMap((item, index) => {
        if (!isTransformItem(item)) return [];

        const tx = Util.transform(viewport.transform, item.transform);
        const fontSize = Math.hypot(tx[2], tx[3]);
        const width = Math.max(4, item.width * scale);
        const emHeight = Math.max(8, fontSize);
        const descender = emHeight * 0.2;
        const height = emHeight + descender;

        return [{
          id: `page-${page.pageNumber}-text-${index}`,
          text: item.str,
          x: tx[4],
          y: tx[5] - emHeight,
          width,
          height,
          fontSize,
        }];
      });
    } catch (err) {
      if (isOperationCancelledError(err)) throw err;
      error('pdf-renderer', 'Failed to build text layer', {
        pageNumber: page.pageNumber,
        error: String(err),
      });
      return [];
    }
  }

  static getPageDimensions""",
)
replace_regex(
    renderer,
    r"  static async getThumbnail\(.*?\n  static async getPagePlainText",
    """  static async getThumbnail(
    page: PDFPageProxy,
    signal?: AbortSignal,
  ): Promise<string> {
    throwIfAborted(signal, `render thumbnail for PDF page ${page.pageNumber}`);
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 150 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is not available for thumbnail');

    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
    });
    await raceWithAbort(
      renderTask.promise,
      signal,
      `render thumbnail for PDF page ${page.pageNumber}`,
      () => renderTask.cancel(),
    );
    throwIfAborted(signal, `encode thumbnail for PDF page ${page.pageNumber}`);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  static async getPagePlainText""",
)
replace_regex(
    renderer,
    r"  static async getPagePlainText\(.*?\n  static async searchDocumentText",
    """  static async getPagePlainText(
    page: PDFPageProxy,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      throwIfAborted(signal, `read plain text from PDF page ${page.pageNumber}`);
      const textContent = await raceWithAbort(
        page.getTextContent(),
        signal,
        `read plain text from PDF page ${page.pageNumber}`,
      );
      throwIfAborted(signal, `normalize text from PDF page ${page.pageNumber}`);
      const chunks = textContent.items.map((item) => {
        if ('str' in item && typeof item.str === 'string') return item.str;
        return '';
      });
      return chunks.join(' ').replace(/\s+/g, ' ').trim();
    } catch (err) {
      if (isOperationCancelledError(err)) throw err;
      error('pdf-renderer', 'Failed to read page text', {
        pageNumber: page.pageNumber,
        error: String(err),
      });
      return '';
    }
  }

  static async searchDocumentText""",
)
replace_regex(
    renderer,
    r"  static async searchDocumentText\(.*?\n  static async getOutlineFlat",
    """  static async searchDocumentText(
    bytes: Uint8Array,
    query: string,
    signal?: AbortSignal,
  ): Promise<TextSearchHit[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    throwIfAborted(signal, 'start PDF text search');
    const leasePromise = this.acquireDocument(bytes);
    const lease = await raceWithAbort(
      leasePromise,
      signal,
      'load PDF for text search',
      () => {
        void leasePromise.then((lateLease) => lateLease.release()).catch(() => undefined);
      },
    );
    const doc = lease.doc;

    try {
      const hits: TextSearchHit[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        throwIfAborted(signal, `search PDF page ${pageNumber}`);
        const pagePromise = doc.getPage(pageNumber);
        const page = await raceWithAbort(
          pagePromise,
          signal,
          `load PDF page ${pageNumber} for search`,
          () => {
            void pagePromise.then((latePage) => latePage.cleanup()).catch(() => undefined);
          },
        );
        try {
          const textItems = await this.getPageTextItems(page, 1.0, signal);
          let fullText = '';
          const itemMap: { start: number; end: number; item: TextLayerItem }[] = [];

          for (const item of textItems) {
            throwIfAborted(signal, `index PDF page ${pageNumber}`);
            const start = fullText.length;
            fullText += `${item.text} `;
            itemMap.push({ start, end: fullText.length - 1, item });
          }

          const lowerText = fullText.toLowerCase();
          let idx = lowerText.indexOf(normalizedQuery);
          let hitCount = 0;
          while (idx !== -1) {
            throwIfAborted(signal, `collect search hits on PDF page ${pageNumber}`);
            const matchEnd = idx + normalizedQuery.length;
            const hitItems = itemMap.filter((entry) => entry.start < matchEnd && entry.end > idx);
            const startSnippetIdx = Math.max(0, idx - 20);
            const endSnippetIdx = Math.min(fullText.length, matchEnd + 20);
            let snippet = fullText.substring(startSnippetIdx, endSnippetIdx);
            if (startSnippetIdx > 0) snippet = `...${snippet}`;
            if (endSnippetIdx < fullText.length) snippet = `${snippet}...`;

            hits.push({
              id: `hit-${pageNumber}-${hitCount}`,
              pageNumber,
              snippet,
              rects: hitItems.map((entry) => ({
                x: entry.item.x,
                y: entry.item.y,
                width: entry.item.width,
                height: entry.item.height,
              })),
            });
            hitCount += 1;
            idx = lowerText.indexOf(normalizedQuery, idx + 1);
          }
        } finally {
          page.cleanup();
        }
      }
      return hits;
    } finally {
      await lease.release();
    }
  }

  static async getOutlineFlat""",
)
replace_regex(
    renderer,
    r"  static async getOutlineFlat\(doc: PDFDocumentProxy\): Promise<OutlineItem\[]> \{.*?\n  \}\n\}",
    """  static async getOutlineFlat(
    doc: PDFDocumentProxy,
    signal?: AbortSignal,
  ): Promise<OutlineItem[]> {
    try {
      throwIfAborted(signal, 'load PDF outline');
      const outline = await raceWithAbort(doc.getOutline(), signal, 'load PDF outline');
      if (!outline) return [];

      const flat: OutlineItem[] = [];
      let counter = 0;
      const walk = async (
        nodes: NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>,
        depth: number,
      ): Promise<void> => {
        for (const node of nodes) {
          throwIfAborted(signal, 'walk PDF outline');
          let pageNumber: number | null = null;
          try {
            let destinationRef: unknown = null;
            if (Array.isArray(node.dest)) {
              destinationRef = node.dest[0];
            } else if (typeof node.dest === 'string') {
              const destination = await raceWithAbort(
                doc.getDestination(node.dest),
                signal,
                'resolve PDF outline destination',
              );
              if (Array.isArray(destination)) destinationRef = destination[0];
            }
            if (destinationRef) {
              const pageIndex = await raceWithAbort(
                doc.getPageIndex(destinationRef as never),
                signal,
                'resolve PDF outline page',
              );
              pageNumber = pageIndex + 1;
            }
          } catch (outlineError) {
            if (isOperationCancelledError(outlineError)) throw outlineError;
            pageNumber = null;
          }

          flat.push({
            id: `outline-${counter}`,
            title: node.title || `Bookmark ${counter + 1}`,
            pageNumber,
            depth,
          });
          counter += 1;
          if (node.items && node.items.length > 0) await walk(node.items, depth + 1);
        }
      };

      await walk(outline, 0);
      return flat;
    } catch (err) {
      if (isOperationCancelledError(err)) throw err;
      error('pdf-renderer', 'Failed to load document outline', { error: String(err) });
      return [];
    }
  }
}
""",
)

write(
    'frontend/src/core/renderer/usePageRenderer.ts',
    """import { useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { RenderToken } from '../../adapters/pdf-renderer/types';
import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';

interface UsePageRendererOptions {
  doc: PDFDocumentProxy | null;
  pageNumber: number;
  scale: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

interface PageSize {
  width: number;
  height: number;
}

export function usePageRenderer({
  doc, pageNumber, scale, canvasRef,
}: UsePageRendererOptions) {
  const tokenRef = useRef<RenderToken | null>(null);
  const [size, setSize] = useState<PageSize | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useLayoutEffect(() => {
    if (!doc || !canvasRef.current) return;

    const controller = new AbortController();
    let page: PDFPageProxy | null = null;

    const render = async () => {
      if (tokenRef.current) {
        await tokenRef.current.cancel();
        tokenRef.current = null;
      }
      if (controller.signal.aborted) return;
      setIsRendering(true);

      try {
        page = await doc.getPage(pageNumber);
        if (controller.signal.aborted) return;
        const viewport = page.getViewport({ scale });
        setSize({ width: viewport.width, height: viewport.height });
        if (!canvasRef.current || controller.signal.aborted) return;

        tokenRef.current = PdfRendererAdapter.renderPage(
          page,
          canvasRef.current,
          viewport,
          { signal: controller.signal },
        );
        await tokenRef.current.completed;
      } catch (err) {
        if (isOperationCancelledError(err)) return;
        if (err instanceof Error && err.message.includes('Rendering cancelled')) return;
      } finally {
        page?.cleanup();
        if (!controller.signal.aborted) setIsRendering(false);
      }
    };

    void render();
    return () => {
      controller.abort('Page renderer changed or unmounted');
      void tokenRef.current?.cancel();
      tokenRef.current = null;
    };
  }, [doc, pageNumber, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return { size, isRendering };
}
""",
)

thumbs = 'frontend/src/components/sidebar/panels/ThumbnailSidebar.tsx'
replace_once(
    thumbs,
    "import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';\n",
    "import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';\nimport { isOperationCancelledError } from '@/core/cancellation/operationCancellation';\n",
)
replace_regex(
    thumbs,
    r"  React.useEffect\(\(\) => \{\n    let cancelled = false;.*?\n  \}, \[workingBytes, pdfDoc, documentKey\]\);",
    """  React.useEffect(() => {
    const controller = new AbortController();

    const loadThumbnails = async () => {
      if (!workingBytes || !pdfDoc) {
        setThumbs([]);
        return;
      }
      setLoading(true);
      try {
        const result: ThumbItem[] = [];
        const batchSize = 5;

        for (let i = 1; i <= pdfDoc.numPages; i += batchSize) {
          if (controller.signal.aborted) break;
          const batch: number[] = [];
          for (let j = 0; j < batchSize && i + j <= pdfDoc.numPages; j += 1) {
            batch.push(i + j);
          }

          const batchResults = await Promise.all(batch.map(async (pageNumber) => {
            const cacheKey = `${documentKey || 'default'}-${pageNumber}`;
            let imageUrl = thumbnailCache.get(cacheKey);
            const page = await pdfDoc.getPage(pageNumber);
            try {
              const viewport = page.getViewport({ scale: 1.0 });
              if (!imageUrl) {
                imageUrl = await PdfRendererAdapter.getThumbnail(page, controller.signal);
                thumbnailCache.set(cacheKey, imageUrl);
              }
              return {
                pageNumber,
                imageUrl,
                pageWidth: viewport.width,
                pageHeight: viewport.height,
              };
            } finally {
              page.cleanup();
            }
          }));
          result.push(...batchResults);
        }
        if (!controller.signal.aborted) setThumbs(result);
      } catch (thumbnailError) {
        if (!controller.signal.aborted && !isOperationCancelledError(thumbnailError)) setThumbs([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadThumbnails();
    return () => controller.abort('Thumbnail generation changed or unmounted');
  }, [workingBytes, pdfDoc, documentKey]);""",
)

search_panel = 'frontend/src/components/sidebar/SearchPanel.tsx'
replace_once(
    search_panel,
    "import { useToastStore } from '@/core/toast/store';\n",
    "import { useToastStore } from '@/core/toast/store';\nimport { isOperationCancelledError } from '@/core/cancellation/operationCancellation';\n",
)
replace_once(
    search_panel,
    "  const addToast = useToastStore((state) => state.addToast);\n\n  const [localQuery",
    "  const addToast = useToastStore((state) => state.addToast);\n  const searchAbortControllerRef = React.useRef<AbortController | null>(null);\n\n  const [localQuery",
)
replace_regex(
    search_panel,
    r"  const executeSearch = useCallback\(async \(searchQuery: string, options: SearchOptions = searchOptions\) => \{.*?\n  \}, \[workingBytes, documentKey, searchOptions, clearSearch, setIsSearching, setHits, setError, addToast\]\);",
    """  const executeSearch = useCallback(async (
    searchQuery: string,
    options: SearchOptions = searchOptions,
  ) => {
    if (!workingBytes || !documentKey) return;
    if (!searchQuery.trim()) {
      searchAbortControllerRef.current?.abort('Search cleared');
      clearSearch();
      return;
    }

    searchAbortControllerRef.current?.abort('Superseded by a newer search');
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    setIsSearching(true);
    try {
      const cache = SearchIndexer.getCache(documentKey);
      if (cache) {
        if (controller.signal.aborted) return;
        const results = SearchIndexer.search(cache, searchQuery, options);
        if (controller.signal.aborted) return;
        setHits(results.map((result, index) => ({
          id: `hit-${index}`,
          pageNumber: result.pageNumber,
          snippet: result.text,
          rects: [result.rect],
        })));
      } else {
        const results = await PdfRendererAdapter.searchDocumentText(
          workingBytes,
          searchQuery,
          controller.signal,
        );
        if (!controller.signal.aborted) setHits(results);
      }
    } catch (searchError) {
      if (isOperationCancelledError(searchError) || controller.signal.aborted) return;
      const message = searchError instanceof Error ? searchError.message : String(searchError);
      setError(message);
      logError('pdf-renderer', 'Search failed in sidebar panel', { error: message });
      addToast({ type: 'error', title: 'Search Failed', message });
    } finally {
      if (searchAbortControllerRef.current === controller) {
        searchAbortControllerRef.current = null;
        setIsSearching(false);
      }
    }
  }, [workingBytes, documentKey, searchOptions, clearSearch, setIsSearching, setHits, setError, addToast]);""",
)
replace_once(
    search_panel,
    "  const handleClear = () => {\n    setLocalQuery('');\n    clearSearch();\n  };",
    "  const handleClear = () => {\n    searchAbortControllerRef.current?.abort('Search cleared');\n    searchAbortControllerRef.current = null;\n    setLocalQuery('');\n    clearSearch();\n  };\n\n  React.useEffect(() => () => {\n    searchAbortControllerRef.current?.abort('Search panel unmounted');\n  }, []);",
)

# ---------------------------------------------------------------------------
# OCR worker cancellation and cleanup
# ---------------------------------------------------------------------------
contract = 'frontend/src/core/ocr/engines/ocrEngineContract.ts'
replace_once(
    contract,
    "  profile: OcrProfile;\n}",
    "  profile: OcrProfile;\n  abortSignal?: AbortSignal;\n}",
)

tesseract = 'frontend/src/core/ocr/engines/tesseractJsEngine.ts'
replace_once(
    tesseract,
    "import type {\n  OcrEngine,",
    "import {\n  isOperationCancelledError,\n  raceWithAbort,\n  throwIfAborted,\n} from '@/core/cancellation/operationCancellation';\nimport type {\n  OcrEngine,",
)
replace_once(
    tesseract,
    "    page: OcrEnginePageInput;\n  }): Promise<TesseractRecognizeData>;",
    "    page: OcrEnginePageInput;\n    signal?: AbortSignal;\n  }): Promise<TesseractRecognizeData>;",
)
replace_regex(
    tesseract,
    r"    async recognize\(input: OcrEngineInput\): Promise<OcrDocumentResult> \{.*?\n      return \{\n        \.\.\.result,\n        diagnostics: \[\n          \.\.\.result.diagnostics,\n          \.\.\.validation.diagnostics,\n        \],\n      \};\n    \},",
    """    async recognize(input: OcrEngineInput): Promise<OcrDocumentResult> {
      const language = resolveTesseractLanguage(input.profile.languageHints);
      const pages: OcrPageResult[] = [];

      for (const page of input.pages) {
        throwIfAborted(input.abortSignal, `OCR page ${page.pageIndex + 1}`);
        const imageSource = await raceWithAbort(
          imageSourceFactory(page),
          input.abortSignal,
          `prepare OCR image for page ${page.pageIndex + 1}`,
        );

        try {
          const recognitionPromise = recognizer.recognize({
            image: imageSource.source,
            language,
            page,
            signal: input.abortSignal,
          });
          const data = await raceWithAbort(
            recognitionPromise,
            input.abortSignal,
            `recognize OCR page ${page.pageIndex + 1}`,
          );
          throwIfAborted(input.abortSignal, `store OCR page ${page.pageIndex + 1}`);
          pages.push(tesseractDataToOcrPageResult({ data, page, language }));
        } catch (error) {
          if (isOperationCancelledError(error)) throw error;
          pages.push(createFailedTesseractPageResult({
            page,
            language,
            message: error instanceof Error ? error.message : 'Tesseract.js OCR failed.',
          }));
        } finally {
          imageSource.dispose?.();
        }
      }

      throwIfAborted(input.abortSignal, 'finalize OCR document');
      const result: OcrDocumentResult = {
        documentFingerprint: input.documentFingerprint,
        createdAt: now(),
        engineId: 'tesseract-js',
        profileId: input.profile.id,
        pages,
        diagnostics: [],
      };
      const validation = validateOcrDocumentResult(result);
      return {
        ...result,
        diagnostics: [...result.diagnostics, ...validation.diagnostics],
      };
    },""",
)
replace_regex(
    tesseract,
    r"export function createDefaultTesseractRecognizer\(input: \{.*?\n\}\n\nexport async function createDefaultTesseractWorker",
    """export function createDefaultTesseractRecognizer(input: {
  workerFactory?: TesseractWorkerFactory;
} = {}): TesseractRecognizer {
  return {
    async recognize({ image, language, signal }) {
      const workerFactory = input.workerFactory ?? createDefaultTesseractWorker;
      const workerPromise = workerFactory(language);
      const worker = await raceWithAbort(
        workerPromise,
        signal,
        'start Tesseract worker',
        () => {
          void workerPromise
            .then((lateWorker) => lateWorker.terminate())
            .catch(() => undefined);
        },
      );

      let terminationPromise: Promise<void> | null = null;
      const terminateOnce = () => {
        terminationPromise ??= worker.terminate().catch(() => undefined);
        return terminationPromise;
      };

      try {
        const recognitionPromise = worker.recognize(image);
        const result = await raceWithAbort(
          recognitionPromise,
          signal,
          'run Tesseract recognition',
          () => { void terminateOnce(); },
        );
        return result.data;
      } finally {
        await terminateOnce();
      }
    },
  };
}

export async function createDefaultTesseractWorker""",
)

# ---------------------------------------------------------------------------
# Macro sidebar cancel controls and result gating
# ---------------------------------------------------------------------------
sidebar = 'frontend/src/components/sidebar/MacrosSidebar.tsx'
replace_once(sidebar, "  Code2,\n} from 'lucide-react';", "  Code2,\n  Square,\n} from 'lucide-react';")
replace_once(
    sidebar,
    "  const [recipeViewMode, setRecipeViewMode] = React.useState<'table' | 'json'>('table');\n",
    "  const [recipeViewMode, setRecipeViewMode] = React.useState<'table' | 'json'>('table');\n  const runAbortControllerRef = React.useRef<AbortController | null>(null);\n  const expertAbortControllerRef = React.useRef<AbortController | null>(null);\n\n  React.useEffect(() => () => {\n    runAbortControllerRef.current?.abort('Macro panel unmounted');\n    expertAbortControllerRef.current?.abort('Macro panel unmounted');\n  }, []);\n",
)
replace_regex(
    sidebar,
    r"  const runSelectedMacro = async \(\) => \{.*?\n  \};\n\n  const resetPanel",
    """  const runSelectedMacro = async () => {
    if (!workingBytes || !selectedRecipe || !fileName) return;

    const runtimeRecipe = applyOverridesToRecipe(
      selectedRecipe,
      overrides,
      viewState.currentPage,
      Math.max(1, pageCount),
    );
    const report = await validateRecipeBeforeRun(runtimeRecipe, {
      pageCount: Math.max(1, pageCount),
      selectedPages: useSessionStore.getState().selectedPages,
      currentPage: viewState.currentPage,
      fileName,
      donorFiles: {},
      now: new Date(),
    });
    if (!report.isValid) {
      setPreflightReport(report);
      return;
    }

    runAbortControllerRef.current?.abort('Superseded by a new macro run');
    const controller = new AbortController();
    runAbortControllerRef.current = controller;
    setPreflightReport(null);
    setIsRunning(true);
    setRunError(null);

    try {
      const result = await runMacroRecipeAgainstSession(runtimeRecipe, {
        saveOutputs: false,
        abortSignal: controller.signal,
      });
      setRunLogs(result.logs);

      if (result.status === 'cancelled') return;
      if (result.status === 'timed-out') {
        setRunError('Macro timed out. The document was restored and late results were discarded.');
        return;
      }
      if (result.status === 'failed') {
        setRunError(result.logs.at(-1) ?? 'Macro execution failed.');
        return;
      }
      if (result.outputFiles.length > 0) {
        setOutputQueue((current) => [
          ...current,
          ...result.outputFiles.map((output) => ({ id: uuidv4(), ...output })),
        ]);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = String(err);
      setRunError(message);
      logError('macro', 'Macro execution failed in sidebar', {
        recipeId: selectedRecipe.id,
        error: message,
      });
    } finally {
      if (runAbortControllerRef.current === controller) runAbortControllerRef.current = null;
      setIsRunning(false);
    }
  };

  const cancelSelectedMacro = () => {
    runAbortControllerRef.current?.abort('Cancelled by user');
  };

  const resetPanel""",
)
replace_regex(
    sidebar,
    r"  const runExpertRecipe = async \(\) => \{.*?\n  \};\n\n  const saveExpertPreset",
    """  const runExpertRecipe = async () => {
    if (!workingBytes) return;

    expertAbortControllerRef.current?.abort('Superseded by a new expert macro run');
    const controller = new AbortController();
    expertAbortControllerRef.current = controller;
    setExpertRunError(null);
    setExpertPreflightReport(null);
    setExpertLogs([]);
    setIsExpertRunning(true);

    try {
      const parsed = parseExpertRecipe();
      const report = await validateRecipeBeforeRun(parsed, buildValidationContext());
      setExpertPreflightReport(report);
      if (!report.isValid) {
        setExpertRunError('Preflight failed. Fix recipe errors before running.');
        return;
      }

      const result = await runMacroRecipeAgainstSession(parsed, {
        saveOutputs: false,
        abortSignal: controller.signal,
      });
      setExpertLogs(result.logs);
      if (result.status === 'cancelled') return;
      if (result.status === 'timed-out') {
        setExpertRunError('Expert macro timed out. The document was restored and late results were discarded.');
        return;
      }
      if (result.status === 'failed') {
        setExpertRunError(result.logs.at(-1) ?? 'Expert macro execution failed.');
        return;
      }
      if (result.outputFiles.length > 0) {
        setOutputQueue((current) => [
          ...current,
          ...result.outputFiles.map((output) => ({ id: uuidv4(), ...output })),
        ]);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = String(err);
      setExpertRunError(message);
      logError('macro', 'Expert macro execution failed', { error: message });
    } finally {
      if (expertAbortControllerRef.current === controller) expertAbortControllerRef.current = null;
      setIsExpertRunning(false);
    }
  };

  const cancelExpertRecipe = () => {
    expertAbortControllerRef.current?.abort('Cancelled by user');
  };

  const saveExpertPreset""",
)
replace_once(
    sidebar,
    "            <Button size=\"sm\" onClick={() => void runSelectedMacro()} disabled={isRunning || !selectedRecipe || (preflightReport ? !preflightReport.isValid : false)}>\n              {isRunning ? (\n                <RotateCw className=\"w-4 h-4 mr-1 animate-spin\" />\n              ) : (\n                <Play className=\"w-4 h-4 mr-1\" />\n              )}\n              {isRunning ? 'Running' : 'Run Macro'}\n            </Button>",
    "            {isRunning ? (\n              <Button variant=\"secondary\" size=\"sm\" onClick={cancelSelectedMacro} className=\"text-red-600\">\n                <Square className=\"w-4 h-4 mr-1\" />\n                Cancel\n              </Button>\n            ) : (\n              <Button size=\"sm\" onClick={() => void runSelectedMacro()} disabled={!selectedRecipe || (preflightReport ? !preflightReport.isValid : false)}>\n                <Play className=\"w-4 h-4 mr-1\" />\n                Run Macro\n              </Button>\n            )}",
)
replace_once(
    sidebar,
    "          <Button\n            size=\"sm\"\n            onClick={() => void runExpertRecipe()}\n            disabled={isExpertRunning || isExpertDryRunning || isRunning}\n          >\n            {isExpertRunning ? (\n              <RotateCw className=\"w-3.5 h-3.5 mr-1 animate-spin\" />\n            ) : (\n              <Play className=\"w-3.5 h-3.5 mr-1\" />\n            )}\n            Run Expert\n          </Button>",
    "          {isExpertRunning ? (\n            <Button variant=\"secondary\" size=\"sm\" onClick={cancelExpertRecipe} className=\"text-red-600\">\n              <Square className=\"w-3.5 h-3.5 mr-1\" />\n              Cancel Expert\n            </Button>\n          ) : (\n            <Button\n              size=\"sm\"\n              onClick={() => void runExpertRecipe()}\n              disabled={isExpertDryRunning || isRunning}\n            >\n              <Play className=\"w-3.5 h-3.5 mr-1\" />\n              Run Expert\n            </Button>\n          )}",
)

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
pdf_test = 'frontend/src/adapters/pdf-renderer/PdfRendererAdapter.test.ts'
replace_once(pdf_test, "import type { PDFDocumentProxy } from 'pdfjs-dist';", "import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';")
replace_once(
    pdf_test,
    "  it('removes a failed load so a later acquisition can retry', async () => {",
    "  it('cancels an active PDF.js render task when its signal aborts', async () => {\n    const controller = new AbortController();\n    const cancel = vi.fn();\n    const page = {\n      pageNumber: 3,\n      render: vi.fn(() => ({\n        promise: new Promise<void>(() => undefined),\n        cancel,\n      })),\n    } as unknown as PDFPageProxy;\n    const canvas = {\n      width: 0,\n      height: 0,\n      getContext: vi.fn(() => ({})),\n    } as unknown as HTMLCanvasElement;\n    const viewport = { width: 100, height: 200 } as PageViewport;\n\n    const token = PdfRendererAdapter.renderPage(page, canvas, viewport, {\n      signal: controller.signal,\n    });\n    controller.abort('test cancellation');\n\n    await expect(token.completed).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });\n    expect(cancel).toHaveBeenCalledTimes(1);\n  });\n\n  it('removes a failed load so a later acquisition can retry', async () => {",
)

ocr_test = 'frontend/src/core/ocr/__tests__/tesseractJsEngine.test.ts'
replace_once(ocr_test, "import { describe, expect, it } from 'vitest';", "import { describe, expect, it, vi } from 'vitest';")
replace_once(
    ocr_test,
    "  createDefaultTesseractImageSource,\n",
    "  createDefaultTesseractImageSource,\n  createDefaultTesseractRecognizer,\n",
)
replace_once(
    ocr_test,
    "  it('default image source returns bytes in non-browser test runtime when Blob/URL unavailable', async () => {",
    "  it('rethrows cancellation and still disposes the OCR image source', async () => {\n    const controller = new AbortController();\n    const dispose = vi.fn();\n    const engine = createTesseractJsEngine({\n      imageSourceFactory: async () => ({ source: 'fake://cancel', dispose }),\n      recognizer: {\n        recognize: () => new Promise(() => undefined),\n      },\n    });\n\n    const pending = engine.recognize({\n      documentFingerprint: 'doc-cancel',\n      profile: getOcrProfile('clean-scan'),\n      abortSignal: controller.signal,\n      pages: [{\n        pageIndex: 0,\n        imageBytes: new Uint8Array([1, 2, 3]),\n        width: 595,\n        height: 842,\n      }],\n    });\n    await Promise.resolve();\n    controller.abort('cancel OCR');\n\n    await expect(pending).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });\n    expect(dispose).toHaveBeenCalledTimes(1);\n  });\n\n  it('terminates the default Tesseract worker exactly once on cancellation', async () => {\n    const controller = new AbortController();\n    const terminate = vi.fn().mockResolvedValue(undefined);\n    const recognizer = createDefaultTesseractRecognizer({\n      workerFactory: async () => ({\n        recognize: () => new Promise(() => undefined),\n        terminate,\n      }),\n    });\n\n    const pending = recognizer.recognize({\n      image: new Uint8Array([1]),\n      language: 'eng',\n      page: { pageIndex: 0, imageBytes: new Uint8Array([1]), width: 10, height: 10 },\n      signal: controller.signal,\n    });\n    await Promise.resolve();\n    controller.abort('cancel worker');\n\n    await expect(pending).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });\n    expect(terminate).toHaveBeenCalledTimes(1);\n  });\n\n  it('default image source returns bytes in non-browser test runtime when Blob/URL unavailable', async () => {",
)

# Expand documentation with completed boundaries.
replace_once(
    'docs/PDF_OPERATION_CANCELLATION.md',
    "## Maintenance rules\n",
    "## Additional boundaries\n\n- PDF.js page rendering, thumbnail rendering, text extraction, document search, and outline traversal accept abort signals. Render tasks call `cancel()` when aborted.\n- Thumbnail and search components abort obsolete work on dependency changes and unmount. Page proxies and document leases remain protected by `finally`.\n- Tesseract OCR propagates cancellation rather than converting it to a failed page, revokes temporary image sources, and terminates workers exactly once.\n- The macro panel exposes Cancel controls and adds outputs only for successful runs.\n\n## Maintenance rules\n",
)

print('Applied PDF.js, OCR, and UI cancellation boundaries')
