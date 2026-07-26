import { describe, expect, it } from 'vitest';
import type { WriterDocumentMetaV2, WriterElementV2 } from '@/core/writer-v2/types';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { exportPdfHubWriterProject } from '@/core/writer-v2/export/projectZip';
import { createOcrProjectPayload } from '@/core/ocr/ocrProjectCodec';
import { inspectZipArchive } from './zipInventory';
import { admitZipArchive } from './zipAdmission';
import { admitDeclaredZipResources } from './zipDeclaredResourceAdmission';
import { admitWriterProjectMembers } from './writerProjectMemberAdmission';

describe('current Writer project exporter member-profile compatibility', () => {
  it('admits a blank Writer project export', async () => {
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: null,
      documentFingerprint: 'blank-profile',
      documentMeta: blankDocumentMeta(),
      elements: [],
      assets: [],
    });

    const evidence = admitExport(exported.bytes);
    expect(evidence.admissionOutcome).toBe('ADMITTED');
    expect(evidence.optionalRoleStatus).toEqual([
      { role: 'original.pdf', present: false },
      { role: 'writer-document-meta.json', present: true, ordinal: 1 },
    ]);
  });

  it('admits a PDF-overlay and OCR-free Writer project export', async () => {
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: Uint8Array.from([37, 80, 68, 70]),
      documentFingerprint: 'overlay-profile',
      elements: [],
      assets: [],
    });

    const evidence = admitExport(exported.bytes);
    expect(evidence.admissionOutcome).toBe('ADMITTED');
    expect(evidence.optionalRoleStatus[0]).toMatchObject({ present: true });
    expect(evidence.ocrCompatibilityMemberCount).toBe(0);
  });

  it('admits an asset-bearing Writer project export', async () => {
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: Uint8Array.from([37, 80, 68, 70]),
      documentFingerprint: 'asset-profile',
      elements: [writerElement()],
      assets: [writerAsset()],
    });

    const evidence = admitExport(exported.bytes);
    expect(evidence.admissionOutcome).toBe('ADMITTED');
    expect(evidence.assetMemberCount).toBe(1);
    expect(evidence.memberRecords.some((record) =>
      record.classification === 'ASSET_DIRECTORY')).toBe(true);
  });

  it('admits an OCR-bearing Writer project export using the exact OCR catalog', async () => {
    const ocrProject = createOcrProjectPayload({
      documentFingerprint: 'ocr-profile',
      result: null,
      corrections: [],
      regions: [],
      writerInsertionQueue: { candidates: [] },
    });
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: Uint8Array.from([37, 80, 68, 70]),
      documentFingerprint: 'ocr-profile',
      elements: [],
      assets: [],
      ocrProject,
    });

    const evidence = admitExport(exported.bytes);
    expect(evidence.admissionOutcome).toBe('ADMITTED');
    expect(evidence.ocrCompatibilityMemberCount).toBe(5);
    expect(
      evidence.memberRecords
        .filter((record) => record.classification === 'OCR_COMPATIBILITY_MEMBER')
        .map((record) => record.decodedPath),
    ).toEqual([
      'ocr/manifest.json',
      'ocr/result.json',
      'ocr/corrections.json',
      'ocr/regions.json',
      'ocr/writer-insertion-queue.json',
    ]);
  });
});

function admitExport(bytes: Uint8Array) {
  const inventory = admitZipArchive(inspectZipArchive(bytes));
  admitDeclaredZipResources(inventory, bytes.byteLength);
  return admitWriterProjectMembers(inventory).evidence;
}

function blankDocumentMeta(): WriterDocumentMetaV2 {
  return {
    documentFingerprint: 'blank-profile',
    mode: 'blankDocument',
    title: 'Blank Profile',
    pageSetup: {
      preset: 'A4',
      width: 595.28,
      height: 841.89,
      unit: 'pt',
      marginTop: 72,
      marginRight: 72,
      marginBottom: 72,
      marginLeft: 72,
      backgroundColor: '#ffffff',
    },
    pageCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function writerElement(): WriterElementV2 {
  return {
    id: 'writer-profile-element',
    documentFingerprint: 'asset-profile',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 72, y: 640, width: 220, height: 72 },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Profile asset',
    assetIds: ['asset-profile-image'],
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

function writerAsset(): WriterAssetRecordV2 {
  return {
    id: 'asset-profile-image',
    documentFingerprint: 'asset-profile',
    kind: 'image',
    mimeType: 'image/png',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
