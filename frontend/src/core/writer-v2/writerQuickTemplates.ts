import { useSessionStore } from '@/core/session/store';
import type {
  PdfRect,
  WriterElementV2,
  WriterReviewCategory,
  WriterReviewPriority,
  WriterReviewStatus,
} from './types';
import { useWriterV2Store } from './writerV2Store';
import {
  createReviewLabelElement,
  createRichNoteElement,
  createTextCalloutElement,
  createTextStampElement,
} from './writerElementFactory';

export type WriterQuickTemplateId =
  | 'stampDraft'
  | 'stampReviewed'
  | 'stampApproved'
  | 'stampRejected'
  | 'stampForConstruction'
  | 'stampAsBuilt'
  | 'reviewEngineering'
  | 'reviewClient'
  | 'reviewSafety'
  | 'noteGeneral'
  | 'noteActionRequired'
  | 'calloutCheckDimension'
  | 'calloutResolveConflict';

export interface WriterQuickTemplate {
  id: WriterQuickTemplateId;
  label: string;
  group: 'stamp' | 'review' | 'note' | 'callout';
  description: string;
  elementType: Extract<
    WriterElementV2['type'],
    'textStamp' | 'reviewLabel' | 'richNote' | 'textCallout'
  >;
  text: string;
  width: number;
  height: number;
  style: Partial<WriterElementV2['style']>;
  review?: {
    status: WriterReviewStatus;
    priority: WriterReviewPriority;
    category: WriterReviewCategory;
    assignee?: string;
    dueDate?: string;
  };
}

export interface InsertWriterQuickTemplateResult {
  changed: boolean;
  id?: string;
  message: string;
}

export const WRITER_QUICK_TEMPLATES: WriterQuickTemplate[] = [
  {
    id: 'stampDraft',
    label: 'DRAFT',
    group: 'stamp',
    description: 'Red draft stamp.',
    elementType: 'textStamp',
    text: 'DRAFT',
    width: 180,
    height: 54,
    style: {
      fontSize: 24,
      textColor: '#b91c1c',
      backgroundColor: 'transparent',
      borderColor: '#b91c1c',
      borderWidth: 2,
      opacity: 0.75,
      padding: 6,
    },
  },
  {
    id: 'stampReviewed',
    label: 'REVIEWED',
    group: 'stamp',
    description: 'Green reviewed stamp.',
    elementType: 'textStamp',
    text: 'REVIEWED',
    width: 200,
    height: 54,
    style: {
      fontSize: 22,
      textColor: '#047857',
      backgroundColor: '#ecfdf5',
      borderColor: '#059669',
      borderWidth: 2,
      opacity: 0.95,
      padding: 7,
    },
  },
  {
    id: 'stampApproved',
    label: 'APPROVED',
    group: 'stamp',
    description: 'Green approved stamp.',
    elementType: 'textStamp',
    text: 'APPROVED',
    width: 200,
    height: 54,
    style: {
      fontSize: 22,
      textColor: '#047857',
      backgroundColor: '#ffffff',
      borderColor: '#059669',
      borderWidth: 2,
      opacity: 0.95,
      padding: 7,
    },
  },
  {
    id: 'stampRejected',
    label: 'REJECTED',
    group: 'stamp',
    description: 'Red rejected stamp.',
    elementType: 'textStamp',
    text: 'REJECTED',
    width: 200,
    height: 54,
    style: {
      fontSize: 22,
      textColor: '#b91c1c',
      backgroundColor: '#fef2f2',
      borderColor: '#dc2626',
      borderWidth: 2,
      opacity: 0.95,
      padding: 7,
    },
    review: {
      status: 'open',
      priority: 'high',
      category: 'qa',
    },
  },
  {
    id: 'stampForConstruction',
    label: 'FOR CONSTRUCTION',
    group: 'stamp',
    description: 'Construction release stamp.',
    elementType: 'textStamp',
    text: 'FOR CONSTRUCTION',
    width: 260,
    height: 58,
    style: {
      fontSize: 18,
      textColor: '#1d4ed8',
      backgroundColor: '#eff6ff',
      borderColor: '#2563eb',
      borderWidth: 2,
      opacity: 0.95,
      padding: 7,
    },
  },
  {
    id: 'stampAsBuilt',
    label: 'AS BUILT',
    group: 'stamp',
    description: 'As-built status stamp.',
    elementType: 'textStamp',
    text: 'AS BUILT',
    width: 190,
    height: 54,
    style: {
      fontSize: 22,
      textColor: '#334155',
      backgroundColor: '#f8fafc',
      borderColor: '#475569',
      borderWidth: 2,
      opacity: 0.95,
      padding: 7,
    },
  },
  {
    id: 'reviewEngineering',
    label: 'Engineering Review',
    group: 'review',
    description: 'Engineering review label with metadata.',
    elementType: 'reviewLabel',
    text: 'ENGINEERING REVIEW',
    width: 220,
    height: 42,
    style: {
      fontSize: 12,
      textColor: '#7c2d12',
      backgroundColor: '#fff7ed',
      borderColor: '#f97316',
      borderWidth: 1,
      opacity: 1,
      padding: 6,
    },
    review: {
      status: 'open',
      priority: 'medium',
      category: 'engineering',
    },
  },
  {
    id: 'reviewClient',
    label: 'Client Review',
    group: 'review',
    description: 'Client review label with metadata.',
    elementType: 'reviewLabel',
    text: 'CLIENT REVIEW',
    width: 190,
    height: 42,
    style: {
      fontSize: 12,
      textColor: '#1e3a8a',
      backgroundColor: '#dbeafe',
      borderColor: '#2563eb',
      borderWidth: 1,
      opacity: 1,
      padding: 6,
    },
    review: {
      status: 'open',
      priority: 'medium',
      category: 'client',
    },
  },
  {
    id: 'reviewSafety',
    label: 'Safety Review',
    group: 'review',
    description: 'Safety review label with critical priority.',
    elementType: 'reviewLabel',
    text: 'SAFETY REVIEW',
    width: 190,
    height: 42,
    style: {
      fontSize: 12,
      textColor: '#7f1d1d',
      backgroundColor: '#fef2f2',
      borderColor: '#dc2626',
      borderWidth: 1,
      opacity: 1,
      padding: 6,
    },
    review: {
      status: 'open',
      priority: 'critical',
      category: 'safety',
    },
  },
  {
    id: 'noteGeneral',
    label: 'General Note',
    group: 'note',
    description: 'Reusable yellow note.',
    elementType: 'richNote',
    text: 'Note:',
    width: 220,
    height: 120,
    style: {
      fontSize: 12,
      textColor: '#422006',
      backgroundColor: '#fef9c3',
      borderColor: '#eab308',
      borderWidth: 1,
      opacity: 1,
      padding: 10,
    },
    review: {
      status: 'open',
      priority: 'low',
      category: 'general',
    },
  },
  {
    id: 'noteActionRequired',
    label: 'Action Required',
    group: 'note',
    description: 'Action-required note.',
    elementType: 'richNote',
    text: 'ACTION REQUIRED:',
    width: 240,
    height: 130,
    style: {
      fontSize: 12,
      textColor: '#7f1d1d',
      backgroundColor: '#fef2f2',
      borderColor: '#dc2626',
      borderWidth: 1,
      opacity: 1,
      padding: 10,
    },
    review: {
      status: 'open',
      priority: 'high',
      category: 'qa',
    },
  },
  {
    id: 'calloutCheckDimension',
    label: 'Check Dimension',
    group: 'callout',
    description: 'Dimension verification callout.',
    elementType: 'textCallout',
    text: 'Check dimension',
    width: 190,
    height: 80,
    style: {
      fontSize: 12,
      textColor: '#7c2d12',
      backgroundColor: '#fff7ed',
      borderColor: '#f97316',
      borderWidth: 1,
      opacity: 1,
      padding: 8,
    },
    review: {
      status: 'open',
      priority: 'medium',
      category: 'engineering',
    },
  },
  {
    id: 'calloutResolveConflict',
    label: 'Resolve Conflict',
    group: 'callout',
    description: 'Conflict-resolution callout.',
    elementType: 'textCallout',
    text: 'Resolve conflict',
    width: 200,
    height: 80,
    style: {
      fontSize: 12,
      textColor: '#7f1d1d',
      backgroundColor: '#fef2f2',
      borderColor: '#dc2626',
      borderWidth: 1,
      opacity: 1,
      padding: 8,
    },
    review: {
      status: 'open',
      priority: 'high',
      category: 'design',
    },
  },
];

/**
 * Inserts predefined Writer V2 templates on the current page.
 * Inputs: template id and active PDF session; output: added Writer object; fallback: unchanged result.
 */
export function getWriterQuickTemplate(
  id: WriterQuickTemplateId,
): WriterQuickTemplate {
  const template = WRITER_QUICK_TEMPLATES.find((item) => item.id === id);

  if (!template) {
    throw new Error(`Unknown Writer quick template: ${id}`);
  }

  return template;
}

export function getWriterQuickTemplatesByGroup(
  group: WriterQuickTemplate['group'],
): WriterQuickTemplate[] {
  return WRITER_QUICK_TEMPLATES.filter((template) => template.group === group);
}

export async function insertWriterQuickTemplate(
  id: WriterQuickTemplateId,
): Promise<InsertWriterQuickTemplateResult> {
  const template = getWriterQuickTemplate(id);
  const session = useSessionStore.getState();
  const writer = useWriterV2Store.getState();
  const sourceBytes = session.workingBytes ?? session.originalBytes;

  if (!sourceBytes || session.pageCount <= 0) {
    return {
      changed: false,
      message: 'Open a PDF before inserting a Writer template.',
    };
  }

  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(sourceBytes);
  const pageIndex = Math.max(
    0,
    Math.min(session.viewState.currentPage - 1, pdf.getPageCount() - 1),
  );
  const page = pdf.getPage(pageIndex);
  const pageSize = page.getSize();

  const maxZIndex = writer.elements.reduce(
    (max, element) => Math.max(max, element.style.zIndex),
    0,
  );

  const element = createElementFromTemplate({
    template,
    documentFingerprint:
      writer.currentDocumentFingerprint ??
      session.documentKey ??
      session.fileName ??
      'writer-v2-unsaved-document',
    pageIndex,
    rect: centerRect(pageSize.width, pageSize.height, template.width, template.height),
    zIndex: maxZIndex + 1,
  });

  writer.dispatchWriterCommand({
    type: 'ADD_WRITER_ELEMENT',
    element,
  });

  return {
    changed: true,
    id: element.id,
    message: `Inserted Writer template "${template.label}".`,
  };
}

function createElementFromTemplate({
  template,
  documentFingerprint,
  pageIndex,
  rect,
  zIndex,
}: {
  template: WriterQuickTemplate;
  documentFingerprint: string;
  pageIndex: number;
  rect: PdfRect;
  zIndex: number;
}): WriterElementV2 {
  const input = {
    documentFingerprint,
    pageIndex,
    rect,
    text: template.text,
    zIndex,
  };

  const element = (() => {
    switch (template.elementType) {
      case 'textStamp':
        return createTextStampElement(input);

      case 'reviewLabel':
        return createReviewLabelElement(input);

      case 'richNote':
        return createRichNoteElement(input);

      case 'textCallout':
        return createTextCalloutElement({
          ...input,
          anchorPoint: {
            x: rect.x + rect.width + 24,
            y: rect.y + rect.height / 2,
          },
        });
    }
  })();

  const now = new Date().toISOString();

  return {
    ...element,
    plainText: template.text,
    style: {
      ...element.style,
      ...template.style,
      zIndex,
    },
    review: template.review
      ? {
          ...template.review,
          commentId: createReviewId(),
          createdAt: now,
          updatedAt: now,
        }
      : element.review,
  };
}

function centerRect(
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number,
): PdfRect {
  return {
    x: pageWidth / 2 - width / 2,
    y: pageHeight / 2 - height / 2,
    width,
    height,
  };
}

function createReviewId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `review-${globalThis.crypto.randomUUID()}`;
  }

  return `review-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
