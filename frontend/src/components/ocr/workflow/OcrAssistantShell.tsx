import React from 'react';

export interface OcrAssistantShellProps {
  header: React.ReactNode;
  main: React.ReactNode;
  writerStatus?: React.ReactNode;
  sourceDetails?: React.ReactNode;
  advancedDetails?: React.ReactNode;
  sourceDefaultOpen?: boolean;
  advancedDefaultOpen?: boolean;
}

export const OcrAssistantShell: React.FC<OcrAssistantShellProps> = ({
  header,
  main,
  writerStatus,
  sourceDetails,
  advancedDetails,
  sourceDefaultOpen = false,
  advancedDefaultOpen = false,
}) => {
  const [sourceOpen, setSourceOpen] = React.useState(sourceDefaultOpen);
  const [advancedOpen, setAdvancedOpen] = React.useState(advancedDefaultOpen);

  React.useEffect(() => {
    if (sourceDefaultOpen) setSourceOpen(true);
  }, [sourceDefaultOpen]);

  React.useEffect(() => {
    if (advancedDefaultOpen) setAdvancedOpen(true);
  }, [advancedDefaultOpen]);

  return (
    <section
      className="flex h-full flex-col overflow-auto bg-slate-50 dark:bg-slate-950"
      data-testid="ocr-assistant-shell"
    >
      <div
        className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        data-testid="ocr-assistant-header-region"
      >
        {header}
      </div>

      <div className="space-y-3 p-3">
        {writerStatus ? (
          <div data-testid="ocr-assistant-writer-status">
            {writerStatus}
          </div>
        ) : null}

        <div data-testid="ocr-assistant-main-workflow">
          {main}
        </div>

        {sourceDetails ? (
          <details
            className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
            data-testid="ocr-source-panel"
            open={sourceOpen}
            onToggle={(event) => setSourceOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Source details
            </summary>
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              {sourceDetails}
            </div>
          </details>
        ) : null}

        {advancedDetails ? (
          <details
            className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
            data-testid="ocr-advanced-panel"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Advanced OCR settings
            </summary>
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              {advancedDetails}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
};

export default OcrAssistantShell;
