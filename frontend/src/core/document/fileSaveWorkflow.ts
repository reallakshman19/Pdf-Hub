import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitAndOpenPdfFile,
  firstAdmissionErrorMessage,
} from '@/core/admission/openPdf';
import { openWithPasswordRetry } from '@/core/pdf/passwordPromptBridge';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { verifiedNativeWriteEvidence } from '@/core/annotations/nativeWriteEvidence';
import { saveAnnotations } from '@/core/annotations/persistence';
import { loadAppBookmarks } from '@/core/bookmarks/persistence';
import type { AppBookmark } from '@/core/bookmarks/types';
import { useAcroFormStore } from '@/core/pdf-forms/store';
import { useCalloutStore } from '@/core/callout/store';
import { composeCommittedPdf, composeEditablePdf } from '@/core/document/commitPipeline';
import { enqueueDocumentOperation } from '@/core/commands/documentOperationQueue';
import {
  assertDocumentMutationOwner,
  isDocumentMutationOwnerCurrent,
  type DocumentMutationOwner,
} from '@/core/session/mutationOwner';
import { error as logError, warn } from '@/core/logger/service';
import type { Toast } from '@/core/toast/store';

export type AddToastFn = (toast: Omit<Toast, 'id'>) => void;

export function isFileHandleAccessError(err: unknown): boolean {
  if (!(err instanceof DOMException)) {
    return false;
  }
  return err.name === 'NotReadableError' || err.name === 'NotAllowedError' || err.name === 'NotFoundError';
}

export async function openPdfFromPicker(addToast: AddToastFn): Promise<void> {
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
}

export async function getVerifiedNativeAuthorization() {
  const session = useSessionStore.getState();
  const state = useAnnotationStore.getState();
  const workingBytes = session.workingBytes;
  if (!workingBytes) {
    throw new Error('No working PDF is loaded');
  }
  if (session.isEncryptedSource) {
    throw new Error('Cannot safely rewrite a password-protected source PDF. Print or download the source file instead.');
  }
  if (
    !session.documentKey
    || state.hydratedDocumentKey !== session.documentKey
    || state.nativeIntegrity.documentKey !== session.documentKey
    || state.nativeIntegrity.status !== 'COMPLETE'
  ) {
    throw new Error('Cannot safely save: native annotation import integrity is incomplete.');
  }
  const sourceAnnotations = state.annotations;
  const tombstones = state.nativeDeletionTombstones;
  const evidence = await verifiedNativeWriteEvidence({
    sourceRevision: session.documentKey,
    baseBytes: workingBytes,
    annotations: sourceAnnotations,
    tombstones,
    journalStoreId: session.historyJournalStoreId,
  });
  if (
    useSessionStore.getState().documentKey !== session.documentKey
    || useAnnotationStore.getState().annotations !== sourceAnnotations
    || useAnnotationStore.getState().nativeDeletionTombstones !== tombstones
    || useAnnotationStore.getState().nativeIntegrity.status !== 'COMPLETE'
  ) {
    throw new Error('Native source or annotations changed during Save authorization.');
  }
  return {
    sourceRevision: session.documentKey,
    sourcePageIds: session.pageGraph?.pages.map((page) => page.pageId) ?? [],
    tombstones,
    ...evidence,
  };
}

async function loadCustomBookmarksForSave(
  documentKey: string | null | undefined,
): Promise<AppBookmark[]> {
  if (!documentKey || typeof indexedDB === 'undefined') {
    return [];
  }
  try {
    return await loadAppBookmarks(documentKey);
  } catch (err) {
    warn('session', 'Unable to load custom bookmarks for PDF outline export', {
      documentKey,
      error: String(err),
    });
    return [];
  }
}

export async function buildCurrentFlattenedPdf() {
  const session = useSessionStore.getState();
  const workingBytes = session.workingBytes;
  if (!workingBytes) {
    throw new Error('No working PDF is loaded');
  }
  const nativeDeletionAuthorization = await getVerifiedNativeAuthorization();
  const customBookmarks = await loadCustomBookmarksForSave(session.documentKey);
  const acroFormState = useAcroFormStore.getState();
  const formFieldValues =
    acroFormState.documentKey === session.documentKey && acroFormState.dirtyFieldNames.length > 0
      ? acroFormState.getChangedFieldValues()
      : undefined;
  return composeCommittedPdf({
    baseBytes: workingBytes,
    annotations: useAnnotationStore.getState().annotations,
    writerElements: useCalloutStore.getState().elements,
    replaceManagedAnnotations: true,
    nativeDeletionAuthorization,
    ...(customBookmarks.length > 0 ? { customBookmarks } : {}),
    ...(formFieldValues ? { formFieldValues, flattenFormFields: true } : {}),
  });
}

export async function performEditablePdfSave(
  owner: DocumentMutationOwner,
  addToast: AddToastFn,
): Promise<void> {
  if (!isDocumentMutationOwnerCurrent(owner) || !owner.session.workingBytes || !owner.session.fileName) {
    return;
  }
  const sessionActions = useSessionStore.getState();

  try {
    sessionActions.beginSaveOperation('Saving editable annotations and document content…');
    await enqueueDocumentOperation(async () => {
      assertDocumentMutationOwner(owner);
      const session = useSessionStore.getState();
      if (!session.workingBytes || !session.documentKey || !session.fileName) {
        throw new Error('No working PDF is loaded');
      }
      const nativeDeletionAuthorization = await getVerifiedNativeAuthorization();
      const currentAnnotations = useAnnotationStore.getState().annotations;
      const currentWriterElements = useCalloutStore.getState().elements;
      const customBookmarks = await loadCustomBookmarksForSave(session.documentKey);
      const acroFormState = useAcroFormStore.getState();
      const formFieldValues =
        acroFormState.documentKey === session.documentKey && acroFormState.dirtyFieldNames.length > 0
          ? acroFormState.getChangedFieldValues()
          : undefined;
      const { bytes } = await composeEditablePdf({
        baseBytes: session.workingBytes,
        annotations: currentAnnotations,
        writerElements: currentWriterElements,
        replaceManagedAnnotations: true,
        nativeDeletionAuthorization,
        ...(customBookmarks.length > 0 ? { customBookmarks } : {}),
        ...(formFieldValues ? { formFieldValues } : {}),
      });
      assertDocumentMutationOwner(owner);
      const latestAnnotationState = useAnnotationStore.getState();
      await saveAnnotations(session.documentKey, latestAnnotationState.annotations, {
        nativeDeletionTombstones: latestAnnotationState.nativeDeletionTombstones,
      });
      assertDocumentMutationOwner(owner);
      let nextHandle: FileSystemFileHandle | null;
      try {
        nextHandle = await FileAdapter.savePdfBytes(bytes, session.fileName, session.saveHandle);
      } catch (error) {
        if (!session.saveHandle || !isFileHandleAccessError(error)) throw error;
        warn('session', 'Existing save handle became invalid, retrying with Save As flow', { error: String(error) });
        assertDocumentMutationOwner(owner);
        nextHandle = await FileAdapter.savePdfBytes(bytes, session.fileName, null);
      }
      if (!isDocumentMutationOwnerCurrent(owner)) return;
      if (!nextHandle) {
        const message = `Download started for ${session.fileName}; browser file receipt cannot be verified. Edits remain unsaved.`;
        useSessionStore.setState({
          saveState: { status: 'idle', completedAt: Date.now(), message },
        });
        sessionActions.recordSaveExportAction({ type: 'DOWNLOAD_PROCESSED_PDF' }, 'success', message);
        addToast({ type: 'info', title: 'Download Started — Save Not Confirmed', message });
        return;
      }
      sessionActions.setSaveHandle(nextHandle);
      const unchanged = useAnnotationStore.getState().annotations === currentAnnotations
        && useAnnotationStore.getState().nativeDeletionTombstones === nativeDeletionAuthorization.tombstones
        && useCalloutStore.getState().elements === currentWriterElements;
      if (unchanged) {
        useSessionStore.setState({ isDirty: false, isDocumentDirty: false, isReviewDirty: false, isSessionDirty: false });
        if (useAcroFormStore.getState().documentKey === session.documentKey) {
          useAcroFormStore.getState().markSaved();
        }
      }
      const message = unchanged ? `Saved ${session.fileName}` : `Saved ${session.fileName}; newer changes remain unsaved`;
      sessionActions.completeSaveOperation(message);
      sessionActions.recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'success', message);
      addToast({ type: 'success', title: 'Saved Successfully', message });
    });
  } catch (err) {
    if (!isDocumentMutationOwnerCurrent(owner)) return;
    const message = err instanceof Error ? err.message : String(err);
    logError('session', 'Failed to save PDF', { error: message, fileName: owner.session.fileName });
    sessionActions.failSaveOperation(message);
    sessionActions.recordSaveExportAction({ type: 'SAVE_WORKING_DOCUMENT' }, 'failure', message);
    addToast({
      type: 'error',
      title: 'Save Failed',
      message: message.startsWith('Cannot safely ') || message.startsWith('Cannot render native') || message.startsWith('Cannot fit the annotation text')
        ? message
        : 'Failed to save the document. Please try again.',
    });
  }
}
