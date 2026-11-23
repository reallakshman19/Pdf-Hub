import React, { useMemo } from 'react';
import type { AnnotationNodeProps, Point2D } from '../../core/annotations/types';
import {
  formatDimensionLabel,
  type ScaleCalibration,
} from '../../core/annotations/calibration';

export const PerimeterTakeoffNode: React.FC<AnnotationNodeProps<'line'>> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const strokeColor = (annotation.data?.borderColor as string) ?? '#2563eb'; // Engineering blue pipe line
  const strokeWidth = (typeof annotation.data?.borderWidth === 'number' ? annotation.data.borderWidth : 2) * scale;
  const startNode = typeof annotation.data?.startNodeNumber === 'number' ? annotation.data.startNodeNumber : 100;
  const nodeInc = typeof annotation.data?.nodeIncrement === 'number' ? annotation.data.nodeIncrement : 10;

  const calibration: ScaleCalibration = useMemo(() => ({
    scaleRatio: typeof annotation.data?.dimensionScale === 'number' ? annotation.data.dimensionScale : 100,
    unit: (annotation.data?.dimensionUnit as any) ?? 'mm',
    precision: typeof annotation.data?.dimensionPrecision === 'number' ? annotation.data.dimensionPrecision : 0,
  }), [annotation.data?.dimensionScale, annotation.data?.dimensionUnit, annotation.data?.dimensionPrecision]);

  // Extract relative coordinates and transform to scaled canvas coords
  const points = useMemo(() => {
    const raw = (annotation.data?.points as number[]) ?? [];
    const pts: Point2D[] = [];
    if (raw.length >= 4) {
      for (let i = 0; i < raw.length - 1; i += 2) {
        pts.push({
          x: (rect.x + raw[i]) * scale,
          y: (rect.y + raw[i + 1]) * scale,
        });
      }
    } else {
      pts.push({ x: rect.x * scale, y: (rect.y + rect.height / 2) * scale });
      pts.push({ x: (rect.x + rect.width) * scale, y: (rect.y + rect.height / 2) * scale });
    }
    return pts;
  }, [annotation.data?.points, rect, scale]);

  // Calculate segment lengths and cumulative total
  const segments = useMemo(() => {
    let totalLengthMm = 0;
    const segs: Array<{
      p1: Point2D;
      p2: Point2D;
      midX: number;
      midY: number;
      label: string;
      lengthMm: number;
    }> = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const unscaledP1 = { x: p1.x / scale, y: p1.y / scale };
      const unscaledP2 = { x: p2.x / scale, y: p2.y / scale };

      const label = formatDimensionLabel(unscaledP1, unscaledP2, calibration);
      const dx = (unscaledP2.x - unscaledP1.x);
      const dy = (unscaledP2.y - unscaledP1.y);
      const distPt = Math.hypot(dx, dy);
      const sheetMm = (distPt / 72) * 25.4;
      const lengthMm = sheetMm * calibration.scaleRatio;
      totalLengthMm += lengthMm;

      segs.push({
        p1,
        p2,
        midX: (p1.x + p2.x) / 2,
        midY: (p1.y + p2.y) / 2,
        label,
        lengthMm,
      });
    }

    return { segs, totalLengthMm };
  }, [points, scale, calibration]);

  const polylinePoints = useMemo(() => {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  }, [points]);

  const totalLabel = `${Math.round(segments.totalLengthMm).toLocaleString()} ${calibration.unit} (${segments.segs.length} segs)`;

  return (
    <div
      data-annotation-type="perimeter-takeoff"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: annotation.data?.opacity ?? 1 }}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        width="100%"
        height="100%"
        style={{ overflow: 'visible' }}
      >
        {/* Transparent wide hit polyline for selection */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(16, strokeWidth * 4)}
          style={{ pointerEvents: 'stroke', cursor: isSelected ? 'move' : 'pointer' }}
          onPointerDown={(e) => {
            onSelect(e as unknown as React.PointerEvent<HTMLDivElement>);
            onTransformStart(e as unknown as React.PointerEvent<HTMLDivElement>, 'move');
          }}
        />

        {/* Visible centerline pipe run */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />

        {/* Segment Dimension Badges */}
        {segments.segs.map((seg, idx) => (
          <g key={`seg-${idx}`} transform={`translate(${seg.midX}, ${seg.midY})`}>
            <rect
              x={-32}
              y={-9}
              width={64}
              height={18}
              rx={3}
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={1}
              opacity={0.92}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight="600"
              fill="#1e293b"
            >
              {seg.label}
            </text>
          </g>
        ))}

        {/* Vertex Node Markers (CAESAR II Node Numbers) */}
        {points.map((p, idx) => {
          const nodeNum = startNode + idx * nodeInc;
          return (
            <g key={`node-${idx}`} transform={`translate(${p.x}, ${p.y})`}>
              <circle
                r={6 * scale}
                fill="#ffffff"
                stroke={strokeColor}
                strokeWidth={1.5 * scale}
              />
              <text
                y={-10 * scale}
                textAnchor="middle"
                fontSize={9 * scale}
                fontWeight="700"
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={0.5}
              >
                {nodeNum}
              </text>
            </g>
          );
        })}

        {/* Total Run Summary Badge at last vertex */}
        {points.length > 0 && (
          <g
            transform={`translate(${points[points.length - 1].x + 12}, ${
              points[points.length - 1].y + 12
            })`}
          >
            <rect
              x={0}
              y={-11}
              width={totalLabel.length * 7 + 16}
              height={22}
              rx={4}
              fill="#1e293b"
              stroke="#38bdf8"
              strokeWidth={1}
            />
            <text
              x={8}
              y={0}
              dominantBaseline="central"
              fontSize={11}
              fontWeight="700"
              fill="#38bdf8"
            >
              {totalLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
