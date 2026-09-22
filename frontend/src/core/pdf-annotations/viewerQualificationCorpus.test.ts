import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
} from 'pdf-lib';

import {
  createDeterministicAnnotation,
  getFixtureMetadata,
  PHASE10_SUPPORTED_TYPES,
} from './fixtures/annotationFixtures';
import qualificationManifest from './fixtures/viewerQualificationManifest.json';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

type QualificationType = (typeof PHASE10_SUPPORTED_TYPES)[number];

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

async function inspectManagedAnnotation(bytes: Uint8Array, annotationId: string) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);

  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookup(index, PDFDict);
    const nm = dict.lookupMaybe(PDFName.of('NM'), PDFString)?.decodeText();
    if (nm !== annotationId) continue;

    return {
      nm,
      subtype: dict.get(PDFName.of('Subtype'))?.toString().replace(/^\//, '') ?? null,
      hasAppearance: dict.has(PDFName.of('AP')),
    };
  }

  throw new Error(`Managed annotation not found: ${annotationId}`);
}

async function maybeWriteCorpus(entries: Array<{
  type: QualificationType;
  family: string;
  pdfSubtype: string;
  annotationId: string;
  bytes: Uint8Array;
}>) {
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

  await writeFile(
    path.join(outputDir, 'corpus-index.json'),
    JSON.stringify({
      schema_version: 'phase10-viewer-corpus-v1',
      production_writer: qualificationManifest.production_writer,
      entries: index,
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
  });

  it('generates every corpus PDF through the production writer and proves the current /AP baseline is absent', async () => {
    const baseBytes = await createEmptyPdf();
    const entries: Array<{
      type: QualificationType;
      family: string;
      pdfSubtype: string;
      annotationId: string;
      bytes: Uint8Array;
    }> = [];

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

    await maybeWriteCorpus(entries);
  });

  it('keeps viewer evidence fail-closed for missing, NOT_RUN, or failed observations', async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'phase10-viewer-evidence-'));
    const examplePath = path.resolve(
      process.cwd(),
      'src/core/pdf-annotations/fixtures/viewerQualificationEvidence.example.json',
    );
    const example = JSON.parse(await readFile(examplePath, 'utf8'));

    const notRunPath = path.join(temp, 'not-run.json');
    await writeFile(notRunPath, JSON.stringify(example), 'utf8');
    const notRun = runEvidenceValidator(notRunPath);
    expect(notRun.status).not.toBe(0);
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
      reopen_editability: 'PASS',
      evidence_ref: `evidence/${observation.annotation_type}.png`,
    }));

    const passPath = path.join(temp, 'pass.json');
    await writeFile(passPath, JSON.stringify(complete), 'utf8');
    const pass = runEvidenceValidator(passPath);
    expect(pass.status).toBe(0);
    expect(pass.stdout).toMatch(/QUALIFIED/);

    const missing = structuredClone(complete);
    missing.observations.pop();
    const missingPath = path.join(temp, 'missing.json');
    await writeFile(missingPath, JSON.stringify(missing), 'utf8');
    expect(runEvidenceValidator(missingPath).status).not.toBe(0);

    const failed = structuredClone(complete);
    failed.observations[0].render = 'FAIL';
    const failedPath = path.join(temp, 'failed.json');
    await writeFile(failedPath, JSON.stringify(failed), 'utf8');
    const failure = runEvidenceValidator(failedPath);
    expect(failure.status).not.toBe(0);
    expect(failure.stdout + failure.stderr).toMatch(/FAIL|not qualified/i);
  });
});
