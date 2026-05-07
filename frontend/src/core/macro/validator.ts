import type { MacroRecipe, MacroStep } from './types';
import { macroRegistry } from './registry';

export interface ValidationError {
  stepIndex: number;
  op:        string;
  field:     string;
  message:   string;
}

export interface ValidationResult {
  valid:  boolean;
  errors: ValidationError[];
}

/**
 * Validates a MacroRecipe before execution.
 * Owner: Agent A creates; Agent D wires into executor.ts.
 * Validation is synchronous and has no side effects.
 */
export class MacroValidator {
  validate(recipe: MacroRecipe): ValidationResult {
    const errors: ValidationError[] = [];

    recipe.steps.forEach((step, idx) => {
      this.validateStep(step, idx, errors);
    });

    return { valid: errors.length === 0, errors };
  }

  private validateStep(step: MacroStep, idx: number, errors: ValidationError[]): void {
    // 1. Op must be registered
    if (!macroRegistry.getRegisteredOps().includes(step.op)) {
      errors.push({
        stepIndex: idx,
        op: step.op,
        field: 'op',
        message: `Unknown op "${step.op}". Not registered in macroRegistry.`,
      });
      return; // Can't validate further without a known op
    }

    // 2. Page-targeting steps must have a selector
    const pageSelectorOps = [
      'rotate_pages', 'extract_pages', 'remove_pages', 'header_footer_text',
      'draw_text_on_pages', 'inject_rich_text', 'insert_image',
      'place_rich_textbox', 'place_table', 'adjust_image', 'add_content_page',
    ];
    if (pageSelectorOps.includes(step.op)) {
      const s = step as MacroStep & { selector?: unknown };
      if (!s.selector) {
        errors.push({ stepIndex: idx, op: step.op, field: 'selector', message: 'selector is required' });
      }
    }

    // 3. Coordinate steps must have x, y, width
    const coordinateOps = ['place_rich_textbox', 'place_table', 'adjust_image'];
    if (coordinateOps.includes(step.op)) {
      const s = step as MacroStep & { x?: number; y?: number; width?: number };
      if (typeof s.x !== 'number') errors.push({ stepIndex: idx, op: step.op, field: 'x', message: 'x must be a number' });
      if (typeof s.y !== 'number') errors.push({ stepIndex: idx, op: step.op, field: 'y', message: 'y must be a number' });
      if (typeof s.width !== 'number') errors.push({ stepIndex: idx, op: step.op, field: 'width', message: 'width must be a number' });
    }

    // 4. Conditional must have a condition and a non-empty then array
    if (step.op === 'conditional') {
      const s = step as MacroStep & { condition?: unknown; then?: MacroStep[] };
      if (!s.condition) errors.push({ stepIndex: idx, op: step.op, field: 'condition', message: 'condition is required' });
      if (!s.then?.length) errors.push({ stepIndex: idx, op: step.op, field: 'then', message: 'then must have at least one step' });
    }
  }
}

export const macroValidator = new MacroValidator();