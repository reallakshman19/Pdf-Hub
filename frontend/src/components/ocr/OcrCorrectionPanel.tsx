/* eslint-disable react-hooks/set-state-in-effect */
import React from 'react';
import {
  Check,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrWord } from '@/core/ocr/types';
import {
  createOcrCorrection,
  getOcrCorrectionForTarget,
} from '@/core/ocr/ocrCorrections';
import { useOcrStore } from '@/core/ocr/ocrStore';

export interface OcrCorrectionPanelProps {
  word: OcrWord | null;
  documentFingerprint?: string | null;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export const OcrCorrectionPanel: React.FC<OcrCorrectionPanelProps> = ({
  word,
  documentFingerprint,
  onSaved,
  onDeleted,
}) => {
  const store = useOcrStore();

  const effectiveDocumentFingerprint =
    documentFingerprint
    ?? store.documentFingerprint
    ?? store.correctedResult?.documentFingerprint
    ?? null;

  const existingCorrection = React.useMemo(() => {
    if (!word || !effectiveDocumentFingerprint) return null;

    return getOcrCorrectionForTarget(store.corrections, {
      documentFingerprint: effectiveDocumentFingerprint,
      pageIndex: word.pageIndex,
      targetId: word.id,
    });
  }, [
    effectiveDocumentFingerprint,
    store.corrections,
    word,
  ]);

  const [correctedText, setCorrectedText] = React.useState('');

  React.useEffect(() => {
    if (!word) {
      setCorrectedText('');
      return;
    }

    setCorrectedText(existingCorrection?.correctedText ?? word.text);
  }, [
    existingCorrection?.correctedText,
    word,
  ]);

  if (!word) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-correction-empty"
      >
        Select a low-confidence OCR word to correct it.
      </div>
    );
  }

  const canSave = Boolean(
    effectiveDocumentFingerprint &&
    correctedText.trim() &&
    correctedText.trim() !== word.text,
  );

  const saveCorrection = () => {
    if (!effectiveDocumentFingerprint || !correctedText.trim()) {
      return;
    }

    const now = new Date().toISOString();

    store.upsertOcrCorrection(
      createOcrCorrection({
        id: existingCorrection?.id ?? `ocr-correction-${word.id}-${Date.now()}`,
        documentFingerprint: effectiveDocumentFingerprint,
        pageIndex: word.pageIndex,
        targetId: word.id,
        targetType: 'word',
        originalText: existingCorrection?.originalText ?? word.text,
        correctedText: correctedText.trim(),
        bbox: word.bbox,
        now,
      }),
    );

    onSaved?.();
  };

  const deleteCorrection = () => {
    if (!effectiveDocumentFingerprint) {
      return;
    }

    store.deleteOcrCorrectionForTarget({
      documentFingerprint: effectiveDocumentFingerprint,
      pageIndex: word.pageIndex,
      targetId: word.id,
    });

    setCorrectedText(word.text);
    onDeleted?.();
  };

  const resetInput = () => {
    setCorrectedText(word.text);
  };

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-correction-panel"
    >
      <div className="mb-2">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          OCR Correction
        </h4>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          Correct selected OCR text without mutating the raw OCR result.
        </p>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
        <InfoTile
          label="Page"
          value={String(word.pageIndex + 1)}
        />
        <InfoTile
          label="Confidence"
          value={`${Math.round(word.confidence * 100)}%`}
        />
      </div>

      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
        Original OCR text
        <input
          className="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          value={word.text}
          readOnly
          data-testid="ocr-correction-original"
        />
      </label>

      <label className="mt-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
        Corrected text
        <input
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          value={correctedText}
          onChange={(event) => setCorrectedText(event.currentTarget.value)}
          data-testid="ocr-correction-input"
        />
      </label>

      {existingCorrection ? (
        <p
          className="mt-2 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
          data-testid="ocr-correction-existing"
        >
          Existing correction is applied to search and derived OCR output.
        </p>
      ) : null}

      {!effectiveDocumentFingerprint ? (
        <p
          className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300"
          data-testid="ocr-correction-missing-document"
        >
          Cannot save correction because no document fingerprint is active.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={saveCorrection}
          disabled={!canSave}
          data-testid="ocr-correction-save"
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          Save
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={resetInput}
          data-testid="ocr-correction-reset"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={deleteCorrection}
          disabled={!existingCorrection}
          data-testid="ocr-correction-delete"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
};

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}
