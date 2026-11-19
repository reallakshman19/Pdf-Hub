import React from 'react';
import { Save, Trash2 } from 'lucide-react';

import { FileAdapter } from '@/adapters/file/FileAdapter';
import { Button } from '@/components/ui/Button';
import { error as logError } from '@/core/logger/service';
import { useMacroOutputQueueStore, type MacroOutputQueueItem } from '@/core/macro/outputQueueStore';
export type { MacroOutputQueueItem } from '@/core/macro/outputQueueStore';

export interface MacroOutputQueueProps {
  outputs: MacroOutputQueueItem[];
  onChange: React.Dispatch<React.SetStateAction<MacroOutputQueueItem[]>>;
  onError?: (message: string) => void;
}

/**
 * The FSA path resolves after writable.close() and acknowledges that file.
 * The fallback <a download> only *starts* a browser download: never discard
 * the source bytes or claim durable receipt without explicit user confirmation.
 */
export const MacroOutputQueue: React.FC<MacroOutputQueueProps> = ({
  outputs,
  onChange,
  onError,
}) => {
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [downloadPendingIds, setDownloadPendingIds] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const savingRef = React.useRef(false);

  const markDownloadPending = (id: string, pending: boolean) => {
    setDownloadPendingIds((current) => pending
      ? current.includes(id) ? current : [...current, id]
      : current.filter((value) => value !== id));
  };

  const saveAcknowledged = async (id: string) => {
    const output = outputs.find((item) => item.id === id);
    if (!output) return;
    // Remove the IDB record BEFORE hiding a batch output. A failed delete is
    // visible and recoverable after reload; it must not appear acknowledged.
    if (output.sourceKind === 'batch') {
      await useMacroOutputQueueStore.getState().acknowledgeBatchOutput(id);
    } else {
      onChange((current) => current.filter((item) => item.id !== id));
    }
    markDownloadPending(id, false);
  };

  const verifyBatchSave = async (output: MacroOutputQueueItem, handle?: FileSystemFileHandle | null) => {
    if (output.sourceKind !== 'batch') return;
    if (!output.outputSha256) throw new Error('Missing batch output digest.');
    const memoryHash = await FileAdapter.hashBytes(output.bytes);
    if (memoryHash !== output.outputSha256) {
      throw new Error('OUTPUT_PRE_SAVE_HASH_MISMATCH: pending PDF differs from its provenance.');
    }
    if (handle) {
      // Native FSA writes close before returning. Prove readback rather than
      // assuming a successful close establishes file contents.
      const persistedFile = await handle.getFile();
      const savedBytes = new Uint8Array(await persistedFile.arrayBuffer());
      if (await FileAdapter.hashBytes(savedBytes) !== output.outputSha256) {
        throw new Error('OUTPUT_EXTERNAL_READBACK_MISMATCH: saved PDF hash differs.');
      }
    }
  };

  const reportFailure = (output: MacroOutputQueueItem, failure: unknown) => {
    const message = failure instanceof Error ? failure.message : String(failure);
    logError('macro', 'Failed to save workflow output', {
      outputName: output.name,
      error: message,
    });
    setSaveError(message);
    onError?.(message);
  };

  const saveOutput = async (id: string) => {
    if (savingRef.current) return;
    const output = outputs.find((item) => item.id === id);
    if (!output) return;

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setNotice(null);
    markDownloadPending(id, false);
    try {
      if (output.sourceKind === 'batch') await verifyBatchSave(output);
      const handle = await FileAdapter.savePdfBytes(output.bytes, output.name, null);
      if (handle) {
        await verifyBatchSave(output, handle);
        await saveAcknowledged(id);
      } else {
        markDownloadPending(id, true);
        setNotice('Browser download started. Confirm you received the file before removing it from the queue.');
      }
    } catch (failure) {
      reportFailure(output, failure);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const saveAllOutputs = async () => {
    if (savingRef.current || outputs.length === 0) return;
    if (downloadPendingIds.some((id) => outputs.some((item) => item.id === id))) {
      setNotice('Confirm or retry the pending browser download before continuing Save All.');
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      for (const output of outputs) {
        try {
          if (output.sourceKind === 'batch') await verifyBatchSave(output);
          const handle = await FileAdapter.savePdfBytes(output.bytes, output.name, null);
          if (!handle) {
            markDownloadPending(output.id, true);
            // Browsers may block subsequent auto-downloads or save pickers.
            setNotice('Browser download started. Confirm receipt before saving the remaining files.');
            return;
          }
          await verifyBatchSave(output, handle);
          await saveAcknowledged(output.id);
        } catch (failure) {
          reportFailure(output, failure);
          return;
        }
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const confirmReceived = async (id: string) => {
    if (savingRef.current || !downloadPendingIds.includes(id)) return;
    const output = outputs.find((item) => item.id === id);
    if (!output) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await verifyBatchSave(output);
      await saveAcknowledged(id);
      setNotice('Receipt confirmed by you. Other queued outputs remain available.');
    } catch (failure) {
      reportFailure(output, failure);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="macro-output-queue"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Output Queue
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void saveAllOutputs()}
            disabled={isSaving || outputs.length === 0}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Save All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (outputs.some((item) => item.sourceKind === 'batch')) {
                savingRef.current = true;
                setIsSaving(true);
                void useMacroOutputQueueStore.getState().clearAllOutputs()
                  .then(() => {
                    setDownloadPendingIds([]);
                    setNotice(null);
                    onChange([]);
                  })
                  .catch((failure) => reportFailure(outputs[0], failure))
                  .finally(() => {
                    savingRef.current = false;
                    setIsSaving(false);
                  });
              } else {
                setDownloadPendingIds([]);
                setNotice(null);
                onChange([]);
              }
            }}
            disabled={isSaving || outputs.length === 0}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {outputs.length === 0 ? (
        <div className="text-xs text-slate-500">No generated output files.</div>
      ) : null}
      {saveError ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700" role="alert">
          {saveError}
        </div>
      ) : null}
      {notice ? (
        <p className="text-xs text-amber-700 dark:text-amber-300" role="status">{notice}</p>
      ) : null}

      <div className="space-y-2">
        {outputs.map((output) => {
          const pending = downloadPendingIds.includes(output.id);
          return (
            <div key={output.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-800">
              <div className="min-w-0">
                <div className="truncate text-xs text-slate-700 dark:text-slate-200">{output.name}</div>
                {output.sourceKind === 'batch' ? (
                  <div className="text-[11px] text-slate-500" data-testid="batch-output-provenance">
                    Input #{(output.sourceInputIndex ?? 0) + 1}: {output.sourceFileName ?? '(unknown)'}
                    {' · '}PDF #{(output.sourceOutputIndex ?? 0) + 1} ({output.sourceOutputKind ?? 'working-copy'})
                    {' · '}source {output.sourceSha256?.slice(7, 19) ?? 'unverified'}
                    {' · '}output {output.outputSha256?.slice(7, 19) ?? 'unverified'}
                  </div>
                ) : null}
                {pending ? <div className="text-[11px] text-amber-700">Download initiated — receipt unverified</div> : null}
              </div>
              <div className="flex items-center gap-1">
                {pending ? (
                  <Button variant="secondary" size="sm" disabled={isSaving} onClick={() => void confirmReceived(output.id)}>
                    Confirm received
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" disabled={isSaving} onClick={() => void saveOutput(output.id)}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  {pending ? 'Retry' : 'Save'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
