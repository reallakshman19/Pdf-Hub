import type { PageGraph, PageNode } from '@/core/pages/types';
import {
  HEADER_FOOTER_STATIC_TOKENS,
  HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION,
  type HeaderFooterBandTemplate,
  type HeaderFooterContent,
  type HeaderFooterPageSelector,
  type HeaderFooterSeparator,
  type HeaderFooterTemplate,
  type HeaderFooterTextStyle,
  type HeaderFooterTextStyleOverride,
} from './types';

export interface HeaderFooterTemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const STATIC_TOKENS = new Set<string>(HEADER_FOOTER_STATIC_TOKENS);

export function validateHeaderFooterTemplate(
  template: HeaderFooterTemplate,
  pageGraph: PageGraph<PageNode>,
): HeaderFooterTemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (template.schemaVersion !== HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION}.`,
    );
  }

  validateLayout(template, errors);
  validateTextStyle(template.defaultTextStyle, 'defaultTextStyle', errors);

  if (!Array.isArray(template.rules) || template.rules.length === 0) {
    errors.push('rules must contain at least one rule.');
  } else {
    const seenRuleIds = new Set<string>();
    template.rules.forEach((rule, index) => {
      const path = `rules[${index}]`;
      const id = rule.id?.trim();
      if (!id) {
        errors.push(`${path}.id is required.`);
      } else if (seenRuleIds.has(id)) {
        errors.push(`${path}.id duplicates rule id "${id}".`);
      } else {
        seenRuleIds.add(id);
      }

      validateSelector(rule.selector, pageGraph, `${path}.selector`, errors, warnings);

      const hasHeader = Boolean(rule.header);
      const hasFooter = Boolean(rule.footer);
      if (!hasHeader && !hasFooter) {
        errors.push(`${path} must define header or footer content.`);
      }

      if (rule.header) {
        validateBand(rule.header, `${path}.header`, errors);
      }
      if (rule.footer) {
        validateBand(rule.footer, `${path}.footer`, errors);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateLayout(
  template: HeaderFooterTemplate,
  errors: string[],
): void {
  const layout = template.layout;
  if (!layout || typeof layout !== 'object') {
    errors.push('layout is required.');
    return;
  }

  validateNonNegativeFinite(
    layout.leftMarginPt,
    'layout.leftMarginPt',
    errors,
  );
  validateNonNegativeFinite(
    layout.rightMarginPt,
    'layout.rightMarginPt',
    errors,
  );
  validateNonNegativeFinite(
    layout.headerOffsetFromTopPt,
    'layout.headerOffsetFromTopPt',
    errors,
  );
  validateNonNegativeFinite(
    layout.footerOffsetFromBottomPt,
    'layout.footerOffsetFromBottomPt',
    errors,
  );
}

function validateSelector(
  selector: HeaderFooterPageSelector,
  pageGraph: PageGraph<PageNode>,
  path: string,
  errors: string[],
  warnings: string[],
): void {
  if (!selector || typeof selector !== 'object' || !selector.include) {
    errors.push(`${path}.include is required.`);
    return;
  }

  const pageIndexById = new Map(
    pageGraph.pages.map((page, index) => [page.pageId, index] as const),
  );

  switch (selector.include.mode) {
    case 'all':
      break;

    case 'pageIds': {
      const ids = selector.include.pageIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        errors.push(`${path}.include.pageIds must contain at least one PageId.`);
        break;
      }
      if (new Set(ids).size !== ids.length) {
        errors.push(`${path}.include.pageIds must not contain duplicates.`);
      }
      ids.forEach((pageId) => {
        if (!pageIndexById.has(pageId)) {
          errors.push(`${path}.include.pageIds contains unknown PageId "${pageId}".`);
        }
      });
      break;
    }

    case 'range': {
      if (!pageIndexById.has(selector.include.startPageId)) {
        errors.push(
          `${path}.include.startPageId does not exist: "${selector.include.startPageId}".`,
        );
      }
      if (!pageIndexById.has(selector.include.endPageId)) {
        errors.push(
          `${path}.include.endPageId does not exist: "${selector.include.endPageId}".`,
        );
      }
      break;
    }

    case 'pageLabelRange': {
      const exists = pageGraph.pageLabelRanges?.some(
        (range) => range.startPageId === selector.include.startPageId,
      );
      if (!exists) {
        errors.push(
          `${path}.include.startPageId must identify a canonical PageLabel range start.`,
        );
      }
      break;
    }

    default:
      assertNever(selector.include);
  }

  if (
    selector.parity !== undefined
    && selector.parity !== 'all'
    && selector.parity !== 'odd'
    && selector.parity !== 'even'
  ) {
    errors.push(`${path}.parity must be all, odd, or even.`);
  }

  if (
    selector.excludeFirstPhysicalPage
    && selector.excludeLastPhysicalPage
    && pageGraph.pages.length <= 2
  ) {
    warnings.push(
      `${path} excludes both first and last pages in a document with ${pageGraph.pages.length} page(s); it may match no pages.`,
    );
  }
}

function validateBand(
  band: HeaderFooterBandTemplate,
  path: string,
  errors: string[],
): void {
  const slots: Array<['left' | 'center' | 'right', HeaderFooterContent | undefined]> = [
    ['left', band.left],
    ['center', band.center],
    ['right', band.right],
  ];

  const hasSlot = slots.some(([, content]) => Boolean(content));
  if (!hasSlot) {
    errors.push(`${path} must define at least one content slot.`);
  }

  slots.forEach(([slot, content]) => {
    if (content) validateContent(content, `${path}.${slot}`, errors);
  });

  if (band.separator) {
    validateSeparator(band.separator, `${path}.separator`, errors);
  }
}

function validateContent(
  content: HeaderFooterContent,
  path: string,
  errors: string[],
): void {
  if (content.kind === 'text') {
    if (!content.template || content.template.trim().length === 0) {
      errors.push(`${path}.template is required.`);
    } else {
      validateTokens(content.template, `${path}.template`, errors);
    }
    if (content.style) {
      validateTextStyleOverride(content.style, `${path}.style`, errors);
    }
    return;
  }

  if (content.kind === 'image') {
    if (!content.binaryResourceId || content.binaryResourceId.trim().length === 0) {
      errors.push(`${path}.binaryResourceId is required.`);
    }
    validatePositiveFinite(content.widthPt, `${path}.widthPt`, errors);
    if (content.heightPt !== undefined) {
      validatePositiveFinite(content.heightPt, `${path}.heightPt`, errors);
    }
    if (content.opacity !== undefined) {
      validateOpacity(content.opacity, `${path}.opacity`, errors);
    }
    if (
      content.fit !== undefined
      && content.fit !== 'contain'
      && content.fit !== 'cover'
    ) {
      errors.push(`${path}.fit must be contain or cover.`);
    }
    return;
  }

  assertNever(content);
}

function validateSeparator(
  separator: HeaderFooterSeparator,
  path: string,
  errors: string[],
): void {
  validatePositiveFinite(separator.thicknessPt, `${path}.thicknessPt`, errors);
  validateColor(separator.color, `${path}.color`, errors);
  if (separator.opacity !== undefined) {
    validateOpacity(separator.opacity, `${path}.opacity`, errors);
  }
  if (separator.insetLeftPt !== undefined) {
    validateNonNegativeFinite(separator.insetLeftPt, `${path}.insetLeftPt`, errors);
  }
  if (separator.insetRightPt !== undefined) {
    validateNonNegativeFinite(separator.insetRightPt, `${path}.insetRightPt`, errors);
  }
}

function validateTextStyle(
  style: HeaderFooterTextStyle,
  path: string,
  errors: string[],
): void {
  if (!style || typeof style !== 'object') {
    errors.push(`${path} is required.`);
    return;
  }
  if (!style.fontFamily || style.fontFamily.trim().length === 0) {
    errors.push(`${path}.fontFamily is required.`);
  }
  validatePositiveFinite(style.fontSizePt, `${path}.fontSizePt`, errors);
  validateColor(style.color, `${path}.color`, errors);
  validateOpacity(style.opacity, `${path}.opacity`, errors);

  if (style.fontWeight !== 'normal' && style.fontWeight !== 'bold') {
    errors.push(`${path}.fontWeight must be normal or bold.`);
  }
  if (style.fontStyle !== 'normal' && style.fontStyle !== 'italic') {
    errors.push(`${path}.fontStyle must be normal or italic.`);
  }
}

function validateTextStyleOverride(
  style: HeaderFooterTextStyleOverride,
  path: string,
  errors: string[],
): void {
  if (style.fontFamily !== undefined && style.fontFamily.trim().length === 0) {
    errors.push(`${path}.fontFamily must not be empty.`);
  }
  if (style.fontSizePt !== undefined) {
    validatePositiveFinite(style.fontSizePt, `${path}.fontSizePt`, errors);
  }
  if (style.color !== undefined) {
    validateColor(style.color, `${path}.color`, errors);
  }
  if (style.opacity !== undefined) {
    validateOpacity(style.opacity, `${path}.opacity`, errors);
  }
  if (
    style.fontWeight !== undefined
    && style.fontWeight !== 'normal'
    && style.fontWeight !== 'bold'
  ) {
    errors.push(`${path}.fontWeight must be normal or bold.`);
  }
  if (
    style.fontStyle !== undefined
    && style.fontStyle !== 'normal'
    && style.fontStyle !== 'italic'
  ) {
    errors.push(`${path}.fontStyle must be normal or italic.`);
  }
}

function validateTokens(
  template: string,
  path: string,
  errors: string[],
): void {
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const token = match[1]?.trim() ?? '';
    if (STATIC_TOKENS.has(token)) continue;

    if (token.startsWith('metadata:') && token.slice('metadata:'.length).trim()) {
      continue;
    }
    if (token.startsWith('var:') && token.slice('var:'.length).trim()) {
      continue;
    }

    errors.push(`${path} contains unsupported token "{{${token}}}".`);
  }
}

function validatePositiveFinite(
  value: number,
  path: string,
  errors: string[],
): void {
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`${path} must be a positive finite number.`);
  }
}

function validateNonNegativeFinite(
  value: number,
  path: string,
  errors: string[],
): void {
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${path} must be a non-negative finite number.`);
  }
}

function validateOpacity(
  value: number,
  path: string,
  errors: string[],
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${path} must be between 0 and 1.`);
  }
}

function validateColor(
  value: string,
  path: string,
  errors: string[],
): void {
  if (!HEX_COLOR_PATTERN.test(value)) {
    errors.push(`${path} must be a six-digit hex color such as #1A2B3C.`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported header/footer domain value: ${JSON.stringify(value)}`);
}
