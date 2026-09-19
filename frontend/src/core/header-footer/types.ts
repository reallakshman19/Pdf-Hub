import type { PageId } from '@/core/pages/types';

export const HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION = 1 as const;

export type HeaderFooterTemplateSchemaVersion =
  typeof HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION;

export type HeaderFooterBand = 'header' | 'footer';
export type HeaderFooterHorizontalSlot = 'left' | 'center' | 'right';
export type HeaderFooterParity = 'all' | 'odd' | 'even';

export type HeaderFooterStaticToken =
  | 'physicalPage'
  | 'pageLabel'
  | 'pageCount'
  | 'sectionPage'
  | 'sectionPageCount'
  | 'fileName'
  | 'title'
  | 'author'
  | 'date'
  | 'time';

export const HEADER_FOOTER_STATIC_TOKENS: readonly HeaderFooterStaticToken[] = [
  'physicalPage',
  'pageLabel',
  'pageCount',
  'sectionPage',
  'sectionPageCount',
  'fileName',
  'title',
  'author',
  'date',
  'time',
];

export type HeaderFooterIncludeSelector =
  | { mode: 'all' }
  | { mode: 'pageIds'; pageIds: PageId[] }
  | { mode: 'range'; startPageId: PageId; endPageId: PageId }
  | { mode: 'pageLabelRange'; startPageId: PageId };

export interface HeaderFooterPageSelector {
  include: HeaderFooterIncludeSelector;
  /**
   * Odd/even is based on the current one-based physical page position.
   * Logical PageLabels are deliberately not used for parity.
   */
  parity?: HeaderFooterParity;
  excludeFirstPhysicalPage?: boolean;
  excludeLastPhysicalPage?: boolean;
}

export interface HeaderFooterTextStyle {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  opacity: number;
}

export type HeaderFooterTextStyleOverride = Partial<HeaderFooterTextStyle>;

export interface HeaderFooterTextContent {
  kind: 'text';
  /**
   * Canonical tokens use {{tokenName}}. Dynamic values use:
   * {{metadata:key}} and {{var:key}}.
   */
  template: string;
  style?: HeaderFooterTextStyleOverride;
}

export interface HeaderFooterImageContent {
  kind: 'image';
  /**
   * Image bytes stay out-of-band in CommandResources.binaries.
   * This serializable resource ID is the only reference stored in templates.
   */
  binaryResourceId: string;
  widthPt: number;
  heightPt?: number;
  opacity?: number;
  fit?: 'contain' | 'cover';
  altText?: string;
}

export type HeaderFooterContent =
  | HeaderFooterTextContent
  | HeaderFooterImageContent;

export interface HeaderFooterSeparator {
  thicknessPt: number;
  color: string;
  opacity?: number;
  insetLeftPt?: number;
  insetRightPt?: number;
}

export interface HeaderFooterBandTemplate {
  left?: HeaderFooterContent;
  center?: HeaderFooterContent;
  right?: HeaderFooterContent;
  /**
   * Header separator is rendered below the header band.
   * Footer separator is rendered above the footer band.
   */
  separator?: HeaderFooterSeparator;
}

export interface HeaderFooterLayout {
  leftMarginPt: number;
  rightMarginPt: number;
  headerOffsetFromTopPt: number;
  footerOffsetFromBottomPt: number;
}

export interface HeaderFooterRule {
  id: string;
  selector: HeaderFooterPageSelector;
  header?: HeaderFooterBandTemplate;
  footer?: HeaderFooterBandTemplate;
}

/**
 * Canonical professional header/footer template.
 *
 * Rules are evaluated in array order. If multiple rules match a page, a later
 * rule overrides only the slots/separator it defines; unspecified values from
 * earlier matching rules remain in effect. This gives cover/front-matter/body
 * overrides deterministic semantics without a second template model.
 */
export interface HeaderFooterTemplate {
  schemaVersion: HeaderFooterTemplateSchemaVersion;
  name?: string;
  layout: HeaderFooterLayout;
  defaultTextStyle: HeaderFooterTextStyle;
  rules: HeaderFooterRule[];
}
