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
import { enqueueDocumentOperation } from '@/core/commands/documentOperationQueue';
import { assertDocumentMutationOwner, captureDocumentMutationOwner, isDocumentMutationOwnerCurrent, type DocumentMutationOwner } from '@/core/session/mutationOwner';
import { error as logError, warn } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';
import { useShallow } from 'zustand/react/shallow';
import { inspectPdfSignatureRisk, type PdfSignatureRiskStatus } from '@/core/pdf-signatures/signatureRisk';
import { SignedPdfRewriteWarningDialog } from './SignedPdfRewriteWarningDialog';

export const ToolbarFile: React.FC = () => {
  const [signatureWarning, setSignatureWarning] = React.useState<{
    status: Extract<PdfSignatureRiskStatus, 'SIGNED' | 'UNKNOWN'>;
    signatureCount: number;
    owner: DocumentMutationOwner;
  } | null>(null);
  const savePreflightSequence = React.useRef(0);
  const {
    workingBytes,
    fileName,
    setSaveHandle,
    isDirty,
    recordSaveExportAction,
    beginSaveOperation,
    beginExportOperation,
    completeSaveOperation,
    failSaveOperation,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    fileName: state.fileName,
    setSaveHandle: state.setSaveHandle,
    isDirty: state.isDirty,
    recordSaveExportAction: state.recordSaveExportAction,
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

  const requireWorkingPdf = () => {
    if (!workingBytes) {
      throw new Error('No working PDF is loaded');
    }
    return workingBytes;
  };

  const buildFlattenedPdf = async () =>
    composeCommittedPdf({
      baseBytes: requireWorkingPdf(),
      annotations,
      writerElements,
    });

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

  const performEditableSave = async (owner: DocumentMutationOwner) => {
    if (!isDocumentMutationOwnerCurrent(owner) || !owner.session.workingBytes || !owner.session.fileName) {
      return;
    }
    try {
      beginSaveOperation('Saving editable annotations and document content…');
      await enqueueDocumentOperation(async () => {
        assertDocumentMutationOwner(owner);
        const session = useSessionStore.getState();
        if (!session.workingBytes || !session.documentKey || !session.fileName) {
          throw new Error('No working PDF is loaded');
        }
        if (useAnnotationStore.getState().hydratedDocumentKey !== session.documentKey) {
          throw new Error('Cannot safely save while annotations are still loading.');
        }
        const currentAnnotations = useAnnotationStore.getState().annotations;
        const currentWriterElements = useWriterStore.getState().elements;
        const { bytes } = await composeEditablePdf({
          baseBytes: session.workingBytes,
          annotations: currentAnnotations,
          writerElements: currentWriterElements,
          replaceManagedAnnotations: true,
        });
        assertDocumentMutationOwner(owner);
        // Keep the editing base and its durable journal in the same revision.
        // The output is materialized from that base plus the current overlays;
        // retaining overlays also prevents duplicate Writer content on later saves.
        // Composition can take long enough for more annotation edits to occur.
        // The PDF intentionally uses the captured snapshot, but recovery must
        // retain the latest in-memory edits instead of restoring stale content.
        await saveAnnotations(session.documentKey, useAnnotationStore.getState().annotations);
        assertDocumentMutationOwner(owner);
        let nextHandle: FileSystemFileHandle | null;
        try {
          nextHandle = await FileAdapter.savePdfBytes(bytes, session.fileName, session.saveHandle);
        } catch (error) {
          if (!session.saveHandle || !isHandleAccessError(error)) throw error;
          warn('session', 'Existing save handle became invalid, retrying with Save As flow', { error: String(error) });
          assertDocumentMutationOwner(owner);
          nextHandle = await FileAdapter.savePdfBytes(bytes, session.fileName, null);
        }
        if (!isDocumentMutationOwnerCurrent(owner)) return;
        if (nextHandle) setSaveHandle(nextHandle);
        const unchanged = useAnnotationStore.getState().annotations === currentAnnotations
          && useWriterStore.getState().elements === currentWriterElements;
        if (unchanged) {
          useSessionStore.setState({ isDirty: false, isDocumentDirty: false, isReviewDirty: false, isSessionDirty: false });
        }
        const message = unchanged ? `Saved ${session.fileName}` : `Saved ${session.fileName}; newer changes remain unsaved`;
        completeSaveOperation(message);
        recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'success', message);
        addToast({ type: 'success', title: 'Saved Successfully', message });
      });
    } catch (err) {
      if (!isDocumentMutationOwnerCurrent(owner)) return;
      const message = err instanceof Error ? err.message : String(err);
      logError('session', 'Failed to save PDF', { error: message, fileName });
      failSaveOperation(message);
      recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'failure', message);
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: message.startsWith('Cannot safely ') || message.startsWith('Cannot render native') || message.startsWith('Cannot fit the annotation text')
          ? message : 'Failed to save the document. Please try again.',
      });
    }
  };

  const handleSave = async () => {
    const owner = captureDocumentMutationOwner();
    const bytes = owner.session.workingBytes;
    if (!bytes || !owner.session.fileName) {
      return;
    }
    const sequence = ++savePreflightSequence.current;
    const risk = await inspectPdfSignatureRisk(bytes);
    if (sequence !== savePreflightSequence.current || !isDocumentMutationOwnerCurrent(owner)) return;
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
        owner,
      });
      return;
    }

    await performEditableSave(owner);
  };

  const handleSignedSaveCancel = () => {
    savePreflightSequence.current += 1;
    setSignatureWarning(null);
  };

  const handleSignedSaveContinue = () => {
    const owner = signatureWarning?.owner;
    savePreflightSequence.current += 1;
    setSignatureWarning(null);
    if (owner && isDocumentMutationOwnerCurrent(owner)) void performEditableSave(owner);
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
