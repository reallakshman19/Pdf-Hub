import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
} from 'pdf-lib';

import type { PdfAnnotation } from '@/core/annotations/types';
import {
  createDeterministicAnnotation,
  createDeterministicReviewThreadFixture,
} from './fixtures/annotationFixtures';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

const PROBE_ENABLED = process.env.PHASE10_RETURN_PROBE_MODE === '1';
const RETURNED_PDF = process.env.PHASE10_RETURNED_REVIEW_PDF;
const REPORT_PATH = process.env.PHASE10_RETURN_REPORT_PATH;


async function createEmptyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  return new Uint8Array(await doc.save());
}

function readText(dict: PDFDict, key: string): string | null {
  const value = dict.lookup(PDFName.of(key));
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText();
  }
  return null;
}

function readName(dict: PDFDict, key: string): string | null {
  return dict.lookupMaybe(PDFName.of(key), PDFName)?.decodeText() ?? null;
}

function readTextOrName(dict: PDFDict, key: string): string | null {
  const value = dict.lookup(PDFName.of(key));
  if (
    value instanceof PDFString
    || value instanceof PDFHexString
    || value instanceof PDFName
  ) {
    return value.decodeText();
  }
  return null;
}

function semanticSnapshot(annotations: PdfAnnotation[]) {
  const highlight = annotations.find(
    (annotation) => annotation.id === 'phase10-review-journey-highlight-1',
  );
  const comment = annotations.find(
    (annotation) => annotation.id === 'phase10-review-root-1',
  );

  expect(highlight, 'managed highlight must survive external handling').toBeTruthy();
  expect(comment, 'managed comment root must survive external handling').toBeTruthy();
  expect(highlight?.type).toBe('highlight');
  expect(comment?.type).toBe('comment');

  const replies = comment?.data.review?.replies ?? [];
  expect(
    replies.some((reply) => reply.id === 'phase10-review-reply-1'),
    'original managed reply identity must survive external handling',
  ).toBe(true);
  expect(new Set(replies.map((reply) => reply.id)).size).toBe(replies.length);

  return {
    highlight: {
      id: highlight!.id,
      type: highlight!.type,
      pageNumber: highlight!.pageNumber,
      rect: highlight!.rect,
      backgroundColor: highlight!.data.backgroundColor ?? null,
      borderColor: highlight!.data.borderColor ?? null,
      opacity: highlight!.data.opacity ?? null,
    },
    comment: {
      id: comment!.id,
      type: comment!.type,
      pageNumber: comment!.pageNumber,
      rect: comment!.rect,
      text: typeof comment!.data.text === 'string' ? comment!.data.text : null,
      author: typeof comment!.data.author === 'string' ? comment!.data.author : null,
      review: {
        author: comment!.data.review?.author ?? null,
        status: comment!.data.review?.status ?? null,
        statusAuthor: comment!.data.review?.statusAuthor ?? null,
        title: comment!.data.review?.title ?? null,
        category: comment!.data.review?.category ?? null,
        replies: replies.map((reply) => ({
          id: reply.id,
          parentReplyId: reply.parentReplyId ?? null,
          author: reply.author,
          content: reply.content,
        })),
      },
    },
  };
}

function portableMutationSnapshot(snapshot: ReturnType<typeof semanticSnapshot>) {
  return {
    highlight: {
      rect: snapshot.highlight.rect,
      backgroundColor: snapshot.highlight.backgroundColor,
      borderColor: snapshot.highlight.borderColor,
      opacity: snapshot.highlight.opacity,
    },
    comment: {
      rect: snapshot.comment.rect,
      text: snapshot.comment.text,
      author: snapshot.comment.author,
      review: {
        status: snapshot.comment.review.status,
        statusAuthor: snapshot.comment.review.statusAuthor,
        replies: snapshot.comment.review.replies,
      },
    },
  };
}

function externalDelta(
  baseline: ReturnType<typeof semanticSnapshot>,
  returned: ReturnType<typeof semanticSnapshot>,
): string[] {
  const before = portableMutationSnapshot(baseline);
  const after = portableMutationSnapshot(returned);
  const delta: string[] = [];

  if (JSON.stringify(before.highlight.rect) !== JSON.stringify(after.highlight.rect)) {
    delta.push('highlight.rect');
  }
  if (before.highlight.backgroundColor !== after.highlight.backgroundColor) {
    delta.push('highlight.backgroundColor');
  }
  if (before.highlight.borderColor !== after.highlight.borderColor) {
    delta.push('highlight.borderColor');
  }
  if (before.highlight.opacity !== after.highlight.opacity) {
    delta.push('highlight.opacity');
  }
  if (JSON.stringify(before.comment.rect) !== JSON.stringify(after.comment.rect)) {
    delta.push('comment.rect');
  }
  if (before.comment.text !== after.comment.text) {
    delta.push('comment.text');
  }
  if (before.comment.author !== after.comment.author) {
    delta.push('comment.author');
  }
  if (before.comment.review.status !== after.comment.review.status) {
    delta.push('comment.review.status');
  }
  if (before.comment.review.statusAuthor !== after.comment.review.statusAuthor) {
    delta.push('comment.review.statusAuthor');
  }
  if (
    JSON.stringify(before.comment.review.replies)
    !== JSON.stringify(after.comment.review.replies)
  ) {
    delta.push('comment.review.replies');
  }

  return delta;
}

async function normalizedBaselineSnapshot() {
  const baseBytes = await createEmptyPdf();
  const highlight = createDeterministicAnnotation('highlight', {
    id: 'phase10-review-journey-highlight-1',
  });
  const review = createDeterministicReviewThreadFixture();
  const written = await writeNativePdfAnnotations(baseBytes, [highlight, review]);
  const read = await readNativePdfAnnotations(written.bytes);
  return semanticSnapshot(read.annotations);
}

function rawReplyLogicalId(
  dict: PDFDict,
  index: number,
): string {
  const privateId = readText(dict, 'PDFHubReplyId');
  const annotationName = readText(dict, 'NM');
  const prefix = 'phase10-review-root-1:reply:';

  return (
    privateId
    ?? (
      annotationName?.startsWith(prefix) && annotationName.length > prefix.length
        ? annotationName.slice(prefix.length)
        : null
    )
    ?? annotationName
    ?? `phase10-review-root-1:native-reply:${index}`
  );
}

async function rawGraphSummary(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);

  let highlightRef: PDFRef | null = null;
  let commentRef: PDFRef | null = null;
  let commentRoot: PDFDict | null = null;
  const records: Array<{
    ref: PDFRef | null;
    refKey: string | null;
    dict: PDFDict;
    nm: string | null;
    index: number;
  }> = [];

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookup(index, PDFDict);
    const ref = raw instanceof PDFRef ? raw : null;
    const refKey = ref?.toString() ?? null;
    const nm = readText(dict, 'NM');
    records.push({ ref, refKey, dict, nm, index });

    if (nm === 'phase10-review-journey-highlight-1') {
      highlightRef = ref;
    }
    if (nm === 'phase10-review-root-1') {
      commentRef = ref;
      commentRoot = dict;
    }
  }

  expect(highlightRef).toBeInstanceOf(PDFRef);
  expect(commentRef).toBeInstanceOf(PDFRef);
  expect(commentRoot).toBeTruthy();
  expect(readName(commentRoot!, 'StateModel')).toBeNull();
  expect(readName(commentRoot!, 'State')).toBeNull();

  const commentKey = commentRef!.toString();
  const byRef = new Map(
    records
      .filter((record): record is typeof record & { refKey: string } => Boolean(record.refKey))
      .map((record) => [record.refKey, record]),
  );

  function relationshipDepth(record: (typeof records)[number]): number | null {
    let irt = record.dict.get(PDFName.of('IRT'));
    let depth = 0;
    const visited = new Set<string>();

    while (irt instanceof PDFRef) {
      const parentKey = irt.toString();
      depth += 1;
      if (parentKey === commentKey) return depth;
      if (visited.has(parentKey)) return null;
      visited.add(parentKey);

      const parent = byRef.get(parentKey);
      if (!parent) return null;
      irt = parent.dict.get(PDFName.of('IRT'));
    }

    return null;
  }

  const related = records
    .map((record) => ({ record, depth: relationshipDepth(record) }))
    .filter(
      (entry): entry is { record: (typeof records)[number]; depth: number } =>
        entry.depth !== null,
    );

  const states = related.filter(
    ({ record }) =>
      readTextOrName(record.dict, 'StateModel') === 'Review'
      && Boolean(readTextOrName(record.dict, 'State')),
  );
  const replies = related.filter(
    ({ record }) =>
      !(
        readTextOrName(record.dict, 'StateModel') === 'Review'
        && Boolean(readTextOrName(record.dict, 'State'))
      )
      && (readName(record.dict, 'RT') === 'R' || readName(record.dict, 'RT') === null),
  );

  expect(states.length, 'review state relationship must survive').toBeGreaterThan(0);
  expect(replies.length, 'reply relationship must survive').toBeGreaterThan(0);

  const originalReply = replies.find(
    ({ record }) =>
      record.nm === 'phase10-review-root-1:reply:phase10-review-reply-1'
      || readText(record.dict, 'PDFHubReplyId') === 'phase10-review-reply-1',
  );
  expect(originalReply, 'original reply native identity must remain discoverable').toBeTruthy();

  const replyIdByRef = new Map(
    replies
      .filter(({ record }) => Boolean(record.refKey))
      .map(({ record }) => [
        record.refKey!,
        rawReplyLogicalId(record.dict, record.index),
      ]),
  );

  return {
    annotationCount: annots.size(),
    relatedCount: related.length,
    replyCount: replies.length,
    replyTopology: replies
      .map(({ record, depth }) => {
        const irt = record.dict.get(PDFName.of('IRT'));
        const parentKey = irt instanceof PDFRef ? irt.toString() : null;
        return {
          id: rawReplyLogicalId(record.dict, record.index),
          parentReplyId:
            parentKey && parentKey !== commentKey
              ? replyIdByRef.get(parentKey) ?? null
              : null,
          depth,
          author: readText(record.dict, 'T'),
          content: readText(record.dict, 'Contents'),
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
    stateCount: states.length,
    stateTransitions: states
      .map(({ record, depth }) => ({
        depth,
        state: readTextOrName(record.dict, 'State'),
        author: readText(record.dict, 'T'),
        name: record.nm,
      }))
      .sort((left, right) => left.depth - right.depth || String(left.name).localeCompare(String(right.name))),
    relatedNames: related.map(({ record }) => record.nm),
  };
}

describe.skipIf(!PROBE_ENABLED)('Phase 10 externally returned review journey', () => {
  it('preserves returned semantics through two subsequent PDF Hub saves', async () => {
    expect(RETURNED_PDF, 'PHASE10_RETURNED_REVIEW_PDF must be set').toBeTruthy();
    expect(REPORT_PATH, 'PHASE10_RETURN_REPORT_PATH must be set').toBeTruthy();

    const source = new Uint8Array(await readFile(RETURNED_PDF!));
    const inputSha256 = createHash('sha256').update(source).digest('hex');

    const baseline = await normalizedBaselineSnapshot();
    const rawReturned = await rawGraphSummary(source);
    const read1 = await readNativePdfAnnotations(source);
    const snapshot1 = semanticSnapshot(read1.annotations);
    const detectedExternalDelta = externalDelta(baseline, snapshot1);

    expect(
      detectedExternalDelta.length,
      'edit/save/reopen qualification requires at least one detectable standards-native semantic mutation; open/save without a review edit does not qualify',
    ).toBeGreaterThan(0);

    const save2 = await writeNativePdfAnnotations(source, read1.annotations);
    const read2 = await readNativePdfAnnotations(save2.bytes);
    const snapshot2 = semanticSnapshot(read2.annotations);
    expect(snapshot2).toEqual(snapshot1);

    const save3 = await writeNativePdfAnnotations(save2.bytes, read2.annotations);
    const read3 = await readNativePdfAnnotations(save3.bytes);
    const snapshot3 = semanticSnapshot(read3.annotations);
    expect(snapshot3).toEqual(snapshot1);

    const rawFinal = await rawGraphSummary(save3.bytes);
    expect(rawFinal.stateCount).toBe(rawReturned.stateCount);
    expect(rawFinal.stateTransitions).toEqual(rawReturned.stateTransitions);
    expect(rawFinal.replyCount).toBe(snapshot1.comment.review.replies.length);
    expect(rawFinal.replyTopology).toEqual(rawReturned.replyTopology);

    const finalRelatedNames = rawFinal.relatedNames.filter(
      (name): name is string => typeof name === 'string',
    );
    expect(new Set(finalRelatedNames).size).toBe(finalRelatedNames.length);

    await writeFile(
      REPORT_PATH!,
      JSON.stringify({
        schema_version: 'phase10-review-return-evidence-v1',
        result: 'PASS',
        input_pdf: RETURNED_PDF,
        input_sha256: inputSha256,
        production_reader: 'readNativePdfAnnotations',
        production_writer: 'writeNativePdfAnnotations',
        baseline_semantic_snapshot: baseline,
        semantic_snapshot: snapshot1,
        external_delta: detectedExternalDelta,
        raw_returned_graph: rawReturned,
        raw_after_two_pdfhub_saves: rawFinal,
        generated_at: new Date().toISOString(),
      }, null, 2) + '\n',
      'utf8',
    );
  });
});
