import { describe, expect, it, vi } from 'vitest';
import { buildRawZipFixture } from '@/core/admission/zip/__tests__/zipFixtureBuilder';
import { inspectZipArchive } from '@/core/admission/zip/zipInventory';
import { admitZipArchive } from '@/core/admission/zip/zipAdmission';
import {
  ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID,
  ZipBoundedExtractionError,
  freezeZipExtractionEvidence,
} from '@/core/admission/zip/zipExtractionEvidence';
import { WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1 } from '@/core/admission/zip/zipResourcePolicy';
import {
  stageStandaloneWriterProject,
  type StandaloneWriterProjectOperation,
} from './projectImportController';

describe('standalone Writer project resource admission', () => {
  it('rejects metadata above 160 MiB before arrayBuffer is called', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const file = {
      name: 'oversized.pdfhub.zip',
      type: 'application/zip',
      size: 167_772_161,
      arrayBuffer,
    } as unknown as File;

    await expect(
      stageStandaloneWriterProject(file, operation()),
    ).rejects.toMatchObject({ outcome: 'REJECTED_SOURCE_BYTES' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects contradictory metadata and actual source length before inspection', async () => {
    const inspectArchive = vi.fn();
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0]);
    const file = {
      name: 'mismatch.pdfhub.zip',
      type: 'application/zip',
      size: 4,
      arrayBuffer: vi.fn(async () => bytes.buffer),
    } as unknown as File;

    await expect(
      stageStandaloneWriterProject(file, operation(), { inspectArchive }),
    ).rejects.toMatchObject({ outcome: 'REJECTED_SOURCE_METADATA_MISMATCH' });
    expect(inspectArchive).not.toHaveBeenCalled();
  });

  it('prevents inflater creation and semantic decoding after declared rejection', async () => {
    const fixture = buildRawZipFixture([{ name: 'manifest.json', data: [] }]);
    const inventory = admitZipArchive(inspectZipArchive(fixture.bytes));
    const rejectedInventory = {
      ...inventory,
      measurements: {
        ...inventory.measurements,
        RAW_ENTRY_COUNT: 2_049,
      },
    };
    const extractMembers = vi.fn();
    const decodeProject = vi.fn();

    await expect(
      stageStandaloneWriterProject(fileFromBytes(fixture.bytes), operation(), {
        inspectArchive: () => rejectedInventory,
        extractMembers,
        decodeProject,
      }),
    ).rejects.toMatchObject({ outcome: 'REJECTED_ENTRY_COUNT' });

    expect(extractMembers).not.toHaveBeenCalled();
    expect(decodeProject).not.toHaveBeenCalled();
  });

  it('prevents semantic decoding after actual expansion rejection', async () => {
    const fixture = buildRawZipFixture([{ name: 'manifest.json', data: [] }]);
    const inventory = admitZipArchive(inspectZipArchive(fixture.bytes));
    const evidence = freezeZipExtractionEvidence({
      profileId: ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID,
      policyProfileId: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
      policyAuthority: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.authority,
      policyLimits: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits,
      sourceBytes: fixture.bytes.byteLength,
      rawEntryCount: inventory.measurements.RAW_ENTRY_COUNT,
      declaredArchiveMeasurements: inventory.measurements,
      declaredAdmissionOutcome: 'ADMITTED',
      memberEvidence: [],
      actualExpandedArchiveBytes: 0,
      peakActiveExtractionBytes: 0,
      largestOutputChunkBytes: 0,
      extractedMemberCount: 0,
      skippedDirectoryCount: 0,
      classifiedMemberCounts: {
        KNOWN_PROJECT_MEMBER: 0,
        ASSET_MEMBER: 0,
        OCR_COMPATIBILITY_MEMBER: 0,
        UNCLASSIFIED_MEMBER_POLICY_DEFERRED: 0,
      },
      diagnostics: [{
        severity: 'error',
        code: 'ZIP_ACTUAL_MEMBER_BYTES_EXCEEDED',
        message: 'Injected actual expansion rejection.',
        entryOrdinals: [0],
      }],
      archiveOutcome: 'REJECTED_ACTUAL_MEMBER_BYTES',
    });
    const extractMembers = vi.fn(async () => {
      throw new ZipBoundedExtractionError(evidence);
    });
    const decodeProject = vi.fn();

    await expect(
      stageStandaloneWriterProject(fileFromBytes(fixture.bytes), operation(), {
        extractMembers,
        decodeProject,
      }),
    ).rejects.toMatchObject({ outcome: 'REJECTED_ACTUAL_MEMBER_BYTES' });

    expect(extractMembers).toHaveBeenCalledOnce();
    expect(decodeProject).not.toHaveBeenCalled();
  });

  it('does not invoke semantic decoding after extraction cancellation', async () => {
    const fixture = buildRawZipFixture([{ name: 'manifest.json', data: [] }]);
    const controller = new AbortController();
    const decodeProject = vi.fn();
    const extractMembers = vi.fn(async () => {
      controller.abort('cancel during extraction');
      const inventory = admitZipArchive(inspectZipArchive(fixture.bytes));
      const evidence = freezeZipExtractionEvidence({
        profileId: ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID,
        policyProfileId: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
        policyAuthority: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.authority,
        policyLimits: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits,
        sourceBytes: fixture.bytes.byteLength,
        rawEntryCount: inventory.measurements.RAW_ENTRY_COUNT,
        declaredArchiveMeasurements: inventory.measurements,
        declaredAdmissionOutcome: 'ADMITTED',
        memberEvidence: [],
        actualExpandedArchiveBytes: 0,
        peakActiveExtractionBytes: 0,
        largestOutputChunkBytes: 0,
        extractedMemberCount: 0,
        skippedDirectoryCount: 0,
        classifiedMemberCounts: {
          KNOWN_PROJECT_MEMBER: 0,
          ASSET_MEMBER: 0,
          OCR_COMPATIBILITY_MEMBER: 0,
          UNCLASSIFIED_MEMBER_POLICY_DEFERRED: 0,
        },
        diagnostics: [{
          severity: 'error',
          code: 'ZIP_EXTRACTION_CANCELLED',
          message: 'Injected extraction cancellation.',
          entryOrdinals: [],
        }],
        archiveOutcome: 'CANCELLED',
        cancellationStage: 'during extraction',
      });
      throw new ZipBoundedExtractionError(evidence);
    });

    await expect(
      stageStandaloneWriterProject(
        fileFromBytes(fixture.bytes),
        operation(controller.signal),
        { extractMembers, decodeProject },
      ),
    ).rejects.toMatchObject({ outcome: 'CANCELLED' });
    expect(decodeProject).not.toHaveBeenCalled();
  });
});

function operation(signal?: AbortSignal): StandaloneWriterProjectOperation {
  return {
    operationId: 'phase3b2-resource-operation',
    generation: 1,
    signal,
    isCurrent: () => !signal?.aborted,
    isMounted: () => true,
  };
}

function fileFromBytes(bytes: Uint8Array): File {
  return new File([Uint8Array.from(bytes).buffer], 'project.pdfhub.zip', {
    type: 'application/zip',
  });
}
