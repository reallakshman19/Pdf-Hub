import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import type { PdfAnnotation } from '@/core/annotations/types';
import { withNativeEditProvenance } from '@/core/annotations/nativeIntegrity';

async function authorize(bytes: Uint8Array, deleted: PdfAnnotation[]) {
  const sourceRevision = await FileAdapter.hashBytes(bytes);
  return {
    replaceManagedAnnotations: true,
    nativeDeletionAuthorization: {
      sourceRevision,
      sourcePageIds: ['source-page-1'],
      tombstones: deleted.map((item) => ({
        sourceRevision,
        sourceRef: item.data.nativeSourceRef!,
        sourceName: item.data.nativeOriginalName ?? item.id,
        pageNumber: item.pageNumber,
        pageId: 'source-page-1',
        commandId: 'explicit-native-delete',
      })),
      // The production caller obtains these IDs only by walking the actual
      // before/after annotation history. This isolated writer fixture models
      // the receipt, not the history verifier.
      verifiedCommandIds: ['explicit-native-delete'],
    },
  };
}

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 30 20 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 30, 20], Resources: {},
  }));
  const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [100, 100, 150, 140], P: page.ref });
  const popupRef = doc.context.register(popup);
  const stamp = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', NM: PDFString.of('named'), Rect: [20, 30, 50, 50], P: page.ref, Popup: popupRef, AP: { N: ap } }));
  popup.set(PDFName.of('Parent'), stamp);
  const unnamed = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [70, 30, 100, 50], P: page.ref, AP: { N: ap } }));
  const link = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [110, 30, 150, 50], P: page.ref }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([stamp, popupRef, unnamed, link]));
  return doc.save();
}

async function types(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const array = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  return Array.from({ length: array.size() }, (_, index) => array.lookup(index, PDFDict).get(PDFName.of('Subtype'))?.toString()).sort();
}

describe('managed native annotation deletion', () => {
  it('removes an explicitly deleted stamp and its popup while preserving a different and an unsupported annotation', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const deleted = loaded.filter((a) => a.id === 'named');
    const output = await writeNativePdfAnnotations(
      bytes, loaded.filter((a) => a.id !== 'named'), await authorize(bytes, deleted),
    );
    expect(await types(output.bytes)).toEqual(['/Link', '/Stamp']);
    expect((await readNativePdfAnnotations(output.bytes)).annotations).toHaveLength(1);
  });

  it('handles deletion of the last managed annotation without removing unsupported objects', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const output = await writeNativePdfAnnotations(bytes, [], await authorize(bytes, loaded));
    expect(await types(output.bytes)).toEqual(['/Link']);
  });


  it('refuses to delete an annotation missing from a corrupted cache with no command', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    await expect(writeNativePdfAnnotations(
      bytes, loaded.filter((item) => item.id !== 'named'),
      { replaceManagedAnnotations: true },
    )).rejects.toThrow('explicit deletion command');
    expect(await types(bytes)).toEqual(['/Link', '/Popup', '/Stamp', '/Stamp']);
  });

  it('rejects a well-formed forged sidecar tombstone with no matching user command receipt', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const options = await authorize(bytes, loaded.filter((item) => item.id === 'named'));
    options.nativeDeletionAuthorization.verifiedCommandIds = [];
    await expect(writeNativePdfAnnotations(
      bytes, loaded.filter((item) => item.id !== 'named'), options,
    )).rejects.toThrow(/verified user deletion command/);
  });

  it('rejects a source revision mismatch even with an otherwise valid deletion command', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const options = await authorize(bytes, loaded.filter((item) => item.id === 'named'));
    options.nativeDeletionAuthorization.sourceRevision = 'sha256:different-input';
    await expect(writeNativePdfAnnotations(
      bytes, loaded.filter((item) => item.id !== 'named'), options,
    )).rejects.toThrow('different PDF revision');
  });

  it('rejects a parser omission in the source PDF rather than silently losing it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 400]);
    const valid = doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Text', Rect: [10, 30, 30, 50],
      NM: PDFString.of('valid'),
    }));
    const broken = doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'FreeText', Contents: PDFString.of('No rectangle'),
    }));
    page.node.set(PDFName.of('Annots'), doc.context.obj([valid, broken]));
    const bytes = await doc.save();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    await expect(writeNativePdfAnnotations(
      bytes, loaded, { replaceManagedAnnotations: true },
    )).rejects.toThrow('not imported');
  });

  it('rejects two model records that both claim the same native object', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const extra = { ...loaded[0], id: 'claim-same-source' };
    await expect(writeNativePdfAnnotations(
      bytes, [...loaded, extra], { replaceManagedAnnotations: true },
    )).rejects.toThrow('duplicate native source identities');
  });

  it('rejects direct source stamp mutation with no recorded user edit provenance', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const original = loaded.find((item) => item.id !== 'named')!;
    const forged = { ...original, rect: { ...original.rect, x: original.rect.x + 10 } };
    await expect(writeNativePdfAnnotations(bytes, loaded.map((item) =>
      item.id === original.id ? forged : item), { replaceManagedAnnotations: true }))
      .rejects.toThrow(/without user provenance for: rect/);
  });

  it('edits an unnamed native stamp without leaving a second original behind', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const unnamed = loaded.find((a) => a.id !== 'named')!;
    const edited = withNativeEditProvenance(
      unnamed,
      { ...unnamed, rect: { ...unnamed.rect, x: unnamed.rect.x + 10 } },
      await FileAdapter.hashBytes(bytes),
      'user-move-unnamed-stamp',
    );
    const output = await writeNativePdfAnnotations(bytes, loaded.map((item) =>
      item.id === unnamed.id ? edited : item), { replaceManagedAnnotations: true });
    expect(await types(output.bytes)).toEqual(['/Link', '/Popup', '/Stamp', '/Stamp']);
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations;
    expect(reopened.find((a) => a.id === unnamed.id)?.rect.x).toBe(edited.rect.x);
  });
});
