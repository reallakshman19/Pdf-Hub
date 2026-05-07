import React from 'react';
import { Button } from '@/components/ui/Button';
import { FolderOpen, Save, Download, FileOutput } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { error as logError, warn } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';

export const ToolbarFile: React.FC = () => {
  const {
    openDocument,
    workingBytes,
    fileName,
    saveHandle,
    setSaveHandle,
    isDirty,
    setDirty,
    recordSaveExportAction,
  } = useSessionStore();

  const { annotations } = useAnnotationStore();
  const addToast = useToastStore((state) => state.addToast);

  const handleOpen = async () => {
    try {
      const [picked] = await FileAdapter.pickPdfFiles(false);
      if (!picked) {
        return;
      }

      const pageCount = await PdfEditAdapter.countPages(picked.bytes);
      const documentKey = await FileAdapter.hashBytes(picked.bytes);

      openDocument({
        documentKey,
        fileName: picked.name,
        bytes: picked.bytes,
        pageCount,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      logError('session', 'Failed to open PDF from toolbar', { error: String(err) });
    }
  };

  const handleSave = async () => {
    if (!workingBytes || !fileName) {
      return;
    }
    try {
      const bytesToSave =
        annotations.length > 0
          ? await PdfEditAdapter.exportWithAnnotations(workingBytes, annotations)
          : workingBytes;
      const nextHandle = await FileAdapter.savePdfBytes(bytesToSave, fileName, saveHandle);
      if (nextHandle) {
        setSaveHandle(nextHandle);
      }
      setDirty(false);
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
            const bytesToSave =
              annotations.length > 0
                ? await PdfEditAdapter.exportWithAnnotations(workingBytes, annotations)
                : workingBytes;
            const nextHandle = await FileAdapter.savePdfBytes(bytesToSave, fileName, null);
            if (nextHandle) {
              setSaveHandle(nextHandle);
            }
            setDirty(false);
            recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'success', `Saved ${fileName}`);
            addToast({
              type: 'success',
              title: 'Saved Successfully',
              message: `Saved to ${fileName}`,
            });
        } catch(saveAsErr) {
            logError('session', 'Failed to save PDF via Save As', { error: String(saveAsErr), fileName });
            recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'failure', String(saveAsErr));
            addToast({
              type: 'error',
              title: 'Save Failed',
              message: 'Failed to save the document. Please try again.',
            });
        }
        return;
      }
      logError('session', 'Failed to save PDF', { error: String(err), fileName });
      recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'failure', String(err));
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: 'Failed to save the document. Please try again.',
      });
    }
  };

  const handleExportReview = async () => {
    if (!workingBytes || !fileName) {
      return;
    }
    try {
      const exported = await PdfEditAdapter.exportWithAnnotations(workingBytes, annotations);
      const exportName = fileName.replace(/\.pdf$/i, '') + '-review.pdf';
      await FileAdapter.savePdfBytes(exported, exportName, null);
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
      logError('session', 'Failed to export review PDF', { error: String(err), fileName });
      recordSaveExportAction({ type: 'EXPORT_REVIEW_SNAPSHOT' }, 'failure', String(err));
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
      const exported = await PdfEditAdapter.exportWithAnnotations(workingBytes, annotations);
      const exportName = fileName.replace(/\.pdf$/i, '') + '-annotated.pdf';
      await FileAdapter.savePdfBytes(exported, exportName, null);
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
      logError('session', 'Failed to export annotated PDF', { error: String(err), fileName });
      recordSaveExportAction({ type: 'EXPORT_REVIEW_SNAPSHOT' }, 'failure', String(err));
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
    <div className="flex items-center space-x-1">
      <Tooltip content="Open PDF">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOpen}>
          <FolderOpen className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Save">
        <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={handleSave} disabled={!workingBytes}>
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
  );
};

function isHandleAccessError(err: unknown): boolean {
  if (!(err instanceof DOMException)) {
    return false;
  }
  return err.name === 'NotReadableError' || err.name === 'NotAllowedError' || err.name === 'NotFoundError';
}
