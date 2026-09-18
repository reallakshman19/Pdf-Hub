import React from 'react';
import { ImageIcon, Sparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { error as logError } from '@/core/logger/service';
import { buildGenerationRecipe } from '@/core/macro/generateDocument/buildGenerationRecipe';
import { buildGeneratedDocumentOutputName } from '@/core/macro/generateDocument/generateDocumentOutputName';
import {
  GENERATION_TEMPLATES,
  getGenerationTemplateById,
} from '@/core/macro/generateDocument/generationRecipes';
import type { GenerationField } from '@/core/macro/generateDocument/generationTypes';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import type { MacroOutputFile } from '@/core/macro/types';
import { useSessionStore } from '@/core/session/store';

export interface MacroGenerateDocumentPanelProps {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onOutputsProduced?: (outputs: MacroOutputFile[]) => void;
}

export const MacroGenerateDocumentPanel: React.FC<MacroGenerateDocumentPanelProps> = ({
  disabled = false,
  onBusyChange,
  onOutputsProduced,
}) => {
  const {
    workingBytes,
    fileName,
    pageCount,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    fileName: state.fileName,
    pageCount: state.pageCount,
  })));

  const [brandImageDataUrl, setBrandImageDataUrl] = React.useState('');
  const [selectedGenerationId, setSelectedGenerationId] = React.useState(
    GENERATION_TEMPLATES[0]?.id ?? '',
  );
  const [generationValues, setGenerationValues] = React.useState<Record<string, string>>(() => {
    const template = getGenerationTemplateById(GENERATION_TEMPLATES[0]?.id ?? '');
    if (!template) return {};
    return Object.fromEntries(
      template.fields.map((field) => [field.key, resolveFieldDefault(field)]),
    );
  });
  const [isRunning, setIsRunning] = React.useState(false);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [runError, setRunError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectedTemplate = React.useMemo(
    () => getGenerationTemplateById(selectedGenerationId),
    [selectedGenerationId],
  );
  const busy = disabled || isRunning;
  const canGenerate = Boolean(workingBytes && selectedTemplate) && !busy;

  React.useEffect(() => {
    onBusyChange?.(isRunning);
    return () => {
      if (isRunning) onBusyChange?.(false);
    };
  }, [isRunning, onBusyChange]);

  const handleTemplateChange = (newId: string) => {
    setSelectedGenerationId(newId);
    const template = getGenerationTemplateById(newId);
    if (!template) {
      setGenerationValues({});
      return;
    }
    setGenerationValues(
      Object.fromEntries(
        template.fields.map((field) => [field.key, resolveFieldDefault(field)]),
      ),
    );
    setLogs([]);
    setRunError(null);
  };

  const updateGenerationValue = (key: string, value: string) => {
    setGenerationValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const resetGenerationValues = () => {
    if (!selectedTemplate) {
      setGenerationValues({});
      return;
    }

    setGenerationValues(
      Object.fromEntries(
        selectedTemplate.fields.map((field) => [field.key, resolveFieldDefault(field)]),
      ),
    );
    setLogs([]);
    setRunError(null);
  };

  const generate = async () => {
    if (!workingBytes || !selectedTemplate || disabled || isRunning) return;

    setIsRunning(true);
    setRunError(null);
    setLogs([]);

    try {
      const finalRecipe = buildGenerationRecipe({
        template: selectedTemplate,
        values: generationValues,
        fileName: fileName ?? 'document.pdf',
        pageCount: Math.max(1, pageCount),
        now: new Date(),
        brandImageDataUrl: brandImageDataUrl || null,
      });

      const result = await runMacroRecipeAgainstSession(
        {
          ...finalRecipe,
          dryRun: false,
        },
        {
          saveOutputs: false,
        },
      );

      if (result.status === 'failed' || result.success === false) {
        setRunError(result.logs.at(-1) ?? 'Generate Document failed.');
        return;
      }

      if (result.status === 'cancelled') {
        setRunError('Generate Document was cancelled.');
        return;
      }

      if (result.status === 'timed-out') {
        setRunError('Generate Document timed out.');
        return;
      }

      setLogs(result.logs ?? []);

      const outputs: MacroOutputFile[] = result.outputFiles.length > 0
        ? result.outputFiles
        : [
            {
              name: buildGeneratedDocumentOutputName(selectedTemplate),
              bytes: result.finalBytes,
            },
          ];

      onOutputsProduced?.(outputs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      logError('macro', 'Failed to generate document', {
        error: message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="macro-generate-document"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Sparkles className="h-4 w-4" />
        Generate Document
      </div>

      <label className="sr-only" htmlFor="generate-document-template">
        Generate Document Template
      </label>
      <select
        id="generate-document-template"
        aria-label="Generate Document Template"
        className="block w-full rounded-md border-slate-300 bg-white text-xs shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
        value={selectedGenerationId}
        onChange={(event) => handleTemplateChange(event.target.value)}
        disabled={busy}
      >
        {GENERATION_TEMPLATES.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>

      {selectedTemplate ? (
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {selectedTemplate.description}
        </p>
      ) : null}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        {GENERATION_TEMPLATES.length} templates available. Fields update when the template changes.
      </p>

      <fieldset
        disabled={busy}
        className="m-0 space-y-3 border-0 p-0 disabled:opacity-60"
      >
        {selectedGenerationId === 'branded_cover_page' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Brand / Header Image
            </span>
            <button
              type="button"
              className="relative flex h-24 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-transparent p-0 transition-colors hover:border-blue-400 disabled:cursor-not-allowed dark:border-slate-700"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {brandImageDataUrl ? (
                <img
                  src={brandImageDataUrl}
                  alt="Selected brand header"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center text-xs text-slate-400">
                  <ImageIcon className="mx-auto mb-1 h-6 w-6" />
                  No image selected — using placeholder.
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setBrandImageDataUrl(reader.result as string);
                reader.readAsDataURL(file);
              }}
            />
          </label>
        ) : null}

        {selectedTemplate?.fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            <GenerationFieldControl
              field={field}
              value={generationValues[field.key] ?? resolveFieldDefault(field)}
              onChange={(value) => updateGenerationValue(field.key, value)}
            />
          </label>
        ))}

        <Button
          type="button"
          variant="ghost"
          onClick={resetGenerationValues}
          disabled={busy || !selectedTemplate}
          className="w-full justify-center text-xs"
        >
          Reset Fields
        </Button>
      </fieldset>

      <Button
        onClick={() => void generate()}
        disabled={!canGenerate}
        className="w-full justify-center bg-blue-600 text-white shadow-sm hover:bg-blue-700"
        data-testid="macro-generate-run"
      >
        {isRunning ? 'Generating…' : 'Generate PDF'}
      </Button>

      {runError ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
          role="alert"
        >
          {runError}
        </div>
      ) : null}

      {logs.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
            Generation details
          </summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">
            {logs.map((line, index) => (
              <div
                key={`generation-${index}-${line}`}
                className="text-xs text-slate-600 dark:text-slate-300"
              >
                {line}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
};

function GenerationFieldControl({
  field,
  value,
  onChange,
}: {
  field: GenerationField;
  value: string;
  onChange: (value: string) => void;
}) {
  const baseClassName =
    'w-full rounded-md border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900';

  if (field.type === 'textarea') {
    return (
      <textarea
        className={`${baseClassName} min-h-[72px]`}
        value={value}
        required={field.required}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === 'date') {
    return (
      <input
        type="date"
        className={baseClassName}
        value={value}
        required={field.required}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        className={baseClassName}
        value={value}
        required={field.required}
        onChange={(event) => onChange(event.target.value)}
      >
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="text"
      className={baseClassName}
      value={value}
      required={field.required}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function resolveFieldDefault(field: GenerationField): string {
  const raw = field.defaultValue ?? '';
  if (
    field.type === 'date'
    && /^\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}$/.test(raw.trim())
  ) {
    return new Date().toISOString().slice(0, 10);
  }
  return raw;
}
