import type { Capabilities } from '@/hooks/useCapabilities';

export type MacroOpMode = 'client' | 'server' | 'hybrid';

export type MacroOpCategory =
  | 'page'
  | 'annotation'
  | 'writer'
  | 'ocr'
  | 'export'
  | 'content'
  | 'conditional';

export interface MacroOpMetadata {
  op: string;
  mode: MacroOpMode;
  category: MacroOpCategory;
  label: string;
  description: string;
  requiresDocument: boolean;
  requiresSelection: boolean;
}

/**
 * Central metadata registry for all macro operations.
 * Keyed by op name — must match registry.ts keys exactly.
 */
export const MACRO_OP_METADATA: Record<string, MacroOpMetadata> = {
  // ── Client-safe page operations ────────────────────────────────
  rotate_pages:      { op: 'rotate_pages',      mode: 'client', category: 'page',        label: 'Rotate Pages',        description: 'Rotate selected pages by 90°/180°/270°',    requiresDocument: true,  requiresSelection: false },
  extract_pages:     { op: 'extract_pages',      mode: 'client', category: 'page',        label: 'Extract Pages',       description: 'Extract pages to a new PDF',                 requiresDocument: true,  requiresSelection: false },
  split_pages:       { op: 'split_pages',        mode: 'client', category: 'page',        label: 'Split Pages',         description: 'Split document at selected pages',           requiresDocument: true,  requiresSelection: false },
  duplicate_pages:   { op: 'duplicate_pages',    mode: 'client', category: 'page',        label: 'Duplicate Pages',     description: 'Duplicate selected pages in place',          requiresDocument: true,  requiresSelection: false },
  remove_pages:      { op: 'remove_pages',       mode: 'client', category: 'page',        label: 'Remove Pages',        description: 'Remove selected pages from document',        requiresDocument: true,  requiresSelection: false },
  insert_blank_page: { op: 'insert_blank_page',  mode: 'client', category: 'page',        label: 'Insert Blank Page',   description: 'Insert a blank page at position',            requiresDocument: true,  requiresSelection: false },
  replace_page:      { op: 'replace_page',       mode: 'client', category: 'page',        label: 'Replace Page',        description: 'Replace a page with donor page',             requiresDocument: true,  requiresSelection: false },
  reorder_pages:     { op: 'reorder_pages',      mode: 'client', category: 'page',        label: 'Reorder Pages',       description: 'Rearrange page order',                       requiresDocument: true,  requiresSelection: false },
  select_pages:      { op: 'select_pages',       mode: 'client', category: 'page',        label: 'Select Pages',        description: 'Set page selection for subsequent steps',    requiresDocument: true,  requiresSelection: false },

  // ── Client-safe document operations ────────────────────────────
  merge_files:       { op: 'merge_files',        mode: 'client', category: 'page',        label: 'Merge Files',         description: 'Merge donor files into document',            requiresDocument: true,  requiresSelection: false },
  insert_pdf:        { op: 'insert_pdf',         mode: 'client', category: 'page',        label: 'Insert PDF',          description: 'Insert a PDF at specific index',             requiresDocument: true,  requiresSelection: false },

  // ── Client-safe content operations ──────────────────────────────
  header_footer_text:{ op: 'header_footer_text', mode: 'client', category: 'content',     label: 'Header / Footer',     description: 'Add text headers or footers',                requiresDocument: true,  requiresSelection: false },
  draw_text_on_pages:{ op: 'draw_text_on_pages', mode: 'client', category: 'content',     label: 'Draw Text',           description: 'Draw text at coordinates on pages',          requiresDocument: true,  requiresSelection: false },
  inject_rich_text:  { op: 'inject_rich_text',   mode: 'client', category: 'content',     label: 'Inject Rich Text',    description: 'Inject styled text block on pages',          requiresDocument: true,  requiresSelection: false },
  insert_image:      { op: 'insert_image',       mode: 'client', category: 'content',     label: 'Insert Image',        description: 'Place an image on pages',                    requiresDocument: true,  requiresSelection: false },
  add_content_page:  { op: 'add_content_page',   mode: 'client', category: 'content',     label: 'Add Content Page',    description: 'Add a page with layout blocks',              requiresDocument: true,  requiresSelection: false },
  add_image_header_page: { op: 'add_image_header_page', mode: 'client', category: 'content', label: 'Image Header Page', description: 'Add cover page with image header',       requiresDocument: true,  requiresSelection: false },
  place_rich_textbox:{ op: 'place_rich_textbox',  mode: 'client', category: 'writer',     label: 'Place Rich Textbox',  description: 'Place a writer-style rich textbox',          requiresDocument: true,  requiresSelection: false },
  place_professional_callout:{ op: 'place_professional_callout', mode: 'client', category: 'writer', label: 'Place Professional Callout', description: 'Place vector engineering callouts', requiresDocument: true, requiresSelection: false },
  place_table:       { op: 'place_table',         mode: 'client', category: 'writer',     label: 'Place Table',         description: 'Place a data table on page',                 requiresDocument: true,  requiresSelection: false },
  adjust_image:      { op: 'adjust_image',        mode: 'client', category: 'content',    label: 'Adjust Image',        description: 'Position and style an image on page',        requiresDocument: true,  requiresSelection: false },

  // ── Conditional / template ────────────────────────────────────
  conditional:       { op: 'conditional',         mode: 'client', category: 'conditional', label: 'Conditional',        description: 'Branch based on document properties',       requiresDocument: true,  requiresSelection: false },
  apply_template_vars:{ op: 'apply_template_vars', mode: 'client', category: 'conditional', label: 'Template Variables', description: 'Apply template variable substitutions',    requiresDocument: false, requiresSelection: false },
};

/**
 * Returns ops available for the current capabilities.
 */
export function getAvailableOps(capabilities: Capabilities): MacroOpMetadata[] {
  return Object.values(MACRO_OP_METADATA).filter((meta) => {
    if (meta.mode === 'client') return true;
    if (meta.mode === 'server') return capabilities.canUseMacroApi;
    // hybrid: available if either client or server can run it
    return true;
  });
}

/**
 * Returns why an op is unavailable, or null if available.
 */
export function getUnavailableReason(
  op: string,
  capabilities: Capabilities,
): string | null {
  const meta = MACRO_OP_METADATA[op];
  if (!meta) return `Unknown macro operation "${op}".`;
  if (meta.mode === 'client') return null;
  if (meta.mode === 'server' && !capabilities.canUseMacroApi) {
    return `"${meta.label}" requires a running server. Current mode: ${capabilities.mode}.`;
  }
  return null;
}

/**
 * Validates whether a recipe can execute in the current mode.
 */
export function validateRecipeForMode(
  steps: Array<{ op: string }>,
  capabilities: Capabilities,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const step of steps) {
    const reason = getUnavailableReason(step.op, capabilities);
    if (reason) errors.push(reason);
  }

  return { valid: errors.length === 0, errors };
}
