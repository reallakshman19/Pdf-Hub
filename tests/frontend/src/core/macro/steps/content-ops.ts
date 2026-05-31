import html2canvas from 'html2canvas';
import { macroRegistry } from '../registry';
import type { StepResult, MacroMutableState } from '../registry';
import type { MacroExecutionContext, MacroStep } from '../types';
import { buildTableHtml } from '../../writer/writerMacroHelpers';
import type { PlacedElementStyles, WriterTableData } from '../../writer/writerMacroHelpers';

import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import { resolveSelector } from './page-ops';

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

type PlaceRichTextboxStep = {
  op:       'place_rich_textbox';
  selector?: import('../types').PageSelector;
  x:        number;
  y:        number;
  width:    number;
  height?:  number;
  content:  string;
  styles:   PlacedElementStyles;
};

async function executePlaceRichTextbox(
  step: PlaceRichTextboxStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector ?? { mode: 'selected' }, state);
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    const pngBytes = await renderHtmlToPng(
      step.content,
      step.width,
      step.height ?? 80,
      step.styles,
    );

    let currentBytes = state.workingBytes;
    for (const pageNumber of pages) {
      currentBytes = await PdfEditAdapter.insertImage(currentBytes, pageNumber, {
        x:           step.x,
        y:           step.y,
        width:       step.width,
        height:      step.height ?? 80,
        imageBytes:  pngBytes,
        opacity:     step.styles.opacity ?? 1,
        borderWidth: step.styles.borderWidth,
        borderColor: step.styles.borderColor,
      });
    }

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
  styles: PlacedElementStyles,
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
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
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
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector ?? { mode: 'selected' }, state);
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    // Use writer module's table renderer — same output as the interactive editor
    const RENDER_SCALE = 2;
    const w = Math.round(step.width * RENDER_SCALE);
    const tableData: WriterTableData = step.tableData;

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
    container.innerHTML = buildTableHtml(tableData, w, RENDER_SCALE);
    document.body.appendChild(container);

    let pngBytes: Uint8Array;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(container, {
        width:           w,
        height:          container.offsetHeight || h,
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

    const actualHeight = Math.round(container.offsetHeight / RENDER_SCALE) || (rowCount * (rowHeight / RENDER_SCALE));

    let currentBytes = state.workingBytes;
    for (const pageNumber of pages) {
      currentBytes = await PdfEditAdapter.insertImage(currentBytes, pageNumber, {
        x:          step.x,
        y:          step.y,
        width:      step.width,
        height:     actualHeight,
        imageBytes: pngBytes,
      });
    }

    return {
      status:      'success',
      message:     `Placed table (${rowCount} rows) on ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: currentBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('place_table', executePlaceTable);

type AdjustImageStep = {
  op:           'adjust_image';
  selector?: import('../types').PageSelector;
  x:            number;
  y:            number;
  width:        number;
  height:       number;
  opacity?:     number;
  borderWidth?: number;
  borderColor?: string;
  rotation?:    number;
  base64Image?: string;
  donorFileId?: string;   // resolved via ctx.fileRegistry
};

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
      const donor = ctx.fileRegistry?.get(step.donorFileId);
      if (!donor) {
        return {
          status:     'error',
          message:    `donorFileId "${step.donorFileId}" not found in ctx.fileRegistry`,
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

    const pages = resolveSelector(step.selector ?? { mode: 'selected' }, state);
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    let currentBytes = state.workingBytes;
    for (const pageNumber of pages) {
      currentBytes = await PdfEditAdapter.insertImage(currentBytes, pageNumber, {
        x:           step.x,
        y:           step.y,
        width:       step.width,
        height:      step.height,
        imageBytes,
        opacity:     step.opacity,
        borderWidth: step.borderWidth,
        borderColor: step.borderColor,
        rotation:    step.rotation,
      });
    }

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

// Registration — alongside place_rich_textbox and place_table
macroRegistry.register('adjust_image', executeAdjustImage);
