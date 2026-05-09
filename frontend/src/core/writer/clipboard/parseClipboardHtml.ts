import type {
  WriterRichTextBlock,
  WriterRichTextModel,
  WriterTextRun,
} from '../types';
import {
  createRichTextBlock,
  createTextRun,
} from '../content-model';
import { sanitizeClipboardHtml } from './sanitizeClipboardHtml';

export function parseClipboardRichTextFromHtml(html: string): WriterRichTextModel {
  const sanitized = sanitizeClipboardHtml(html);

  if (typeof document === 'undefined') {
    return {
      kind: 'rich-text',
      version: 1,
      blocks: [createRichTextBlock(stripTags(sanitized))],
    };
  }

  const template = document.createElement('template');
  template.innerHTML = sanitized;

  const blocks: WriterRichTextBlock[] = [];

  const blockNodes = Array.from(
    template.content.querySelectorAll('p,div,h1,h2,h3,li,blockquote'),
  );

  if (blockNodes.length === 0) {
    const text = template.content.textContent ?? '';
    return {
      kind: 'rich-text',
      version: 1,
      blocks: [createRichTextBlock(text.trim())],
    };
  }

  for (const node of blockNodes) {
    const block = nodeToBlock(node);
    if (block.runs.some((run) => run.text.length > 0)) {
      blocks.push(block);
    }
  }

  return {
    kind: 'rich-text',
    version: 1,
    blocks: blocks.length > 0 ? blocks : [createRichTextBlock('')],
  };
}

function nodeToBlock(node: Element): WriterRichTextBlock {
  const tag = node.tagName.toLowerCase();
  const runs = collectRuns(node);

  return {
    id: createRichTextBlock('').id,
    type: tag === 'li'
      ? 'bullet'
      : tag === 'blockquote'
        ? 'quote'
        : tag === 'h1' || tag === 'h2' || tag === 'h3'
          ? 'heading'
          : 'paragraph',
    level: tag === 'h1' ? 1 : tag === 'h2' ? 2 : tag === 'h3' ? 3 : undefined,
    runs: runs.length > 0 ? runs : [createTextRun(node.textContent ?? '')],
    align: readAlign(node),
  };
}

function collectRuns(root: Element): WriterTextRun[] {
  const runs: WriterTextRun[] = [];

  function walk(node: Node, inherited: Partial<WriterTextRun>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) runs.push(createTextRun(text, inherited));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const style = (el as HTMLElement).style;

    const next: Partial<WriterTextRun> = {
      ...inherited,
      bold: inherited.bold || tag === 'strong' || tag === 'b' || style.fontWeight === 'bold',
      italic: inherited.italic || tag === 'em' || tag === 'i' || style.fontStyle === 'italic',
      underline: inherited.underline || tag === 'u' || style.textDecoration.includes('underline'),
      strike: inherited.strike || tag === 's' || style.textDecoration.includes('line-through'),
      color: style.color || inherited.color,
      backgroundColor: style.backgroundColor || inherited.backgroundColor,
      fontFamily: style.fontFamily || inherited.fontFamily,
      fontSize: style.fontSize ? parseFloat(style.fontSize) : inherited.fontSize,
    };

    for (const child of Array.from(el.childNodes)) {
      walk(child, next);
    }
  }

  walk(root, {});
  return runs;
}

function readAlign(node: Element): WriterRichTextBlock['align'] {
  const align = (node as HTMLElement).style.textAlign;
  if (align === 'center' || align === 'right' || align === 'justify') return align;
  return 'left';
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').trim();
}
