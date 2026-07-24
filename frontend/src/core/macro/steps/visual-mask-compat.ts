import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { macroRegistry } from '../registry';
import type { MacroMutableState, StepResult } from '../registry';
import type { MacroExecutionContext, MacroStep } from '../types';
import { resolvePageSelector, toZeroBasedPageIndices } from './page-ops';

type DrawRedactionBoxStep = Extract<MacroStep, { op: 'draw_redaction_box' }>;

async function executeLegacyVisualMask(
  step: DrawRedactionBoxStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  const pages = resolvePageSelector(step.selector, {
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    currentPage: ctx.currentPage,
  });

  if (pages.length === 0) {
    return {
      status: 'warning',
      message: 'No pages matched the visual-mask selector.',
      sideEffects: [
        { type: 'log', message: 'No pages matched the visual-mask selector.' },
      ],
    };
  }

  const updatedBytes = await PdfEditAdapter.drawRedactionBoxes(state.workingBytes, {
    pages: toZeroBasedPageIndices(pages),
    x: step.x,
    y: step.y,
    width: step.width,
    height: step.height,
    fillColor: step.fillColor ?? '#ffffff',
  });
  const message =
    `Applied a visual mask on ${pages.length} page(s). ` +
    'Underlying PDF content was not securely removed.';

  return {
    status: 'success',
    message,
    sideEffects: [
      { type: 'bytes_updated', bytes: updatedBytes },
      { type: 'log', message },
    ],
  };
}

/** Preserve the imported operation id while replacing unsafe product semantics. */
export function registerLegacyVisualMaskCompatibility(): void {
  macroRegistry.register('draw_redaction_box', executeLegacyVisualMask, { override: true });
}
