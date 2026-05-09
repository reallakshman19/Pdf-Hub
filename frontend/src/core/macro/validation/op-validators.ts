// @ts-nocheck
import type {
  MacroStep,
} from '../types';
import {
  issue,
  requireArray,
  requireCssColor,
  requireFiniteNumber,
  requireNonNegativeNumber,
  requireOpacity,
  requirePlainObject,
  requirePositiveInteger,
  requirePositiveNumber,
  requireSafeRotation,
  requireText,
  type ValidationIssue,
  validateInsertPosition,
  validatePageSelector,
} from './guards';
import {
  isSafeMacroImageSrc,
} from '../security';

export function validateMacroStepByOp(
  step: MacroStep,
  stepIndex: number,
): ValidationIssue[] {
  const op = step.op;

  switch (op) {
    case 'select_pages':
      return validatePageSelector(step.selector, stepIndex, op);

    case 'rotate_pages':
      return [
        ...validatePageSelector(step.selector, stepIndex, op),
        ...requireSafeRotation(step.degrees, stepIndex, op, 'degrees'),
      ];

    case 'extract_pages':
    case 'split_pages':
      return [
        ...validatePageSelector(step.selector, stepIndex, op),
        ...(step.outputName === undefined
          ? []
          : requireText(step.outputName, stepIndex, op, 'outputName')),
      ];

    case 'duplicate_pages':
    case 'remove_pages':
      return validatePageSelector(step.selector, stepIndex, op);

    case 'insert_blank_page':
      return [
        ...validateInsertPosition(step.position, stepIndex, op),
        ...(step.count === undefined
          ? []
          : requirePositiveInteger(step.count, stepIndex, op, 'count')),
      ];

    case 'replace_page':
      return [
        ...requirePositiveInteger(step.targetPage, stepIndex, op, 'targetPage'),
        ...requireText(step.donorFileId, stepIndex, op, 'donorFileId'),
        ...requirePositiveInteger(step.donorPage, stepIndex, op, 'donorPage'),
      ];

    case 'reorder_pages':
      return validateReorder(step.order, stepIndex, op);

    case 'draw_text_on_pages':
      return [
        ...validatePageSelector(step.selector, stepIndex, op),
        ...requireText(step.text, stepIndex, op, 'text'),
        ...requireNonNegativeNumber(step.x, stepIndex, op, 'x'),
        ...requireNonNegativeNumber(step.y, stepIndex, op, 'y'),
        ...requirePositiveNumber(step.fontSize, stepIndex, op, 'fontSize'),
        ...requireCssColor(step.color, stepIndex, op, 'color'),
        ...requireOpacity(step.opacity, stepIndex, op, 'opacity'),
      ];

    case 'header_footer_text':
      return [
        ...validatePageSelector(step.selector, stepIndex, op),
        ...requireText(step.text, stepIndex, op, 'text'),
        ...requireText(step.zone, stepIndex, op, 'zone'),
        ...requireText(step.align, stepIndex, op, 'align'),
        ...requireNonNegativeNumber(step.marginX, stepIndex, op, 'marginX'),
        ...requireNonNegativeNumber(step.marginY, stepIndex, op, 'marginY'),
        ...requirePositiveNumber(step.fontSize, stepIndex, op, 'fontSize'),
        ...requireCssColor(step.color, stepIndex, op, 'color'),
        ...requireOpacity(step.opacity, stepIndex, op, 'opacity'),
      ];

    case 'inject_rich_text':
      return [
        ...validatePageSelector(step.selector, stepIndex, op),
        ...requireText(step.text, stepIndex, op, 'text'),
        ...requireNonNegativeNumber(step.x, stepIndex, op, 'x'),
        ...requireNonNegativeNumber(step.y, stepIndex, op, 'y'),
        ...(step.width === undefined ? [] : requirePositiveNumber(step.width, stepIndex, op, 'width')),
        ...(step.height === undefined ? [] : requirePositiveNumber(step.height, stepIndex, op, 'height')),
        ...requirePositiveNumber(step.fontSize, stepIndex, op, 'fontSize'),
        ...requireCssColor(step.color, stepIndex, op, 'color'),
        ...requireOpacity(step.opacity, stepIndex, op, 'opacity'),
      ];

    case 'place_rich_textbox':
      return [
        ...(step.selector === undefined ? [] : validatePageSelector(step.selector, stepIndex, op)),
        ...requireNonNegativeNumber(step.x, stepIndex, op, 'x'),
        ...requireNonNegativeNumber(step.y, stepIndex, op, 'y'),
        ...requirePositiveNumber(step.width, stepIndex, op, 'width'),
        ...(step.height === undefined ? [] : requirePositiveNumber(step.height, stepIndex, op, 'height')),
        ...requireText(step.content, stepIndex, op, 'content'),
        ...(step.styles === undefined ? [] : requirePlainObject(step.styles, stepIndex, op, 'styles')),
      ];

    case 'place_table':
      return [
        ...(step.selector === undefined ? [] : validatePageSelector(step.selector, stepIndex, op)),
        ...requireNonNegativeNumber(step.x, stepIndex, op, 'x'),
        ...requireNonNegativeNumber(step.y, stepIndex, op, 'y'),
        ...requirePositiveNumber(step.width, stepIndex, op, 'width'),
        ...validateTableData(step.tableData, stepIndex, op),
      ];

    case 'adjust_image':
      return [
        ...(step.selector === undefined ? [] : validatePageSelector(step.selector, stepIndex, op)),
        ...requireNonNegativeNumber(step.x, stepIndex, op, 'x'),
        ...requireNonNegativeNumber(step.y, stepIndex, op, 'y'),
        ...requirePositiveNumber(step.width, stepIndex, op, 'width'),
        ...requirePositiveNumber(step.height, stepIndex, op, 'height'),
        ...requireOpacity(step.opacity, stepIndex, op, 'opacity'),
        ...(step.borderWidth === undefined
          ? []
          : requireFiniteNumber(step.borderWidth, stepIndex, op, 'borderWidth')),
        ...requireCssColor(step.borderColor, stepIndex, op, 'borderColor'),
        ...requireSafeRotation(step.rotation, stepIndex, op, 'rotation'),
        ...validateOptionalBase64Image(step.base64Image, stepIndex, op),
        ...(step.donorFileId === undefined
          ? []
          : requireText(step.donorFileId, stepIndex, op, 'donorFileId')),
      ];

    case 'apply_template_vars':
      return [
        ...requirePlainObject(step.vars, stepIndex, op, 'vars'),
      ];

    case 'conditional':
      return [
        ...validateCondition(step.condition, stepIndex, op),
        ...requireArray(step.then, stepIndex, op, 'then'),
        ...(step.else === undefined ? [] : requireArray(step.else, stepIndex, op, 'else')),
      ];

    default:
      return [issue(stepIndex, String(op), 'op', `Unsupported op ${String(op)}.`)];
  }
}

function validateOptionalBase64Image(
  value: unknown,
  stepIndex: number,
  op: string,
): ValidationIssue[] {
  if (value === undefined || value === null || value === '') return [];

  const textIssues = requireText(value, stepIndex, op, 'base64Image');
  if (textIssues.length > 0) return textIssues;

  return isSafeMacroImageSrc(String(value))
    ? []
    : [
        issue(
          stepIndex,
          op,
          'base64Image',
          'base64Image must be a safe data:image/png|jpeg|jpg|webp base64 URL.',
        ),
      ];
}

function validateReorder(
  order: unknown,
  stepIndex: number,
  op: string,
): ValidationIssue[] {
  if (!Array.isArray(order) || order.length === 0) {
    return [issue(stepIndex, op, 'order', 'order must be a non-empty array.')];
  }

  const issues: any[] = [];
  const seen = new Set<number>();

  order.forEach((page, index) => {
    issues.push(requirePositiveInteger(page, stepIndex, op, `order[${index}]`));

    if (typeof page === 'number') {
      if (seen.has(page)) {
        issues.push(issue(stepIndex, op, `order[${index}]`, `duplicate page ${page} in reorder list.`));
      }

      seen.add(page);
    }
  });

  return issues;
}

function validateTableData(
  tableData: unknown,
  stepIndex: number,
  op: string,
): ValidationIssue[] {
  const objectIssues = requirePlainObject(tableData, stepIndex, op, 'tableData');

  if (objectIssues.length > 0) return objectIssues;

  const table = tableData as {
    columns?: unknown;
    rows?: unknown;
  };

  const issues: ValidationIssue[] = [
    ...requireArray(table.columns, stepIndex, op, 'tableData.columns'),
    ...requireArray(table.rows, stepIndex, op, 'tableData.rows'),
  ];

  if (Array.isArray(table.columns) && table.columns.length === 0) {
    issues.push(issue(stepIndex, op, 'tableData.columns', 'tableData.columns must not be empty.'));
  }

  if (Array.isArray(table.rows) && table.rows.length === 0) {
    issues.push(issue(stepIndex, op, 'tableData.rows', 'tableData.rows must not be empty.'));
  }

  return issues;
}

function validateCondition(
  condition: unknown,
  stepIndex: number,
  op: string,
): ValidationIssue[] {
  const objectIssues = requirePlainObject(condition, stepIndex, op, 'condition');

  if (objectIssues.length > 0) return objectIssues;

  const value = condition as {
    type?: unknown;
    value?: unknown;
    key?: unknown;
  };

  if (
    value.type !== 'page_count_gt' &&
    value.type !== 'page_count_lt' &&
    value.type !== 'filename_contains' &&
    value.type !== 'custom_var_equals'
  ) {
    return [issue(stepIndex, op, 'condition.type', 'condition.type is invalid.')];
  }

  if (value.type === 'page_count_gt' || value.type === 'page_count_lt') {
    return requireFiniteNumber(value.value, stepIndex, op, 'condition.value');
  }

  if (value.type === 'filename_contains') {
    return requireText(value.value, stepIndex, op, 'condition.value');
  }

  if (value.type === 'custom_var_equals') {
    return [
      ...requireText(value.key, stepIndex, op, 'condition.key'),
      ...requireText(value.value, stepIndex, op, 'condition.value', true),
    ];
  }

  return [];
}
