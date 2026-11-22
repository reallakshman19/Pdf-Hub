import React from 'react';
import type { AnnotationNodeProps, Point2D } from '../../core/annotations/types';
import {
  computeRealWorldDistance,
  formatDimensionLabel,
  type ScaleCalibration,
} from '../../core/annotations/calibration';
import { SelectionHandles } from './shared/SelectionHandles';

export const DimensionNode: React.FC<AnnotationNodeProps<'line' | 'dimension'>> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const p1: Point2D = (annotation.data?.p1 as Point2D) ?? { x: rect.x, y: rect.y + rect.height / 2 };
  const p2: Point2D = (annotation.data?.p2 as Point2D) ?? { x: rect.x + rect.width, y: rect.y + rect.height / 2 };

  const strokeColor = annotation.data?.borderColor ?? '#dc2626'; // Red engineering caliper default
  const strokeWidth = (typeof annotation.data?.borderWidth === 'number' ? annotation.data.borderWidth : 1.5) * scale;

  const calibration: ScaleCalibration = {
    scaleRatio: typeof annotation.data?.dimensionScale === 'number' ? annotation.data.dimensionScale : 100, // 1:100 default
    unit: annotation.data?.dimensionUnit ?? 'mm',
    precision: typeof annotation.data?.dimensionPrecision === 'number' ? annotation.data.dimensionPrecision : 0,
  };

  const labelText = annotation.data?.dimensionText
    ? String(annotation.data.dimensionText)
    : formatDimensionLabel(p1, p2, calibration);

  // Geometry calculations
  const dx = (p2.x - p1.x) * scale;
  const dy = (p2.y - p1.y) * scale;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const midX = (p1.x * scale + p2.x * scale) / 2;
  const midY = (p1.y * scale + p2.y * scale) / 2;

  // Perpendicular tick offset
  const tickLength = 10 * scale;
  const nx = -Math.sin(angle) * (tickLength / 2);
  const ny = Math.cos(angle) * (tickLength / 2);

  const startTick1 = { x: p1.x * scale + nx, y: p1.y * scale + ny };
  const startTick2 = { x: p1.x * scale - nx, y: p1.y * scale - ny };
  const endTick1 = { x: p2.x * scale + nx, y: p2.y * scale + ny };
  const endTick2 = { x: p2.x * scale - nx, y: p2.y * scale - ny };

  // Angle in degrees for readable text badge (flip if upside down)
  let deg = (angle * 180) / Math.PI;
  if (deg > 90 || deg < -90) deg += 180;

  return (
    <div
      data-annotation-type="dimension"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: annotation.data?.opacity ?? 1 }}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        width="100%"
        height="100%"
        style={{ overflow: 'visible' }}
      >
        {/* Transparent wide hit line */}
        <line
          x1={p1.x * scale}
          y1={p1.y * scale}
          x2={p2.x * scale}
          y2={p2.y * scale}
          stroke="transparent"
          strokeWidth={Math.max(16, strokeWidth * 4)}
          style={{ pointerEvents: 'stroke', cursor: isSelected ? 'move' : 'pointer' }}
          onPointerDown={(e) => {
            onSelect(e as unknown as React.PointerEvent<HTMLDivElement>);
            onTransformStart(e as unknown as React.PointerEvent<HTMLDivElement>, 'move');
          }}
        />

        {/* Start Tick */}
        <line
          x1={startTick1.x}
          y1={startTick1.y}
          x2={startTick2.x}
          y2={startTick2.y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          style={{ pointerEvents: 'none' }}
        />

        {/* End Tick */}
        <line
          x1={endTick1.x}
          y1={endTick1.y}
          x2={endTick2.x}
          y2={endTick2.y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          style={{ pointerEvents: 'none' }}
        />

        {/* Main Dimension Line */}
        <line
          x1={p1.x * scale}
          y1={p1.y * scale}
          x2={p2.x * scale}
          y2={p2.y * scale}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          style={{ pointerEvents: 'none' }}
        />

        {/* Caliper Inverted Arrow Ticks */}
        {length > 20 && (
          <>
            <polygon
              points={`${p1.x * scale},${p1.y * scale} ${p1.x * scale + Math.cos(angle + 0.5) * 8 * scale},${p1.y * scale + Math.sin(angle + 0.5) * 8 * scale} ${p1.x * scale + Math.cos(angle - 0.5) * 8 * scale},${p1.y * scale + Math.sin(angle - 0.5) * 8 * scale}`}
              fill={strokeColor}
            />
            <polygon
              points={`${p2.x * scale},${p2.y * scale} ${p2.x * scale - Math.cos(angle + 0.5) * 8 * scale},${p2.y * scale - Math.sin(angle + 0.5) * 8 * scale} ${p2.x * scale - Math.cos(angle - 0.5) * 8 * scale},${p2.y * scale - Math.sin(angle - 0.5) * 8 * scale}`}
              fill={strokeColor}
            />
          </>
        )}
      </svg>

      {/* Measurement Readout Badge */}
      <div
        data-testid="dimension-readout"
        style={{
          position: 'absolute',
          left: midX,
          top: midY,
          transform: `translate(-50%, -50%) rotate(${deg}deg)`,
          padding: '1px 6px',
          background: annotation.data?.backgroundColor ?? '#ffffff',
          border: `1px solid ${strokeColor}`,
          borderRadius: 3,
          color: strokeColor,
          fontSize: (annotation.data?.fontSize ?? 11) * scale,
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          pointerEvents: 'all',
          cursor: isSelected ? 'move' : 'pointer',
          userSelect: 'none',
        }}
        onPointerDown={(e) => {
          onSelect(e);
          onTransformStart(e, 'move');
        }}
      >
        {labelText}
      </div>

      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
