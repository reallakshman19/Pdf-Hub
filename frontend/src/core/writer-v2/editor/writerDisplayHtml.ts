/**
 * Derives a safe display-only HTML string from a Lexical editor state JSON.
 * This is used purely for rendering the element preview (not for editing).
 * Falls back to plain text when the JSON cannot be parsed.
 */
export function writerDisplayHtml(
  editorStateJson: string | undefined | null,
  plainText: string | undefined | null,
): string {
  if (!editorStateJson) {
    return escapeHtml(plainText ?? '');
  }

  try {
    const parsed = JSON.parse(editorStateJson) as LexicalExportRoot;
    const root = parsed?.root;

    if (!root || !Array.isArray(root.children)) {
      return escapeHtml(plainText ?? '');
    }

    return root.children.map(renderNode).join('');
  } catch {
    return escapeHtml(plainText ?? '');
  }
}

// ─── Minimal Lexical JSON shape ──────────────────────────────────────────────

interface LexicalExportRoot {
  root: LexicalNode;
}

interface LexicalNode {
  type: string;
  text?: string;
  format?: number | string;
  style?: string;
  children?: LexicalNode[];
  tag?: string;
  listType?: string;
  direction?: string | null;
  indent?: number;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

function renderNode(node: LexicalNode): string {
  switch (node.type) {
    case 'text':
    case 'code-highlight':
      return renderText(node);

    case 'paragraph':
      return `<p style="${blockStyle(node, 'margin:0 0 4px 0')}">${renderChildren(node)}</p>`;

    case 'heading': {
      const tag = node.tag ?? 'h3';
      return `<${tag} style="${blockStyle(node, 'margin:0 0 4px 0')}">${renderChildren(node)}</${tag}>`;
    }

    case 'quote':
      return `<blockquote style="${blockStyle(
        node,
        'margin:0 0 6px 0;padding-left:12px;border-left:3px solid #cbd5e1;color:#475569;font-style:italic',
      )}">${renderChildren(node)}</blockquote>`;

    case 'code':
      return `<pre style="${blockStyle(
        node,
        'margin:0 0 6px 0;padding:8px 10px;background:#f1f5f9;border-radius:6px;font-family:\'Courier New\',monospace;font-size:0.9em;white-space:pre-wrap',
      )}">${renderChildren(node)}</pre>`;

    case 'horizontalrule':
      return '<hr style="border:none;border-top:1px solid #cbd5e1;margin:6px 0"/>';

    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul';
      return `<${tag} style="margin:0;padding-left:20px">${renderChildren(node)}</${tag}>`;
    }

    case 'listitem':
      return `<li>${renderChildren(node)}</li>`;

    case 'linebreak':
      return '<br/>';

    default:
      return renderChildren(node);
  }
}

function renderChildren(node: LexicalNode): string {
  return (node.children ?? []).map(renderNode).join('');
}

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 1 << 1;
const FORMAT_STRIKETHROUGH = 1 << 2;
const FORMAT_UNDERLINE = 1 << 3;
const FORMAT_CODE = 1 << 4;
const FORMAT_SUBSCRIPT = 1 << 5;
const FORMAT_SUPERSCRIPT = 1 << 6;

function renderText(node: LexicalNode): string {
  const format = typeof node.format === 'number' ? node.format : 0;
  let html = escapeHtml(node.text ?? '');

  if (format & FORMAT_CODE) html = `<code style="font-family:'Courier New',monospace">${html}</code>`;
  if (format & FORMAT_STRIKETHROUGH) html = `<s>${html}</s>`;
  if (format & FORMAT_UNDERLINE) html = `<u>${html}</u>`;
  if (format & FORMAT_ITALIC) html = `<em>${html}</em>`;
  if (format & FORMAT_BOLD) html = `<strong>${html}</strong>`;
  if (format & FORMAT_SUBSCRIPT) html = `<sub>${html}</sub>`;
  if (format & FORMAT_SUPERSCRIPT) html = `<sup>${html}</sup>`;

  const style = sanitizeStyle(node.style, TEXT_STYLE_PROPS);
  if (style) html = `<span style="${style}">${html}</span>`;

  return html;
}

// ─── Style handling ──────────────────────────────────────────────────────────

const TEXT_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-family',
  'letter-spacing',
  'text-transform',
  'text-decoration',
]);

const BLOCK_STYLE_PROPS = new Set([
  'line-height',
  'margin-top',
  'margin-bottom',
  'text-align',
  'text-indent',
]);

/** Build a block element's style attribute: base defaults + safe node styles + indent. */
function blockStyle(node: LexicalNode, base: string): string {
  const parts = [base];
  const nodeStyle = sanitizeStyle(node.style, BLOCK_STYLE_PROPS);
  if (nodeStyle) parts.push(nodeStyle);
  if (typeof node.indent === 'number' && node.indent > 0) {
    parts.push(`padding-left:${Math.min(node.indent, 10) * 20}px`);
  }
  return escapeAttr(parts.filter(Boolean).join(';'));
}

/**
 * Parse and whitelist a Lexical inline `style` string. Only known-safe
 * properties are kept and values are stripped of characters that could break
 * out of the attribute or smuggle in `url()`/expressions.
 */
function sanitizeStyle(style: string | undefined, allowed: Set<string>): string {
  if (!style) return '';
  const out: string[] = [];
  for (const part of style.split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!allowed.has(prop)) continue;
    if (!isSafeStyleValue(value)) continue;
    out.push(`${prop}:${value}`);
  }
  return escapeAttr(out.join(';'));
}

function isSafeStyleValue(value: string): boolean {
  if (!value) return false;
  // Disallow anything that could escape context or invoke resources/scripts.
  if (/[<>"']/.test(value)) return false;
  if (/url\s*\(|expression\s*\(|javascript:|@import/i.test(value)) return false;
  return true;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
