import React from 'react';
import {
  Download,
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
  readonly onDownload?: (sample: PsIsonoteSample) => void;
}

const SAMPLE_ICONS: Record<PsIsonoteSampleId, LucideIcon> = {
  'csv-family': FileSpreadsheet,
  'tsv-basic': FileText,
  'pipe-table': Table2,
};

function downloadSample(sample: PsIsonoteSample): void {
  const blob = new Blob([`${sample.content}\n`], { type: sample.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sample.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const PsIsonoteSampleLoader: React.FC<PsIsonoteSampleLoaderProps> = ({
  disabled = false,
  onLoad,
  onDownload = downloadSample,
}) => (
  <div className="rounded-md border border-orange-200/80 bg-white/70 p-2 dark:border-orange-900 dark:bg-slate-950/40">
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
      Sample mappings
    </div>
    <div className="space-y-1.5">
      {PS_ISONOTE_SAMPLES.map((sample) => {
        const Icon = SAMPLE_ICONS[sample.id];
        return (
          <div key={sample.id} className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 flex-1 justify-start border border-slate-200 px-2 text-[10px] dark:border-slate-700"
              aria-label={`Load ${sample.label} PS ISONOTE sample`}
              title={sample.description}
              disabled={disabled}
              onClick={() => onLoad(sample)}
            >
              <Icon className="mr-1 h-3.5 w-3.5" />
              Load {sample.label}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 border border-slate-200 dark:border-slate-700"
              aria-label={`Download ${sample.label} PS ISONOTE sample`}
              title={`Download ${sample.fileName}`}
              disabled={disabled}
              onClick={() => onDownload(sample)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
    <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
      Load a sample into the table or download the source file. Use comma, tab, semicolon, or pipe separators;
      spaces alone do not create separate columns.
    </p>
  </div>
);
