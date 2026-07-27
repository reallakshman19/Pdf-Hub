import type {
  InsertPosition,
  MacroCondition,
  MacroRecipe,
  MacroStep,
  PageSelector,
} from './types';

export interface ValidationError {
  stepIndex: number;
  op: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const KNOWN_MACRO_OPS = new Set<MacroStep['op']>([
  'add_content_page',
  'add_image_header_page',
  'select_pages',
  'merge_files',
  'insert_pdf',
  'extract_pages',
  'split_pages',
  'duplicate_pages',
  'rotate_pages',
  'remove_pages',
  'insert_blank_page',
  'replace_page',
  'reorder_pages',
  'draw_text_on_pages',
  'header_footer_text',
  'insert_image',
  'inject_rich_text',
  'place_rich_textbox',
  'place_professional_callout',
  'place_table',
  'adjust_image',
  'draw_redaction_box',
  'conditional',
  'apply_template_vars',
]);

const REQUIRED_SELECTOR_OPS = new Set<MacroStep['op']>([
  'select_pages',
  'rotate_pages',
  'extract_pages',
  'split_pages',
  'duplicate_pages',
  'remove_pages',
  'draw_text_on_pages',
  'header_footer_text',
  'insert_image',
  'inject_rich_text',
  'draw_redaction_box',
]);

const OPTIONAL_SELECTOR_OPS = new Set<MacroStep['op']>([
  'place_rich_textbox',
  'place_professional_callout',
  'place_table',
  'adjust_image',
]);

export class MacroValidator {
  validate(recipe: MacroRecipe): ValidationResult {
    const errors: ValidationError[] = [];

    if (!recipe || typeof recipe !== 'object') {
      return {
        valid: false,
        errors: [
          {
            stepIndex: -1,
            op: 'recipe',
            field: 'recipe',
            message: 'Recipe must be an object.',
          },
        ],
      };
    }

    if (!recipe.id || typeof recipe.id !== 'string') {
      errors.push({
        stepIndex: -1,
        op: 'recipe',
        field: 'id',
        message: 'Recipe id is required.',
      });
    }

    if (!recipe.name || typeof recipe.name !== 'string' || recipe.name.trim().length === 0) {
      errors.push({
        stepIndex: -1,
        op: 'recipe',
        field: 'name',
        message: 'Recipe name is required.',
      });
    }

    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
      errors.push({
        stepIndex: -1,
        op: 'recipe',
        field: 'steps',
        message: 'Recipe must contain at least one step.',
      });

      return {
        valid: errors.length === 0,
        errors,
      };
    }

    recipe.steps.forEach((step, index) => {
      this.validateStep(step, index, errors, `steps.${index}`);
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateStep(
    step: MacroStep,
    stepIndex: number,
    errors: ValidationError[],
    path: string,
  ): void {
    const op = String((step as { op?: unknown }).op ?? 'unknown');

    if (!KNOWN_MACRO_OPS.has(op as MacroStep['op'])) {
      errors.push({
        stepIndex,
        op,
        field: `${path}.op`,
        message: `Unknown op "${op}".`,
      });
      return;
    }

    if (REQUIRED_SELECTOR_OPS.has(step.op)) {
      const selector = (step as MacroStep & { selector?: unknown }).selector;

      if (!selector) {
        errors.push({
          stepIndex,
          op: step.op,
          field: `${path}.selector`,
          message: 'selector is required.',
        });
      } else {
        validatePageSelector(selector, stepIndex, step.op, `${path}.selector`, errors);
      }
    }

    if (OPTIONAL_SELECTOR_OPS.has(step.op)) {
      const selector = (step as MacroStep & { selector?: unknown }).selector;

      if (selector) {
        validatePageSelector(selector, stepIndex, step.op, `${path}.selector`, errors);
      }
    }

    switch (step.op) {
      case 'select_pages':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        break;

      case 'rotate_pages':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        if (![90, 180, 270].includes(step.degrees)) {
          pushError(errors, stepIndex, step.op, `${path}.degrees`, 'degrees must be 90, 180, or 270.');
        }
        break;

      case 'extract_pages':
      case 'split_pages':
      case 'duplicate_pages':
      case 'remove_pages':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        break;

      case 'insert_blank_page':
        validateInsertPosition(step.position, stepIndex, step.op, `${path}.position`, errors);
        validateBlankPageSize(step.size, stepIndex, step.op, `${path}.size`, errors);
        if (step.count !== undefined && (!Number.isInteger(step.count) || step.count < 1)) {
          pushError(errors, stepIndex, step.op, `${path}.count`, 'count must be an integer >= 1.');
        }
        break;

      case 'replace_page':
        if (!Number.isInteger(step.targetPage) || step.targetPage < 1) {
          pushError(errors, stepIndex, step.op, `${path}.targetPage`, 'targetPage must be an integer >= 1.');
        }
        if (!step.donorFileId || typeof step.donorFileId !== 'string') {
          pushError(errors, stepIndex, step.op, `${path}.donorFileId`, 'donorFileId is required.');
        }
        if (!Number.isInteger(step.donorPage) || step.donorPage < 1) {
          pushError(errors, stepIndex, step.op, `${path}.donorPage`, 'donorPage must be an integer >= 1.');
        }
        break;

      case 'reorder_pages':
        validateReorder(step.order, stepIndex, step.op, `${path}.order`, errors);
        break;

      case 'draw_text_on_pages':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateText(step.text, stepIndex, step.op, `${path}.text`, errors);
        validateFiniteNumber(step.x, stepIndex, step.op, `${path}.x`, errors);
        validateFiniteNumber(step.y, stepIndex, step.op, `${path}.y`, errors);
        validatePositiveNumber(step.fontSize, stepIndex, step.op, `${path}.fontSize`, errors);
        validateOpacity(step.opacity, stepIndex, step.op, `${path}.opacity`, errors);
        break;

      case 'header_footer_text':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateText(step.text, stepIndex, step.op, `${path}.text`, errors);
        validateEnum(step.zone, ['header', 'footer'], stepIndex, step.op, `${path}.zone`, errors);
        validateEnum(step.align, ['left', 'center', 'right'], stepIndex, step.op, `${path}.align`, errors);
        validateFiniteNumber(step.marginX, stepIndex, step.op, `${path}.marginX`, errors);
        validateFiniteNumber(step.marginY, stepIndex, step.op, `${path}.marginY`, errors);
        validatePositiveNumber(step.fontSize, stepIndex, step.op, `${path}.fontSize`, errors);
        validateOpacity(step.opacity, stepIndex, step.op, `${path}.opacity`, errors);
        break;

      case 'insert_image':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateFiniteNumber(step.x, stepIndex, step.op, `${path}.x`, errors);
        validateFiniteNumber(step.y, stepIndex, step.op, `${path}.y`, errors);
        if (step.width !== undefined) validatePositiveNumber(step.width, stepIndex, step.op, `${path}.width`, errors);
        if (step.height !== undefined) validatePositiveNumber(step.height, stepIndex, step.op, `${path}.height`, errors);
        if (step.scale !== undefined) validatePositiveNumber(step.scale, stepIndex, step.op, `${path}.scale`, errors);
        validateImageSource(step.base64Image, step.donorFileId, stepIndex, step.op, path, errors);
        break;

      case 'inject_rich_text':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateText(step.text, stepIndex, step.op, `${path}.text`, errors);
        validateFiniteNumber(step.x, stepIndex, step.op, `${path}.x`, errors);
        validateFiniteNumber(step.y, stepIndex, step.op, `${path}.y`, errors);
        validatePositiveNumber(step.fontSize, stepIndex, step.op, `${path}.fontSize`, errors);
        validateOpacity(step.opacity, stepIndex, step.op, `${path}.opacity`, errors);
        break;

      case 'place_rich_textbox':
        if (step.selector) validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateFiniteNumber(step.x, stepIndex, step.op, `${path}.x`, errors);
        validateFiniteNumber(step.y, stepIndex, step.op, `${path}.y`, errors);
        validatePositiveNumber(step.width, stepIndex, step.op, `${path}.width`, errors);
        if (step.height !== undefined) validatePositiveNumber(step.height, stepIndex, step.op, `${path}.height`, errors);
        validateText(step.content, stepIndex, step.op, `${path}.content`, errors);
        if (!step.styles || typeof step.styles !== 'object') {
          pushError(errors, stepIndex, step.op, `${path}.styles`, 'styles must be an object.');
        }
        break;

      case 'place_professional_callout':
        if (step.selector) validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        if (!step.callout || typeof step.callout !== 'object') {
          pushError(errors, stepIndex, step.op, `${path}.callout`, 'callout must be an object.');
        }
        break;

      case 'place_table':
        if (step.selector) validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateFiniteNumber(step.x, stepIndex, step.op, `${path}.x`, errors);
        validateFiniteNumber(step.y, stepIndex, step.op, `${path}.y`, errors);
        validatePositiveNumber(step.width, stepIndex, step.op, `${path}.width`, errors);
        if (!step.tableData || typeof step.tableData !== 'object') {
          pushError(errors, stepIndex, step.op, `${path}.tableData`, 'tableData must be an object.');
        }
        break;

      case 'adjust_image':
        if (step.selector) validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateFiniteNumber(step.x, stepIndex, step.op, `${path}.x`, errors);
        validateFiniteNumber(step.y, stepIndex, step.op, `${path}.y`, errors);
        validatePositiveNumber(step.width, stepIndex, step.op, `${path}.width`, errors);
        validatePositiveNumber(step.height, stepIndex, step.op, `${path}.height`, errors);
        validateOpacity(step.opacity, stepIndex, step.op, `${path}.opacity`, errors);
        validateImageSource(step.base64Image, step.donorFileId, stepIndex, step.op, path, errors);
        break;

      case 'draw_redaction_box':
        validatePageSelector(step.selector, stepIndex, step.op, `${path}.selector`, errors);
        validateFiniteNumber(step.x, stepIndex, step.op, `${path}.x`, errors);
        validateFiniteNumber(step.y, stepIndex, step.op, `${path}.y`, errors);
        validatePositiveNumber(step.width, stepIndex, step.op, `${path}.width`, errors);
        validatePositiveNumber(step.height, stepIndex, step.op, `${path}.height`, errors);
        break;

      case 'conditional':
        validateCondition(step.condition, stepIndex, step.op, `${path}.condition`, errors);

        if (!Array.isArray(step.then) || step.then.length === 0) {
          pushError(errors, stepIndex, step.op, `${path}.then`, 'then must have at least one step.');
        } else {
          step.then.forEach((child, childIndex) => {
            this.validateStep(child, stepIndex, errors, `${path}.then.${childIndex}`);
          });
        }

        if (step.else !== undefined) {
          if (!Array.isArray(step.else)) {
            pushError(errors, stepIndex, step.op, `${path}.else`, 'else must be an array when provided.');
          } else {
            step.else.forEach((child, childIndex) => {
              this.validateStep(child, stepIndex, errors, `${path}.else.${childIndex}`);
            });
          }
        }
        break;

      case 'apply_template_vars':
        if (!step.vars || typeof step.vars !== 'object' || Array.isArray(step.vars)) {
          pushError(errors, stepIndex, step.op, `${path}.vars`, 'vars must be an object.');
        }
        break;

      case 'merge_files':
        if (!Array.isArray(step.donorFileIds) || step.donorFileIds.length === 0) {
          pushError(errors, stepIndex, step.op, `${path}.donorFileIds`, 'donorFileIds must contain at least one donor file id.');
        }
        break;

      case 'insert_pdf':
        if (!step.donorFileId || typeof step.donorFileId !== 'string') {
          pushError(errors, stepIndex, step.op, `${path}.donorFileId`, 'donorFileId is required.');
        }
        if (!Number.isInteger(step.atIndex) || step.atIndex < 0) {
          pushError(errors, stepIndex, step.op, `${path}.atIndex`, 'atIndex must be an integer >= 0.');
        }
        break;

      case 'add_content_page':
        validateInsertPosition(step.position, stepIndex, step.op, `${path}.position`, errors);
        if (!Array.isArray(step.blocks)) {
          pushError(errors, stepIndex, step.op, `${path}.blocks`, 'blocks must be an array.');
        }
        break;

      case 'add_image_header_page':
        validateInsertPosition(step.position, stepIndex, step.op, `${path}.position`, errors);
        validateText(step.title, stepIndex, step.op, `${path}.title`, errors);
        validateText(step.imageSrc, stepIndex, step.op, `${path}.imageSrc`, errors);
        if (step.headerHeight !== undefined) {
          validatePositiveNumber(step.headerHeight, stepIndex, step.op, `${path}.headerHeight`, errors);
        }
        break;
    }
  }
}

function validatePageSelector(
  selector: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (!selector || typeof selector !== 'object') {
    pushError(errors, stepIndex, op, field, 'selector must be an object.');
    return;
  }

  const typed = selector as PageSelector;

  if (
    typed.mode !== 'all' &&
    typed.mode !== 'current' &&
    typed.mode !== 'selected' &&
    typed.mode !== 'range' &&
    typed.mode !== 'list' &&
    typed.mode !== 'odd' &&
    typed.mode !== 'even'
  ) {
    pushError(errors, stepIndex, op, `${field}.mode`, 'selector.mode is invalid.');
    return;
  }

  if (typed.mode === 'range') {
    if (!Number.isInteger(typed.from) || typed.from < 1) {
      pushError(errors, stepIndex, op, `${field}.from`, 'range selector from must be an integer >= 1.');
    }
    if (!Number.isInteger(typed.to) || typed.to < 1) {
      pushError(errors, stepIndex, op, `${field}.to`, 'range selector to must be an integer >= 1.');
    }
  }

  if (typed.mode === 'list') {
    if (!Array.isArray(typed.pages) || typed.pages.length === 0) {
      pushError(errors, stepIndex, op, `${field}.pages`, 'list selector pages must contain at least one page.');
      return;
    }

    typed.pages.forEach((page, index) => {
      if (!Number.isInteger(page) || page < 1) {
        pushError(errors, stepIndex, op, `${field}.pages.${index}`, 'page must be an integer >= 1.');
      }
    });
  }
}

function validateInsertPosition(
  position: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (!position || typeof position !== 'object') {
    pushError(errors, stepIndex, op, field, 'position must be an object.');
    return;
  }

  const typed = position as InsertPosition;

  if (
    typed.mode !== 'before' &&
    typed.mode !== 'after' &&
    typed.mode !== 'start' &&
    typed.mode !== 'end'
  ) {
    pushError(errors, stepIndex, op, `${field}.mode`, 'position.mode is invalid.');
    return;
  }

  if ((typed.mode === 'before' || typed.mode === 'after') && (!Number.isInteger(typed.page) || typed.page < 1)) {
    pushError(errors, stepIndex, op, `${field}.page`, 'position.page must be an integer >= 1.');
  }
}

function validateBlankPageSize(
  size: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (size === 'match-current' || size === 'a4' || size === 'letter') return;

  if (!size || typeof size !== 'object') {
    pushError(errors, stepIndex, op, field, 'size must be match-current, a4, letter, or { width, height }.');
    return;
  }

  const typed = size as { width?: unknown; height?: unknown };

  validatePositiveNumber(typed.width, stepIndex, op, `${field}.width`, errors);
  validatePositiveNumber(typed.height, stepIndex, op, `${field}.height`, errors);
}

function validateReorder(
  order: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (!Array.isArray(order) || order.length === 0) {
    pushError(errors, stepIndex, op, field, 'order must contain at least one page number.');
    return;
  }

  const seen = new Set<number>();

  order.forEach((page, index) => {
    if (!Number.isInteger(page) || page < 1) {
      pushError(errors, stepIndex, op, `${field}.${index}`, 'order page must be an integer >= 1.');
      return;
    }

    if (seen.has(page)) {
      pushError(errors, stepIndex, op, `${field}.${index}`, `duplicate page ${page} in reorder list.`);
      return;
    }

    seen.add(page);
  });
}

function validateCondition(
  condition: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (!condition || typeof condition !== 'object') {
    pushError(errors, stepIndex, op, field, 'condition must be an object.');
    return;
  }

  const typed = condition as MacroCondition;

  if (
    typed.type !== 'page_count_gt' &&
    typed.type !== 'page_count_lt' &&
    typed.type !== 'filename_contains' &&
    typed.type !== 'custom_var_equals'
  ) {
    pushError(errors, stepIndex, op, `${field}.type`, 'condition.type is invalid.');
    return;
  }

  if ((typed.type === 'page_count_gt' || typed.type === 'page_count_lt') && typeof typed.value !== 'number') {
    pushError(errors, stepIndex, op, `${field}.value`, 'condition.value must be a number.');
  }

  if (typed.type === 'filename_contains' && typeof typed.value !== 'string') {
    pushError(errors, stepIndex, op, `${field}.value`, 'condition.value must be a string.');
  }

  if (typed.type === 'custom_var_equals') {
    if (!typed.key || typeof typed.key !== 'string') {
      pushError(errors, stepIndex, op, `${field}.key`, 'condition.key must be a string.');
    }
    if (typeof typed.value !== 'string') {
      pushError(errors, stepIndex, op, `${field}.value`, 'condition.value must be a string.');
    }
  }
}

function validateImageSource(
  base64Image: string | undefined,
  donorFileId: string | undefined,
  stepIndex: number,
  op: string,
  path: string,
  errors: ValidationError[],
): void {
  const hasBase64 = typeof base64Image === 'string' && base64Image.trim().length > 0;
  const hasDonor = typeof donorFileId === 'string' && donorFileId.trim().length > 0;

  if (!hasBase64 && !hasDonor) {
    pushError(errors, stepIndex, op, `${path}.base64Image`, 'base64Image or donorFileId is required.');
  }

  if (hasBase64 && /^\s*javascript:/i.test(base64Image)) {
    pushError(errors, stepIndex, op, `${path}.base64Image`, 'javascript image source is not allowed.');
  }

  if (hasBase64 && /^\s*data:text\/html/i.test(base64Image)) {
    pushError(errors, stepIndex, op, `${path}.base64Image`, 'data:text/html image source is not allowed.');
  }
}

function validateText(
  value: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    pushError(errors, stepIndex, op, field, 'value must be a non-empty string.');
  }
}

function validateFiniteNumber(
  value: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    pushError(errors, stepIndex, op, field, 'value must be a finite number.');
  }
}

function validatePositiveNumber(
  value: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    pushError(errors, stepIndex, op, field, 'value must be a positive number.');
  }
}

function validateOpacity(
  value: unknown,
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (value === undefined) return;

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    pushError(errors, stepIndex, op, field, 'opacity must be between 0 and 1.');
  }
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: T[],
  stepIndex: number,
  op: string,
  field: string,
  errors: ValidationError[],
): void {
  if (!allowed.includes(value as T)) {
    pushError(errors, stepIndex, op, field, `value must be one of: ${allowed.join(', ')}.`);
  }
}

function pushError(
  errors: ValidationError[],
  stepIndex: number,
  op: string,
  field: string,
  message: string,
): void {
  errors.push({
    stepIndex,
    op,
    field,
    message,
  });
}

export const macroValidator = new MacroValidator();