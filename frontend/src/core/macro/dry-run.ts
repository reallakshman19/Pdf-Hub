import type { MacroDryRunDiff, MacroDryRunReport, MacroRecipe } from './types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useWriterStore } from '@/core/writer/store';
import { useSessionStore } from '@/core/session/store';

export async function simulateMacroDryRun(
  recipe: MacroRecipe,
  ctx: { workingBytes?: Uint8Array; pageCount?: number; selectedPages?: number[]; fileName?: string },
): Promise<MacroDryRunReport> {
  const sessionState = useSessionStore.getState();
  const annotationState = useAnnotationStore.getState();
  const writerState = useWriterStore.getState();

  const initialPageCount = ctx.pageCount ?? sessionState.pageCount ?? 0;
  const initialSelectedPages = ctx.selectedPages ?? sessionState.selectedPages ?? [];
  void annotationState.annotations.length;
  const initialWriterElementCount = writerState.elements.length;
  void initialWriterElementCount;

  const errors: string[] = [];
  const warnings: string[] = [];
  const logs: string[] = [];
  const outputFiles: import('./types').MacroDryRunOutputFile[] = [];

  let finalPageCount = initialPageCount;
  let modifiedBytes = false;
  let finalSelectedPages = [...initialSelectedPages];
  let addedWriterElements = 0;

  const steps = recipe.steps ?? [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const op = step.op ?? 'unknown';
    logs.push(`Step ${i + 1}: ${op}`);

    try {
      if (op === 'insert_blank_page') {
        const s = step as Extract<typeof step, { op: 'insert_blank_page' }>;
        finalPageCount += s.count ?? 1;
        modifiedBytes = true;
        logs.push(`  → page count: ${finalPageCount}`);
      } else if (op === 'remove_pages') {
        finalPageCount = Math.max(1, finalPageCount - 1);
        modifiedBytes = true;
        logs.push(`  → page count: ${finalPageCount}`);
      } else if (op === 'duplicate_pages') {
        finalPageCount += 1;
        modifiedBytes = true;
        logs.push(`  → page count: ${finalPageCount}`);
      } else if (op === 'insert_pdf') {
        finalPageCount += 1;
        modifiedBytes = true;
        logs.push(`  → page count: ${finalPageCount}`);
      } else if (op === 'merge_files') {
        finalPageCount += 1;
        modifiedBytes = true;
        logs.push(`  → page count: ${finalPageCount}`);
      } else if (op === 'replace_page') {
        modifiedBytes = true;
        logs.push(`  → page replaced`);
      } else if (op === 'extract_pages') {
        const s = step as Extract<typeof step, { op: 'extract_pages' }>;
        const outName = s.outputName ?? `extract-${i + 1}.pdf`;
        outputFiles.push({ name: outName, reason: 'extract_pages' });
        logs.push(`  → output file: ${outName}`);
      } else if (op === 'split_pages') {
        const s = step as Extract<typeof step, { op: 'split_pages' }>;
        const outName = s.outputName ?? `split-part-${i + 1}.pdf`;
        outputFiles.push({ name: outName, reason: 'split_pages' });
        logs.push(`  → output file: ${outName}`);
      } else if (op === 'select_pages') {
        const s = step as Extract<typeof step, { op: 'select_pages' }>;
        if (s.selector.mode === 'list') {
          finalSelectedPages = s.selector.pages;
        }
        logs.push(`  → pages selected`);
      } else if (op === 'reorder_pages' || op === 'rotate_pages') {
        modifiedBytes = true;
        logs.push(`  → bytes modified`);
      } else if (
        op === 'draw_text_on_pages' ||
        op === 'inject_rich_text' ||
        op === 'header_footer_text'
      ) {
        modifiedBytes = true;
        logs.push(`  → text drawn on PDF bytes`);
      } else if (op === 'insert_image' || op === 'adjust_image') {
        modifiedBytes = true;
        logs.push(`  → image embedded in PDF bytes`);
      } else if (op === 'place_rich_textbox') {
        addedWriterElements += 1;
        logs.push(`  → +1 writer text element`);
      } else if (op === 'place_table') {
        addedWriterElements += 1;
        logs.push(`  → +1 writer table element`);
      } else if (op === 'add_content_page' || op === 'add_image_header_page') {
        finalPageCount += 1;
        modifiedBytes = true;
        logs.push(`  → page count: ${finalPageCount}`);
      } else if (op === 'conditional') {
        logs.push(`  → conditional branch (dry-run: evaluating always-true branch)`);
      } else if (op === 'apply_template_vars') {
        logs.push(`  → template vars applied`);
      } else {
        warnings.push(`Unknown step op: ${op} (step ${i + 1}) — skipped in dry-run`);
        logs.push(`  → unknown op, skipped`);
      }
    } catch (err) {
      errors.push(`Step ${i + 1} (${op}): ${String(err)}`);
      logs.push(`  → ERROR: ${String(err)}`);
    }
  }

  const diff: MacroDryRunDiff = {
    initialPageCount,
    finalPageCount,
    modifiedBytes,
    selectedPagesBefore: initialSelectedPages,
    selectedPagesAfter: finalSelectedPages,
    outputFiles,
    annotationChanges: { added: 0, updated: 0, deleted: 0 },
    writerChanges: { added: addedWriterElements, updated: 0, deleted: 0 },
    warnings,
    logs,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    diff,
  };
}
