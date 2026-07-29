import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import { verifyProfessionalCalloutOutput } from '../../annotation-verification/output-verifier';
import { macroRegistry } from '../registry';
import type {
  MacroMutableState,
  SideEffect,
  StepResult,
} from '../registry';
import type {
  MacroExecutionContext,
  MacroStep,
} from '../types';
import {
  resolvePageSelector,
  toZeroBasedPageIndices,
} from './page-ops';

type PlaceProfessionalCalloutStep = Extract<
  MacroStep,
  { op: 'place_professional_callout' }
>;

const FALLBACK_MAPPING_HASH = `sha256:${'0'.repeat(64)}`;

function resultWithBytes(
  status: StepResult['status'],
  message: string,
  bytes: Uint8Array,
): StepResult {
  const sideEffects: SideEffect[] = [
    {
      type: 'bytes_updated',
      bytes,
    },
    {
      type: 'log',
      message,
    },
  ];

  return {
    status,
    message,
    sideEffects,
  };
}

function resolvePages(
  step: PlaceProfessionalCalloutStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): number[] {
  return resolvePageSelector(
    step.selector ?? { mode: 'selected' },
    {
      pageCount: state.pageCount,
      selectedPages: state.selectedPages,
      currentPage: ctx.currentPage,
    },
  );
}

/**
 * Authoritative committed-callout executor.
 *
 * A committed PS/ISONOTE callout is written once into candidate PDF bytes. Editable
 * review overlays belong to the pre-commit review lifecycle and must not be created
 * by this executor. Import this module after content-ops so it intentionally replaces
 * the legacy executor that also inserted a second annotation-store rectangle.
 */
export async function executeCommittedProfessionalCallout(
  step: PlaceProfessionalCalloutStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePages(step, ctx, state);

    if (pages.length === 0) {
      const message = 'No pages matched place_professional_callout selector.';
      return {
        status: 'warning',
        message,
        sideEffects: [{ type: 'log', message }],
      };
    }

    const updatedBytes = await PdfEditAdapter.drawProfessionalCallout(
      state.workingBytes,
      {
        pages: toZeroBasedPageIndices(pages),
        callout: step.callout,
        signal: ctx.options?.abortSignal,
      },
    );

    try {
      const verificationReport = await verifyProfessionalCalloutOutput(
        updatedBytes,
        [step.callout],
        FALLBACK_MAPPING_HASH,
        ctx.options?.abortSignal,
      );

      if (!verificationReport.passed) {
        const errors = [
          ...verificationReport.missingMarkerErrors,
          ...verificationReport.missingTextErrors,
          ...verificationReport.duplicateErrors,
          ...verificationReport.mismatchErrors,
        ].join('; ');
        const message =
          `Professional callout committed, but post-write verification failed: ${errors}`;

        // Preserve the generated candidate bytes. Complete PS/ISONOTE verification
        // remains authoritative after the recipe's later marker-writing steps.
        return resultWithBytes('warning', message, updatedBytes);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message =
        `Professional callout committed; immediate text verification was unavailable: ${detail}`;

      return resultWithBytes('warning', message, updatedBytes);
    }

    return resultWithBytes(
      'success',
      `Placed professional vector callout on ${pages.length} page(s)`,
      updatedBytes,
    );
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      sideEffects: [],
    };
  }
}

macroRegistry.register(
  'place_professional_callout',
  executeCommittedProfessionalCallout,
  { override: true },
);
