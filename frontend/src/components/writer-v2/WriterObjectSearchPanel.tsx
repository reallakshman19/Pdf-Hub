import React from 'react';
import { useSessionStore } from '@/core/session/store';
import type {
  WriterElementV2,
  WriterReviewCategory,
  WriterReviewPriority,
  WriterReviewStatus,
} from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  searchWriterObjects,
  writerObjectTypeLabel,
  type WriterObjectSearchTypeFilter,
} from '@/core/writer-v2/writerObjectSearch';

const WRITER_TYPES: WriterElementV2['type'][] = [
  'richTextBox',
  'textCallout',
  'textStamp',
  'reviewLabel',
  'richNote',
  'tableBox',
  'imageBox',
];

export interface WriterObjectSearchPanelProps {
  embedded?: boolean;
}

export const WriterObjectSearchPanel: React.FC<WriterObjectSearchPanelProps> = ({
  embedded = false,
}) => {
  const elements = useWriterV2Store((state) => state.elements);
  const activeId = useWriterV2Store((state) => state.activeId);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const setPage = useSessionStore((state) => state.setPage);
  const pageCount = useSessionStore((state) => state.pageCount);
  const currentPage = useSessionStore((state) => state.viewState.currentPage);

  const [text, setText] = React.useState('');
  const [type, setType] = React.useState<WriterObjectSearchTypeFilter>('all');
  const [page, setPageFilter] = React.useState<number | 'all'>('all');
  const [includeHidden, setIncludeHidden] = React.useState(false);
  const [onlyWithReview, setOnlyWithReview] = React.useState(false);
  const [reviewStatus, setReviewStatus] = React.useState<WriterReviewStatus | 'all'>('all');
  const [reviewPriority, setReviewPriority] = React.useState<WriterReviewPriority | 'all'>('all');
  const [reviewCategory, setReviewCategory] = React.useState<WriterReviewCategory | 'all'>('all');

  const results = React.useMemo(
    () =>
      searchWriterObjects(elements, {
        text,
        type,
        page,
        includeHidden,
        onlyWithReview,
        reviewStatus,
        reviewPriority,
        reviewCategory,
      }),
    [
      elements,
      includeHidden,
      onlyWithReview,
      page,
      reviewCategory,
      reviewPriority,
      reviewStatus,
      text,
      type,
    ],
  );

  const jumpToObject = (id: string, pageNumber: number) => {
    setPage(pageNumber);
    dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id,
    });
  };

  if (elements.length === 0) {
    return null;
  }

  return (
    <aside
      data-writer-v2-search-panel="true"
      aria-label="Writer V2 object search"
      style={{
        width: embedded ? '100%' : 320,
        maxHeight: embedded ? undefined : 'calc(100vh - 120px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        border: embedded ? 'none' : '1px solid #e2e8f0',
        borderRadius: embedded ? 0 : 10,
        boxShadow: embedded ? 'none' : '0 8px 28px rgba(15, 23, 42, 0.14)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
          Search Writer Objects
        </div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          {results.length} match(es) / {elements.length} object(s)
        </div>
      </header>

      <div
        style={{
          padding: 8,
          display: 'grid',
          gap: 6,
          borderBottom: '1px solid #f1f5f9',
          background: '#f8fafc',
        }}
      >
        <input
          aria-label="Search Writer objects"
          placeholder="Search text, assignee, status..."
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          style={inputStyle}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <select
            aria-label="Filter Writer object type"
            value={type}
            onChange={(event) =>
              setType(event.currentTarget.value as WriterObjectSearchTypeFilter)
            }
            style={selectStyle}
          >
            <option value="all">All types</option>
            {WRITER_TYPES.map((item) => (
              <option key={item} value={item}>
                {writerObjectTypeLabel(item)}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter Writer object page"
            value={page === 'all' ? 'all' : String(page)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setPageFilter(value === 'all' ? 'all' : Number(value));
            }}
            style={selectStyle}
          >
            <option value="all">All pages</option>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
              <option key={pageNumber} value={pageNumber}>
                Page {pageNumber}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <select
            aria-label="Filter Writer review status"
            value={reviewStatus}
            onChange={(event) =>
              setReviewStatus(event.currentTarget.value as WriterReviewStatus | 'all')
            }
            style={selectStyle}
          >
            <option value="all">Any status</option>
            <option value="open">Open</option>
            <option value="inProgress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            aria-label="Filter Writer review priority"
            value={reviewPriority}
            onChange={(event) =>
              setReviewPriority(event.currentTarget.value as WriterReviewPriority | 'all')
            }
            style={selectStyle}
          >
            <option value="all">Any priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <select
          aria-label="Filter Writer review category"
          value={reviewCategory}
          onChange={(event) =>
            setReviewCategory(event.currentTarget.value as WriterReviewCategory | 'all')
          }
          style={selectStyle}
        >
          <option value="all">Any category</option>
          <option value="general">General</option>
          <option value="engineering">Engineering</option>
          <option value="design">Design</option>
          <option value="safety">Safety</option>
          <option value="client">Client</option>
          <option value="construction">Construction</option>
          <option value="qa">QA</option>
        </select>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={onlyWithReview}
            onChange={(event) => setOnlyWithReview(event.currentTarget.checked)}
          />
          Only review-tracked objects
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(event) => setIncludeHidden(event.currentTarget.checked)}
          />
          Include hidden objects
        </label>

        <button
          type="button"
          onClick={() => {
            setText('');
            setType('all');
            setPageFilter('all');
            setReviewStatus('all');
            setReviewPriority('all');
            setReviewCategory('all');
            setOnlyWithReview(false);
            setIncludeHidden(false);
          }}
          style={buttonStyle}
        >
          Clear filters
        </button>
      </div>

      <div
        role="list"
        aria-label="Writer object search results"
        style={{
          overflowY: 'auto',
          padding: 8,
          display: 'grid',
          gap: 6,
        }}
      >
        {results.length === 0 ? (
          <div
            style={{
              padding: 12,
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: 12,
            }}
          >
            No Writer objects match the current filters.
          </div>
        ) : (
          results.map((result) => (
            <button
              key={result.id}
              type="button"
              role="listitem"
              onClick={() => jumpToObject(result.id, result.page)}
              aria-label={`Jump to ${result.label}`}
              style={{
                border: activeId === result.id
                  ? '1px solid #2563eb'
                  : '1px solid #e2e8f0',
                background: activeId === result.id
                  ? '#eff6ff'
                  : result.hidden
                    ? '#f8fafc'
                    : '#ffffff',
                borderRadius: 8,
                padding: 8,
                textAlign: 'left',
                cursor: 'pointer',
                opacity: result.hidden ? 0.65 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#0f172a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {result.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: result.page === currentPage ? '#2563eb' : '#64748b',
                    whiteSpace: 'nowrap',
                  }}
                >
                  p{result.page}
                </span>
              </div>

              <div
                style={{
                  fontSize: 10,
                  color: '#64748b',
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <span>{writerObjectTypeLabel(result.type)}</span>
                {result.reviewStatus ? <span>Status: {result.reviewStatus}</span> : null}
                {result.reviewPriority ? <span>Priority: {result.reviewPriority}</span> : null}
                {result.reviewCategory ? <span>Category: {result.reviewCategory}</span> : null}
                {result.locked ? <span>Locked</span> : null}
                {result.hidden ? <span>Hidden</span> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
};

const inputStyle: React.CSSProperties = {
  height: 28,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  padding: '0 8px',
  fontSize: 12,
  background: '#ffffff',
};

const selectStyle: React.CSSProperties = {
  height: 28,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  padding: '0 6px',
  fontSize: 11,
  background: '#ffffff',
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: '#334155',
};

const buttonStyle: React.CSSProperties = {
  height: 26,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  fontSize: 11,
  cursor: 'pointer',
};
