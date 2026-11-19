/* eslint-disable react-hooks/set-state-in-effect */
import React from 'react';
import {
  FileText,
  Play,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import type { OcrDiagnostic } from '@/core/ocr/types';
import type { OcrEnginePageInput } from '@/core/ocr/engines/ocrEngineContract';
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';
import type { OcrRegionResult } from '@/core/ocr/ocrRegionModel';
import type { OcrRegionToWriterOptions } from '@/core/ocr/ocrRegionToWriter';
import {
  inferWriterOutputModeFromRegion,
  runOcrRegion,
} from '@/core/ocr/ocrRegionRunner';
import { ocrRegionResultToWriterElement } from '@/core/ocr/ocrRegionToWriter';
import { useShallow } from 'zustand/react/shallow';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useSessionStore } from '@/core/session/store';

export interface OcrRegionActionPanelProps {
  region: OcrRegion | null;

  /**
   * Synchronous fallback input. Used when no async resolver is supplied.
   */
  pageInput: OcrEnginePageInput | null;

  /**
   * Async page-input resolver. Used for real PDF region rasterization.
   */
  resolvePageInput?: (region: OcrRegion, signal?: AbortSignal) => Promise<{
    pageInput: OcrEnginePageInput;
    diagnostics?: OcrDiagnostic[];
  }>;

  onRegionResult?: (result: OcrRegionResult) => void;
  onWriterElementCreated?: (element: WriterElementV2) => void;
}

export const OcrRegionActionPanel: React.FC<OcrRegionActionPanelProps> = ({
  region,
  pageInput,
  resolvePageInput,
  onRegionResult,
  onWriterElementCreated,
}) => {
  const store = useOcrStore(useShallow((state) => ({
    engineId: state.engineId,
    profileId: state.profileId,
    documentFingerprint: state.documentFingerprint,
  })));
  const sessionDocumentKey = useSessionStore((state) => state.documentKey);
  const runGeneration = React.useRef(0);
  const activeController = React.useRef<AbortController | null>(null);

  const [isRunning, setIsRunning] = React.useState(false);
  const [regionResult, setRegionResult] = React.useState<OcrRegionResult | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [inputDiagnostics, setInputDiagnostics] = React.useState<OcrDiagnostic[]>([]);
  const [outputMode, setOutputMode] = React.useState<OcrRegionToWriterOptions['outputMode']>('richTextBox');

  React.useEffect(() => {
    // Invalidate pending raster/recognition before resetting selection.
    runGeneration.current += 1;
    activeController.current?.abort('OCR region/document changed');
    activeController.current = null;
    setIsRunning(false);
    if (!region) {
      setOutputMode('richTextBox');
      setRegionResult(null);
      setMessage(null);
      setInputDiagnostics([]);
      return;
    }

    setOutputMode(inferWriterOutputModeFromRegion(region));
    setRegionResult(null);
    setMessage(null);
    setInputDiagnostics([]);
    return () => {
      runGeneration.current += 1;
      activeController.current?.abort('OCR region action panel unmounted');
      activeController.current = null;
    };
  }, [region, store.documentFingerprint, sessionDocumentKey]);

  if (!region) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-region-action-empty"
      >
        Select an OCR region to run region OCR.
      </div>
    );
  }

  const canRun = Boolean((pageInput || resolvePageInput) && !isRunning);
  const canConvert = Boolean(regionResult);

  const runSelectedRegion = async () => {
    if (activeController.current) return;
    const controller = new AbortController();
    activeController.current = controller;
    const generation = ++runGeneration.current;
    const startedSession = useSessionStore.getState();
    const startedRevision = startedSession.activeRevisionId;
    const startedPageId = startedSession.pageGraph?.pages[region.pageIndex]?.pageId;
    const isCurrentOwner = () => {
      const session = useSessionStore.getState();
      const ocr = useOcrStore.getState();
      const currentRegion = ocr.regions.find((item) => item.id === region.id);
      return !controller.signal.aborted
        && runGeneration.current === generation
        && session.documentKey === startedSession.documentKey
        && session.activeRevisionId === startedRevision
        && session.pageGraph?.pages[region.pageIndex]?.pageId === startedPageId
        && (!region.pageId || region.pageId === startedPageId)
        && ocr.documentFingerprint === region.documentFingerprint
        && currentRegion?.documentFingerprint === region.documentFingerprint
        && currentRegion.pageIndex === region.pageIndex
        && currentRegion.pageId === region.pageId
        && currentRegion.bbox.x === region.bbox.x
        && currentRegion.bbox.y === region.bbox.y
        && currentRegion.bbox.width === region.bbox.width
        && currentRegion.bbox.height === region.bbox.height;
    };
    setIsRunning(true);
    setMessage(null);
    setInputDiagnostics([]);
    setRegionResult(null);

    try {
      const resolved = resolvePageInput
        ? await resolvePageInput(region, controller.signal)
        : pageInput
          ? { pageInput, diagnostics: [] }
          : null;

      if (!isCurrentOwner()) return;
      if (!resolved) {
        setMessage('No page input is available for this OCR region.');
        return;
      }

      setInputDiagnostics(resolved.diagnostics ?? []);
      const result = await runOcrRegion({
        documentFingerprint: region.documentFingerprint,
        region,
        page: resolved.pageInput,
        engineId: store.engineId,
        profileId: store.profileId,
        signal: controller.signal,
      });

      // An old asynchronous result must not publish to a new page/document,
      // even if the region index or text happens to match.
      if (!isCurrentOwner()) return;
      setRegionResult(result.regionResult);
      onRegionResult?.(result.regionResult);

      setMessage(
        result.regionResult.text
          ? 'Region OCR completed.'
          : 'Region OCR completed, but no text/table block was found inside this region.',
      );
    } catch (error) {
      if (isCurrentOwner()) {
        setMessage(error instanceof Error ? error.message : 'Region OCR failed.');
      }
    } finally {
      if (activeController.current === controller) {
        activeController.current = null;
      }
      if (isCurrentOwner()) setIsRunning(false);
    }
  };

  const convertToWriter = () => {
    if (!regionResult) {
      return;
    }

    const converted = ocrRegionResultToWriterElement(regionResult, {
      outputMode,
      useFirstRowAsHeader: true,
    });

    if (!converted.element) {
      setMessage(converted.diagnostics[0]?.message ?? 'Region could not be converted to Writer element.');
      return;
    }

    onWriterElementCreated?.(converted.element);
    setMessage(`Created Writer element: ${converted.element.type}.`);
  };

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-region-action-panel"
    >
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Region OCR Action
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Run OCR on selected region and convert to Writer content.
          </p>
        </div>
      </div>

      <div className="mb-2 rounded bg-slate-50 px-2 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <div>
          Mode: <span className="font-medium">{region.mode}</span>
        </div>
        <div>
          Page {region.pageIndex + 1} · selected directly on the document
        </div>
      </div>

      {inputDiagnostics.length > 0 ? (
        <div
          className="mb-2 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          data-testid="ocr-region-input-diagnostics"
        >
          {inputDiagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${index}`}>
              {diagnostic.code}: {diagnostic.message}
            </div>
          ))}
        </div>
      ) : null}

      <label className="block text-xs text-slate-600 dark:text-slate-300">
        Writer output
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={outputMode}
          data-testid="ocr-region-output-mode"
          onChange={(event) =>
            setOutputMode(event.currentTarget.value as OcrRegionToWriterOptions['outputMode'])
          }
        >
          <option value="richTextBox">Text box</option>
          <option value="richNote">Note</option>
          <option value="reviewLabel">Review label</option>
          <option value="tableBox">Table</option>
        </select>
      </label>

      {regionResult ? (
        <div
          className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-900"
          data-testid="ocr-region-result-preview"
        >
          <div className="mb-1 font-medium text-slate-800 dark:text-slate-100">
            Result preview
          </div>
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">
            {regionResult.text || '(No text found)'}
          </pre>
          <div className="mt-1 text-[11px] text-slate-500">
            Blocks: {regionResult.blocks.length} · Confidence: {Math.round(regionResult.confidence * 100)}%
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          data-testid="ocr-region-action-message"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={runSelectedRegion}
          disabled={!canRun}
          data-testid="ocr-region-run"
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          {isRunning ? 'Running' : 'Run region OCR'}
        </Button>
        {isRunning ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              runGeneration.current += 1;
              activeController.current?.abort('OCR region canceled by user');
              activeController.current = null;
              setIsRunning(false);
              setMessage('Region OCR canceled.');
            }}
            data-testid="ocr-region-cancel"
          >
            Cancel OCR
          </Button>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={convertToWriter}
          disabled={!canConvert}
          data-testid="ocr-region-convert"
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          Create Writer element
        </Button>
      </div>
    </div>
  );
};
