import type {
  InsertPosition,
  MacroCondition,
  MacroRecipe,
  MacroStep,
  PageSelector,
} from '../types';

export type MacroFieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'page-selector'
  | 'insert-position'
  | 'string-list'
  | 'number-list'
  | 'json'
  | 'macro-steps'
  | 'condition';

export interface MacroFieldSchema {
  name: string;
  label: string;
  kind: MacroFieldKind;
  required?: boolean;
  min?: number;
  max?: number;
  options?: string[];
  help?: string;
}

export type MacroOpCategory =
  | 'page'
  | 'document'
  | 'content'
  | 'logic';

export interface MacroOpSchema {
  op: MacroStep['op'];
  label: string;
  category: MacroOpCategory;
  description: string;
  fields: MacroFieldSchema[];
}

const PAGE_SELECTOR_FIELD: MacroFieldSchema = {
  name: 'selector',
  label: 'Pages',
  kind: 'page-selector',
  required: true,
  help: 'Pages affected by this operation.',
};

const OPTIONAL_PAGE_SELECTOR_FIELD: MacroFieldSchema = {
  ...PAGE_SELECTOR_FIELD,
  required: false,
  help: 'Pages affected by this operation. Defaults to selected pages when omitted.',
};

const POSITION_FIELD: MacroFieldSchema = {
  name: 'position',
  label: 'Insert Position',
  kind: 'insert-position',
  required: true,
};

const X_FIELD: MacroFieldSchema = {
  name: 'x',
  label: 'X',
  kind: 'number',
  required: true,
};

const Y_FIELD: MacroFieldSchema = {
  name: 'y',
  label: 'Y',
  kind: 'number',
  required: true,
};

const WIDTH_FIELD: MacroFieldSchema = {
  name: 'width',
  label: 'Width',
  kind: 'number',
  required: true,
  min: 1,
};

const HEIGHT_FIELD: MacroFieldSchema = {
  name: 'height',
  label: 'Height',
  kind: 'number',
  required: false,
  min: 1,
};

const OP_SCHEMAS: MacroOpSchema[] = [
  {
    op: 'select_pages',
    label: 'Select Pages',
    category: 'page',
    description: 'Select pages for later selector-based operations.',
    fields: [PAGE_SELECTOR_FIELD],
  },
  {
    op: 'rotate_pages',
    label: 'Rotate Pages',
    category: 'page',
    description: 'Rotate selected pages by 90, 180, or 270 degrees.',
    fields: [
      PAGE_SELECTOR_FIELD,
      {
        name: 'degrees',
        label: 'Degrees',
        kind: 'select',
        required: true,
        options: ['90', '180', '270'],
      },
    ],
  },
  {
    op: 'extract_pages',
    label: 'Extract Pages',
    category: 'page',
    description: 'Extract selected pages to a separate output file.',
    fields: [
      PAGE_SELECTOR_FIELD,
      {
        name: 'outputName',
        label: 'Output Name',
        kind: 'string',
      },
    ],
  },
  {
    op: 'split_pages',
    label: 'Split Pages',
    category: 'page',
    description: 'Extract selected pages and remove them from the working document.',
    fields: [
      PAGE_SELECTOR_FIELD,
      {
        name: 'outputName',
        label: 'Output Name',
        kind: 'string',
      },
    ],
  },
  {
    op: 'duplicate_pages',
    label: 'Duplicate Pages',
    category: 'page',
    description: 'Duplicate selected pages in place.',
    fields: [PAGE_SELECTOR_FIELD],
  },
  {
    op: 'remove_pages',
    label: 'Remove Pages',
    category: 'page',
    description: 'Remove selected pages from the working document.',
    fields: [PAGE_SELECTOR_FIELD],
  },
  {
    op: 'insert_blank_page',
    label: 'Insert Blank Page',
    category: 'page',
    description: 'Insert one or more blank pages.',
    fields: [
      POSITION_FIELD,
      {
        name: 'size',
        label: 'Page Size',
        kind: 'select',
        required: true,
        options: ['match-current', 'a4', 'letter'],
      },
      {
        name: 'count',
        label: 'Count',
        kind: 'number',
        min: 1,
      },
    ],
  },
  {
    op: 'replace_page',
    label: 'Replace Page',
    category: 'page',
    description: 'Replace one page using a page from a donor document.',
    fields: [
      {
        name: 'targetPage',
        label: 'Target Page',
        kind: 'number',
        required: true,
        min: 1,
      },
      {
        name: 'donorFileId',
        label: 'Donor File ID',
        kind: 'string',
        required: true,
      },
      {
        name: 'donorPage',
        label: 'Donor Page',
        kind: 'number',
        required: true,
        min: 1,
      },
    ],
  },
  {
    op: 'reorder_pages',
    label: 'Reorder Pages',
    category: 'page',
    description: 'Reorder all pages using a one-based page order list.',
    fields: [
      {
        name: 'order',
        label: 'Page Order',
        kind: 'number-list',
        required: true,
      },
    ],
  },
  {
    op: 'merge_files',
    label: 'Merge Files',
    category: 'document',
    description: 'Append donor PDF files to the working PDF.',
    fields: [
      {
        name: 'donorFileIds',
        label: 'Donor File IDs',
        kind: 'string-list',
        required: true,
      },
    ],
  },
  {
    op: 'insert_pdf',
    label: 'Insert PDF',
    category: 'document',
    description: 'Insert a donor PDF at a zero-based page index.',
    fields: [
      {
        name: 'donorFileId',
        label: 'Donor File ID',
        kind: 'string',
        required: true,
      },
      {
        name: 'atIndex',
        label: 'Insert Index',
        kind: 'number',
        required: true,
        min: 0,
      },
    ],
  },
  {
    op: 'add_content_page',
    label: 'Add Content Page',
    category: 'document',
    description: 'Generate and insert a simple content page.',
    fields: [
      POSITION_FIELD,
      {
        name: 'size',
        label: 'Page Size',
        kind: 'select',
        options: ['a4', 'letter'],
      },
      {
        name: 'background',
        label: 'Background',
        kind: 'string',
      },
      {
        name: 'blocks',
        label: 'Blocks',
        kind: 'json',
        required: true,
      },
    ],
  },
  {
    op: 'add_image_header_page',
    label: 'Add Image Header Page',
    category: 'document',
    description: 'Generate and insert a page with an image header.',
    fields: [
      POSITION_FIELD,
      {
        name: 'imageSrc',
        label: 'Image Source',
        kind: 'string',
        required: true,
      },
      {
        name: 'title',
        label: 'Title',
        kind: 'string',
        required: true,
      },
      {
        name: 'subtitle',
        label: 'Subtitle',
        kind: 'string',
      },
      {
        name: 'bodyMarkdown',
        label: 'Body Markdown',
        kind: 'string',
      },
      {
        name: 'headerHeight',
        label: 'Header Height',
        kind: 'number',
        min: 1,
      },
      {
        name: 'size',
        label: 'Page Size',
        kind: 'select',
        options: ['a4', 'letter'],
      },
    ],
  },
  {
    op: 'draw_text_on_pages',
    label: 'Draw Text',
    category: 'content',
    description: 'Draw plain text directly into PDF pages.',
    fields: [
      PAGE_SELECTOR_FIELD,
      {
        name: 'text',
        label: 'Text',
        kind: 'string',
        required: true,
      },
      X_FIELD,
      Y_FIELD,
      {
        name: 'fontSize',
        label: 'Font Size',
        kind: 'number',
        required: true,
        min: 1,
      },
      {
        name: 'color',
        label: 'Color',
        kind: 'string',
      },
      {
        name: 'opacity',
        label: 'Opacity',
        kind: 'number',
        min: 0,
        max: 1,
      },
      {
        name: 'align',
        label: 'Align',
        kind: 'select',
        options: ['left', 'center', 'right'],
      },
      {
        name: 'rotation',
        label: 'Rotation (degrees)',
        kind: 'number',
        help: 'Counter-clockwise rotation in degrees (e.g. 45 for diagonal watermark).',
      },
      {
        name: 'pageNumberToken',
        label: 'Enable Page Token',
        kind: 'boolean',
      },
      {
        name: 'fileNameToken',
        label: 'Enable Filename Token',
        kind: 'boolean',
      },
      {
        name: 'dateToken',
        label: 'Enable Date Token',
        kind: 'boolean',
      },
    ],
  },
  {
    op: 'header_footer_text',
    label: 'Header/Footer Text',
    category: 'content',
    description: 'Draw header or footer text into selected PDF pages.',
    fields: [
      PAGE_SELECTOR_FIELD,
      {
        name: 'zone',
        label: 'Zone',
        kind: 'select',
        required: true,
        options: ['header', 'footer'],
      },
      {
        name: 'text',
        label: 'Text',
        kind: 'string',
        required: true,
      },
      {
        name: 'align',
        label: 'Align',
        kind: 'select',
        required: true,
        options: ['left', 'center', 'right'],
      },
      {
        name: 'marginX',
        label: 'Margin X',
        kind: 'number',
        required: true,
      },
      {
        name: 'marginY',
        label: 'Margin Y',
        kind: 'number',
        required: true,
      },
      {
        name: 'fontSize',
        label: 'Font Size',
        kind: 'number',
        required: true,
        min: 1,
      },
      {
        name: 'excludeFirstPage',
        label: 'Exclude First Page',
        kind: 'boolean',
      },
      {
        name: 'excludeLastPage',
        label: 'Exclude Last Page',
        kind: 'boolean',
      },
    ],
  },
  {
    op: 'insert_image',
    label: 'Insert Image',
    category: 'content',
    description: 'Insert a PNG/JPEG image into selected pages.',
    fields: [
      PAGE_SELECTOR_FIELD,
      X_FIELD,
      Y_FIELD,
      HEIGHT_FIELD,
      {
        ...WIDTH_FIELD,
        required: false,
      },
      {
        name: 'scale',
        label: 'Scale',
        kind: 'number',
        min: 0.01,
      },
      {
        name: 'base64Image',
        label: 'Base64 Image',
        kind: 'string',
      },
      {
        name: 'donorFileId',
        label: 'Donor File ID',
        kind: 'string',
      },
    ],
  },
  {
    op: 'inject_rich_text',
    label: 'Inject Rich Text',
    category: 'content',
    description: 'Draw text into PDF pages with basic style properties.',
    fields: [
      PAGE_SELECTOR_FIELD,
      {
        name: 'text',
        label: 'Text',
        kind: 'string',
        required: true,
      },
      X_FIELD,
      Y_FIELD,
      {
        name: 'fontSize',
        label: 'Font Size',
        kind: 'number',
        required: true,
        min: 1,
      },
      {
        name: 'textAlign',
        label: 'Text Align',
        kind: 'select',
        options: ['left', 'center', 'right', 'justify'],
      },
    ],
  },
  {
    op: 'place_rich_textbox',
    label: 'Place Rich Textbox',
    category: 'content',
    description: 'Rasterize sanitized HTML and place it into selected pages.',
    fields: [
      OPTIONAL_PAGE_SELECTOR_FIELD,
      X_FIELD,
      Y_FIELD,
      WIDTH_FIELD,
      HEIGHT_FIELD,
      {
        name: 'content',
        label: 'HTML Content',
        kind: 'string',
        required: true,
      },
      {
        name: 'styles',
        label: 'Styles',
        kind: 'json',
        required: true,
      },
    ],
  },
  {
    op: 'place_professional_callout',
    label: 'Place Professional Callout',
    category: 'content',
    description: 'Place an engineering-grade vector callout with leader lines and searchable text.',
    fields: [
      OPTIONAL_PAGE_SELECTOR_FIELD,
      {
        name: 'callout',
        label: 'Callout Model',
        kind: 'json',
        required: true,
      },
      WIDTH_FIELD,
    ],
  },
  {
    op: 'place_table',
    label: 'Place Table',
    category: 'content',
    description: 'Rasterize a writer table and place it into selected pages.',
    fields: [
      OPTIONAL_PAGE_SELECTOR_FIELD,
      X_FIELD,
      Y_FIELD,
      WIDTH_FIELD,
      {
        name: 'tableData',
        label: 'Table Data',
        kind: 'json',
        required: true,
      },
    ],
  },
  {
    op: 'adjust_image',
    label: 'Adjust/Place Image',
    category: 'content',
    description: 'Insert a PNG/JPEG image with optional opacity, border, and rotation.',
    fields: [
      OPTIONAL_PAGE_SELECTOR_FIELD,
      X_FIELD,
      Y_FIELD,
      WIDTH_FIELD,
      {
        ...HEIGHT_FIELD,
        required: true,
      },
      {
        name: 'opacity',
        label: 'Opacity',
        kind: 'number',
        min: 0,
        max: 1,
      },
      {
        name: 'rotation',
        label: 'Rotation',
        kind: 'number',
      },
      {
        name: 'base64Image',
        label: 'Base64 Image',
        kind: 'string',
      },
      {
        name: 'donorFileId',
        label: 'Donor File ID',
        kind: 'string',
      },
    ],
  },
  {
    op: 'draw_redaction_box',
    label: 'Redaction Box',
    category: 'content',
    description: 'Draw a filled rectangle over a page region to redact content.',
    fields: [
      PAGE_SELECTOR_FIELD,
      X_FIELD,
      Y_FIELD,
      WIDTH_FIELD,
      { ...HEIGHT_FIELD, required: true },
      {
        name: 'fillColor',
        label: 'Fill Color',
        kind: 'string',
        help: 'CSS hex color (#ffffff = white-out, #000000 = black redaction).',
      },
    ],
  },
  {
    op: 'apply_template_vars',
    label: 'Apply Template Variables',
    category: 'logic',
    description: 'Set variables used by later {{var}} placeholders.',
    fields: [
      {
        name: 'vars',
        label: 'Variables',
        kind: 'json',
        required: true,
      },
    ],
  },
  {
    op: 'conditional',
    label: 'Conditional',
    category: 'logic',
    description: 'Execute nested steps when a condition matches.',
    fields: [
      {
        name: 'condition',
        label: 'Condition',
        kind: 'condition',
        required: true,
      },
      {
        name: 'then',
        label: 'Then Steps',
        kind: 'macro-steps',
        required: true,
      },
      {
        name: 'else',
        label: 'Else Steps',
        kind: 'macro-steps',
      },
    ],
  },
];

export const MACRO_OP_SCHEMAS: Record<MacroStep['op'], MacroOpSchema> =
  Object.fromEntries(OP_SCHEMAS.map((schema) => [schema.op, schema])) as Record<
    MacroStep['op'],
    MacroOpSchema
  >;

export function getMacroOpSchema(op: MacroStep['op']): MacroOpSchema {
  return MACRO_OP_SCHEMAS[op];
}

export function getAllMacroOpSchemas(): MacroOpSchema[] {
  return [...OP_SCHEMAS];
}

/**
 * Operations offered when creating new workflow steps.
 * Legacy header_footer_text remains schema-addressable for imported/saved
 * recipes but is no longer offered for new workflow authoring.
 */
export function getCreatableMacroOpSchemas(): MacroOpSchema[] {
  return OP_SCHEMAS.filter(
    (schema) => schema.op !== 'header_footer_text',
  );
}

export function getMacroOpsByCategory(category: MacroOpCategory): MacroOpSchema[] {
  return OP_SCHEMAS.filter((schema) => schema.category === category);
}

export function buildDefaultStep(op: MacroStep['op']): MacroStep {
  switch (op) {
    case 'select_pages':
      return { op, selector: { mode: 'selected' } };

    case 'rotate_pages':
      return { op, selector: { mode: 'selected' }, degrees: 90 };

    case 'extract_pages':
      return { op, selector: { mode: 'selected' }, outputName: 'extracted.pdf' };

    case 'split_pages':
      return { op, selector: { mode: 'selected' }, outputName: 'split.pdf' };

    case 'duplicate_pages':
      return { op, selector: { mode: 'selected' } };

    case 'remove_pages':
      return { op, selector: { mode: 'selected' } };

    case 'insert_blank_page':
      return { op, position: { mode: 'end' }, size: 'a4', count: 1 };

    case 'replace_page':
      return { op, targetPage: 1, donorFileId: 'donor', donorPage: 1 };

    case 'reorder_pages':
      return { op, order: [1] };

    case 'merge_files':
      return { op, donorFileIds: ['donor'] };

    case 'insert_pdf':
      return { op, donorFileId: 'donor', atIndex: 0 };

    case 'add_content_page':
      return {
        op,
        position: { mode: 'end' },
        size: 'a4',
        blocks: [
          {
            type: 'heading',
            text: 'New Page',
          },
          {
            type: 'paragraph',
            text: 'Generated by macro.',
          },
        ],
      };

    case 'add_image_header_page':
      return {
        op,
        position: { mode: 'end' },
        title: 'Image Header Page',
        imageSrc: sampleTransparentPngDataUrl(),
      };

    case 'draw_text_on_pages':
      return {
        op,
        selector: { mode: 'current' },
        text: 'Reviewed',
        x: 36,
        y: 36,
        fontSize: 12,
      };

    case 'header_footer_text':
      return {
        op,
        selector: { mode: 'all' },
        zone: 'footer',
        text: 'Page {{page}}',
        align: 'center',
        marginX: 36,
        marginY: 24,
        fontSize: 9,
      };

    case 'insert_image':
      return {
        op,
        selector: { mode: 'current' },
        x: 36,
        y: 36,
        width: 80,
        height: 80,
        base64Image: sampleTransparentPngDataUrl(),
      };

    case 'inject_rich_text':
      return {
        op,
        selector: { mode: 'current' },
        text: 'Reviewed',
        x: 36,
        y: 36,
        fontSize: 12,
      };

    case 'place_rich_textbox':
      return {
        op,
        x: 36,
        y: 36,
        width: 180,
        height: 60,
        content: '<strong>Reviewed</strong>',
        styles: {
          fontSize: 12,
          color: '#111827',
        },
      };

    case 'place_professional_callout':
      return {
        op,
        callout: {
          id: 'callout-default',
          occurrenceId: 'occ-1',
          psNo: 'PS-100',
          tag: 'Tag',
          note: 'Note (C=H)',
          targetPoint: { x: 100, y: 100 },
          box: { x: 150, y: 50, width: 180, height: 40 },
          leader: { type: 'orthogonal', path: [{ x: 150, y: 70 }, { x: 100, y: 70 }, { x: 100, y: 100 }] },
          style: {
            isReview: false,
            colors: { text: '#0f172a', background: '#ffffff', border: '#334155', leader: '#334155', anchorDot: '#0f172a' },
            fontFamily: 'Helvetica',
            fontSize: 9,
            borderWidth: 1,
            padding: 6,
            cornerRadius: 2,
          },
          primitives: [],
        } as unknown as import('../psIsonote/professional/model').ProfessionalCalloutModel,
      };

    case 'place_table':
      return {
        op,
        x: 36,
        y: 36,
        width: 240,
        tableData: {
          columns: [
            { id: 'c1', label: 'Item' },
            { id: 'c2', label: 'Status' },
          ],
          rows: [
            {
              id: 'r1',
              cells: [
                { id: 'r1c1', text: 'Document' },
                { id: 'r1c2', text: 'Reviewed' },
              ],
            },
          ],
          style: {
            borderColor: '#d1d5db',
            headerBg: '#f1f5f9',
            fontSize: 10,
          },
        },
      };

    case 'adjust_image':
      return {
        op,
        x: 36,
        y: 36,
        width: 80,
        height: 80,
        opacity: 1,
        base64Image: sampleTransparentPngDataUrl(),
      };

    case 'apply_template_vars':
      return {
        op,
        vars: {
          status: 'REVIEWED',
        },
      };

    case 'draw_redaction_box':
      return {
        op,
        selector: { mode: 'current' },
        x: 36,
        y: 36,
        width: 200,
        height: 40,
        fillColor: '#ffffff',
      };

    case 'conditional':
      return {
        op,
        condition: {
          type: 'page_count_gt',
          value: 1,
        },
        then: [
          {
            op: 'select_pages',
            selector: {
              mode: 'all',
            },
          },
        ],
      };
  }
}

export function validateMacroSchemaCoverage(): {
  ok: boolean;
  missingOps: string[];
  duplicateOps: string[];
} {
  const seen = new Set<string>();
  const duplicateOps: string[] = [];

  for (const schema of OP_SCHEMAS) {
    if (seen.has(schema.op)) {
      duplicateOps.push(schema.op);
    }
    seen.add(schema.op);
  }

  const macroOpsFromDefaults = Object.keys(MACRO_OP_SCHEMAS);
  const missingOps = macroOpsFromDefaults.filter((op) => !seen.has(op));

  return {
    ok: missingOps.length === 0 && duplicateOps.length === 0,
    missingOps,
    duplicateOps,
  };
}

function sampleTransparentPngDataUrl(): string {
  return (
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  );
}

export type {
  InsertPosition,
  MacroCondition,
  MacroRecipe,
  MacroStep,
  PageSelector,
};