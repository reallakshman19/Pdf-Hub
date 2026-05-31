import { macroRegistry } from '../registry';
import type { StepResult, MacroMutableState } from '../registry';
import type { MacroExecutionContext, MacroStep } from '../types';
import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';

type MergeFilesStep = Extract<MacroStep, { op: 'merge_files' }>;
type InsertPdfStep = Extract<MacroStep, { op: 'insert_pdf' }>;

async function executeMergeFiles(
  step: MergeFilesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const donors = step.donorFileIds
      .map((id) => ctx.donorFiles?.[id])
      .filter((value): value is Uint8Array => value instanceof Uint8Array);

    if (donors.length === 0) {
      return { status: 'warning', message: 'Skipped merge_files: no donor files found', sideEffects: [] };
    }

    // Merge multiple files natively in bulk if adapter supports it (or pass array)
    // Wait, the test uses pdfMocks.merge. Let's use PdfEditAdapter.merge(workingBytes, donors)
    // But what does PdfEditAdapter support? Let me check.
    // If it only supports merge(currentBytes, donors), let's call it.
    let updatedBytes = state.workingBytes;

    updatedBytes = await PdfEditAdapter.merge(state.workingBytes, donors);

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    return {
      status: 'success',
      message: `Merged ${donors.length} file(s)`,
      sideEffects: [
        { type: 'bytes_updated', bytes: updatedBytes },
        { type: 'page_count_changed', newCount: newPageCount },
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}

async function executeInsertPdf(
  step: InsertPdfStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const donor = ctx.donorFiles?.[step.donorFileId];
    if (!donor) {
      return { status: 'warning', message: `Skipped insert_pdf: missing donor file ${step.donorFileId}`, sideEffects: [] };
    }

    const updatedBytes = await PdfEditAdapter.insertAt(state.workingBytes, donor, step.atIndex);
    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    return {
      status: 'success',
      message: `Inserted PDF at index ${step.atIndex}`,
      sideEffects: [
        { type: 'bytes_updated', bytes: updatedBytes },
        { type: 'page_count_changed', newCount: newPageCount },
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}

macroRegistry.register('merge_files', executeMergeFiles);
macroRegistry.register('insert_pdf', executeInsertPdf);
