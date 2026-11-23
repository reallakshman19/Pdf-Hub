import React from 'react';
import type { OcrPageResult, OcrWord, OcrCorrection } from '@/core/ocr/types';
import { useOcrStore } from '@/core/ocr/ocrStore';
import {
  ocrRectToViewportStyle,
  getEffectiveWordText,
  isWordLowConfidence,
} from './ocrCanvasCoordinateAdapter';

export interface OcrCanvasTextLayerProps {
  pageIndex: number;
  pageResult?: OcrPageResult | null;
  scale: number;
  visible?: boolean;
  highlightLowConfidence?: boolean;
  confidenceThreshold?: number;
  onWordClick?: (word: OcrWord, currentText: string, anchorRect: DOMRect) => void;
}

/**
 * Interactive Document Canvas OCR Text Selection & Highlight Layer.
 * Renders transparent, pixel-registered text spans matching OCR word bounding boxes.
 * Enables:
 * - Native browser click-and-drag text selection and copy directly off scanned documents.
 * - Subtle amber underlining of low-confidence words.
 * - Click handler to open the in-place inline correction popover.
 */
export const OcrCanvasTextLayer: React.FC<OcrCanvasTextLayerProps> = ({
  pageResult,
  scale,
  visible = true,
  highlightLowConfidence = true,
  confidenceThreshold = 0.75,
  onWordClick,
}) => {
  const corrections = useOcrStore((state) => state.corrections);

  const correctionsByTargetId = React.useMemo(() => {
    const map = new Map<string, OcrCorrection>();
    (corrections ?? []).forEach((c) => {
      if (c.targetId) {
        map.set(c.targetId, c);
      }
    });
    return map;
  }, [corrections]);

  // Extract all words from pageResult (either direct words or traversed from lines/blocks)
  const words = React.useMemo(() => {
    if (!pageResult) return [];

    if (pageResult.words && pageResult.words.length > 0) {
      return pageResult.words;
    }

    // Fallback: derive words from lines if pageResult.words is empty
    if (pageResult.lines && pageResult.lines.length > 0) {
      const derived: OcrWord[] = [];
      pageResult.lines.forEach((line) => {
        const lineWords = line.text?.split(/\s+/).filter(Boolean) ?? [];
        const wordWidth = line.bbox.width / Math.max(1, lineWords.length);
        lineWords.forEach((token, wIdx) => {
          derived.push({
            id: `${line.id}-w${wIdx}`,
            pageIndex: line.pageIndex,
            text: token,
            normalizedText: token.toLowerCase(),
            confidence: line.confidence ?? 1.0,
            bbox: {
              x: line.bbox.x + wIdx * wordWidth,
              y: line.bbox.y,
              width: wordWidth,
              height: line.bbox.height,
            },
            lineId: line.id,
          });
        });
      });
      return derived;
    }

    return [];
  }, [pageResult]);

  if (!visible || !pageResult || words.length === 0) {
    return null;
  }

  const handleSpanClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    word: OcrWord,
    text: string,
  ) => {
    if (onWordClick) {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      onWordClick(word, text, rect);
    }
  };

  return (
    <div
      className="ocr-canvas-text-layer absolute inset-0 pointer-events-auto select-text z-[5]"
      data-testid="ocr-canvas-text-layer"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {words.map((word) => {
        const text = getEffectiveWordText(word, correctionsByTargetId);
        const style = ocrRectToViewportStyle(word.bbox, scale);
        const isLowConf = highlightLowConfidence && isWordLowConfidence(word, correctionsByTargetId, confidenceThreshold);
        const isCorrected = correctionsByTargetId.has(word.id);

        return (
          <span
            key={word.id}
            data-testid="ocr-word-span"
            data-word-id={word.id}
            data-confidence={word.confidence}
            data-low-confidence={isLowConf ? 'true' : 'false'}
            data-corrected={isCorrected ? 'true' : 'false'}
            onClick={(e) => handleSpanClick(e, word, text)}
            title={
              isCorrected
                ? `Corrected: "${text}" (original: "${word.text}")`
                : `"${text}" (${Math.round((word.confidence ?? 1) * 100)}% conf)`
            }
            className={`ocr-word-span absolute cursor-text transition-colors duration-150 ${
              isLowConf
                ? 'border-b-[1.5px] border-dotted border-amber-500 bg-amber-500/10 hover:bg-amber-500/25'
                : 'hover:bg-sky-500/15'
            } ${isCorrected ? 'border-b-[1.5px] border-emerald-500 bg-emerald-500/10' : ''}`}
            style={{
              left: `${style.left}px`,
              top: `${style.top}px`,
              width: `${style.width}px`,
              height: `${style.height}px`,
              fontSize: `${style.fontSize}px`,
              color: 'transparent',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              lineHeight: `${style.height}px`,
              whiteSpace: 'pre',
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
};
