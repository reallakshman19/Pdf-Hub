import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import {
  nativeAnnotationIdentity,
  summarizeNativeAnnotationCoverage,
} from './nativeCoverageAudit';

const native = (id: string, ref: string): PdfAnnotation => ({
  id,
  pageNumber: 1,
  type: 'textbox',
  rect: { x: 20, y: 40, width: 100, height: 30 },
  data: { text: id, nativeSourceRef: ref },
  createdAt: 1,
  updatedAt: 1,
});

describe('native source → parser → IndexedDB/model coverage', () => {
  it('reports malformed supported roots instead of treating them as intentional deletions', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([300, 400]);
    const valid = pdf.context.register(pdf.context.obj({
      Type: 'Annot', Subtype: 'FreeText', Rect: [20, 300, 120, 330],
      Contents: PDFString.of('Valid'), NM: PDFString.of('valid'),
    }));
    const malformed = pdf.context.register(pdf.context.obj({
      Type: 'Annot', Subtype: 'FreeText',
      Contents: PDFString.of('Missing rectangle'), NM: PDFString.of('missing-rect'),
    }));
    const link = pdf.context.register(pdf.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [20, 20, 80, 40],
    }));
    const popup = pdf.context.register(pdf.context.obj({
      Type: 'Annot', Subtype: 'Popup', Rect: [20, 20, 80, 40],
    }));
    page.node.set(PDFName.of('Annots'),
      pdf.context.obj([valid, malformed, link, popup]));
    const read = await readNativePdfAnnotations(await pdf.save());
    expect(read.annotations).toHaveLength(1);
    expect(read.sourceRoots).toHaveLength(3); // Popup is not a root.
    const report = summarizeNativeAnnotationCoverage(
      read.sourceRoots ?? [], read.annotations, read.annotations, null,
    );
    expect(report.sourceCount).toBe(2); // 2 supported FreeText roots.
    expect(report.parsedCount).toBe(1);
    expect(report.missingFromParser).toEqual([
      JSON.stringify([1, malformed.toString()]),
    ]);
    expect(report.excludedRoots).toContain(JSON.stringify([1, link.toString()]));
    expect(report.missingFromModel).toEqual([]);
  });

  it('identifies a missing hydrated native object by indirect PDF ref', () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    const report = summarizeNativeAnnotationCoverage(
      [], [a, b], [a], null,
    );
    expect(report.sourceCount).toBe(2);
    expect(report.missingFromModel).toEqual([nativeAnnotationIdentity(b)]);
    expect(report.intentionalDeletions).toBe(0);
  });

  it('does not misdiagnose an intentional IndexedDB tombstone', () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    const report = summarizeNativeAnnotationCoverage(
      [], [a, b], [a], [nativeAnnotationIdentity(a), nativeAnnotationIdentity(b)],
    );
    expect(report.missingFromModel).toEqual([]);
    expect(report.intentionalDeletions).toBe(1);
  });

  it('never counts a copied overlay as the original source object', () => {
    const original = native('a', '10 0 R');
    const copy = {
      ...native('copy', '10 0 R'),
      data: {
        nativeSourceRef: '10 0 R',
        nativeCopySource: { pageNumber: 1, nativeName: 'a' },
      },
    } satisfies PdfAnnotation;
    const report = summarizeNativeAnnotationCoverage(
      [], [original], [copy], null,
    );
    expect(report.missingFromModel).toEqual([nativeAnnotationIdentity(original)]);
    expect(report.duplicateInModel).toEqual([]);
  });

  it('flags duplicate hydrated native source identities despite equal counts', () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    const duplicate = { ...a, id: 'duplicate-sidecar-id' };
    const report = summarizeNativeAnnotationCoverage(
      [], [a, b], [a, duplicate], null,
    );
    expect(report.modelCount).toBe(report.parsedCount);
    expect(report.missingFromModel).toEqual([nativeAnnotationIdentity(b)]);
    expect(report.duplicateInModel).toEqual([nativeAnnotationIdentity(a)]);
  });
});
