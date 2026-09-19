import type { PageGraph, PageNode } from '@/core/pages/types';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import type {
  PdfMutationHeaderFooterPage,
} from '@/core/pdf-mutation/types';
import type { HeaderFooterTemplate } from './types';
import type { HeaderFooterResolutionContext } from './resolutionTypes';
import { planHeaderFooterTemplateCommand } from './commandPlan';
import { compileHeaderFooterMutationPlan } from './mutationPlan';
import type { HeaderFooterPdfWriter } from './pdfWriter';
import { pdfLibHeaderFooterWriter } from './pdfLibHeaderFooterWriter';

export type PrepareHeaderFooterTemplateMutationResult =
  | {
      ok: true;
      mutated: boolean;
      pages: PdfMutationHeaderFooterPage[];
      binaryResources: Readonly<Record<string, Uint8Array>>;
      warnings: string[];
    }
  | {
      ok: false;
      code: 'VALIDATION_FAILED' | 'RESOURCE_MISSING';
      errors: string[];
      warnings: string[];
    };

export type ExecuteHeaderFooterTemplateMutationResult =
  | {
      ok: true;
      mutated: boolean;
      bytes: Uint8Array;
      warnings: string[];
    }
  | {
      ok: false;
      code: 'VALIDATION_FAILED' | 'RESOURCE_MISSING' | 'EXECUTION_FAILED';
      errors: string[];
      warnings: string[];
    };

export function prepareHeaderFooterTemplateMutation(
  pageGraph: PageGraph<PageNode>,
  template: HeaderFooterTemplate,
  context: HeaderFooterResolutionContext,
  binaryResources: Readonly<Record<string, Uint8Array>> | undefined,
): PrepareHeaderFooterTemplateMutationResult {
  const plan = planHeaderFooterTemplateCommand(
    template,
    pageGraph,
    context,
  );

  if (!plan.ok) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      errors: plan.errors,
      warnings: plan.warnings,
    };
  }

  const availableBinaryResources =
    binaryResources ?? {};
  const missing = plan.requiredBinaryResourceIds.filter(
    (resourceId) =>
      availableBinaryResources[resourceId] === undefined,
  );
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'RESOURCE_MISSING',
      errors: missing.map(
        (resourceId) =>
          `Header/footer binary resource is unavailable: ${resourceId}`,
      ),
      warnings: plan.warnings,
    };
  }

  return {
    ok: true,
    mutated: plan.pages.length > 0,
    pages: compileHeaderFooterMutationPlan(
      plan.pages,
    ),
    binaryResources: availableBinaryResources,
    warnings: plan.warnings,
  };
}

export async function executeHeaderFooterTemplateMutation(
  baseBytes: Uint8Array,
  pageGraph: PageGraph<PageNode>,
  template: HeaderFooterTemplate,
  context: HeaderFooterResolutionContext,
  binaryResources: Readonly<Record<string, Uint8Array>> | undefined,
  signal?: AbortSignal,
  writer: HeaderFooterPdfWriter = pdfLibHeaderFooterWriter,
): Promise<ExecuteHeaderFooterTemplateMutationResult> {
  const prepared =
    prepareHeaderFooterTemplateMutation(
      pageGraph,
      template,
      context,
      binaryResources,
    );

  if (!prepared.ok) {
    return prepared;
  }

  if (!prepared.mutated) {
    return {
      ok: true,
      mutated: false,
      bytes: baseBytes,
      warnings: prepared.warnings,
    };
  }

  try {
    const written = await writer.write({
      baseBytes,
      pages: prepared.pages,
      binaryResources:
        prepared.binaryResources,
      signal,
    });

    return {
      ok: true,
      mutated: written.bytes !== baseBytes,
      bytes: written.bytes,
      warnings: [
        ...prepared.warnings,
        ...written.warnings,
      ],
    };
  } catch (error) {
    if (isOperationCancelledError(error)) {
      throw error;
    }

    return {
      ok: false,
      code: 'EXECUTION_FAILED',
      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
      warnings: prepared.warnings,
    };
  }
}
