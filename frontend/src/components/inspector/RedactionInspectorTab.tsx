import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  clearRegions,
  deleteRegions,
  getState,
  subscribe,
  updateRegion,
} from '@/core/redaction/store';
import type { RedactionRegion } from '@/core/redaction/types';
import { RedactionApplyDialog } from '@/components/dialogs/RedactionApplyDialog';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { sanitizePdfDocument } from '@/core/redaction/redactionSanitizer';
import {
  generateRedactionAuditManifest,
  serializeAuditManifestToBytes,
} from '@/core/redaction/redactionAudit';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { useToastStore } from '@/core/toast/store';
import { useSearchStore } from '@/core/search/store';

const PRESET_REASONS = [
  'PII',
  'HIPAA / Health',
  'Financial / Account',
  'Confidential',
  'Attorney-Client Privilege',
  'National Security / Sensitive',
];

export const RedactionInspectorTab: React.FC = () => {
  const [regions, setRegions] = useState<RedactionRegion[]>(() => getState().regions);
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  const workingBytes = useSessionStore((s) => s.workingBytes);
  const fileName = useSessionStore((s) => s.fileName);
  const documentKey = useSessionStore((s) => s.documentKey);
  const pageCount = useSessionStore((s) => s.pageCount);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setRegions(getState().regions);
    });
    return () => unsubscribe();
  }, []);

  const handleReasonChange = (id: string, reason: string) => {
    updateRegion(id, { reason });
  };

  const handleDelete = (id: string) => {
    const target = regions.find((r) => r.id === id);
    deleteRegions([id]);
    if (target?.sourceAnnotationId) {
      useAnnotationStore.getState().deleteAnnotation(target.sourceAnnotationId);
    }
  };

  const handleClearAll = () => {
    clearRegions();
    const { annotations, deleteAnnotation } = useAnnotationStore.getState();
    for (const annotation of annotations) {
      if (annotation.type === 'redaction') {
        deleteAnnotation(annotation.id);
      }
    }
  };

  const handleActivateDrawRedaction = () => {
    const editor = useEditorStore.getState();
    editor.setActiveMode('annotate');
    editor.setActiveTool('redaction');
  };

  const handleConfirmApply = async (options: {
    saveAsCopy: boolean;
    outputFileName: string;
    downloadAuditManifest: boolean;
    scrubMetadata?: boolean;
  }) => {
    if (!workingBytes || !documentKey || regions.length === 0) return;

    try {
      // 1. Execute sanitization
      const targets = regions.map((r) => ({
        id: r.id,
        pageIndex: r.pageNumber - 1,
        rect: { ...r.rect },
        reason: r.reason,
        fillColor: r.fillColor ?? 'black',
      }));

      const sanitizationResult = await sanitizePdfDocument(workingBytes, targets, {
        scrubMetadata: Boolean(options.scrubMetadata),
      });

      // 2. Generate cryptographic audit manifest
      const auditManifest = await generateRedactionAuditManifest(
        workingBytes,
        sanitizationResult,
        {
          documentKey,
          originalFileName: fileName ?? 'document.pdf',
        },
      );

      // 3. Download audit manifest if requested
      if (options.downloadAuditManifest) {
        const manifestBytes = serializeAuditManifestToBytes(auditManifest);
        const manifestName = `${options.outputFileName.replace(/\.[^/.]+$/, '')}_audit_manifest.json`;
        await FileAdapter.savePdfBytes(manifestBytes, manifestName, null);
      }

      // 4. Save as copy or apply to active document
      if (options.saveAsCopy) {
        await FileAdapter.savePdfBytes(
          sanitizationResult.sanitizedBytes,
          options.outputFileName,
          null,
        );
        addToast({
          type: 'success',
          title: 'Redaction Exported',
          message: `Saved ${options.outputFileName} and purged ${sanitizationResult.purgedTextCharacterCount} character(s).`,
        });
      } else {
        // Apply directly to active session via command bus with transaction
        const cmdResult = await commandBus.execute({
          workingBytes,
          command: materializePdfCommand(
            {
              type: 'APPLY_WORKING_COPY',
              payload: {
                binaryResourceId: 'binary:redacted',
                nextPageCount: pageCount,
                reason: `Apply ${regions.length} permanent redactions`,
              },
            },
            'toolbar',
            documentKey,
          ),
          resources: {
            binaries: {
              'binary:redacted': sanitizationResult.sanitizedBytes,
            },
          },
        });

        if (!cmdResult.success) {
          addToast({
            type: 'error',
            title: 'Redaction Commit Failed',
            message: cmdResult.error?.message ?? cmdResult.message,
          });
          return;
        }

        useSearchStore.getState().clearSearch();
        const extraImages = sanitizationResult.purgedImagesCount
          ? `, ${sanitizationResult.purgedImagesCount} image(s)`
          : '';
        addToast({
          type: 'success',
          title: 'Redactions Applied Permanently',
          message: `Purged ${sanitizationResult.purgedTextCharacterCount} characters, ${sanitizationResult.purgedAnnotationsCount} annotations${extraImages}.`,
        });
      }

      // Clear staged preview regions and visual canvas redaction masks once applied
      handleClearAll();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Redaction Failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4 p-4 text-xs" data-testid="redaction-inspector-tab">
      {/* Tab Header with Security Notice */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
          <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Secure Redaction</span>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {regions.length} staged
        </span>
      </div>

      {/* Action Strip */}
      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleActivateDrawRedaction}
          disabled={!workingBytes}
          className="w-full justify-center text-xs"
          title="Activate Redact tool and drag rectangles on the PDF canvas"
        >
          <Square className="w-3.5 h-3.5 mr-1.5" />
          Draw Redaction Box
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            data-testid="redaction-apply-button"
            disabled={regions.length === 0}
            onClick={() => setIsApplyDialogOpen(true)}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Apply All Redactions
          </Button>
          {regions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-slate-500 hover:text-red-600 text-xs px-2.5"
              title="Clear all staged redaction regions"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Regions List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {regions.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400 dark:text-slate-500 space-y-1.5 mt-2">
            <AlertCircle className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="font-medium text-slate-600 dark:text-slate-400">No redactions marked</p>
            <p className="text-[11px] leading-relaxed">
              Use the Redact tool on the toolbar to draw redaction areas on any page.
            </p>
          </div>
        ) : (
          regions.map((region, idx) => (
            <div
              key={region.id}
              data-testid={`redaction-region-card-${region.id}`}
              className="p-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-700 text-center text-[10px] leading-4 text-slate-600 dark:text-slate-300 font-bold">
                    {idx + 1}
                  </span>
                  <span>Page {region.pageNumber}</span>
                </span>
                <button
                  type="button"
                  data-testid={`delete-region-${region.id}`}
                  onClick={() => handleDelete(region.id)}
                  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded transition-colors"
                  title="Remove redaction region"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {Math.round(region.rect.x)}, {Math.round(region.rect.y)} ({Math.round(region.rect.width)} × {Math.round(region.rect.height)} pt)
              </div>

              {/* Redaction Reason Selector / Input */}
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Audit Reason / Category
                </label>
                <input
                  type="text"
                  list={`reasons-${region.id}`}
                  data-testid={`region-reason-input-${region.id}`}
                  value={region.reason ?? ''}
                  placeholder="e.g. PII, HIPAA, Confidential"
                  onChange={(e) => handleReasonChange(region.id, e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <datalist id={`reasons-${region.id}`}>
                  {PRESET_REASONS.map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Confirmation Dialog */}
      {isApplyDialogOpen && (
        <RedactionApplyDialog
          isOpen={isApplyDialogOpen}
          onClose={() => setIsApplyDialogOpen(false)}
          regions={regions}
          documentName={fileName ?? 'document.pdf'}
          onConfirm={handleConfirmApply}
        />
      )}
    </div>
  );
};
