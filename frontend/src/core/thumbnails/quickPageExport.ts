import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PageExportResult {
  success: boolean;
  message: string;
}

/**
 * Renders a specific 1-based page of a PDF document into an image Blob.
 */
export async function renderPageToBlob(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale = 2.0,
): Promise<Blob> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const token = PdfRendererAdapter.renderPage(page, canvas, viewport);
  await token.completed;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas failed to produce image blob.'));
      }
    }, 'image/png');
  });
}

/**
 * Copies a high-resolution PNG rendering of the given page directly to the system clipboard.
 * If clipboard write is unsupported or restricted, optionally falls back to initiating a PNG download.
 */
export async function copyPageImageToClipboard(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale = 2.0,
  fallbackToDownload = true,
  baseFileName = 'document.pdf',
): Promise<PageExportResult> {
  const clipboardAvailable =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof ClipboardItem !== 'undefined' &&
    Boolean(navigator.clipboard.write);

  if (!clipboardAvailable) {
    if (fallbackToDownload) {
      await downloadPageAsPng(doc, pageNumber, baseFileName, scale);
      return {
        success: true,
        message: `Clipboard write is unsupported; downloaded Page ${pageNumber} as PNG instead.`,
      };
    }
    return {
      success: false,
      message: 'System clipboard is unavailable in this environment.',
    };
  }

  try {
    const blob = await renderPageToBlob(doc, pageNumber, scale);
    const clipboardItem = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([clipboardItem]);

    return {
      success: true,
      message: `Page ${pageNumber} copied to clipboard as image.`,
    };
  } catch (err) {
    if (fallbackToDownload) {
      try {
        await downloadPageAsPng(doc, pageNumber, baseFileName, scale);
        return {
          success: true,
          message: `Clipboard write was restricted; downloaded Page ${pageNumber} as PNG instead.`,
        };
      } catch (dlErr) {
        return {
          success: false,
          message: dlErr instanceof Error ? dlErr.message : String(dlErr),
        };
      }
    }
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Initiates a browser download for a high-resolution PNG rendering of the given page.
 */
export async function downloadPageAsPng(
  doc: PDFDocumentProxy,
  pageNumber: number,
  baseFileName = 'document.pdf',
  scale = 2.0,
): Promise<void> {
  const blob = await renderPageToBlob(doc, pageNumber, scale);
  const cleanBase = baseFileName.replace(/\.[^/.]+$/, '').trim() || 'document';
  const downloadName = `${cleanBase}_page_${pageNumber}.png`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
