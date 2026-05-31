import React from 'react';
import type { PdfCommandPreview } from '../../core/commands/types';

export interface CommandPreviewModalProps {
  preview: PdfCommandPreview;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A simple modal dialog that shows a preview of a command and prompts
 * the user to confirm or cancel.  In the preview build this modal is
 * unused because commands execute directly; however it exists to
 * support future destructive actions that require confirmation.
 */
export const CommandPreviewModal: React.FC<CommandPreviewModalProps> = ({ preview, onConfirm, onCancel }) => {
  return (
    <div className="command-preview-modal" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: '1rem', maxWidth: '480px', width: '100%' }}>
        <h2>{preview.title}</h2>
        <p>{preview.summary}</p>
        {preview.warnings.length > 0 && (
          <ul>
            {preview.warnings.map((w, idx) => (
              <li key={idx} style={{ color: 'red' }}>{w}</li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
};