import type {
  ExistingTextDeleteIntent,
  ExistingTextDeleteStrategy,
  ExistingTextDeletionResult,
} from '@/core/existing-text/erasureTypes';
import type { ExistingTextSimpleTextOperator } from '@/core/existing-text/provenanceTypes';
import type { ExistingTextSpan } from '@/core/existing-text/types';
import { ExistingTextReplacementError } from '@/core/existing-text/replacementError';
import {
  snapRotationDegrees,
  computeRotatedWhiteoutRect,
} from '@/core/existing-text/rotatedTextGeometry';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { applySimpleExistingTextReplacementToDocument } from './PdfLibExistingTextReplacement';
import { analyzeExistingTextVisualClearanceInDocument } from './PdfLibExistingTextVisualClearance';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFDocumentT = import('pdf-lib').PDFDocument;

function colorFromHex(
  hex: string,
  lib: PdfLibNs,
): import('pdf-lib').RGB {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 6) {
    return lib.rgb(1, 1, 1);
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return lib.rgb(
    Number.isFinite(r) ? r : 1,
    Number.isFinite(g) ? g : 1,
    Number.isFinite(b) ? b : 1,
  );
}

export async function eraseExistingTextSpanFromDocument(
  document: PDFDocumentT,
  lib: PdfLibNs,
  input: {
    currentRevisionId: string;
    span: ExistingTextSpan;
    intent: ExistingTextDeleteIntent;
    provenance?: ExistingTextSimpleTextOperator;
    strategy?: ExistingTextDeleteStrategy;
    signal?: AbortSignal;
  },
): Promise<ExistingTextDeletionResult> {
  const strategy = input.strategy ?? input.intent.strategy ?? 'auto';
  const rotationDegrees = snapRotationDegrees(input.span.rotationDegrees ?? 0);
  const isRotated = Math.abs(rotationDegrees) > 0.5 && Math.abs(rotationDegrees - 360) > 0.5;

  // 1. Try Native Stream Excision if applicable
  const canAttemptNative =
    input.provenance !== undefined &&
    input.span.editability === 'native-replacement-candidate' &&
    !isRotated &&
    strategy !== 'visual-inpaint';

  if (canAttemptNative && (strategy === 'native-excision' || strategy === 'auto')) {
    try {
      await applySimpleExistingTextReplacementToDocument(document, lib, {
        currentRevisionId: input.currentRevisionId,
        span: input.span,
        intent: {
          schemaVersion: 1,
          sourceRevisionId: input.currentRevisionId,
          pageId: input.span.pageId,
          spanId: input.span.id,
          sourceIndex: input.span.sourceIndex,
          expectedText: input.intent.expectedText,
          replacementText: '',
          sourceEditability: 'native-replacement-candidate',
        },
        provenance: input.provenance!,
        signal: input.signal,
      });

      return {
        success: true,
        strategyApplied: 'native-excision',
        spanId: input.span.id,
        pageIndex: input.span.pageIndex,
        originalText: input.span.text,
        bytesModified: true,
        visualClearanceProved: false,
        details: {
          streamIndex: input.provenance!.streamIndex,
          operatorIndex: input.provenance!.operatorIndex,
          whiteoutEmitted: false,
          rotationDegrees,
        },
      };
    } catch (error) {
      if (strategy === 'native-excision') {
        throw error;
      }
      // If 'auto', gracefully fall through to visual inpainting
    }
  }

  // 2. Visual Inpaint (Clearance Whiteout without redraw)
  if (strategy === 'native-excision') {
    throw new ExistingTextReplacementError(
      'NATIVE_EXCISION_UNAVAILABLE',
      'Native stream excision could not be applied for this text span.',
      [`span-editability=${input.span.editability}`, `isRotated=${isRotated}`],
    );
  }

  // Ensure provenance is available for clearance analysis if possible
  if (!input.provenance) {
    throw new ExistingTextReplacementError(
      'PROVENANCE_REQUIRED_FOR_CLEARANCE',
      'Text provenance operator is required to compute visual clearance for erasure.',
    );
  }

  const clearance = await analyzeExistingTextVisualClearanceInDocument(
    document,
    lib,
    {
      currentRevisionId: input.currentRevisionId,
      span: input.span,
      intent: {
        schemaVersion: 1,
        sourceRevisionId: input.currentRevisionId,
        pageId: input.span.pageId,
        spanId: input.span.id,
        sourceIndex: input.span.sourceIndex,
        expectedText: input.intent.expectedText,
        replacementText: '',
        sourceEditability: input.span.editability === 'unsupported' ? 'reconstructed-candidate' : input.span.editability,
      },
      provenance: input.provenance,
      signal: input.signal,
    },
  );

  if (clearance.status !== 'proved') {
    throw new ExistingTextReplacementError(
      'VISUAL_CLEARANCE_UNPROVED',
      'Visual clearance could not be proved for inpaint erasure.',
      clearance.reasons,
    );
  }

  const page = document.getPage(input.span.pageIndex);
  const inpaintColor = colorFromHex(clearance.proof.backgroundColorHex, lib);

  if (isRotated) {
    const rotatedWhiteout = computeRotatedWhiteoutRect(
      input.span.originPt,
      input.span.advanceWidthPt,
      input.span.fontSizePt,
      rotationDegrees,
      2,
    );

    page.drawRectangle({
      x: rotatedWhiteout.x,
      y: rotatedWhiteout.y,
      width: rotatedWhiteout.width,
      height: rotatedWhiteout.height,
      color: inpaintColor,
      rotate: lib.degrees(rotationDegrees),
      borderWidth: 0,
      opacity: 1,
    });
  } else {
    const rect = clearance.proof.clearanceRectPt;
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: inpaintColor,
      borderWidth: 0,
      opacity: 1,
    });
  }

  return {
    success: true,
    strategyApplied: 'visual-inpaint',
    spanId: input.span.id,
    pageIndex: input.span.pageIndex,
    originalText: input.span.text,
    bytesModified: true,
    visualClearanceProved: true,
    details: {
      streamIndex: input.provenance.streamIndex,
      operatorIndex: input.provenance.operatorIndex,
      whiteoutEmitted: true,
      rotationDegrees,
    },
  };
}

export async function eraseExistingTextSpanInBytes(
  input: {
    pdfBytes: Uint8Array;
    currentRevisionId: string;
    span: ExistingTextSpan;
    intent: ExistingTextDeleteIntent;
    provenance?: ExistingTextSimpleTextOperator;
    strategy?: ExistingTextDeleteStrategy;
    signal?: AbortSignal;
  },
): Promise<{
  modifiedBytes: Uint8Array;
  result: ExistingTextDeletionResult;
}> {
  const lib = await pdfLib();
  const document = await lib.PDFDocument.load(input.pdfBytes);

  const result = await eraseExistingTextSpanFromDocument(document, lib, input);
  const modifiedBytes = await document.save();

  return {
    modifiedBytes,
    result,
  };
}
