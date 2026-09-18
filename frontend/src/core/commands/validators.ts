import {
  defaultRiskForCommand,
  isPdfCommandSerializable,
  type PdfCommand,
} from './types';

export interface CommandValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function validatePageIndices(
  values: number[] | undefined,
  field: string,
  errors: string[],
): void {
  if (!Array.isArray(values) || values.length === 0) {
    errors.push(`${field} must contain at least one page index.`);
    return;
  }
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push(`${field} must contain zero-based non-negative integer page indices.`);
  }
}

function requireNonEmpty(
  value: string | undefined,
  field: string,
  errors: string[],
): void {
  if (!value || value.trim().length === 0) {
    errors.push(`${field} is required.`);
  }
}

function requireNonNegativeInteger(
  value: number,
  field: string,
  errors: string[],
): void {
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${field} must be a non-negative integer.`);
  }
}

export function validateCommand(command: PdfCommand): CommandValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  requireNonEmpty(command.id, 'id', errors);
  requireNonEmpty(command.documentKey, 'documentKey', errors);
  requireNonEmpty(command.createdAt, 'createdAt', errors);

  if (!Number.isFinite(Date.parse(command.createdAt))) {
    errors.push('createdAt must be a valid ISO-compatible timestamp.');
  }

  if (!isPdfCommandSerializable(command)) {
    errors.push('Command must be JSON-serializable.');
  }

  const expectedRisk = defaultRiskForCommand(command.type);
  if (expectedRisk === 'preview-required' && command.risk === 'safe') {
    errors.push(`${command.type} cannot be marked safe.`);
  }

  switch (command.type) {
    case 'ROTATE_PAGES':
      validatePageIndices(command.payload.pageIndices, 'payload.pageIndices', errors);
      if (![90, 180, 270].includes(command.payload.angle)) {
        errors.push('payload.angle must be 90, 180, or 270.');
      }
      break;

    case 'REORDER_PAGES':
      requireNonNegativeInteger(command.payload.fromIndex, 'payload.fromIndex', errors);
      requireNonNegativeInteger(command.payload.toIndex, 'payload.toIndex', errors);
      break;

    case 'REORDER_PAGES_BY_ORDER':
      validatePageIndices(command.payload.order, 'payload.order', errors);
      if (new Set(command.payload.order).size !== command.payload.order.length) {
        errors.push('payload.order cannot contain duplicate page indices.');
      }
      break;

    case 'EXTRACT_PAGES':
    case 'SPLIT_PAGES':
    case 'DELETE_PAGES':
    case 'DUPLICATE_PAGES':
      validatePageIndices(command.payload.pageIndices, 'payload.pageIndices', errors);
      break;

    case 'INSERT_PAGES':
      requireNonNegativeInteger(command.payload.atIndex, 'payload.atIndex', errors);
      requireNonEmpty(command.payload.donorResourceId, 'payload.donorResourceId', errors);
      break;

    case 'INSERT_BLANK_PAGE':
      requireNonNegativeInteger(command.payload.atIndex, 'payload.atIndex', errors);
      if (
        !Number.isFinite(command.payload.size.width)
        || command.payload.size.width <= 0
        || !Number.isFinite(command.payload.size.height)
        || command.payload.size.height <= 0
      ) {
        errors.push('payload.size must contain positive finite width and height.');
      }
      break;

    case 'REPLACE_PAGE':
      requireNonNegativeInteger(command.payload.atIndex, 'payload.atIndex', errors);
      requireNonNegativeInteger(command.payload.donorPageIndex, 'payload.donorPageIndex', errors);
      requireNonEmpty(command.payload.donorResourceId, 'payload.donorResourceId', errors);
      break;

    case 'MERGE_PDF':
      if (command.payload.donorResourceIds.length === 0) {
        errors.push('payload.donorResourceIds must contain at least one donor resource.');
      }
      command.payload.donorResourceIds.forEach((resourceId, index) =>
        requireNonEmpty(resourceId, `payload.donorResourceIds.${index}`, errors)
      );
      break;

    case 'SET_PAGE_LABELS': {
      if (!Array.isArray(command.payload.ranges)) {
        errors.push('payload.ranges must be an array.');
        break;
      }
      const starts = new Set<string>();
      const styles = new Set([
        'decimal',
        'roman-lower',
        'roman-upper',
        'letters-lower',
        'letters-upper',
      ]);
      command.payload.ranges.forEach((range, index) => {
        requireNonEmpty(
          range.startPageId,
          `payload.ranges.${index}.startPageId`,
          errors,
        );
        if (starts.has(range.startPageId)) {
          errors.push(
            `payload.ranges cannot contain duplicate startPageId ${range.startPageId}.`,
          );
        }
        starts.add(range.startPageId);

        if (range.style !== undefined && !styles.has(range.style)) {
          errors.push(
            `payload.ranges.${index}.style is not a supported PageLabel style.`,
          );
        }
        if (
          range.startNumber !== undefined
          && (!Number.isInteger(range.startNumber) || range.startNumber < 1)
        ) {
          errors.push(
            `payload.ranges.${index}.startNumber must be an integer >= 1.`,
          );
        }
        if (range.startNumber !== undefined && range.style === undefined) {
          errors.push(
            `payload.ranges.${index}.startNumber requires a numbering style.`,
          );
        }
        if (
          range.style === undefined
          && (!range.prefix || range.prefix.length === 0)
        ) {
          errors.push(
            `payload.ranges.${index} must define a style or non-empty prefix.`,
          );
        }
      });
      break;
    }

    case 'ADD_HEADER_FOOTER_TEXT':
      validatePageIndices(command.payload.pageIndices, 'payload.pageIndices', errors);
      requireNonEmpty(command.payload.options.text, 'payload.options.text', errors);
      if (!Number.isFinite(command.payload.options.fontSize) || command.payload.options.fontSize <= 0) {
        errors.push('payload.options.fontSize must be positive.');
      }
      break;

    case 'DRAW_TEXT_ON_PAGES':
      validatePageIndices(command.payload.pageIndices, 'payload.pageIndices', errors);
      requireNonEmpty(command.payload.options.text, 'payload.options.text', errors);
      if (!Number.isFinite(command.payload.options.fontSize) || command.payload.options.fontSize <= 0) {
        errors.push('payload.options.fontSize must be positive.');
      }
      break;

    case 'DRAW_REDACTION_BOX':
      validatePageIndices(command.payload.pageIndices, 'payload.pageIndices', errors);
      if (
        !Number.isFinite(command.payload.options.width)
        || command.payload.options.width <= 0
        || !Number.isFinite(command.payload.options.height)
        || command.payload.options.height <= 0
      ) {
        errors.push('Visual-mask width and height must be positive.');
      }
      break;

    case 'ANNOTATION_CHANGE':
      requireNonEmpty(command.payload.action, 'payload.action', errors);
      break;

    case 'WRITER_CHANGE':
      requireNonEmpty(command.payload.action, 'payload.action', errors);
      break;

    case 'APPLY_WORKING_COPY':
      requireNonEmpty(command.payload.binaryResourceId, 'payload.binaryResourceId', errors);
      if (
        command.payload.nextPageCount !== undefined
        && (!Number.isInteger(command.payload.nextPageCount) || command.payload.nextPageCount < 1)
      ) {
        errors.push('payload.nextPageCount must be an integer >= 1 when provided.');
      }
      if (command.payload.macro) {
        requireNonEmpty(command.payload.macro.recipeId, 'payload.macro.recipeId', errors);
        requireNonEmpty(command.payload.macro.recipeName, 'payload.macro.recipeName', errors);
        if (!Number.isInteger(command.payload.macro.stepCount) || command.payload.macro.stepCount < 0) {
          errors.push('payload.macro.stepCount must be a non-negative integer.');
        }
      }
      break;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
