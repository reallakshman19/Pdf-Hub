import { useSessionStore } from '@/core/session/store';
import type {
  WriterElementV2,
  WriterReviewCategory,
  WriterReviewPriority,
  WriterReviewStatus,
} from '../types';
import { useWriterV2Store } from '../writerV2Store';

export interface WriterCommentSummaryRow {
  id: string;
  page: number;
  type: WriterElementV2['type'];
  text: string;
  status: WriterReviewStatus | '';
  priority: WriterReviewPriority | '';
  category: WriterReviewCategory | '';
  author: string;
  assignee: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export type WriterCommentSummaryFormat = 'csv' | 'markdown' | 'json';

const COMMENT_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'reviewLabel',
  'richNote',
]);

/**
 * Collects and serializes visible Writer review/comment objects for local file export.
 * Inputs: Writer elements and export format; output: text content or downloaded file; fallback: unchanged result.
 */
export function collectCurrentWriterCommentSummaryRows(): WriterCommentSummaryRow[] {
  const writer = useWriterV2Store.getState();

  return collectWriterCommentSummaryRows(writer.elements);
}

export function collectWriterCommentSummaryRows(
  elements: WriterElementV2[],
): WriterCommentSummaryRow[] {
  return elements
    .filter((element) => !element.hidden)
    .filter((element) => COMMENT_TYPES.has(element.type) || Boolean(element.review))
    .map((element): WriterCommentSummaryRow => ({
      id: element.review?.commentId ?? element.id,
      page: element.pageIndex + 1,
      type: element.type,
      text: normalizeText(element.plainText),
      status: element.review?.status ?? '',
      priority: element.review?.priority ?? '',
      category: element.review?.category ?? '',
      author: element.review?.author ?? '',
      assignee: element.review?.assignee ?? '',
      dueDate: element.review?.dueDate ?? '',
      createdAt: element.review?.createdAt ?? element.createdAt,
      updatedAt: element.review?.updatedAt ?? element.updatedAt,
    }))
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return a.type.localeCompare(b.type);
    });
}

export function serializeWriterCommentSummary(
  rows: WriterCommentSummaryRow[],
  format: WriterCommentSummaryFormat,
): string {
  switch (format) {
    case 'csv':
      return serializeCsv(rows);

    case 'markdown':
      return serializeMarkdown(rows);

    case 'json':
      return JSON.stringify(rows, null, 2);
  }
}

export function downloadCurrentWriterCommentSummary(
  format: WriterCommentSummaryFormat,
): {
  changed: boolean;
  message: string;
} {
  const rows = collectCurrentWriterCommentSummaryRows();

  if (rows.length === 0) {
    return {
      changed: false,
      message: 'No visible Writer comments or review objects to export.',
    };
  }

  const session = useSessionStore.getState();
  const baseName = safeBaseName(session.fileName ?? 'writer-comments');
  const extension = format === 'markdown' ? 'md' : format;
  const text = serializeWriterCommentSummary(rows, format);
  const mimeType = mimeTypeForFormat(format);

  downloadTextFile(
    `${baseName}.writer-comments.${extension}`,
    text,
    mimeType,
  );

  return {
    changed: true,
    message: `Exported ${rows.length} Writer comment(s).`,
  };
}

function serializeCsv(rows: WriterCommentSummaryRow[]): string {
  const headers: Array<keyof WriterCommentSummaryRow> = [
    'id',
    'page',
    'type',
    'text',
    'status',
    'priority',
    'category',
    'author',
    'assignee',
    'dueDate',
    'createdAt',
    'updatedAt',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => csvCell(String(row[header] ?? '')))
        .join(','),
    ),
  ];

  return `${lines.join('\n')}\n`;
}

function serializeMarkdown(rows: WriterCommentSummaryRow[]): string {
  const lines = [
    '# Writer Comment Summary',
    '',
    `Total comments: ${rows.length}`,
    '',
    '| Page | Type | Status | Priority | Category | Assignee | Text |',
    '|---:|---|---|---|---|---|---|',
    ...rows.map((row) =>
      `| ${row.page} | ${escapeMarkdown(row.type)} | ${escapeMarkdown(row.status)} | ${escapeMarkdown(row.priority)} | ${escapeMarkdown(row.category)} | ${escapeMarkdown(row.assignee)} | ${escapeMarkdown(row.text)} |`,
    ),
    '',
  ];

  return lines.join('\n');
}

function csvCell(value: string): string {
  const escaped = value.replaceAll('"', '""');

  return `"${escaped}"`;
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeBaseName(fileName: string): string {
  return fileName
    .replace(/\.pdfhub\.zip$/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'writer-comments';
}

function mimeTypeForFormat(format: WriterCommentSummaryFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv;charset=utf-8';

    case 'markdown':
      return 'text/markdown;charset=utf-8';

    case 'json':
      return 'application/json;charset=utf-8';
  }
}

function downloadTextFile(
  filename: string,
  text: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
