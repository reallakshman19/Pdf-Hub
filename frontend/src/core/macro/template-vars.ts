import type { MacroRecipe, MacroStep } from './types';

/**
 * Template variable expansion engine.
 * Pattern: {{varName}}
 * Built-in vars: filename, page_count, date, page_number
 * Custom vars: passed via apply_template_vars step or executeMacroRecipe options.
 *
 * Owner: Agent A creates; Agent D calls expandRecipe in executor.ts pre-execution.
 * expandRecipe is PURE — returns a new recipe, never mutates the original.
 */
export class TemplateVarEngine {
  private readonly PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

  expand(value: string, vars: Record<string, string>): string {
    return value.replace(this.PATTERN, (match, key) => {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
    });
  }

  /**
   * Recursively expands all string fields in the recipe.
   * Returns a deep-cloned recipe with expanded values.
   */
  expandRecipe(recipe: MacroRecipe, vars: Record<string, string>): MacroRecipe {
    return {
      ...recipe,
      steps: recipe.steps.map(step => this.expandStep(step, vars)),
    };
  }

  private expandStep(step: MacroStep, vars: Record<string, string>): MacroStep {
    const expanded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(step)) {
      if (typeof value === 'string') {
        expanded[key] = this.expand(value, vars);
      } else if (Array.isArray(value)) {
        expanded[key] = value.map(item =>
          typeof item === 'string' ? this.expand(item, vars) :
          typeof item === 'object' && item !== null ? this.expandStep(item as MacroStep, vars) :
          item
        );
      } else {
        expanded[key] = value;
      }
    }
    return expanded as MacroStep;
  }

  buildDefaultVars(ctx: { fileName?: string; pageCount?: number }): Record<string, string> {
    const now = new Date();
    return {
      filename:    ctx.fileName ?? 'document',
      page_count:  String(ctx.pageCount ?? 0),
      date:        now.toLocaleDateString(),
      datetime:    now.toISOString(),
      year:        String(now.getFullYear()),
      month:       String(now.getMonth() + 1).padStart(2, '0'),
      day:         String(now.getDate()).padStart(2, '0'),
    };
  }
}

export const templateVarEngine = new TemplateVarEngine();