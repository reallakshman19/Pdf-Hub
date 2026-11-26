import React, { useState } from 'react';

export interface MacroRecipeImportExportProps {
  exportText: string;
  onExportTextChange: (value: string) => void;
  onImport: (jsonText: string) => void;
}

export function MacroRecipeImportExport({
  exportText,
  onExportTextChange,
  onImport,
}: MacroRecipeImportExportProps): React.ReactElement {
  const [draft, setDraft] = useState('');

  function handleUseExportText(): void {
    setDraft(exportText);
  }

  return (
    <section aria-label="Import and export macro recipe">
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Import / Export</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button type="button" className="macro-builder-btn" onClick={handleUseExportText} disabled={!exportText}>
          Use Export
        </button>
        <button type="button" className="macro-builder-btn" onClick={() => onImport(draft)}>
          Import JSON
        </button>
        <button type="button" className="macro-builder-btn" onClick={() => onExportTextChange('')}>
          Clear Export
        </button>
      </div>

      <textarea
        aria-label="Macro JSON"
        value={draft || exportText}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          onExportTextChange(event.currentTarget.value);
        }}
        rows={12}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid var(--writer-border-strong, #cbd5e1)',
          borderRadius: 6,
          padding: 8,
          background: 'var(--writer-surface-subtle, #f8fafc)',
          color: 'var(--writer-text, #0f172a)',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      />
    </section>
  );
}