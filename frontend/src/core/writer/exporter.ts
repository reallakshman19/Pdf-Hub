import html2canvas from 'html2canvas';
import { PdfEditAdapter } from '../../adapters/pdf-edit/PdfEditAdapter';
import type { PlacedElement, WriterTableData } from './types';
import { visibleWriterElementsForExport } from './writerObjects';

export interface WriterExportWarning {
  elementId: string;
  pageNumber: number;
  reason: string;
  fallback: 'raster' | 'skipped';
}

export interface WriterExportOptions {
  preferSemantic?: boolean;
  allowRasterFallback?: boolean;
  collectWarnings?: (warnings: WriterExportWarning[]) => void;
}

/** @deprecated Use WriterExportOptions */
export interface BakeWriterElementsOptions {
  preferSemantic?: boolean;
  allowRasterFallback?: boolean;
  collectWarnings?: (warnings: WriterExportWarning[]) => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function sanitizeWriterHtml(html: string): string {
  // Strip script, style, iframe, object, embed, form tags and event attributes
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*/gi, '')
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export function buildTableHtml(
  data: WriterTableData,
  width: number,
  scale: number,
): string {
  const columns = data.columns || [];
  const rows = data.rows || [];
  const borderColor = data.style?.borderColor || '#d1d5db';
  const headerBg = data.style?.headerBg || '#f1f5f9';

  const colCount = columns.length > 0 ? columns.length : (rows[0]?.cells?.length ?? 0);
  const colWidth = colCount > 0 ? Math.floor(width / colCount) : width;
  const fontSize = 11 * scale;

  const dataRows = rows.map((row, rIdx) => {
    const isHeader = rIdx === 0;
    const bg = isHeader ? headerBg : 'transparent';
    const fw = isHeader ? 500 : 'normal';

    return `<tr>${row.cells.map(cell =>
      `<td style="padding:${4 * scale}px ${6 * scale}px;background:${bg};font-weight:${fw};border:1px solid ${borderColor};width:${colWidth}px;font-size:${fontSize}px">${escapeHtml(String(cell.text ?? ''))}</td>`
    ).join('')}</tr>`;
  }).join('');

  return `<table style="border-collapse:collapse;width:100%;font-family:sans-serif">
    <tbody>${dataRows}</tbody>
  </table>`;
}

async function drawRichTextElement(
  element: PlacedElement,
  container: HTMLDivElement,
): Promise<void> {
  container.innerHTML = sanitizeWriterHtml(element.content);
}

async function drawTableElement(
  element: PlacedElement,
  container: HTMLDivElement,
  renderScale: number,
): Promise<void> {
  const tableData = JSON.parse(element.content || '{"rows":[],"columns":[],"style":{}}') as WriterTableData & {
    headers?: string[];
    borderColor?: string;
    headerBg?: string;
  };
  // Handle migration from old schema
  let parsedData: WriterTableData = tableData as WriterTableData;
  if ('headers' in tableData && Array.isArray(tableData.headers)) {
    parsedData = {
      columns: tableData.headers.map((_h: string, i: number) => ({ id: `col-${i}` })),
      rows: [
        { id: 'header-row', cells: tableData.headers.map((h: string, i: number) => ({ id: `h-${i}`, text: h })) },
        ...(tableData.rows as unknown as string[][]).map((r: string[], rIdx: number) => ({
          id: `r-${rIdx}`,
          cells: r.map((c, cIdx) => ({ id: `c-${rIdx}-${cIdx}`, text: c }))
        }))
      ],
      style: {
        borderColor: tableData.borderColor ?? '#d1d5db',
        headerBg: tableData.headerBg ?? '#f1f5f9',
      },
    };
  }

  const w = Math.round(element.width * renderScale);
  container.innerHTML = buildTableHtml(parsedData, w, renderScale);
}

/**
 * Bakes all PlacedElements into the PDF as embedded images.
 *
 * This is the ONLY export path for writer elements.
 * Called from ToolbarWriter "Bake & export" button.
 * Also called by Agent E's place_rich_textbox executor (single-element variant).
 *
 * Process per element:
 *   1. Create offscreen DOM node matching element dimensions (2× scale for sharpness)
 *   2. Render content into it
 *   3. html2canvas capture → PNG Uint8Array
 *   4. PdfEditAdapter.insertImage at element coordinates
 */
export async function bakeWriterElementsIntoPdf(
  baseBytes: Uint8Array,
  elements: PlacedElement[],
  options: WriterExportOptions = {},
): Promise<Uint8Array> {
  const exportElements = visibleWriterElementsForExport(elements);
  if (exportElements.length === 0) return baseBytes;

  // Group by page, sort by zIndex within page
  const byPage = new Map<number, PlacedElement[]>();
  for (const el of exportElements) {
    const page = byPage.get(el.pageNumber) ?? [];
    page.push(el);
    byPage.set(el.pageNumber, page);
  }

  let currentBytes = baseBytes;
  const warnings: WriterExportWarning[] = [];

  for (const [pageNumber, pageElements] of byPage) {
    const sorted = pageElements.sort((a, b) => a.zIndex - b.zIndex);

    for (const element of sorted) {
      try {
        const pngBytes = await captureElementToPng(element);

        currentBytes = await PdfEditAdapter.insertImage(currentBytes, {
          pages:       [pageNumber],
          x:           element.x,
          y:           element.y,
          width:       element.width,
          height:      element.height,
          imageBytes:  pngBytes,
          mimeType:    'image/png',
          opacity:     element.styles.opacity     ?? 1,
          borderWidth: element.styles.borderWidth ?? 0,
          borderColor: element.styles.borderColor,
        });
      } catch (err) {
        if (options.allowRasterFallback === false) {
          throw err;
        }
        warnings.push({
          elementId: element.id,
          pageNumber,
          reason: String(err),
          fallback: 'skipped',
        });
      }
    }
  }

  if (warnings.length > 0 && options.collectWarnings) {
    options.collectWarnings(warnings);
  }

  return currentBytes;
}

async function captureElementToPng(element: PlacedElement): Promise<Uint8Array> {
  const RENDER_SCALE = 2;   // 2× for PDF sharpness
  const w = Math.round(element.width  * RENDER_SCALE);
  const h = Math.round(element.height * RENDER_SCALE);

  const container = document.createElement('div');
  Object.assign(container.style, {
    position:        'absolute',
    left:            '-9999px',
    top:             '-9999px',
    width:           `${w}px`,
    height:          `${h}px`,
    overflow:        'hidden',
    backgroundColor: element.styles.backgroundColor ?? 'transparent',
    fontSize:        `${(element.styles.fontSize ?? 12) * RENDER_SCALE}px`,
    fontFamily:      element.styles.fontFamily ?? 'sans-serif',
    color:           element.styles.color ?? '#000000',
    padding:         `${(element.styles.padding ?? 0) * RENDER_SCALE}px`,
    lineHeight:      element.styles.lineHeight ? String(element.styles.lineHeight) : '1.4',
    boxSizing:       'border-box',
    opacity:         element.styles.opacity ? String(element.styles.opacity) : '1',
    border:          element.styles.borderWidth
                        ? `${element.styles.borderWidth * RENDER_SCALE}px solid ${element.styles.borderColor ?? '#000'}`
                        : 'none',
  });

  if (element.type === 'rich-text') {
    await drawRichTextElement(element, container);
  } else if (element.type === 'image') {
    const img = document.createElement('img');
    img.src   = element.content;
    img.style.width  = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    container.appendChild(img);
    // Wait for image to load
    await new Promise<void>((res, rej) => {
      img.onload  = () => res();
      img.onerror = () => rej(new Error('Image failed to load for bake'));
    });
  } else if (element.type === 'table') {
    await drawTableElement(element, container, RENDER_SCALE);
  }

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      width:           w,
      height:          h,
      scale:           1,         // already scaled via CSS
      backgroundColor: null,
      useCORS:         true,
      logging:         false,
    });

    return await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('html2canvas returned no blob')); return; }
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
      }, 'image/png');
    });
  } finally {
    document.body.removeChild(container);
  }
}

export {
  visibleWriterElementsForExport,
} from './writerObjects';
