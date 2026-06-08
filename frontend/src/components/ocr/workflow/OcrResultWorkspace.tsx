import React from 'react';
import { Layers } from 'lucide-react';
import type { OcrWorkflowPanel, OcrWorkflowState } from './OcrWorkflowTypes';

export interface OcrResultWorkspaceProps {
  state: OcrWorkflowState;
  panels: OcrWorkflowPanel[];
  emptyHint?: React.ReactNode;
}

export const OcrResultWorkspace: React.FC<OcrResultWorkspaceProps> = ({
  state,
  panels,
  emptyHint,
}) => {
  const hasResult = state === 'complete' || state === 'running';

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-review-section"
    >
      <div data-testid="ocr-result-workspace">
        <div className="mb-3 flex items-start gap-2">
          <Layers className="mt-0.5 h-4 w-4 text-violet-600" />
          <div>
            <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Review and use result
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Search text, fix uncertain words, capture regions, review tables, send to Writer, or export.
            </p>
          </div>
        </div>

        {!hasResult ? (
          emptyHint ?? (
            <div
              className="mb-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              data-testid="ocr-review-empty"
            >
              <span className="font-semibold text-slate-900 dark:text-slate-50">
                OCR has not been run yet.
              </span>{' '}
              Run OCR to search text, review low-confidence words, capture regions, review tables, send to Writer, or export.
            </div>
          )
        ) : null}

        <div className="space-y-2">
          {panels.map((panel) => (
            <article
              key={panel.testId}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-900/40"
              data-testid={panel.testId}
            >
              <div className="mb-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">
                  {panel.title}
                </div>
                {panel.description ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {panel.description}
                  </p>
                ) : null}
              </div>
              {panel.content}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default OcrResultWorkspace;
