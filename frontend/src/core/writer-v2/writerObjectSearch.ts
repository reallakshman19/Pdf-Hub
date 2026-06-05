import type {
  WriterElementV2,
  WriterReviewCategory,
  WriterReviewPriority,
  WriterReviewStatus,
} from './types';

export type WriterObjectSearchTypeFilter =
  | 'all'
  | WriterElementV2['type'];

export interface WriterObjectSearchQuery {
  text?: string;
  type?: WriterObjectSearchTypeFilter;
  page?: number | 'all';
  includeHidden?: boolean;
  reviewStatus?: WriterReviewStatus | 'all';
  reviewPriority?: WriterReviewPriority | 'all';
  reviewCategory?: WriterReviewCategory | 'all';
  onlyWithReview?: boolean;
}

export interface WriterObjectSearchResult {
  id: string;
  page: number;
  type: WriterElementV2['type'];
  label: string;
  text: string;
  hidden: boolean;
  locked: boolean;
  reviewStatus?: WriterReviewStatus;
  reviewPriority?: WriterReviewPriority;
  reviewCategory?: WriterReviewCategory;
}

/**
 * Filters Writer V2 objects by text, page, type, visibility, and review metadata.
 * Inputs: Writer elements plus query; output: sorted search rows; fallback: empty result.
 */
export function searchWriterObjects(
  elements: WriterElementV2[],
  query: WriterObjectSearchQuery,
): WriterObjectSearchResult[] {
  const normalizedText = normalize(query.text ?? '');
  const type = query.type ?? 'all';
  const page = query.page ?? 'all';
  const includeHidden = query.includeHidden ?? false;
  const reviewStatus = query.reviewStatus ?? 'all';
  const reviewPriority = query.reviewPriority ?? 'all';
  const reviewCategory = query.reviewCategory ?? 'all';
  const onlyWithReview = query.onlyWithReview ?? false;

  return elements
    .filter((element) => includeHidden || !element.hidden)
    .filter((element) => type === 'all' || element.type === type)
    .filter((element) => page === 'all' || element.pageIndex + 1 === page)
    .filter((element) => !onlyWithReview || Boolean(element.review))
    .filter((element) => reviewStatus === 'all' || element.review?.status === reviewStatus)
    .filter((element) => reviewPriority === 'all' || element.review?.priority === reviewPriority)
    .filter((element) => reviewCategory === 'all' || element.review?.category === reviewCategory)
    .filter((element) => {
      if (!normalizedText) return true;

      const searchable = normalize([
        element.id,
        element.type,
        element.plainText ?? '',
        element.review?.status ?? '',
        element.review?.priority ?? '',
        element.review?.category ?? '',
        element.review?.author ?? '',
        element.review?.assignee ?? '',
        element.review?.dueDate ?? '',
      ].join(' '));

      return searchable.includes(normalizedText);
    })
    .map(toSearchResult)
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      const labelCompare = a.label.localeCompare(b.label);
      if (labelCompare !== 0) return labelCompare;
      return a.id.localeCompare(b.id);
    });
}

export function writerObjectTypeLabel(type: WriterElementV2['type']): string {
  switch (type) {
    case 'richTextBox':
      return 'Text Box';

    case 'textCallout':
      return 'Callout';

    case 'textStamp':
      return 'Stamp';

    case 'reviewLabel':
      return 'Review Label';

    case 'richNote':
      return 'Note';

    case 'tableBox':
      return 'Table';

    case 'imageBox':
      return 'Image';

    default:
      return type;
  }
}

function toSearchResult(element: WriterElementV2): WriterObjectSearchResult {
  const text = normalizeDisplayText(element.plainText);

  return {
    id: element.id,
    page: element.pageIndex + 1,
    type: element.type,
    label: `${writerObjectTypeLabel(element.type)} - ${text || shortId(element.id)}`,
    text,
    hidden: element.hidden,
    locked: element.locked,
    reviewStatus: element.review?.status,
    reviewPriority: element.review?.priority,
    reviewCategory: element.review?.category,
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDisplayText(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}
