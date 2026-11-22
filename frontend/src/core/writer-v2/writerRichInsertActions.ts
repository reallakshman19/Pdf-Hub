import { useSessionStore } from '@/core/session/store';
import { ensureRichTextEditing } from './ensureRichTextEditing';
import { useWriterV2Store } from './writerV2Store';
import { createWriterImageAssetFromFile, writerAggregateAssetBytes } from './writerImageAsset';
import { captureWriterPersistenceOwner, isWriterPersistenceOwnerCurrent } from './persistence/writerPersistenceOwner';

export interface WriterRichInsertResult {
  changed: boolean;
  message: string;
  elementId?: string | null;
  assetId?: string;
}

export async function insertRichTableIntoActiveBox(rows = 3, cols = 3): Promise<WriterRichInsertResult> {
  const safeRows = clampInt(rows, 1, 50), safeCols = clampInt(cols, 1, 20);
  const elementId = await ensureRichTextEditing({ pendingCommands: [{ type: 'insertTable', rows: safeRows, cols: safeCols }] });
  return elementId ? { changed: true, elementId, message: `Queued ${safeRows}x${safeCols} table for Writer rich box.` }
    : { changed: false, message: 'Open a PDF or blank Writer document before inserting a table.' };
}

export async function insertImageFileIntoRichBox(file: File): Promise<WriterRichInsertResult> {
  const owner = captureWriterPersistenceOwner();
  const writer = owner.writer;
  const fingerprint = writer.currentDocumentFingerprint;
  if (!fingerprint || (writer.documentMeta?.mode !== 'blankDocument' && fingerprint !== owner.document.session.documentKey)) {
    return { changed: false, message: 'Open a PDF or blank Writer document before inserting an image.' };
  }
  try {
    const asset = await createWriterImageAssetFromFile(file, fingerprint, new Date().toISOString(), writerAggregateAssetBytes(writer.assetRecords));
    const current = useWriterV2Store.getState();
    if (!isWriterPersistenceOwnerCurrent(owner) || current.activeId !== writer.activeId
      || current.selectedIds !== writer.selectedIds || current.editingId !== writer.editingId
      || useSessionStore.getState().viewState.currentPage !== owner.document.session.viewState.currentPage) {
      return { changed: false, message: 'Writer image insertion belongs to a stale document or selection.' };
    }
    const width = asset.width ?? 1, height = asset.height ?? 1;
    const scale = Math.min(1, 360 / width, 240 / height);
    const elementId = await ensureRichTextEditing({ pendingCommands: [{ type: 'insertImage', asset, src: asset.dataUrl,
      altText: file.name, width: width * scale, height: height * scale, caption: file.name }] });
    return elementId ? { changed: true, elementId, assetId: asset.id, message: 'Queued image for Writer rich box; save the editor to commit it.' }
      : { changed: false, message: 'Unable to open an owned Writer rich box for image insertion.' };
  } catch (error) {
    return { changed: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min;
}
