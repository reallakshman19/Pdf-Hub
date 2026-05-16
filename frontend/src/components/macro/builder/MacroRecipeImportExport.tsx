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

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={handleUseExportText} disabled={!exportText}>
          Use Export
        </button>
        <button type="button" onClick={() => onImport(draft)}>
          Import JSON
        </button>
        <button type="button" onClick={() => onExportTextChange('')}>
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
          border: '1px solid #d1d5db',
          borderRadius: 6,
          padding: 8,
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      />
    </section>
  );
}