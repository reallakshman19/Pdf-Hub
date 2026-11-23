import type { ExistingTextSpan } from './types';
import type { ExistingTextUiCapability } from '@/adapters/pdf-text/PdfLibExistingTextUiEvaluation';

export interface BatchFindReplaceOptions {
  query: string;
  replacement: string;
  caseSensitive?: boolean;
  matchWholeWord?: boolean;
  useRegex?: boolean;
  pageIndices?: number[];
}

export interface FindReplaceMatch {
  matchId: string;
  pageIndex: number;
  pageId: string;
  span: ExistingTextSpan;
  matchStartIndex: number;
  matchEndIndex: number;
  originalSpanText: string;
  replacementSpanText: string;
  matchedSubstring: string;
  capability?: ExistingTextUiCapability;
  selected: boolean;
}

export interface BatchFindReplaceScanResult {
  query: string;
  replacement: string;
  totalMatches: number;
  matchesByPage: Record<number, FindReplaceMatch[]>;
  allMatches: FindReplaceMatch[];
}
