import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import { macroRegistry } from '../registry';
import type {
  MacroMutableState,
  SideEffect,
  StepResult,
} from '../registry';
import type {
  MacroExecutionContext,
  MacroStep,
  PageSelector,
} from '../types';
import {
  resolvePageSelector,
  toZeroBasedPageIndices,
} from './page-ops';
import {
  buildTableHtml as buildSafeWriterTableHtml,
  sanitizeWriterHtml,
} from '../../writer/exporter';
import type {
  WriterStyles,
  WriterTableData,
} from '../../writer/types';

type SupportedImageMime = 'image/png' | 'image/jpeg';

interface ParsedImageSource {
  bytes: Uint8Array;
  mimeType: SupportedImageMime;
}

function getSelectionState(
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): {
  pageCount: number;
  selectedPages: number[];
  currentPage?: number;
} {
  return {
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    currentPage: ctx.currentPage,
  };
}

function success(
  message: string,
  sideEffects: SideEffect[],
): StepResult {
  return {
    status: 'success',
    message,
    sideEffects: [
      ...sideEffects,
      {
        type: 'log',
        message,
      },
    ],
  };
}

function warning(
  message: string,
): StepResult {
  return {
    status: 'warning',
    message,
    sideEffects: [
      {
        type: 'log',
        message,
      },
    ],
  };
}

function failure(
  err: unknown,
): StepResult {
  return {
    status: 'error',
    message: err instanceof Error ? err.message : String(err),
    sideEffects: [],
  };
}

function bytesEffect(bytes: Uint8Array): SideEffect {
  return {
    type: 'bytes_updated',
    bytes,
  };
}

function resolvePagesForOptionalSelector(
  selector: PageSelector | undefined,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): number[] {
  return resolvePageSelector(
    selector ?? { mode: 'selected' },
    getSelectionState(ctx, state),
  );
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error('Invalid base64 image data.');
  }

  const decoder = globalThis.atob;

  if (typeof decoder !== 'function') {
    throw new Error('Base64 decoder is unavailable in this runtime.');
  }

  const binary = decoder(clean);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  return null;
}

function parseDataImageSource(source: string): ParsedImageSource {
  const value = source.trim();

  if (/^\s*javascript:/i.test(value)) {
    throw new Error('Unsafe image source blocked: javascript URL.');
  }

  if (/^\s*data:text\/html/i.test(value)) {
    throw new Error('Unsafe image source blocked: data:text/html is not allowed.');
  }

  if (/^\s*data:/i.test(value)) {
    const match = /^data:(image\/png|image\/jpeg|image\/jpg);base64,(.+)$/i.exec(value);

    if (!match) {
      throw new Error('Unsafe image source blocked: only data:image/png and data:image/jpeg are allowed.');
    }

    const declaredMime: SupportedImageMime =
      match[1].toLowerCase() === 'image/jpg'
        ? 'image/jpeg'
        : match[1].toLowerCase() as SupportedImageMime;

    const bytes = decodeBase64ToBytes(match[2]);
    const detectedMime = detectImageMime(bytes);

    if (!detectedMime) {
      throw new Error('Unsafe image source blocked: image bytes are not PNG or JPEG.');
    }

    if (declaredMime !== detectedMime) {
      throw new Error(`Unsafe image source blocked: declared ${declaredMime} but detected ${detectedMime}.`);
    }

    return {
      bytes,
      mimeType: detectedMime,
    };
  }

  const bytes = decodeBase64ToBytes(value);
  const detectedMime = detectImageMime(bytes);

  if (!detectedMime) {
    throw new Error('Unsafe image source blocked: raw base64 image is not PNG or JPEG.');
  }

  return {
    bytes,
    mimeType: detectedMime,
  };
}

function parseImageFromStepSource(
  base64Image: string | undefined,
  donorFileId: string | undefined,
  ctx: MacroExecutionContext,
): ParsedImageSource {
  if (base64Image?.trim()) {
    return parseDataImageSource(base64Image);
  }

  if (donorFileId?.trim()) {
    const donorBytes = ctx.donorFiles?.[donorFileId];

    if (!donorBytes) {
      throw new Error(`Image donor file "${donorFileId}" was not provided.`);
    }

    const detectedMime = detectImageMime(donorBytes);

    if (!detectedMime) {
      throw new Error(`Image donor file "${donorFileId}" is not PNG or JPEG.`);
    }

    return {
      bytes: donorBytes,
      mimeType: detectedMime,
    };
  }

  throw new Error('Image operation requires either base64Image or donorFileId.');
}

async function captureHtmlToPng(
  htmlContent: string,
  width: number,
  height: number,
  styles: WriterStyles,
): Promise<Uint8Array> {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  const container = document.createElement('div');

  Object.assign(container.style, {
    position: 'absolute',
    left: '-9999px',
    top: '-9999px',
    width: `${safeWidth}px`,
    height: `${safeHeight}px`,
    overflow: 'hidden',
    backgroundColor: styles.backgroundColor ?? 'transparent',
    fontSize: styles.fontSize ? `${styles.fontSize}px` : '12px',
    fontFamily: styles.fontFamily ?? 'sans-serif',
    color: styles.color ?? '#000000',
    padding: styles.padding ? `${styles.padding}px` : '4px',
    lineHeight: styles.lineHeight ? String(styles.lineHeight) : '1.4',
    boxSizing: 'border-box',
    opacity: styles.opacity === undefined ? '1' : String(styles.opacity),
    border: styles.borderWidth
      ? `${styles.borderWidth}px solid ${styles.borderColor ?? '#000000'}`
      : 'none',
  });

  container.innerHTML = sanitizeWriterHtml(htmlContent);
  document.body.appendChild(container);

  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(container, {
      width: safeWidth,
      height: safeHeight,
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });

    return await canvasToPngBytes(canvas);
  } finally {
    document.body.removeChild(container);
  }
}

async function captureTableToPng(
  tableData: WriterTableData,
  width: number,
): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
}> {
  const renderScale = 2;
  const safeWidth = Math.max(1, Math.round(width * renderScale));
  const rowCount = Math.max(1, tableData.rows.length);
  const rowHeight = Math.max(18, tableData.style?.fontSize ?? 11) * 2.5 * renderScale;
  const fallbackHeight = Math.max(1, Math.round(rowCount * rowHeight));

  const container = document.createElement('div');

  Object.assign(container.style, {
    position: 'absolute',
    left: '-9999px',
    top: '-9999px',
    width: `${safeWidth}px`,
    minHeight: `${fallbackHeight}px`,
    overflow: 'hidden',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box',
  });

  container.innerHTML = buildSafeWriterTableHtml(
    tableData,
    safeWidth,
    renderScale,
  );

  document.body.appendChild(container);

  try {
    const capturedHeight = container.offsetHeight || fallbackHeight;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(container, {
      width: safeWidth,
      height: capturedHeight,
      scale: 1,
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });

    return {
      bytes: await canvasToPngBytes(canvas),
      width,
      height: Math.max(1, Math.round(capturedHeight / renderScale)),
    };
  } finally {
    document.body.removeChild(container);
  }
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas conversion failed: no PNG blob returned.'));
        return;
      }

      blob.arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, 'image/png');
  });
}

type DrawTextOnPagesStep = Extract<MacroStep, { op: 'draw_text_on_pages' }>;

async function executeDrawTextOnPages(
  step: DrawTextOnPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched draw_text_on_pages selector.');
    }

    const updatedBytes = await PdfEditAdapter.drawTextOnPages(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
      text: step.text,
      x: step.x,
      y: step.y,
      fontSize: step.fontSize,
      color: step.color ?? '#111827',
      opacity: step.opacity ?? 0.95,
      align: step.align ?? 'left',
      rotation: step.rotation,
      fileName: ctx.fileName,
      now: ctx.now ?? new Date(),
      enablePageNumberToken: step.pageNumberToken ?? true,
      enableFileNameToken: step.fileNameToken ?? false,
      enableDateToken: step.dateToken ?? false,
    });

    return success(
      `Drew text on ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
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
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched inject_rich_text selector.');
    }

    const updatedBytes = await PdfEditAdapter.drawTextOnPages(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
      text: step.text,
      x: step.x,
      y: step.y,
      fontSize: step.fontSize,
      color: step.color ?? '#0f172a',
      opacity: step.opacity ?? 1,
      align: step.textAlign === 'justify' ? 'left' : step.textAlign ?? 'left',
      fileName: ctx.fileName,
      now: ctx.now ?? new Date(),
      enablePageNumberToken: step.pageNumberToken ?? true,
      enableFileNameToken: step.fileNameToken ?? false,
      enableDateToken: step.dateToken ?? false,
    });

    return success(
      `Injected rich text on ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
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
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state))
      .filter((page) => {
        if (step.excludeFirstPage && page === 1) return false;
        if (step.excludeLastPage && page === state.pageCount) return false;
        return true;
      });

    if (pages.length === 0) {
      return warning('No pages matched header_footer_text selector.');
    }

    const updatedBytes = await PdfEditAdapter.addHeaderFooterText(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
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

    return success(
      `Applied ${step.zone} text to ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('header_footer_text', executeHeaderFooterText);

type InsertImageStep = Extract<MacroStep, { op: 'insert_image' }>;

async function executeInsertImage(
  step: InsertImageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched insert_image selector.');
    }

    const image = parseImageFromStepSource(
      step.base64Image,
      step.donorFileId,
      ctx,
    );

    const updatedBytes = await PdfEditAdapter.insertImage(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
      x: step.x,
      y: step.y,
      width: step.width,
      height: step.height,
      scale: step.scale,
      imageBytes: image.bytes,
      mimeType: image.mimeType,
    });

    return success(
      `Inserted image on ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('insert_image', executeInsertImage);

type PlaceRichTextboxStep = Extract<MacroStep, { op: 'place_rich_textbox' }>;

async function executePlaceRichTextbox(
  step: PlaceRichTextboxStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePagesForOptionalSelector(step.selector, ctx, state);

    if (pages.length === 0) {
      return warning('No pages matched place_rich_textbox selector.');
    }

    const imageBytes = await captureHtmlToPng(
      step.content,
      step.width,
      step.height ?? 80,
      step.styles,
    );

    const updatedBytes = await PdfEditAdapter.insertImage(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
      x: step.x,
      y: step.y,
      width: step.width,
      height: step.height ?? 80,
      imageBytes,
      mimeType: 'image/png',
      opacity: step.styles.opacity ?? 1,
      borderWidth: step.styles.borderWidth,
      borderColor: step.styles.borderColor,
    });

    return success(
      `Placed rich text on ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
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
    const pages = resolvePagesForOptionalSelector(step.selector, ctx, state);

    if (pages.length === 0) {
      return warning('No pages matched place_table selector.');
    }

    const tableImage = await captureTableToPng(
      step.tableData,
      step.width,
    );

    const updatedBytes = await PdfEditAdapter.insertImage(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
      x: step.x,
      y: step.y,
      width: tableImage.width,
      height: tableImage.height,
      imageBytes: tableImage.bytes,
      mimeType: 'image/png',
    });

    return success(
      `Placed table (${step.tableData.rows.length} rows) on ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('place_table', executePlaceTable);

type AdjustImageStep = Extract<MacroStep, { op: 'adjust_image' }>;

async function executeAdjustImage(
  step: AdjustImageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePagesForOptionalSelector(step.selector, ctx, state);

    if (pages.length === 0) {
      return warning('No pages matched adjust_image selector.');
    }

    const image = parseImageFromStepSource(
      step.base64Image,
      step.donorFileId,
      ctx,
    );

    const updatedBytes = await PdfEditAdapter.insertImage(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
      x: step.x,
      y: step.y,
      width: step.width,
      height: step.height,
      imageBytes: image.bytes,
      mimeType: image.mimeType,
      opacity: step.opacity,
      borderWidth: step.borderWidth,
      borderColor: step.borderColor,
      rotation: step.rotation,
    });

    return success(
      `Placed image on ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('adjust_image', executeAdjustImage);

type DrawRedactionBoxStep = Extract<MacroStep, { op: 'draw_redaction_box' }>;

async function executeDrawRedactionBox(
  step: DrawRedactionBoxStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched draw_redaction_box selector.');
    }

    const updatedBytes = await PdfEditAdapter.drawRedactionBoxes(state.workingBytes, {
      pages: toZeroBasedPageIndices(pages),
      x: step.x,
      y: step.y,
      width: step.width,
      height: step.height,
      fillColor: step.fillColor ?? '#ffffff',
    });

    return success(
      `Applied redaction box on ${pages.length} page(s)`,
      [bytesEffect(updatedBytes)],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('draw_redaction_box', executeDrawRedactionBox);
