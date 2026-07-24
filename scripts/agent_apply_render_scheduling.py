from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


adapter_path = Path("frontend/src/adapters/pdf-renderer/PdfRendererAdapter.ts")
adapter = adapter_path.read_text()

if "export interface ThumbnailRenderResource" not in adapter:
    adapter = replace_once(
        adapter,
        """export interface RenderedPage {\n  width: number;\n  height: number;\n  scale: number;\n}\n""",
        """export interface RenderedPage {\n  width: number;\n  height: number;\n  scale: number;\n}\n\nexport interface ThumbnailRenderResource {\n  imageUrl: string;\n  width: number;\n  height: number;\n  estimatedDecodedBytes: number;\n  dispose: () => void;\n}\n""",
        "thumbnail resource interface",
    )

if "function canvasToBlob(" not in adapter:
    adapter = replace_once(
        adapter,
        "\nexport class PdfRendererAdapter {",
        """\nfunction canvasToBlob(\n  canvas: HTMLCanvasElement,\n  type: string,\n  quality: number,\n): Promise<Blob | null> {\n  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));\n}\n\nexport class PdfRendererAdapter {""",
        "canvas blob helper",
    )

if "static async renderThumbnailResource(" not in adapter:
    thumbnail_method = r'''  static async renderThumbnailResource(
    page: PDFPageProxy,
    signal?: AbortSignal,
    targetWidth = 150,
  ): Promise<ThumbnailRenderResource> {
    throwIfAborted(signal, `render thumbnail resource for PDF page ${page.pageNumber}`);
    const sourceViewport = page.getViewport({ scale: 1 });
    const widthScale = Math.max(1, targetWidth) / Math.max(1, sourceViewport.width);
    const heightScale = 300 / Math.max(1, sourceViewport.height);
    const scaledViewport = page.getViewport({ scale: Math.min(widthScale, heightScale) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(scaledViewport.width));
    canvas.height = Math.max(1, Math.floor(scaledViewport.height));
    const renderedWidth = canvas.width;
    const renderedHeight = canvas.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is not available for thumbnail');

    let objectUrl: string | null = null;
    try {
      const renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport: scaledViewport,
      });
      await raceWithAbort(
        renderTask.promise,
        signal,
        `render thumbnail resource for PDF page ${page.pageNumber}`,
        () => renderTask.cancel(),
      );
      throwIfAborted(signal, `encode thumbnail resource for PDF page ${page.pageNumber}`);

      const blob = typeof canvas.toBlob === 'function'
        ? await raceWithAbort(
            canvasToBlob(canvas, 'image/jpeg', 0.8),
            signal,
            `encode thumbnail blob for PDF page ${page.pageNumber}`,
          )
        : null;
      throwIfAborted(signal, `publish thumbnail resource for PDF page ${page.pageNumber}`);

      const imageUrl = blob && typeof URL.createObjectURL === 'function'
        ? (objectUrl = URL.createObjectURL(blob))
        : canvas.toDataURL('image/jpeg', 0.8);
      let disposed = false;

      return {
        imageUrl,
        width: renderedWidth,
        height: renderedHeight,
        estimatedDecodedBytes: renderedWidth * renderedHeight * 4,
        dispose: () => {
          if (disposed) return;
          disposed = true;
          if (objectUrl && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
        },
      };
    } catch (thumbnailError) {
      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
      throw thumbnailError;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

'''
    adapter = replace_once(
        adapter,
        "  static async getThumbnail(\n",
        thumbnail_method + "  static async getThumbnail(\n",
        "thumbnail method",
    )

adapter_path.write_text(adapter)

sidebar_path = Path("frontend/src/components/sidebar/panels/ThumbnailSidebar.tsx")
sidebar = sidebar_path.read_text()

if "type { PDFDocumentProxy }" not in sidebar:
    sidebar = sidebar.replace(
        "import React from 'react';\n",
        "import React from 'react';\nimport type { PDFDocumentProxy } from 'pdfjs-dist';\n",
        1,
    )

sidebar = sidebar.replace(
    "import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';",
    "import { isOperationCancelledError, raceWithAbort } from '@/core/cancellation/operationCancellation';",
)

if "acquireScheduledThumbnail" not in sidebar:
    sidebar = sidebar.replace(
        "import { ThumbnailContextMenu } from '@/components/sidebar/thumbnails/ThumbnailContextMenu';\n",
        """import { ThumbnailContextMenu } from '@/components/sidebar/thumbnails/ThumbnailContextMenu';\nimport { acquireScheduledThumbnail } from '@/core/renderer/thumbnailRenderService';\nimport { RENDER_PRIORITIES } from '@/core/renderer/renderScheduler';\n""",
        1,
    )

sidebar = sidebar.replace("  imageUrl: string;\n", "")

old_cache = """// Global cache for thumbnail image URLs to prevent flickering and regeneration on active editing passes\nconst thumbnailCache = new Map<string, string>(); // key: `${documentKey}-${pageNumber}`\n\n"""
sidebar = sidebar.replace(old_cache, "")

if "const ThumbnailImage: React.FC" not in sidebar:
    component = r'''
interface ThumbnailImageProps {
  doc: PDFDocumentProxy;
  documentKey: string;
  pageNumber: number;
  currentPage: number;
}

const ThumbnailImage: React.FC<ThumbnailImageProps> = ({
  doc,
  documentKey,
  pageNumber,
  currentPage,
}) => {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    let release: (() => void) | null = null;
    setImageUrl(null);

    const distance = Math.abs(pageNumber - currentPage);
    const priority = distance <= 2
      ? RENDER_PRIORITIES.nearbyThumbnail
      : RENDER_PRIORITIES.backgroundThumbnail;

    void acquireScheduledThumbnail({
      doc,
      documentKey,
      pageNumber,
      priority,
      signal: controller.signal,
    }).then((lease) => {
      if (controller.signal.aborted) {
        lease.release();
        return;
      }
      release = lease.release;
      setImageUrl(lease.value.imageUrl);
    }).catch((thumbnailError) => {
      if (!controller.signal.aborted && !isOperationCancelledError(thumbnailError)) {
        setImageUrl(null);
      }
    });

    return () => {
      controller.abort('Thumbnail left the virtualized viewport');
      release?.();
    };
  }, [doc, documentKey, pageNumber, currentPage]);

  if (!imageUrl) {
    return <div className="h-full w-full animate-pulse bg-slate-100 dark:bg-slate-900" />;
  }

  return (
    <img
      src={imageUrl}
      alt={`Thumbnail for page ${pageNumber}`}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center' }}
    />
  );
};

'''
    sidebar = sidebar.replace("const ThumbnailSidebar: React.FC = () => {\n", component + "const ThumbnailSidebar: React.FC = () => {\n", 1)

start_marker = "  React.useEffect(() => {\n    const controller = new AbortController();\n\n    const loadThumbnails = async () => {"
end_marker = "  }, [workingBytes, pdfDoc, documentKey]);"
start = sidebar.find(start_marker)
end = sidebar.find(end_marker, start)
if start == -1 or end == -1:
    if "loadPageMetadata" not in sidebar:
        raise RuntimeError("Could not locate thumbnail loading effect")
else:
    end += len(end_marker)
    replacement = r'''  React.useEffect(() => {
    const controller = new AbortController();

    const loadPageMetadata = async () => {
      if (!workingBytes || !pdfDoc) {
        setThumbs([]);
        return;
      }
      setLoading(true);
      try {
        const pageNumbers = Array.from(
          { length: pdfDoc.numPages },
          (_, index) => index + 1,
        );
        const result = await Promise.all(pageNumbers.map(async (pageNumber) => {
          const pagePromise = pdfDoc.getPage(pageNumber);
          const page = await raceWithAbort(
            pagePromise,
            controller.signal,
            `load PDF page ${pageNumber} metadata for thumbnail sidebar`,
            () => {
              void pagePromise
                .then((latePage) => latePage.cleanup())
                .catch(() => undefined);
            },
          );
          try {
            const viewport = page.getViewport({ scale: 1 });
            return {
              pageNumber,
              pageWidth: viewport.width,
              pageHeight: viewport.height,
            };
          } finally {
            page.cleanup();
          }
        }));
        if (!controller.signal.aborted) setThumbs(result);
      } catch (thumbnailError) {
        if (!controller.signal.aborted && !isOperationCancelledError(thumbnailError)) setThumbs([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadPageMetadata();
    return () => controller.abort('Thumbnail metadata changed or unmounted');
  }, [workingBytes, pdfDoc, documentKey]);'''
    sidebar = sidebar[:start] + replacement + sidebar[end:]

old_img = r'''                  <img
                    src={thumb.imageUrl}
                    alt={`Thumbnail for page ${thumb.pageNumber}`}
                    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center' }}
                    loading="lazy"
                  />'''
new_img = r'''                  {pdfDoc && (
                    <ThumbnailImage
                      doc={pdfDoc}
                      documentKey={documentKey || 'default'}
                      pageNumber={thumb.pageNumber}
                      currentPage={viewState.currentPage}
                    />
                  )}'''
sidebar = replace_once(sidebar, old_img, new_img, "thumbnail image")
sidebar_path.write_text(sidebar)
