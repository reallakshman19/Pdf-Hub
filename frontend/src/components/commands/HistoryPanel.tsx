import React, { useState } from 'react';
import { CommandStore } from '../../core/commands/store';
import type { PdfCommand } from '../../core/commands/types';

const store = new CommandStore();

export const HistoryPanel: React.FC = () => {
  const [history, setHistory] = useState<PdfCommand[]>([]);
  const [future, setFuture] = useState<PdfCommand[]>([]);

  const refresh = () => {
    const snap = store.snapshot();
    setHistory(snap.past);
    setFuture(snap.future);
  };

  const handleUndo = () => {
    store.undo();
    refresh();
  };

  const handleRedo = () => {
    store.redo();
    refresh();
  };

  return (
    <div className="history-panel" style={{ padding: '0.5rem', borderTop: '1px solid #eee' }}>
      <h3>History</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {history.map((cmd, idx) => (
          <li key={idx} style={{ fontSize: '0.8rem' }}>{cmd.type}</li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleUndo} disabled={history.length === 0}>Undo</button>
        <button onClick={handleRedo} disabled={future.length === 0}>Redo</button>
      </div>
    </div>
  );
};
