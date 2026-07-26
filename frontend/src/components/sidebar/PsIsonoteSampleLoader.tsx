import React from 'react';
import {
  FileSpreadsheet,
  FileText,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  PS_ISONOTE_SAMPLES,
  type PsIsonoteSample,
  type PsIsonoteSampleId,
} from '@/core/macro/psIsonote/psIsonoteSamples';

export interface PsIsonoteSampleLoaderProps {
  readonly disabled?: boolean;
  readonly onLoad: (sample: PsIsonoteSample) => void;
}

const SAMPLE_ICONS: Record<PsIsonoteSampleId, LucideIcon> = {
  'csv-family': FileSpreadsheet,
  'tsv-basic': FileText,
  'pipe-table': Table2,
};

export const PsIsonoteSampleLoader: React.FC<PsIsonoteSampleLoaderProps> = ({
  disabled = false,
  onLoad,
}) => (
  <div className="rounded-md border border-orange-200/80 bg-white/70 p-2 dark:border-orange-900 dark:bg-slate-950/40">
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
      Load sample
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {PS_ISONOTE_SAMPLES.map((sample) => {
        const Icon = SAMPLE_ICONS[sample.id];
        return (
          <Button
            key={sample.id}
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 justify-center border border-slate-200 px-2 text-[10px] dark:border-slate-700"
            aria-label={`Load ${sample.label} PS ISONOTE sample`}
            title={sample.description}
            disabled={disabled}
            onClick={() => onLoad(sample)}
          >
            <Icon className="mr-1 h-3.5 w-3.5" />
            {sample.label}
          </Button>
        );
      })}
    </div>
    <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
      Use comma, tab, semicolon, or pipe separators. Spaces alone do not create separate columns.
    </p>
  </div>
);
