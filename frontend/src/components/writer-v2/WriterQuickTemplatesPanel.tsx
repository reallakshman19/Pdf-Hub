import React from 'react';
import {
  getWriterQuickTemplatesByGroup,
  insertWriterQuickTemplate,
  type WriterQuickTemplate,
} from '@/core/writer-v2/writerQuickTemplates';

export interface WriterQuickTemplatesPanelProps {
  embedded?: boolean;
}

export const WriterQuickTemplatesPanel: React.FC<WriterQuickTemplatesPanelProps> = ({
  embedded = false,
}) => {
  return (
    <aside
      data-writer-v2-quick-templates="true"
      aria-label="Writer V2 quick templates"
      style={{
        width: embedded ? '100%' : 280,
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
          Quick Templates
        </div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          Insert reusable Writer stamps, notes, labels, and callouts.
        </div>
      </header>

      <div
        style={{
          overflowY: 'auto',
          padding: 8,
          display: 'grid',
          gap: 10,
        }}
      >
        <TemplateGroup title="Stamps" group="stamp" />
        <TemplateGroup title="Review Labels" group="review" />
        <TemplateGroup title="Notes" group="note" />
        <TemplateGroup title="Callouts" group="callout" />
      </div>
    </aside>
  );
};

function TemplateGroup({
  title,
  group,
}: {
  title: string;
  group: WriterQuickTemplate['group'];
}) {
  const templates = getWriterQuickTemplatesByGroup(group);

  return (
    <section>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: '#334155',
          margin: '0 0 5px',
        }}
      >
        {title}
      </div>

      <div style={{ display: 'grid', gap: 5 }}>
        {templates.map((template) => (
          <TemplateButton
            key={template.id}
            template={template}
          />
        ))}
      </div>
    </section>
  );
}

function TemplateButton({
  template,
}: {
  template: WriterQuickTemplate;
}) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const insert = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const result = await insertWriterQuickTemplate(template.id);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void insert()}
      disabled={busy}
      title={message ?? template.description}
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 7,
        background: '#ffffff',
        padding: '7px 8px',
        textAlign: 'left',
        cursor: busy ? 'wait' : 'pointer',
        display: 'grid',
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: '#0f172a',
        }}
      >
        {template.label}
      </span>
      <span
        style={{
          fontSize: 10,
          color: '#64748b',
        }}
      >
        {template.description}
      </span>
    </button>
  );
}
