import type { MacroStep, MacroExecutionContext } from './types';

export interface StepResult {
  status:     'success' | 'warning' | 'error';
  message?:   string;
  sideEffects: SideEffect[];
}

export type SideEffect =
  | { type: 'bytes_updated';      bytes: Uint8Array }
  | { type: 'output_file';        name: string; bytes: Uint8Array }
  | { type: 'page_count_changed'; newCount: number };

export interface MacroMutableState {
  workingBytes:  Uint8Array;
  pageCount:     number;
  selectedPages: number[];
  templateVars:  Record<string, string>;
  logs:          string[];
  outputFiles:   { name: string; bytes: Uint8Array }[];
}

export type StepExecutor<T extends MacroStep> = (
  step: T,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
) => Promise<StepResult>;

/**
 * Registry for macro step executors.
 * Owner: Agent A creates shell; Agent D populates all existing ops;
 *        Agent E adds new ops.
 */
export class MacroStepRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly executors = new Map<string, StepExecutor<any>>();

  register<T extends MacroStep>(
    op: T['op'],
    executor: StepExecutor<T>,
  ): void {
    if (this.executors.has(op)) {
      // console.warn(`[MacroRegistry] Re-registering op "${op}"`);
    }
    this.executors.set(op, executor);
  }

  /**
   * Throws if the op is not registered.
   * Executors must return StepResult — they must NOT throw.
   */
  async execute(
    step: MacroStep,
    ctx: MacroExecutionContext,
    state: MacroMutableState,
  ): Promise<StepResult> {
    const executor = this.executors.get(step.op);
    if (!executor) {
      throw new Error(
        `[MacroRegistry] No executor registered for op "${step.op}". ` +
        `Did you forget to import the relevant steps file in register-all.ts?`,
      );
    }
    return executor(step, ctx, state);
  }

  getRegisteredOps(): string[] {
    return Array.from(this.executors.keys());
  }
}

export const macroRegistry = new MacroStepRegistry();