/*
 * Diff preview generator for AI generated command plans.
 *
 * In preview mode we do not compute real diffs.  This module
 * synthesises a human‑readable summary of the commands that would be
 * executed if the plan were confirmed.  A more sophisticated
 * implementation could inspect the current document state and
 * provide a visual or textual diff.
 */

import type { PdfCommand } from '../commands/types';

export interface DiffPreview {
  summary: string;
}

export function generateDiffPreview(commands: PdfCommand[]): DiffPreview {
  if (commands.length === 0) {
    return { summary: 'There are no proposed changes.' };
  }
  return {
    summary: `${commands.length} command(s) will be applied when you confirm.`,
  };
}