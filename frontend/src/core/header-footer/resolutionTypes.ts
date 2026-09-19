import type { PageId } from '@/core/pages/types';
import type {
  HeaderFooterLayout,
  HeaderFooterSeparator,
  HeaderFooterTextStyle,
} from './types';

export interface HeaderFooterResolutionContext {
  fileName: string;
  title?: string;
  author?: string;
  now: Date;
  /**
   * Optional already-formatted values. If omitted, resolver uses deterministic
   * UTC ISO date/time text rather than environment locale formatting.
   */
  dateText?: string;
  timeText?: string;
  metadata?: Readonly<Record<string, string>>;
  variables?: Readonly<Record<string, string>>;
}

export interface ResolvedHeaderFooterTextContent {
  kind: 'text';
  text: string;
  style: HeaderFooterTextStyle;
}

export interface ResolvedHeaderFooterImageContent {
  kind: 'image';
  binaryResourceId: string;
  widthPt: number;
  heightPt?: number;
  opacity: number;
  fit: 'contain' | 'cover';
  altText?: string;
}

export type ResolvedHeaderFooterContent =
  | ResolvedHeaderFooterTextContent
  | ResolvedHeaderFooterImageContent;

export interface ResolvedHeaderFooterSeparator
  extends Required<
    Pick<HeaderFooterSeparator, 'thicknessPt' | 'color' | 'opacity'>
  > {
  insetLeftPt: number;
  insetRightPt: number;
}

export interface ResolvedHeaderFooterBand {
  left?: ResolvedHeaderFooterContent;
  center?: ResolvedHeaderFooterContent;
  right?: ResolvedHeaderFooterContent;
  separator?: ResolvedHeaderFooterSeparator;
}

export interface ResolvedHeaderFooterPage {
  pageId: PageId;
  physicalPageNumber: number;
  logicalPageLabel: string;
  sectionPageNumber: number;
  sectionPageCount: number;
  layout: HeaderFooterLayout;
  header?: ResolvedHeaderFooterBand;
  footer?: ResolvedHeaderFooterBand;
}

export type HeaderFooterResolutionResult =
  | {
      ok: true;
      pages: ResolvedHeaderFooterPage[];
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };
