import React from 'react';
import type { OcrTableBlock } from '@/core/ocr/types';
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { createReviewedOcrTableWriterElement } from '@/core/ocr/ocrWriterInsertion';
import { OcrTableReviewPanel } from '../OcrTableReviewPanel';

export interface OcrTableReviewWorkspaceProps {
  documentFingerprint: string;
  tableBlock: OcrTableBlock;
  selectedRegion?: OcrRegion | null;
  onAcceptTableElement: (element: WriterElementV2, summary: string) => void;
}

export const OcrTableReviewWorkspace: React.FC<OcrTableReviewWorkspaceProps> = ({
  documentFingerprint,
  tableBlock,
  selectedRegion,
  onAcceptTableElement,
}) => {
  const [lastAcceptedSummary, setLastAcceptedSummary] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLastAcceptedSummary(null);
  }, [documentFingerprint, tableBlock]);

  return (
    <div
      className="space-y-2"
      data-testid="ocr-review-workspace-table"
    >
      <OcrTableReviewPanel
        tableBlock={tableBlock}
        onAcceptTable={(tableData) => {
          const summary = `${tableData.rows.length} rows × ${tableData.columns.length} columns`;
          setLastAcceptedSummary(summary);

          if (selectedRegion) {
            const element = createReviewedOcrTableWriterElement({
              documentFingerprint,
              region: selectedRegion,
              tableData,
            });
            onAcceptTableElement(element, summary);
          } else {
            const element: WriterElementV2 = {
              id: `writer-table-${documentFingerprint}-${Date.now()}`,
              documentFingerprint,
              pageIndex: tableBlock.pageIndex ?? 0,
              type: 'tableBox',
              rect: tableBlock.bbox ?? { x: 72, y: 72, width: 360, height: 180 },
              tableData,
              plainText: tableData.rows
                .map((r) => r.cells.map((c) => c.text).join('\t'))
                .join('\n'),
              style: {
                zIndex: 10,
                fontFamily: 'Aptos',
                fontSize: 10,
                textColor: '#111827',
                backgroundColor: '#FFFFFF',
                borderColor: '#CBD5E1',
                borderWidth: 1,
                padding: 0,
                opacity: 1,
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              locked: false,
              hidden: false,
            };
            onAcceptTableElement(element, summary);
          }
        }}
      />
      {lastAcceptedSummary ? (
        <p
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          data-testid="ocr-table-accepted-summary"
        >
          OCR table accepted: {lastAcceptedSummary}
        </p>
      ) : null}
    </div>
  );
};

export default OcrTableReviewWorkspace;
