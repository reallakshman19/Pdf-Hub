import type {
  WriterRichTextBlock,
  WriterRichTextModel,
  WriterTextRun,
} from './types';

export function richTextModelToHtml(model: WriterRichTextModel): string {
  return model.blocks.map(blockToHtml).join('');
}

export function richTextModelToPlainText(model: WriterRichTextModel): string {
  return model.blocks
    .map((block) => block.runs.map((run) => run.text).join(''))
    .join('\n');
}

export function htmlToRichTextModel(html: string): WriterRichTextModel {
  if (typeof document === 'undefined') {
    return plainTextToRichTextModel(stripTags(html));
  }

  const template = document.createElement('template');
  template.innerHTML = sanitizeWriterHtml(html);

  const blockNodes = Array.from(
    template.content.querySelectorAll('p,div,h1,h2,h3,li,blockquote'),
  );

  if (blockNodes.length === 0) {
    return plainTextToRichTextModel(template.content.textContent ?? '');
  }

  return {
    kind: 'rich-text',
    version: 1,
    blocks: blockNodes.map((node, index) => elementToBlock(node, index)),
  };
}

export function plainTextToRichTextModel(text: string): WriterRichTextModel {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');

  return {
    kind: 'rich-text',
    version: 1,
    blocks: lines.map((line, index) => ({
      id: `block-${index + 1}`,
      type: 'paragraph',
      runs: [
        {
          id: `run-${index + 1}`,
          text: line,
        },
      ],
      align: 'left',
    })),
  };
}

export function sanitizeWriterHtml(html: string): string {
  if (!html) return '';

  if (typeof document === 'undefined') {
    return stripDangerousHtmlFallback(html);
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const blockedTags = new Set([
    'script',
    'iframe',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'style',
  ]);

  const safeStyleProps = new Set([
    'font-weight',
    'font-style',
    'text-decoration',
    'text-align',
    'color',
    'background-color',
    'font-size',
    'font-family',
    'line-height',
  ]);

  for (const node of Array.from(template.content.querySelectorAll('*'))) {
    const tag = node.tagName.toLowerCase();

    if (blockedTags.has(tag)) {
      node.remove();
      continue;
    }

    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();

      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }

      if ((name === 'href' || name === 'src') && isUnsafeUrl(value)) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style') {
        const safeStyle = value
          .split(';')
          .map((rule) => rule.trim())
          .filter(Boolean)
          .map((rule) => {
            const [rawProp, ...rawValue] = rule.split(':');
            const prop = rawProp?.trim().toLowerCase();
            const styleValue = rawValue.join(':').trim();

            if (!prop || !safeStyleProps.has(prop)) return '';
            if (/url\s*\(/i.test(styleValue)) return '';
            if (/expression\s*\(/i.test(styleValue)) return '';
            if (/javascript:/i.test(styleValue)) return '';

            return `${prop}: ${styleValue.replace(/[<>"'`]/g, '')}`;
          })
          .filter(Boolean)
          .join('; ');

        if (safeStyle) node.setAttribute('style', safeStyle);
        else node.removeAttribute('style');
      }
    }
  }

  return template.innerHTML;
}

function blockToHtml(block: WriterRichTextBlock): string {
  const body = block.runs.map(runToHtml).join('');
  const style = block.align ? ` style="text-align: ${escapeAttr(block.align)}"` : '';

  if (block.type === 'heading') {
    const level = block.level ?? 2;
    const tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';
    return `<${tag}${style}>${body}</${tag}>`;
  }

  if (block.type === 'bullet') return `<ul><li${style}>${body}</li></ul>`;
  if (block.type === 'numbered') return `<ol><li${style}>${body}</li></ol>`;
  if (block.type === 'quote') return `<blockquote${style}>${body}</blockquote>`;

  return `<p${style}>${body}</p>`;
}

function runToHtml(run: WriterTextRun): string {
  const styles: string[] = [];

  if (run.color) styles.push(`color: ${escapeStyleValue(run.color)}`);
  if (run.backgroundColor) styles.push(`background-color: ${escapeStyleValue(run.backgroundColor)}`);
  if (run.fontSize) styles.push(`font-size: ${Number(run.fontSize)}px`);
  if (run.fontFamily) styles.push(`font-family: ${escapeStyleValue(run.fontFamily)}`);

  let html = escapeHtml(run.text);

  if (run.bold) html = `<strong>${html}</strong>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.strike) html = `<s>${html}</s>`;
  if (run.superscript) html = `<sup>${html}</sup>`;
  if (run.subscript) html = `<sub>${html}</sub>`;

  if (styles.length > 0) {
    html = `<span style="${styles.join('; ')}">${html}</span>`;
  }

  return html;
}

function elementToBlock(node: Element, index: number): WriterRichTextBlock {
  const tag = node.tagName.toLowerCase();
  const runs = collectRuns(node);

  return {
    id: `block-${index + 1}`,
    type: tag === 'li'
      ? 'bullet'
      : tag === 'blockquote'
        ? 'quote'
        : tag === 'h1' || tag === 'h2' || tag === 'h3'
          ? 'heading'
          : 'paragraph',
    level: tag === 'h1' ? 1 : tag === 'h2' ? 2 : tag === 'h3' ? 3 : undefined,
    align: readAlign(node),
    runs: runs.length > 0 ? runs : [{ id: `run-${index + 1}`, text: node.textContent ?? '' }],
  };
}

function collectRuns(root: Element): WriterTextRun[] {
  const runs: WriterTextRun[] = [];

  function walk(node: Node, inherited: Partial<WriterTextRun>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) {
        runs.push({
          id: `run-${runs.length + 1}`,
          text,
          ...inherited,
        });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    const style = el.style;

    const next: Partial<WriterTextRun> = {
      ...inherited,
      bold:
        inherited.bold ||
        tag === 'b' ||
        tag === 'strong' ||
        style.fontWeight === 'bold' ||
        Number(style.fontWeight) >= 600,
      italic: inherited.italic || tag === 'i' || tag === 'em' || style.fontStyle === 'italic',
      underline: inherited.underline || tag === 'u' || style.textDecoration.includes('underline'),
      strike: inherited.strike || tag === 's' || style.textDecoration.includes('line-through'),
      color: style.color || inherited.color,
      backgroundColor: style.backgroundColor || inherited.backgroundColor,
      fontFamily: style.fontFamily || inherited.fontFamily,
      fontSize: style.fontSize ? Number.parseFloat(style.fontSize) : inherited.fontSize,
      superscript: inherited.superscript || tag === 'sup',
      subscript: inherited.subscript || tag === 'sub',
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

function isUnsafeUrl(value: string): boolean {
  return /^javascript:/i.test(value) || /^data:text\/html/i.test(value);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').trim();
}

function stripDangerousHtmlFallback(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replaceAll('`', '');
}

function escapeStyleValue(value: unknown): string {
  return String(value ?? '').replace(/[<>"'`]/g, '');
}
