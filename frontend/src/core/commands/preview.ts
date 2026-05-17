import type { PdfCommand, PdfCommandPreview } from './types';

/**
 * Generate a preview for a command before it is executed.  The preview
 * describes what the command will do in a human readable form and lists
 * the pages affected.  In the preview build we return minimal
 * information.  More sophisticated previews can be implemented by
 * inspecting the command payload and querying the current document.
 */
export function previewCommand(cmd: PdfCommand): PdfCommandPreview {
  // Provide a generic preview summary based on command type
  const base: PdfCommandPreview = {
    commandId: cmd.id,
    title: `Preview ${cmd.type}`,
    summary: '',
    affectedPages: [],
    warnings: [],
  };
  switch (cmd.type) {
    case 'PAGES_ORGANIZE': {
      base.summary = 'Reorder or modify document pages.';
      break;
    }
    case 'OCR_START': {
      base.summary = 'Start OCR on selected pages.';
      break;
    }
    case 'REDACTION_APPLY': {
      base.summary = 'Apply redactions. This is not available in preview mode.';
      base.warnings.push('Redaction cannot be completed without a server.');
      break;
    }
    default: {
      base.summary = 'Execute command.';
    }
  }
  return base;
}