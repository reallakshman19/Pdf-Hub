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
  format?: number;
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
      return renderText(node);

    case 'paragraph':
      return `<p style="margin:0 0 4px 0">${renderChildren(node)}</p>`;

    case 'heading':
      return `<${node.tag ?? 'h3'} style="margin:0 0 4px 0">${renderChildren(node)}</${node.tag ?? 'h3'}>`;

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
const FORMAT_UNDERLINE = 1 << 3;

function renderText(node: LexicalNode): string {
  const format = node.format ?? 0;
  let html = escapeHtml(node.text ?? '');

  if (format & FORMAT_UNDERLINE) html = `<u>${html}</u>`;
  if (format & FORMAT_ITALIC) html = `<em>${html}</em>`;
  if (format & FORMAT_BOLD) html = `<strong>${html}</strong>`;

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
