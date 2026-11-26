import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: '⌘K / Ctrl+K', description: 'Open Command Palette (or type > in TopNav)' },
  { keys: '⌘P / Ctrl+P', description: 'Print current document' },
  { keys: '⌘Z / Ctrl+Z', description: 'Undo last edit' },
  { keys: '⌘⇧Z / Ctrl+Y', description: 'Redo' },
  { keys: '⌘C / ⌘V / ⌘D', description: 'Copy, paste, or duplicate selected element' },
  { keys: 'Delete / Backspace', description: 'Delete selected annotation or Writer element' },
  { keys: 'F3 / Ctrl+G', description: 'Jump to next search match' },
  { keys: 'Ctrl + / Ctrl -', description: 'Zoom in or out' },
  { keys: 'Alt+1 / Alt+2', description: 'Switch between Continuous and Single page view' },
  { keys: 'Double-click / Enter', description: 'Edit selected Writer box or PDF text inline' },
  { keys: 'Esc', description: 'Cancel editing, clear selection, or return to Select tool' },
];

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Help & Keyboard Shortcuts" size="lg">
      <div className="space-y-4 text-slate-700 dark:text-slate-300" data-testid="help-modal-content">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Work locally with native PDF markups, rich Writer boxes, CAD quantity takeoff, OCR review,
          secure client-side redaction, and automated multi-step workflows.
        </p>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            Keyboard Shortcuts
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {SHORTCUTS.map((item) => (
              <div
                key={item.keys}
                className="flex items-center justify-between px-3 py-2 text-xs gap-4"
              >
                <span>{item.description}</span>
                <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                  {item.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
