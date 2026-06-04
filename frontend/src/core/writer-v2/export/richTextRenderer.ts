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
    underline: (format & 4) !== 0,
    strikethrough: (format & 8) !== 0,
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

function parseChildrenToInlineText(
  children: LexicalJsonNode[],
  inheritedHref?: string,
): PdfInlineText[] {
  const result: PdfInlineText[] = [];
  if (!children) return result;

  for (const child of children) {
    if (child.type === 'text') {
      const run = parseTextNode(child);
      if (inheritedHref) run.href = inheritedHref;
      result.push(run);
    } else if (child.type === 'linebreak') {
      result.push({ text: '\n', style: {} });
    } else if (child.type === 'link' || child.type === 'autolink') {
      // Link node — propagate its URL down to all descendant text runs.
      const href = child.url ?? '';
      if (child.children) {
        result.push(...parseChildrenToInlineText(child.children, href || inheritedHref));
      }
    } else if (child.children) {
      result.push(...parseChildrenToInlineText(child.children, inheritedHref));
    }
  }
  return result;
}

function parseLexicalNode(node: LexicalJsonNode): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  if (!node) return blocks;

  const type = node.type;

  if (type === 'paragraph') {
    const alignment = typeof node.format === 'string' ? node.format as 'left' | 'center' | 'right' | 'justify' : undefined;
    blocks.push({
      type: 'paragraph',
      alignment,
      indent: node.value || undefined,
      children: parseChildrenToInlineText(node.children ?? []),
    });
  } else if (type === 'heading') {
    const alignment = typeof node.format === 'string' ? node.format as 'left' | 'center' | 'right' | 'justify' : undefined;
    blocks.push({
      type: 'heading',
      tag: node.tag ?? 'h1',
      alignment,
      children: parseChildrenToInlineText(node.children ?? []),
    });
  } else if (type === 'list') {
    const isCheck = node.listStyleType === 'check' || node.listType === 'check';
    const listType: 'bullet' | 'number' | 'check' = isCheck
      ? 'check'
      : node.listType === 'number'
      ? 'number'
      : 'bullet';
    const items: { indent?: number; checked?: boolean; children: PdfInlineText[] }[] = [];
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'listitem') {
          items.push({
            indent: child.value || undefined,
            checked: child.checked,
            children: parseChildrenToInlineText(child.children ?? []),
          });
        }
      }
    }
    blocks.push({
      type: 'list',
      listType,
      items,
    });
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
    blocks.push({
      type: 'image',
      src: node.src ?? '',
      altText: node.altText,
      width: node.width ?? 'inherit',
      height: node.height ?? 'inherit',
      caption: node.caption,
    });
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
    if (!root || !root.children) {
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
  } catch {
    return [
      {
        type: 'paragraph',
        children: [{ text: fallbackText || '', style: {} }],
      },
    ];
  }
}
