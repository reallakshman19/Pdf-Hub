import type { MacroStep } from '../types';

export type MacroFieldType = 'string' | 'number' | 'boolean' | 'select' | 'color' | 'page_selector' | 'insert_position' | 'blocks' | 'array';

export interface MacroOpFieldSchema {
  name: string;
  label: string;
  type: MacroFieldType;
  options?: { value: string | number; label: string }[];
  defaultValue?: any;
  required?: boolean;
}

export interface MacroOpSchema {
  op: MacroStep['op'];
  label: string;
  category: 'pages' | 'content' | 'files' | 'logic' | 'templates' | 'authoring';
  description: string;
  fields: MacroOpFieldSchema[];
  defaultStep: () => MacroStep;
}

export const MACRO_OP_SCHEMAS: MacroOpSchema[] = [
  {
    op: 'select_pages',
    label: 'Select Pages',
    category: 'pages',
    description: 'Select pages for subsequent operations.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true }
    ],
    defaultStep: () => ({ op: 'select_pages', selector: { mode: 'all' } })
  },
  {
    op: 'rotate_pages',
    label: 'Rotate Pages',
    category: 'pages',
    description: 'Rotate selected pages.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true },
      { name: 'degrees', label: 'Degrees', type: 'select', options: [{value: 90, label: '90'}, {value: 180, label: '180'}, {value: 270, label: '270'}], required: true }
    ],
    defaultStep: () => ({ op: 'rotate_pages', selector: { mode: 'all' }, degrees: 90 })
  },
  {
    op: 'extract_pages',
    label: 'Extract Pages',
    category: 'pages',
    description: 'Extract selected pages to a new PDF.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true },
      { name: 'outputName', label: 'Output Name', type: 'string' }
    ],
    defaultStep: () => ({ op: 'extract_pages', selector: { mode: 'all' } })
  },
  {
    op: 'split_pages',
    label: 'Split Pages',
    category: 'pages',
    description: 'Split selected pages to new PDFs.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true },
      { name: 'outputName', label: 'Output Name', type: 'string' }
    ],
    defaultStep: () => ({ op: 'split_pages', selector: { mode: 'all' } })
  },
  {
    op: 'duplicate_pages',
    label: 'Duplicate Pages',
    category: 'pages',
    description: 'Duplicate selected pages.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true }
    ],
    defaultStep: () => ({ op: 'duplicate_pages', selector: { mode: 'all' } })
  },
  {
    op: 'remove_pages',
    label: 'Remove Pages',
    category: 'pages',
    description: 'Remove selected pages.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true }
    ],
    defaultStep: () => ({ op: 'remove_pages', selector: { mode: 'all' } })
  },
  {
    op: 'insert_blank_page',
    label: 'Insert Blank Page',
    category: 'pages',
    description: 'Insert a blank page.',
    fields: [
      { name: 'position', label: 'Position', type: 'insert_position', required: true },
      { name: 'size', label: 'Size', type: 'select', options: [{value: 'match-current', label: 'Match Current'}, {value: 'a4', label: 'A4'}, {value: 'letter', label: 'Letter'}], required: true },
      { name: 'count', label: 'Count', type: 'number' }
    ],
    defaultStep: () => ({ op: 'insert_blank_page', position: { mode: 'end' }, size: 'match-current', count: 1 })
  },
  {
    op: 'replace_page',
    label: 'Replace Page',
    category: 'pages',
    description: 'Replace a page with another from a donor file.',
    fields: [
      { name: 'targetPage', label: 'Target Page', type: 'number', required: true },
      { name: 'donorFileId', label: 'Donor File ID', type: 'string', required: true },
      { name: 'donorPage', label: 'Donor Page', type: 'number', required: true }
    ],
    defaultStep: () => ({ op: 'replace_page', targetPage: 1, donorFileId: '', donorPage: 1 })
  },
  {
    op: 'reorder_pages',
    label: 'Reorder Pages',
    category: 'pages',
    description: 'Reorder pages.',
    fields: [
      { name: 'order', label: 'Order', type: 'array', required: true }
    ],
    defaultStep: () => ({ op: 'reorder_pages', order: [] })
  },
  {
    op: 'draw_text_on_pages',
    label: 'Draw Text on Pages',
    category: 'content',
    description: 'Draw text on selected pages.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true },
      { name: 'text', label: 'Text', type: 'string', required: true },
      { name: 'x', label: 'X', type: 'number', required: true },
      { name: 'y', label: 'Y', type: 'number', required: true },
      { name: 'fontSize', label: 'Font Size', type: 'number', required: true },
      { name: 'color', label: 'Color', type: 'color' },
      { name: 'opacity', label: 'Opacity', type: 'number' },
      { name: 'align', label: 'Align', type: 'select', options: [{value: 'left', label: 'Left'}, {value: 'center', label: 'Center'}, {value: 'right', label: 'Right'}] },
      { name: 'fontFamily', label: 'Font Family', type: 'string' }
    ],
    defaultStep: () => ({ op: 'draw_text_on_pages', selector: { mode: 'all' }, text: '', x: 0, y: 0, fontSize: 12 })
  },
  {
    op: 'header_footer_text',
    label: 'Header/Footer Text',
    category: 'content',
    description: 'Add header or footer text.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true },
      { name: 'zone', label: 'Zone', type: 'select', options: [{value: 'header', label: 'Header'}, {value: 'footer', label: 'Footer'}], required: true },
      { name: 'text', label: 'Text', type: 'string', required: true },
      { name: 'align', label: 'Align', type: 'select', options: [{value: 'left', label: 'Left'}, {value: 'center', label: 'Center'}, {value: 'right', label: 'Right'}], required: true },
      { name: 'marginX', label: 'Margin X', type: 'number', required: true },
      { name: 'marginY', label: 'Margin Y', type: 'number', required: true },
      { name: 'fontSize', label: 'Font Size', type: 'number', required: true }
    ],
    defaultStep: () => ({ op: 'header_footer_text', selector: { mode: 'all' }, zone: 'header', text: '', align: 'center', marginX: 36, marginY: 36, fontSize: 10 })
  },
  {
    op: 'inject_rich_text',
    label: 'Inject Rich Text',
    category: 'content',
    description: 'Inject rich text.',
    fields: [
      { name: 'selector', label: 'Page Selector', type: 'page_selector', required: true },
      { name: 'x', label: 'X', type: 'number', required: true },
      { name: 'y', label: 'Y', type: 'number', required: true },
      { name: 'text', label: 'Text', type: 'string', required: true },
      { name: 'fontSize', label: 'Font Size', type: 'number', required: true }
    ],
    defaultStep: () => ({ op: 'inject_rich_text', selector: { mode: 'all' }, x: 0, y: 0, text: '', fontSize: 12 })
  },
  {
    op: 'place_rich_textbox',
    label: 'Place Rich Textbox',
    category: 'content',
    description: 'Place a rich textbox.',
    fields: [
      { name: 'x', label: 'X', type: 'number', required: true },
      { name: 'y', label: 'Y', type: 'number', required: true },
      { name: 'width', label: 'Width', type: 'number', required: true },
      { name: 'content', label: 'Content', type: 'string', required: true }
    ],
    defaultStep: () => ({ op: 'place_rich_textbox', x: 0, y: 0, width: 200, content: '', styles: {} })
  },
  {
    op: 'place_table',
    label: 'Place Table',
    category: 'content',
    description: 'Place a table.',
    fields: [
      { name: 'x', label: 'X', type: 'number', required: true },
      { name: 'y', label: 'Y', type: 'number', required: true },
      { name: 'width', label: 'Width', type: 'number', required: true }
    ],
    defaultStep: () => ({ op: 'place_table', x: 0, y: 0, width: 200, tableData: { columns: [], rows: [] } as any })
  },
  {
    op: 'adjust_image',
    label: 'Adjust Image',
    category: 'content',
    description: 'Adjust image properties.',
    fields: [
      { name: 'x', label: 'X', type: 'number', required: true },
      { name: 'y', label: 'Y', type: 'number', required: true },
      { name: 'width', label: 'Width', type: 'number', required: true },
      { name: 'height', label: 'Height', type: 'number', required: true }
    ],
    defaultStep: () => ({ op: 'adjust_image', x: 0, y: 0, width: 100, height: 100 })
  },
  {
    op: 'apply_template_vars',
    label: 'Apply Template Vars',
    category: 'templates',
    description: 'Apply template variables.',
    fields: [],
    defaultStep: () => ({ op: 'apply_template_vars', vars: {} })
  },
  {
    op: 'conditional',
    label: 'Conditional',
    category: 'logic',
    description: 'Conditional execution.',
    fields: [],
    defaultStep: () => ({ op: 'conditional', condition: { type: 'page_count_gt', value: 0 }, then: [] })
  },
  {
    op: 'add_content_page',
    label: 'Add Content Page',
    category: 'pages',
    description: 'Add a new page with content blocks.',
    fields: [],
    defaultStep: () => ({ op: 'add_content_page', position: { mode: 'end' }, blocks: [] })
  },
  {
    op: 'add_image_header_page',
    label: 'Add Image Header Page',
    category: 'pages',
    description: 'Add a page with an image header.',
    fields: [],
    defaultStep: () => ({ op: 'add_image_header_page', position: { mode: 'end' }, imageSrc: '', title: '' })
  },
  {
    op: 'merge_files',
    label: 'Merge Files',
    category: 'files',
    description: 'Merge multiple PDF files together.',
    fields: [],
    defaultStep: () => ({ op: 'merge_files', donorFileIds: [] })
  },
  {
    op: 'insert_pdf',
    label: 'Insert PDF',
    category: 'files',
    description: 'Insert a donor PDF at a specific index.',
    fields: [],
    defaultStep: () => ({ op: 'insert_pdf', donorFileId: '', atIndex: 0 })
  },
  {
    op: 'insert_image',
    label: 'Insert Image',
    category: 'content',
    description: 'Insert an image onto the selected pages.',
    fields: [],
    defaultStep: () => ({ op: 'insert_image', selector: { mode: 'all' }, x: 0, y: 0 })
  }
];

export const OP_SCHEMA_BY_OP = MACRO_OP_SCHEMAS.reduce((acc, schema) => {
  acc[schema.op] = schema;
  return acc;
}, {} as Record<string, MacroOpSchema>);

export function getMacroOpSchema(op: string): MacroOpSchema | undefined {
  return OP_SCHEMA_BY_OP[op];
}

export function getMacroOpsByCategory(): Record<string, MacroOpSchema[]> {
  return MACRO_OP_SCHEMAS.reduce((acc, schema) => {
    if (!acc[schema.category]) acc[schema.category] = [];
    acc[schema.category].push(schema);
    return acc;
  }, {} as Record<string, MacroOpSchema[]>);
}

export function createDefaultStep(op: string): MacroStep {
  const schema = getMacroOpSchema(op);
  if (!schema) throw new Error(`Unknown op: ${op}`);
  return schema.defaultStep();
}
