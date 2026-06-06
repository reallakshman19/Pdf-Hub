import React from 'react';
import type { WriterDocumentMetaV2 } from '@/core/writer-v2/types';
import {
  createWriterBlankDocumentPageDescriptors,
} from '@/core/writer-v2/writerBlankDocumentLayout';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterBlankPageCanvas } from './WriterBlankPageCanvas';

export interface WriterBlankDocumentCanvasProps {
  documentMeta?: WriterDocumentMetaV2 | null;
  scale?: number;
  showMarginGuides?: boolean;
  className?: string;
}

export const WriterBlankDocumentCanvas: React.FC<WriterBlankDocumentCanvasProps> = ({
  documentMeta: documentMetaProp,
  scale = 1,
  showMarginGuides = true,
  className,
}) => {
  const storeDocumentMeta = useWriterV2Store((state) => state.documentMeta);
  const documentMeta = documentMetaProp ?? storeDocumentMeta;
  const pages = React.useMemo(
    () => createWriterBlankDocumentPageDescriptors(documentMeta),
    [documentMeta],
  );

  if (!documentMeta || documentMeta.mode !== 'blankDocument') {
    return (
      <div
        className={className}
        data-testid="writer-blank-document-empty"
      >
        No blank Writer document is active.
      </div>
    );
  }

  return (
    <div
      className={className}
      data-testid="writer-blank-document-canvas"
      data-writer-blank-document="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        minHeight: '100%',
        padding: '32px 24px',
        background: '#e2e8f0',
        overflow: 'auto',
      }}
    >
      {pages.map((page) => (
        <div
          key={page.pageIndex}
          data-testid="writer-blank-document-page-frame"
          data-page-index={page.pageIndex}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            data-testid="writer-blank-document-page-label"
            style={{
              fontSize: 12,
              color: '#475569',
              userSelect: 'none',
            }}
          >
            {page.label}
          </div>
          <WriterBlankPageCanvas
            pageIndex={page.pageIndex}
            documentMeta={documentMeta}
            scale={scale}
            showMarginGuides={showMarginGuides}
          />
        </div>
      ))}
    </div>
  );
};
