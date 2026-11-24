/**
 * Multi-Column Visual Canvas Guides Overlay.
 * Renders dashed column boundaries, column order tags, and shaded gutter markers over multi-column PDF layouts.
 */

import React from 'react';
import type { MultiColumnLayout } from '@/core/existing-text/columnFlowTypes';

export interface MultiColumnOverlayProps {
  layout: MultiColumnLayout | null;
  pageHeightPt: number;
  scale: number;
  visible?: boolean;
}

export const MultiColumnOverlay: React.FC<MultiColumnOverlayProps> = ({
  layout,
  pageHeightPt,
  scale,
  visible = true,
}) => {
  if (!visible || !layout || layout.columns.length < 2) {
    return null;
  }

  return (
    <div
      data-testid="multi-column-overlay"
      className="pointer-events-none absolute inset-0 z-10"
      aria-label={`Multi-column guide for page ${layout.pageIndex + 1}`}
    >
      {layout.columns.map((col) => {
        // PDF Y-axis is bottom-up; convert to DOM top-down
        const topPx = (pageHeightPt - col.topPt) * scale;
        const leftPx = col.leftPt * scale;
        const widthPx = col.widthPt * scale;
        const heightPx = col.heightPt * scale;

        const gutterLeftPx = (col.leftPt + col.widthPt) * scale;
        const gutterWidthPx = col.gutterRightPt * scale;

        return (
          <React.Fragment key={`col-guide-${col.columnIndex}`}>
            {/* Column Box */}
            <div
              data-testid={`column-box-${col.columnIndex}`}
              className="absolute rounded border border-dashed border-blue-400/80 bg-blue-500/5 transition-opacity"
              style={{
                left: leftPx,
                top: topPx,
                width: widthPx,
                height: heightPx,
              }}
            >
              <div className="absolute -top-5 left-1 flex items-center gap-1 rounded bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                <span>Col {col.columnIndex + 1}</span>
                <span className="opacity-75">({Math.round(col.widthPt)}pt)</span>
              </div>
            </div>

            {/* Gutter marker if right gutter exists */}
            {col.gutterRightPt > 0 && (
              <div
                data-testid={`gutter-box-${col.columnIndex}`}
                className="absolute border-x border-dashed border-amber-400/60 bg-amber-400/10"
                style={{
                  left: gutterLeftPx,
                  top: topPx,
                  width: gutterWidthPx,
                  height: heightPx,
                }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-amber-500/80 px-1 py-0.2 text-[9px] font-medium text-amber-950">
                  {Math.round(col.gutterRightPt)}pt
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
