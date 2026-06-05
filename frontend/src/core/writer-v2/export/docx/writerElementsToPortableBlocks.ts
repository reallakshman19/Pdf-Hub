import type { WriterElementV2 } from '../../types';
import { editorStateToPdfBlocks } from '../richTextRenderer';
import type {
  PortableExportBlock,
  PortableTextStyle,
  WriterDocxExportDiagnostic,
  WriterDocxPortableBlockResult,
} from './types';
import { createWriterDocxDiagnostic, hasFatalDocxDiagnostics } from './diagnostics';
import { pdfBlocksToPortableBlocks } from './pdfBlocksToPortableBlocks';
import { sortWriterElementsForDocx } from './sortWriterElementsForDocx';
import { tableDataToPortableBlock } from './tableDataToPortableBlocks';

const WRITER_TEXT_ELEMENT_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'reviewLabel',
  'textStamp',
  'richNote',
]);

export function writerElementsToPortableBlocks(
  elements: WriterElementV2[],
): WriterDocxPortableBlockResult {
  const diagnostics: WriterDocxExportDiagnostic[] = [];
  const blocks: PortableExportBlock[] = [];

  const visibleElements = elements.filter((element) => {
    if (!element.hidden) return true;

    diagnostics.push(
      createWriterDocxDiagnostic(
        'info',
        'HIDDEN_ELEMENT_SKIPPED',
        'Hidden Writer element skipped during DOCX export.',
        element,
      ),
    );

    return false;
  });

  if (visibleElements.length === 0) {
    diagnostics.push({
      level: 'info',
      code: 'EMPTY_DOCUMENT',
      message: 'No visible Writer V2 elements were available for DOCX export.',
    });

    blocks.push({
      type: 'paragraph',
      children: [{ text: '', style: {} }],
    });

    return {
      blocks,
      diagnostics,
      exportedElementCount: 0,
      skippedHiddenElementCount: elements.length,
      fatal: false,
    };
  }

  let previousPageIndex: number | null = null;

  for (const element of sortWriterElementsForDocx(visibleElements)) {
    if (
      previousPageIndex !== null
      && element.pageIndex !== previousPageIndex
    ) {
      blocks.push({
        type: 'pageBreak',
        fromPageIndex: previousPageIndex,
        toPageIndex: element.pageIndex,
      });
    }

    previousPageIndex = element.pageIndex;

    const elementBlocks = writerElementToPortableBlocks(element, diagnostics);
    blocks.push(...elementBlocks);
  }

  return {
    blocks,
    diagnostics,
    exportedElementCount: visibleElements.length,
    skippedHiddenElementCount: elements.length - visibleElements.length,
    fatal: hasFatalDocxDiagnostics(diagnostics),
  };
}

function writerElementToPortableBlocks(
  element: WriterElementV2,
  diagnostics: WriterDocxExportDiagnostic[],
): PortableExportBlock[] {
  if (WRITER_TEXT_ELEMENT_TYPES.has(element.type)) {
    return richTextElementToPortableBlocks(element, diagnostics);
  }

  if (element.type === 'tableBox') {
    const result = tableDataToPortableBlock(element);
    diagnostics.push(...result.diagnostics);

    if (result.block) {
      return [result.block];
    }

    return [
      createFallbackParagraph(
        '[Invalid table]',
        element,
      ),
    ];
  }

  if (element.type === 'imageBox') {
    const assetId = element.imageAssetId ?? element.assetIds?.[0];

    if (!assetId) {
      diagnostics.push(
        createWriterDocxDiagnostic(
          'warning',
          'MISSING_IMAGE_ASSET',
          'Image box has no imageAssetId or assetIds entry.',
          element,
        ),
      );

      return [
        createFallbackParagraph(
          '[Missing image]',
          element,
        ),
      ];
    }

    return [
      {
        type: 'image',
        elementId: element.id,
        elementType: element.type,
        pageIndex: element.pageIndex,
        assetId,
        width: element.rect.width,
        height: element.rect.height,
      },
    ];
  }

  diagnostics.push(
    createWriterDocxDiagnostic(
      'warning',
      'UNKNOWN_ELEMENT_TYPE',
      `Unsupported Writer element type "${element.type}" skipped.`,
      element,
    ),
  );

  return [];
}

function richTextElementToPortableBlocks(
  element: WriterElementV2,
  diagnostics: WriterDocxExportDiagnostic[],
): PortableExportBlock[] {
  const fallbackText = buildFallbackTextForTextElement(element);

  if (!element.editorStateJson && fallbackText) {
    diagnostics.push(
      createWriterDocxDiagnostic(
        'info',
        'PLAIN_TEXT_FALLBACK_USED',
        'Writer element had no editorStateJson; plainText/review fallback was used.',
        element,
      ),
    );
  }

  if (element.editorStateJson && !isValidJson(element.editorStateJson)) {
    diagnostics.push(
      createWriterDocxDiagnostic(
        'warning',
        'INVALID_EDITOR_STATE',
        'Writer element had malformed editorStateJson; plainText fallback was used.',
        element,
      ),
    );

    if (fallbackText) {
      diagnostics.push(
        createWriterDocxDiagnostic(
          'info',
          'PLAIN_TEXT_FALLBACK_USED',
          'Malformed editorStateJson fell back to plainText/review text.',
          element,
        ),
      );
    }
  }

  const pdfBlocks = editorStateToPdfBlocks(
    element.editorStateJson,
    fallbackText,
  );

  const portableBlocks = pdfBlocksToPortableBlocks(pdfBlocks, {
    elementId: element.id,
    elementType: element.type,
    pageIndex: element.pageIndex,
  });

  return portableBlocks.map((block) => applyElementDefaultTextStyle(block, element));
}

function buildFallbackTextForTextElement(element: WriterElementV2): string {
  if (element.plainText) {
    return element.plainText;
  }

  if (element.review) {
    const parts = [
      `Review: ${element.review.status}`,
      `Priority: ${element.review.priority}`,
      `Category: ${element.review.category}`,
    ];

    if (element.review.author) {
      parts.push(`Author: ${element.review.author}`);
    }

    if (element.review.assignee) {
      parts.push(`Assignee: ${element.review.assignee}`);
    }

    return parts.join(' | ');
  }

  return '';
}

function createFallbackParagraph(
  text: string,
  element: WriterElementV2,
): PortableExportBlock {
  return {
    type: 'paragraph',
    elementId: element.id,
    elementType: element.type,
    pageIndex: element.pageIndex,
    children: [
      {
        text,
        style: {
          fontFamily: element.style.fontFamily,
          fontSize: element.style.fontSize,
          color: element.style.textColor,
        },
      },
    ],
  };
}

function applyElementDefaultTextStyle(
  block: PortableExportBlock,
  element: WriterElementV2,
): PortableExportBlock {
  if (block.type === 'paragraph' || block.type === 'heading') {
    return {
      ...block,
      children: block.children.map((child) => ({
        ...child,
        style: applyDefaultRunStyle(child.style, element),
      })),
    };
  }

  if (block.type === 'list') {
    return {
      ...block,
      items: block.items.map((item) => ({
        ...item,
        children: item.children.map((child) => ({
          ...child,
          style: applyDefaultRunStyle(child.style, element),
        })),
      })),
    };
  }

  if (block.type === 'table') {
    return {
      ...block,
      rows: block.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => ({
          ...cell,
          children: cell.children.map((child) =>
            applyElementDefaultTextStyle(child, element),
          ),
        })),
      })),
    };
  }

  return block;
}

function applyDefaultRunStyle(
  style: PortableTextStyle,
  element: WriterElementV2,
): PortableTextStyle {
  return {
    ...style,
    fontFamily: style.fontFamily ?? element.style.fontFamily,
    fontSize: style.fontSize ?? element.style.fontSize,
    color: style.color ?? element.style.textColor,
  };
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
