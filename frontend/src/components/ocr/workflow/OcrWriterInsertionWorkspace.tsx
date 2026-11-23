import React from 'react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import type { OcrWriterInsertionQueueState } from '@/core/ocr/ocrWriterInsertion';
import { OcrWriterInsertPanel } from '../OcrWriterInsertPanel';

export interface OcrWriterInsertionWorkspaceProps {
  queue: OcrWriterInsertionQueueState;
  onQueueChange: (queue: OcrWriterInsertionQueueState) => void;
  onInsertElements?: (elements: WriterElementV2[]) => void | Promise<void>;
}

export const OcrWriterInsertionWorkspace: React.FC<OcrWriterInsertionWorkspaceProps> = ({
  queue,
  onQueueChange,
  onInsertElements,
}) => {
  const [lastInsertedCount, setLastInsertedCount] = React.useState<number | null>(null);

  return (
    <div
      className="space-y-2"
      data-testid="ocr-review-workspace-writer"
    >
      <OcrWriterInsertPanel
        queue={queue}
        onQueueChange={onQueueChange}
        onInsertElements={async (elements) => {
          await onInsertElements?.(elements);
          setLastInsertedCount(elements.length);
        }}
      />
      {lastInsertedCount !== null ? (
        <p
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          data-testid="ocr-writer-inserted-summary"
        >
          Inserted {lastInsertedCount} OCR Writer element(s).
        </p>
      ) : null}
    </div>
  );
};

export default OcrWriterInsertionWorkspace;
