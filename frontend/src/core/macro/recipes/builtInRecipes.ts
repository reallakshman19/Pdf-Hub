import type { MacroRecipe } from '../types';

export type MacroRecipeCatalogCategory =
  | 'document-control'
  | 'review'
  | 'stamps'
  | 'tables'
  | 'page-cleanup'
  | 'authoring';

export interface MacroRecipeCatalogItem {
  id: string;
  name: string;
  description: string;
  category: MacroRecipeCatalogCategory;
  tags: string[];
  requiredOps: string[];
  recipe: MacroRecipe;
}

const TRANSPARENT_PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const BUILT_IN_RECIPES: MacroRecipeCatalogItem[] = [
  {
    id: 'review-current-page',
    name: 'Review Stamp — Current Page',
    description: 'Draw a reviewed stamp on the current page.',
    category: 'review',
    tags: ['review', 'stamp', 'current'],
    requiredOps: ['draw_text_on_pages'],
    recipe: {
      id: 'review-current-page',
      name: 'Review Stamp — Current Page',
      steps: [
        {
          op: 'draw_text_on_pages',
          selector: { mode: 'current' },
          text: 'REVIEWED',
          x: 36,
          y: 36,
          fontSize: 18,
          color: '#166534',
          opacity: 0.9,
        },
      ],
    },
  },
  {
    id: 'footer-page-numbers',
    name: 'Footer Page Numbers',
    description: 'Add centered page numbers to every page.',
    category: 'document-control',
    tags: ['footer', 'page-number'],
    requiredOps: ['header_footer_text'],
    recipe: {
      id: 'footer-page-numbers',
      name: 'Footer Page Numbers',
      steps: [
        {
          op: 'header_footer_text',
          selector: { mode: 'all' },
          zone: 'footer',
          text: 'Page {{page}}',
          align: 'center',
          marginX: 36,
          marginY: 24,
          fontSize: 9,
          color: '#374151',
          pageNumberToken: true,
        },
      ],
    },
  },
  {
    id: 'header-file-name',
    name: 'Header File Name',
    description: 'Add file name to the left header on all pages.',
    category: 'document-control',
    tags: ['header', 'filename'],
    requiredOps: ['header_footer_text'],
    recipe: {
      id: 'header-file-name',
      name: 'Header File Name',
      steps: [
        {
          op: 'header_footer_text',
          selector: { mode: 'all' },
          zone: 'header',
          text: '{{filename}}',
          align: 'left',
          marginX: 36,
          marginY: 24,
          fontSize: 9,
          color: '#374151',
          fileNameToken: true,
        },
      ],
    },
  },
  {
    id: 'rotate-selected-90',
    name: 'Rotate Selected Pages 90°',
    description: 'Rotate selected pages clockwise.',
    category: 'page-cleanup',
    tags: ['rotate', 'selected'],
    requiredOps: ['rotate_pages'],
    recipe: {
      id: 'rotate-selected-90',
      name: 'Rotate Selected Pages 90°',
      steps: [
        {
          op: 'rotate_pages',
          selector: { mode: 'selected' },
          degrees: 90,
        },
      ],
    },
  },
  {
    id: 'extract-selected',
    name: 'Extract Selected Pages',
    description: 'Create a separate PDF containing selected pages.',
    category: 'document-control',
    tags: ['extract', 'selected'],
    requiredOps: ['extract_pages'],
    recipe: {
      id: 'extract-selected',
      name: 'Extract Selected Pages',
      steps: [
        {
          op: 'extract_pages',
          selector: { mode: 'selected' },
          outputName: 'selected-pages.pdf',
        },
      ],
    },
  },
  {
    id: 'split-selected',
    name: 'Split Selected Pages',
    description: 'Extract selected pages and remove them from the active document.',
    category: 'document-control',
    tags: ['split', 'selected'],
    requiredOps: ['split_pages'],
    recipe: {
      id: 'split-selected',
      name: 'Split Selected Pages',
      steps: [
        {
          op: 'split_pages',
          selector: { mode: 'selected' },
          outputName: 'split-pages.pdf',
        },
      ],
    },
  },
  {
    id: 'duplicate-current',
    name: 'Duplicate Current Page',
    description: 'Duplicate the current page.',
    category: 'page-cleanup',
    tags: ['duplicate', 'current'],
    requiredOps: ['duplicate_pages'],
    recipe: {
      id: 'duplicate-current',
      name: 'Duplicate Current Page',
      steps: [
        {
          op: 'duplicate_pages',
          selector: { mode: 'current' },
        },
      ],
    },
  },
  {
    id: 'remove-selected',
    name: 'Remove Selected Pages',
    description: 'Remove selected pages from the document.',
    category: 'page-cleanup',
    tags: ['remove', 'selected'],
    requiredOps: ['remove_pages'],
    recipe: {
      id: 'remove-selected',
      name: 'Remove Selected Pages',
      steps: [
        {
          op: 'remove_pages',
          selector: { mode: 'selected' },
        },
      ],
    },
  },
  {
    id: 'insert-a4-end',
    name: 'Insert A4 Page at End',
    description: 'Append a blank A4 page.',
    category: 'authoring',
    tags: ['blank-page', 'a4'],
    requiredOps: ['insert_blank_page'],
    recipe: {
      id: 'insert-a4-end',
      name: 'Insert A4 Page at End',
      steps: [
        {
          op: 'insert_blank_page',
          position: { mode: 'end' },
          size: 'a4',
          count: 1,
        },
      ],
    },
  },
  {
    id: 'insert-review-cover',
    name: 'Insert Review Cover Page',
    description: 'Generate and insert a simple review cover page.',
    category: 'authoring',
    tags: ['cover', 'review'],
    requiredOps: ['add_content_page'],
    recipe: {
      id: 'insert-review-cover',
      name: 'Insert Review Cover Page',
      steps: [
        {
          op: 'add_content_page',
          position: { mode: 'start' },
          size: 'a4',
          background: '#ffffff',
          blocks: [
            {
              type: 'heading',
              text: 'Document Review',
            },
            {
              type: 'paragraph',
              text: 'Generated by PDF Hub macro.',
            },
            {
              type: 'table',
              rows: [
                ['Field', 'Value'],
                ['File', '{{filename}}'],
                ['Date', '{{date}}'],
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'add-image-header-page',
    name: 'Add Image Header Page',
    description: 'Generate an image-header page using a safe embedded image source.',
    category: 'authoring',
    tags: ['image', 'cover'],
    requiredOps: ['add_image_header_page'],
    recipe: {
      id: 'add-image-header-page',
      name: 'Add Image Header Page',
      steps: [
        {
          op: 'add_image_header_page',
          position: { mode: 'start' },
          imageSrc: TRANSPARENT_PNG,
          title: 'Document Package',
          subtitle: '{{filename}}',
          bodyMarkdown: 'Generated on {{date}}.',
          size: 'a4',
        },
      ],
    },
  },
  {
    id: 'place-revision-table',
    name: 'Place Revision Table',
    description: 'Place a simple revision table on the current page.',
    category: 'tables',
    tags: ['table', 'revision'],
    requiredOps: ['place_table'],
    recipe: {
      id: 'place-revision-table',
      name: 'Place Revision Table',
      steps: [
        {
          op: 'place_table',
          selector: { mode: 'current' },
          x: 36,
          y: 72,
          width: 260,
          tableData: {
            columns: [
              { id: 'rev', label: 'Rev' },
              { id: 'desc', label: 'Description' },
            ],
            rows: [
              {
                id: 'r1',
                cells: [
                  { id: 'r1c1', text: 'A' },
                  { id: 'r1c2', text: 'For Review' },
                ],
              },
            ],
            style: {
              borderColor: '#d1d5db',
              headerBg: '#f1f5f9',
              fontSize: 10,
            },
          },
        },
      ],
    },
  },
  {
    id: 'place-rich-review-note',
    name: 'Place Rich Review Note',
    description: 'Place a rich text review note on the current page.',
    category: 'review',
    tags: ['note', 'rich-text'],
    requiredOps: ['place_rich_textbox'],
    recipe: {
      id: 'place-rich-review-note',
      name: 'Place Rich Review Note',
      steps: [
        {
          op: 'place_rich_textbox',
          selector: { mode: 'current' },
          x: 36,
          y: 120,
          width: 220,
          height: 70,
          content: '<strong>Review Note:</strong><br/>Check highlighted area.',
          styles: {
            fontSize: 11,
            color: '#111827',
            backgroundColor: '#fef3c7',
            padding: 6,
            borderWidth: 1,
            borderColor: '#f59e0b',
          },
        },
      ],
    },
  },
  {
    id: 'insert-transparent-image',
    name: 'Insert Safe PNG Image',
    description: 'Insert a safe sample PNG image on the current page.',
    category: 'stamps',
    tags: ['image', 'png'],
    requiredOps: ['insert_image'],
    recipe: {
      id: 'insert-transparent-image',
      name: 'Insert Safe PNG Image',
      steps: [
        {
          op: 'insert_image',
          selector: { mode: 'current' },
          x: 36,
          y: 36,
          width: 40,
          height: 40,
          base64Image: TRANSPARENT_PNG,
        },
      ],
    },
  },
  {
    id: 'conditional-ifc-stamp',
    name: 'Conditional IFC Stamp',
    description: 'Apply an IFC stamp only when filename contains IFC.',
    category: 'review',
    tags: ['conditional', 'ifc'],
    requiredOps: ['conditional', 'draw_text_on_pages'],
    recipe: {
      id: 'conditional-ifc-stamp',
      name: 'Conditional IFC Stamp',
      steps: [
        {
          op: 'conditional',
          condition: {
            type: 'filename_contains',
            value: 'IFC',
          },
          then: [
            {
              op: 'draw_text_on_pages',
              selector: { mode: 'all' },
              text: 'IFC',
              x: 36,
              y: 36,
              fontSize: 12,
              color: '#1d4ed8',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'template-vars-review',
    name: 'Template Vars Review Stamp',
    description: 'Set review variables and draw the expanded stamp.',
    category: 'review',
    tags: ['template', 'stamp'],
    requiredOps: ['apply_template_vars', 'draw_text_on_pages'],
    recipe: {
      id: 'template-vars-review',
      name: 'Template Vars Review Stamp',
      steps: [
        {
          op: 'apply_template_vars',
          vars: {
            review_status: 'REVIEWED',
          },
        },
        {
          op: 'draw_text_on_pages',
          selector: { mode: 'current' },
          text: '{{review_status}} — {{filename}}',
          x: 36,
          y: 36,
          fontSize: 12,
        },
      ],
    },
  },
  {
    id: 'merge-two-donors',
    name: 'Merge Two Donor Files',
    description: 'Append donorA and donorB to the document.',
    category: 'document-control',
    tags: ['merge', 'donor'],
    requiredOps: ['merge_files'],
    recipe: {
      id: 'merge-two-donors',
      name: 'Merge Two Donor Files',
      steps: [
        {
          op: 'merge_files',
          donorFileIds: ['donorA', 'donorB'],
        },
      ],
    },
  },
  {
    id: 'insert-donor-start',
    name: 'Insert Donor at Start',
    description: 'Insert donorA at the start of the document.',
    category: 'document-control',
    tags: ['insert', 'donor'],
    requiredOps: ['insert_pdf'],
    recipe: {
      id: 'insert-donor-start',
      name: 'Insert Donor at Start',
      steps: [
        {
          op: 'insert_pdf',
          donorFileId: 'donorA',
          atIndex: 0,
        },
      ],
    },
  },
  {
    id: 'reorder-three-pages',
    name: 'Reorder Three Pages',
    description: 'Example reorder recipe for a 3-page document.',
    category: 'page-cleanup',
    tags: ['reorder'],
    requiredOps: ['reorder_pages'],
    recipe: {
      id: 'reorder-three-pages',
      name: 'Reorder Three Pages',
      steps: [
        {
          op: 'reorder_pages',
          order: [3, 1, 2],
        },
      ],
    },
  },
  {
    id: 'replace-first-page',
    name: 'Replace First Page from Donor',
    description: 'Replace page 1 using donorA page 1.',
    category: 'document-control',
    tags: ['replace', 'donor'],
    requiredOps: ['replace_page'],
    recipe: {
      id: 'replace-first-page',
      name: 'Replace First Page from Donor',
      steps: [
        {
          op: 'replace_page',
          targetPage: 1,
          donorFileId: 'donorA',
          donorPage: 1,
        },
      ],
    },
  },
];

export function getBuiltInMacroRecipes(): MacroRecipeCatalogItem[] {
  return BUILT_IN_RECIPES.map((item) => cloneCatalogItem(item));
}

export function getRecommendedMacroRecipes(): MacroRecipeCatalogItem[] {
  const recommendedIds = new Set([
    'review-current-page',
    'footer-page-numbers',
    'extract-selected',
    'insert-review-cover',
    'place-revision-table',
  ]);

  return getBuiltInMacroRecipes().filter((item) => recommendedIds.has(item.id));
}

export function findBuiltInMacroRecipe(id: string): MacroRecipeCatalogItem | null {
  const found = BUILT_IN_RECIPES.find((item) => item.id === id);
  return found ? cloneCatalogItem(found) : null;
}

function cloneCatalogItem(item: MacroRecipeCatalogItem): MacroRecipeCatalogItem {
  return JSON.parse(JSON.stringify(item)) as MacroRecipeCatalogItem;
}