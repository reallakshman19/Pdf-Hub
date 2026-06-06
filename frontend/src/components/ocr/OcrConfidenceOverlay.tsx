import React from 'react';
import type { OcrWord } from '@/core/ocr/types';
import {
  getOcrConfidenceBand,
  getOcrConfidenceClassName,
  getOcrConfidenceColor,
  type OcrConfidenceBand,
} from '@/core/ocr/ocrConfidence';

export interface OcrConfidenceOverlayProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  words: OcrWord[];
  visible?: boolean;
  showLabels?: boolean;
  selectedWordId?: string | null;
  minConfidenceBand?: OcrConfidenceBand;
  onWordClick?: (word: OcrWord) => void;
}

export const OcrConfidenceOverlay: React.FC<OcrConfidenceOverlayProps> = ({
  pageIndex,
  pageWidth,
  pageHeight,
  viewportWidth,
  viewportHeight,
  words,
  visible = true,
  showLabels = false,
  selectedWordId,
  minConfidenceBand,
  onWordClick,
}) => {
  if (!visible) {
    return null;
  }

  const pageWords = words
    .filter((word) => word.pageIndex === pageIndex)
    .filter((word) =>
      minConfidenceBand
        ? confidenceBandRank(getOcrConfidenceBand(word.confidence)) <= confidenceBandRank(minConfidenceBand)
        : true,
    );

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid="ocr-confidence-overlay"
      aria-label={`OCR confidence overlay for page ${pageIndex + 1}`}
    >
      {pageWords.map((word) => {
        const band = getOcrConfidenceBand(word.confidence);
        const color = getOcrConfidenceColor(band);
        const rect = pdfRectToViewportRect({
          rect: word.bbox,
          pageWidth,
          pageHeight,
          viewportWidth,
          viewportHeight,
        });

        const selected = selectedWordId === word.id;

        return (
          <button
            key={word.id}
            type="button"
            className={[
              'pointer-events-auto absolute rounded-sm border text-[10px] leading-none',
              getOcrConfidenceClassName(band),
              selected ? 'ring-2 ring-blue-500 ring-offset-1' : '',
            ].join(' ')}
            data-testid="ocr-confidence-word"
            data-ocr-word-id={word.id}
            data-ocr-confidence-band={band}
            title={`${word.text} · ${Math.round(word.confidence * 100)}%`}
            style={{
              left: rect.left,
              top: rect.top,
              width: Math.max(4, rect.width),
              height: Math.max(4, rect.height),
              borderColor: color,
              backgroundColor: withAlpha(color, 0.18),
              color,
            }}
            onClick={() => onWordClick?.(word)}
          >
            {showLabels ? (
              <span className="sr-only">
                {word.text}
              </span>
            ) : (
              <span className="sr-only">
                {word.text} confidence {Math.round(word.confidence * 100)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export interface PdfRectToViewportRectInput {
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function pdfRectToViewportRect(
  input: PdfRectToViewportRectInput,
): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const scaleX = input.viewportWidth / Math.max(1, input.pageWidth);
  const scaleY = input.viewportHeight / Math.max(1, input.pageHeight);

  return {
    left: input.rect.x * scaleX,
    top: (input.pageHeight - input.rect.y - input.rect.height) * scaleY,
    width: input.rect.width * scaleX,
    height: input.rect.height * scaleY,
  };
}

function confidenceBandRank(
  band: OcrConfidenceBand,
): number {
  if (band === 'low') return 0;
  if (band === 'medium') return 1;
  if (band === 'high') return 2;
  return 3;
}

function withAlpha(
  hex: string,
  alpha: number,
): string {
  const parsed = parseHexColor(hex);

  if (!parsed) {
    return `rgba(100, 116, 139, ${alpha})`;
  }

  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

function parseHexColor(
  hex: string,
): { r: number; g: number; b: number } | null {
  const value = hex.replace('#', '');

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}