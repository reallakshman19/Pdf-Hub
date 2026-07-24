import type { MacroStep, MacroExecutionContext } from './types';
import { OperationCancelledError } from '@/core/cancellation/operationCancellation';
import { MacroResourceLimitError } from './resourceBudget';

export type SideEffect =
  | { type: 'bytes_updated'; bytes: Uint8Array }
  | { type: 'output_file'; name: string; bytes: Uint8Array }
  | { type: 'page_count_changed'; newCount: number }
  | { type: 'selection_changed'; selectedPages: number[] }
  | { type: 'log'; message: string };

export interface StepResult {
  status: 'success' | 'warning' | 'error';
  message?: string;
  sideEffects: SideEffect[];
}

export interface MacroMutableState {
  workingBytes: Uint8Array;
  pageCount: number;
  selectedPages: number[];
  templateVars: Record<string, string>;
  logs: string[];
  outputFiles: { name: string; bytes: Uint8Array }[];
}

export type StepExecutor<T extends MacroStep = MacroStep> = (
  step: T,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
) => StepResult | Promise<StepResult>;

export class MacroStepRegistry {
  private readonly executors = new Map<string, StepExecutor>();

  register<T extends MacroStep>(
    op: T['op'],
    executor: StepExecutor<T>,
    options?: { override?: boolean },
  ): void {
    if (this.executors.has(op) && !options?.override) {
      throw new Error(
        `[MacroRegistry] Duplicate registration for op "${op}". ` +
        'Pass { override: true } if intentional. ' +
        'Check register-all.ts import order.',
      );
    }

    this.executors.set(op, executor as StepExecutor);
  }

  has(op: string): boolean {
    return this.executors.has(op);
  }

  getRegisteredOps(): string[] {
    return Array.from(this.executors.keys());
  }

  async execute(
    step: MacroStep,
    ctx: MacroExecutionContext,
    state: MacroMutableState,
  ): Promise<StepResult> {
    const executor = this.executors.get(step.op);

    if (!executor) {
      return {
        status: 'error',
        message:
          `[MacroRegistry] No executor registered for op "${step.op}". ` +
          'Did you forget to import the relevant steps file in register-all.ts?',
        sideEffects: [],
      };
    }

    try {
      return await executor(step, ctx, state);
    } catch (err) {
      if (err instanceof OperationCancelledError || err instanceof MacroResourceLimitError) {
        throw err;
      }
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        sideEffects: [],
      };
    }
  }
}

export const macroRegistry = new MacroStepRegistry();
