import { captureDocumentMutationOwner, isDocumentSessionOwnerCurrent } from '@/core/session/mutationOwner';
import { useWriterV2Store } from '../writerV2Store';
import type { WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { WRITER_IMAGE_ADMISSION_LIMITS } from '@/core/admission/image/writerImageAdmission';
import { captureWriterPersistenceOwner, isWriterPersistenceOwnerCurrent } from '../persistence/writerPersistenceOwner';
import { normalizeEditorStateJson, type WriterEditorSavePayload } from './writerEditorState';

export function captureRichEditorOwner(element: WriterElementV2) {
  const state = useWriterV2Store.getState();
  return { document: captureDocumentMutationOwner(), target: element, blankMeta: state.documentMeta?.mode === 'blankDocument' ? state.documentMeta : null };
}
export type RichEditorOwner = ReturnType<typeof captureRichEditorOwner>;

/** Rich content edits can coexist with style/geometry changes to the same object.
 * They must never overwrite a newer editor payload or rebind to another session. */
export function isRichEditorOwnerCurrent(owner: RichEditorOwner): boolean {
  const state = useWriterV2Store.getState();
  const target = state.elements.find(item => item.id === owner.target.id);
  return isDocumentSessionOwnerCurrent(owner.document)
    && state.currentDocumentFingerprint === owner.target.documentFingerprint
    && (owner.blankMeta ? state.documentMeta?.mode === 'blankDocument' && !owner.document.session.documentKey
      : state.documentMeta?.mode !== 'blankDocument' && owner.document.session.documentKey === owner.target.documentFingerprint)
    && (!owner.blankMeta || state.documentMeta === owner.blankMeta)
    && !!target && !target.locked && !target.hidden
    && target.documentFingerprint === owner.target.documentFingerprint
    && target.createdAt === owner.target.createdAt
    && target.editorStateJson === owner.target.editorStateJson
    && target.plainText === owner.target.plainText;
}

export function richInlineImageSources(json: string): Set<string> {
  const parsed = JSON.parse(json);
  if (parsed?.root?.type !== 'root' || !Array.isArray(parsed.root.children)) throw new Error('Invalid Writer editor state.');
  const sources = new Set<string>();
  const pending: unknown[] = [parsed.root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    const value = node as { type?: string; src?: string; children?: unknown[] };
    if (value.type === 'inline-image') {
      if (typeof value.src !== 'string' || !value.src) throw new Error('Invalid Writer inline image.');
      sources.add(value.src);
    }
    if (Array.isArray(value.children)) for (const child of value.children) pending.push(child);
  }
  return sources;
}

/** Only images actually referenced in the serialized editor become durable assets.
 * An image undone before saving (or a cancelled editor) has no published asset. */
export async function saveRichEditorPayload(owner: RichEditorOwner, payload: WriterEditorSavePayload): Promise<{ accepted: boolean; reason: string }> {
  if (!isRichEditorOwnerCurrent(owner)) return { accepted: false, reason: 'Writer editor belongs to a stale document or content revision.' };
  const snapshot = captureWriterPersistenceOwner();
  const state = snapshot.writer;
  const target = state.elements.find(item => item.id === owner.target.id)!;
  const sources = richInlineImageSources(payload.editorStateJson);
  const originalSources = richInlineImageSources(normalizeEditorStateJson(target.editorStateJson, target.plainText));
  const assets = [...(payload.assets ?? [])];
  const existing = new Map(state.assetRecords.map(asset => [asset.id, asset]));
  const staged: WriterAssetRecordV2[] = [];
  const referenced = new Set(target.assetIds ?? []);
  // Existing legacy inline images may be left untouched; new images require an admitted asset.
  for (const id of target.assetIds ?? []) {
    const asset = existing.get(id);
    if (asset && originalSources.has(asset.dataUrl) && !sources.has(asset.dataUrl)) referenced.delete(id);
  }
  for (const asset of assets) {
    if (!sources.has(asset.dataUrl)) continue;
    if (asset.documentFingerprint !== target.documentFingerprint || existing.has(asset.id)
      || staged.some(item => item.id === asset.id) || !/^data:image\/(png|jpeg);base64,/.test(asset.dataUrl)) {
      throw new Error('Writer editor asset is foreign, duplicated or unsupported.');
    }
    const same = [...existing.values(), ...staged].find(item => item.documentFingerprint === target.documentFingerprint && item.dataUrl === asset.dataUrl);
    if (same) referenced.add(same.id);
    else { staged.push(asset); referenced.add(asset.id); }
  }
  for (const source of sources) {
    const asset = [...existing.values(), ...staged].find(item => item.documentFingerprint === target.documentFingerprint && item.dataUrl === source);
    if (asset) referenced.add(asset.id);
    else if (!originalSources.has(source)) throw new Error('New inline image has no admitted Writer asset.');
  }
  if ([...state.assetRecords, ...staged].reduce((sum, asset) => sum + asset.dataUrl.length, 0) > WRITER_IMAGE_ADMISSION_LIMITS.maxAggregateAssetBytes) throw new Error('Writer image asset limit exceeded.');
  const assetIds = [...referenced];
  if (target.editorStateJson === payload.editorStateJson && target.plainText === payload.plainText
    && JSON.stringify(target.assetIds ?? []) === JSON.stringify(assetIds)) return { accepted: true, reason: 'No editor changes.' };
  const result = await useWriterV2Store.getState().dispatchWriterCommandDurableLatest(() => {
    if (!isRichEditorOwnerCurrent(owner) || !isWriterPersistenceOwnerCurrent(snapshot)) return null;
    return { type: 'UPDATE_WRITER_ELEMENT', id: target.id, patch: { editorStateJson: payload.editorStateJson, plainText: payload.plainText, assetIds } };
  }, { stagedAssets: staged });
  return { accepted: result.changed, reason: result.reason };
}
