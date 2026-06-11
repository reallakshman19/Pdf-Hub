import React from 'react';
import {
  ExternalLink,
  FileDown,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrDocumentResult } from '@/core/ocr/types';
import type { OcrCorrection } from '@/core/ocr/ocrCorrections';
import {
  exportSearchableOcrPdf,
  type OcrSearchablePdfExportResult,
} from '@/core/ocr/ocrSearchablePdfExport';

export interface OcrSearchablePdfExportPanelProps {
  pdfBytes: Uint8Array | null;
  ocrResult: OcrDocumentResult | null;
  corrections?: OcrCorrection[];
  onExported?: (result: OcrSearchablePdfExportResult) => void;
}

interface SearchablePdfExportArtifact {
  bytes: Uint8Array;
  fileName: string;
  objectUrl: string | null;
  sourcePdfBytes: Uint8Array | null;
  sourceOcrResult: OcrDocumentResult | null;
}

const SEARCHABLE_PDF_FILE_NAME = 'searchable-ocr.pdf';

export const OcrSearchablePdfExportPanel: React.FC<OcrSearchablePdfExportPanelProps> = ({
  pdfBytes,
  ocrResult,
  corrections = [],
  onExported,
}) => {
  const [minConfidence, setMinConfidence] = React.useState(0);
  const [layerMode, setLayerMode] = React.useState<'word' | 'line'>('word');
  const [debugVisible, setDebugVisible] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const [artifact, setArtifact] = React.useState<SearchablePdfExportArtifact | null>(null);
  const artifactUrlRef = React.useRef<string | null>(null);

  const canExport = Boolean(pdfBytes && ocrResult && !isExporting);
  const activeArtifact = artifact
    && artifact.sourcePdfBytes === pdfBytes
    && artifact.sourceOcrResult === ocrResult
    ? artifact
    : null;

  const revokeCurrentArtifactUrl = React.useCallback(() => {
    if (
      artifactUrlRef.current
      && typeof URL !== 'undefined'
      && typeof URL.revokeObjectURL === 'function'
    ) {
      URL.revokeObjectURL(artifactUrlRef.current);
    }

    artifactUrlRef.current = null;
  }, []);

  React.useEffect(() => {
    return () => {
      revokeCurrentArtifactUrl();
    };
  }, [revokeCurrentArtifactUrl]);

  React.useEffect(() => {
    revokeCurrentArtifactUrl();
  }, [pdfBytes, ocrResult, revokeCurrentArtifactUrl]);

  const publishExportArtifact = React.useCallback((
    bytes: Uint8Array,
    sourcePdfBytes: Uint8Array | null,
    sourceOcrResult: OcrDocumentResult | null,
  ) => {
    revokeCurrentArtifactUrl();

    const objectUrl = createPdfObjectUrl(bytes);
    artifactUrlRef.current = objectUrl;

    setArtifact({
      bytes,
      fileName: SEARCHABLE_PDF_FILE_NAME,
      objectUrl,
      sourcePdfBytes,
      sourceOcrResult,
    });
  }, [revokeCurrentArtifactUrl]);

  const downloadSearchablePdf = React.useCallback(() => {
    if (!activeArtifact) {
      return;
    }

    const objectUrl = activeArtifact.objectUrl ?? createPdfObjectUrl(activeArtifact.bytes);

    if (!objectUrl) {
      setMessage('Searchable PDF created, but this browser cannot create a local download URL.');
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = activeArtifact.fileName;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    if (!activeArtifact.objectUrl) {
      revokeObjectUrl(objectUrl);
    }
  }, [activeArtifact]);

  const openSearchablePdf = React.useCallback(() => {
    if (!activeArtifact?.objectUrl) {
      return;
    }

    window.open(activeArtifact.objectUrl, '_blank', 'noopener,noreferrer');
  }, [activeArtifact]);

  const runExport = async () => {
    if (!pdfBytes || !ocrResult) {
      setMessage('Load a PDF and run OCR before exporting searchable PDF.');
      return;
    }

    setIsExporting(true);
    setMessage(null);

    try {
      const result = await exportSearchableOcrPdf({
        pdfBytes,
        ocrResult,
        corrections,
        useCorrections: true,
        minConfidence,
        layerMode,
        visibilityMode: debugVisible ? 'debug-visible' : 'invisible',
        invisibleOpacity: debugVisible ? 0.45 : 0,
      });

      publishExportArtifact(result.bytes, pdfBytes, ocrResult);
      onExported?.(result);

      setMessage(
        `Searchable PDF created: ${result.embeddedTextItemCount} OCR text item(s), ${result.skippedTextItemCount} skipped. Use Download PDF or Open PDF below.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Searchable PDF export failed.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-searchable-pdf-export-panel"
    >
      <div className="mb-2 flex items-center gap-2">
        <Layers className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Searchable OCR PDF
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Embed OCR text as a searchable PDF text layer.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Layer mode
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={layerMode}
            data-testid="ocr-searchable-layer-mode"
            onChange={(event) =>
              setLayerMode(event.currentTarget.value as 'word' | 'line')
            }
          >
            <option value="word">Word-level text layer</option>
            <option value="line">Line-level text layer</option>
          </select>
        </label>

        <label className="text-xs text-slate-600 dark:text-slate-300">
          Minimum confidence
          <input
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={minConfidence}
            data-testid="ocr-searchable-min-confidence"
            onChange={(event) =>
              setMinConfidence(Number(event.currentTarget.value))
            }
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={debugVisible}
            data-testid="ocr-searchable-debug-visible"
            onChange={(event) =>
              setDebugVisible(event.currentTarget.checked)
            }
          />
          Debug visible text layer
        </label>
      </div>

      {message ? (
        <p
          className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          data-testid="ocr-searchable-pdf-message"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={runExport}
          disabled={!canExport}
          data-testid="ocr-searchable-pdf-export-button"
        >
          <FileDown className="mr-1 h-3.5 w-3.5" />
          {isExporting ? 'Exporting' : 'Create searchable PDF'}
        </Button>

        {activeArtifact ? (
          <div
            className="flex flex-wrap gap-2"
            data-testid="ocr-searchable-pdf-output-actions"
          >
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={downloadSearchablePdf}
              data-testid="ocr-searchable-pdf-download-button"
            >
              <FileDown className="mr-1 h-3.5 w-3.5" />
              Download PDF
            </Button>

            {activeArtifact.objectUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={openSearchablePdf}
                data-testid="ocr-searchable-pdf-open-button"
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open PDF
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

function createPdfObjectUrl(bytes: Uint8Array): string | null {
  if (
    typeof Blob === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);

  return URL.createObjectURL(new Blob([arrayBuffer], {
    type: 'application/pdf',
  }));
}

function revokeObjectUrl(objectUrl: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(objectUrl);
  }
}
