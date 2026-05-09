import type {
  PlacedElement,
  WriterContentModel,
  WriterElementStyle,
} from './types';
import {
  createEmptyRichTextModel,
  createTableModelFromMatrix,
  createWriterId,
} from './content-model';
import {
  syncElementContentFromModel,
} from './content-serialization';

export type WriterTemplateCategory =
  | 'header'
  | 'footer'
  | 'watermark'
  | 'stamp'
  | 'note'
  | 'table'
  | 'custom';

export interface WriterTemplateTokenContext {
  fileName?: string;
  pageNumber?: number;
  pageCount?: number;
  date?: Date;
  reviewer?: string;
  discipline?: string;
  revision?: string;
  project?: string;
}

export interface WriterTemplate {
  id: string;
  name: string;
  description: string;
  category: WriterTemplateCategory;
  tags: string[];
  createElements: (input: WriterTemplateApplyInput) => PlacedElement[];
}

export interface WriterTemplateApplyInput {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  tokenContext?: WriterTemplateTokenContext;
}

export const BUILT_IN_WRITER_TEMPLATES: WriterTemplate[] = [
  {
    id: 'writer-template-header-filename',
    name: 'File Name Header',
    description: 'Adds the file name at the top-left of the page.',
    category: 'header',
    tags: ['header', 'file', 'document-control'],
    createElements: (input) => [
      createTextElement({
        pageNumber: input.pageNumber,
        x: 36,
        y: 24,
        width: input.pageWidth - 72,
        height: 28,
        text: '{{fileName}}',
        name: 'File Name Header',
        tokenContext: input.tokenContext,
        source: 'template',
      }),
    ],
  },
  {
    id: 'writer-template-footer-page-number',
    name: 'Page Number Footer',
    description: 'Adds centered page numbering at the bottom of the page.',
    category: 'footer',
    tags: ['footer', 'page-number', 'document-control'],
    createElements: (input) => [
      createTextElement({
        pageNumber: input.pageNumber,
        x: 36,
        y: Math.max(0, input.pageHeight - 42),
        width: input.pageWidth - 72,
        height: 24,
        text: 'Page {{pageNumber}} of {{pageCount}}',
        name: 'Page Number Footer',
        tokenContext: input.tokenContext,
        source: 'template',
        align: 'center',
      }),
    ],
  },
  {
    id: 'writer-template-draft-watermark',
    name: 'DRAFT Watermark',
    description: 'Adds a large low-opacity DRAFT watermark.',
    category: 'watermark',
    tags: ['watermark', 'draft'],
    createElements: (input) => [
      createTextElement({
        pageNumber: input.pageNumber,
        x: input.pageWidth * 0.18,
        y: input.pageHeight * 0.45,
        width: input.pageWidth * 0.64,
        height: 90,
        text: 'DRAFT',
        name: 'DRAFT Watermark',
        tokenContext: input.tokenContext,
        source: 'template',
        align: 'center',
        style: {
          fontSize: 54,
          fontFamily: 'Arial',
          fontWeight: 'bold',
          color: '#ef4444',
          opacity: 0.16,
          backgroundColor: 'transparent',
        },
      }),
    ],
  },
  {
    id: 'writer-template-reviewed-stamp',
    name: 'Reviewed Stamp',
    description: 'Adds a reviewed stamp box.',
    category: 'stamp',
    tags: ['review', 'stamp'],
    createElements: (input) => [
      createTextElement({
        pageNumber: input.pageNumber,
        x: input.pageWidth - 210,
        y: 72,
        width: 160,
        height: 64,
        text: 'REVIEWED\n{{date}}',
        name: 'Reviewed Stamp',
        tokenContext: input.tokenContext,
        source: 'template',
        align: 'center',
        style: {
          fontSize: 14,
          fontFamily: 'Arial',
          fontWeight: 'bold',
          color: '#15803d',
          backgroundColor: 'transparent',
          borderColor: '#15803d',
          borderWidth: 2,
          opacity: 1,
        },
      }),
    ],
  },
  {
    id: 'writer-template-engineering-note',
    name: 'Engineering Note Box',
    description: 'Adds a formatted engineering note box.',
    category: 'note',
    tags: ['note', 'engineering'],
    createElements: (input) => [
      createTextElement({
        pageNumber: input.pageNumber,
        x: 48,
        y: 120,
        width: Math.min(420, input.pageWidth - 96),
        height: 96,
        text: 'Engineering Note:\nAdd comment here.',
        name: 'Engineering Note',
        tokenContext: input.tokenContext,
        source: 'template',
        style: {
          fontSize: 12,
          fontFamily: 'Arial',
          color: '#111827',
          backgroundColor: '#f8fafc',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          padding: 8,
          opacity: 1,
        },
      }),
    ],
  },
  {
    id: 'writer-template-review-checklist',
    name: 'Review Checklist Table',
    description: 'Adds a review checklist table.',
    category: 'table',
    tags: ['table', 'checklist', 'review'],
    createElements: (input) => {
      const table = createTableModelFromMatrix([
        ['Item', 'Status', 'Remarks'],
        ['Drawing number checked', '', ''],
        ['Revision checked', '', ''],
        ['Attachments checked', '', ''],
      ]);

      return [
        syncElementContentFromModel({
          id: createWriterId('element'),
          type: 'table',
          pageNumber: input.pageNumber,
          x: 48,
          y: 140,
          width: Math.min(480, input.pageWidth - 96),
          height: 140,
          content: '',
          contentModel: table,
          name: 'Review Checklist Table',
          hidden: false,
          locked: false,
          zIndex: 0,
          sourceMeta: {
            source: 'template',
            importedAt: new Date().toISOString(),
          },
        }),
      ];
    },
  },
];

export function resolveWriterTemplateTokens(
  text: string,
  context: WriterTemplateTokenContext = {},
): string {
  const date = context.date ?? new Date();

  const values: Record<string, string> = {
    fileName: context.fileName ?? 'document.pdf',
    pageNumber: String(context.pageNumber ?? ''),
    pageCount: String(context.pageCount ?? ''),
    date: date.toISOString().slice(0, 10),
    reviewer: context.reviewer ?? '',
    discipline: context.discipline ?? '',
    revision: context.revision ?? '',
    project: context.project ?? '',
  };

  return String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return values[key] ?? '';
  });
}

export function getBuiltInWriterTemplates(): WriterTemplate[] {
  return [...BUILT_IN_WRITER_TEMPLATES];
}

export function getWriterTemplatesByCategory(category: WriterTemplateCategory): WriterTemplate[] {
  return getBuiltInWriterTemplates().filter((template) => template.category === category);
}

export function createTextElement(input: {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  name: string;
  tokenContext?: WriterTemplateTokenContext;
  source: 'manual' | 'template';
  align?: 'left' | 'center' | 'right' | 'justify';
  style?: Partial<WriterElementStyle>;
}): PlacedElement {
  const resolvedText = resolveWriterTemplateTokens(input.text, input.tokenContext);
  const model: WriterContentModel = createEmptyRichTextModel(resolvedText);

  if (model.kind === 'rich-text' && input.align) {
    model.blocks = model.blocks.map((block) => ({ ...block, align: input.align }));
  }

  const element = syncElementContentFromModel({
    id: createWriterId('element'),
    type: 'rich-text',
    pageNumber: input.pageNumber,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    content: '',
    contentModel: model,
    name: input.name,
    hidden: false,
    locked: false,
    zIndex: 0,
    sourceMeta: {
      source: input.source,
      importedAt: new Date().toISOString(),
    },
    style: {
      fontSize: 12,
      fontFamily: 'Arial',
      color: '#111827',
      backgroundColor: 'transparent',
      opacity: 1,
      ...input.style,
    },
  });

  return element;
}
