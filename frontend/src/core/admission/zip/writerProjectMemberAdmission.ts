import type {
  ZipArchiveEntryInventory,
  ZipArchiveInventory,
} from './zipTypes';
import { WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1 } from './zipResourcePolicy';
import {
  WRITER_PROJECT_MEMBER_PROFILE_V1,
  type WriterProjectMemberProfileV1,
  type WriterProjectOptionalRootFile,
  type WriterProjectRequiredRootFile,
} from './writerProjectMemberProfile';
import {
  WRITER_PROJECT_MEMBER_ADMISSION_EVIDENCE_PROFILE_ID,
  WriterProjectMemberAdmissionError,
  freezeWriterProjectMemberAdmissionEvidence,
  type WriterProjectMemberAdmissionDiagnostic,
  type WriterProjectMemberAdmissionEvidence,
  type WriterProjectMemberAdmissionOutcome,
  type WriterProjectMemberAdmissionRecord,
  type WriterProjectMemberClassification,
  type WriterProjectOptionalRoleStatus,
  type WriterProjectRequiredRoleStatus,
} from './writerProjectMemberEvidence';

export interface WriterProjectMemberAdmissionOperation {
  readonly operationId: string;
  readonly generation: number;
  readonly signal?: AbortSignal;
  readonly isCurrent: () => boolean;
  readonly isMounted: () => boolean;
}

export interface AdmittedWriterProjectMemberInventory {
  readonly profileId: WriterProjectMemberProfileV1['profileId'];
  readonly members: readonly WriterProjectMemberAdmissionRecord[];
  readonly evidence: WriterProjectMemberAdmissionEvidence;
}

interface ClassifiedMember {
  readonly record: WriterProjectMemberAdmissionRecord;
  readonly diagnostic?: WriterProjectMemberAdmissionDiagnostic;
}

class PendingMemberAdmissionFailure extends Error {
  readonly outcome: 'CANCELLED' | 'STALE_OPERATION';
  readonly code: string;
  readonly cancellationStage: string;

  constructor(
    outcome: 'CANCELLED' | 'STALE_OPERATION',
    code: string,
    message: string,
    cancellationStage: string,
  ) {
    super(message);
    this.name = 'PendingMemberAdmissionFailure';
    this.outcome = outcome;
    this.code = code;
    this.cancellationStage = cancellationStage;
  }
}

export function admitWriterProjectMembers(
  inventory: ZipArchiveInventory,
  operation?: WriterProjectMemberAdmissionOperation,
): AdmittedWriterProjectMemberInventory {
  return admitWriterProjectMembersAgainstProfile(
    inventory,
    WRITER_PROJECT_MEMBER_PROFILE_V1,
    operation,
  );
}

export function admitWriterProjectMembersForTest(
  inventory: ZipArchiveInventory,
  profile: WriterProjectMemberProfileV1,
  operation?: WriterProjectMemberAdmissionOperation,
): AdmittedWriterProjectMemberInventory {
  return admitWriterProjectMembersAgainstProfile(inventory, profile, operation);
}

function admitWriterProjectMembersAgainstProfile(
  inventory: ZipArchiveInventory,
  profile: WriterProjectMemberProfileV1,
  operation?: WriterProjectMemberAdmissionOperation,
): AdmittedWriterProjectMemberInventory {
  assertProfileIdentity(profile);

  const records: WriterProjectMemberAdmissionRecord[] = [];
  const diagnostics: WriterProjectMemberAdmissionDiagnostic[] = [];
  const orderedEntries = [...inventory.entries].sort(
    (left, right) => left.ordinal - right.ordinal,
  );

  try {
    assertOperationCurrent(operation, 'before Writer project member admission');

    for (const entry of orderedEntries) {
      assertOperationCurrent(
        operation,
        `before Writer project member ordinal ${entry.ordinal}`,
      );
      const classified = classifyMember(entry, profile);
      records.push(classified.record);
      if (classified.diagnostic) diagnostics.push(classified.diagnostic);
      assertOperationCurrent(
        operation,
        `after Writer project member ordinal ${entry.ordinal}`,
      );
    }

    assertOperationCurrent(
      operation,
      'after Writer project member classification',
    );

    if (diagnostics.length === 0) {
      appendMissingRequiredDiagnostics(records, profile, diagnostics);
    }

    assertOperationCurrent(
      operation,
      'after Writer project required-member verification',
    );

    const admissionOutcome = diagnostics[0]
      ? outcomeForDiagnostic(diagnostics[0])
      : 'ADMITTED';
    const evidence = buildEvidence(
      inventory,
      profile,
      records,
      diagnostics,
      admissionOutcome,
    );

    if (admissionOutcome !== 'ADMITTED') {
      throw new WriterProjectMemberAdmissionError(evidence);
    }

    return Object.freeze({
      profileId: profile.profileId,
      members: evidence.memberRecords,
      evidence,
    });
  } catch (error) {
    if (error instanceof WriterProjectMemberAdmissionError) throw error;
    if (!(error instanceof PendingMemberAdmissionFailure)) throw error;

    const cancellationDiagnostic: WriterProjectMemberAdmissionDiagnostic = {
      severity: 'error',
      code: error.code,
      message: error.message,
      entryOrdinals: [],
    };
    const evidence = buildEvidence(
      inventory,
      profile,
      records,
      [...diagnostics, cancellationDiagnostic],
      error.outcome,
      error.cancellationStage,
    );
    throw new WriterProjectMemberAdmissionError(evidence, error.message);
  }
}

function classifyMember(
  entry: ZipArchiveEntryInventory,
  profile: WriterProjectMemberProfileV1,
): ClassifiedMember {
  const decodedPath = entry.decodedFilename;

  if (includesPath(profile.requiredRootFiles, decodedPath)) {
    return classifyFixedMember(
      entry,
      'REQUIRED_ROOT_MEMBER',
      decodedPath,
    );
  }

  if (includesPath(profile.optionalRootFiles, decodedPath)) {
    return classifyFixedMember(
      entry,
      'OPTIONAL_ROOT_MEMBER',
      decodedPath,
    );
  }

  if (decodedPath === profile.assetNamespace.root) {
    return classifyDirectoryMarker(
      entry,
      'ASSET_DIRECTORY',
      profile.assetNamespace.root,
    );
  }

  if (decodedPath === 'ocr/' && profile.allowedDirectoryMarkers.includes('ocr/')) {
    return classifyDirectoryMarker(entry, 'OCR_DIRECTORY', 'ocr/');
  }

  if (includesPath(profile.ocrCompatibilityFiles, decodedPath)) {
    return classifyFixedMember(
      entry,
      'OCR_COMPATIBILITY_MEMBER',
      decodedPath,
    );
  }

  if (decodedPath.startsWith(profile.assetNamespace.root)) {
    return classifyAssetMember(entry, profile.assetNamespace.root);
  }

  if (decodedPath.startsWith('ocr/')) {
    return rejectedMember(
      entry,
      'UNKNOWN_MEMBER',
      'REJECTED_INVALID_OCR_NAMESPACE',
      'WRITER_PROJECT_INVALID_OCR_NAMESPACE',
      `Writer project member "${decodedPath}" is not in the approved OCR compatibility catalog.`,
    );
  }

  if (entry.directory) {
    return rejectedMember(
      entry,
      'UNKNOWN_MEMBER',
      'REJECTED_UNEXPECTED_DIRECTORY',
      'WRITER_PROJECT_UNEXPECTED_DIRECTORY',
      `Writer project directory "${decodedPath}" is not permitted by the static member profile.`,
    );
  }

  return rejectedMember(
    entry,
    'UNKNOWN_MEMBER',
    'REJECTED_UNKNOWN_MEMBER',
    'WRITER_PROJECT_UNKNOWN_MEMBER',
    `Writer project member "${decodedPath}" is not permitted by the static member profile.`,
  );
}

function classifyFixedMember(
  entry: ZipArchiveEntryInventory,
  classification: Exclude<
    WriterProjectMemberClassification,
    'ASSET_DIRECTORY' | 'ASSET_MEMBER' | 'OCR_DIRECTORY' | 'UNKNOWN_MEMBER'
  >,
  role: string,
): ClassifiedMember {
  if (entry.directory) {
    return rejectedMember(
      entry,
      classification,
      'REJECTED_MEMBER_KIND',
      'WRITER_PROJECT_MEMBER_KIND_INVALID',
      `Writer project member "${entry.decodedFilename}" must be a regular file.`,
      role,
    );
  }
  return admittedMember(entry, classification, role);
}

function classifyDirectoryMarker(
  entry: ZipArchiveEntryInventory,
  classification: 'ASSET_DIRECTORY' | 'OCR_DIRECTORY',
  role: string,
): ClassifiedMember {
  if (!entry.directory) {
    return rejectedMember(
      entry,
      classification,
      'REJECTED_MEMBER_KIND',
      'WRITER_PROJECT_MEMBER_KIND_INVALID',
      `Writer project member "${entry.decodedFilename}" must be a directory marker.`,
      role,
    );
  }
  return admittedMember(entry, classification, role);
}

function classifyAssetMember(
  entry: ZipArchiveEntryInventory,
  assetRoot: 'assets/',
): ClassifiedMember {
  const leaf = entry.decodedFilename.slice(assetRoot.length);
  const trimmedLeaf = leaf.trim();
  const directLeaf =
    leaf.length > 0 &&
    !leaf.includes('/') &&
    trimmedLeaf.length > 0 &&
    trimmedLeaf !== '.' &&
    trimmedLeaf !== '..';

  if (!directLeaf) {
    return rejectedMember(
      entry,
      'UNKNOWN_MEMBER',
      'REJECTED_INVALID_ASSET_NAMESPACE',
      'WRITER_PROJECT_INVALID_ASSET_NAMESPACE',
      `Writer project asset member "${entry.decodedFilename}" must be a direct file child of ${assetRoot}.`,
    );
  }

  if (entry.directory) {
    return rejectedMember(
      entry,
      'ASSET_MEMBER',
      'REJECTED_MEMBER_KIND',
      'WRITER_PROJECT_MEMBER_KIND_INVALID',
      `Writer project asset member "${entry.decodedFilename}" must be a regular file.`,
      assetRoot,
    );
  }

  return admittedMember(entry, 'ASSET_MEMBER', assetRoot);
}

function admittedMember(
  entry: ZipArchiveEntryInventory,
  classification: WriterProjectMemberClassification,
  role?: string,
): ClassifiedMember {
  return {
    record: Object.freeze({
      ordinal: entry.ordinal,
      normalizedPath: entry.normalizedFilename,
      decodedPath: entry.decodedFilename,
      directory: entry.directory,
      classification,
      ...(role ? { role } : {}),
      admissionOutcome: 'ADMITTED' as const,
    }),
  };
}

function rejectedMember(
  entry: ZipArchiveEntryInventory,
  classification: WriterProjectMemberClassification,
  outcome: Exclude<
    WriterProjectMemberAdmissionOutcome,
    | 'ADMITTED'
    | 'REJECTED_REQUIRED_MEMBER_MISSING'
    | 'CANCELLED'
    | 'STALE_OPERATION'
  >,
  code: string,
  message: string,
  role?: string,
): ClassifiedMember {
  return {
    record: Object.freeze({
      ordinal: entry.ordinal,
      normalizedPath: entry.normalizedFilename,
      decodedPath: entry.decodedFilename,
      directory: entry.directory,
      classification,
      ...(role ? { role } : {}),
      admissionOutcome: outcome,
    }),
    diagnostic: Object.freeze({
      severity: 'error' as const,
      code,
      message,
      entryOrdinals: Object.freeze([entry.ordinal]),
    }),
  };
}

function appendMissingRequiredDiagnostics(
  records: readonly WriterProjectMemberAdmissionRecord[],
  profile: WriterProjectMemberProfileV1,
  diagnostics: WriterProjectMemberAdmissionDiagnostic[],
): void {
  for (const required of profile.requiredRootFiles) {
    const present = records.some(
      (record) =>
        record.classification === 'REQUIRED_ROOT_MEMBER' &&
        record.role === required &&
        record.admissionOutcome === 'ADMITTED',
    );
    if (present) continue;
    diagnostics.push(
      Object.freeze({
        severity: 'error' as const,
        code: 'WRITER_PROJECT_REQUIRED_MEMBER_MISSING',
        message: `Writer project archive is missing required root member "${required}".`,
        entryOrdinals: Object.freeze([]),
      }),
    );
  }
}

function buildEvidence(
  inventory: ZipArchiveInventory,
  profile: WriterProjectMemberProfileV1,
  records: readonly WriterProjectMemberAdmissionRecord[],
  diagnostics: readonly WriterProjectMemberAdmissionDiagnostic[],
  admissionOutcome: WriterProjectMemberAdmissionOutcome,
  cancellationStage?: string,
): WriterProjectMemberAdmissionEvidence {
  const classificationCounts = emptyClassificationCounts();
  for (const record of records) {
    classificationCounts[record.classification] += 1;
  }

  const requiredRoleStatus = profile.requiredRootFiles.map((role) =>
    roleStatus<WriterProjectRequiredRootFile>(records, role),
  );
  const optionalRoleStatus = profile.optionalRootFiles.map((role) =>
    roleStatus<WriterProjectOptionalRootFile>(records, role),
  );

  return freezeWriterProjectMemberAdmissionEvidence({
    evidenceProfileId: WRITER_PROJECT_MEMBER_ADMISSION_EVIDENCE_PROFILE_ID,
    profileId: profile.profileId,
    profileAuthority: profile.authority,
    sourceStructuralProfileId: inventory.profileId,
    sourceStructuralOutcome: inventory.outcome,
    sourceExtractionPolicyProfileId:
      WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
    rawEntryCount: inventory.measurements.RAW_ENTRY_COUNT,
    memberRecords: records,
    classificationCounts,
    requiredRoleStatus,
    optionalRoleStatus,
    assetMemberCount: classificationCounts.ASSET_MEMBER,
    ocrCompatibilityMemberCount:
      classificationCounts.OCR_COMPATIBILITY_MEMBER,
    unknownMemberCount: classificationCounts.UNKNOWN_MEMBER,
    diagnostics,
    admissionOutcome,
    ...(cancellationStage ? { cancellationStage } : {}),
  });
}

function roleStatus<T extends string>(
  records: readonly WriterProjectMemberAdmissionRecord[],
  role: T,
): T extends WriterProjectRequiredRootFile
  ? WriterProjectRequiredRoleStatus
  : WriterProjectOptionalRoleStatus {
  const record = records.find(
    (candidate) =>
      candidate.role === role && candidate.admissionOutcome === 'ADMITTED',
  );
  return {
    role,
    present: Boolean(record),
    ...(record ? { ordinal: record.ordinal } : {}),
  } as T extends WriterProjectRequiredRootFile
    ? WriterProjectRequiredRoleStatus
    : WriterProjectOptionalRoleStatus;
}

function emptyClassificationCounts(): Record<
  WriterProjectMemberClassification,
  number
> {
  return {
    REQUIRED_ROOT_MEMBER: 0,
    OPTIONAL_ROOT_MEMBER: 0,
    ASSET_DIRECTORY: 0,
    ASSET_MEMBER: 0,
    OCR_DIRECTORY: 0,
    OCR_COMPATIBILITY_MEMBER: 0,
    UNKNOWN_MEMBER: 0,
  };
}

function outcomeForDiagnostic(
  diagnostic: WriterProjectMemberAdmissionDiagnostic,
): WriterProjectMemberAdmissionOutcome {
  switch (diagnostic.code) {
    case 'WRITER_PROJECT_INVALID_ASSET_NAMESPACE':
      return 'REJECTED_INVALID_ASSET_NAMESPACE';
    case 'WRITER_PROJECT_INVALID_OCR_NAMESPACE':
      return 'REJECTED_INVALID_OCR_NAMESPACE';
    case 'WRITER_PROJECT_UNEXPECTED_DIRECTORY':
      return 'REJECTED_UNEXPECTED_DIRECTORY';
    case 'WRITER_PROJECT_REQUIRED_MEMBER_MISSING':
      return 'REJECTED_REQUIRED_MEMBER_MISSING';
    case 'WRITER_PROJECT_MEMBER_KIND_INVALID':
      return 'REJECTED_MEMBER_KIND';
    default:
      return 'REJECTED_UNKNOWN_MEMBER';
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
    throw new PendingMemberAdmissionFailure(
      stale ? 'STALE_OPERATION' : 'CANCELLED',
      stale
        ? 'WRITER_PROJECT_MEMBER_ADMISSION_STALE_OPERATION'
        : 'WRITER_PROJECT_MEMBER_ADMISSION_CANCELLED',
      stale
        ? 'Writer project member admission was superseded by a newer operation.'
        : 'Writer project member admission was cancelled.',
      stage,
    );
  }
  if (!operation.isMounted()) {
    throw new PendingMemberAdmissionFailure(
      'CANCELLED',
      'WRITER_PROJECT_MEMBER_ADMISSION_COMPONENT_UNMOUNTED',
      'Writer project member admission was cancelled because the component unmounted.',
      stage,
    );
  }
  if (!operation.isCurrent()) {
    throw new PendingMemberAdmissionFailure(
      'STALE_OPERATION',
      'WRITER_PROJECT_MEMBER_ADMISSION_STALE_OPERATION',
      'Writer project member admission was superseded by a newer operation.',
      stage,
    );
  }
}

function assertProfileIdentity(profile: WriterProjectMemberProfileV1): void {
  if (
    profile.profileId !== 'WRITER_PROJECT_MEMBER_PROFILE_V1' ||
    profile.authority !== 'OWNER_APPROVED'
  ) {
    throw new Error('Writer project member profile identity is invalid.');
  }
}

function includesPath(
  paths: readonly string[],
  value: string,
): boolean {
  return paths.includes(value);
}
