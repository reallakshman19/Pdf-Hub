/*
 * Command planner for AI Generate mode.
 *
 * In preview mode the command planner does not invoke any real AI
 * services.  Instead it returns a trivial plan containing an
 * explanation and an empty list of commands.  This allows the
 * generate panel to demonstrate the user flow without mutating
 * documents.
 */

import type { AiPlan } from './types';
import type { PdfCommand } from '../commands/types';

function makeId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function planCommands(prompt: string): AiPlan {
  const explanation =
    prompt.trim().length === 0
      ? 'No prompt provided; nothing to do.'
      : `No commands generated for the prompt: "${prompt}". AI integration is disabled in preview mode.`;
  const proposedCommands: PdfCommand[] = [];
  const validation = { ok: true, errors: [], warnings: [] };
  return {
    id: makeId(),
    prompt,
    explanation,
    proposedCommands,
    validation,
  };
}