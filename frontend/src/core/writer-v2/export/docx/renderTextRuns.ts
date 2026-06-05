import {
  ExternalHyperlink,
  TextRun,
  UnderlineType,
} from 'docx';
import type { PortableInlineText } from './types';
import {
  cssColorToDocxHex,
  DEFAULT_DOCX_FONT_FAMILY,
  DEFAULT_DOCX_FONT_SIZE_PT,
  ptToHalfPoints,
} from './docxUnits';

export type DocxParagraphChild = TextRun | ExternalHyperlink;

export function renderInlineTextRuns(
  children: PortableInlineText[],
): DocxParagraphChild[] {
  if (children.length === 0) {
    return [new TextRun('')];
  }

  const runs: DocxParagraphChild[] = [];

  for (const child of children) {
    const textRuns = splitTextRunOnLineBreaks(child);

    if (child.href && isSafeHttpUrl(child.href)) {
      runs.push(
        new ExternalHyperlink({
          link: child.href,
          children: textRuns,
        }),
      );
    } else {
      runs.push(...textRuns);
    }
  }

  return runs.length > 0 ? runs : [new TextRun('')];
}

function splitTextRunOnLineBreaks(child: PortableInlineText): TextRun[] {
  const parts = child.text.split('\n');
  const runs: TextRun[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0) {
      runs.push(new TextRun({ break: 1 }));
    }

    if (parts[index] !== '') {
      runs.push(renderTextRun(parts[index], child));
    }
  }

  return runs.length > 0 ? runs : [renderTextRun('', child)];
}

function renderTextRun(text: string, child: PortableInlineText): TextRun {
  const style = child.style;
  const color = cssColorToDocxHex(style.color);

  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italic,
    strike: style.strikethrough,
    underline: style.underline
      ? {
          type: UnderlineType.SINGLE,
        }
      : undefined,
    font: style.fontFamily ?? DEFAULT_DOCX_FONT_FAMILY,
    size: ptToHalfPoints(style.fontSize ?? DEFAULT_DOCX_FONT_SIZE_PT),
    color,
  });
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
