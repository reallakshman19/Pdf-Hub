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
  const [confirmClear, setConfirmClear] = React.useState(false);
  const batchReceipts = useMacroOutputQueueStore((state) => state.batchReceipts);
  const savingRef = React.useRef(false);

  const markDownloadPending = (id: string, pending: boolean) => {
    setDownloadPendingIds((current) => pending
      ? current.includes(id) ? current : [...current, id]
      : current.filter((value) => value !== id));
  };

  const saveAcknowledged = async (
    id: string,
    method: 'native-readback-verified' | 'browser-user-confirmed',
    externalFileName?: string,
    readbackSha256?: string,
  ) => {
    const output = outputs.find((item) => item.id === id);
    if (!output) return;
    // Remove the IDB record BEFORE hiding a batch output. A failed delete is
    // visible and recoverable after reload; it must not appear acknowledged.
    if (output.sourceKind === 'batch') {
      await useMacroOutputQueueStore.getState().acknowledgeBatchOutput(
        id, method, externalFileName, readbackSha256,
      );
    } else {
      onChange((current) => current.filter((item) => item.id !== id));
    }
    markDownloadPending(id, false);
  };

  const verifyBatchSave = async (
    output: MacroOutputQueueItem,
    handle?: FileSystemFileHandle | null,
  ): Promise<{ externalFileName: string; readbackSha256: string } | null> => {
    if (output.sourceKind !== 'batch') return null;
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
      const readbackSha256 = await FileAdapter.hashBytes(savedBytes);
      if (readbackSha256 !== output.outputSha256) {
        throw new Error('OUTPUT_EXTERNAL_READBACK_MISMATCH: saved PDF hash differs.');
      }
      return { externalFileName: persistedFile.name, readbackSha256 };
    }
    return null;
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
        const witness = await verifyBatchSave(output, handle);
        await saveAcknowledged(id, 'native-readback-verified', witness?.externalFileName, witness?.readbackSha256);
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
          const witness = await verifyBatchSave(output, handle);
          await saveAcknowledged(output.id, 'native-readback-verified', witness?.externalFileName, witness?.readbackSha256);
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
      await saveAcknowledged(id, 'browser-user-confirmed');
      setNotice('Browser download receipt recorded as your confirmation, not native file readback.');
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
              setConfirmClear(true);
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
      {confirmClear ? (
        <div role="alert" className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          <p>
            Discard {outputs.length} queued PDF(s)? This permanently removes their
            unsaved browser-local copies. It does not save or export the files.
            Batch deletions will be recorded as discarded without receipt.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={isSaving}
              onClick={() => setConfirmClear(false)}>Keep PDFs</Button>
            <Button size="sm" variant="secondary" disabled={isSaving}
              onClick={() => {
                if (savingRef.current) return;
                savingRef.current = true;
                setIsSaving(true);
                void useMacroOutputQueueStore.getState().clearAllOutputs()
                  .then(() => {
                    setDownloadPendingIds([]);
                    setNotice('Queued PDFs discarded with an explicit user action; batch tombstones are retained.');
                    setConfirmClear(false);
                    onChange([]);
                  })
                  .catch((failure) => reportFailure(outputs[0], failure))
                  .finally(() => {
                    savingRef.current = false;
                    setIsSaving(false);
                  });
              }}>Discard queued PDFs</Button>
          </div>
        </div>
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
      {batchReceipts.length > 0 ? (
        <details data-testid="batch-receipt-ledger" className="text-xs text-slate-600 dark:text-slate-300">
          <summary className="cursor-pointer">
            Batch delivery/discard ledger — {batchReceipts.length} durable record(s)
          </summary>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {batchReceipts.map((receipt) => (
              <li key={receipt.id} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                <div>{receipt.outputName} · {receipt.method}</div>
                <div>{receipt.recordedAt} · SHA-256 {receipt.outputSha256}</div>
                {receipt.externalFileName ? <div>External filename: {receipt.externalFileName}</div> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
};
