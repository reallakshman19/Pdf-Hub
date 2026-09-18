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
  onChange: (outputs: MacroOutputQueueItem[]) => void;
  onError?: (message: string) => void;
}

export const MacroOutputQueue: React.FC<MacroOutputQueueProps> = ({
  outputs,
  onChange,
  onError,
}) => {
  const saveOutput = async (id: string) => {
    const output = outputs.find((item) => item.id === id);
    if (!output) return;

    try {
      await FileAdapter.savePdfBytes(output.bytes, output.name, null);
      onChange(outputs.filter((item) => item.id !== id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('macro', 'Failed to save workflow output', {
        outputName: output.name,
        error: message,
      });
      onError?.(message);
    }
  };

  const saveAllOutputs = async () => {
    for (const output of outputs) {
      try {
        await FileAdapter.savePdfBytes(output.bytes, output.name, null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError('macro', 'Failed to save workflow outputs', {
          outputName: output.name,
          error: message,
        });
        onError?.(message);
        return;
      }
    }

    onChange([]);
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
            disabled={outputs.length === 0}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Save All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            disabled={outputs.length === 0}
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
