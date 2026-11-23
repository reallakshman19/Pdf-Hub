import React from 'react';
import {
  FileText,
  Download,
  Copy,
  Check,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrDocumentResult } from '@/core/ocr/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
} from '@/core/ocr/ocrWriterInsertion';
import {
  insertOcrWriterQueueIntoWriterV2Store,
} from '@/core/ocr/ocrWriterBridge';
import {
  exportOcrToMarkdown,
  exportOcrToJson,
  exportOcrToPlainText,
} from '@/core/ocr/export/ocrStructuredDocumentExporter';
import { convertOcrDocumentToWriterElements } from '@/core/ocr/ocrDocumentToWriterV2';

export type OcrStructuredExportFormat = 'markdown' | 'text' | 'json';

export interface OcrStructuredExportPanelProps {
  ocrResult: OcrDocumentResult | null;
  documentFingerprint?: string;
  onInsertWriterElements?: (elements: WriterElementV2[]) => void | Promise<void>;
}

export const OcrStructuredExportPanel: React.FC<OcrStructuredExportPanelProps> = ({
  ocrResult,
  documentFingerprint,
  onInsertWriterElements,
}) => {
  const [format, setFormat] = React.useState<OcrStructuredExportFormat>('markdown');
  const [copied, setCopied] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const previewContent = React.useMemo(() => {
    if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
      return '';
    }

    switch (format) {
      case 'markdown':
        return exportOcrToMarkdown(ocrResult);
      case 'json':
        return exportOcrToJson(ocrResult, { pretty: true });
      case 'text':
        return exportOcrToPlainText(ocrResult);
      default:
        return '';
    }
  }, [ocrResult, format]);

  const handleCopy = async () => {
    if (!previewContent) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(previewContent);
        setCopied(true);
        setStatusMessage('Content copied to clipboard.');
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setStatusMessage('Failed to copy to clipboard.');
    }
  };

  const handleDownload = () => {
    if (!previewContent) return;

    const mimeTypes: Record<OcrStructuredExportFormat, string> = {
      markdown: 'text/markdown;charset=utf-8',
      text: 'text/plain;charset=utf-8',
      json: 'application/json;charset=utf-8',
    };

    const extensions: Record<OcrStructuredExportFormat, string> = {
      markdown: 'md',
      text: 'txt',
      json: 'json',
    };

    const blob = new Blob([previewContent], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-document-export.${extensions[format]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setStatusMessage(`Downloaded ${extensions[format].toUpperCase()} file.`);
  };

  const handleSendToWriter = async () => {
    if (!ocrResult) return;

    const conversion = convertOcrDocumentToWriterElements(ocrResult, {
      documentFingerprint,
    });

    if (conversion.elements.length === 0) {
      setStatusMessage('No OCR content available to insert into Writer V2.');
      return;
    }

    if (onInsertWriterElements) {
      await onInsertWriterElements(conversion.elements);
    } else {
      const queue = createOcrWriterInsertionQueue(
        conversion.elements.map((element) =>
          createOcrWriterInsertionCandidate({
            source: 'ocrRegion',
            element,
          }),
        ),
      );
      await insertOcrWriterQueueIntoWriterV2Store({
        queue,
        documentFingerprint: documentFingerprint || ocrResult.documentFingerprint || 'ocr-doc',
        selectAll: true,
      });
    }

    setStatusMessage(
      `Sent ${conversion.convertedBlockCount} element(s) (${conversion.textCount} text, ${conversion.tableCount} table) to Writer V2.`,
    );
  };

  if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
        data-testid="ocr-structured-export-panel-empty"
      >
        No OCR document available for structured export.
      </div>
    );
  }

  const lineCount = previewContent ? previewContent.split('\n').length : 0;
  const pageCount = ocrResult.pages.length;

  return (
    <div
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900"
      data-testid="ocr-structured-export-panel"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
          <FileText className="h-4 w-4 text-emerald-600" />
          <span>Structured Document Export</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {pageCount} page(s)
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {lineCount} lines
          </span>
        </div>
      </div>

      {/* Format Selector Tabs */}
      <div className="flex gap-1 rounded bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setFormat('markdown')}
          className={`flex-1 rounded py-1 text-center font-medium transition-colors ${
            format === 'markdown'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          data-testid="ocr-export-tab-markdown"
        >
          Markdown (.md)
        </button>
        <button
          type="button"
          onClick={() => setFormat('text')}
          className={`flex-1 rounded py-1 text-center font-medium transition-colors ${
            format === 'text'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          data-testid="ocr-export-tab-text"
        >
          Plain Text (.txt)
        </button>
        <button
          type="button"
          onClick={() => setFormat('json')}
          className={`flex-1 rounded py-1 text-center font-medium transition-colors ${
            format === 'json'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          data-testid="ocr-export-tab-json"
        >
          JSON AST (.json)
        </button>
      </div>

      {/* Live Content Preview */}
      <div className="relative">
        <pre
          className="max-h-48 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
          data-testid="ocr-export-preview"
        >
          {previewContent}
        </pre>
      </div>

      {/* Action Strip */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5"
          data-testid="ocr-export-copy-btn"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownload}
          className="flex items-center gap-1.5"
          data-testid="ocr-export-download-btn"
        >
          <Download className="h-3.5 w-3.5 text-sky-600" />
          <span>Download {format.toUpperCase()}</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleSendToWriter()}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          data-testid="ocr-export-send-writer-btn"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Send Document to Writer V2</span>
        </Button>
      </div>

      {/* Feedback status */}
      {statusMessage && (
        <div
          className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          data-testid="ocr-export-status-message"
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
};
