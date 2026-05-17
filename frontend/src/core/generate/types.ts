/*
 * Generate / AI types.
 *
 * These definitions describe the structures passed between the
 * generate panel, the command planner and the command dispatcher.
 * They are intentionally lightweight; no actual AI integration
 * happens in preview mode.  Instead the plan produced by the
 * command planner contains a human‑readable explanation and an
 * array of commands to be executed via the command dispatcher.
 */

import type { PdfCommand } from '../commands/types';

export interface AiPlanValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface AiPlan {
  id: string;
  prompt: string;
  explanation: string;
  proposedCommands: PdfCommand[];
  validation: AiPlanValidation;
}