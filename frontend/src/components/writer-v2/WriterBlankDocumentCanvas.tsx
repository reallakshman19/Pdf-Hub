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
  const addBlankWriterPage = useWriterV2Store((state) => state.addBlankWriterPage);
  const duplicateBlankWriterPage = useWriterV2Store((state) => state.duplicateBlankWriterPage);
  const removeBlankWriterPage = useWriterV2Store((state) => state.deleteBlankWriterPage);
  const documentMeta = documentMetaProp ?? storeDocumentMeta;
  const pages = React.useMemo(
    () => createWriterBlankDocumentPageDescriptors(documentMeta),
    [documentMeta],
  );
  const pageCount = documentMeta?.mode === 'blankDocument' ? documentMeta.pageCount : 0;

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
      <div
        data-testid="writer-blank-document-top-controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#334155',
          fontSize: 12,
          userSelect: 'none',
        }}
      >
        <span>
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>
        <button
          type="button"
          data-testid="writer-blank-document-add-page-button"
          onClick={() => addBlankWriterPage()}
          style={pageActionButtonStyle}
        >
          Add page
        </button>
      </div>

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
            data-testid="writer-blank-document-page-toolbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#475569',
              userSelect: 'none',
            }}
          >
            <span data-testid="writer-blank-document-page-label">
              {page.label}
            </span>
            <button
              type="button"
              data-testid="writer-blank-document-insert-page-after-button"
              onClick={() => addBlankWriterPage(page.pageIndex)}
              style={pageActionButtonStyle}
            >
              Insert after
            </button>
            <button
              type="button"
              data-testid="writer-blank-document-duplicate-page-button"
              onClick={() => duplicateBlankWriterPage(page.pageIndex)}
              style={pageActionButtonStyle}
            >
              Duplicate
            </button>
            <button
              type="button"
              data-testid="writer-blank-document-remove-page-button"
              onClick={() => removeBlankWriterPage(page.pageIndex)}
              disabled={pageCount <= 1}
              style={{
                ...pageActionButtonStyle,
                opacity: pageCount <= 1 ? 0.45 : 1,
                cursor: pageCount <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Remove
            </button>
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

const pageActionButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#ffffff',
  color: '#334155',
  fontSize: 12,
  padding: '3px 8px',
  lineHeight: '18px',
  cursor: 'pointer',
};
