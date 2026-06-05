import type {
  WriterElementV2,
  WriterReviewCategory,
  WriterReviewMetadata,
  WriterReviewPriority,
  WriterReviewStatus,
} from './types';
import { useWriterV2Store } from './writerV2Store';

export interface WriterReviewActionResult {
  changed: boolean;
  message: string;
}

export interface WriterReviewPatch {
  status?: WriterReviewStatus;
  priority?: WriterReviewPriority;
  category?: WriterReviewCategory;
  author?: string;
  assignee?: string;
  dueDate?: string;
}

const REVIEWABLE_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'reviewLabel',
  'richNote',
]);

/**
 * Mutates review metadata on the active Writer V2 object through the command store.
 * Inputs: active selected element and explicit patch fields; output: action result; fallback: returns unchanged.
 */
export function isReviewableWriterElement(element: WriterElementV2): boolean {
  return REVIEWABLE_TYPES.has(element.type);
}

export function ensureActiveWriterReviewMetadata(): WriterReviewActionResult {
  const element = getActiveReviewableElement();

  if (!element) {
    return {
      changed: false,
      message: 'No reviewable Writer object selected.',
    };
  }

  if (element.review) {
    return {
      changed: false,
      message: 'Selected Writer object already has review metadata.',
    };
  }

  const now = new Date().toISOString();

  const review: WriterReviewMetadata = {
    status: 'open',
    priority: 'medium',
    category: defaultCategoryForType(element.type),
    commentId: createReviewId(),
    createdAt: now,
    updatedAt: now,
  };

  const store = useWriterV2Store.getState();

  const result = store.dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id: element.id,
    patch: {
      review,
    },
  });

  return {
    changed: result.changed,
    message: result.changed
      ? 'Added review metadata to Writer object.'
      : result.reason,
  };
}

export function updateActiveWriterReviewMetadata(
  patch: WriterReviewPatch,
): WriterReviewActionResult {
  const element = getActiveReviewableElement();

  if (!element) {
    return {
      changed: false,
      message: 'No reviewable Writer object selected.',
    };
  }

  const now = new Date().toISOString();
  const previous = element.review;

  const review: WriterReviewMetadata = {
    status: patch.status ?? previous?.status ?? 'open',
    priority: patch.priority ?? previous?.priority ?? 'medium',
    category: patch.category ?? previous?.category ?? defaultCategoryForType(element.type),
    author: patch.author ?? previous?.author,
    assignee: patch.assignee ?? previous?.assignee,
    dueDate: patch.dueDate ?? previous?.dueDate,
    commentId: previous?.commentId ?? createReviewId(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  const store = useWriterV2Store.getState();

  const result = store.dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id: element.id,
    patch: {
      review,
    },
  });

  return {
    changed: result.changed,
    message: result.changed
      ? 'Updated Writer review metadata.'
      : result.reason,
  };
}

export function clearActiveWriterReviewMetadata(): WriterReviewActionResult {
  const element = getActiveReviewableElement();

  if (!element) {
    return {
      changed: false,
      message: 'No reviewable Writer object selected.',
    };
  }

  const store = useWriterV2Store.getState();

  const result = store.dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id: element.id,
    patch: {
      review: undefined,
    },
  });

  return {
    changed: result.changed,
    message: result.changed
      ? 'Cleared Writer review metadata.'
      : result.reason,
  };
}

export function markActiveWriterReviewResolved(): WriterReviewActionResult {
  return updateActiveWriterReviewMetadata({
    status: 'resolved',
  });
}

export function getActiveReviewableElement(): WriterElementV2 | null {
  const store = useWriterV2Store.getState();
  const activeId = store.activeId ?? store.selectedIds.at(-1);

  if (!activeId) return null;

  const element = store.elements.find((item) => item.id === activeId);

  if (!element || element.locked || element.hidden || !isReviewableWriterElement(element)) {
    return null;
  }

  return element;
}

function defaultCategoryForType(
  type: WriterElementV2['type'],
): WriterReviewCategory {
  switch (type) {
    case 'textCallout':
      return 'engineering';

    case 'reviewLabel':
      return 'qa';

    case 'richNote':
      return 'general';

    case 'richTextBox':
      return 'general';

    default:
      return 'general';
  }
}

function createReviewId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `review-${globalThis.crypto.randomUUID()}`;
  }

  return `review-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
