import './page-ops';
import './document-ops';
import './content-ops';
import './conditional-ops';

import { macroRegistry } from '../registry';
import { info, warn } from '@/core/logger/service';
import { registerLegacyVisualMaskCompatibility } from './visual-mask-compat';

registerLegacyVisualMaskCompatibility();

const ALL_OPS = [
  'rotate_pages', 'extract_pages', 'split_pages', 'duplicate_pages',
  'remove_pages', 'insert_blank_page', 'replace_page', 'reorder_pages',
  'select_pages', 'merge_files', 'insert_pdf',
  'header_footer_text', 'draw_text_on_pages', 'inject_rich_text',
  'insert_image', 'add_content_page', 'add_image_header_page',
  'place_rich_textbox', 'place_table', 'adjust_image',
  'draw_redaction_box',
  'conditional', 'apply_template_vars',
];

const registered = new Set(macroRegistry.getRegisteredOps());
ALL_OPS.forEach((op) => {
  if (!registered.has(op)) {
    warn('macro', 'Missing macro executor registration', { op });
  }
});

const registeredOps = macroRegistry.getRegisteredOps().sort();
info('macro', 'Macro registry initialised', {
  registeredOps: registeredOps.length,
  ops: registeredOps.join(', '),
});
