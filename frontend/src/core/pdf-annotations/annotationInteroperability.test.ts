import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from 'pdf-lib';

import { ANNOTATION_TYPES } from '@/core/annotations/annotationTypes';
import {
  getAllPhase10Fixtures,
  getFixtureMetadata,
  createDeterministicAnnotation,
  createDeterministicReviewThreadFixture,
  PHASE10_SUPPORTED_TYPES,
} from './fixtures/annotationFixtures';
import { withAnnotationReviewStatus } from '@/core/review/annotationReview';
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
      stateModel: null,
      hasReviewRelations: true,
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
    const testTypes = [...PHASE10_SUPPORTED_TYPES];

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

    for (const expected of initialAnnotations) {
      const actual = read1.annotations.find((annotation) => annotation.id === expected.id);
      expect(actual?.type).toBe(expected.type);
    }

    // Save 2 (repeated save)
    const save2 = await writeNativePdfAnnotations(save1.bytes, read1.annotations);
    const read2 = await readNativePdfAnnotations(save2.bytes);
    const integrity2 = AnnotationInteroperabilityOracle.validateRoundTripIntegrity(
      read1.annotations,
      read2.annotations,
    );
    expect(integrity2.valid).toBe(true);

    for (const expected of initialAnnotations) {
      const actual = read2.annotations.find((annotation) => annotation.id === expected.id);
      expect(actual?.type).toBe(expected.type);
    }

    // Verify /NM uniqueness in raw PDF
    const doc = await PDFDocument.load(save2.bytes);
    const page = doc.getPage(0);
    const annotsArray = page.node.lookup(PDFName.of('Annots')) as any;
    expect(annotsArray.size()).toBe(testTypes.length);
  });

  it('preserves standards-native review graph and identity when private metadata is stripped', async () => {
    const baseBytes = await createEmptyPdf();
    const root = createDeterministicReviewThreadFixture();

    const save1 = await writeNativePdfAnnotations(baseBytes, [root]);
    expect(save1.annotationCount).toBe(1);
    expect(save1.replyCount).toBe(1);

    const externalDoc = await PDFDocument.load(save1.bytes);
    const externalPage = externalDoc.getPage(0);
    const externalAnnots = externalPage.node.lookup(PDFName.of('Annots')) as any;

    expect(externalAnnots.size()).toBe(3);

    let rootRef: PDFRef | null = null;
    let rootDict: any = null;
    let replyRef: PDFRef | null = null;
    let replyDict: any = null;
    let stateRef: PDFRef | null = null;
    let stateDict: any = null;

    for (let index = 0; index < externalAnnots.size(); index += 1) {
      const ref = externalAnnots.get(index);
      const dict = externalAnnots.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
      const stateModel = dict.lookup(PDFName.of('StateModel'))?.decodeText?.();

      if (nm === root.id) {
        rootRef = ref;
        rootDict = dict;
      } else if (stateModel === 'Review') {
        stateRef = ref;
        stateDict = dict;
      } else if (dict.lookup(PDFName.of('RT'))?.decodeText?.() === 'R') {
        replyRef = ref;
        replyDict = dict;
      }
    }

    expect(rootRef).toBeInstanceOf(PDFRef);
    expect(replyRef).toBeInstanceOf(PDFRef);
    expect(stateRef).toBeInstanceOf(PDFRef);
    expect(rootDict.get(PDFName.of('StateModel'))).toBeUndefined();
    expect(rootDict.get(PDFName.of('State'))).toBeUndefined();

    expect(replyDict.get(PDFName.of('IRT'))).toBeInstanceOf(PDFRef);
    expect(replyDict.get(PDFName.of('IRT')).toString()).toBe(rootRef?.toString());
    expect(replyDict.lookup(PDFName.of('NM')).decodeText()).toBe(
      `${root.id}:reply:phase10-review-reply-1`,
    );

    expect(stateDict.get(PDFName.of('IRT'))).toBeInstanceOf(PDFRef);
    expect(stateDict.get(PDFName.of('IRT')).toString()).toBe(rootRef?.toString());
    expect(stateDict.lookup(PDFName.of('StateModel')).decodeText()).toBe('Review');
    expect(stateDict.lookup(PDFName.of('State')).decodeText()).toBe('Completed');

    // Simulate a standards-capable external writer that preserves standard
    // annotation fields but strips every PDF Hub private key.
    for (let index = 0; index < externalAnnots.size(); index += 1) {
      const dict = externalAnnots.lookup(index);
      for (const key of [...dict.keys()]) {
        if (key.decodeText().startsWith('PDFHub')) {
          dict.delete(key);
        }
      }
    }

    rootDict.set(PDFName.of('Contents'), PDFString.of('Externally revised review text'));
    stateDict.set(PDFName.of('State'), PDFString.of('Rejected'));

    const externallyEdited = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallyEdited);

    expect(returned.annotations).toHaveLength(1);
    expect(returned.annotations[0].id).toBe(root.id);
    expect(returned.annotations[0].type).toBe('comment');
    expect(returned.annotations[0].data.text).toBe('Externally revised review text');
    expect(returned.annotations[0].data.review?.status).toBe('rejected');
    expect(returned.annotations[0].data.review?.replies).toHaveLength(1);
    expect(returned.annotations[0].data.review?.replies[0].id).toBe(
      'phase10-review-reply-1',
    );

    const save2 = await writeNativePdfAnnotations(externallyEdited, returned.annotations);
    const read2 = await readNativePdfAnnotations(save2.bytes);

    expect(read2.annotations).toHaveLength(1);
    expect(read2.annotations[0].id).toBe(root.id);
    expect(read2.annotations[0].type).toBe('comment');
    expect(read2.annotations[0].data.text).toBe('Externally revised review text');
    expect(read2.annotations[0].data.review?.status).toBe('rejected');
    expect(read2.annotations[0].data.review?.replies).toHaveLength(1);
    expect(read2.annotations[0].data.review?.replies[0].id).toBe(
      'phase10-review-reply-1',
    );

    const doc2 = await PDFDocument.load(save2.bytes);
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots2.size()).toBe(3);

    let rootRef2: PDFRef | null = null;
    let replyIrt2: unknown = null;
    let stateIrt2: unknown = null;
    const names: string[] = [];

    for (let index = 0; index < annots2.size(); index += 1) {
      const ref = annots2.get(index);
      const dict = annots2.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
      if (nm) names.push(nm);

      if (nm === root.id) {
        rootRef2 = ref;
        expect(dict.get(PDFName.of('StateModel'))).toBeUndefined();
        expect(dict.get(PDFName.of('State'))).toBeUndefined();
      }

      if (nm === `${root.id}:reply:phase10-review-reply-1`) {
        replyIrt2 = dict.get(PDFName.of('IRT'));
      }

      if (nm === `${root.id}:state:Review`) {
        stateIrt2 = dict.get(PDFName.of('IRT'));
        expect(dict.lookup(PDFName.of('State')).decodeText()).toBe('Rejected');
      }
    }

    expect(new Set(names).size).toBe(3);
    expect(rootRef2).toBeInstanceOf(PDFRef);
    expect(replyIrt2).toBeInstanceOf(PDFRef);
    expect(stateIrt2).toBeInstanceOf(PDFRef);
    expect((replyIrt2 as PDFRef).toString()).toBe(rootRef2?.toString());
    expect((stateIrt2 as PDFRef).toString()).toBe(rootRef2?.toString());

    // A further no-op save must converge rather than prefix identities again
    // or accumulate additional reply/state objects.
    const save3 = await writeNativePdfAnnotations(save2.bytes, read2.annotations);
    const read3 = await readNativePdfAnnotations(save3.bytes);
    expect(read3.annotations[0].data.review?.replies?.[0]?.id).toBe(
      'phase10-review-reply-1',
    );

    const doc3 = await PDFDocument.load(save3.bytes);
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots3.size()).toBe(3);
  });

  it('preserves legacy chained review-state history but emits new states against the original annotation', async () => {
    const baseBytes = await createEmptyPdf();
    const root = createDeterministicReviewThreadFixture();

    const save1 = await writeNativePdfAnnotations(baseBytes, [root]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as any;

    let rootRef: PDFRef | null = null;
    let firstStateRef: PDFRef | null = null;

    for (let index = 0; index < annots.size(); index += 1) {
      const ref = annots.get(index);
      const dict = annots.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
      const stateModel = dict.lookup(PDFName.of('StateModel'))?.decodeText?.();

      if (nm === root.id) rootRef = ref;
      if (stateModel === 'Review') firstStateRef = ref;
    }

    expect(rootRef).toBeInstanceOf(PDFRef);
    expect(firstStateRef).toBeInstanceOf(PDFRef);

    const secondStateRef = externalDoc.context.register(
      externalDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [50, 700, 68, 718],
        T: PDFString.of('Lead Reviewer'),
        NM: PDFString.of('external-review-state-2'),
        M: PDFString.of('D:20231114221400Z'),
        CreationDate: PDFString.of('D:20231114221400Z'),
        IRT: firstStateRef,
        StateModel: PDFString.of('Review'),
        State: PDFString.of('Rejected'),
      }),
    );
    annots.push(secondStateRef);

    const externallyEdited = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallyEdited);
    expect(returned.annotations[0].data.review?.status).toBe('rejected');
    expect(returned.annotations[0].data.review?.statusAuthor).toBe('Lead Reviewer');

    // No PDF Hub semantic change: preserve both native state transitions exactly
    // rather than collapsing the external history to one state object.
    const save2 = await writeNativePdfAnnotations(externallyEdited, returned.annotations);
    const doc2 = await PDFDocument.load(save2.bytes);
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots2.size()).toBe(4);

    let rootRef2: PDFRef | null = null;
    let firstStateRef2: PDFRef | null = null;
    let secondStateRef2: PDFRef | null = null;

    for (let index = 0; index < annots2.size(); index += 1) {
      const ref = annots2.get(index);
      const dict = annots2.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
      if (nm === root.id) rootRef2 = ref;
      if (nm === `${root.id}:state:Review`) firstStateRef2 = ref;
      if (nm === 'external-review-state-2') secondStateRef2 = ref;
    }

    expect(rootRef2).toBeInstanceOf(PDFRef);
    expect(firstStateRef2).toBeInstanceOf(PDFRef);
    expect(secondStateRef2).toBeInstanceOf(PDFRef);

    const firstStateDict2 = annots2.lookup(
      [...Array(annots2.size()).keys()].find(
        (index) => annots2.get(index).toString() === firstStateRef2?.toString(),
      ),
    );
    const secondStateDict2 = annots2.lookup(
      [...Array(annots2.size()).keys()].find(
        (index) => annots2.get(index).toString() === secondStateRef2?.toString(),
      ),
    );

    expect(firstStateDict2.get(PDFName.of('IRT')).toString()).toBe(rootRef2?.toString());
    expect(secondStateDict2.get(PDFName.of('IRT')).toString()).toBe(firstStateRef2?.toString());
    expect(secondStateDict2.lookup(PDFName.of('State')).decodeText()).toBe('Rejected');

    // PDF Hub's first status change by Current User follows the current ISO
    // contract: direct /IRT to the original review root, with distinct actor provenance.
    const currentUserResolved = withAnnotationReviewStatus(
      returned.annotations[0],
      'resolved',
      1_700_000_500_000,
    );

    const save3 = await writeNativePdfAnnotations(save2.bytes, [currentUserResolved]);
    const read3 = await readNativePdfAnnotations(save3.bytes);
    expect(read3.annotations[0].data.review?.status).toBe('resolved');
    expect(read3.annotations[0].data.review?.statusAuthor).toBe('Current User');

    const doc3 = await PDFDocument.load(save3.bytes);
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots3.size()).toBe(5);

    let currentUserStateRef: PDFRef | null = null;
    for (let index = 0; index < annots3.size(); index += 1) {
      const ref = annots3.get(index);
      const dict = annots3.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
      if (nm === `${root.id}:state:Review:2`) {
        currentUserStateRef = ref;
        expect(dict.get(PDFName.of('IRT')).toString()).toBe(rootRef2?.toString());
        expect(dict.lookup(PDFName.of('T')).decodeText()).toBe('Current User');
        expect(dict.lookup(PDFName.of('StateModel')).decodeText()).toBe('Review');
        expect(dict.lookup(PDFName.of('State')).decodeText()).toBe('Completed');
      }
    }
    expect(currentUserStateRef).toBeInstanceOf(PDFRef);

    // A second status change by the same Current User must also point directly
    // to the original review root; PDF Hub does not emit the older state-to-state form.
    const currentUserOpen = withAnnotationReviewStatus(
      read3.annotations[0],
      'open',
      1_700_000_600_000,
    );
    const save4 = await writeNativePdfAnnotations(save3.bytes, [currentUserOpen]);
    const read4 = await readNativePdfAnnotations(save4.bytes);
    expect(read4.annotations[0].data.review?.status).toBe('open');
    expect(read4.annotations[0].data.review?.statusAuthor).toBe('Current User');

    const doc4 = await PDFDocument.load(save4.bytes);
    const annots4 = doc4.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots4.size()).toBe(6);

    let secondCurrentUserStateRef: PDFRef | null = null;
    for (let index = 0; index < annots4.size(); index += 1) {
      const ref = annots4.get(index);
      const dict = annots4.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
      if (nm === `${root.id}:state:Review:3`) {
        secondCurrentUserStateRef = ref;
        expect(dict.get(PDFName.of('IRT')).toString()).toBe(rootRef2?.toString());
        expect(dict.lookup(PDFName.of('T')).decodeText()).toBe('Current User');
        expect(dict.lookup(PDFName.of('State')).decodeText()).toBe('None');
      }
    }
    expect(secondCurrentUserStateRef).toBeInstanceOf(PDFRef);

    const save5 = await writeNativePdfAnnotations(save4.bytes, read4.annotations);
    const doc5 = await PDFDocument.load(save5.bytes);
    const annots5 = doc5.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots5.size()).toBe(6);
  });

  it('preserves nested reply topology and reply-attached state without projecting it onto the root', async () => {
    const baseBytes = await createEmptyPdf();
    const root = createDeterministicReviewThreadFixture();

    const save1 = await writeNativePdfAnnotations(baseBytes, [root]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as any;

    let rootRef: PDFRef | null = null;
    let firstReplyRef: PDFRef | null = null;

    for (let index = 0; index < annots.size(); index += 1) {
      const ref = annots.get(index);
      const dict = annots.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
      if (nm === root.id) rootRef = ref;
      if (nm === `${root.id}:reply:phase10-review-reply-1`) {
        firstReplyRef = ref;
      }
    }

    expect(rootRef).toBeInstanceOf(PDFRef);
    expect(firstReplyRef).toBeInstanceOf(PDFRef);

    const nestedReplyRef = externalDoc.context.register(
      externalDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [70, 680, 88, 698],
        T: PDFString.of('Nested Reviewer'),
        Contents: PDFString.of('Nested external reply'),
        Subj: PDFString.of('External nested subject'),
        VendorReplyMeta: PDFString.of('preserve-nested'),
        NM: PDFString.of('external-nested-reply'),
        M: PDFString.of('D:20231114221500Z'),
        CreationDate: PDFString.of('D:20231114221500Z'),
        IRT: firstReplyRef,
        RT: 'R',
      }),
    );
    annots.push(nestedReplyRef);

    const nestedStateRef = externalDoc.context.register(
      externalDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [70, 660, 88, 678],
        T: PDFString.of('Nested Reviewer'),
        NM: PDFString.of('external-nested-reply-state'),
        M: PDFString.of('D:20231114221600Z'),
        CreationDate: PDFString.of('D:20231114221600Z'),
        IRT: nestedReplyRef,
        StateModel: PDFString.of('Review'),
        State: PDFString.of('Rejected'),
      }),
    );
    annots.push(nestedStateRef);

    const externallyEdited = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallyEdited);

    expect(returned.annotations).toHaveLength(1);
    expect(returned.annotations[0].data.review?.status).toBe('resolved');
    expect(returned.annotations[0].data.review?.replies).toHaveLength(2);

    const nestedReply = returned.annotations[0].data.review?.replies.find(
      (reply) => reply.id === 'external-nested-reply',
    );
    expect(nestedReply?.parentReplyId).toBe('phase10-review-reply-1');
    expect(nestedReply?.content).toBe('Nested external reply');

    const save2 = await writeNativePdfAnnotations(externallyEdited, returned.annotations);
    const read2 = await readNativePdfAnnotations(save2.bytes);

    expect(read2.annotations[0].data.review?.status).toBe('resolved');
    const nestedReply2 = read2.annotations[0].data.review?.replies.find(
      (reply) => reply.id === 'external-nested-reply',
    );
    expect(nestedReply2?.parentReplyId).toBe('phase10-review-reply-1');

    const doc2 = await PDFDocument.load(save2.bytes);
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots2.size()).toBe(5);

    let rootRef2: PDFRef | null = null;
    let firstReplyRef2: PDFRef | null = null;
    let nestedReplyRef2: PDFRef | null = null;
    let rootStateIrt: unknown = null;
    let nestedStateIrt: unknown = null;

    for (let index = 0; index < annots2.size(); index += 1) {
      const ref = annots2.get(index);
      const dict = annots2.lookup(index);
      const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();

      if (nm === root.id) rootRef2 = ref;
      if (nm === `${root.id}:reply:phase10-review-reply-1`) {
        firstReplyRef2 = ref;
      }
      if (nm === `${root.id}:reply:external-nested-reply`) {
        nestedReplyRef2 = ref;
        expect(dict.get(PDFName.of('IRT')).toString()).toBe(firstReplyRef2?.toString());
        expect(dict.lookup(PDFName.of('Subj')).decodeText()).toBe('External nested subject');
        expect(dict.lookup(PDFName.of('VendorReplyMeta')).decodeText()).toBe('preserve-nested');
        expect(dict.lookup(PDFName.of('Rect')).toString()).toBe('[ 70 680 88 698 ]');
      }
      if (nm === `${root.id}:state:Review`) {
        rootStateIrt = dict.get(PDFName.of('IRT'));
      }
      if (nm === 'external-nested-reply-state') {
        nestedStateIrt = dict.get(PDFName.of('IRT'));
        expect(dict.lookup(PDFName.of('State')).decodeText()).toBe('Rejected');
      }
    }

    expect(rootRef2).toBeInstanceOf(PDFRef);
    expect(firstReplyRef2).toBeInstanceOf(PDFRef);
    expect(nestedReplyRef2).toBeInstanceOf(PDFRef);
    expect((rootStateIrt as PDFRef).toString()).toBe(rootRef2?.toString());
    expect((nestedStateIrt as PDFRef).toString()).toBe(nestedReplyRef2?.toString());

    const save3 = await writeNativePdfAnnotations(save2.bytes, read2.annotations);
    const read3 = await readNativePdfAnnotations(save3.bytes);
    const nestedReply3 = read3.annotations[0].data.review?.replies.find(
      (reply) => reply.id === 'external-nested-reply',
    );
    expect(nestedReply3?.parentReplyId).toBe('phase10-review-reply-1');
    expect(read3.annotations[0].data.review?.status).toBe('resolved');

    const doc3 = await PDFDocument.load(save3.bytes);
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    expect(annots3.size()).toBe(5);
  });

  it('preserves passive external dictionary fields, popup backlinks, and only drops stale /AP after a local appearance edit', async () => {
    const baseBytes = await createEmptyPdf();
    const textbox = createDeterministicAnnotation('textbox', {
      id: 'phase10-passive-root-1',
      data: {
        text: 'Passive field baseline',
        fontSize: 14,
        borderColor: '#2563eb',
        backgroundColor: '#eff6ff',
      },
    });

    const save1 = await writeNativePdfAnnotations(baseBytes, [textbox]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const externalAnnots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as any;
    const oldRootRef = externalAnnots.get(0) as PDFRef;
    const rootDict = externalAnnots.lookup(0) as PDFDict;

    rootDict.set(PDFName.of('Subj'), PDFString.of('External subject'));
    rootDict.set(PDFName.of('RC'), PDFString.of('<p>External rich text</p>'));
    rootDict.set(PDFName.of('VendorInteropMeta'), PDFString.of('keep-me'));

    const appearanceStream = externalDoc.context.flateStream(
      'q 0 0 10 10 re S Q',
      {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 10, 10],
        Resources: {},
      },
    );
    const appearanceRef = externalDoc.context.register(appearanceStream);
    rootDict.set(
      PDFName.of('AP'),
      externalDoc.context.obj({ N: appearanceRef }),
    );

    const popupDict = externalDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Popup',
      Rect: [220, 620, 420, 760],
      Parent: oldRootRef,
      Open: false,
    }) as PDFDict;
    const popupRef = externalDoc.context.register(popupDict);
    externalAnnots.push(popupRef);
    rootDict.set(PDFName.of('Popup'), popupRef);

    const externallySaved = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallySaved);
    const save2 = await writeNativePdfAnnotations(externallySaved, returned.annotations);

    const findManagedRoot = (
      doc: PDFDocument,
    ): { ref: PDFRef; dict: PDFDict; annots: any } => {
      const annots = doc.getPage(0).node.lookup(PDFName.of('Annots')) as any;
      for (let index = 0; index < annots.size(); index += 1) {
        const ref = annots.get(index);
        const dict = annots.lookup(index) as PDFDict;
        const nm = dict.lookup(PDFName.of('NM'))?.decodeText?.();
        if (nm === 'phase10-passive-root-1') {
          expect(ref).toBeInstanceOf(PDFRef);
          return { ref, dict, annots };
        }
      }
      throw new Error('Managed passive-field root not found');
    };

    const doc2 = await PDFDocument.load(save2.bytes);
    const managed2 = findManagedRoot(doc2);
    const root2 = managed2.dict;

    expect(managed2.annots.size()).toBe(2);
    expect(root2.lookup(PDFName.of('Subj')).decodeText()).toBe('External subject');
    expect(root2.lookup(PDFName.of('RC')).decodeText()).toBe('<p>External rich text</p>');
    expect(root2.lookup(PDFName.of('VendorInteropMeta')).decodeText()).toBe('keep-me');
    expect(root2.lookup(PDFName.of('AP'))).toBeInstanceOf(PDFDict);
    expect(root2.get(PDFName.of('Popup'))).toBeInstanceOf(PDFRef);

    const popup2 = doc2.context.lookup(root2.get(PDFName.of('Popup')) as PDFRef, PDFDict);
    expect(popup2.get(PDFName.of('Parent'))).toBeInstanceOf(PDFRef);
    expect((popup2.get(PDFName.of('Parent')) as PDFRef).toString()).toBe(
      managed2.ref.toString(),
    );

    const locallyEdited = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        text: 'Locally edited after external appearance generation',
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };

    const save3 = await writeNativePdfAnnotations(save2.bytes, [locallyEdited]);
    const doc3 = await PDFDocument.load(save3.bytes);
    const managed3 = findManagedRoot(doc3);
    const root3 = managed3.dict;

    expect(managed3.annots.size()).toBe(2);
    expect(root3.lookup(PDFName.of('Subj')).decodeText()).toBe('External subject');
    expect(root3.lookup(PDFName.of('RC')).decodeText()).toBe('<p>External rich text</p>');
    expect(root3.lookup(PDFName.of('VendorInteropMeta')).decodeText()).toBe('keep-me');
    expect(root3.get(PDFName.of('AP'))).toBeUndefined();
    expect(root3.lookup(PDFName.of('Contents')).decodeText()).toBe(
      'Locally edited after external appearance generation',
    );

    const popup3 = doc3.context.lookup(root3.get(PDFName.of('Popup')) as PDFRef, PDFDict);
    expect((popup3.get(PDFName.of('Parent')) as PDFRef).toString()).toBe(
      managed3.ref.toString(),
    );
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
