import React from 'react';
import type {
  WriterExportPreflightIssue,
  WriterExportPreflightResult,
} from '@/core/writer-v2/export/writerExportPreflight';

export interface WriterExportPreflightDialogProps {
  result: WriterExportPreflightResult;
  exportLabel: string;
  onCancel: () => void;
  onContinue: () => void;
}

export const WriterExportPreflightDialog: React.FC<WriterExportPreflightDialogProps> = ({
  result,
  exportLabel,
  onCancel,
  onContinue,
}) => {
  const errors = result.issues.filter((issue) => issue.severity === 'error');
  const warnings = result.issues.filter((issue) => issue.severity === 'warning');
  const info = result.issues.filter((issue) => issue.severity === 'info');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Writer export preflight"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(15, 23, 42, 0.42)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(720px, 96vw)',
          maxHeight: 'min(720px, 92vh)',
          background: '#ffffff',
          borderRadius: 14,
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.30)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              Writer Export Preflight
            </h2>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: 12,
                color: '#64748b',
              }}
            >
              Export target: {exportLabel}
            </p>
          </div>

          <StatusBadge result={result} />
        </header>

        <section
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <Metric label="Visible" value={result.visibleElementCount} />
          <Metric label="Hidden" value={result.hiddenElementCount} />
          <Metric label="Tables" value={result.tableElementCount} />
          <Metric label="Images" value={result.imageElementCount} />
          <Metric label="Text" value={result.textElementCount} />
          <Metric label="Assets" value={result.assetCount} />
          <Metric label="Pages" value={result.pageCount} />
          <Metric label="Issues" value={result.issues.length} />
        </section>

        <section
          style={{
            padding: 16,
            overflow: 'auto',
          }}
        >
          <IssueGroup
            title="Errors"
            tone="error"
            issues={errors}
            emptyText="No blocking errors."
          />
          <IssueGroup
            title="Warnings"
            tone="warning"
            issues={warnings}
            emptyText="No warnings."
          />
          <IssueGroup
            title="Info"
            tone="info"
            issues={info}
            emptyText="No informational notes."
          />

          <div
            style={{
              marginTop: 14,
              padding: 10,
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              background: '#f8fafc',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#334155',
                marginBottom: 6,
              }}
            >
              Page distribution
            </div>
            <div
              style={{
                display: 'grid',
                gap: 4,
              }}
            >
              {result.byPage.map((page) => (
                <div
                  key={page.pageIndex}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 11,
                    color: '#475569',
                  }}
                >
                  <span>Page {page.pageIndex + 1}</span>
                  <span>
                    {page.visibleElementCount} visible / {page.hiddenElementCount} hidden
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer
          style={{
            padding: 14,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onContinue}
            disabled={result.hasErrors}
            title={result.hasErrors ? 'Fix blocking preflight errors before export.' : 'Continue export'}
            style={{
              ...primaryButtonStyle,
              opacity: result.hasErrors ? 0.45 : 1,
              cursor: result.hasErrors ? 'not-allowed' : 'pointer',
            }}
          >
            {result.hasErrors ? 'Blocked' : 'Continue'}
          </button>
        </footer>
      </div>
    </div>
  );
};

function StatusBadge({ result }: { result: WriterExportPreflightResult }) {
  const label = result.hasErrors
    ? 'Blocked'
    : result.hasWarnings
      ? 'Warnings'
      : 'Ready';

  const color = result.hasErrors
    ? '#dc2626'
    : result.hasWarnings
      ? '#d97706'
      : '#059669';

  const background = result.hasErrors
    ? '#fef2f2'
    : result.hasWarnings
      ? '#fffbeb'
      : '#ecfdf5';

  return (
    <span
      style={{
        border: `1px solid ${color}`,
        background,
        color,
        borderRadius: 999,
        padding: '4px 9px',
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '8px 10px',
        background: '#f8fafc',
      }}
    >
      <div
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: '#0f172a',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function IssueGroup({
  title,
  tone,
  issues,
  emptyText,
}: {
  title: string;
  tone: 'error' | 'warning' | 'info';
  issues: WriterExportPreflightIssue[];
  emptyText: string;
}) {
  const color = tone === 'error'
    ? '#dc2626'
    : tone === 'warning'
      ? '#d97706'
      : '#2563eb';

  return (
    <div style={{ marginBottom: 12 }}>
      <h3
        style={{
          margin: '0 0 6px',
          fontSize: 13,
          color,
        }}
      >
        {title} ({issues.length})
      </h3>

      {issues.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: '#94a3b8',
            padding: '8px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}
        >
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {issues.map((issue, index) => (
            <div
              key={`${issue.code}-${issue.elementId ?? 'global'}-${index}`}
              style={{
                border: `1px solid ${color}`,
                borderRadius: 8,
                padding: '8px 10px',
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color,
                  marginBottom: 2,
                }}
              >
                {issue.code}
                {typeof issue.pageIndex === 'number' ? ` / Page ${issue.pageIndex + 1}` : ''}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#334155',
                }}
              >
                {issue.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 7,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 14px',
  borderRadius: 7,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
};
