import React from 'react';
import type { SnapGuide } from '../../core/writer/geometry';

interface Props {
  guides: SnapGuide[];
  scale: number;
  pageDimensions: { width: number; height: number };
}

export const WriterSnapGuides: React.FC<Props> = ({ guides, scale, pageDimensions }) => {
  if (guides.length === 0) return null;

  const w = pageDimensions.width * scale;
  const h = pageDimensions.height * scale;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-50"
      width={w}
      height={h}
    >
      {guides.map((guide, i) => {
        if (guide.axis === 'x') {
          const x = guide.position * scale;
          return (
            <line
              key={`gx-${i}`}
              x1={x} y1={0} x2={x} y2={h}
              stroke="#3b82f6" strokeWidth={1} strokeDasharray="4,4"
            />
          );
        } else {
          const y = guide.position * scale;
          return (
            <line
              key={`gy-${i}`}
              x1={0} y1={y} x2={w} y2={y}
              stroke="#3b82f6" strokeWidth={1} strokeDasharray="4,4"
            />
          );
        }
      })}
    </svg>
  );
};
