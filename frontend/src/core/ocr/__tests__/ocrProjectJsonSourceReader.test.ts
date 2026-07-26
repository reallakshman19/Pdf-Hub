import { describe, expect, it, vi } from 'vitest';
import type { ProjectArchiveReader } from '@/core/admission/zip/projectArchiveReader';
import { freezeWriterProjectJsonSourceAdmissionEvidence } from '@/core/admission/zip/writerProjectJsonSourceEvidence';
import { WRITER_PROJECT_JSON_SOURCE_POLICY_V1 } from '@/core/admission/zip/writerProjectJsonSourcePolicy';
import {
  AdmittedWriterProjectJsonSourceSet,
  releaseAdmittedProjectJsonSources,
} from '@/core/admission/zip/writerProjectJsonSourceSet';
import { WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1 } from '@/core/admission/zip/zipResourcePolicy';
import {
  createOcrProjectPayload,
  readOcrProjectPayloadFromReader,
} from '../ocrProjectCodec';

describe('OCR project admitted JSON reader compatibility', () => {
  it('parses OCR payload from admitted strings without re-reading bytes', async () => {
    const payload = createOcrProjectPayload({
      documentFingerprint: 'phase3b3b-ocr',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const decoded = new Map([
      ['ocr/manifest.json', JSON.stringify(payload.manifest)],
      ['ocr/result.json', JSON.stringify(payload.result)],
      ['ocr/corrections.json', JSON.stringify(payload.corrections)],
      ['ocr/regions.json', JSON.stringify(payload.regions)],
      [
        'ocr/writer-insertion-queue.json',
        JSON.stringify(payload.writerInsertionQueue),
      ],
    ] as const);
    const readBytes = vi.fn(async () => {
      throw new Error('OCR JSON bytes must not be read after admission');
    });
    const underlying: ProjectArchiveReader = {
      has: (path) => decoded.has(path as never),
      readBytes,
      readText: vi.fn(async () => {
        throw new Error('underlying UTF-8 decode must not run');
      }),
      listPaths: () => Object.freeze([...decoded.keys()]),
    };
    const sources = [...decoded.entries()].map(([path, value], ordinal) => ({
      ordinal,
      path,
      sourceBytes: new TextEncoder().encode(value).byteLength,
      decodedCodeUnits: value.length,
      hadUtf8Bom: false,
    }));
    const sourceSet = AdmittedWriterProjectJsonSourceSet.create(
      sources,
      decoded,
      underlying,
      freezeWriterProjectJsonSourceAdmissionEvidence({
        evidenceProfileId: 'WRITER_PROJECT_JSON_SOURCE_ADMISSION_EVIDENCE_V1',
        policyProfileId: WRITER_PROJECT_JSON_SOURCE_POLICY_V1.profileId,
        policyAuthority: WRITER_PROJECT_JSON_SOURCE_POLICY_V1.authority,
        policyLimits: {
          pathByteLimits: WRITER_PROJECT_JSON_SOURCE_POLICY_V1.pathByteLimits,
          maxTotalJsonSourceBytes:
            WRITER_PROJECT_JSON_SOURCE_POLICY_V1.maxTotalJsonSourceBytes,
          utf8DecodeChunkBytes:
            WRITER_PROJECT_JSON_SOURCE_POLICY_V1.utf8DecodeChunkBytes,
          maxJsonSourceCount:
            WRITER_PROJECT_JSON_SOURCE_POLICY_V1.maxJsonSourceCount,
        },
        sourceMemberProfileId: 'WRITER_PROJECT_MEMBER_PROFILE_V1',
        sourceExtractionPolicyId:
          WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
        sourceExtractionEvidenceId: 'ZIP_BOUNDED_EXTRACTION_EVIDENCE_V1',
        jsonSourceRecords: [],
        presentJsonSourceCount: sources.length,
        aggregateJsonSourceBytes: sources.reduce(
          (total, source) => total + source.sourceBytes,
          0,
        ),
        aggregateDecodedCodeUnits: sources.reduce(
          (total, source) => total + source.decodedCodeUnits,
          0,
        ),
        utf8BomCount: 0,
        diagnostics: [],
        admissionOutcome: 'ADMITTED',
      }),
    );

    const imported = await readOcrProjectPayloadFromReader(sourceSet.reader);
    expect(imported?.manifest.documentFingerprint).toBe('phase3b3b-ocr');
    expect(readBytes).not.toHaveBeenCalled();
    releaseAdmittedProjectJsonSources(sourceSet);
  });
});
