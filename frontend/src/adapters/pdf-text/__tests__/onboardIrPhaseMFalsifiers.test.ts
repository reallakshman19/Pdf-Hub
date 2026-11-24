import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resetCommandBusForTests } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { classifyHistoryReplayability } from '@/core/document-history/replayability';
import {
  calculateFrameRepositioning,
  getMarqueeIntersectingFrames,
  type ExistingTextFrame,
} from '@/core/existing-text/frameGeometry';
import {
  applyMoveTextFrameInBytes,
  applyResizeTextFrameInBytes,
} from '../PdfLibExistingTextFrameReconstruction';
import { readExistingTextPageContentStreams } from '../PdfLibExistingTextContentStreams';

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    MAX_PDF_SIZE_BYTES: 100 * 1024 * 1024,
    hashBytes: vi.fn().mockImplementation(
      async (bytes: Uint8Array) => 'hash-' + bytes.length,
    ),
  },
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: vi.fn().mockResolvedValue(undefined),
  loadAnnotations: vi.fn().mockResolvedValue([]),
}));

function decodePdfContentString(content: string): string {
  return content.replace(/<([0-9A-Fa-f]+)>/g, (_, hex) => {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    return str;
  });
}

function minimalFrame(
  frameId: string,
  bounds: ExistingTextFrame['bounds'],
  text: string,
): ExistingTextFrame {
  return {
    frameId,
    revisionId: 'r',
    pageIndex: 0,
    pageId: 'p',
    bounds,
    originalBounds: { ...bounds },
    text,
    spanIds: [],
    fontSizePt: 12,
    leadingPt: 14,
  };
}

describe('OnBoard-IR Phase M Adversarial Falsifiers: Interactive Text Frame Repositioning, Resizing & Reflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommandBusForTests();
    useHistoryStore.getState().clear();
    useSessionStore.getState().clearDocument();
  });

  it('Falsifier 1 (Boundary Repositioning Inpainting & Relocation): Inpaints original box and renders text at target coordinates', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Original Frame Line 1\nOriginal Frame Line 2', {
      x: 100,
      y: 200,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    const originalBytes = new Uint8Array(await doc.save());

    const frame: ExistingTextFrame = {
      frameId: 'test-frame-1',
      revisionId: 'rev-1',
      pageIndex: 0,
      pageId: 'page-1',
      bounds: { x: 100, y: 200, width: 220, height: 40 },
      originalBounds: { x: 100, y: 200, width: 220, height: 40 },
      text: 'Original Frame Line 1\nOriginal Frame Line 2',
      originalText: 'Original Frame Line 1\nOriginal Frame Line 2',
      spanIds: ['s1', 's2'],
      fontSizePt: 14,
      leadingPt: 18,
      fontName: 'Helvetica',
    };

    const targetPos = { x: 280, y: 460 };
    const moveResult = await applyMoveTextFrameInBytes({
      pdfBytes: originalBytes,
      currentRevisionId: 'rev-1',
      pageIndex: 0,
      intent: {
        schemaVersion: 1,
        sourceRevisionId: 'rev-1',
        pageIndex: 0,
        pageId: 'page-1',
        frame,
        targetPosition: targetPos,
      },
    });

    expect(moveResult.result.newBounds.x).toBe(targetPos.x);
    expect(moveResult.result.newBounds.y).toBe(targetPos.y);
    expect(moveResult.result.newBounds.width).toBe(220);
    expect(moveResult.result.newBounds.height).toBe(40);
    expect(moveResult.modifiedBytes.byteLength).toBeGreaterThan(0);

    // Verify content streams contain repositioned text and inpainting rectangle
    const streamResult = await readExistingTextPageContentStreams(moveResult.modifiedBytes, 0);
    const combined = streamResult.streams.map((s) => new TextDecoder().decode(s.decodedBytes)).join('\n');
    const decoded = decodePdfContentString(combined);
    expect(decoded).toContain('Original Frame Line 1');
    expect(decoded).toContain('Original Frame Line 2');
    expect(combined).toContain('1 1 1 rg'); // whiteout inpainting operator
  });

  it('Falsifier 2 (Horizontal Resize Typographic Line Wrapping): Wraps lines and updates height dynamically', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fullText = 'The quick brown fox jumps over the lazy dog and runs across the wide open meadow';
    page.drawText(fullText, {
      x: 50,
      y: 500,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    const originalBytes = new Uint8Array(await doc.save());

    const frame: ExistingTextFrame = {
      frameId: 'test-frame-reflow',
      revisionId: 'rev-2',
      pageIndex: 0,
      pageId: 'page-1',
      bounds: { x: 50, y: 500, width: 450, height: 20 },
      originalBounds: { x: 50, y: 500, width: 450, height: 20 },
      text: fullText,
      originalText: fullText,
      spanIds: ['s-reflow'],
      fontSizePt: 12,
      leadingPt: 16,
      fontName: 'Helvetica',
    };

    // Narrow width to 150pt (forcing multi-line wrap)
    const resizeResult = await applyResizeTextFrameInBytes({
      pdfBytes: originalBytes,
      currentRevisionId: 'rev-2',
      pageIndex: 0,
      intent: {
        schemaVersion: 1,
        sourceRevisionId: 'rev-2',
        pageIndex: 0,
        pageId: 'page-1',
        frame,
        newWidthPt: 150,
        handle: 'e',
      },
    });

    expect(resizeResult.result.lines.length).toBeGreaterThan(2);
    expect(resizeResult.result.newBounds.width).toBe(150);
    expect(resizeResult.result.newBounds.height).toBeGreaterThan(frame.bounds.height);

    const streamResult = await readExistingTextPageContentStreams(resizeResult.modifiedBytes, 0);
    const combined = streamResult.streams.map((s) => new TextDecoder().decode(s.decodedBytes)).join('\n');
    const decoded = decodePdfContentString(combined);
    expect(decoded).toContain('quick');
    expect(decoded).toContain('meadow');
  });

  it('Falsifier 3 (Marquee Selection Multi-Frame Intersection): Filters intersecting frames precisely', () => {
    const frames: ExistingTextFrame[] = [
      minimalFrame('f1', { x: 50, y: 100, width: 100, height: 30 }, 'Frame 1'),
      minimalFrame('f2', { x: 180, y: 100, width: 100, height: 30 }, 'Frame 2'),
      minimalFrame('f3', { x: 50, y: 400, width: 100, height: 30 }, 'Frame 3'),
      minimalFrame('f4', { x: 400, y: 700, width: 100, height: 30 }, 'Frame 4'),
    ];

    // Marquee encompassing f1 and f2 only
    const marquee = { x: 40, y: 90, width: 260, height: 60 };
    const hits = getMarqueeIntersectingFrames(marquee, frames);

    expect(hits).toEqual(['f1', 'f2']);
  });

  it('Falsifier 4 (Replayability & Command Bus Self-Containment): Categorizes frame mutations as self-contained replay', () => {
    const moveCmd = materializePdfCommand(
      {
        type: 'MOVE_EXISTING_TEXT_BLOCK',
        payload: {
          schemaVersion: 1,
          sourcePageIndex: 0,
          sourcePageId: 'page-1',
          intent: {
            schemaVersion: 1,
            sourceRevisionId: 'rev-1',
            pageIndex: 0,
            pageId: 'page-1',
            frame: minimalFrame('f', { x: 10, y: 10, width: 50, height: 20 }, 'test'),
            targetPosition: { x: 20, y: 20 },
          },
        },
      },
      'toolbar',
      'rev-1',
    );

    const resizeCmd = materializePdfCommand(
      {
        type: 'RESIZE_EXISTING_TEXT_BLOCK',
        payload: {
          schemaVersion: 1,
          sourcePageIndex: 0,
          sourcePageId: 'page-1',
          intent: {
            schemaVersion: 1,
            sourceRevisionId: 'rev-1',
            pageIndex: 0,
            pageId: 'page-1',
            frame: minimalFrame('f', { x: 10, y: 10, width: 50, height: 20 }, 'test'),
            newWidthPt: 120,
            handle: 'e',
          },
        },
      },
      'toolbar',
      'rev-1',
    );

    const moveClassification = classifyHistoryReplayability(moveCmd);
    expect(moveClassification.disposition).toBe('SELF_CONTAINED_REPLAY');
    expect(moveClassification.barriers).toHaveLength(0);

    const resizeClassification = classifyHistoryReplayability(resizeCmd);
    expect(resizeClassification.disposition).toBe('SELF_CONTAINED_REPLAY');
    expect(resizeClassification.barriers).toHaveLength(0);
  });

  it('Falsifier 5 (Adversarial Geometric Bounds & Out-of-Bounds Clamping): Clamps out-of-bounds target coordinates within page', () => {
    const frame = minimalFrame(
      'f-clamp',
      { x: 100, y: 100, width: 120, height: 40 },
      'Clamping test',
    );

    const pageSize = { width: 500, height: 700 };

    // Drag beyond negative boundaries
    const negativeTarget = { x: -50, y: -80 };
    const clampedNeg = calculateFrameRepositioning(frame, negativeTarget, pageSize);
    expect(clampedNeg.x).toBe(0);
    expect(clampedNeg.y).toBe(0);

    // Margin snapping within snapThreshold
    const nearMarginTarget = { x: 8, y: 12 };
    const snappedMargin = calculateFrameRepositioning(frame, nearMarginTarget, pageSize, {
      snapThreshold: 10,
      margins: { left: 15, bottom: 15, right: 15, top: 15 },
    });
    expect(snappedMargin.x).toBe(15);
    expect(snappedMargin.y).toBe(15);

    // Drag beyond right and top boundaries
    const overflowTarget = { x: 600, y: 800 };
    const clampedOver = calculateFrameRepositioning(frame, overflowTarget, pageSize);
    expect(clampedOver.x).toBe(500 - frame.bounds.width);
    expect(clampedOver.y).toBe(700 - frame.bounds.height);
  });
});
