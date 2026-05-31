import type { PdfAnnotation } from '@/core/annotations/types';
import type { ReviewSummaryExport } from './types';

export function exportReviewSummary(annotations: PdfAnnotation[]): ReviewSummaryExport {
  const summary: ReviewSummaryExport = {
    totalAnnotations: annotations.length,
    resolvedCount: 0,
    openCount: 0,
    rejectedCount: 0,
    annotations: [],
    generatedAt: Date.now(),
  };

  for (const a of annotations) {
    const status = a.data.review?.status || 'open';
    if (status === 'resolved') summary.resolvedCount++;
    else if (status === 'rejected') summary.rejectedCount++;
    else summary.openCount++;

    const textPreview = typeof a.data.text === 'string' && a.data.text.trim()
      ? a.data.text
      : a.type.toUpperCase();

    summary.annotations.push({
      id: a.id,
      pageNumber: a.pageNumber,
      type: a.type,
      status: status,
      author: a.data.review?.author || 'Unknown',
      title: a.data.review?.title,
      category: a.data.review?.category,
      textPreview,
      createdAt: a.data.review?.createdAt || a.createdAt,
      replyCount: a.data.review?.replies?.length || 0,
    });
  }

  // Sort annotations by page number, then by creation date
  summary.annotations.sort((a, b) => a.pageNumber - b.pageNumber || b.createdAt - a.createdAt);

  return summary;
}

export function formatReviewSummaryText(summary: ReviewSummaryExport): string {
  let text = `REVIEW SUMMARY\n`;
  text += `Generated: ${new Date(summary.generatedAt).toLocaleString()}\n`;
  text += `Total Annotations: ${summary.totalAnnotations}\n`;
  text += `Resolved: ${summary.resolvedCount}\n`;
  text += `Open: ${summary.openCount}\n`;
  text += `Rejected: ${summary.rejectedCount}\n\n`;

  text += `--- ANNOTATIONS ---\n\n`;

  for (const a of summary.annotations) {
    text += `[Page ${a.pageNumber}] ${a.type.toUpperCase()} - Status: ${a.status.toUpperCase()}\n`;
    text += `Author: ${a.author}\n`;
    if (a.title) text += `Title: ${a.title}\n`;
    if (a.category) text += `Category: ${a.category}\n`;
    text += `Created: ${new Date(a.createdAt).toLocaleString()}\n`;
    text += `Replies: ${a.replyCount}\n`;
    text += `Text: ${a.textPreview}\n`;
    text += `\n`;
  }

  return text;
}
