import React from 'react';
import { Button } from '@/components/ui/Button';
import { FolderOpen, Save, Download, FileOutput } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitAndOpenPdfFile,
  firstAdmissionErrorMessage,
} from '@/core/admission/openPdf';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { saveAnnotations } from '@/core/annotations/persistence';
import { useWriterStore } from '@/core/writer/store';
import { composeCommittedPdf, composeEditablePdf } from '@/core/document/commitPipeline';
import { error as logError, warn } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';
import { useShallow } from 'zustand/react/shallow';
import { inspectPdfSignatureRisk, type PdfSignatureRiskStatus } from '@/core/pdf-signatures/signatureRisk';
import { SignedPdfRewriteWarningDialog } from './SignedPdfRewriteWarningDialog';

export const ToolbarFile: React.FC = () => {
  const [signatureWarning, setSignatureWarning] = React.useState<{
    status: Extract<PdfSignatureRiskStatus, 'SIGNED' | 'UNKNOWN'>;
    signatureCount: number;
  } | null>(null);
  const {
    workingBytes,
    fileName,
    saveHandle,
    setSaveHandle,
    isDirty,
    recordSaveExportAction,
    commitWorkingCopy,
    beginSaveOperation,
    beginExportOperation,
    completeSaveOperation,
    failSaveOperation,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    fileName: state.fileName,
    saveHandle: state.saveHandle,
    setSaveHandle: state.setSaveHandle,
    isDirty: state.isDirty,
    recordSaveExportAction: state.recordSaveExportAction,
    commitWorkingCopy: state.commitWorkingCopy,
    beginSaveOperation: state.beginSaveOperation,
    beginExportOperation: state.beginExportOperation,
    completeSaveOperation: state.completeSaveOperation,
    failSaveOperation: state.failSaveOperation,
  })));

  const { annotations } = useAnnotationStore(useShallow((state) => ({
    annotations: state.annotations,
  })));
  const addToast = useToastStore((state) => state.addToast);

  const writerElements = useWriterStore((state) => state.elements);
  const clearWriterElementsAfterCommit = useWriterStore(
    (state) => state.clearElementsAfterCommit,
  );

  const requireWorkingPdf = () => {
    if (!workingBytes) {
      throw new Error('No working PDF is loaded');
    }
    return workingBytes;
  };

  const buildEditablePdf = async () =>
    composeEditablePdf({
      baseBytes: requireWorkingPdf(),
      annotations,
      writerElements,
    });

  const buildFlattenedPdf = async () =>
    composeCommittedPdf({
      baseBytes: requireWorkingPdf(),
      annotations,
      writerElements,
    });

  const clearCommittedWriterElements = () => {
    if (writerElements.length > 0) {
      clearWriterElementsAfterCommit();
    }
  };

  const handleOpen = async () => {
    try {
      const [picked] = await FileAdapter.pickPdfFileSources(false);
      if (!picked) {
        return;
      }

      const result = await admitAndOpenPdfFile(picked.file, 'TOOLBAR_PICKER', {
        saveHandle: picked.handle ?? null,
      });
      if (result.outcome !== 'ACCEPTED' && result.outcome !== 'CANCELLED') {
        addToast({
          type: 'error',
          title: 'Unable to Open PDF',
          message: firstAdmissionErrorMessage(result) ?? 'The selected file was not accepted.',
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      logError('session', 'Failed to select PDF from toolbar', { error: String(err) });
      addToast({
        type: 'error',
        title: 'Unable to Open PDF',
        message: 'The file picker could not open the selected PDF.',
      });
    }
  };

  const performEditableSave = async () => {
    if (!workingBytes || !fileName) {
      return;
    }
    try {
      beginSaveOperation('Saving editable annotations and document content…');
      const { bytes, pageCount, documentKey } = await buildEditablePdf();
      await saveAnnotations(documentKey, annotations);
      const nextHandle = await FileAdapter.savePdfBytes(bytes, fileName, saveHandle);
      if (nextHandle) {
        setSaveHandle(nextHandle);
      }
      commitWorkingCopy({ bytes, pageCount, documentKey });
      clearCommittedWriterElements();
      completeSaveOperation(`Saved ${fileName}`);
      recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'success', `Saved ${fileName}`);
      addToast({
        type: 'success',
        title: 'Saved Successfully',
        message: `Saved to ${fileName}`,
      });
    } catch (err) {
      if (saveHandle && isHandleAccessError(err)) {
        warn('session', 'Existing save handle became invalid, retrying with Save As flow', {
          error: String(err),
        });
        try {
          const { bytes, pageCount, documentKey } = await buildEditablePdf();
          await saveAnnotations(documentKey, annotations);
          const nextHandle = await FileAdapter.savePdfBytes(bytes, fileName, null);
          if (nextHandle) {
            setSaveHandle(nextHandle);
          }
          commitWorkingCopy({ bytes, pageCount, documentKey });
          clearCommittedWriterElements();
          completeSaveOperation(`Saved ${fileName}`);
          recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'success', `Saved ${fileName}`);
          addToast({
            type: 'success',
            title: 'Saved Successfully',
            message: `Saved to ${fileName}`,
          });
        } catch (saveAsErr) {
          const message = saveAsErr instanceof Error ? saveAsErr.message : String(saveAsErr);
          logError('session', 'Failed to save PDF via Save As', { error: message, fileName });
          failSaveOperation(message);
          recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'failure', message);
          addToast({
            type: 'error',
            title: 'Save Failed',
            message: 'Failed to save the document. Please try again.',
          });
        }
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      logError('session', 'Failed to save PDF', { error: message, fileName });
      failSaveOperation(message);
      recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'failure', message);
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: 'Failed to save the document. Please try again.',
      });
    }
  };

  const handleSave = async () => {
    if (!workingBytes || !fileName) {
      return;
    }

    const risk = await inspectPdfSignatureRisk(workingBytes);
    if (risk.status === 'SIGNED' || risk.status === 'UNKNOWN') {
      if (risk.status === 'UNKNOWN') {
        warn('session', 'Unable to determine PDF signature state before Save', {
          reason: risk.reason,
          fileName,
        });
      }

      setSignatureWarning({
        status: risk.status,
        signatureCount: risk.signatureCount,
      });
      return;
    }

    await performEditableSave();
  };

  const handleSignedSaveCancel = () => {
    setSignatureWarning(null);
  };

  const handleSignedSaveContinue = () => {
    setSignatureWarning(null);
    void performEditableSave();
  };

  const handleExportReview = async () => {
    if (!workingBytes || !fileName) {
      return;
    }
    try {
      beginExportOperation('Building flattened export…');
      const { bytes } = await buildFlattenedPdf();
      const exportName = fileName.replace(/\.pdf$/i, '') + '-review.pdf';
      await FileAdapter.savePdfBytes(bytes, exportName, null);
      completeSaveOperation(`Exported ${exportName}`);
      recordSaveExportAction(
        { type: 'EXPORT_REVIEW_SNAPSHOT' },
        'success',
        `Exported review ${exportName}`,
      );
      addToast({
        type: 'success',
        title: 'Review Exported',
        message: `Exported review to ${exportName}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('session', 'Failed to export review PDF', { error: message, fileName });
      failSaveOperation(message);
      recordSaveExportAction({ type: 'EXPORT_REVIEW_SNAPSHOT' }, 'failure', message);
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export the review document.',
      });
    }
  };

  const handleExport = async () => {
    if (!workingBytes || !fileName) {
      return;
    }
    try {
      beginExportOperation('Building flattened export…');
      const { bytes } = await buildFlattenedPdf();
      const exportName = fileName.replace(/\.pdf$/i, '') + '-annotated.pdf';
      await FileAdapter.savePdfBytes(bytes, exportName, null);
      completeSaveOperation(`Exported ${exportName}`);
      recordSaveExportAction(
        { type: 'EXPORT_REVIEW_SNAPSHOT' },
        'success',
        `Exported ${exportName}`,
      );
      addToast({
        type: 'success',
        title: 'Exported Successfully',
        message: `Exported to ${exportName}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('session', 'Failed to export annotated PDF', { error: message, fileName });
      failSaveOperation(message);
      recordSaveExportAction({ type: 'EXPORT_REVIEW_SNAPSHOT' }, 'failure', message);
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export the document. Please try again.',
      });
    }
  };

  const handleDownload = () => {
    if (!workingBytes || !fileName) {
      return;
    }
    FileAdapter.downloadBytes(workingBytes, fileName);
    recordSaveExportAction({ type: 'DOWNLOAD_PROCESSED_PDF' }, 'success', `Downloaded ${fileName}`);
  };

  return (
    <>
      <div className="flex items-center space-x-1">
      <Tooltip content="Open PDF">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOpen}>
          <FolderOpen className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Save">
        <Button aria-label="Save" variant="ghost" size="icon" className="h-8 w-8 relative" onClick={handleSave} disabled={!workingBytes}>
          <Save className="w-4 h-4" />
          {isDirty && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-white dark:border-slate-900" />
          )}
        </Button>
      </Tooltip>

      <Tooltip content="Export flattened PDF">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExport} disabled={!workingBytes}>
          <FileOutput className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Export Review">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExportReview} disabled={!workingBytes}>
          <FileOutput className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Download current PDF">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} disabled={!workingBytes}>
          <Download className="w-4 h-4" />
        </Button>
      </Tooltip>
      </div>

      {signatureWarning ? (
        <SignedPdfRewriteWarningDialog
          status={signatureWarning.status}
          signatureCount={signatureWarning.signatureCount}
          onCancel={handleSignedSaveCancel}
          onContinue={handleSignedSaveContinue}
        />
      ) : null}
    </>
  );
};

function isHandleAccessError(err: unknown): boolean {
  if (!(err instanceof DOMException)) {
    return false;
  }
  return err.name === 'NotReadableError' || err.name === 'NotAllowedError' || err.name === 'NotFoundError';
}
