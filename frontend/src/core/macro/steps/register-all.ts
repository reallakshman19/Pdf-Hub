import './page-ops';
import './merge-ops';
import './content-ops';
import './generation-ops';
import './conditional-ops';

import { macroRegistry } from '../registry';

if (import.meta.env.DEV) {
  const ALL_OPS = [
    'rotate_pages', 'extract_pages', 'split_pages', 'duplicate_pages',
    'remove_pages', 'insert_blank_page', 'replace_page', 'reorder_pages',
    'select_pages', 'merge_files', 'insert_pdf',
    'header_footer_text', 'draw_text_on_pages', 'inject_rich_text',
    'insert_image', 'add_content_page', 'add_image_header_page',
    'place_rich_textbox', 'place_table', 'adjust_image',
    'conditional', 'apply_template_vars',
  ];
  const registered = new Set(macroRegistry.getRegisteredOps());
  ALL_OPS.forEach(op => {
    if (!registered.has(op)) {
      // eslint-disable-next-line no-console
      console.error(`[macro/register-all] Missing executor for op: "${op}"`);
    }
  });
}
