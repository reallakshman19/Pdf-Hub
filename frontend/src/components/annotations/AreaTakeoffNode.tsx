import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { getAnnotationLocalPoints, getAnnotationPageVertices } from '../../core/annotations/pointsSpace';
import {
  computePolygonArea,
  computeCentroid,
  formatAreaLabel,
  type ScaleCalibration,
} from '../../core/annotations/calibration';
import { SelectionHandles } from './shared/SelectionHandles';

export const AreaTakeoffNode: React.FC<AnnotationNodeProps<'shape-polygon' | 'area-takeoff'>> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const bg = annotation.data?.backgroundColor ?? 'rgba(59, 130, 246, 0.15)'; // Semi-transparent blue fill default
  const border = annotation.data?.borderColor ?? '#2563eb';
  const width = (annotation.data?.borderWidth ?? 2) * scale;
  const style = annotation.data?.borderStyle ?? 'solid';
  const opacity = annotation.data?.opacity ?? 1;
  const dash = style === 'dashed' ? `${3 * scale} ${2 * scale}` : style === 'dotted' ? `${scale} ${scale}` : undefined;

  const vertices = getAnnotationPageVertices(annotation);
  const localRaw = getAnnotationLocalPoints(annotation);
  const localVertices = [];
  for (let i = 0; i + 1 < localRaw.length; i += 2) {
    localVertices.push({ x: localRaw[i], y: localRaw[i + 1] });
  }

  const calibration: ScaleCalibration = {
    scaleRatio: typeof annotation.data?.dimensionScale === 'number' ? annotation.data.dimensionScale : 100,
    unit: annotation.data?.dimensionUnit ?? 'm',
    precision: typeof annotation.data?.dimensionPrecision === 'number' ? annotation.data.dimensionPrecision : 1,
  };

  const area = computePolygonArea(vertices, calibration);
  const areaLabel = annotation.data?.dimensionText
    ? String(annotation.data.dimensionText)
    : formatAreaLabel(area, calibration.unit, calibration.precision);

  const localCentroid = computeCentroid(localVertices);
  const localPoints = localRaw.map((p) => p * scale);

  return (
    <div
      data-annotation-type="area-takeoff"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        cursor: 'pointer',
        pointerEvents: 'all',
      }}
      onPointerDown={(e) => {
        onSelect(e);
        onTransformStart(e, 'move');
      }}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <polygon
          points={localPoints.reduce((acc, curr, idx) => acc + (idx % 2 === 0 ? `${curr},` : `${curr} `), '').trim()}
          fill={bg}
          fillOpacity={opacity}
          stroke={style === 'none' ? 'none' : border}
          strokeOpacity={opacity}
          strokeWidth={width}
          strokeDasharray={dash}
          strokeLinejoin="round"
        />
      </svg>

      {vertices.length >= 3 && (
        <div
          data-testid="area-takeoff-badge"
          style={{
            position: 'absolute',
            left: localCentroid.x * scale,
            top: localCentroid.y * scale,
            transform: 'translate(-50%, -50%)',
            padding: '2px 8px',
            background: bg !== 'transparent' ? '#ffffff' : '#ffffff',
            border: `1.5px solid ${border}`,
            borderRadius: 4,
            color: border,
            fontSize: Math.max(10, 11 * scale),
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
            userSelect: 'none',
          }}
        >
          {areaLabel}
        </div>
      )}

      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
