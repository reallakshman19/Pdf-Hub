import {
  AlignmentType,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
} from 'docx';
import type { PortableExportBlock, WriterDocxExportDiagnostic } from './types';
import {
  DEFAULT_DOCX_FONT_FAMILY,
  DEFAULT_DOCX_FONT_SIZE_PT,
  inchToTwip,
  ptToHalfPoints,
} from './docxUnits';
import { renderHeadingBlock } from './renderHeadingBlock';
import { renderImageBlock } from './renderImageBlock';
import { renderListBlock } from './renderListBlock';
import { renderPageBreakBlock } from './renderPageBreakBlock';
import { renderParagraphBlock } from './renderParagraphBlock';
import { renderTableBlock } from './renderTableBlock';
import type { WriterDocxAssetResolver } from './writerDocxAssetResolver';

export interface BuildWriterDocxDocumentInput {
  blocks: PortableExportBlock[];
  assets: WriterDocxAssetResolver;
  title?: string;
}

export interface BuildWriterDocxDocumentResult {
  bytes: Uint8Array;
  diagnostics: WriterDocxExportDiagnostic[];
}

type DocxDocumentChild = Paragraph | Table;

export async function buildWriterDocxDocument(
  input: BuildWriterDocxDocumentInput,
): Promise<BuildWriterDocxDocumentResult> {
  const diagnostics: WriterDocxExportDiagnostic[] = [];
  const children: DocxDocumentChild[] = [];

  for (const block of input.blocks) {
    if (block.type === 'paragraph') {
      children.push(renderParagraphBlock(block));
      continue;
    }

    if (block.type === 'heading') {
      children.push(renderHeadingBlock(block));
      continue;
    }

    if (block.type === 'list') {
      children.push(...renderListBlock(block));
      continue;
    }

    if (block.type === 'table') {
      children.push(renderTableBlock(block));
      continue;
    }

    if (block.type === 'image') {
      children.push(
        ...(await renderImageBlock(block, input.assets, diagnostics)),
      );
      continue;
    }

    if (block.type === 'pageBreak') {
      children.push(renderPageBreakBlock());
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph(''));
  }

  const document = new Document({
    creator: 'PDF Hub Writer V2',
    title: input.title ?? 'Writer V2 DOCX Export',
    styles: {
      default: {
        document: {
          run: {
            font: DEFAULT_DOCX_FONT_FAMILY,
            size: ptToHalfPoints(DEFAULT_DOCX_FONT_SIZE_PT),
          },
          paragraph: {
            spacing: {
              after: 120,
            },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            bold: true,
            size: ptToHalfPoints(20),
            font: DEFAULT_DOCX_FONT_FAMILY,
          },
          paragraph: {
            spacing: {
              before: 240,
              after: 120,
            },
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            bold: true,
            size: ptToHalfPoints(16),
            font: DEFAULT_DOCX_FONT_FAMILY,
          },
          paragraph: {
            spacing: {
              before: 200,
              after: 100,
            },
          },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            bold: true,
            size: ptToHalfPoints(14),
            font: DEFAULT_DOCX_FONT_FAMILY,
          },
          paragraph: {
            spacing: {
              before: 160,
              after: 80,
            },
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'writer-v2-numbering',
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: {
                  left: 720 + level * 360,
                  hanging: 360,
                },
              },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: inchToTwip(1),
              right: inchToTwip(1),
              bottom: inchToTwip(1),
              left: inchToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  return {
    bytes,
    diagnostics,
  };
}
