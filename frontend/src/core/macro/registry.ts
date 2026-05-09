import type {
  MacroExecutionContext,
  MacroStep,
} from './types';

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
  outputFiles: Array<{ name: string; bytes: Uint8Array }>;
  logs: string[];
  templateVars: Record<string, string>;
}

/**
 * Contract bridge fix:
 * Some step files return StepResult synchronously.
 * Some future/pdf-lib-backed steps return Promise<StepResult>.
 * The registry must support BOTH.
 */
export type MacroStepExecutor<TStep extends MacroStep = MacroStep> = (
  step: TStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
) => StepResult | Promise<StepResult>;

export class MacroRegistry {
  private readonly executors = new Map<MacroStep['op'], MacroStepExecutor>();

  register<TStep extends MacroStep>(
    op: TStep['op'],
    executor: MacroStepExecutor<TStep>,
  ): void {
    this.executors.set(op, executor as MacroStepExecutor);
  }

  has(op: string): boolean {
    return this.executors.has(op as MacroStep['op']);
  }

  listOps(): MacroStep['op'][] {
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
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        sideEffects: [],
      };
    }
  }
}

export const macroRegistry = new MacroRegistry();
