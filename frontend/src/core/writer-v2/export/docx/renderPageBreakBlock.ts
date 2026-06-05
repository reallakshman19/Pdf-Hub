import {
  PageBreak,
  Paragraph,
} from 'docx';

export function renderPageBreakBlock(): Paragraph {
  return new Paragraph({
    children: [
      new PageBreak(),
    ],
  });
}
