import type { MacroRecipe, MacroStep } from './types';

export class TemplateVarEngine {
  private readonly PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

  expand(value: string, vars: Record<string, string>): string {
    return value.replace(this.PATTERN, (match, key) => {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
    });
  }

  expandRecipe(recipe: MacroRecipe, vars: Record<string, string>): MacroRecipe {
    return {
      ...recipe,
      steps: recipe.steps.map((step) => this.expandStep(step, vars)),
    };
  }

  expandStep<T extends MacroStep>(step: T, vars: Record<string, string>): T {
    return this.expandUnknown(step, vars) as T;
  }

  private expandUnknown(value: unknown, vars: Record<string, string>): unknown {
    if (typeof value === 'string') {
      return this.expand(value, vars);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.expandUnknown(item, vars));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          this.expandUnknown(child, vars),
        ]),
      );
    }

    return value;
  }

  buildDefaultVars(ctx: {
    fileName?: string;
    pageCount?: number;
    now?: Date;
  }): Record<string, string> {
    const now = ctx.now ?? new Date();

    return {
      filename: ctx.fileName ?? 'document',
      file_name: ctx.fileName ?? 'document',
      page_count: String(ctx.pageCount ?? 0),
      date: now.toLocaleDateString(),
      datetime: now.toISOString(),
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, '0'),
      day: String(now.getDate()).padStart(2, '0'),
    };
  }
}

export const templateVarEngine = new TemplateVarEngine();