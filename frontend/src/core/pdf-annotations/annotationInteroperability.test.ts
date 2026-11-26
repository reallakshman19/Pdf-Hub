import { describe, expect, it } from 'vitest';
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFObject } from 'pdf-lib';

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

// Native text entries may be literal strings, hex strings or PDF names.
// Required lookups fail explicitly; optional lookups retain missing-value semantics.
interface TestPdfNode extends PDFObject {
  size(): number;
  get(keyOrIndex: PDFName | number): TestPdfNode & PDFRef;
  lookup(keyOrIndex: PDFName | number): TestPdfNode;
  lookup<T extends PDFObject>(keyOrIndex: PDFName | number, type: { prototype: T }): T;
  lookupMaybe<T extends PDFObject>(keyOrIndex: PDFName | number, type: { prototype: T }): T | undefined;
  keys(): Iterable<PDFName>;
  delete(key: PDFName): boolean;
  set(key: PDFName, value: PDFObject): void;
  push(value: PDFObject): void;
}

function optionalPdfText(value: PDFObject | undefined): string | undefined {
  return value instanceof PDFString || value instanceof PDFHexString || value instanceof PDFName
    ? value.decodeText() : undefined;
}

function requiredPdfText(value: PDFObject | undefined): string {
  const text = optionalPdfText(value);
  if (text === undefined) throw new Error('Expected native PDF text object');
  return text;
}

function requiredPdfNumber(value: PDFObject | undefined): number {
  if (!(value instanceof PDFNumber)) throw new Error('Expected native PDF number');
  return value.asNumber();
}

async function createEmptyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  return new Uint8Array(await doc.save());
}

describe('TEST-10-01: Native Annotation Interoperability Fixtures & Semantic Oracle', () => {
  it('defines deterministic fixtures for all 17 supported annotation types with evidence-gated /AP policy', () => {
    expect(PHASE10_SUPPORTED_TYPES).toHaveLength(17);
    expect(PHASE10_SUPPORTED_TYPES.every((type) => ANNOTATION_TYPES.includes(type))).toBe(true);

    const fixtures = getAllPhase10Fixtures();
    expect(fixtures).toHaveLength(17);

    for (const type of PHASE10_SUPPORTED_TYPES) {
      const meta = getFixtureMetadata(type);
      expect(meta.type).toBe(type);
      expect(meta.pdfSubtype).toBeTruthy();
      expect(meta.standardPdfFields.length).toBeGreaterThan(0);
      expect(meta.appearanceStreamPolicy).toBe('EVIDENCE_GATED');

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

    // Verify every managed root /NM is unique. Review-capable roots may
    // legitimately have additional native state/reply annotations, so raw
    // annotation count is not equal to the 17 application roots.
    const doc = await PDFDocument.load(save2.bytes);
    const page = doc.getPage(0);
    const annotsArray = page.node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const annotationNames: string[] = [];

    for (let index = 0; index < annotsArray.size(); index += 1) {
      const dict = annotsArray.lookup(index) as unknown as TestPdfNode;
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      if (typeof nm === 'string') annotationNames.push(nm);
    }

    expect(new Set(annotationNames).size).toBe(annotationNames.length);
    for (const expected of initialAnnotations) {
      expect(annotationNames.filter((name) => name === expected.id)).toHaveLength(1);
    }
  });

  it('preserves standards-native review graph and identity when private metadata is stripped', async () => {
    const baseBytes = await createEmptyPdf();
    const root = createDeterministicReviewThreadFixture();

    const save1 = await writeNativePdfAnnotations(baseBytes, [root]);
    expect(save1.annotationCount).toBe(1);
    expect(save1.replyCount).toBe(1);

    const externalDoc = await PDFDocument.load(save1.bytes);
    const externalPage = externalDoc.getPage(0);
    const externalAnnots = externalPage.node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;

    expect(externalAnnots.size()).toBe(3);

    let rootRef: PDFRef | null = null;
    let rootDict: TestPdfNode | null = null;
    let replyRef: PDFRef | null = null;
    let replyDict: TestPdfNode | null = null;
    let stateRef: PDFRef | null = null;
    let stateDict: TestPdfNode | null = null;

    for (let index = 0; index < externalAnnots.size(); index += 1) {
      const ref = externalAnnots.get(index);
      const dict = externalAnnots.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      const stateModel = optionalPdfText(dict.lookup(PDFName.of('StateModel')));

      if (nm === root.id) {
        rootRef = ref;
        rootDict = dict;
      } else if (stateModel === 'Review') {
        stateRef = ref;
        stateDict = dict;
      } else if (optionalPdfText(dict.lookup(PDFName.of('RT'))) === 'R') {
        replyRef = ref;
        replyDict = dict;
      }
    }

    expect(rootRef).toBeInstanceOf(PDFRef);
    expect(replyRef).toBeInstanceOf(PDFRef);
    expect(stateRef).toBeInstanceOf(PDFRef);
    expect(rootDict!.get(PDFName.of('StateModel'))).toBeUndefined();
    expect(rootDict!.get(PDFName.of('State'))).toBeUndefined();

    expect(replyDict!.get(PDFName.of('IRT'))).toBeInstanceOf(PDFRef);
    expect(replyDict!.get(PDFName.of('IRT')).toString()).toBe(rootRef?.toString());
    expect(requiredPdfText(replyDict!.lookup(PDFName.of('NM')))).toBe(
      `${root.id}:reply:phase10-review-reply-1`,
    );

    expect(stateDict!.get(PDFName.of('IRT'))).toBeInstanceOf(PDFRef);
    expect(stateDict!.get(PDFName.of('IRT')).toString()).toBe(rootRef?.toString());
    expect(requiredPdfText(stateDict!.lookup(PDFName.of('StateModel')))).toBe('Review');
    expect(requiredPdfText(stateDict!.lookup(PDFName.of('State')))).toBe('Completed');

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

    rootDict!.set(PDFName.of('Contents'), PDFString.of('Externally revised review text'));
    stateDict!.set(PDFName.of('State'), PDFString.of('Rejected'));

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
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots2.size()).toBe(3);

    let rootRef2: PDFRef | null = null;
    let replyIrt2: unknown = null;
    let stateIrt2: unknown = null;
    const names: string[] = [];

    for (let index = 0; index < annots2.size(); index += 1) {
      const ref = annots2.get(index);
      const dict = annots2.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
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
        expect(requiredPdfText(dict.lookup(PDFName.of('State')))).toBe('Rejected');
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
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots3.size()).toBe(3);
  });

  it('preserves legacy chained review-state history but emits new states against the original annotation', async () => {
    const baseBytes = await createEmptyPdf();
    const root = createDeterministicReviewThreadFixture();

    const save1 = await writeNativePdfAnnotations(baseBytes, [root]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;

    let rootRef: PDFRef | null = null;
    let firstStateRef: PDFRef | null = null;

    for (let index = 0; index < annots.size(); index += 1) {
      const ref = annots.get(index);
      const dict = annots.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      const stateModel = optionalPdfText(dict.lookup(PDFName.of('StateModel')));

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
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots2.size()).toBe(4);

    let rootRef2: PDFRef | null = null;
    let firstStateRef2: PDFRef | null = null;
    let secondStateRef2: PDFRef | null = null;

    for (let index = 0; index < annots2.size(); index += 1) {
      const ref = annots2.get(index);
      const dict = annots2.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
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
      ) ?? -1,
    );
    const secondStateDict2 = annots2.lookup(
      [...Array(annots2.size()).keys()].find(
        (index) => annots2.get(index).toString() === secondStateRef2?.toString(),
      ) ?? -1,
    );

    expect(firstStateDict2.get(PDFName.of('IRT')).toString()).toBe(rootRef2?.toString());
    expect(secondStateDict2.get(PDFName.of('IRT')).toString()).toBe(firstStateRef2?.toString());
    expect(requiredPdfText(secondStateDict2.lookup(PDFName.of('State')))).toBe('Rejected');

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
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots3.size()).toBe(5);

    let rootRef3: PDFRef | null = null;
    let currentUserStateRef: PDFRef | null = null;
    let currentUserStateIrt3: PDFRef | null = null;
    for (let index = 0; index < annots3.size(); index += 1) {
      const ref = annots3.get(index);
      const dict = annots3.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      if (nm === root.id) rootRef3 = ref;
      if (nm === `${root.id}:state:Review:2`) {
        currentUserStateRef = ref;
        currentUserStateIrt3 = dict.get(PDFName.of('IRT')) as PDFRef;
        expect(requiredPdfText(dict.lookup(PDFName.of('T')))).toBe('Current User');
        expect(requiredPdfText(dict.lookup(PDFName.of('StateModel')))).toBe('Review');
        expect(requiredPdfText(dict.lookup(PDFName.of('State')))).toBe('Completed');
      }
    }
    expect(rootRef3).toBeInstanceOf(PDFRef);
    expect(currentUserStateRef).toBeInstanceOf(PDFRef);
    expect(currentUserStateIrt3?.toString()).toBe(rootRef3?.toString());

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
    const annots4 = doc4.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots4.size()).toBe(6);

    let rootRef4: PDFRef | null = null;
    let secondCurrentUserStateRef: PDFRef | null = null;
    let secondCurrentUserStateIrt4: PDFRef | null = null;
    for (let index = 0; index < annots4.size(); index += 1) {
      const ref = annots4.get(index);
      const dict = annots4.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      if (nm === root.id) rootRef4 = ref;
      if (nm === `${root.id}:state:Review:3`) {
        secondCurrentUserStateRef = ref;
        secondCurrentUserStateIrt4 = dict.get(PDFName.of('IRT')) as PDFRef;
        expect(requiredPdfText(dict.lookup(PDFName.of('T')))).toBe('Current User');
        expect(requiredPdfText(dict.lookup(PDFName.of('State')))).toBe('None');
      }
    }
    expect(rootRef4).toBeInstanceOf(PDFRef);
    expect(secondCurrentUserStateRef).toBeInstanceOf(PDFRef);
    expect(secondCurrentUserStateIrt4?.toString()).toBe(rootRef4?.toString());

    const save5 = await writeNativePdfAnnotations(save4.bytes, read4.annotations);
    const doc5 = await PDFDocument.load(save5.bytes);
    const annots5 = doc5.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots5.size()).toBe(6);
  });

  it('preserves nested reply topology and reply-attached state without projecting it onto the root', async () => {
    const baseBytes = await createEmptyPdf();
    const root = createDeterministicReviewThreadFixture();

    const save1 = await writeNativePdfAnnotations(baseBytes, [root]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;

    let rootRef: PDFRef | null = null;
    let firstReplyRef: PDFRef | null = null;

    for (let index = 0; index < annots.size(); index += 1) {
      const ref = annots.get(index);
      const dict = annots.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
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

    const opaqueReplyRef = externalDoc.context.register(
      externalDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [90, 640, 108, 658],
        T: PDFString.of('Opaque Reviewer'),
        NM: PDFString.of('external-opaque-reply'),
        M: PDFString.of('D:20231114221700Z'),
        CreationDate: PDFString.of('D:20231114221700Z'),
        IRT: rootRef,
        RT: 'R',
        VendorOpaqueMeta: PDFString.of('must-survive'),
      }),
    );
    annots.push(opaqueReplyRef);

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
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots2.size()).toBe(6);

    let rootRef2: PDFRef | null = null;
    let firstReplyRef2: PDFRef | null = null;
    let nestedReplyRef2: PDFRef | null = null;
    let opaqueReplyRef2: PDFRef | null = null;
    let opaqueReplyIrt2: PDFRef | null = null;
    let rootStateIrt: unknown = null;
    let nestedStateIrt: unknown = null;

    for (let index = 0; index < annots2.size(); index += 1) {
      const ref = annots2.get(index);
      const dict = annots2.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));

      if (nm === root.id) rootRef2 = ref;
      if (nm === `${root.id}:reply:phase10-review-reply-1`) {
        firstReplyRef2 = ref;
      }
      if (nm === 'external-nested-reply') {
        nestedReplyRef2 = ref;
        expect(dict.get(PDFName.of('IRT')).toString()).toBe(firstReplyRef2?.toString());
        expect(requiredPdfText(dict.lookup(PDFName.of('Subj')))).toBe('External nested subject');
        expect(requiredPdfText(dict.lookup(PDFName.of('VendorReplyMeta')))).toBe('preserve-nested');
        expect(dict.lookup(PDFName.of('Rect')).toString()).toBe('[ 70 680 88 698 ]');
      }
      if (nm === `${root.id}:state:Review`) {
        rootStateIrt = dict.get(PDFName.of('IRT'));
      }
      if (nm === 'external-nested-reply-state') {
        nestedStateIrt = dict.get(PDFName.of('IRT'));
        expect(requiredPdfText(dict.lookup(PDFName.of('State')))).toBe('Rejected');
      }
      if (nm === 'external-opaque-reply') {
        opaqueReplyRef2 = ref;
        opaqueReplyIrt2 = dict.get(PDFName.of('IRT')) as PDFRef;
        expect(requiredPdfText(dict.lookup(PDFName.of('VendorOpaqueMeta')))).toBe('must-survive');
        expect(dict.get(PDFName.of('Contents'))).toBeUndefined();
      }
    }

    expect(rootRef2).toBeInstanceOf(PDFRef);
    expect(firstReplyRef2).toBeInstanceOf(PDFRef);
    expect(nestedReplyRef2).toBeInstanceOf(PDFRef);
    expect(opaqueReplyRef2).toBeInstanceOf(PDFRef);
    expect(opaqueReplyIrt2).toBeInstanceOf(PDFRef);
    expect(opaqueReplyIrt2?.toString()).toBe(rootRef2?.toString());
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
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    expect(annots3.size()).toBe(6);

    let rootRef3: PDFRef | null = null;
    let opaqueIrt3: PDFRef | null = null;
    for (let index = 0; index < annots3.size(); index += 1) {
      const ref = annots3.get(index);
      const dict = annots3.lookup(index);
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      if (nm === root.id) rootRef3 = ref;
      if (nm === 'external-opaque-reply') {
        opaqueIrt3 = dict.get(PDFName.of('IRT'));
        expect(requiredPdfText(dict.lookup(PDFName.of('VendorOpaqueMeta')))).toBe('must-survive');
      }
    }
    expect(rootRef3).toBeInstanceOf(PDFRef);
    expect(opaqueIrt3).toBeInstanceOf(PDFRef);
    expect(opaqueIrt3?.toString()).toBe(rootRef3?.toString());
  });

  it('preserves native rich text read-only and fails closed instead of emitting contradictory /RC and Contents', async () => {
    const baseBytes = await createEmptyPdf();
    const textbox = createDeterministicAnnotation('textbox', {
      id: 'phase10-rich-text-root-1',
      data: {
        text: 'Rich text baseline',
        fontSize: 14,
        textColor: '#000000',
        textAlign: 'left',
        borderColor: '#2563eb',
        backgroundColor: '#eff6ff',
      },
    });

    const save1 = await writeNativePdfAnnotations(baseBytes, [textbox]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const externalAnnots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const oldRootRef = externalAnnots.get(0) as PDFRef;
    const rootDict = externalAnnots.lookup(0) as unknown as TestPdfNode;

    const richText = '<body><p>Rich text baseline</p></body>';
    const defaultStyle = 'font: 14pt Helvetica; color: #000000';
    rootDict.set(PDFName.of('Subj'), PDFString.of('External subject'));
    rootDict.set(PDFName.of('RC'), PDFString.of(richText));
    rootDict.set(PDFName.of('DS'), PDFString.of(defaultStyle));
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
    }) as unknown as TestPdfNode;
    const popupRef = externalDoc.context.register(popupDict);
    externalAnnots.push(popupRef);
    rootDict.set(PDFName.of('Popup'), popupRef);

    const externallySaved = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallySaved);

    expect(returned.annotations).toHaveLength(1);
    expect(returned.annotations[0].data.nativeInterop).toMatchObject({
      fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
      reason: 'RICH_TEXT',
      richText: true,
      defaultStyle: true,
      protectedSnapshot: {
        type: 'textbox',
        text: 'Rich text baseline',
        fontSize: 14,
        textColor: '#000000',
        textAlign: 'left',
      },
    });

    const save2 = await writeNativePdfAnnotations(externallySaved, returned.annotations);

    const findManagedRoot = (
      doc: PDFDocument,
    ): { ref: PDFRef; dict: TestPdfNode; annots: TestPdfNode } => {
      const annots = doc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
      for (let index = 0; index < annots.size(); index += 1) {
        const ref = annots.get(index);
        const dict = annots.lookup(index) as unknown as TestPdfNode;
        const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
        if (nm === 'phase10-rich-text-root-1') {
          expect(ref).toBeInstanceOf(PDFRef);
          return { ref, dict, annots };
        }
      }
      throw new Error('Managed rich-text root not found');
    };

    const doc2 = await PDFDocument.load(save2.bytes);
    const managed2 = findManagedRoot(doc2);
    const root2 = managed2.dict;

    expect(managed2.annots.size()).toBe(2);
    expect(requiredPdfText(root2.lookup(PDFName.of('Contents')))).toBe('Rich text baseline');
    expect(requiredPdfText(root2.lookup(PDFName.of('RC')))).toBe(richText);
    expect(requiredPdfText(root2.lookup(PDFName.of('DS')))).toBe(defaultStyle);
    expect(requiredPdfText(root2.lookup(PDFName.of('Subj')))).toBe('External subject');
    expect(requiredPdfText(root2.lookup(PDFName.of('VendorInteropMeta')))).toBe('keep-me');
    expect(root2.lookup(PDFName.of('AP'))).toBeInstanceOf(PDFDict);

    const popup2 = doc2.context.lookup(root2.get(PDFName.of('Popup')) as PDFRef, PDFDict);
    expect((popup2.get(PDFName.of('Parent')) as PDFRef).toString()).toBe(
      managed2.ref.toString(),
    );

    const lossyTextEdit = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        text: 'Plain-text edit that would contradict native RC',
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };
    await expect(
      writeNativePdfAnnotations(save2.bytes, [lossyTextEdit]),
    ).rejects.toThrow('NATIVE_RICH_TEXT_EDIT_UNSUPPORTED');

    const lossyTypographyEdit = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        fontSize: 22,
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };
    await expect(
      writeNativePdfAnnotations(save2.bytes, [lossyTypographyEdit]),
    ).rejects.toThrow('NATIVE_RICH_TEXT_EDIT_UNSUPPORTED');

    // Geometry edits keep rich text and regenerate the now-stale appearance.
    const safeGeometryEdit = {
      ...returned.annotations[0],
      rect: {
        ...returned.annotations[0].rect,
        x: returned.annotations[0].rect.x + 12,
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };

    const save3 = await writeNativePdfAnnotations(save2.bytes, [safeGeometryEdit]);
    const doc3 = await PDFDocument.load(save3.bytes);
    const managed3 = findManagedRoot(doc3);
    const root3 = managed3.dict;

    expect(requiredPdfText(root3.lookup(PDFName.of('Contents')))).toBe('Rich text baseline');
    expect(requiredPdfText(root3.lookup(PDFName.of('RC')))).toBe(richText);
    expect(requiredPdfText(root3.lookup(PDFName.of('DS')))).toBe(defaultStyle);
    expect(requiredPdfText(root3.lookup(PDFName.of('VendorInteropMeta')))).toBe('keep-me');
    expect(root3.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N'))).toBeDefined();

    const popup3 = doc3.context.lookup(root3.get(PDFName.of('Popup')) as PDFRef, PDFDict);
    expect((popup3.get(PDFName.of('Parent')) as PDFRef).toString()).toBe(
      managed3.ref.toString(),
    );

    const read3 = await readNativePdfAnnotations(save3.bytes);
    expect(read3.annotations[0].data.nativeInterop?.fidelityClass).toBe(
      'NATIVE_PRESERVED_READ_ONLY',
    );
    expect(read3.annotations[0].data.text).toBe('Rich text baseline');
  });

  it('edits native rich-text replies while guarding untracked removal or cloning', async () => {
    const baseBytes = await createEmptyPdf();
    const root = createDeterministicReviewThreadFixture();
    const save1 = await writeNativePdfAnnotations(baseBytes, [root]);

    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    let replyDict: TestPdfNode | null = null;

    for (let index = 0; index < annots.size(); index += 1) {
      const dict = annots.lookup(index) as unknown as TestPdfNode;
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      if (nm === `${root.id}:reply:phase10-review-reply-1`) {
        replyDict = dict;
        break;
      }
    }

    expect(replyDict).toBeInstanceOf(PDFDict);
    const richReply = '<body><p>Deterministic reply</p></body>';
    replyDict!.set(PDFName.of('RC'), PDFString.of(richReply));

    const externallySaved = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallySaved);
    const reply = returned.annotations[0].data.review?.replies[0];

    expect(reply).toMatchObject({
      id: 'phase10-review-reply-1',
      content: 'Deterministic reply',
      nativeInterop: {
        fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
        reason: 'RICH_TEXT',
        richText: true,
        protectedContent: 'Deterministic reply',
      },
    });

    const save2 = await writeNativePdfAnnotations(externallySaved, returned.annotations);
    const doc2 = await PDFDocument.load(save2.bytes);
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    let savedReply: TestPdfNode | null = null;
    for (let index = 0; index < annots2.size(); index += 1) {
      const dict = annots2.lookup(index) as unknown as TestPdfNode;
      const nm = optionalPdfText(dict.lookup(PDFName.of('NM')));
      if (nm === `${root.id}:reply:phase10-review-reply-1`) {
        savedReply = dict;
        break;
      }
    }
    expect(savedReply).toBeInstanceOf(PDFDict);
    expect(requiredPdfText(savedReply!.lookup(PDFName.of('RC')))).toBe(richReply);
    expect(requiredPdfText(savedReply!.lookup(PDFName.of('Contents')))).toBe(
      'Deterministic reply',
    );

    const changedReply = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        review: {
          ...returned.annotations[0].data.review!,
          replies: returned.annotations[0].data.review!.replies.map(
            (candidate) =>
              candidate.id === 'phase10-review-reply-1'
                ? { ...candidate, content: 'Lossy edited reply' }
                : candidate,
          ),
        },
      },
    };
    const edited = await writeNativePdfAnnotations(save2.bytes, [changedReply]);
    const editedRead = await readNativePdfAnnotations(edited.bytes);
    expect(editedRead.annotations[0].data.review?.replies[0].content).toBe('Lossy edited reply');
    const editedDoc = await PDFDocument.load(edited.bytes);
    const editedAnnots = editedDoc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const editedDict = Array.from({ length: editedAnnots.size() }, (_, i) => editedAnnots.lookup(i, PDFDict))
      .find((dict) => optionalPdfText(dict.lookup(PDFName.of('PDFHubReplyId'))) === 'phase10-review-reply-1');
    expect(requiredPdfText(editedDict!.lookup(PDFName.of('RC')))).toContain('Lossy edited reply');

    const removedReply = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        review: {
          ...returned.annotations[0].data.review!,
          replies: [],
        },
      },
    };
    await expect(
      writeNativePdfAnnotations(save2.bytes, [removedReply]),
    ).rejects.toThrow('NATIVE_RICH_TEXT_EDIT_UNSUPPORTED');

    const clonedThread = {
      ...returned.annotations[0],
      id: 'phase10-rich-reply-clone',
    };
    await expect(
      writeNativePdfAnnotations(save2.bytes, [clonedThread]),
    ).rejects.toThrow('NATIVE_RICH_TEXT_EDIT_UNSUPPORTED');
  });

  it('treats external FreeText DA as authoritative and preserves it exactly until local typography changes', async () => {
    const baseBytes = await createEmptyPdf();
    const textbox = createDeterministicAnnotation('textbox', {
      id: 'phase10-da-precedence-1',
      data: {
        text: 'DA precedence',
        fontSize: 14,
        textColor: '#000000',
      },
    });

    const save1 = await writeNativePdfAnnotations(baseBytes, [textbox]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict = annots.lookup(0) as unknown as TestPdfNode;

    const externalDa = '/ExternalFont 19 Tf 0.2 0.4 0.6 rg';
    dict.set(PDFName.of('DA'), PDFString.of(externalDa));
    const daAppearance = externalDoc.context.register(
      externalDoc.context.flateStream('q Q', {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 10, 10],
        Resources: {},
      }),
    );
    dict.set(
      PDFName.of('AP'),
      externalDoc.context.obj({ N: daAppearance }),
    );

    const externallyEdited = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallyEdited);

    expect(returned.annotations).toHaveLength(1);
    expect(returned.annotations[0].data.fontSize).toBe(19);
    expect(returned.annotations[0].data.textColor).toBe('#336699');

    const save2 = await writeNativePdfAnnotations(externallyEdited, returned.annotations);
    const doc2 = await PDFDocument.load(save2.bytes);
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict2 = annots2.lookup(0) as unknown as TestPdfNode;
    expect(requiredPdfText(dict2.lookup(PDFName.of('DA')))).toBe(externalDa);
    expect(dict2.lookup(PDFName.of('AP'))).toBeInstanceOf(PDFDict);

    const locallyEdited = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        fontSize: 23,
        textColor: '#ff0000',
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };

    const save3 = await writeNativePdfAnnotations(save2.bytes, [locallyEdited]);
    const doc3 = await PDFDocument.load(save3.bytes);
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict3 = annots3.lookup(0) as unknown as TestPdfNode;
    const da3 = requiredPdfText(dict3.lookup(PDFName.of('DA')));

    expect(da3).toContain('/ExternalFont 23 Tf');
    expect(da3).toContain('1 0 0 rg');
    expect(dict3.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N'))).toBeDefined();

    const read3 = await readNativePdfAnnotations(save3.bytes);
    expect(read3.annotations[0].data.fontSize).toBe(23);
    expect(read3.annotations[0].data.textColor).toBe('#ff0000');
  });

  it('treats external QuadPoints as authoritative multi-quad geometry and rescales them with local Rect edits', async () => {
    const baseBytes = await createEmptyPdf();
    const highlight = createDeterministicAnnotation('highlight', {
      id: 'phase10-quadpoints-precedence-1',
    });

    const save1 = await writeNativePdfAnnotations(baseBytes, [highlight]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict = annots.lookup(0) as unknown as TestPdfNode;

    // Fixture Rect is x=50..250 and app y=120..138 on an 800pt page,
    // so PDF-space y=680..662. Two separate markup quads exercise the
    // geometry that a single Rect cannot preserve.
    const externalQuads = [
      50, 680,
      140, 680,
      50, 671,
      140, 671,
      145, 680,
      250, 680,
      145, 671,
      250, 671,
    ];
    dict.set(PDFName.of('QuadPoints'), externalDoc.context.obj(externalQuads));
    const quadAppearance = externalDoc.context.register(
      externalDoc.context.flateStream('q Q', {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 10, 10],
        Resources: {},
      }),
    );
    dict.set(
      PDFName.of('AP'),
      externalDoc.context.obj({ N: quadAppearance }),
    );

    const externallyEdited = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallyEdited);
    const quads = returned.annotations[0].data.textMarkupQuads;

    expect(Array.isArray(quads)).toBe(true);
    expect(quads).toHaveLength(16);
    expect(quads?.[0]).toBeCloseTo(0);
    expect(quads?.[1]).toBeCloseTo(0);
    expect(quads?.[2]).toBeCloseTo(0.45);
    expect(quads?.[5]).toBeCloseTo(0.5);
    expect(quads?.[8]).toBeCloseTo(0.475);
    expect(quads?.[10]).toBeCloseTo(1);

    const save2 = await writeNativePdfAnnotations(externallyEdited, returned.annotations);
    const doc2 = await PDFDocument.load(save2.bytes);
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict2 = annots2.lookup(0) as unknown as TestPdfNode;
    const quadArray2 = dict2.lookup(PDFName.of('QuadPoints')) as unknown as TestPdfNode;
    const rawQuads2 = Array.from(
      { length: quadArray2.size() },
      (_, index) => requiredPdfNumber(quadArray2.lookup(index)),
    );
    expect(rawQuads2).toEqual(externalQuads);
    expect(dict2.lookup(PDFName.of('AP'))).toBeInstanceOf(PDFDict);

    const movedAndResized = {
      ...returned.annotations[0],
      rect: {
        x: 100,
        y: 200,
        width: 300,
        height: 36,
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };

    const save3 = await writeNativePdfAnnotations(save2.bytes, [movedAndResized]);
    const doc3 = await PDFDocument.load(save3.bytes);
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict3 = annots3.lookup(0) as unknown as TestPdfNode;
    const quadArray3 = dict3.lookup(PDFName.of('QuadPoints')) as unknown as TestPdfNode;
    const rawQuads3 = Array.from(
      { length: quadArray3.size() },
      (_, index) => requiredPdfNumber(quadArray3.lookup(index)),
    );

    expect(rawQuads3).toHaveLength(16);
    expect(rawQuads3[0]).toBeCloseTo(100);
    expect(rawQuads3[1]).toBeCloseTo(600);
    expect(rawQuads3[2]).toBeCloseTo(235);
    expect(rawQuads3[5]).toBeCloseTo(582);
    expect(rawQuads3[8]).toBeCloseTo(242.5);
    expect(rawQuads3[10]).toBeCloseTo(400);
    // Local Rect changes invalidate the external appearance. The new
    // standards-native Form appearance must be generated for the new quads,
    // rather than retaining stale output or falling back to missing /AP.
    const ap3 = dict3.lookup(PDFName.of('AP'), PDFDict);
    expect(ap3).toBeInstanceOf(PDFDict);
    const normal3 = ap3.lookup(PDFName.of('N')) as { dict?: PDFDict };
    expect(normal3?.dict).toBeInstanceOf(PDFDict);
    expect(normal3.dict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()).toBe('Form');
    expect(normal3.dict?.lookup(PDFName.of('BBox'))).toBeTruthy();

    const read3 = await readNativePdfAnnotations(save3.bytes);
    const quads3 = read3.annotations[0].data.textMarkupQuads;
    expect(quads3).toHaveLength(16);
    expect(quads3?.[0]).toBeCloseTo(0);
    expect(quads3?.[1]).toBeCloseTo(0);
    expect(quads3?.[2]).toBeCloseTo(0.45);
    expect(quads3?.[3]).toBeCloseTo(0);
  });

  it('prefers external FreeText CL/Q/Border/F over stale PDF Hub type and style cache', async () => {
    const baseBytes = await createEmptyPdf();
    const textbox = createDeterministicAnnotation('textbox', {
      id: 'phase10-field-symmetry-freetext-1',
      data: {
        text: 'External callout conversion',
        textAlign: 'left',
        borderWidth: 1,
        borderStyle: 'solid',
        locked: false,
      },
    });

    const save1 = await writeNativePdfAnnotations(baseBytes, [textbox]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict = annots.lookup(0) as unknown as TestPdfNode;

    dict.delete(PDFName.of('IT'));
    dict.set(
      PDFName.of('CL'),
      externalDoc.context.obj([280, 500, 250, 560]),
    );
    dict.set(PDFName.of('Q'), externalDoc.context.obj(2));
    dict.set(
      PDFName.of('Border'),
      externalDoc.context.obj([0, 0, 4, [3, 2]]),
    );
    dict.set(PDFName.of('F'), externalDoc.context.obj(132));

    const externallyEdited = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallyEdited);
    const annotation = returned.annotations[0];

    expect(annotation.type).toBe('callout');
    expect(annotation.data.textAlign).toBe('right');
    expect(annotation.data.borderWidth).toBe(4);
    expect(annotation.data.borderStyle).toBe('dashed');
    expect(annotation.data.locked).toBe(true);

    const save2 = await writeNativePdfAnnotations(externallyEdited, returned.annotations);
    const doc2 = await PDFDocument.load(save2.bytes);
    const annots2 = doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict2 = annots2.lookup(0) as unknown as TestPdfNode;

    expect(requiredPdfNumber(dict2.lookup(PDFName.of('Q')))).toBe(2);
    expect(requiredPdfNumber(dict2.lookup(PDFName.of('F')))).toBe(132);
    const border2 = dict2.lookup(PDFName.of('Border')) as unknown as TestPdfNode;
    expect(requiredPdfNumber(border2.lookup(2))).toBe(4);
    const dash2 = border2.lookup(3) as unknown as TestPdfNode;
    expect(requiredPdfNumber(dash2.lookup(0))).toBe(3);
    expect(requiredPdfNumber(dash2.lookup(1))).toBe(2);
    expect(requiredPdfText(dict2.lookup(PDFName.of('IT')))).toBe('FreeTextCallout');

    const locallyEdited = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        textAlign: 'center' as const,
        borderWidth: 2,
        borderStyle: 'dotted' as const,
        locked: false,
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };

    const save3 = await writeNativePdfAnnotations(save2.bytes, [locallyEdited]);
    const doc3 = await PDFDocument.load(save3.bytes);
    const annots3 = doc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict3 = annots3.lookup(0) as unknown as TestPdfNode;

    expect(requiredPdfNumber(dict3.lookup(PDFName.of('Q')))).toBe(1);
    expect(requiredPdfNumber(dict3.lookup(PDFName.of('F')))).toBe(4);
    const border3 = dict3.lookup(PDFName.of('Border')) as unknown as TestPdfNode;
    expect(requiredPdfNumber(border3.lookup(2))).toBe(2);
    const dash3 = border3.lookup(3) as unknown as TestPdfNode;
    expect(requiredPdfNumber(dash3.lookup(0))).toBe(1);
    expect(requiredPdfNumber(dash3.lookup(1))).toBe(1);

    const read3 = await readNativePdfAnnotations(save3.bytes);
    expect(read3.annotations[0].type).toBe('callout');
    expect(read3.annotations[0].data.textAlign).toBe('center');
    expect(read3.annotations[0].data.borderWidth).toBe(2);
    expect(read3.annotations[0].data.borderStyle).toBe('dotted');
    expect(read3.annotations[0].data.locked).toBe(false);
  });

  it('uses standard BE and LE to override stale private subtype ambiguity while preserving exact no-op objects', async () => {
    const baseBytes = await createEmptyPdf();

    const line = createDeterministicAnnotation('line', {
      id: 'phase10-field-symmetry-line-1',
    });
    const lineSave = await writeNativePdfAnnotations(baseBytes, [line]);
    const lineDoc = await PDFDocument.load(lineSave.bytes);
    const lineAnnots = lineDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const lineDict = lineAnnots.lookup(0) as unknown as TestPdfNode;
    lineDict.set(
      PDFName.of('LE'),
      lineDoc.context.obj([
        PDFName.of('Circle'),
        PDFName.of('ClosedArrow'),
      ]),
    );

    const externalLine = new Uint8Array(await lineDoc.save());
    const lineRead = await readNativePdfAnnotations(externalLine);
    expect(lineRead.annotations[0].type).toBe('arrow');
    expect(lineRead.annotations[0].data.lineStartCap).toBe('circle');
    expect(lineRead.annotations[0].data.lineEndCap).toBe('arrow');

    const lineSave2 = await writeNativePdfAnnotations(externalLine, lineRead.annotations);
    const lineDoc2 = await PDFDocument.load(lineSave2.bytes);
    const lineDict2 = (lineDoc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode)
      .lookup(0) as unknown as TestPdfNode;
    const endings2 = lineDict2.lookup(PDFName.of('LE')) as unknown as TestPdfNode;
    expect(requiredPdfText(endings2.lookup(0))).toBe('Circle');
    expect(requiredPdfText(endings2.lookup(1))).toBe('ClosedArrow');

    const rect = createDeterministicAnnotation('shape-rect', {
      id: 'phase10-field-symmetry-cloud-1',
    });
    const rectSave = await writeNativePdfAnnotations(baseBytes, [rect]);
    const rectDoc = await PDFDocument.load(rectSave.bytes);
    const rectAnnots = rectDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const rectDict = rectAnnots.lookup(0) as unknown as TestPdfNode;
    rectDict.set(
      PDFName.of('BE'),
      rectDoc.context.obj({
        S: PDFName.of('C'),
        I: 2.5,
      }),
    );

    const externalCloud = new Uint8Array(await rectDoc.save());
    const cloudRead = await readNativePdfAnnotations(externalCloud);
    expect(cloudRead.annotations[0].type).toBe('shape-cloud');

    const cloudSave2 = await writeNativePdfAnnotations(externalCloud, cloudRead.annotations);
    const cloudDoc2 = await PDFDocument.load(cloudSave2.bytes);
    const cloudDict2 = (cloudDoc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode)
      .lookup(0) as unknown as TestPdfNode;
    const be2 = cloudDict2.lookup(PDFName.of('BE')) as unknown as TestPdfNode;
    expect(requiredPdfText(be2.lookup(PDFName.of('S')))).toBe('C');
    expect(requiredPdfNumber(be2.lookup(PDFName.of('I')))).toBe(2.5);
  });

  it('preserves external Text Open/Name and Stamp Name until the represented local semantic changes', async () => {
    const baseBytes = await createEmptyPdf();

    const sticky = createDeterministicAnnotation('sticky-note', {
      id: 'phase10-field-symmetry-note-1',
      data: {
        text: 'Native icon preservation',
        isCollapsed: true,
      },
    });
    const stickySave = await writeNativePdfAnnotations(baseBytes, [sticky]);
    const stickyDoc = await PDFDocument.load(stickySave.bytes);
    const stickyAnnots = stickyDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const stickyDict = stickyAnnots.lookup(0) as unknown as TestPdfNode;
    stickyDict.set(PDFName.of('Name'), PDFName.of('Key'));
    stickyDict.set(PDFName.of('Open'), stickyDoc.context.obj(true));

    const externalSticky = new Uint8Array(await stickyDoc.save());
    const stickyRead = await readNativePdfAnnotations(externalSticky);
    expect(stickyRead.annotations[0].type).toBe('sticky-note');
    expect(stickyRead.annotations[0].data.isCollapsed).toBe(false);

    const stickySave2 = await writeNativePdfAnnotations(
      externalSticky,
      stickyRead.annotations,
    );
    const stickyDoc2 = await PDFDocument.load(stickySave2.bytes);
    const stickyDict2 = (stickyDoc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode)
      .lookup(0) as unknown as TestPdfNode;
    expect(requiredPdfText(stickyDict2.lookup(PDFName.of('Name')))).toBe('Key');
    expect(stickyDict2.lookup(PDFName.of('Open'), PDFBool).toString()).toBe('true');

    const collapsed = {
      ...stickyRead.annotations[0],
      data: {
        ...stickyRead.annotations[0].data,
        isCollapsed: true,
      },
      updatedAt: stickyRead.annotations[0].updatedAt + 1_000,
    };
    const stickySave3 = await writeNativePdfAnnotations(stickySave2.bytes, [collapsed]);
    const stickyDoc3 = await PDFDocument.load(stickySave3.bytes);
    const stickyAnnots3 = stickyDoc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    let stickyDict3: TestPdfNode | null = null;
    for (let index = 0; index < stickyAnnots3.size(); index += 1) {
      const candidate = stickyAnnots3.lookup(index) as unknown as TestPdfNode;
      if (optionalPdfText(candidate.lookup(PDFName.of('NM'))) === sticky.id) {
        stickyDict3 = candidate;
        break;
      }
    }
    expect(stickyDict3).toBeTruthy();
    expect(requiredPdfText(stickyDict3!.lookup(PDFName.of('Name')))).toBe('Key');
    expect(stickyDict3!.lookup(PDFName.of('Open'), PDFBool).toString()).toBe('false');

    const reviewComment = createDeterministicReviewThreadFixture();
    const commentSave = await writeNativePdfAnnotations(baseBytes, [reviewComment]);
    const commentDoc = await PDFDocument.load(commentSave.bytes);
    const commentAnnots = commentDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    let commentRoot: TestPdfNode | null = null;
    for (let index = 0; index < commentAnnots.size(); index += 1) {
      const candidate = commentAnnots.lookup(index) as unknown as TestPdfNode;
      if (optionalPdfText(candidate.lookup(PDFName.of('NM'))) === reviewComment.id) {
        commentRoot = candidate;
        break;
      }
    }
    expect(commentRoot).toBeTruthy();
    commentRoot!.set(PDFName.of('Open'), commentDoc.context.obj(true));

    const externalComment = new Uint8Array(await commentDoc.save());
    const commentRead = await readNativePdfAnnotations(externalComment);
    expect(commentRead.annotations[0].type).toBe('comment');
    expect(commentRead.annotations[0].data.isCollapsed).toBe(false);

    const commentSave2 = await writeNativePdfAnnotations(
      externalComment,
      commentRead.annotations,
    );
    const commentDoc2 = await PDFDocument.load(commentSave2.bytes);
    const commentAnnots2 = commentDoc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    let commentRoot2: TestPdfNode | null = null;
    for (let index = 0; index < commentAnnots2.size(); index += 1) {
      const candidate = commentAnnots2.lookup(index) as unknown as TestPdfNode;
      if (optionalPdfText(candidate.lookup(PDFName.of('NM'))) === reviewComment.id) {
        commentRoot2 = candidate;
        break;
      }
    }
    expect(commentRoot2).toBeTruthy();
    expect(commentRoot2!.lookup(PDFName.of('Open'), PDFBool).toString()).toBe('true');

    const stamp = createDeterministicAnnotation('stamp', {
      id: 'phase10-field-symmetry-stamp-1',
    });
    const stampSave = await writeNativePdfAnnotations(baseBytes, [stamp]);
    const stampDoc = await PDFDocument.load(stampSave.bytes);
    const stampAnnots = stampDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const stampDict = stampAnnots.lookup(0) as unknown as TestPdfNode;
    stampDict.set(PDFName.of('Name'), PDFName.of('ExternalCustomStamp'));

    const externalStamp = new Uint8Array(await stampDoc.save());
    const stampRead = await readNativePdfAnnotations(externalStamp);
    expect(stampRead.annotations[0].data.stampStyle).toBe('custom');

    const stampSave2 = await writeNativePdfAnnotations(externalStamp, stampRead.annotations);
    const stampDoc2 = await PDFDocument.load(stampSave2.bytes);
    const stampDict2 = (stampDoc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode)
      .lookup(0) as unknown as TestPdfNode;
    expect(requiredPdfText(stampDict2.lookup(PDFName.of('Name')))).toBe(
      'ExternalCustomStamp',
    );

    const rejectedStamp = {
      ...stampRead.annotations[0],
      data: {
        ...stampRead.annotations[0].data,
        stampStyle: 'rejected' as const,
      },
      updatedAt: stampRead.annotations[0].updatedAt + 1_000,
    };
    // The external edit invalidates generated-artwork provenance. Replacing
    // its appearance on a later style change would risk losing external work.
    await expect(writeNativePdfAnnotations(stampSave2.bytes, [rejectedStamp]))
      .rejects.toThrow('Cannot safely replace an imported custom stamp appearance');
  });

  it('honors BS over Border and removes stale BS after a supported local border edit', async () => {
    const baseBytes = await createEmptyPdf();
    const rect = createDeterministicAnnotation('shape-rect', {
      id: 'phase10-field-symmetry-bs-1',
      data: {
        borderWidth: 2,
        borderStyle: 'solid',
      },
    });

    const save1 = await writeNativePdfAnnotations(baseBytes, [rect]);
    const externalDoc = await PDFDocument.load(save1.bytes);
    const annots = externalDoc.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict = annots.lookup(0) as unknown as TestPdfNode;

    // Border deliberately disagrees with BS. PDF semantics require BS to win.
    dict.set(
      PDFName.of('Border'),
      externalDoc.context.obj([0, 0, 9]),
    );
    dict.set(
      PDFName.of('BS'),
      externalDoc.context.obj({
        W: 3,
        S: PDFName.of('D'),
        D: [4, 2],
      }),
    );

    const externallyEdited = new Uint8Array(await externalDoc.save());
    const returned = await readNativePdfAnnotations(externallyEdited);

    expect(returned.annotations[0].data.borderWidth).toBe(3);
    expect(returned.annotations[0].data.borderStyle).toBe('dashed');

    const save2 = await writeNativePdfAnnotations(externallyEdited, returned.annotations);
    const doc2 = await PDFDocument.load(save2.bytes);
    const dict2 = (doc2.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode)
      .lookup(0) as unknown as TestPdfNode;
    const bs2 = dict2.lookup(PDFName.of('BS')) as unknown as TestPdfNode;
    expect(requiredPdfNumber(bs2.lookup(PDFName.of('W')))).toBe(3);
    expect(requiredPdfText(bs2.lookup(PDFName.of('S')))).toBe('D');
    const dash2 = bs2.lookup(PDFName.of('D')) as unknown as TestPdfNode;
    expect(requiredPdfNumber(dash2.lookup(0))).toBe(4);
    expect(requiredPdfNumber(dash2.lookup(1))).toBe(2);

    const locallyEdited = {
      ...returned.annotations[0],
      data: {
        ...returned.annotations[0].data,
        borderWidth: 5,
        borderStyle: 'solid' as const,
      },
      updatedAt: returned.annotations[0].updatedAt + 1_000,
    };

    const save3 = await writeNativePdfAnnotations(save2.bytes, [locallyEdited]);
    const doc3 = await PDFDocument.load(save3.bytes);
    const dict3 = (doc3.getPage(0).node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode)
      .lookup(0) as unknown as TestPdfNode;
    const bs3 = dict3.lookup(PDFName.of('BS')) as unknown as TestPdfNode;
    expect(requiredPdfNumber(bs3.lookup(PDFName.of('W')))).toBe(5);
    expect(requiredPdfText(bs3.lookup(PDFName.of('S')))).toBe('S');

    const read3 = await readNativePdfAnnotations(save3.bytes);
    expect(read3.annotations[0].data.borderWidth).toBe(5);
    expect(read3.annotations[0].data.borderStyle).toBe('solid');
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
    const annots = page.node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;

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
    const annots = page.node.lookup(PDFName.of('Annots')) as unknown as TestPdfNode;
    const dict = annots.lookup(0);
    const subtype = requiredPdfText(dict.lookup(PDFName.of('Subtype')));

    expect(subtype).toBe('Square');
    expect(subtype).not.toBe('Redact');
  });
});
