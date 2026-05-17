import type { PdfCommand, Rect } from './types';

export interface CommandValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function isRect(rect: Rect | undefined): rect is Rect {
  return Boolean(
    rect &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width >= 0 &&
      rect.height >= 0,
  );
}

function validatePageNumbers(pageNumbers: number[] | undefined): string[] {
  if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
    return ['At least one page number is required.'];
  }

  return pageNumbers.some((n) => !Number.isInteger(n) || n <= 0)
    ? ['Page numbers must be positive integers.']
    : [];
}

export function validateCommand(command: PdfCommand): CommandValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!command.id) errors.push('Command id is required.');
  if (!command.type) errors.push('Command type is required.');
  if (!command.documentKey) errors.push('Document key is required.');
  if (!command.createdAt) errors.push('Creation timestamp is required.');

  switch (command.type) {
    case 'ANNOTATION_ADD':
      if (!Number.isInteger(command.payload.pageNumber) || command.payload.pageNumber <= 0) {
        errors.push('Annotation page number must be a positive integer.');
      }
      if (!isRect(command.payload.rect)) {
        errors.push('Annotation rectangle is invalid.');
      }
      break;

    case 'WRITER_OVERLAY_ADD':
      if (!Number.isInteger(command.payload.pageNumber) || command.payload.pageNumber <= 0) {
        errors.push('Writer overlay page number must be a positive integer.');
      }
      if (!isRect(command.payload.rect)) {
        errors.push('Writer overlay rectangle is invalid.');
      }
      break;

    case 'PAGES_ORGANIZE':
      errors.push(...validatePageNumbers(command.payload.pageNumbers));
      if (
        command.payload.operation === 'delete' ||
        command.payload.operation === 'replace' ||
        command.payload.operation === 'split'
      ) {
        if (command.risk === 'safe') {
          errors.push('Destructive page operations cannot be marked safe.');
        }
      }
      break;

    case 'OCR_START':
      errors.push(...validatePageNumbers(command.payload.pageNumbers));
      if (!command.payload.language) {
        errors.push('OCR language is required.');
      }
      break;

    case 'REDACTION_APPLY':
      if (command.risk === 'safe') {
        errors.push('Final redaction cannot be marked safe.');
      }
      break;

    default:
      break;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
