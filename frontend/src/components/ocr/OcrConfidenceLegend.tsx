import React from 'react';
import {
  getOcrConfidenceColor,
  type OcrConfidenceBand,
} from '@/core/ocr/ocrConfidence';

export interface OcrConfidenceLegendProps {
  compact?: boolean;
}

const BANDS: Array<{
  band: OcrConfidenceBand;
  label: string;
  description: string;
}> = [
  {
    band: 'high',
    label: 'High',
    description: '≥ 90%',
  },
  {
    band: 'medium',
    label: 'Medium',
    description: '70–89%',
  },
  {
    band: 'low',
    label: 'Low',
    description: '< 70%',
  },
  {
    band: 'unknown',
    label: 'Unknown',
    description: 'No score',
  },
];

export const OcrConfidenceLegend: React.FC<OcrConfidenceLegendProps> = ({
  compact,
}) => {
  return (
    <div
      className={[
        'rounded border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950',
        compact ? 'py-2' : '',
      ].join(' ')}
      data-testid="ocr-confidence-legend"
    >
      {!compact ? (
        <div className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
          Confidence
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {BANDS.map((item) => (
          <div
            key={item.band}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-300"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: getOcrConfidenceColor(item.band),
              }}
              aria-hidden="true"
            />
            <span className="font-medium">
              {item.label}
            </span>
            <span className="text-[11px] text-slate-500">
              {item.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
