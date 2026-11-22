import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { isWriterPersistenceOwnerCurrent, type WriterPersistenceOwner } from '@/core/writer-v2/persistence/writerPersistenceOwner';
import { createWriterImageAssetFromFile, writerAggregateAssetBytes } from '@/core/writer-v2/writerImageAsset';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { WRITER_IMAGE_ADMISSION_LIMITS } from '@/core/admission/image/writerImageAdmission';
import { createWriterElementFromSelectBoxCopy } from './insertIntoWriterV2';
import type { SelectBoxCopyResult } from './types';
import type { SelectBoxInsertMode } from './selectBoxCopyMode';

export async function insertSelectBoxCopyIntoWriter(input: {
  owner: WriterPersistenceOwner;
  result: SelectBoxCopyResult;
  mode: SelectBoxInsertMode;
  imageDataUrl?: string;
  isSelectionCurrent: () => boolean;
}) {
  const { owner } = input;
  const current = () => input.isSelectionCurrent() && isWriterPersistenceOwnerCurrent(owner);
  const fingerprint = owner.writer.currentDocumentFingerprint;
  const session = owner.document.session;
  if (!fingerprint || fingerprint !== session.documentKey || owner.writer.documentMeta?.mode !== 'pdfOverlay'
    || !current() || input.result.pageIndex < 0 || input.result.pageIndex >= session.pageCount) {
    return { changed: false, reason: 'Select Box Copy document or page is no longer current.' };
  }
  let asset: WriterAssetRecordV2 | undefined;
  if (input.mode === 'image') {
    const prefix = 'data:image/png;base64,';
    const url = input.imageDataUrl;
    if (!url?.startsWith(prefix) || url.length > WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDataUrlBytes) throw new Error('Invalid or oversized PDF region image.');
    const bytes = Uint8Array.from(atob(url.slice(prefix.length)), char => char.charCodeAt(0));
    asset = await createWriterImageAssetFromFile(new File([bytes], 'Copied PDF region.png', { type: 'image/png' }), fingerprint,
      new Date().toISOString(), writerAggregateAssetBytes(owner.writer.assetRecords));
  }
  if (!current()) return { changed: false, reason: 'Select Box Copy selection changed during image admission.' };
  return useWriterV2Store.getState().dispatchWriterCommandDurableLatest(state => {
    if (!current()) return null;
    const element = createWriterElementFromSelectBoxCopy({ result: input.result, mode: input.mode,
      documentFingerprint: fingerprint, imageAssetId: asset?.id,
      zIndex: state.elements.reduce((max, item) => Math.max(max, item.style.zIndex), 0) + 1 });
    return { type: 'ADD_WRITER_ELEMENT', element };
  }, { stagedAssets: asset ? [asset] : undefined });
}
