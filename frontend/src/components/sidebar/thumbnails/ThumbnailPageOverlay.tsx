import React from 'react';
import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';

interface ThumbnailPageOverlayProps {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  annotations: PdfAnnotation[];
  writerElements: WriterElementV2[];
}

/** Returns preview stroke/fill color for an annotation type */
function annotationPreviewColor(type: string): string {
  switch (type) {
    case 'highlight':
      return 'rgba(250, 204, 21, 0.55)';
    case 'underline':
    case 'strikeout':
    case 'squiggly':
      return 'rgba(239, 68, 68, 0.75)';
    case 'comment':
    case 'sticky-note':
    case 'callout':
      return 'rgba(59, 130, 246, 0.65)';
    case 'shape-rect':
    case 'shape-ellipse':
    case 'shape-cloud':
    case 'shape-polygon':
      return 'rgba(34, 197, 94, 0.55)';
    case 'redaction':
      return 'rgba(15, 23, 42, 0.85)';
    case 'line':
    case 'arrow':
      return 'rgba(100, 116, 139, 0.75)';
    case 'ink':
      return 'rgba(139, 92, 246, 0.85)';
    case 'stamp':
      return 'rgba(239, 68, 68, 0.65)';
    case 'textbox':
      return 'rgba(51, 65, 85, 0.75)';
    default:
      return 'rgba(100, 116, 139, 0.55)';
  }
}

function pointsToSvgPath(points: number[]): string {
  if (!points || points.length < 2) return '';
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) {
    d += ` L ${points[i]} ${points[i + 1]}`;
  }
  return d;
}

export const ThumbnailPageOverlay: React.FC<ThumbnailPageOverlayProps> = ({
  pageNumber,
  pageWidth,
  pageHeight,
  annotations,
  writerElements,
}) => {
  if (pageWidth <= 0 || pageHeight <= 0) return null;

  const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber);
  const pageWriterElements = writerElements.filter(
    (el) => el.pageIndex === pageNumber - 1,
  );

  if (pageAnnotations.length === 0 && pageWriterElements.length === 0) {
    return null;
  }

  return (
    <svg
      data-testid={`thumbnail-overlay-page-${pageNumber}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
      preserveAspectRatio="xMidYMin meet"
    >
      {/* 1. PDF Annotations */}
      {pageAnnotations.map((a) => {
        const color =
          (a.data.borderColor as string) ||
          (a.data.textColor as string) ||
          annotationPreviewColor(a.type);
        const fill =
          (a.data.backgroundColor as string) ||
          (a.type === 'highlight' ? 'rgba(250, 204, 21, 0.45)' : 'none');
        const strokeWidth = Math.max(
          1,
          typeof a.data.borderWidth === 'number' ? a.data.borderWidth : 2,
        );

        if (a.type === 'ink') {
          // Freehand ink: render actual path curves
          const paths = a.data.paths as Array<number[]> | undefined;
          const points = a.data.points as number[] | undefined;

          if (paths && paths.length > 0) {
            return (
              <g key={a.id}>
                {paths.map((pts, idx) => (
                  <path
                    key={`${a.id}-p-${idx}`}
                    d={pointsToSvgPath(pts)}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            );
          }

          if (points && points.length >= 2) {
            return (
              <path
                key={a.id}
                d={pointsToSvgPath(points)}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }
        }

        if (a.type === 'line' || a.type === 'arrow') {
          const start = a.data.startPoint as Point2D | undefined;
          const end = a.data.endPoint as Point2D | undefined;
          const x1 = start ? start.x : a.rect.x;
          const y1 = start ? start.y : a.rect.y;
          const x2 = end ? end.x : a.rect.x + a.rect.width;
          const y2 = end ? end.y : a.rect.y + a.rect.height;

          return (
            <line
              key={a.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          );
        }

        if (a.type === 'shape-ellipse') {
          const cx = a.rect.x + a.rect.width / 2;
          const cy = a.rect.y + a.rect.height / 2;
          const rx = Math.max(a.rect.width / 2, 2);
          const ry = Math.max(a.rect.height / 2, 2);

          return (
            <ellipse
              key={a.id}
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill={fill}
              stroke={color}
              strokeWidth={strokeWidth}
            />
          );
        }

        if (a.type === 'shape-polygon') {
          const polyPoints = a.data.polygonPoints as Point2D[] | undefined;
          if (polyPoints && polyPoints.length >= 3) {
            const ptsStr = polyPoints.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <polygon
                key={a.id}
                points={ptsStr}
                fill={fill}
                stroke={color}
                strokeWidth={strokeWidth}
              />
            );
          }
        }

        if (a.type === 'callout') {
          const anchor = a.data.anchor as Point2D | undefined;
          const knee = a.data.knee as Point2D | undefined;

          return (
            <g key={a.id}>
              {anchor && knee && (
                <>
                  <line
                    x1={anchor.x}
                    y1={anchor.y}
                    x2={knee.x}
                    y2={knee.y}
                    stroke={color}
                    strokeWidth={strokeWidth}
                  />
                  <line
                    x1={knee.x}
                    y1={knee.y}
                    x2={a.rect.x}
                    y2={a.rect.y + a.rect.height / 2}
                    stroke={color}
                    strokeWidth={strokeWidth}
                  />
                </>
              )}
              <rect
                x={a.rect.x}
                y={a.rect.y}
                width={Math.max(a.rect.width, 6)}
                height={Math.max(a.rect.height, 4)}
                fill="rgba(255, 255, 255, 0.85)"
                stroke={color}
                strokeWidth={strokeWidth}
                rx={2}
              />
            </g>
          );
        }

        // Default / Rect-based annotations (textbox, highlight, redaction, stamp, rect)
        return (
          <rect
            key={a.id}
            x={a.rect.x}
            y={a.rect.y}
            width={Math.max(a.rect.width, 6)}
            height={Math.max(a.rect.height, 4)}
            fill={a.type === 'redaction' ? '#0f172a' : fill !== 'none' ? fill : annotationPreviewColor(a.type)}
            stroke={a.type === 'highlight' ? 'none' : color}
            strokeWidth={strokeWidth}
            rx={2}
          />
        );
      })}

      {/* 2. Writer V2 Elements */}
      {pageWriterElements.map((el) => {
        const isTable = el.type === 'tableBox';
        const color = isTable ? 'rgba(168, 85, 247, 0.8)' : 'rgba(59, 130, 246, 0.8)';
        const fill = isTable ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)';

        return (
          <g key={`writer-${el.id}`}>
            <rect
              x={el.rect.x}
              y={el.rect.y}
              width={Math.max(el.rect.width, 8)}
              height={Math.max(el.rect.height, 6)}
              fill={fill}
              stroke={color}
              strokeWidth={1}
              rx={1.5}
            />
            {el.callout?.anchorPoint && (
              <line
                x1={el.callout.anchorPoint.x}
                y1={el.callout.anchorPoint.y}
                x2={el.rect.x}
                y2={el.rect.y + el.rect.height / 2}
                stroke={color}
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};
