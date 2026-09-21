import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';

import { ANNOTATION_TYPES, type AnnotationType } from '@/core/annotations/annotationTypes';
import {
  getAllPhase10Fixtures,
  getFixtureMetadata,
  createDeterministicAnnotation,
  PHASE10_SUPPORTED_TYPES,
} from './fixtures/annotationFixtures';
import { AnnotationInteroperabilityOracle } from './annotationInteroperabilityOracle';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { readNativePdfAnnotations } from './nativeAnnotationReader';

async function createEmptyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  return new Uint8Array(await doc.save());
}

describe('TEST-10-01: Native Annotation Interoperability Fixtures & Semantic Oracle', () => {
  it('defines deterministic fixtures for all 17 supported annotation types with explicit /AP expectations', () => {
    expect(PHASE10_SUPPORTED_TYPES).toHaveLength(17);
    expect(ANNOTATION_TYPES).toEqual(PHASE10_SUPPORTED_TYPES);

    const fixtures = getAllPhase10Fixtures();
    expect(fixtures).toHaveLength(17);

    for (const type of ANNOTATION_TYPES) {
      const meta = getFixtureMetadata(type);
      expect(meta.type).toBe(type);
      expect(meta.pdfSubtype).toBeTruthy();
      expect(meta.standardPdfFields.length).toBeGreaterThan(0);
      expect(meta.appearanceStreamRequired).toBe(true);

      const sample = createDeterministicAnnotation(type);
      expect(sample.id).toBe(`phase10-fixture-${type}-1`);
      expect(sample.type).toBe(type);
      expect(sample.rect.width).toBeGreaterThan(0);
      expect(sample.rect.height).toBeGreaterThan(0);
    }
  });

  it('disambiguates shared PDF subtypes accurately via semantic oracle rules', () => {
    // 1. FreeText: textbox vs callout
    const textboxRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'FreeText',
      intent: null,
      calloutLine: null,
    });
    expect(textboxRes.resolvedType).toBe('textbox');

    const calloutRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'FreeText',
      intent: 'FreeTextCallout',
      calloutLine: [10, 20, 30, 40],
    });
    expect(calloutRes.resolvedType).toBe('callout');

    // 2. Text: comment vs sticky-note
    const stickyRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'Text',
      open: true,
      stateModel: null,
    });
    expect(stickyRes.resolvedType).toBe('sticky-note');

    const commentRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'Text',
      open: false,
      stateModel: 'Review',
    });
    expect(commentRes.resolvedType).toBe('comment');

    // 3. Square: shape-rect vs shape-cloud vs redaction
    const rectRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'Square',
      borderEffect: null,
    });
    expect(rectRes.resolvedType).toBe('shape-rect');

    const cloudRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'Square',
      borderEffect: { style: 'C', intensity: 1 },
    });
    expect(cloudRes.resolvedType).toBe('shape-cloud');

    const redactionRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'Square',
      customType: 'redaction',
    });
    expect(redactionRes.resolvedType).toBe('redaction');

    // 4. Line: line vs arrow
    const lineRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'Line',
      lineEndings: ['None', 'None'],
    });
    expect(lineRes.resolvedType).toBe('line');

    const arrowRes = AnnotationInteroperabilityOracle.resolveSubtypeAmbiguity({
      subtype: 'Line',
      lineEndings: ['None', 'OpenArrow'],
    });
    expect(arrowRes.resolvedType).toBe('arrow');
  });

  it('proves two-save native round-trip maintains /NM identity without duplicates', async () => {
    const baseBytes = await createEmptyPdf();
    const testTypes: AnnotationType[] = [
      'textbox',
      'callout',
      'sticky-note',
      'highlight',
      'shape-rect',
      'line',
      'comment',
      'redaction',
    ];

    const initialAnnotations = testTypes.map((type, idx) =>
      createDeterministicAnnotation(type, {
        id: `stable-annot-${idx + 1}`,
      }),
    );

    // Save 1
    const save1 = await writeNativePdfAnnotations(baseBytes, initialAnnotations);
    expect(save1.annotationCount).toBe(testTypes.length);

    // Reopen 1
    const read1 = await readNativePdfAnnotations(save1.bytes);
    const integrity1 = AnnotationInteroperabilityOracle.validateRoundTripIntegrity(
      initialAnnotations,
      read1.annotations,
    );
    expect(integrity1.valid).toBe(true);

    // Save 2 (repeated save)
    const save2 = await writeNativePdfAnnotations(save1.bytes, read1.annotations);
    const read2 = await readNativePdfAnnotations(save2.bytes);
    const integrity2 = AnnotationInteroperabilityOracle.validateRoundTripIntegrity(
      read1.annotations,
      read2.annotations,
    );
    expect(integrity2.valid).toBe(true);

    // Verify /NM uniqueness in raw PDF
    const doc = await PDFDocument.load(save2.bytes);
    const page = doc.getPage(0);
    const annotsArray = page.node.lookup(PDFName.of('Annots')) as any;
    expect(annotsArray.size()).toBe(testTypes.length);
  });

  it('enforces external-edit precedence: standard fields override stale custom data', () => {
    const standardFields = {
      Contents: 'Externally edited comment text in Adobe Acrobat',
      C: '#10b981',
    };
    const staleCustomData = {
      text: 'Old stale text from initial authoring',
      borderColor: '#3b82f6',
      customFlag: 'preserved',
    };

    const reconciled = AnnotationInteroperabilityOracle.reconcileExternalEdits(
      standardFields,
      staleCustomData,
    );

    expect(reconciled.text).toBe('Externally edited comment text in Adobe Acrobat');
    expect(reconciled.borderColor).toBe('#10b981');
    expect(reconciled.customFlag).toBe('preserved');
  });

  it('guarantees Save/Save As preserve editable native annotations and never perform hidden flattening', async () => {
    const baseBytes = await createEmptyPdf();
    const annot = createDeterministicAnnotation('textbox', {
      id: 'editable-check-1',
      data: { text: 'Must remain editable' },
    });

    const saved = await writeNativePdfAnnotations(baseBytes, [annot]);
    const doc = await PDFDocument.load(saved.bytes);
    const page = doc.getPage(0);
    const annots = page.node.lookup(PDFName.of('Annots')) as any;

    expect(annots).toBeTruthy();
    expect(annots.size()).toBe(1);

    const reloaded = await readNativePdfAnnotations(saved.bytes);
    expect(reloaded.importedCount).toBe(1);
    expect(reloaded.annotations[0].id).toBe('editable-check-1');
  });

  it('confirms redaction visual mask is serialized as Square, never PDF Redact', async () => {
    const baseBytes = await createEmptyPdf();
    const mask = createDeterministicAnnotation('redaction', { id: 'mask-redaction-1' });

    const saved = await writeNativePdfAnnotations(baseBytes, [mask]);
    const doc = await PDFDocument.load(saved.bytes);
    const page = doc.getPage(0);
    const annots = page.node.lookup(PDFName.of('Annots')) as any;
    const dict = annots.lookup(0);
    const subtype = dict.lookup(PDFName.of('Subtype')).decodeText();

    expect(subtype).toBe('Square');
    expect(subtype).not.toBe('Redact');
  });
});
