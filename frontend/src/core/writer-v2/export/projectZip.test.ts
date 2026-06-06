import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import {
  exportPdfHubWriterProject,
  importPdfHubWriterProject,
} from './projectZip';
import {
  createOcrProjectPayload,
} from '../../ocr/ocrProjectCodec';
import { mockOcrEngine } from '../../ocr/engines/mockOcrEngine';
import { getOcrProfile } from '../../ocr/ocrProfiles';
import { createOcrRegion } from '../../ocr/ocrRegionModel';

async function blankPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 640,
      width: 220,
      height: 72,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Editable project text',
    assetIds: ['asset-1'],
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function asset(id: string): WriterAssetRecordV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    kind: 'image',
    mimeType: 'image/png',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('PDF Hub writer project ZIP', () => {
  it('exports and imports editable writer project data', async () => {
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: await blankPdfBytes(),
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assets: [asset('asset-1')],
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(exported.bytes.length).toBeGreaterThan(0);
    expect(exported.manifest.schema).toBe('pdf-hub-project');
    expect(exported.manifest.counts.writerElements).toBe(1);
    expect(exported.manifest.counts.writerAssets).toBe(1);

    const imported = await importPdfHubWriterProject(exported.bytes);

    expect(imported.manifest.documentFingerprint).toBe('doc-1');
    expect(imported.elements).toHaveLength(1);
    expect(imported.elements[0].id).toBe('writer-1');
    expect(imported.elements[0].assetIds).toEqual(['asset-1']);
    expect(imported.assets).toHaveLength(1);
    expect(imported.assets[0].id).toBe('asset-1');
    expect(imported.assets[0].dataUrl).toMatch(/^data:image\/png;base64,/);

    const pdf = await PDFDocument.load(imported.originalPdfBytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('rewrites imported element fingerprints to project fingerprint', async () => {
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: await blankPdfBytes(),
      documentFingerprint: 'doc-final',
      elements: [
        {
          ...element('writer-1'),
          documentFingerprint: 'stale-doc',
        },
      ],
      assets: [],
    });

    const imported = await importPdfHubWriterProject(exported.bytes);

    expect(imported.elements[0].documentFingerprint).toBe('doc-final');
  });

  it('throws on invalid project data', async () => {
    const badZip = new Uint8Array([1, 2, 3, 4]);

    await expect(importPdfHubWriterProject(badZip)).rejects.toThrow();
  });

  it('exports and imports optional OCR project payload', async () => {
    const ocrResult = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-project',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const ocrProject = createOcrProjectPayload({
      documentFingerprint: 'doc-project',
      result: ocrResult,
      regions: [
        createOcrRegion({
          id: 'region-1',
          documentFingerprint: 'doc-project',
          pageIndex: 0,
          mode: 'text',
          bbox: {
            x: 60,
            y: 620,
            width: 420,
            height: 180,
          },
          now: '2026-01-01T00:00:00.000Z',
        }),
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: new Uint8Array([37, 80, 68, 70]),
      documentFingerprint: 'doc-project',
      elements: [],
      assets: [],
      ocrProject,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(exported.ocrProjectIncluded).toBe(true);
    expect(exported.manifest.files.ocrManifest).toBe('ocr/manifest.json');
    expect(exported.manifest.counts.ocrPages).toBe(1);
    expect(exported.manifest.counts.ocrRegions).toBe(1);

    const imported = await importPdfHubWriterProject(exported.bytes);

    expect(imported.ocrProject).not.toBeNull();
    expect(imported.ocrProject?.manifest.documentFingerprint).toBe('doc-project');
    expect(imported.ocrProject?.result?.pages).toHaveLength(1);
    expect(imported.ocrProject?.regions).toHaveLength(1);
  });

  it('imports project without OCR payload as backward-compatible null OCR project', async () => {
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: new Uint8Array([37, 80, 68, 70]),
      documentFingerprint: 'doc-no-ocr',
      elements: [],
      assets: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(exported.ocrProjectIncluded).toBe(false);
    expect(exported.manifest.files.ocrManifest).toBeUndefined();

    const imported = await importPdfHubWriterProject(exported.bytes);

    expect(imported.ocrProject).toBeNull();
  });
});
