import { executeMacroRecipe } from './executor';
import type { MacroRecipe } from './types';
import type { MacroResourceLimits } from './resourceBudget';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { buildPageGraphFromPdfBytes } from '@/core/pages/pageGraphAdmission';
import type { PageGraph, PageNode } from '@/core/pages/types';
import {
  materializePdfCommand,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { validateCommand } from '@/core/commands/validators';
import { executePageLabelCommandMutation } from '@/core/commands/pageLabelCommand';
import { macroValidator } from './validator';
import {
  assertMacroInputResources,
  inspectMacroRecipeBudget,
  parseMacroRecipeJson,
} from './resourceBudget';

export interface HeadlessMacroOptions {
  abortSignal?: AbortSignal;
  resourceLimits?: Partial<MacroResourceLimits>;
}

export interface HeadlessCommandOptions {
  abortSignal?: AbortSignal;
}

export interface HeadlessDocumentInspection {
  documentKey: string;
  pageGraph: PageGraph<PageNode>;
}

export type HeadlessSupportedPdfCommandDraft = Extract<
  PdfCommandDraft,
  { type: 'SET_PAGE_LABELS' }
>;

/**
 * Returns the PageGraph/PageIds that must be used when constructing a
 * PageId-anchored headless command for these exact input bytes.
 */
export async function inspectHeadlessPdfDocument(
  basePdfBytes: Uint8Array,
  options: HeadlessCommandOptions = {},
): Promise<HeadlessDocumentInspection> {
  const documentKey = await FileAdapter.hashBytes(basePdfBytes);
  const pageGraph = await buildPageGraphFromPdfBytes(
    basePdfBytes,
    documentKey,
    options.abortSignal,
  );
  return { documentKey, pageGraph };
}

/**
 * Executes the same canonical SET_PAGE_LABELS draft used by session/UI code.
 *
 * Call inspectHeadlessPdfDocument() first to obtain PageIds for the exact
 * source bytes. Re-inspect after a successful mutation because the byte hash
 * (documentKey) changes.
 */
export async function executeHeadlessPdfCommand(
  basePdfBytes: Uint8Array,
  draft: HeadlessSupportedPdfCommandDraft,
  options: HeadlessCommandOptions = {},
): Promise<Uint8Array> {
  const inspection = await inspectHeadlessPdfDocument(basePdfBytes, options);
  const command = materializePdfCommand(
    draft,
    'api',
    inspection.documentKey,
  );
  const validation = validateCommand(command);
  if (!validation.ok) {
    throw new Error(
      `Invalid headless PDF command: ${validation.errors.join(' ')}`,
    );
  }

  const mutation = await executePageLabelCommandMutation(
    basePdfBytes,
    inspection.pageGraph,
    command.payload.ranges,
    options.abortSignal,
  );
  if (!mutation.ok) {
    throw new Error(
      `Invalid PageLabel ranges: ${mutation.errors.join('; ')}`,
    );
  }

  return mutation.bytes;
}

export async function executeHeadlessMacro(
  basePdfBytes: Uint8Array,
  recipeDsl: string | MacroRecipe,
  fileName: string = 'headless.pdf',
  donorFiles: Record<string, Uint8Array> = {},
  options: HeadlessMacroOptions = {},
): Promise<Uint8Array> {
  const recipe = typeof recipeDsl === 'string'
    ? parseMacroRecipeJson(recipeDsl, options.resourceLimits)
    : recipeDsl;

  inspectMacroRecipeBudget(recipe, options.resourceLimits);
  assertMacroInputResources(basePdfBytes, donorFiles, options.resourceLimits);

  const validation = macroValidator.validate(recipe);
  if (!validation.valid) {
    const details = validation.errors
      .map((error) => `${error.field}: ${error.message}`)
      .join('; ');
    throw new Error(`Invalid Headless Macro DSL: ${details}`);
  }

  const pageCount = await PdfEditAdapter.countPages(basePdfBytes, {
    signal: options.abortSignal,
  });

  const result = await executeMacroRecipe(
    recipe,
    {
      workingBytes: basePdfBytes,
      pageCount,
      selectedPages: [],
      currentPage: 1,
      fileName,
      donorFiles,
      now: new Date(),
      options: {
        abortSignal: options.abortSignal,
        resourceLimits: options.resourceLimits,
      },
    },
  );

  if (!result.success) {
    throw new Error(result.logs.join('\n') || `Headless macro execution ${result.status}.`);
  }

  return result.finalBytes;
}

declare global {
  interface Window {
    PDFHubHeadless?: {
      execute: typeof executeHeadlessMacro;
      inspectDocument: typeof inspectHeadlessPdfDocument;
      executeCommand: typeof executeHeadlessPdfCommand;
    };
  }
}

if (typeof window !== 'undefined') {
  window.PDFHubHeadless = {
    execute: executeHeadlessMacro,
    inspectDocument: inspectHeadlessPdfDocument,
    executeCommand: executeHeadlessPdfCommand,
  };
}
