import React from 'react';
import {
  Download,
} from 'lucide-react';
import { OcrSectionShell } from './OcrSectionShell';

export interface OcrExportSectionProps {
  searchablePdfExport?: React.ReactNode;
  projectExport?: React.ReactNode;
  diagnostics?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export const OcrExportSection: React.FC<OcrExportSectionProps> = ({
  searchablePdfExport,
  projectExport,
  diagnostics,
  emptyState,
}) => {
  const hasContent = Boolean(searchablePdfExport || projectExport || diagnostics);

  return (
    <OcrSectionShell
      title="Export OCR"
      description="Create searchable PDFs and OCR project outputs."
      icon={<Download className="h-4 w-4 text-sky-600" />}
      testId="ocr-export-section"
    >
      {!hasContent ? (
        emptyState ?? (
          <div
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            data-testid="ocr-export-empty"
          >
            OCR export tools will appear after PDF bytes and OCR results are available.
          </div>
        )
      ) : null}

      {searchablePdfExport ? (
        <div data-testid="ocr-export-searchable-pdf">
          {searchablePdfExport}
        </div>
      ) : null}

      {projectExport ? (
        <div data-testid="ocr-export-project">
          {projectExport}
        </div>
      ) : null}

      {diagnostics ? (
        <div data-testid="ocr-export-diagnostics">
          {diagnostics}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};
