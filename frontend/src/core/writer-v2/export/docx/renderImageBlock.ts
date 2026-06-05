import {
  ImageRun,
  Paragraph,
  TextRun,
} from 'docx';
import type { PortableImageBlock, WriterDocxExportDiagnostic } from './types';
import { clampImageSize } from './docxUnits';
import type { WriterDocxAssetResolver } from './writerDocxAssetResolver';
import { dataUrlToBytes } from './writerDocxAssetResolver';

export async function renderImageBlock(
  block: PortableImageBlock,
  assets: WriterDocxAssetResolver,
  diagnostics: WriterDocxExportDiagnostic[],
): Promise<Paragraph[]> {
  const resolved = await resolveImageBytes(block, assets, diagnostics);

  if (!resolved) {
    diagnostics.push({
      level: 'warning',
      code: 'MISSING_IMAGE_ASSET',
      message: 'Image block could not be resolved for DOCX export.',
      elementId: block.elementId,
      elementType: block.elementType,
      pageIndex: block.pageIndex,
    });

    return [
      new Paragraph({
        children: [new TextRun('[Missing image]')],
      }),
    ];
  }

  const imageType = mimeTypeToDocxImageType(resolved.mimeType);

  if (!imageType) {
    diagnostics.push({
      level: 'warning',
      code: 'UNSUPPORTED_DOCX_FEATURE',
      message: `Unsupported image MIME type for DOCX export: ${resolved.mimeType}`,
      elementId: block.elementId,
      elementType: block.elementType,
      pageIndex: block.pageIndex,
    });

    return [
      new Paragraph({
        children: [new TextRun('[Unsupported image]')],
      }),
    ];
  }

  const size = clampImageSize({
    width: block.width,
    height: block.height,
    fallbackWidth: resolved.width,
    fallbackHeight: resolved.height,
  });

  const imageParagraph = new Paragraph({
    spacing: {
      before: 120,
      after: block.caption ? 40 : 120,
    },
    children: [
      new ImageRun({
        type: imageType,
        data: resolved.bytes,
        transformation: {
          width: size.width,
          height: size.height,
        },
        altText: {
          title: block.altText ?? 'Writer image',
          description: block.altText ?? '',
          name: block.altText ?? 'Writer image',
        },
      }),
    ],
  });

  if (!block.caption) {
    return [imageParagraph];
  }

  return [
    imageParagraph,
    new Paragraph({
      spacing: {
        after: 120,
      },
      children: [
        new TextRun({
          text: block.caption,
          italics: true,
          size: 18,
          color: '64748B',
        }),
      ],
    }),
  ];
}

async function resolveImageBytes(
  block: PortableImageBlock,
  assets: WriterDocxAssetResolver,
  diagnostics: WriterDocxExportDiagnostic[],
): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  width?: number;
  height?: number;
} | null> {
  if (block.assetId) {
    const asset = await assets.getImageAsset(block.assetId);

    if (asset) {
      return {
        bytes: asset.bytes,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      };
    }
  }

  if (block.src?.startsWith('data:image/')) {
    diagnostics.push({
      level: 'info',
      code: 'INLINE_IMAGE_SRC_USED',
      message: 'Inline image data URL was used for DOCX export.',
      elementId: block.elementId,
      elementType: block.elementType,
      pageIndex: block.pageIndex,
    });

    return {
      bytes: dataUrlToBytes(block.src),
      mimeType: block.src.slice(5, block.src.indexOf(';')),
      width: typeof block.width === 'number' ? block.width : undefined,
      height: typeof block.height === 'number' ? block.height : undefined,
    };
  }

  return null;
}

function mimeTypeToDocxImageType(
  mimeType: string,
): 'png' | 'jpg' | 'gif' | 'bmp' | undefined {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes('png')) return 'png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('bmp')) return 'bmp';

  return undefined;
}
