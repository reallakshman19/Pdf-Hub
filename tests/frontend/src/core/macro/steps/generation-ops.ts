import { macroRegistry } from '../registry';
import type { StepResult, MacroMutableState } from '../registry';
import type { MacroExecutionContext, MacroStep, InsertPosition } from '../types';
import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import { resolveSelector } from './page-ops';

type AddContentPageStep = Extract<MacroStep, { op: 'add_content_page' }>;
async function executeAddContentPage(
  step: AddContentPageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const { renderPageToImageBytes } = await import('../layout/pageRenderer');
    const imageBytes = await renderPageToImageBytes({
      size: step.size ?? 'a4',
      background: step.background,
      blocks: step.blocks,
    });

    const atIndex = resolveInsertIndex(step.position, ctx.currentPage ?? 1, state.pageCount);
    const size = step.size === 'letter' ? { width: 612, height: 792 } : { width: 595, height: 842 };

    let currentBytes = await PdfEditAdapter.insertBlankPage(state.workingBytes, atIndex, size);
    currentBytes = await PdfEditAdapter.insertImage(currentBytes, atIndex + 1, {
      imageBytes,
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    });
    const newPageCount = await PdfEditAdapter.countPages(currentBytes);

    return {
      status: 'success',
      message: `Generated content page at index ${atIndex + 1}`,
      sideEffects: [
        { type: 'bytes_updated', bytes: currentBytes },
        { type: 'page_count_changed', newCount: newPageCount },
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('add_content_page', executeAddContentPage);

type AddImageHeaderPageStep = Extract<MacroStep, { op: 'add_image_header_page' }>;
async function executeAddImageHeaderPage(
  step: AddImageHeaderPageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const { renderPageToImageBytes } = await import('../layout/pageRenderer');
    const imageBytes = await renderPageToImageBytes({
      size: step.size ?? 'a4',
      blocks: [
        { type: 'image-header', src: step.imageSrc, height: step.headerHeight ?? 200 },
        { type: 'heading', text: step.title, level: 1 as const },
        ...(step.subtitle ? [{ type: 'heading' as const, text: step.subtitle, level: 3 as const, color: '#64748b' }] : []),
        { type: 'divider' },
        ...(step.bodyMarkdown ? [{ type: 'rich-text' as const, markdown: step.bodyMarkdown }] : []),
      ],
    });

    const atIndex = resolveInsertIndex(step.position, ctx.currentPage ?? 1, state.pageCount);
    const size = step.size === 'letter' ? { width: 612, height: 792 } : { width: 595, height: 842 };

    let currentBytes = await PdfEditAdapter.insertBlankPage(state.workingBytes, atIndex, size);
    currentBytes = await PdfEditAdapter.insertImage(currentBytes, atIndex + 1, {
      imageBytes,
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    });
    const newPageCount = await PdfEditAdapter.countPages(currentBytes);

    return {
      status: 'success',
      message: `Generated branded header page: "${step.title}" at index ${atIndex + 1}`,
      sideEffects: [
        { type: 'bytes_updated', bytes: currentBytes },
        { type: 'page_count_changed', newCount: newPageCount },
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('add_image_header_page', executeAddImageHeaderPage);

type InsertImageStep = Extract<MacroStep, { op: 'insert_image' }>;
async function executeInsertImage(
  step: InsertImageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    let imageBytes: Uint8Array | undefined;
    // let mimeType: 'image/jpeg' | 'image/png' = 'image/png';

    if (step.donorFileId && ctx.donorFiles?.[step.donorFileId]) {
      imageBytes = ctx.donorFiles[step.donorFileId];
      if (imageBytes[0] === 0xff && imageBytes[1] === 0xd8) {
        // mimeType = 'image/jpeg';
      }
    } else if (step.base64Image) {
      const match = step.base64Image.match(/^data:(image\/[a-zA-Z]+);base64,(.*)$/);
      if (match) {
        // mimeType = match[1] === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        // Use a universal cross-platform method if available or stick to standard Buffer if in Node
        if (typeof (globalThis as unknown as { Buffer: unknown }).Buffer !== 'undefined') {
          imageBytes = new Uint8Array((globalThis as unknown as { Buffer: { from: (data: string, encoding: string) => ArrayBuffer } }).Buffer.from(match[2], 'base64'));
        } else {
          const binaryString = atob(match[2]);
          imageBytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            imageBytes[i] = binaryString.charCodeAt(i);
          }
        }
      }
    }

    if (!imageBytes) {
      return { status: 'warning', message: 'Skipped insert_image: no valid image data found', sideEffects: [] };
    }

    let updatedBytes = state.workingBytes;
    for (const pageNumber of pages) {
      updatedBytes = await PdfEditAdapter.insertImage(updatedBytes, pageNumber, {
        imageBytes,
        x: step.x,
        y: step.y,
        width: step.width as number,
        height: step.height as number,
      });
    }

    return {
      status: 'success',
      message: `Inserted image on ${pages.length} page(s)`,
      sideEffects: [{ type: 'bytes_updated', bytes: updatedBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('insert_image', executeInsertImage);



function resolveInsertIndex(
  position: InsertPosition,

  _currentPage: number,
  pageCount: number,
): number {
  switch (position.mode) {
    case 'start': return 0;
    case 'end': return pageCount;
    case 'before': return Math.max(0, Math.min(position.page - 1, pageCount));
    case 'after': return Math.max(0, Math.min(position.page, pageCount));
  }
}
