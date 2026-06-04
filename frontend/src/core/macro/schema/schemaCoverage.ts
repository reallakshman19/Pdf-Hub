import type { MacroStep } from '../types';
import {
  getAllMacroOpSchemas,
  MACRO_OP_SCHEMAS,
} from './opSchema';

export const SUPPORTED_MACRO_OPS: MacroStep['op'][] = [
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
  'place_table',
  'adjust_image',
  'draw_redaction_box',
  'conditional',
  'apply_template_vars',
];

export interface MacroSchemaCoverageResult {
  ok: boolean;
  missingSchemas: string[];
  extraSchemas: string[];
  duplicateSchemas: string[];
}

export function validateMacroSchemaCoverage(): MacroSchemaCoverageResult {
  const schemaOps = getAllMacroOpSchemas().map((schema) => schema.op);
  const schemaSet = new Set(schemaOps);
  const supportedSet = new Set(SUPPORTED_MACRO_OPS);
  const duplicateSchemas = schemaOps.filter((op, index) => schemaOps.indexOf(op) !== index);

  const missingSchemas = SUPPORTED_MACRO_OPS.filter((op) => !schemaSet.has(op));
  const extraSchemas = schemaOps.filter((op) => !supportedSet.has(op));

  return {
    ok:
      missingSchemas.length === 0 &&
      extraSchemas.length === 0 &&
      duplicateSchemas.length === 0 &&
      Object.keys(MACRO_OP_SCHEMAS).length === SUPPORTED_MACRO_OPS.length,
    missingSchemas,
    extraSchemas,
    duplicateSchemas,
  };
}