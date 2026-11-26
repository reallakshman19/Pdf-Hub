import React from 'react';
import { Button } from '@/components/ui/Button';
import { FolderOpen, Save, Download, FileOutput, ShieldCheck, Printer } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitAndOpenPdfFile,
  firstAdmissionErrorMessage,
} from '@/core/admission/openPdf';
import { openWithPasswordRetry } from '@/core/pdf/passwordPromptBridge';
import {
  buildCurrentFlattenedPdf,
  performEditablePdfSave,
} from '@/core/document/fileSaveWorkflow';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { captureDocumentMutationOwner, isDocumentMutationOwnerCurrent, type DocumentMutationOwner } from '@/core/session/mutationOwner';
import { error as logError, warn } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';
import { useShallow } from 'zustand/react/shallow';
import { inspectPdfSignatureRisk, type PdfSignatureRiskStatus } from '@/core/pdf-signatures/signatureRisk';
import { SignedPdfRewriteWarningDialog } from './SignedPdfRewriteWarningDialog';
import { PdfAExportDialog } from '@/components/dialogs/PdfAExportDialog';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

export const ToolbarFile: React.FC = () => {
  const [signatureWarning, setSignatureWarning] = React.useState<{
    status: Extract<PdfSignatureRiskStatus, 'SIGNED' | 'UNKNOWN'>;
    signatureCount: number;
    owner: DocumentMutationOwner;
  } | null>(null);
  const [pdfADialogOpen, setPdfADialogOpen] = React.useState(false);
  const savePreflightSequence = React.useRef(0);
  const {
    workingBytes,
    fileName,
    isDirty,
    recordSaveExportAction,
    beginExportOperation,
    completeSaveOperation,
    failSaveOperation,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    fileName: state.fileName,
    isDirty: state.isDirty,
    recordSaveExportAction: state.recordSaveExportAction,
    beginExportOperation: state.beginExportOperation,
    completeSaveOperation: state.completeSaveOperation,
    failSaveOperation: state.failSaveOperation,
  })));

  const { nativeIntegrity, hydratedDocumentKey } = useAnnotationStore(useShallow((state) => ({
    nativeIntegrity: state.nativeIntegrity,
    hydratedDocumentKey: state.hydratedDocumentKey,
  })));
  const isBlankWriterDocument = useWriterV2Store(
    (state) => state.documentMeta?.mode === 'blankDocument',
  );
  const addToast = useToastStore((state) => state.addToast);

  const isEncryptedSource = useSessionStore((state) => state.isEncryptedSource);
  const canRewriteNative = Boolean(workingBytes && !isEncryptedSource && hydratedDocumentKey
    && hydratedDocumentKey === useSessionStore.getState().documentKey
    && nativeIntegrity.documentKey === hydratedDocumentKey
    && nativeIntegrity.status === 'COMPLETE');
  const canPrint = Boolean(workingBytes) || isBlankWriterDocument;

  const handleOpen = async () => {
    try {
      const [picked] = await FileAdapter.pickPdfFileSources(false);
      if (!picked) {
        return;
      }
      const { result, cancelledByPasswordPrompt } = await openWithPasswordRetry(
        (password) => admitAndOpenPdfFile(picked.file, 'TOOLBAR_PICKER', {
          saveHandle: picked.handle ?? null,
          ...(password !== undefined ? { password } : {}),
        }),
        picked.file.name,
      );
      if (result.outcome !== 'ACCEPTED' && result.outcome !== 'CANCELLED' && !cancelledByPasswordPrompt) {
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
      logError('session', 'Failed to select PDF from picker', { error: String(err) });
      addToast({
        type: 'error',
        title: 'Unable to Open PDF',
        message: 'The file picker could not open the selected PDF.',
      });
    }
  };
  const handlePrint = () => {
    document.dispatchEvent(new CustomEvent('pdf-hub:print', { bubbles: true }));
  };

  const performEditableSave = (owner: DocumentMutationOwner) =>
    performEditablePdfSave(owner, addToast);

  const handleSave = async () => {
    const owner = captureDocumentMutationOwner();
    const currentWorkingBytes = owner.session.workingBytes;
    if (!currentWorkingBytes || !owner.session.fileName) {
      return;
    }
    const sequence = ++savePreflightSequence.current;
    const risk = await inspectPdfSignatureRisk(currentWorkingBytes);
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
      const { bytes } = await buildCurrentFlattenedPdf();
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
      const { bytes } = await buildCurrentFlattenedPdf();
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
        message: `Failed to export the document: ${message}`,
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
        <Button variant="ghost" size="icon" aria-label="Open PDF" className="h-8 w-8" onClick={handleOpen}>
          <FolderOpen className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Save">
        <Button aria-label="Save" variant="ghost" size="icon" className="h-8 w-8 relative" onClick={handleSave} disabled={!canRewriteNative}>
          <Save className="w-4 h-4" />
          {isDirty && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-white dark:border-slate-900" />
          )}
        </Button>
      </Tooltip>

      <Tooltip content="Export flattened PDF">
        <Button variant="ghost" size="icon" aria-label="Export flattened PDF" className="h-8 w-8" onClick={handleExport} disabled={!canRewriteNative}>
          <FileOutput className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Export PDF/A (Archival)">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Export PDF/A"
          data-testid="toolbar-export-pdfa-btn"
          className="h-8 w-8"
          onClick={() => setPdfADialogOpen(true)}
          disabled={!workingBytes}
        >
          <ShieldCheck className="w-4 h-4" />
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

      <Tooltip content="Print PDF (Ctrl+P)">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Print PDF"
          data-testid="toolbar-print-btn"
          className="h-8 w-8"
          onClick={handlePrint}
          disabled={!canPrint}
        >
          <Printer className="w-4 h-4" />
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

      {pdfADialogOpen ? (
        <PdfAExportDialog
          isOpen
          onClose={() => setPdfADialogOpen(false)}
        />
      ) : null}
    </>
  );
};
