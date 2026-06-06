import React from 'react';
import { normalizeWriterDocumentTitle } from '@/core/writer-v2/writerDocumentTitle';

export interface BlankDocumentRenameDialogProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onRename: (title: string) => void;
}

export const BlankDocumentRenameDialog: React.FC<BlankDocumentRenameDialogProps> = ({
  open,
  title,
  onCancel,
  onRename,
}) => {
  const [draftTitle, setDraftTitle] = React.useState(title);

  React.useEffect(() => {
    if (open) {
      // The draft input must reset to the latest persisted title every time the modal opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftTitle(title);
    }
  }, [open, title]);

  if (!open) {
    return null;
  }

  const normalizedTitle = normalizeWriterDocumentTitle(draftTitle);

  const submit = () => {
    onRename(normalizedTitle);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rename blank Writer document"
      data-testid="blank-document-rename-dialog"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Rename document
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            This title is used for project metadata and default export names.
          </p>
        </div>

        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Document title
          <input
            data-testid="blank-document-rename-input"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={draftTitle}
            autoFocus
            onChange={(event) => setDraftTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submit();
              }

              if (event.key === 'Escape') {
                onCancel();
              }
            }}
          />
        </label>

        <div
          data-testid="blank-document-rename-summary"
          className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          Export title: {normalizedTitle}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="blank-document-rename-cancel-button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="blank-document-rename-apply-button"
            onClick={submit}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
};
