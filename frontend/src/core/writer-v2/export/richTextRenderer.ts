export interface PdfTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
}

export interface PdfInlineText {
  text: string;
  style: PdfTextStyle;
  /** HTTP/HTTPS URL when this run is a hyperlink. */
  href?: string;
}

export type PdfBlock =
  | {
      type: 'paragraph';
      alignment?: 'left' | 'center' | 'right' | 'justify';
      indent?: number;
      children: PdfInlineText[];
    }
  | {
      type: 'heading';
      tag: 'h1' | 'h2' | 'h3';
      alignment?: 'left' | 'center' | 'right' | 'justify';
      children: PdfInlineText[];
    }
  | {
      type: 'list';
      start?: number;
      listType: 'bullet' | 'number' | 'check';
      items: {
        indent?: number;
        checked?: boolean;
        children: PdfInlineText[];
      }[];
    }
  | {
      type: 'table';
      rows: {
        cells: {
          children: PdfBlock[];
        }[];
      }[];
    }
  | {
      type: 'image';
      src: string;
      altText?: string;
      width: number | 'inherit';
      height: number | 'inherit';
      caption?: string;
    };

interface LexicalJsonNode {
  type: string;
  text?: string;
  format?: number | string;
  style?: string;
  tag?: 'h1' | 'h2' | 'h3';
  listType?: string;
  listStyleType?: string;
  value?: number;
  indent?: number;
  start?: number;
  checked?: boolean;
  url?: string;
  src?: string;
  altText?: string;
  width?: number | 'inherit';
  height?: number | 'inherit';
  caption?: string;
  children?: LexicalJsonNode[];
}

function parseTextNode(node: LexicalJsonNode): PdfInlineText {
  const format = typeof node.format === 'number' ? node.format : 0;
  const styleStr = node.style ?? '';

  const style: PdfTextStyle = {
    bold: (format & 1) !== 0,
    italic: (format & 2) !== 0,
    underline: (format & 8) !== 0,
    strikethrough: (format & 4) !== 0,
  };

  if (styleStr) {
    const parts = styleStr.split(';');
    for (const part of parts) {
      const index = part.indexOf(':');
      if (index === -1) continue;
      const key = part.slice(0, index).trim().toLowerCase();
      const val = part.slice(index + 1).trim();
      if (key === 'color') {
        style.color = val;
      } else if (key === 'background-color') {
        style.backgroundColor = val;
      } else if (key === 'font-family') {
        style.fontFamily = val.replace(/['"]/g, '');
      } else if (key === 'font-size') {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          style.fontSize = num;
        }
      }
    }
  }

  return {
    text: node.text ?? '',
    style,
  };
}

type InlineImageBlock = Extract<PdfBlock, { type: 'image' }>;
type InlinePart = PdfInlineText | InlineImageBlock;
function isImagePart(part: InlinePart): part is InlineImageBlock { return 'type' in part; }
function parseInlineParts(children: LexicalJsonNode[], inheritedHref?: string): InlinePart[] {
  const result: InlinePart[] = [];
  for (const child of children) {
    if (child.type === 'text') {
      const run = parseTextNode(child);
      if (inheritedHref) run.href = inheritedHref;
      result.push(run);
    } else if (child.type === 'linebreak') {
      result.push({ text: '\n', style: {} });
    } else if (child.type === 'inline-image') {
      result.push(imageBlock(child));
    } else if (child.children) {
      const href = child.type === 'link' || child.type === 'autolink' ? child.url || inheritedHref : inheritedHref;
      result.push(...parseInlineParts(child.children, href));
    }
  }
  return result;
}
function imageBlock(node: LexicalJsonNode): InlineImageBlock {
  return { type: 'image', src: node.src ?? '', altText: node.altText,
    width: node.width ?? 'inherit', height: node.height ?? 'inherit', caption: node.caption };
}
/** The PDF/DOCX block renderers have no inline-image layout primitive. Preserve
 * the exact sequence as text fragments and image blocks instead of discarding images. */
function splitInlineParts(parts: InlinePart[], textBlock: (runs: PdfInlineText[]) => PdfBlock): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  let runs: PdfInlineText[] = [];
  for (const part of parts) {
    if (isImagePart(part)) {
      if (runs.length) blocks.push(textBlock(runs));
      runs = [];
      blocks.push(part);
    } else runs.push(part);
  }
  if (runs.length || !blocks.length) blocks.push(textBlock(runs));
  return blocks;
}

function parseLexicalNode(node: LexicalJsonNode): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  if (!node) return blocks;

  const type = node.type;

  if (type === 'paragraph') {
    const alignment = typeof node.format === 'string' ? node.format as 'left' | 'center' | 'right' | 'justify' : undefined;
    blocks.push(...splitInlineParts(parseInlineParts(node.children ?? []), children => ({
      type: 'paragraph', alignment, indent: node.indent || node.value || undefined, children,
    })));
  } else if (type === 'heading') {
    const alignment = typeof node.format === 'string' ? node.format as 'left' | 'center' | 'right' | 'justify' : undefined;
    blocks.push(...splitInlineParts(parseInlineParts(node.children ?? []), children => ({
      type: 'heading', tag: node.tag ?? 'h1', alignment, children,
    })));
  } else if (type === 'list') {
    const isCheck = node.listStyleType === 'check' || node.listType === 'check';
    const listType: 'bullet' | 'number' | 'check' = isCheck
      ? 'check'
      : node.listType === 'number'
      ? 'number'
      : 'bullet';
    type ListBlock = Extract<PdfBlock, { type: 'list' }>;
    let items: ListBlock['items'] = [];
    let ordinal = node.start ?? 1;
    let start = ordinal;
    const flush = () => {
      if (items.length) blocks.push({ type: 'list', listType, ...(start !== 1 ? { start } : {}), items });
      items = [];
    };
    for (const child of node.children ?? []) {
      if (child.type !== 'listitem') continue;
      const parts = parseInlineParts(child.children ?? []);
      const indent = (child.indent ?? 0) + 1;
      const firstImage = parts.findIndex(isImagePart);
      if (!items.length) start = ordinal;
      if (firstImage < 0) {
        items.push({ indent, checked: child.checked, children: parts as PdfInlineText[] });
      } else {
        items.push({ indent, checked: child.checked, children: parts.slice(0, firstImage) as PdfInlineText[] });
        flush();
        blocks.push(...splitInlineParts(parts.slice(firstImage), children => ({ type: 'paragraph', indent, children })));
      }
      ordinal++;
    }
    flush();
  } else if (type === 'table') {
    const rows: { cells: { children: PdfBlock[] }[] }[] = [];
    if (node.children) {
      for (const row of node.children) {
        if (row.type === 'tablerow') {
          const cells: { children: PdfBlock[] }[] = [];
          if (row.children) {
            for (const cell of row.children) {
              if (cell.type === 'tablecell') {
                const cellBlocks: PdfBlock[] = [];
                if (cell.children) {
                  for (const cellChild of cell.children) {
                    cellBlocks.push(...parseLexicalNode(cellChild));
                  }
                }
                cells.push({ children: cellBlocks });
              }
            }
          }
          rows.push({ cells });
        }
      }
    }
    blocks.push({
      type: 'table',
      rows,
    });
  } else if (type === 'inline-image') {
    blocks.push(imageBlock(node));
  } else if (node.children) {
    for (const child of node.children) {
      blocks.push(...parseLexicalNode(child));
    }
  }

  return blocks;
}

export function editorStateToPdfBlocks(
  editorStateJson: string | null | undefined,
  fallbackText: string,
  options?: { strict?: boolean },
): PdfBlock[] {
  if (!editorStateJson) {
    return [
      {
        type: 'paragraph',
        children: [{ text: fallbackText || '', style: {} }],
      },
    ];
  }

  try {
    const state =
      typeof editorStateJson === 'string'
        ? JSON.parse(editorStateJson)
        : editorStateJson;
    const root = state.root;
    if (!root || !Array.isArray(root.children)) {
      if (options?.strict) throw new Error('Invalid Writer editor root.');
      return [
        {
          type: 'paragraph',
          children: [{ text: fallbackText || '', style: {} }],
        },
      ];
    }

    const blocks: PdfBlock[] = [];
    for (const child of root.children) {
      blocks.push(...parseLexicalNode(child));
    }

    if (blocks.length === 0) {
      return [
        {
          type: 'paragraph',
          children: [{ text: fallbackText || '', style: {} }],
        },
      ];
    }

    return blocks;
  } catch (error) {
    if (options?.strict) throw new Error('Writer rich content could not be parsed for PDF export. Save the editable project and repair its content.', { cause: error });
    return [
      {
        type: 'paragraph',
        children: [{ text: fallbackText || '', style: {} }],
      },
    ];
  }
}
