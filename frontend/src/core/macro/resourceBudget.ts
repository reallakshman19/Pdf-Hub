import type { MacroMutableState, SideEffect } from './registry';
import type { MacroExecutionContext, MacroRecipe, MacroStep } from './types';
import { raceWithAbort, throwIfAborted } from '@/core/cancellation/operationCancellation';

export interface MacroResourceLimits {
  maxRecipeJsonBytes: number;
  maxStoredRecipeJsonBytes: number;
  maxRecipeNodes: number;
  maxRecipeDepth: number;
  maxRecipeSteps: number;
  maxConditionalDepth: number;
  maxStringBytes: number;
  maxEmbeddedDataBytes: number;
  maxInputPdfBytes: number;
  maxDonorFiles: number;
  maxDonorBytes: number;
  maxExecutionMs: number;
  maxExecutedSteps: number;
  maxWorkingPdfBytes: number;
  maxOutputFiles: number;
  maxOutputBytes: number;
}

export const DEFAULT_MACRO_RESOURCE_LIMITS: MacroResourceLimits = Object.freeze({
  maxRecipeJsonBytes: 1 * 1024 * 1024,
  maxStoredRecipeJsonBytes: 4 * 1024 * 1024,
  maxRecipeNodes: 20_000,
  maxRecipeDepth: 48,
  maxRecipeSteps: 256,
  maxConditionalDepth: 12,
  maxStringBytes: 256 * 1024,
  maxEmbeddedDataBytes: 20 * 1024 * 1024,
  maxInputPdfBytes: 256 * 1024 * 1024,
  maxDonorFiles: 32,
  maxDonorBytes: 512 * 1024 * 1024,
  maxExecutionMs: 120_000,
  maxExecutedSteps: 256,
  maxWorkingPdfBytes: 512 * 1024 * 1024,
  maxOutputFiles: 64,
  maxOutputBytes: 512 * 1024 * 1024,
});

export type MacroResourceLimitCode =
  | 'MACRO_JSON_BYTES_EXCEEDED'
  | 'MACRO_RECIPE_NODES_EXCEEDED'
  | 'MACRO_RECIPE_DEPTH_EXCEEDED'
  | 'MACRO_RECIPE_STEPS_EXCEEDED'
  | 'MACRO_CONDITIONAL_DEPTH_EXCEEDED'
  | 'MACRO_STRING_BYTES_EXCEEDED'
  | 'MACRO_EMBEDDED_DATA_EXCEEDED'
  | 'MACRO_INPUT_PDF_BYTES_EXCEEDED'
  | 'MACRO_DONOR_FILES_EXCEEDED'
  | 'MACRO_DONOR_BYTES_EXCEEDED'
  | 'MACRO_EXECUTION_TIMEOUT'
  | 'MACRO_EXECUTED_STEPS_EXCEEDED'
  | 'MACRO_WORKING_PDF_BYTES_EXCEEDED'
  | 'MACRO_OUTPUT_FILES_EXCEEDED'
  | 'MACRO_OUTPUT_BYTES_EXCEEDED'
  | 'MACRO_EXECUTION_ABORTED'
  | 'MACRO_CYCLIC_VALUE';

export class MacroResourceLimitError extends Error {
  readonly code: MacroResourceLimitCode;
  readonly actual?: number;
  readonly limit?: number;

  constructor(
    code: MacroResourceLimitCode,
    message: string,
    details: { actual?: number; limit?: number } = {},
  ) {
    super(message);
    this.name = 'MacroResourceLimitError';
    this.code = code;
    this.actual = details.actual;
    this.limit = details.limit;
  }
}

export interface MacroRecipeBudgetReport {
  nodes: number;
  maximumDepth: number;
  steps: number;
  maximumConditionalDepth: number;
  embeddedDataBytes: number;
}

export interface BoundedJsonOptions {
  maxBytes?: number;
  label?: string;
}

const textEncoder = new TextEncoder();

function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

export function resolveMacroResourceLimits(
  overrides: Partial<MacroResourceLimits> = {},
): MacroResourceLimits {
  const defaults = DEFAULT_MACRO_RESOURCE_LIMITS;
  return {
    maxRecipeJsonBytes: positiveInteger(overrides.maxRecipeJsonBytes ?? defaults.maxRecipeJsonBytes, defaults.maxRecipeJsonBytes),
    maxStoredRecipeJsonBytes: positiveInteger(overrides.maxStoredRecipeJsonBytes ?? defaults.maxStoredRecipeJsonBytes, defaults.maxStoredRecipeJsonBytes),
    maxRecipeNodes: positiveInteger(overrides.maxRecipeNodes ?? defaults.maxRecipeNodes, defaults.maxRecipeNodes),
    maxRecipeDepth: positiveInteger(overrides.maxRecipeDepth ?? defaults.maxRecipeDepth, defaults.maxRecipeDepth),
    maxRecipeSteps: positiveInteger(overrides.maxRecipeSteps ?? defaults.maxRecipeSteps, defaults.maxRecipeSteps),
    maxConditionalDepth: positiveInteger(overrides.maxConditionalDepth ?? defaults.maxConditionalDepth, defaults.maxConditionalDepth),
    maxStringBytes: positiveInteger(overrides.maxStringBytes ?? defaults.maxStringBytes, defaults.maxStringBytes),
    maxEmbeddedDataBytes: positiveInteger(overrides.maxEmbeddedDataBytes ?? defaults.maxEmbeddedDataBytes, defaults.maxEmbeddedDataBytes),
    maxInputPdfBytes: positiveInteger(overrides.maxInputPdfBytes ?? defaults.maxInputPdfBytes, defaults.maxInputPdfBytes),
    maxDonorFiles: positiveInteger(overrides.maxDonorFiles ?? defaults.maxDonorFiles, defaults.maxDonorFiles),
    maxDonorBytes: positiveInteger(overrides.maxDonorBytes ?? defaults.maxDonorBytes, defaults.maxDonorBytes),
    maxExecutionMs: positiveInteger(overrides.maxExecutionMs ?? defaults.maxExecutionMs, defaults.maxExecutionMs),
    maxExecutedSteps: positiveInteger(overrides.maxExecutedSteps ?? defaults.maxExecutedSteps, defaults.maxExecutedSteps),
    maxWorkingPdfBytes: positiveInteger(overrides.maxWorkingPdfBytes ?? defaults.maxWorkingPdfBytes, defaults.maxWorkingPdfBytes),
    maxOutputFiles: positiveInteger(overrides.maxOutputFiles ?? defaults.maxOutputFiles, defaults.maxOutputFiles),
    maxOutputBytes: positiveInteger(overrides.maxOutputBytes ?? defaults.maxOutputBytes, defaults.maxOutputBytes),
  };
}

export function assertJsonTextWithinBudget(
  raw: string,
  maxBytes: number,
  label = 'Macro JSON',
): void {
  const actual = byteLength(raw);
  if (actual > maxBytes) {
    throw new MacroResourceLimitError(
      'MACRO_JSON_BYTES_EXCEEDED',
      `${label} is ${actual} bytes; the limit is ${maxBytes} bytes.`,
      { actual, limit: maxBytes },
    );
  }
}

export function parseBoundedJson(
  raw: string,
  options: BoundedJsonOptions = {},
): unknown {
  const maxBytes = options.maxBytes ?? DEFAULT_MACRO_RESOURCE_LIMITS.maxRecipeJsonBytes;
  assertJsonTextWithinBudget(raw, maxBytes, options.label);

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Invalid ${options.label ?? 'macro JSON'}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function parseMacroRecipeJson(
  raw: string,
  overrides: Partial<MacroResourceLimits> = {},
): MacroRecipe {
  const limits = resolveMacroResourceLimits(overrides);
  const parsed = parseBoundedJson(raw, {
    maxBytes: limits.maxRecipeJsonBytes,
    label: 'macro recipe JSON',
  });

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid macro recipe JSON: root value must be an object.');
  }

  inspectMacroRecipeBudget(parsed, limits);
  return parsed as MacroRecipe;
}

function isEmbeddedDataValue(key: string | null, value: string): boolean {
  return key === 'base64Image' || key === 'imageSrc' || /^data:/i.test(value.trim());
}

function estimateEmbeddedDataBytes(value: string): number {
  const trimmed = value.trim();
  const comma = trimmed.indexOf(',');
  if (!/^data:/i.test(trimmed) || comma < 0) {
    return byteLength(trimmed);
  }

  const metadata = trimmed.slice(0, comma).toLowerCase();
  const payload = trimmed.slice(comma + 1);
  if (metadata.includes(';base64')) {
    const normalizedLength = payload.replace(/\s+/g, '').length;
    return Math.floor((normalizedLength * 3) / 4);
  }
  return byteLength(payload);
}

export function inspectMacroRecipeBudget(
  recipe: unknown,
  overrides: Partial<MacroResourceLimits> | MacroResourceLimits = {},
): MacroRecipeBudgetReport {
  const limits = resolveMacroResourceLimits(overrides);
  const seen = new Set<object>();
  const stack: Array<{ value: unknown; depth: number; key: string | null }> = [
    { value: recipe, depth: 0, key: null },
  ];
  let nodes = 0;
  let maximumDepth = 0;
  let embeddedDataBytes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    nodes += 1;
    if (nodes > limits.maxRecipeNodes) {
      throw new MacroResourceLimitError(
        'MACRO_RECIPE_NODES_EXCEEDED',
        `Macro recipe contains more than ${limits.maxRecipeNodes} values.`,
        { actual: nodes, limit: limits.maxRecipeNodes },
      );
    }

    maximumDepth = Math.max(maximumDepth, current.depth);
    if (current.depth > limits.maxRecipeDepth) {
      throw new MacroResourceLimitError(
        'MACRO_RECIPE_DEPTH_EXCEEDED',
        `Macro recipe nesting depth exceeds ${limits.maxRecipeDepth}.`,
        { actual: current.depth, limit: limits.maxRecipeDepth },
      );
    }

    if (typeof current.value === 'string') {
      if (isEmbeddedDataValue(current.key, current.value)) {
        embeddedDataBytes += estimateEmbeddedDataBytes(current.value);
        if (embeddedDataBytes > limits.maxEmbeddedDataBytes) {
          throw new MacroResourceLimitError(
            'MACRO_EMBEDDED_DATA_EXCEEDED',
            `Embedded macro data exceeds ${limits.maxEmbeddedDataBytes} bytes.`,
            { actual: embeddedDataBytes, limit: limits.maxEmbeddedDataBytes },
          );
        }
      } else {
        const actual = byteLength(current.value);
        if (actual > limits.maxStringBytes) {
          throw new MacroResourceLimitError(
            'MACRO_STRING_BYTES_EXCEEDED',
            `Macro string field exceeds ${limits.maxStringBytes} bytes.`,
            { actual, limit: limits.maxStringBytes },
          );
        }
      }
      continue;
    }

    if (!current.value || typeof current.value !== 'object') continue;

    if (seen.has(current.value)) {
      throw new MacroResourceLimitError(
        'MACRO_CYCLIC_VALUE',
        'Macro recipe contains a cyclic object graph.',
      );
    }
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], depth: current.depth + 1, key: current.key });
      }
      continue;
    }

    for (const [key, value] of Object.entries(current.value)) {
      stack.push({ value, depth: current.depth + 1, key });
    }
  }

  const stepReport = inspectStepTree(recipe, limits);
  return {
    nodes,
    maximumDepth,
    steps: stepReport.steps,
    maximumConditionalDepth: stepReport.maximumConditionalDepth,
    embeddedDataBytes,
  };
}

function inspectStepTree(
  recipe: unknown,
  limits: MacroResourceLimits,
): { steps: number; maximumConditionalDepth: number } {
  const rootSteps = (recipe as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(rootSteps)) {
    return { steps: 0, maximumConditionalDepth: 0 };
  }

  const stack: Array<{ steps: unknown[]; conditionalDepth: number }> = [
    { steps: rootSteps, conditionalDepth: 0 },
  ];
  let steps = 0;
  let maximumConditionalDepth = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    for (const value of current.steps) {
      steps += 1;
      if (steps > limits.maxRecipeSteps) {
        throw new MacroResourceLimitError(
          'MACRO_RECIPE_STEPS_EXCEEDED',
          `Macro recipe contains more than ${limits.maxRecipeSteps} total steps.`,
          { actual: steps, limit: limits.maxRecipeSteps },
        );
      }

      if (!value || typeof value !== 'object' || (value as { op?: unknown }).op !== 'conditional') {
        continue;
      }

      const nextDepth = current.conditionalDepth + 1;
      maximumConditionalDepth = Math.max(maximumConditionalDepth, nextDepth);
      if (nextDepth > limits.maxConditionalDepth) {
        throw new MacroResourceLimitError(
          'MACRO_CONDITIONAL_DEPTH_EXCEEDED',
          `Macro conditional nesting exceeds ${limits.maxConditionalDepth}.`,
          { actual: nextDepth, limit: limits.maxConditionalDepth },
        );
      }

      const conditional = value as { then?: unknown; else?: unknown };
      if (Array.isArray(conditional.else)) {
        stack.push({ steps: conditional.else, conditionalDepth: nextDepth });
      }
      if (Array.isArray(conditional.then)) {
        stack.push({ steps: conditional.then, conditionalDepth: nextDepth });
      }
    }
  }

  return { steps, maximumConditionalDepth };
}

export function assertMacroInputResources(
  workingBytes: Uint8Array,
  donorFiles: Record<string, Uint8Array> = {},
  overrides: Partial<MacroResourceLimits> | MacroResourceLimits = {},
): void {
  const limits = resolveMacroResourceLimits(overrides);
  if (workingBytes.byteLength > limits.maxInputPdfBytes) {
    throw new MacroResourceLimitError(
      'MACRO_INPUT_PDF_BYTES_EXCEEDED',
      `Input PDF is ${workingBytes.byteLength} bytes; the limit is ${limits.maxInputPdfBytes} bytes.`,
      { actual: workingBytes.byteLength, limit: limits.maxInputPdfBytes },
    );
  }

  const donors = Object.values(donorFiles);
  if (donors.length > limits.maxDonorFiles) {
    throw new MacroResourceLimitError(
      'MACRO_DONOR_FILES_EXCEEDED',
      `Macro provides ${donors.length} donor files; the limit is ${limits.maxDonorFiles}.`,
      { actual: donors.length, limit: limits.maxDonorFiles },
    );
  }

  const donorBytes = donors.reduce((total, bytes) => total + bytes.byteLength, 0);
  if (donorBytes > limits.maxDonorBytes) {
    throw new MacroResourceLimitError(
      'MACRO_DONOR_BYTES_EXCEEDED',
      `Donor PDFs total ${donorBytes} bytes; the limit is ${limits.maxDonorBytes} bytes.`,
      { actual: donorBytes, limit: limits.maxDonorBytes },
    );
  }
}

export class MacroExecutionBudget {
  readonly limits: MacroResourceLimits;
  private readonly startedAt: number;
  private readonly abortSignal?: AbortSignal;
  private executedSteps = 0;

  constructor(
    overrides: Partial<MacroResourceLimits> | MacroResourceLimits = {},
    abortSignal?: AbortSignal,
  ) {
    this.limits = resolveMacroResourceLimits(overrides);
    this.abortSignal = abortSignal;
    this.startedAt = Date.now();
  }

  checkpoint(operation: string): void {
    throwIfAborted(this.abortSignal, operation);
    this.remainingMs();
  }

  beforeStep(step: Pick<MacroStep, 'op'> | string): void {
    this.checkpoint(typeof step === 'string' ? step : step.op);
    this.executedSteps += 1;
    if (this.executedSteps > this.limits.maxExecutedSteps) {
      throw new MacroResourceLimitError(
        'MACRO_EXECUTED_STEPS_EXCEEDED',
        `Macro executed more than ${this.limits.maxExecutedSteps} steps.`,
        { actual: this.executedSteps, limit: this.limits.maxExecutedSteps },
      );
    }
  }

  async run<T>(
    operationPromise: Promise<T>,
    operation: string,
    onInterrupt?: () => void,
  ): Promise<T> {
    this.checkpoint(operation);
    const remainingMs = this.remainingMs();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        onInterrupt?.();
        reject(new MacroResourceLimitError(
          'MACRO_EXECUTION_TIMEOUT',
          `Macro execution exceeded ${this.limits.maxExecutionMs} ms while running ${operation}.`,
          { actual: Date.now() - this.startedAt, limit: this.limits.maxExecutionMs },
        ));
      }, remainingMs);
    });

    const abortableOperation = raceWithAbort(
      operationPromise,
      this.abortSignal,
      operation,
      onInterrupt,
    );
    void abortableOperation.catch(() => undefined);
    try {
      return await Promise.race([abortableOperation, timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  afterStep(state: MacroMutableState, pendingSideEffects: readonly SideEffect[] = []): void {
    this.checkpoint('post-step resource check');

    let workingPdfBytes = state.workingBytes.byteLength;
    let outputFiles = state.outputFiles.length;
    let outputBytes = state.outputFiles.reduce((total, output) => total + output.bytes.byteLength, 0);

    for (const effect of pendingSideEffects) {
      if (effect.type === 'bytes_updated') workingPdfBytes = effect.bytes.byteLength;
      if (effect.type === 'output_file') {
        outputFiles += 1;
        outputBytes += effect.bytes.byteLength;
      }
    }

    if (workingPdfBytes > this.limits.maxWorkingPdfBytes) {
      throw new MacroResourceLimitError(
        'MACRO_WORKING_PDF_BYTES_EXCEEDED',
        `Macro working PDF is ${workingPdfBytes} bytes; the limit is ${this.limits.maxWorkingPdfBytes} bytes.`,
        { actual: workingPdfBytes, limit: this.limits.maxWorkingPdfBytes },
      );
    }
    if (outputFiles > this.limits.maxOutputFiles) {
      throw new MacroResourceLimitError(
        'MACRO_OUTPUT_FILES_EXCEEDED',
        `Macro produced more than ${this.limits.maxOutputFiles} output files.`,
        { actual: outputFiles, limit: this.limits.maxOutputFiles },
      );
    }
    if (outputBytes > this.limits.maxOutputBytes) {
      throw new MacroResourceLimitError(
        'MACRO_OUTPUT_BYTES_EXCEEDED',
        `Macro outputs total ${outputBytes} bytes; the limit is ${this.limits.maxOutputBytes} bytes.`,
        { actual: outputBytes, limit: this.limits.maxOutputBytes },
      );
    }
  }

  private remainingMs(): number {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= this.limits.maxExecutionMs) {
      throw new MacroResourceLimitError(
        'MACRO_EXECUTION_TIMEOUT',
        `Macro execution exceeded ${this.limits.maxExecutionMs} ms.`,
        { actual: elapsed, limit: this.limits.maxExecutionMs },
      );
    }
    return Math.max(1, this.limits.maxExecutionMs - elapsed);
  }
}

export function getMacroExecutionBudget(
  context: MacroExecutionContext,
): MacroExecutionBudget | undefined {
  return context.options?.__runtimeBudget;
}
