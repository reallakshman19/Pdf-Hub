import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

import {
  createDeterministicAnnotation,
  createDeterministicReviewThreadFixture,
  getFixtureMetadata,
  PHASE10_SUPPORTED_TYPES,
} from './fixtures/annotationFixtures';
import qualificationManifest from './fixtures/viewerQualificationManifest.json';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

type QualificationType = (typeof PHASE10_SUPPORTED_TYPES)[number];

interface CorpusEntry {
  type: QualificationType;
  family: string;
  pdfSubtype: string;
  annotationId: string;
  bytes: Uint8Array;
}

interface JourneyEntry {
  journeyId: string;
  fileName: string;
  bytes: Uint8Array;
  rootIds: string[];
  graph: string;
}

async function createEmptyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  return new Uint8Array(await doc.save());
}

function familyFor(type: QualificationType): string {
  for (const [family, definition] of Object.entries(qualificationManifest.appearance_families)) {
    if ((definition.types as string[]).includes(type)) return family;
  }
  throw new Error(`No appearance family mapped for ${type}`);
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

async function inspectManagedAnnotation(bytes: Uint8Array, annotationId: string) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);

  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookup(index, PDFDict);
    const nm = readText(dict, 'NM');
    if (nm !== annotationId) continue;

    return {
      nm,
      subtype: readName(dict, 'Subtype'),
      hasAppearance: dict.has(PDFName.of('AP')),
    };
  }

  throw new Error(`Managed annotation not found: ${annotationId}`);
}

async function inspectReviewJourney(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);

  expect(annots.size()).toBe(4);

  let commentRef: PDFRef | null = null;
  let comment: PDFDict | null = null;
  let reply: PDFDict | null = null;
  let state: PDFDict | null = null;
  let highlight: PDFDict | null = null;

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookup(index, PDFDict);
    const nm = readText(dict, 'NM');

    if (nm === 'phase10-review-root-1') {
      commentRef = raw instanceof PDFRef ? raw : null;
      comment = dict;
    } else if (nm === 'phase10-review-root-1:reply:phase10-review-reply-1') {
      reply = dict;
    } else if (nm === 'phase10-review-root-1:state:Review') {
      state = dict;
    } else if (nm === 'phase10-review-journey-highlight-1') {
      highlight = dict;
    }
  }

  expect(commentRef).toBeInstanceOf(PDFRef);
  expect(comment).toBeTruthy();
  expect(reply).toBeTruthy();
  expect(state).toBeTruthy();
  expect(highlight).toBeTruthy();

  expect(readName(comment!, 'Subtype')).toBe('Text');
  expect(readName(comment!, 'StateModel')).toBeNull();
  expect(readName(comment!, 'State')).toBeNull();
  expect(comment!.has(PDFName.of('AP'))).toBe(false);

  expect(readName(highlight!, 'Subtype')).toBe('Highlight');
  expect(highlight!.has(PDFName.of('AP'))).toBe(false);

  expect(readName(reply!, 'Subtype')).toBe('Text');
  expect(readName(reply!, 'RT')).toBe('R');
  expect(reply!.get(PDFName.of('IRT'))).toBeInstanceOf(PDFRef);
  expect((reply!.get(PDFName.of('IRT')) as PDFRef).toString()).toBe(commentRef?.toString());

  expect(readName(state!, 'Subtype')).toBe('Text');
  expect(readText(state!, 'StateModel')).toBe('Review');
  expect(readText(state!, 'State')).toBe('Completed');
  expect(state!.get(PDFName.of('IRT'))).toBeInstanceOf(PDFRef);
  expect((state!.get(PDFName.of('IRT')) as PDFRef).toString()).toBe(commentRef?.toString());
}

async function inspectRichTextJourney(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);

  expect(annots.size()).toBe(1);
  const dict = annots.lookup(0, PDFDict);

  expect(readText(dict, 'NM')).toBe('phase10-rich-text-preservation-1');
  expect(readName(dict, 'Subtype')).toBe('FreeText');
  expect(readText(dict, 'Contents')).toBe('Rich text preservation fixture');
  expect(readText(dict, 'RC')).toBe(
    '<body><p>Rich text preservation fixture</p></body>',
  );
  expect(readText(dict, 'DS')).toBe(
    'font: 14pt Helvetica; color: #000000',
  );
  expect(dict.has(PDFName.of('AP'))).toBe(false);

  const imported = await readNativePdfAnnotations(bytes);
  expect(imported.annotations).toHaveLength(1);
  expect(imported.annotations[0].data.nativeInterop).toMatchObject({
    fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
    reason: 'RICH_TEXT',
    richText: true,
    defaultStyle: true,
  });
}

async function createRichTextJourney(
  baseBytes: Uint8Array,
): Promise<JourneyEntry> {
  const annotation = createDeterministicAnnotation('textbox', {
    id: 'phase10-rich-text-preservation-1',
    data: {
      text: 'Rich text preservation fixture',
      fontSize: 14,
      textColor: '#000000',
      textAlign: 'left',
    },
  });

  const initial = await writeNativePdfAnnotations(baseBytes, [annotation]);
  const externalLike = await PDFDocument.load(initial.bytes);
  const annots = externalLike.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const dict = annots.lookup(0, PDFDict);
  dict.set(
    PDFName.of('RC'),
    PDFString.of('<body><p>Rich text preservation fixture</p></body>'),
  );
  dict.set(
    PDFName.of('DS'),
    PDFString.of('font: 14pt Helvetica; color: #000000'),
  );

  const injected = new Uint8Array(await externalLike.save());
  const imported = await readNativePdfAnnotations(injected);
  expect(imported.annotations).toHaveLength(1);
  expect(imported.annotations[0].data.nativeInterop?.fidelityClass).toBe(
    'NATIVE_PRESERVED_READ_ONLY',
  );

  const normalized = await writeNativePdfAnnotations(
    injected,
    imported.annotations,
  );
  await inspectRichTextJourney(normalized.bytes);

  return {
    journeyId: 'rich-text-preservation',
    fileName:
      qualificationManifest.interoperability_journeys[
        'rich-text-preservation'
      ].file,
    bytes: normalized.bytes,
    rootIds: [annotation.id],
    graph: 'FreeText root + Contents + RC rich text + DS default style; imported as NATIVE_PRESERVED_READ_ONLY',
  };
}

async function maybeWriteCorpus(
  entries: CorpusEntry[],
  journeys: JourneyEntry[],
) {
  const outputDir = process.env.PHASE10_VIEWER_CORPUS_DIR;
  if (!outputDir) return;

  await mkdir(outputDir, { recursive: true });
  const index = [];

  for (const entry of entries) {
    const fileName = `phase10-${entry.type}.pdf`;
    await writeFile(path.join(outputDir, fileName), entry.bytes);
    index.push({
      type: entry.type,
      family: entry.family,
      pdfSubtype: entry.pdfSubtype,
      annotationId: entry.annotationId,
      file: fileName,
      apPresent: false,
    });
  }

  const journeyIndex = [];
  for (const journey of journeys) {
    await writeFile(path.join(outputDir, journey.fileName), journey.bytes);
    journeyIndex.push({
      journeyId: journey.journeyId,
      file: journey.fileName,
      rootIds: journey.rootIds,
      graph: journey.graph,
      apPresentOnRoots: false,
    });
  }

  await writeFile(
    path.join(outputDir, 'corpus-index.json'),
    JSON.stringify({
      schema_version: 'phase10-viewer-corpus-v2',
      production_writer: qualificationManifest.production_writer,
      entries: index,
      journeys: journeyIndex,
    }, null, 2) + '\n',
    'utf8',
  );
}

function runEvidenceValidator(evidencePath: string) {
  return spawnSync(
    process.execPath,
    ['scripts/phase10-validate-viewer-evidence.mjs', evidencePath],
    {
      cwd: path.resolve(process.cwd()),
      encoding: 'utf8',
    },
  );
}

describe('Phase 10 viewer appearance qualification corpus', () => {
  it('maps all 17 supported annotation types exactly once across appearance families', () => {
    expect(qualificationManifest.supported_annotation_types).toEqual(PHASE10_SUPPORTED_TYPES);

    const mapped = Object.values(qualificationManifest.appearance_families)
      .flatMap((family) => family.types);

    expect(mapped).toHaveLength(PHASE10_SUPPORTED_TYPES.length);
    expect(new Set(mapped).size).toBe(PHASE10_SUPPORTED_TYPES.length);
    expect([...mapped].sort()).toEqual([...PHASE10_SUPPORTED_TYPES].sort());

    for (const type of PHASE10_SUPPORTED_TYPES) {
      expect(familyFor(type)).toBeTruthy();
      expect(getFixtureMetadata(type).appearanceStreamRequired).toBe(true);
    }

    expect(Object.keys(qualificationManifest.interoperability_journeys)).toEqual([
      'review-round-trip',
      'rich-text-preservation',
    ]);
  });

  it('generates isolated type PDFs plus review and rich-text interoperability journeys through the production reader/writer', async () => {
    const baseBytes = await createEmptyPdf();
    const entries: CorpusEntry[] = [];

    for (const type of PHASE10_SUPPORTED_TYPES) {
      const annotation = createDeterministicAnnotation(type);
      const expected = getFixtureMetadata(type);
      const result = await writeNativePdfAnnotations(baseBytes, [annotation]);
      const actual = await inspectManagedAnnotation(result.bytes, annotation.id);

      expect(result.annotationCount).toBe(1);
      expect(actual.nm).toBe(annotation.id);
      expect(actual.subtype).toBe(expected.pdfSubtype);
      expect(actual.hasAppearance).toBe(false);

      entries.push({
        type,
        family: familyFor(type),
        pdfSubtype: expected.pdfSubtype,
        annotationId: annotation.id,
        bytes: result.bytes,
      });
    }

    const highlight = createDeterministicAnnotation('highlight', {
      id: 'phase10-review-journey-highlight-1',
    });
    const review = createDeterministicReviewThreadFixture();
    const journeyResult = await writeNativePdfAnnotations(baseBytes, [highlight, review]);

    expect(journeyResult.annotationCount).toBe(2);
    expect(journeyResult.replyCount).toBe(1);
    await inspectReviewJourney(journeyResult.bytes);

    const richTextJourney = await createRichTextJourney(baseBytes);

    await maybeWriteCorpus(entries, [
      {
        journeyId: 'review-round-trip',
        fileName:
          qualificationManifest.interoperability_journeys[
            'review-round-trip'
          ].file,
        bytes: journeyResult.bytes,
        rootIds: [highlight.id, review.id],
        graph: 'highlight + comment root + reply IRT/RT=R + review-state IRT/StateModel=Review',
      },
      richTextJourney,
    ]);
  });

  it('qualifies observed capability limits without pretending unsupported editing is a failure or a pass claim', async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'phase10-viewer-evidence-'));
    const examplePath = path.resolve(
      process.cwd(),
      'src/core/pdf-annotations/fixtures/viewerQualificationEvidence.example.json',
    );
    const example = JSON.parse(await readFile(examplePath, 'utf8'));

    const notRunPath = path.join(temp, 'not-run.json');
    await writeFile(notRunPath, JSON.stringify(example), 'utf8');
    const notRun = runEvidenceValidator(notRunPath);
    expect(notRun.status).toBe(1);
    expect(notRun.stdout + notRun.stderr).toMatch(/NOT_RUN|not qualified/i);

    const complete = structuredClone(example);
    complete.corpus_material_head = '0123456789abcdef0123456789abcdef01234567';
    complete.viewers[0] = {
      id: 'viewer-1',
      name: 'Example Viewer',
      version: '1.0.0',
      platform: 'Example OS 1',
    };
    complete.observations = complete.observations.map((observation: Record<string, unknown>) => ({
      ...observation,
      render: 'PASS',
      native_interaction: 'PASS',
      edit_save_reopen: 'PASS',
      evidence_ref: `evidence/${observation.annotation_type}.json`,
    }));
    complete.journey_observations = complete.journey_observations.map(
      (observation: Record<string, unknown>) => ({
        ...observation,
        render: 'PASS',
        native_interaction: 'PASS',
        edit_save_reopen: 'PASS',
        external_mutation: 'PASS',
        return_semantics: 'PASS',
        evidence_ref: `evidence/${observation.journey_id}.json`,
      }),
    );

    const passPath = path.join(temp, 'pass.json');
    await writeFile(passPath, JSON.stringify(complete), 'utf8');
    const pass = runEvidenceValidator(passPath);
    expect(pass.status).toBe(0);
    expect(pass.stdout).toMatch(/QUALIFIED CAPABILITY PROFILE/);

    const renderOnly = structuredClone(complete);
    renderOnly.observations = renderOnly.observations.map(
      (observation: Record<string, unknown>) => ({
        ...observation,
        native_interaction: 'UNSUPPORTED',
        edit_save_reopen: 'UNSUPPORTED',
      }),
    );
    renderOnly.journey_observations = renderOnly.journey_observations.map(
      (observation: Record<string, unknown>) => ({
        ...observation,
        native_interaction: 'UNSUPPORTED',
        edit_save_reopen: 'UNSUPPORTED',
        external_mutation: 'UNSUPPORTED',
        return_semantics: 'UNSUPPORTED',
      }),
    );

    const renderOnlyPath = path.join(temp, 'render-only.json');
    await writeFile(renderOnlyPath, JSON.stringify(renderOnly), 'utf8');
    const renderOnlyResult = runEvidenceValidator(renderOnlyPath);
    expect(renderOnlyResult.status).toBe(0);
    expect(renderOnlyResult.stdout).toMatch(/UNSUPPORTED=/);

    const missing = structuredClone(complete);
    missing.journey_observations = [];
    const missingPath = path.join(temp, 'missing.json');
    await writeFile(missingPath, JSON.stringify(missing), 'utf8');
    expect(runEvidenceValidator(missingPath).status).toBe(2);

    const failed = structuredClone(complete);
    failed.observations[0].render = 'FAIL';
    const failedPath = path.join(temp, 'failed.json');
    await writeFile(failedPath, JSON.stringify(failed), 'utf8');
    const failure = runEvidenceValidator(failedPath);
    expect(failure.status).toBe(1);
    expect(failure.stdout + failure.stderr).toMatch(/FAIL|not qualified/i);

    const inconsistent = structuredClone(complete);
    inconsistent.observations[0].native_interaction = 'UNSUPPORTED';
    inconsistent.observations[0].edit_save_reopen = 'PASS';
    const inconsistentPath = path.join(temp, 'inconsistent.json');
    await writeFile(inconsistentPath, JSON.stringify(inconsistent), 'utf8');
    expect(runEvidenceValidator(inconsistentPath).status).toBe(2);

    const missingMutation = structuredClone(complete);
    missingMutation.journey_observations[0].external_mutation = 'NOT_RUN';
    const missingMutationPath = path.join(temp, 'missing-mutation.json');
    await writeFile(missingMutationPath, JSON.stringify(missingMutation), 'utf8');
    expect(runEvidenceValidator(missingMutationPath).status).toBe(2);
  });
});
