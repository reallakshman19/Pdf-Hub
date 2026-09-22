import React from 'react';
import { Modal } from '@/components/ui/Modal';

export interface SignedPdfRewriteWarningDialogProps {
  signatureCount: number;
  onCancel: () => void;
  onContinue: () => void;
}

export const SignedPdfRewriteWarningDialog: React.FC<
  SignedPdfRewriteWarningDialogProps
> = ({
  signatureCount,
  onCancel,
  onContinue,
}) => {
  const signatureLabel = signatureCount === 1
    ? '1 existing digital signature'
    : `${signatureCount} existing digital signatures`;

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Saving may invalidate signatures"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-slate-700 dark:text-slate-200">
          This PDF contains {signatureLabel}. PDF Hub rewrites PDF content during
          Save and Save As and does not currently preserve signature validity.
        </p>

        <p className="font-medium text-amber-700 dark:text-amber-300">
          Saving may invalidate existing digital signatures.
        </p>

        <p>
          Cancel to leave the current PDF unchanged, or choose Save Anyway to
          continue with the existing editable Save path.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-slate-300 px-4 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="h-9 rounded-md bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700"
          >
            Save Anyway
          </button>
        </div>
      </div>
    </Modal>
  );
};
