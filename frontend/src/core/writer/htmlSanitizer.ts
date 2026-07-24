export interface HtmlSanitizerLimits {
  maxInputBytes: number;
  maxNodes: number;
  maxDepth: number;
  maxDataImageBytes: number;
  maxFallbackTextCharacters: number;
}

export interface HtmlSanitizationReport {
  html: string;
  inputBytes: number;
  visitedNodes: number;
  droppedNodes: number;
  droppedAttributes: number;
  truncated: boolean;
}

export const DEFAULT_HTML_SANITIZER_LIMITS: HtmlSanitizerLimits = Object.freeze({
  maxInputBytes: 2 * 1024 * 1024,
  maxNodes: 10_000,
  maxDepth: 64,
  maxDataImageBytes: 5 * 1024 * 1024,
  maxFallbackTextCharacters: 8_000,
});

const ALLOWED_TAGS = new Set([
  'A', 'B', 'I', 'U', 'S', 'STRIKE', 'STRONG', 'EM', 'MARK', 'SUB', 'SUP',
  'P', 'DIV', 'SPAN', 'BR', 'HR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
  'BLOCKQUOTE', 'PRE', 'CODE', 'IMG',
]);

const DROP_SUBTREE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'META', 'LINK', 'BASE', 'IFRAME', 'FRAME', 'FRAMESET',
  'OBJECT', 'EMBED', 'APPLET', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT',
  'OPTION', 'OPTGROUP', 'DATALIST', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT',
  'AUDIO', 'VIDEO', 'SOURCE', 'TRACK', 'CANVAS',
]);

const GLOBAL_ATTRIBUTES = new Set(['title', 'dir', 'lang', 'style']);
const TAG_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  A: new Set(['href']),
  IMG: new Set(['src', 'alt', 'width', 'height']),
  TABLE: new Set(['cellpadding', 'cellspacing', 'border', 'width']),
  TH: new Set(['colspan', 'rowspan', 'width', 'height', 'scope']),
  TD: new Set(['colspan', 'rowspan', 'width', 'height']),
  OL: new Set(['start', 'reversed', 'type']),
  LI: new Set(['value']),
};

const SAFE_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'text-align',
  'text-decoration',
  'white-space',
  'width',
  'height',
  'max-width',
  'max-height',
  'object-fit',
  'vertical-align',
]);

interface SanitizerState {
  limits: HtmlSanitizerLimits;
  visitedNodes: number;
  droppedNodes: number;
  droppedAttributes: number;
  truncated: boolean;
}

const textEncoder = new TextEncoder();

function resolveLimits(overrides: Partial<HtmlSanitizerLimits>): HtmlSanitizerLimits {
  const defaults = DEFAULT_HTML_SANITIZER_LIMITS;
  const positive = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) && (value ?? 0) >= 1 ? Math.floor(value as number) : fallback;

  return {
    maxInputBytes: positive(overrides.maxInputBytes, defaults.maxInputBytes),
    maxNodes: positive(overrides.maxNodes, defaults.maxNodes),
    maxDepth: positive(overrides.maxDepth, defaults.maxDepth),
    maxDataImageBytes: positive(overrides.maxDataImageBytes, defaults.maxDataImageBytes),
    maxFallbackTextCharacters: positive(
      overrides.maxFallbackTextCharacters,
      defaults.maxFallbackTextCharacters,
    ),
  };
}

export function sanitizeHtml(
  html: string,
  limits: Partial<HtmlSanitizerLimits> = {},
): string {
  return sanitizeHtmlWithReport(html, limits).html;
}

export function sanitizeHtmlWithReport(
  html: string,
  limitOverrides: Partial<HtmlSanitizerLimits> = {},
): HtmlSanitizationReport {
  const limits = resolveLimits(limitOverrides);
  const inputBytes = textEncoder.encode(html).byteLength;

  if (inputBytes > limits.maxInputBytes) {
    const fallback = html.slice(0, limits.maxFallbackTextCharacters);
    return {
      html: `<p>${escapeHtml(fallback)}${html.length > fallback.length ? '…' : ''}</p>`,
      inputBytes,
      visitedNodes: 0,
      droppedNodes: 0,
      droppedAttributes: 0,
      truncated: true,
    };
  }

  const parser = new DOMParser();
  const sourceDocument = parser.parseFromString(html, 'text/html');
  const outputContainer = sourceDocument.createElement('div');
  const state: SanitizerState = {
    limits,
    visitedNodes: 0,
    droppedNodes: 0,
    droppedAttributes: 0,
    truncated: false,
  };

  for (const child of Array.from(sourceDocument.body.childNodes)) {
    const safeNode = reconstructNode(child, sourceDocument, state, 0);
    if (safeNode) outputContainer.appendChild(safeNode);
    if (state.truncated) break;
  }

  return {
    html: outputContainer.innerHTML,
    inputBytes,
    visitedNodes: state.visitedNodes,
    droppedNodes: state.droppedNodes,
    droppedAttributes: state.droppedAttributes,
    truncated: state.truncated,
  };
}

function reconstructNode(
  source: Node,
  document: Document,
  state: SanitizerState,
  depth: number,
): Node | null {
  if (state.truncated) return null;

  state.visitedNodes += 1;
  if (state.visitedNodes > state.limits.maxNodes || depth > state.limits.maxDepth) {
    state.truncated = true;
    state.droppedNodes += 1;
    return null;
  }

  if (source.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(source.textContent ?? '');
  }

  if (source.nodeType !== Node.ELEMENT_NODE) {
    state.droppedNodes += 1;
    return null;
  }

  const sourceElement = source as HTMLElement;
  const tag = sourceElement.tagName.toUpperCase();

  if (DROP_SUBTREE_TAGS.has(tag)) {
    state.droppedNodes += 1;
    return null;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = document.createDocumentFragment();
    for (const child of Array.from(sourceElement.childNodes)) {
      const safeChild = reconstructNode(child, document, state, depth + 1);
      if (safeChild) fragment.appendChild(safeChild);
      if (state.truncated) break;
    }
    state.droppedNodes += 1;
    return fragment;
  }

  const outputElement = document.createElement(tag.toLowerCase());
  copySafeAttributes(sourceElement, outputElement, state);

  for (const child of Array.from(sourceElement.childNodes)) {
    const safeChild = reconstructNode(child, document, state, depth + 1);
    if (safeChild) outputElement.appendChild(safeChild);
    if (state.truncated) break;
  }

  if (tag === 'A' && outputElement.hasAttribute('href')) {
    outputElement.setAttribute('rel', 'noopener noreferrer');
  }

  return outputElement;
}

function copySafeAttributes(
  source: HTMLElement,
  output: HTMLElement,
  state: SanitizerState,
): void {
  const tag = source.tagName.toUpperCase();
  const tagAttributes = TAG_ATTRIBUTES[tag] ?? new Set<string>();

  for (const attribute of Array.from(source.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on') || (!GLOBAL_ATTRIBUTES.has(name) && !tagAttributes.has(name))) {
      state.droppedAttributes += 1;
      continue;
    }

    if (name === 'href') {
      const safeHref = sanitizeHref(attribute.value);
      if (safeHref) output.setAttribute('href', safeHref);
      else state.droppedAttributes += 1;
      continue;
    }

    if (name === 'src') {
      const safeSource = sanitizeImageSource(attribute.value, state.limits.maxDataImageBytes);
      if (safeSource) output.setAttribute('src', safeSource);
      else state.droppedAttributes += 1;
      continue;
    }

    if (name === 'style') {
      const safeStyle = sanitizeInlineStyle(attribute.value);
      if (safeStyle) output.setAttribute('style', safeStyle);
      else state.droppedAttributes += 1;
      continue;
    }

    if (isSafeScalarAttribute(name, attribute.value)) {
      output.setAttribute(name, attribute.value);
    } else {
      state.droppedAttributes += 1;
    }
  }
}

function sanitizeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const compactPrefix = trimmed.slice(0, 64).replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
  if (
    compactPrefix.startsWith('javascript:') ||
    compactPrefix.startsWith('vbscript:') ||
    compactPrefix.startsWith('data:')
  ) {
    return null;
  }

  if (/^(#|\/|\.\/|\.\.\/|\?)/.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed, 'https://pdfhub.invalid/');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol.toLowerCase())
      ? trimmed
      : null;
  } catch {
    return null;
  }
}

function sanitizeImageSource(value: string, maxDataImageBytes: number): string | null {
  const trimmed = value.trim();
  if (/^blob:/i.test(trimmed)) return trimmed;

  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=\s]+)$/i.exec(trimmed);
  if (!match) return null;

  const payloadLength = match[2].replace(/\s+/g, '').length;
  const decodedBytes = Math.floor((payloadLength * 3) / 4);
  return decodedBytes <= maxDataImageBytes ? trimmed : null;
}

function sanitizeInlineStyle(styleText: string): string {
  const safeDeclarations: string[] = [];

  for (const declaration of styleText.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!SAFE_STYLE_PROPERTIES.has(property) || !isSafeStyleValue(property, value)) continue;
    safeDeclarations.push(`${property}: ${value}`);
  }

  return safeDeclarations.join('; ');
}

function isSafeStyleValue(property: string, value: string): boolean {
  if (!value || value.length > 256) return false;
  const lower = value.toLowerCase();
  if (
    lower.includes('url(') ||
    lower.includes('expression') ||
    lower.includes('@import') ||
    lower.includes('javascript:') ||
    lower.includes('vbscript:') ||
    lower.includes('behavior:') ||
    /[{}<>]/.test(value)
  ) {
    return false;
  }

  if (property === 'text-align') return /^(left|right|center|justify|start|end)$/.test(lower);
  if (property === 'font-style') return /^(normal|italic|oblique)$/.test(lower);
  if (property === 'font-weight') return /^(normal|bold|bolder|lighter|[1-9]00)$/.test(lower);
  if (property === 'object-fit') return /^(contain|cover|fill|none|scale-down)$/.test(lower);
  if (property === 'white-space') return /^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/.test(lower);
  if (property === 'vertical-align') return /^(baseline|sub|super|text-top|text-bottom|middle|top|bottom)$/.test(lower);
  if (property === 'text-decoration') return /^[a-z\s-]+$/i.test(value);
  if (property === 'font-family') return /^[a-z0-9 ,'"-]+$/i.test(value);
  if (['width', 'height', 'max-width', 'max-height', 'font-size', 'line-height'].includes(property)) {
    return /^(auto|none|normal|0|\d+(?:\.\d+)?(?:px|pt|em|rem|%|vh|vw)?)$/i.test(value);
  }

  return /^[#a-z0-9(),.%\s-]+$/i.test(value);
}

function isSafeScalarAttribute(name: string, value: string): boolean {
  if (value.length > 1_024 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    return false;
  }

  if (['width', 'height', 'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border', 'start', 'value'].includes(name)) {
    return /^\d{1,5}$/.test(value.trim());
  }
  if (name === 'reversed') return value === '' || value.toLowerCase() === 'reversed';
  if (name === 'scope') return /^(row|col|rowgroup|colgroup)$/i.test(value);
  if (name === 'dir') return /^(ltr|rtl|auto)$/i.test(value);
  if (name === 'type') return /^(1|a|A|i|I)$/.test(value);
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
