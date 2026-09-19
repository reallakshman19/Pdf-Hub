import {
  HEADER_FOOTER_STATIC_TOKENS,
  type HeaderFooterBandTemplate,
  type HeaderFooterContent,
  type HeaderFooterLayout,
  type HeaderFooterSeparator,
  type HeaderFooterTextStyle,
  type HeaderFooterTextStyleOverride,
} from './types';

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const STATIC_TOKENS = new Set<string>(HEADER_FOOTER_STATIC_TOKENS);

export function validateHeaderFooterLayout(
  layout: HeaderFooterLayout,
  path: string,
  errors: string[],
): void {
  if (!layout || typeof layout !== 'object') {
    errors.push(`${path} is required.`);
    return;
  }

  validateNonNegativeFinite(layout.leftMarginPt, `${path}.leftMarginPt`, errors);
  validateNonNegativeFinite(layout.rightMarginPt, `${path}.rightMarginPt`, errors);
  validateNonNegativeFinite(
    layout.headerOffsetFromTopPt,
    `${path}.headerOffsetFromTopPt`,
    errors,
  );
  validateNonNegativeFinite(
    layout.footerOffsetFromBottomPt,
    `${path}.footerOffsetFromBottomPt`,
    errors,
  );
}

export function validateHeaderFooterTextStyle(
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

export function validateHeaderFooterBand(
  band: HeaderFooterBandTemplate,
  path: string,
  errors: string[],
): void {
  const slots: Array<
    ['left' | 'center' | 'right', HeaderFooterContent | undefined]
  > = [
    ['left', band.left],
    ['center', band.center],
    ['right', band.right],
  ];

  if (!slots.some(([, content]) => Boolean(content))) {
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
  throw new Error(
    `Unsupported header/footer content value: ${JSON.stringify(value)}`,
  );
}
