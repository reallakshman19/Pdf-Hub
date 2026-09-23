import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from 'pdf-lib';

import type { PdfAnnotation } from '@/core/annotations/types';
import { createDeterministicAnnotation } from './fixtures/annotationFixtures';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

const PROBE_ENABLED =
  process.env.PHASE10_RETURN_RICH_TEXT_PROBE_MODE === '1';
const RETURNED_PDF = process.env.PHASE10_RETURNED_RICH_TEXT_PDF;
const REPORT_PATH = process.env.PHASE10_RICH_TEXT_RETURN_REPORT_PATH;

const ANNOTATION_ID = 'phase10-rich-text-preservation-1';
const BASELINE_TEXT = 'Rich text preservation fixture';
const BASELINE_RC = '<body><p>Rich text preservation fixture</p></body>';
const BASELINE_DS = 'font: 14pt Helvetica; color: #000000';

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

function readNumber(dict: PDFDict, key: string): number | null {
  return dict.lookupMaybe(PDFName.of(key), PDFNumber)?.asNumber() ?? null;
}

function readNumberArray(dict: PDFDict, key: string): number[] {
  const array = dict.lookupMaybe(PDFName.of(key), PDFArray);
  if (!array) return [];

  const values: number[] = [];
  for (let index = 0; index < array.size(); index += 1) {
    const value = array.lookupMaybe(index, PDFNumber);
    if (!value) return [];
    values.push(value.asNumber());
  }
  return values;
}

async function createNormalizedBaseline(): Promise<Uint8Array> {
  const baseBytes = await createEmptyPdf();
  const annotation = createDeterministicAnnotation('textbox', {
    id: ANNOTATION_ID,
    data: {
      text: BASELINE_TEXT,
      fontSize: 14,
      textColor: '#000000',
      textAlign: 'left',
    },
  });

  const initial = await writeNativePdfAnnotations(baseBytes, [annotation]);
  const externalLike = await PDFDocument.load(initial.bytes);
  const annots = externalLike
    .getPage(0)
    .node.lookup(PDFName.of('Annots'), PDFArray);
  const dict = annots.lookup(0, PDFDict);
  dict.set(PDFName.of('RC'), PDFString.of(BASELINE_RC));
  dict.set(PDFName.of('DS'), PDFString.of(BASELINE_DS));

  const injected = new Uint8Array(await externalLike.save());
  const imported = await readNativePdfAnnotations(injected);
  const normalized = await writeNativePdfAnnotations(
    injected,
    imported.annotations,
  );
  return normalized.bytes;
}

async function rawSnapshot(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const annots = doc
    .getPage(0)
    .node.lookup(PDFName.of('Annots'), PDFArray);

  let root: PDFDict | null = null;
  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookup(index, PDFDict);
    if (readText(dict, 'NM') === ANNOTATION_ID) {
      root = dict;
      break;
    }
  }

  expect(root, 'managed rich-text FreeText root must survive').toBeTruthy();
  expect(
    root!.get(PDFName.of('Subtype'))?.toString(),
    'rich-text journey must remain a FreeText annotation',
  ).toBe('/FreeText');

  const snapshot = {
    annotationCount: annots.size(),
    contents: readText(root!, 'Contents'),
    richText: readText(root!, 'RC'),
    defaultStyle: readText(root!, 'DS'),
    defaultAppearance: readText(root!, 'DA'),
    alignment: readNumber(root!, 'Q'),
    hasAppearance: Boolean(root!.get(PDFName.of('AP'))),
    rect: readNumberArray(root!, 'Rect'),
  };

  expect(snapshot.contents, 'returned rich-text fixture requires Contents').not.toBeNull();
  expect(snapshot.richText, 'returned rich-text fixture requires RC').not.toBeNull();
  expect(snapshot.defaultStyle, 'returned rich-text fixture requires DS').not.toBeNull();

  return snapshot;
}

function semanticSnapshot(annotations: PdfAnnotation[]) {
  const annotation = annotations.find(
    (candidate) => candidate.id === ANNOTATION_ID,
  );
  expect(annotation, 'managed rich-text annotation must import').toBeTruthy();
  expect(annotation!.type).toBe('textbox');
  expect(annotation!.data.nativeInterop).toMatchObject({
    fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
    reason: 'RICH_TEXT',
    richText: true,
    defaultStyle: true,
  });

  return {
    id: annotation!.id,
    type: annotation!.type,
    pageNumber: annotation!.pageNumber,
    rect: annotation!.rect,
    text:
      typeof annotation!.data.text === 'string'
        ? annotation!.data.text
        : null,
    fontSize:
      typeof annotation!.data.fontSize === 'number'
        ? annotation!.data.fontSize
        : null,
    textColor:
      typeof annotation!.data.textColor === 'string'
        ? annotation!.data.textColor
        : null,
    textAlign:
      typeof annotation!.data.textAlign === 'string'
        ? annotation!.data.textAlign
        : null,
    nativeInterop: annotation!.data.nativeInterop,
  };
}

function externalDelta(
  baseline: Awaited<ReturnType<typeof rawSnapshot>>,
  returned: Awaited<ReturnType<typeof rawSnapshot>>,
): string[] {
  const delta: string[] = [];
  if (baseline.contents !== returned.contents) delta.push('Contents');
  if (baseline.richText !== returned.richText) delta.push('RC');
  if (baseline.defaultStyle !== returned.defaultStyle) delta.push('DS');
  if (baseline.defaultAppearance !== returned.defaultAppearance) {
    delta.push('DA');
  }
  if (baseline.alignment !== returned.alignment) delta.push('Q');
  return delta;
}

describe.skipIf(!PROBE_ENABLED)(
  'Phase 10 externally returned rich-text preservation journey',
  () => {
    it('preserves returned native rich text through two PDF Hub no-op saves', async () => {
      expect(
        RETURNED_PDF,
        'PHASE10_RETURNED_RICH_TEXT_PDF must be set',
      ).toBeTruthy();
      expect(
        REPORT_PATH,
        'PHASE10_RICH_TEXT_RETURN_REPORT_PATH must be set',
      ).toBeTruthy();

      const source = new Uint8Array(await readFile(RETURNED_PDF!));
      const inputSha256 = createHash('sha256')
        .update(source)
        .digest('hex');

      const baselineBytes = await createNormalizedBaseline();
      const baselineRaw = await rawSnapshot(baselineBytes);
      const rawReturned = await rawSnapshot(source);
      const detectedExternalDelta = externalDelta(
        baselineRaw,
        rawReturned,
      );

      expect(
        detectedExternalDelta,
        'rich-text edit qualification requires a changed flat Contents counterpart',
      ).toContain('Contents');
      expect(
        detectedExternalDelta,
        'rich-text edit qualification requires a changed native RC value',
      ).toContain('RC');

      const read1 = await readNativePdfAnnotations(source);
      const semantic1 = semanticSnapshot(read1.annotations);
      expect(semantic1.text).toBe(rawReturned.contents);

      const save2 = await writeNativePdfAnnotations(
        source,
        read1.annotations,
      );
      const raw2 = await rawSnapshot(save2.bytes);
      expect(raw2).toEqual(rawReturned);

      const read2 = await readNativePdfAnnotations(save2.bytes);
      const semantic2 = semanticSnapshot(read2.annotations);
      expect(semantic2).toEqual(semantic1);

      const save3 = await writeNativePdfAnnotations(
        save2.bytes,
        read2.annotations,
      );
      const raw3 = await rawSnapshot(save3.bytes);
      expect(raw3).toEqual(rawReturned);

      const read3 = await readNativePdfAnnotations(save3.bytes);
      const semantic3 = semanticSnapshot(read3.annotations);
      expect(semantic3).toEqual(semantic1);

      await writeFile(
        REPORT_PATH!,
        JSON.stringify({
          schema_version: 'phase10-rich-text-return-evidence-v1',
          result: 'PASS',
          input_pdf: RETURNED_PDF,
          input_sha256: inputSha256,
          production_reader: 'readNativePdfAnnotations',
          production_writer: 'writeNativePdfAnnotations',
          baseline_raw_snapshot: baselineRaw,
          returned_raw_snapshot: rawReturned,
          semantic_snapshot: semantic1,
          external_delta: detectedExternalDelta,
          raw_after_first_pdfhub_save: raw2,
          raw_after_two_pdfhub_saves: raw3,
          generated_at: new Date().toISOString(),
        }, null, 2) + '\n',
        'utf8',
      );
    });
  },
);
