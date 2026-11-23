import React from 'react';
import {
  FileText,
  CheckSquare,
  ShieldAlert,
  Copy,
  Check,
  Download,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import type { OcrDocumentResult } from '@/core/ocr/types';
import {
  extractPageKeyValuePairs,
  serializeKeyValuePairsToJson,
  serializeKeyValuePairsToCsv,
} from '@/core/ocr/forms/ocrFormFieldExtractor';
import {
  detectOmrMarksFromText,
} from '@/core/ocr/forms/ocrOmrDetector';
import {
  detectPagePiiEntities,
} from '@/core/ocr/forms/ocrPiiDetector';
import {
  batchApplyPiiEntitiesToRedactionStore,
  convertKeyValuePairToRedactionDraft,
} from '@/core/ocr/forms/ocrRedactionBridge';
import { addRegion } from '@/core/redaction/store';
import type { OcrKeyValuePair, OcrOmrMark, OcrPiiEntity } from '@/core/ocr/forms/formTypes';

export interface OcrFormFieldsPanelProps {
  ocrResult?: OcrDocumentResult | null;
  onRedactionApplied?: (count: number) => void;
}

export const OcrFormFieldsPanel: React.FC<OcrFormFieldsPanelProps> = ({
  ocrResult,
  onRedactionApplied,
}) => {
  const [activeTab, setActiveTab] = React.useState<'kv' | 'omr' | 'pii'>('kv');
  const [copiedFormat, setCopiedFormat] = React.useState<string | null>(null);
  const [redactionNotice, setRedactionNotice] = React.useState<string | null>(null);

  // Extract all document intelligence features across pages
  const { keyValuePairs, omrMarks, piiEntities } = React.useMemo(() => {
    if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
      return { keyValuePairs: [], omrMarks: [], piiEntities: [] };
    }

    const kvList: OcrKeyValuePair[] = [];
    const omrList: OcrOmrMark[] = [];
    const piiList: OcrPiiEntity[] = [];

    for (const page of ocrResult.pages) {
      kvList.push(...extractPageKeyValuePairs(page));
      omrList.push(...detectOmrMarksFromText(page));
      piiList.push(...detectPagePiiEntities(page));
    }

    return {
      keyValuePairs: kvList,
      omrMarks: omrList,
      piiEntities: piiList,
    };
  }, [ocrResult]);

  const [localOmrMarks, setLocalOmrMarks] = React.useState<OcrOmrMark[]>([]);
  React.useEffect(() => {
    setLocalOmrMarks(omrMarks);
  }, [omrMarks]);

  const toggleOmrState = (markId: string) => {
    setLocalOmrMarks((prev) =>
      prev.map((m) =>
        m.id === markId
          ? {
              ...m,
              state: m.state === 'checked' ? 'unchecked' : 'checked',
              fillRatio: m.state === 'checked' ? 0.05 : 0.85,
            }
          : m,
      ),
    );
  };

  const handleCopy = async (format: 'json' | 'csv') => {
    const text =
      format === 'json'
        ? serializeKeyValuePairsToJson(keyValuePairs)
        : serializeKeyValuePairsToCsv(keyValuePairs);

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    }
  };

  const handleRedactAllPii = () => {
    if (piiEntities.length === 0) return;
    const created = batchApplyPiiEntitiesToRedactionStore(piiEntities);
    setRedactionNotice(`Applied ${created.length} PII redaction box${created.length === 1 ? '' : 'es'} to preview`);
    onRedactionApplied?.(created.length);
    setTimeout(() => setRedactionNotice(null), 3500);
  };

  const handleRedactSinglePii = (entity: OcrPiiEntity) => {
    const created = batchApplyPiiEntitiesToRedactionStore([entity]);
    setRedactionNotice(`Redacted ${entity.category.toUpperCase()} on page ${entity.pageIndex + 1}`);
    onRedactionApplied?.(created.length);
    setTimeout(() => setRedactionNotice(null), 3500);
  };

  const handleRedactPairValue = (pair: OcrKeyValuePair) => {
    const drafts = convertKeyValuePairToRedactionDraft(pair, 'value');
    drafts.forEach((d) => addRegion(d.pageNumber, d.rect, d.reason));
    setRedactionNotice(`Redacted value for "${pair.keyText}" on page ${pair.pageIndex + 1}`);
    onRedactionApplied?.(drafts.length);
    setTimeout(() => setRedactionNotice(null), 3500);
  };

  if (!ocrResult || (keyValuePairs.length === 0 && localOmrMarks.length === 0 && piiEntities.length === 0)) {
    return null;
  }

  return (
    <div
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-form-fields-panel"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
          <Layers className="h-4 w-4 text-indigo-500" />
          <span>Document Intelligence</span>
        </div>
        {redactionNotice && (
          <div
            className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
            data-testid="redaction-notice-badge"
          >
            <ShieldCheck className="h-3 w-3" />
            <span>{redactionNotice}</span>
          </div>
        )}
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('kv')}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === 'kv'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
          }`}
          data-testid="tab-key-value-pairs"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Key-Value</span>
          <span className="rounded-full bg-slate-200 px-1 text-[10px] dark:bg-slate-800">
            {keyValuePairs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('omr')}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === 'omr'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
          }`}
          data-testid="tab-omr-checkboxes"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          <span>Checkboxes</span>
          <span className="rounded-full bg-slate-200 px-1 text-[10px] dark:bg-slate-800">
            {localOmrMarks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pii')}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === 'pii'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
          }`}
          data-testid="tab-pii-sensitive"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Sensitive PII</span>
          <span className={`rounded-full px-1 text-[10px] ${
            piiEntities.length > 0
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
              : 'bg-slate-200 text-slate-700 dark:bg-slate-800'
          }`}>
            {piiEntities.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Key-Value Pairs */}
      {activeTab === 'kv' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{keyValuePairs.length} fields detected</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCopy('json')}
                className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                data-testid="btn-copy-kv-json"
              >
                {copiedFormat === 'json' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>JSON</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('csv')}
                className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                data-testid="btn-copy-kv-csv"
              >
                {copiedFormat === 'csv' ? <Check className="h-3 w-3 text-emerald-500" /> : <Download className="h-3 w-3" />}
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full text-left text-[11px]" data-testid="kv-table">
              <thead className="bg-slate-50 font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-2 py-1.5">Key</th>
                  <th className="px-2 py-1.5">Value</th>
                  <th className="px-2 py-1.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {keyValuePairs.map((pair) => (
                  <tr key={pair.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="px-2 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                      {pair.keyText}
                    </td>
                    <td className="px-2 py-1.5 text-slate-900 dark:text-slate-100 font-mono text-[10px]">
                      {pair.valueText}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRedactPairValue(pair)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60"
                        title="Redact this value"
                        data-testid={`btn-redact-val-${pair.id}`}
                      >
                        Redact
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Checkboxes & OMR */}
      {activeTab === 'omr' && (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">
            <span>{localOmrMarks.length} check marks recognized</span>
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto" data-testid="omr-list">
            {localOmrMarks.map((mark) => (
              <div
                key={mark.id}
                onClick={() => toggleOmrState(mark.id)}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-2 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                data-testid={`omr-mark-${mark.id}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold ${
                      mark.state === 'checked'
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900'
                    }`}
                  >
                    ✓
                  </div>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {mark.label || `(Unlabeled ${mark.type})`}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  p.{mark.pageIndex + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Sensitive PII */}
      {activeTab === 'pii' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {piiEntities.length} sensitive item{piiEntities.length === 1 ? '' : 's'} detected
            </span>
            {piiEntities.length > 0 && (
              <button
                type="button"
                onClick={handleRedactAllPii}
                className="flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-rose-700"
                data-testid="btn-redact-all-pii"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Redact All PII</span>
              </button>
            )}
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto" data-testid="pii-list">
            {piiEntities.map((entity) => (
              <div
                key={entity.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                data-testid={`pii-entity-${entity.id}`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-rose-100 px-1 py-0.2 text-[9px] font-bold uppercase text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      {entity.category}
                    </span>
                    <span className="font-mono text-[11px] font-medium text-slate-800 dark:text-slate-200">
                      {entity.maskedText}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Page {entity.pageIndex + 1}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRedactSinglePii(entity)}
                  className="rounded border border-rose-200 px-2 py-0.5 text-[10px] font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/60"
                  data-testid={`btn-redact-single-${entity.id}`}
                >
                  Redact
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
