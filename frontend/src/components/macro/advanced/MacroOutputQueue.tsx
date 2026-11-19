import React from 'react';
import { Save, Trash2 } from 'lucide-react';

import { FileAdapter } from '@/adapters/file/FileAdapter';
import { Button } from '@/components/ui/Button';
import { error as logError } from '@/core/logger/service';
import type { MacroOutputFile } from '@/core/macro/types';

export interface MacroOutputQueueItem extends MacroOutputFile {
  id: string;
}

export interface MacroOutputQueueProps {
  outputs: MacroOutputQueueItem[];
  onChange: React.Dispatch<React.SetStateAction<MacroOutputQueueItem[]>>;
  onError?: (message: string) => void;
}

export const MacroOutputQueue: React.FC<MacroOutputQueueProps> = ({
  outputs,
  onChange,
  onError,
}) => {
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // A synchronous ref protects against double clicks before React renders the busy state.
  const savingRef = React.useRef(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const saveOutput = async (id: string) => {
    if (savingRef.current) return;
    const output = outputs.find((item) => item.id === id);
    if (!output) return;

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      await FileAdapter.savePdfBytes(output.bytes, output.name, null);
      // Remove only the saved identity. Functional updates preserve concurrent additions.
      onChange((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('macro', 'Failed to save workflow output', {
        outputName: output.name,
        error: message,
      });
      setSaveError(message);
      onError?.(message);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const saveAllOutputs = async () => {
    if (savingRef.current || outputs.length === 0) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      for (const output of outputs) {
        try {
          await FileAdapter.savePdfBytes(output.bytes, output.name, null);
          // A later failure must not re-queue an earlier successfully saved file.
          onChange((current) => current.filter((item) => item.id !== output.id));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logError('macro', 'Failed to save workflow outputs', {
            outputName: output.name,
            error: message,
          });
          setSaveError(message);
          onError?.(message);
          return;
        }
      }
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
            onClick={() => onChange([])}
            disabled={isSaving || outputs.length === 0}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {outputs.length === 0 ? (
        <div className="text-xs text-slate-500">
          No generated output files.
        </div>
      ) : null}

      {saveError ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
          role="alert"
        >
          {saveError}
        </div>
      ) : null}

      <div className="space-y-2">
        {outputs.map((output) => (
          <div
            key={output.id}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-800"
          >
            <div className="truncate text-xs text-slate-700 dark:text-slate-200">
              {output.name}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void saveOutput(output.id)}
              disabled={isSaving}
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
};
