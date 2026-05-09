import { macroRegistry } from '../registry';
import type { StepResult, MacroMutableState } from '../registry';
import type { MacroExecutionContext, MacroStep } from '../types';
import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import { resolveSelector } from './page-ops';
import {
  buildTableHtml as buildSafeWriterTableHtml,
  sanitizeWriterHtml,
} from '../../writer/exporter';

type DrawTextOnPagesStep = Extract<MacroStep, { op: 'draw_text_on_pages' }>;
async function executeDrawTextOnPages(
  step: DrawTextOnPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }
    const updatedBytes = await PdfEditAdapter.drawTextOnPages(state.workingBytes, {
      pages: pages.map((p) => p - 1),
      text: step.text,
      x: step.x,
      y: step.y,
      fontSize: step.fontSize,
      color: step.color ?? '#111827',
      opacity: step.opacity ?? 0.95,
      align: step.align ?? 'left',
      fileName: ctx.fileName,
      now: ctx.now ?? new Date(),
      enablePageNumberToken: step.pageNumberToken ?? true,
      enableFileNameToken: step.fileNameToken ?? false,
      enableDateToken: step.dateToken ?? false,
    });
    return {
      status: 'success',
      message: `Drew text on ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: updatedBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('draw_text_on_pages', executeDrawTextOnPages);

type InjectRichTextStep = Extract<MacroStep, { op: 'inject_rich_text' }>;
async function executeInjectRichText(
  step: InjectRichTextStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }
    const updatedBytes = await PdfEditAdapter.drawTextOnPages(state.workingBytes, {
      pages: pages.map((p) => p - 1),
      text: step.text,
      x: step.x,
      y: step.y,
      fontSize: step.fontSize,
      color: step.color ?? '#0f172a',
      opacity: step.opacity ?? 1,
      align: step.textAlign === 'justify' ? 'left' : (step.textAlign ?? 'left'),
      fileName: ctx.fileName,
      now: ctx.now ?? new Date(),
      enablePageNumberToken: step.pageNumberToken ?? true,
      enableFileNameToken: step.fileNameToken ?? false,
      enableDateToken: step.dateToken ?? false,
    });
    return {
      status: 'success',
      message: `Injected rich text on ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: updatedBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('inject_rich_text', executeInjectRichText);

type HeaderFooterTextStep = Extract<MacroStep, { op: 'header_footer_text' }>;
async function executeHeaderFooterText(
  step: HeaderFooterTextStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage }).filter(page => {
      if (step.excludeFirstPage && page === 1) return false;
      if (step.excludeLastPage && page === state.pageCount) return false;
      return true;
    });

    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    const updatedBytes = await PdfEditAdapter.addHeaderFooterText(state.workingBytes, {
      pages: pages.map((p) => p - 1),
      zone: step.zone,
      text: step.text,
      align: step.align,
      marginX: step.marginX,
      marginY: step.marginY,
      fontSize: step.fontSize,
      color: step.color ?? '#374151',
      opacity: step.opacity ?? 0.9,
      fileName: ctx.fileName,
      now: ctx.now ?? new Date(),
      enablePageNumberToken: step.pageNumberToken ?? true,
      enableFileNameToken: step.fileNameToken ?? false,
      enableDateToken: step.dateToken ?? false,
    });
    return {
      status: 'success',
      message: `Applied ${step.zone} text to ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: updatedBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('header_footer_text', executeHeaderFooterText);

type PlaceRichTextboxStep = Extract<MacroStep, { op: 'place_rich_textbox' }>;

async function executePlaceRichTextbox(
  step: PlaceRichTextboxStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector ?? { mode: 'selected' }, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    const pngBytes = await renderHtmlToPng(
      step.content,
      step.width,
      step.height ?? 80,
      step.styles,
    );

    const currentBytes = await PdfEditAdapter.insertImage(state.workingBytes, {
      pages:       pages,
      x:           step.x,
      y:           step.y,
      width:       step.width,
      height:      step.height ?? 80,
      imageBytes:  pngBytes,
      mimeType:    'image/png',
      opacity:     step.styles.opacity ?? 1,
      borderWidth: step.styles.borderWidth,
      borderColor: step.styles.borderColor,
    });

    return {
      status:     'success',
      message:    `Placed rich text on ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: currentBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}

async function renderHtmlToPng(
  htmlContent: string,
  width: number,
  height: number,
  styles: import('../../writer/types').WriterStyles,
): Promise<Uint8Array> {
  const container = document.createElement('div');
  Object.assign(container.style, {
    position:        'absolute',
    left:            '-9999px',
    top:             '-9999px',
    width:           `${width}px`,
    height:          `${height}px`,
    overflow:        'hidden',
    backgroundColor: styles.backgroundColor ?? 'transparent',
    fontSize:        styles.fontSize ? `${styles.fontSize}px` : '12px',
    fontFamily:      styles.fontFamily ?? 'sans-serif',
    color:           styles.color ?? '#000000',
    padding:         styles.padding ? `${styles.padding}px` : '4px',
    lineHeight:      styles.lineHeight ? String(styles.lineHeight) : '1.4',
    boxSizing:       'border-box',
  });
  container.innerHTML = sanitizeWriterHtml(htmlContent);
  document.body.appendChild(container);

  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(container, {
      width,
      height,
      scale:           2,
      backgroundColor: null,
      useCORS:         true,
      logging:         false,
    });

    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('html2canvas returned no blob')); return; }
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
      }, 'image/png');
    });
  } finally {
    document.body.removeChild(container);  // ALWAYS — even on error
  }
}
macroRegistry.register('place_rich_textbox', executePlaceRichTextbox);

type PlaceTableStep = Extract<MacroStep, { op: 'place_table' }>;

async function executePlaceTable(
  step: PlaceTableStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector ?? { mode: 'selected' }, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    // Use writer module's table renderer — same output as the interactive editor
    const RENDER_SCALE = 2;
    const w = Math.round(step.width * RENDER_SCALE);
    const tableData = step.tableData;

    // Estimate height: header row + data rows * row height
    const rowCount  = tableData.rows.length;
    const rowHeight = (tableData.style?.fontSize ?? 11) * 2.5 * RENDER_SCALE;
    const h         = Math.round(rowCount * rowHeight);

    const container = document.createElement('div');
    Object.assign(container.style, {
      position:   'absolute',
      left:       '-9999px',
      top:        '-9999px',
      width:      `${w}px`,
      minHeight:  `${h}px`,
      overflow:   'hidden',
      fontFamily: 'sans-serif',
      boxSizing:  'border-box',
    });
    container.innerHTML = buildSafeWriterTableHtml(tableData, w, RENDER_SCALE);
    document.body.appendChild(container);

    let pngBytes: Uint8Array;
    let capturedOffsetHeight = 0;
    try {
      capturedOffsetHeight = container.offsetHeight; // capture before removal
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(container, {
        width:           w,
        height:          capturedOffsetHeight || h,
        scale:           1,
        backgroundColor: null,
        useCORS:         true,
        logging:         false,
      });
      pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('html2canvas returned no blob')); return; }
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
        }, 'image/png');
      });
    } finally {
      document.body.removeChild(container);
    }

    const actualHeight = Math.round(capturedOffsetHeight / RENDER_SCALE) || (rowCount * (rowHeight / RENDER_SCALE));

    const currentBytes = await PdfEditAdapter.insertImage(state.workingBytes, {
      pages:      pages,
      x:          step.x,
      y:          step.y,
      width:      step.width,
      height:     actualHeight,
      imageBytes: pngBytes,
      mimeType:   'image/png',
    });

    return {
      status:      'success',
      message:     `Placed table (${rowCount} rows) on ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: currentBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}

// @ts-ignore
function buildTableHtml(
  data: import('../../writer/types').WriterTableData,
  width: number,
  scale: number,
): string {
  const { columns = [], rows = [], style = {} } = data;
  const headers = columns.map((c) => c.id);
  const borderColor = style.borderColor || '#d1d5db';
  const headerBg = style.headerBg || '#f1f5f9';
  const colWidth = headers.length > 0 ? Math.floor(width / headers.length) : width;
  const fontSize = (style.fontSize || 11) * scale;

  const headerRow = headers.map((h) =>
    `<td style="padding:${4*scale}px ${6*scale}px;font-weight:500;background:${headerBg};border:1px solid ${borderColor};width:${colWidth}px;font-size:${fontSize}px">${h}</td>`
  ).join('');

  const dataRows = rows.map((row) =>
    `<tr>${row.cells.map((cell) =>
      `<td style="padding:${4*scale}px ${6*scale}px;border:1px solid ${borderColor};font-size:${fontSize}px">${cell.text}</td>`
    ).join('')}</tr>`
  ).join('');

  return `<table style="border-collapse:collapse;width:100%;font-family:sans-serif">
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${dataRows}</tbody>
  </table>`;
}

macroRegistry.register('place_table', executePlaceTable);

type AdjustImageStep = Extract<MacroStep, { op: 'adjust_image' }>;

async function executeAdjustImage(
  step: AdjustImageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    // Resolve image source — base64 inline takes priority
    let imageBytes: string | Uint8Array;

    if (step.base64Image) {
      imageBytes = step.base64Image;
    } else if (step.donorFileId) {
      const donor = ctx.donorFiles?.[step.donorFileId];
      if (!donor) {
        return {
          status:     'error',
          message:    `donorFileId "${step.donorFileId}" not found in ctx.donorFiles`,
          sideEffects: [],
        };
      }
      imageBytes = donor;
    } else {
      return {
        status:     'error',
        message:    'adjust_image requires either base64Image or donorFileId',
        sideEffects: [],
      };
    }

    const pages = resolveSelector(step.selector ?? { mode: 'selected' }, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    let rawBytes: Uint8Array;
    if (typeof imageBytes === 'string') {
      const base64 = imageBytes.includes(',') ? imageBytes.split(',')[1] : imageBytes;
      rawBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    } else {
      rawBytes = imageBytes;
    }

    // Detect mime type by magic bytes
    let mimeType: 'image/jpeg' | 'image/png' = 'image/png';
    if (rawBytes[0] === 0xFF && rawBytes[1] === 0xD8 && rawBytes[2] === 0xFF) {
      mimeType = 'image/jpeg';
    }

    const currentBytes = await PdfEditAdapter.insertImage(state.workingBytes, {
      pages:       pages,
      x:           step.x,
      y:           step.y,
      width:       step.width,
      height:      step.height,
      imageBytes:  rawBytes,
      mimeType:    mimeType,
      opacity:     step.opacity,
      borderWidth: step.borderWidth,
      borderColor: step.borderColor,
      rotation:    step.rotation,
    });

    return {
      status:     'success',
      message:    `Placed image on ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: currentBytes }],
    };
  } catch (err) {
    return {
      status:     'error',
      message:    err instanceof Error ? err.message : String(err),
      sideEffects: [],
    };
  }
}

macroRegistry.register('adjust_image', executeAdjustImage);
