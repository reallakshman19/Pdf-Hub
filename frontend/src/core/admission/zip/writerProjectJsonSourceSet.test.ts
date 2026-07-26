import { describe, expect, it, vi } from 'vitest';
import type { ProjectArchiveReader } from './projectArchiveReader';
import {
  freezeWriterProjectJsonSourceAdmissionEvidence,
  type WriterProjectJsonSourceAdmissionEvidence,
} from './writerProjectJsonSourceEvidence';
import { WRITER_PROJECT_JSON_SOURCE_POLICY_V1 } from './writerProjectJsonSourcePolicy';
import {
  AdmittedWriterProjectJsonSourceSet,
  releaseAdmittedProjectJsonSources,
} from './writerProjectJsonSourceSet';
import { WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1 } from './zipResourcePolicy';

describe('AdmittedWriterProjectJsonSourceSet', () => {
  it('reuses admitted text, delegates binary reads, and releases strings', async () => {
    const readBytes = vi.fn(async () => Uint8Array.from([1, 2, 3]));
    const underlying: ProjectArchiveReader = {
      has: (path) => path === 'manifest.json' || path === 'original.pdf',
      readBytes,
      readText: vi.fn(async () => {
        throw new Error('underlying text decode must not run');
      }),
      listPaths: () => Object.freeze(['manifest.json', 'original.pdf']),
    };
    const sourceSet = AdmittedWriterProjectJsonSourceSet.create(
      [{
        ordinal: 0,
        path: 'manifest.json',
        sourceBytes: 2,
        decodedCodeUnits: 2,
        hadUtf8Bom: false,
      }],
      new Map([['manifest.json', '{}']]),
      underlying,
      evidence(),
    );

    expect(await sourceSet.reader.readText('manifest.json')).toBe('{}');
    expect(readBytes).not.toHaveBeenCalled();
    expect(await sourceSet.reader.readBytes('original.pdf')).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
    await expect(sourceSet.reader.readText('original.pdf')).rejects.toThrow(
      'was not admitted as a JSON source',
    );
    expect(sourceSet.reader.listPaths()).toEqual(['manifest.json', 'original.pdf']);

    releaseAdmittedProjectJsonSources(sourceSet);
    await expect(sourceSet.reader.readText('manifest.json')).rejects.toThrow(
      'no longer available',
    );
    expect(sourceSet.evidence.admissionOutcome).toBe('ADMITTED');
  });
});

function evidence(): WriterProjectJsonSourceAdmissionEvidence {
  return freezeWriterProjectJsonSourceAdmissionEvidence({
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
    presentJsonSourceCount: 0,
    aggregateJsonSourceBytes: 0,
    aggregateDecodedCodeUnits: 0,
    utf8BomCount: 0,
    diagnostics: [],
    admissionOutcome: 'ADMITTED',
  });
}
