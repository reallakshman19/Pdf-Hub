import type { ProjectArchiveReader } from './projectArchiveReader';
import type {
  AdmittedWriterProjectMemberInventory,
  WriterProjectMemberAdmissionOperation,
} from './writerProjectMemberAdmission';
import type {
  WriterProjectMemberAdmissionRecord,
  WriterProjectMemberClassification,
} from './writerProjectMemberEvidence';
import { WRITER_PROJECT_MEMBER_PROFILE_V1 } from './writerProjectMemberProfile';
import type {
  BoundedZipMemberMetadata,
  BoundedZipMemberSet,
} from './zipMemberSet';
import {
  WRITER_PROJECT_JSON_SOURCE_ADMISSION_EVIDENCE_PROFILE_ID,
  WriterProjectJsonSourceAdmissionError,
  freezeWriterProjectJsonSourceAdmissionEvidence,
  type WriterProjectJsonSourceAdmissionEvidence,
  type WriterProjectJsonSourceAdmissionOutcome,
  type WriterProjectJsonSourceDiagnostic,
  type WriterProjectJsonSourceRecord,
} from './writerProjectJsonSourceEvidence';
import {
  WRITER_PROJECT_JSON_SOURCE_POLICY_V1,
  isWriterProjectJsonSourcePath,
  type WriterProjectJsonSourcePath,
  type WriterProjectJsonSourcePolicyV1,
} from './writerProjectJsonSourcePolicy';
import {
  AdmittedWriterProjectJsonSourceSet,
  type AdmittedProjectJsonSource,
} from './writerProjectJsonSourceSet';

export interface WriterProjectJsonSourceAdmissionDependencies {
  readonly createTextDecoder?: () => TextDecoder;
  readonly beforeSourceSetRegistration?: () => void;
}

interface MutableJsonSourceRecord {
  ordinal: number;
  path: WriterProjectJsonSourcePath;
  memberClassification: WriterProjectMemberClassification;
  actualSourceBytes: number;
  approvedByteLimit: number;
  decodedCodeUnits: number;
  hadUtf8Bom: boolean;
  byteAdmissionOutcome: WriterProjectJsonSourceRecord['byteAdmissionOutcome'];
  utf8AdmissionOutcome: WriterProjectJsonSourceRecord['utf8AdmissionOutcome'];
}

class PendingJsonSourceFailure extends Error {
  readonly outcome: Exclude<WriterProjectJsonSourceAdmissionOutcome, 'ADMITTED'>;
  readonly code: string;
  readonly entryOrdinals: readonly number[];
  readonly cancellationStage?: string;

  constructor(
    outcome: Exclude<WriterProjectJsonSourceAdmissionOutcome, 'ADMITTED'>,
    code: string,
    message: string,
    entryOrdinals: readonly number[] = [],
    cancellationStage?: string,
  ) {
    super(message);
    this.name = 'PendingJsonSourceFailure';
    this.outcome = outcome;
    this.code = code;
    this.entryOrdinals = entryOrdinals;
    this.cancellationStage = cancellationStage;
  }
}

export async function admitWriterProjectJsonSources(
  memberSet: BoundedZipMemberSet,
  memberAdmission: AdmittedWriterProjectMemberInventory,
  reader: ProjectArchiveReader,
  operation?: WriterProjectMemberAdmissionOperation,
): Promise<AdmittedWriterProjectJsonSourceSet> {
  return admitWriterProjectJsonSourcesAgainstPolicy(
    memberSet,
    memberAdmission,
    reader,
    WRITER_PROJECT_JSON_SOURCE_POLICY_V1,
    operation,
  );
}

export async function admitWriterProjectJsonSourcesForTest(
  memberSet: BoundedZipMemberSet,
  memberAdmission: AdmittedWriterProjectMemberInventory,
  reader: ProjectArchiveReader,
  policy: WriterProjectJsonSourcePolicyV1,
  operation?: WriterProjectMemberAdmissionOperation,
  dependencies: WriterProjectJsonSourceAdmissionDependencies = {},
): Promise<AdmittedWriterProjectJsonSourceSet> {
  return admitWriterProjectJsonSourcesAgainstPolicy(
    memberSet,
    memberAdmission,
    reader,
    policy,
    operation,
    dependencies,
  );
}

async function admitWriterProjectJsonSourcesAgainstPolicy(
  memberSet: BoundedZipMemberSet,
  memberAdmission: AdmittedWriterProjectMemberInventory,
  reader: ProjectArchiveReader,
  policy: WriterProjectJsonSourcePolicyV1,
  operation?: WriterProjectMemberAdmissionOperation,
  dependencies: WriterProjectJsonSourceAdmissionDependencies = {},
): Promise<AdmittedWriterProjectJsonSourceSet> {
  const records: MutableJsonSourceRecord[] = [];
  const decodedByPath = new Map<WriterProjectJsonSourcePath, string>();

  try {
    assertPolicyIdentity(policy);
    assertOperationCurrent(operation, 'before Writer project JSON source admission');
    assertProfileConsistency(memberSet, memberAdmission, policy);

    const jsonMembers = memberAdmission.members
      .filter(
        (member) =>
          member.admissionOutcome === 'ADMITTED' &&
          !member.directory &&
          isWriterProjectJsonSourcePath(member.decodedPath, policy),
      )
      .sort((left, right) => left.ordinal - right.ordinal);

    let aggregateSourceBytes = 0;
    for (const member of jsonMembers) {
      assertOperationCurrent(
        operation,
        `before JSON source metadata ordinal ${member.ordinal}`,
      );
      const metadata = memberSet.members.find(
        (candidate) => candidate.path === member.decodedPath,
      );
      const path = member.decodedPath as WriterProjectJsonSourcePath;
      const approvedByteLimit = policy.pathByteLimits[path];
      const record = createRecord(member, metadata, approvedByteLimit);
      records.push(record);

      if (!metadata) {
        record.byteAdmissionOutcome = 'REJECTED';
        fail(
          'REJECTED_MEMBER_METADATA_MISSING',
          'WRITER_PROJECT_JSON_MEMBER_METADATA_MISSING',
          `Bounded extraction metadata is missing for JSON source "${path}".`,
          [member.ordinal],
        );
      }
      if (
        metadata.ordinal !== member.ordinal ||
        metadata.path !== member.decodedPath ||
        member.normalizedPath !== member.decodedPath ||
        !classificationPermitsJson(path, member.classification)
      ) {
        record.byteAdmissionOutcome = 'REJECTED';
        fail(
          'REJECTED_MEMBER_IDENTITY_MISMATCH',
          'WRITER_PROJECT_JSON_MEMBER_IDENTITY_MISMATCH',
          `JSON source identity does not agree across member admission and bounded extraction for "${path}".`,
          [member.ordinal],
        );
      }
      if (metadata.actualExpandedBytes > approvedByteLimit) {
        record.byteAdmissionOutcome = 'REJECTED';
        fail(
          'REJECTED_JSON_MEMBER_BYTES',
          'WRITER_PROJECT_JSON_MEMBER_BYTES_EXCEEDED',
          `JSON source "${path}" has ${metadata.actualExpandedBytes} bytes; the approved limit is ${approvedByteLimit}.`,
          [member.ordinal],
        );
      }

      record.byteAdmissionOutcome = 'ADMITTED';
      aggregateSourceBytes += metadata.actualExpandedBytes;
      assertOperationCurrent(
        operation,
        `after JSON source metadata ordinal ${member.ordinal}`,
      );
    }

    if (records.length > policy.maxJsonSourceCount) {
      fail(
        'REJECTED_JSON_SOURCE_COUNT',
        'WRITER_PROJECT_JSON_SOURCE_COUNT_EXCEEDED',
        `Writer project contains ${records.length} JSON sources; the approved limit is ${policy.maxJsonSourceCount}.`,
        records.map((record) => record.ordinal),
      );
    }
    if (aggregateSourceBytes > policy.maxTotalJsonSourceBytes) {
      fail(
        'REJECTED_TOTAL_JSON_BYTES',
        'WRITER_PROJECT_TOTAL_JSON_BYTES_EXCEEDED',
        `Writer project JSON sources total ${aggregateSourceBytes} bytes; the approved limit is ${policy.maxTotalJsonSourceBytes}.`,
        records.map((record) => record.ordinal),
      );
    }

    assertOperationCurrent(operation, 'before Writer project UTF-8 admission');
    for (const record of records) {
      assertOperationCurrent(
        operation,
        `before UTF-8 decoding JSON source ordinal ${record.ordinal}`,
      );
      let bytes: Uint8Array | null = await reader.readBytes(record.path);
      try {
        if (bytes.byteLength !== record.actualSourceBytes) {
          fail(
            'REJECTED_MEMBER_IDENTITY_MISMATCH',
            'WRITER_PROJECT_JSON_MEMBER_LENGTH_MISMATCH',
            `Read length for JSON source "${record.path}" does not match bounded extraction metadata.`,
            [record.ordinal],
          );
        }
        record.hadUtf8Bom = hasUtf8Bom(bytes);
        const decoded = decodeUtf8InChunks(
          bytes,
          record,
          policy,
          operation,
          dependencies.createTextDecoder,
        );
        record.decodedCodeUnits = decoded.length;
        record.utf8AdmissionOutcome = 'ADMITTED';
        decodedByPath.set(record.path, decoded);
      } catch (error) {
        if (error instanceof PendingJsonSourceFailure) throw error;
        record.utf8AdmissionOutcome = 'REJECTED';
        fail(
          'REJECTED_UTF8',
          'WRITER_PROJECT_JSON_UTF8_INVALID',
          `Writer project JSON source "${record.path}" is not valid UTF-8.`,
          [record.ordinal],
        );
      } finally {
        bytes = null;
      }
      assertOperationCurrent(
        operation,
        `after UTF-8 decoding JSON source ordinal ${record.ordinal}`,
      );
    }

    dependencies.beforeSourceSetRegistration?.();
    assertOperationCurrent(
      operation,
      'before admitted Writer project JSON source-set registration',
    );

    const evidence = buildEvidence(
      memberSet,
      memberAdmission,
      policy,
      records,
      [],
      'ADMITTED',
    );
    const sources: AdmittedProjectJsonSource[] = records.map((record) => ({
      ordinal: record.ordinal,
      path: record.path,
      sourceBytes: record.actualSourceBytes,
      decodedCodeUnits: record.decodedCodeUnits,
      hadUtf8Bom: record.hadUtf8Bom,
    }));
    return AdmittedWriterProjectJsonSourceSet.create(
      sources,
      decodedByPath,
      reader,
      evidence,
    );
  } catch (error) {
    decodedByPath.clear();
    if (error instanceof WriterProjectJsonSourceAdmissionError) throw error;
    if (!(error instanceof PendingJsonSourceFailure)) throw error;
    const diagnostic: WriterProjectJsonSourceDiagnostic = {
      severity: 'error',
      code: error.code,
      message: error.message,
      entryOrdinals: error.entryOrdinals,
    };
    const evidence = buildEvidence(
      memberSet,
      memberAdmission,
      policy,
      records,
      [diagnostic],
      error.outcome,
      error.cancellationStage,
    );
    throw new WriterProjectJsonSourceAdmissionError(evidence, error.message);
  }
}

function decodeUtf8InChunks(
  bytes: Uint8Array,
  record: MutableJsonSourceRecord,
  policy: WriterProjectJsonSourcePolicyV1,
  operation: WriterProjectMemberAdmissionOperation | undefined,
  createTextDecoder: (() => TextDecoder) | undefined,
): string {
  const decoder = createTextDecoder?.() ?? new TextDecoder('utf-8', { fatal: true });
  let decoded = '';
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += policy.utf8DecodeChunkBytes
  ) {
    assertOperationCurrent(
      operation,
      `before UTF-8 chunk for JSON source ordinal ${record.ordinal}`,
    );
    const end = Math.min(
      offset + policy.utf8DecodeChunkBytes,
      bytes.byteLength,
    );
    decoded += decoder.decode(bytes.subarray(offset, end), { stream: true });
    assertOperationCurrent(
      operation,
      `after UTF-8 chunk for JSON source ordinal ${record.ordinal}`,
    );
  }
  assertOperationCurrent(
    operation,
    `before UTF-8 flush for JSON source ordinal ${record.ordinal}`,
  );
  decoded += decoder.decode();
  assertOperationCurrent(
    operation,
    `after UTF-8 flush for JSON source ordinal ${record.ordinal}`,
  );
  return decoded;
}

function createRecord(
  member: WriterProjectMemberAdmissionRecord,
  metadata: BoundedZipMemberMetadata | undefined,
  approvedByteLimit: number,
): MutableJsonSourceRecord {
  return {
    ordinal: member.ordinal,
    path: member.decodedPath as WriterProjectJsonSourcePath,
    memberClassification: member.classification,
    actualSourceBytes: metadata?.actualExpandedBytes ?? 0,
    approvedByteLimit,
    decodedCodeUnits: 0,
    hadUtf8Bom: false,
    byteAdmissionOutcome: 'NOT_EVALUATED',
    utf8AdmissionOutcome: 'NOT_RUN',
  };
}

function buildEvidence(
  memberSet: BoundedZipMemberSet,
  memberAdmission: AdmittedWriterProjectMemberInventory,
  policy: WriterProjectJsonSourcePolicyV1,
  records: readonly MutableJsonSourceRecord[],
  diagnostics: readonly WriterProjectJsonSourceDiagnostic[],
  admissionOutcome: WriterProjectJsonSourceAdmissionOutcome,
  cancellationStage?: string,
): WriterProjectJsonSourceAdmissionEvidence {
  return freezeWriterProjectJsonSourceAdmissionEvidence({
    evidenceProfileId:
      WRITER_PROJECT_JSON_SOURCE_ADMISSION_EVIDENCE_PROFILE_ID,
    policyProfileId: policy.profileId,
    policyAuthority: policy.authority,
    policyLimits: {
      pathByteLimits: policy.pathByteLimits,
      maxTotalJsonSourceBytes: policy.maxTotalJsonSourceBytes,
      utf8DecodeChunkBytes: policy.utf8DecodeChunkBytes,
      maxJsonSourceCount: policy.maxJsonSourceCount,
    },
    sourceMemberProfileId: memberAdmission.profileId,
    sourceExtractionPolicyId: memberSet.evidence.policyProfileId,
    sourceExtractionEvidenceId: memberSet.evidence.profileId,
    jsonSourceRecords: records,
    presentJsonSourceCount: records.length,
    aggregateJsonSourceBytes: records.reduce(
      (total, record) => total + record.actualSourceBytes,
      0,
    ),
    aggregateDecodedCodeUnits: records.reduce(
      (total, record) => total + record.decodedCodeUnits,
      0,
    ),
    utf8BomCount: records.filter((record) => record.hadUtf8Bom).length,
    diagnostics,
    admissionOutcome,
    ...(cancellationStage ? { cancellationStage } : {}),
  });
}

function assertProfileConsistency(
  memberSet: BoundedZipMemberSet,
  memberAdmission: AdmittedWriterProjectMemberInventory,
  policy: WriterProjectJsonSourcePolicyV1,
): void {
  const expectedCatalog = [
    ...WRITER_PROJECT_MEMBER_PROFILE_V1.requiredRootFiles,
    ...WRITER_PROJECT_MEMBER_PROFILE_V1.optionalRootFiles.filter(
      (path): path is 'writer-document-meta.json' =>
        path === 'writer-document-meta.json',
    ),
    ...WRITER_PROJECT_MEMBER_PROFILE_V1.ocrCompatibilityFiles,
  ];
  if (
    memberAdmission.profileId !== policy.sourceMemberProfileId ||
    memberAdmission.evidence.admissionOutcome !== 'ADMITTED' ||
    memberSet.evidence.archiveOutcome !== 'ADMITTED' ||
    memberSet.evidence.profileId !== 'ZIP_BOUNDED_EXTRACTION_EVIDENCE_V1' ||
    memberSet.evidence.policyProfileId !==
      memberAdmission.evidence.sourceExtractionPolicyProfileId ||
    expectedCatalog.length !== policy.jsonSourceCatalog.length ||
    expectedCatalog.some(
      (path, index) => policy.jsonSourceCatalog[index] !== path,
    )
  ) {
    fail(
      'REJECTED_PROFILE_MISMATCH',
      'WRITER_PROJECT_JSON_PROFILE_MISMATCH',
      'Writer project JSON source policy does not agree with admitted member or extraction profiles.',
    );
  }
}

function classificationPermitsJson(
  path: WriterProjectJsonSourcePath,
  classification: WriterProjectMemberClassification,
): boolean {
  if (path.startsWith('ocr/')) {
    return classification === 'OCR_COMPATIBILITY_MEMBER';
  }
  if (path === 'writer-document-meta.json') {
    return classification === 'OPTIONAL_ROOT_MEMBER';
  }
  return classification === 'REQUIRED_ROOT_MEMBER';
}

function assertPolicyIdentity(policy: WriterProjectJsonSourcePolicyV1): void {
  if (
    policy.profileId !== 'WRITER_PROJECT_JSON_SOURCE_POLICY_V1' ||
    policy.authority !== 'OWNER_APPROVED'
  ) {
    throw new Error('Writer project JSON source policy identity is invalid.');
  }
  if (!Number.isInteger(policy.utf8DecodeChunkBytes) || policy.utf8DecodeChunkBytes <= 0) {
    throw new Error('Writer project JSON UTF-8 chunk size is invalid.');
  }
}

function assertOperationCurrent(
  operation: WriterProjectMemberAdmissionOperation | undefined,
  stage: string,
): void {
  if (!operation) return;
  const reason = operation.signal?.reason;
  const reasonText = reason instanceof Error ? reason.message : String(reason ?? '');
  if (operation.signal?.aborted) {
    const stale = /supersed/i.test(reasonText);
    fail(
      stale ? 'STALE_OPERATION' : 'CANCELLED',
      stale
        ? 'WRITER_PROJECT_JSON_ADMISSION_STALE_OPERATION'
        : 'WRITER_PROJECT_JSON_ADMISSION_CANCELLED',
      stale
        ? 'Writer project JSON source admission was superseded by a newer operation.'
        : 'Writer project JSON source admission was cancelled.',
      [],
      stage,
    );
  }
  if (!operation.isMounted()) {
    fail(
      'CANCELLED',
      'WRITER_PROJECT_JSON_ADMISSION_COMPONENT_UNMOUNTED',
      'Writer project JSON source admission was cancelled because the component unmounted.',
      [],
      stage,
    );
  }
  if (!operation.isCurrent()) {
    fail(
      'STALE_OPERATION',
      'WRITER_PROJECT_JSON_ADMISSION_STALE_OPERATION',
      'Writer project JSON source admission was superseded by a newer operation.',
      [],
      stage,
    );
  }
}

function fail(
  outcome: Exclude<WriterProjectJsonSourceAdmissionOutcome, 'ADMITTED'>,
  code: string,
  message: string,
  entryOrdinals: readonly number[] = [],
  cancellationStage?: string,
): never {
  throw new PendingJsonSourceFailure(
    outcome,
    code,
    message,
    entryOrdinals,
    cancellationStage,
  );
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  );
}
