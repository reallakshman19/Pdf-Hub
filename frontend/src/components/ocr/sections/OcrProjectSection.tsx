import React from 'react';
import {
  Database,
} from 'lucide-react';
import { OcrSectionShell } from './OcrSectionShell';

export interface OcrProjectSectionProps {
  restorePanel?: React.ReactNode;
  payloadSummary?: React.ReactNode;
  projectActions?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export const OcrProjectSection: React.FC<OcrProjectSectionProps> = ({
  restorePanel,
  payloadSummary,
  projectActions,
  emptyState,
}) => {
  const hasContent = Boolean(restorePanel || payloadSummary || projectActions);

  return (
    <OcrSectionShell
      title="OCR Project"
      description="Restore OCR results, corrections, regions, and Writer insertion queue from project data."
      icon={<Database className="h-4 w-4 text-orange-600" />}
      testId="ocr-project-section"
    >
      {!hasContent ? (
        emptyState ?? (
          <div
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            data-testid="ocr-project-empty"
          >
            No OCR project payload is currently loaded.
          </div>
        )
      ) : null}

      {payloadSummary ? (
        <div data-testid="ocr-project-payload-summary">
          {payloadSummary}
        </div>
      ) : null}

      {restorePanel ? (
        <div data-testid="ocr-project-restore">
          {restorePanel}
        </div>
      ) : null}

      {projectActions ? (
        <div data-testid="ocr-project-actions">
          {projectActions}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};
