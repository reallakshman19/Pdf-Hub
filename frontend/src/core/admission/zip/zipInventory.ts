import {
  ZIP_ARCHIVE_FORMAT_PROFILE,
  ZIP_STRUCTURAL_ADMISSION_PROFILE_ID,
  type ZipArchiveByteRange,
  type ZipArchiveCollisionGroup,
  type ZipArchiveDiagnostic,
  type ZipArchiveEntryInventory,
  type ZipArchiveInventory,
  type ZipArchiveMeasurements,
  type ZipCentralDirectoryInventory,
  type ZipEndOfCentralDirectoryInventory,
  type ZipStructuralAdmissionOutcome,
} from './zipTypes';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const EOCD_FIXED_BYTES = 22;
const CENTRAL_DIRECTORY_FIXED_BYTES = 46;
const LOCAL_FILE_HEADER_FIXED_BYTES = 30;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const RELEVANT_FLAG_BITS = [0, 1, 2, 3, 6, 11, 13] as const;

interface MutableEntry {
  ordinal: number;
  rawFilenameBytes: readonly number[];
  decodedFilename: string;
  normalizedFilename: string;
  generalPurposeFlags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  filenameLength: number;
  extraFieldLength: number;
  commentLength: number;
  externalAttributes: number;
  directory: boolean;
  localHeaderRange: ZipArchiveByteRange | null;
  localFilenameRange: ZipArchiveByteRange | null;
  localExtraFieldRange: ZipArchiveByteRange | null;
  compressedDataRange: ZipArchiveByteRange | null;
}

interface InspectionProblem {
  readonly outcome: Exclude<ZipStructuralAdmissionOutcome, 'ADMITTED' | 'CANCELLED'>;
  readonly code: string;
  readonly message: string;
  readonly entryOrdinals: readonly number[];
}

interface InspectionState {
  readonly sourceBytes: number;
  eocd: ZipEndOfCentralDirectoryInventory | null;
  centralDirectory: ZipCentralDirectoryInventory | null;
  readonly entries: MutableEntry[];
  readonly collisions: ZipArchiveCollisionGroup[];
  readonly regions: ZipArchiveByteRange[];
  readonly problems: InspectionProblem[];
  archiveCommentBytes: number;
}

class ZipInspectionFailure extends Error {
  readonly outcome: InspectionProblem['outcome'];
  readonly code: string;
  readonly entryOrdinals: readonly number[];

  constructor(
    outcome: InspectionProblem['outcome'],
    code: string,
    message: string,
    entryOrdinals: readonly number[] = [],
  ) {
    super(message);
    this.name = 'ZipInspectionFailure';
    this.outcome = outcome;
    this.code = code;
    this.entryOrdinals = entryOrdinals;
  }
}

export function inspectZipArchive(bytes: Uint8Array): ZipArchiveInventory {
  const state: InspectionState = {
    sourceBytes: bytes.byteLength,
    eocd: null,
    centralDirectory: null,
    entries: [],
    collisions: [],
    regions: [],
    problems: [],
    archiveCommentBytes: 0,
  };

  try {
    const eocd = parseEndOfCentralDirectory(bytes);
    state.eocd = eocd;
    state.archiveCommentBytes = eocd.commentBytes;
    state.regions.push({
      kind: 'EOCD',
      start: eocd.offset,
      end: bytes.byteLength,
    });

    const centralDirectoryEnd = safeAdd(
      eocd.centralDirectoryOffset,
      eocd.centralDirectoryBytes,
      'central-directory range',
    );
    state.centralDirectory = {
      offset: eocd.centralDirectoryOffset,
      bytes: eocd.centralDirectoryBytes,
      end: centralDirectoryEnd,
      recordCount: eocd.totalRecords,
    };
    state.regions.push({
      kind: 'CENTRAL_DIRECTORY',
      start: eocd.centralDirectoryOffset,
      end: centralDirectoryEnd,
    });

    validateEndOfCentralDirectory(bytes, eocd, centralDirectoryEnd);
    parseCentralDirectory(bytes, state);
    inspectLocalHeaders(bytes, state);
    inspectCollisions(state);
    inspectEntryRegionOverlap(state);
    inspectArchivePreamble(state);
  } catch (error) {
    if (error instanceof ZipInspectionFailure) {
      recordProblem(
        state,
        error.outcome,
        error.code,
        error.message,
        error.entryOrdinals,
      );
    } else {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_INSPECTION_UNEXPECTED_FAILURE',
        'Writer project archive could not be inspected deterministically.',
        [],
      );
    }
  }

  return finalizeInventory(state);
}

function parseEndOfCentralDirectory(bytes: Uint8Array): ZipEndOfCentralDirectoryInventory {
  if (bytes.byteLength < EOCD_FIXED_BYTES) {
    throw failure(
      'REJECTED_MALFORMED',
      'ZIP_EOCD_TRUNCATED',
      'Writer project archive end-of-central-directory record is truncated.',
    );
  }

  const searchStart = bytes.byteLength - EOCD_FIXED_BYTES;
  const searchEnd = Math.max(
    0,
    bytes.byteLength - EOCD_FIXED_BYTES - MAX_ZIP_COMMENT_BYTES,
  );
  let sawSignature = false;

  for (let offset = searchStart; offset >= searchEnd; offset -= 1) {
    if (!hasSignature(bytes, offset, EOCD_SIGNATURE)) continue;
    sawSignature = true;
    const commentBytes = readUint16(bytes, offset + 20, 'EOCD comment length');
    const expectedEnd = safeAdd(
      offset,
      EOCD_FIXED_BYTES,
      commentBytes,
      'EOCD comment range',
    );
    if (expectedEnd !== bytes.byteLength) continue;

    return {
      offset,
      diskNumber: readUint16(bytes, offset + 4, 'EOCD disk number'),
      centralDirectoryStartDisk: readUint16(
        bytes,
        offset + 6,
        'EOCD central-directory start disk',
      ),
      recordsOnDisk: readUint16(bytes, offset + 8, 'EOCD records on disk'),
      totalRecords: readUint16(bytes, offset + 10, 'EOCD total records'),
      centralDirectoryBytes: readUint32(
        bytes,
        offset + 12,
        'EOCD central-directory byte length',
      ),
      centralDirectoryOffset: readUint32(
        bytes,
        offset + 16,
        'EOCD central-directory offset',
      ),
      commentBytes,
    };
  }

  if (sawSignature) {
    throw failure(
      'REJECTED_MALFORMED',
      'ZIP_EOCD_COMMENT_RANGE_INVALID',
      'Writer project archive has an impossible end-of-central-directory comment length.',
    );
  }

  throw failure(
    'REJECTED_MALFORMED',
    'ZIP_EOCD_MISSING',
    'Writer project archive is missing an end-of-central-directory record.',
  );
}

function validateEndOfCentralDirectory(
  bytes: Uint8Array,
  eocd: ZipEndOfCentralDirectoryInventory,
  centralDirectoryEnd: number,
): void {
  if (eocd.diskNumber !== 0 || eocd.centralDirectoryStartDisk !== 0) {
    throw failure(
      'REJECTED_UNSUPPORTED',
      'ZIP_MULTI_DISK_UNSUPPORTED',
      'Writer project archive uses unsupported multi-disk ZIP structures.',
    );
  }
  if (eocd.recordsOnDisk !== eocd.totalRecords) {
    throw failure(
      'REJECTED_UNSUPPORTED',
      'ZIP_MULTI_DISK_RECORD_COUNT',
      'Writer project archive has inconsistent single-disk record counts.',
    );
  }
  if (
    eocd.recordsOnDisk === UINT16_MAX ||
    eocd.totalRecords === UINT16_MAX ||
    eocd.centralDirectoryBytes === UINT32_MAX ||
    eocd.centralDirectoryOffset === UINT32_MAX ||
    hasZip64Locator(bytes, eocd.offset) ||
    hasZip64EndRecord(bytes, eocd.offset)
  ) {
    throw failure(
      'REJECTED_UNSUPPORTED',
      'ZIP64_UNSUPPORTED',
      'Writer project archive uses unsupported ZIP64 structures.',
    );
  }
  if (centralDirectoryEnd > bytes.byteLength) {
    throw failure(
      'REJECTED_RANGE_CONFLICT',
      'ZIP_CENTRAL_DIRECTORY_OUT_OF_RANGE',
      'Writer project archive central directory is outside the source bytes.',
    );
  }
  if (centralDirectoryEnd !== eocd.offset) {
    throw failure(
      'REJECTED_RANGE_CONFLICT',
      'ZIP_CENTRAL_DIRECTORY_EOCD_GAP',
      'Writer project archive central directory does not terminate at the end-of-central-directory record.',
    );
  }
}

function parseCentralDirectory(bytes: Uint8Array, state: InspectionState): void {
  const centralDirectory = state.centralDirectory;
  if (!centralDirectory) {
    throw failure(
      'REJECTED_MALFORMED',
      'ZIP_CENTRAL_DIRECTORY_MISSING',
      'Writer project archive central-directory metadata is unavailable.',
    );
  }

  let cursor = centralDirectory.offset;
  for (let ordinal = 0; ordinal < centralDirectory.recordCount; ordinal += 1) {
    const fixedEnd = safeAdd(
      cursor,
      CENTRAL_DIRECTORY_FIXED_BYTES,
      'central-directory fixed record',
    );
    if (fixedEnd > centralDirectory.end) {
      throw failure(
        'REJECTED_MALFORMED',
        'ZIP_CENTRAL_DIRECTORY_RECORD_TRUNCATED',
        'Writer project archive contains a truncated central-directory record.',
        [ordinal],
      );
    }
    if (!hasSignature(bytes, cursor, CENTRAL_DIRECTORY_SIGNATURE)) {
      throw failure(
        'REJECTED_MALFORMED',
        'ZIP_CENTRAL_DIRECTORY_SIGNATURE_INVALID',
        'Writer project archive contains an invalid central-directory record signature.',
        [ordinal],
      );
    }

    const flags = readUint16(bytes, cursor + 8, 'central entry flags');
    const compressionMethod = readUint16(bytes, cursor + 10, 'central entry method');
    const crc32 = readUint32(bytes, cursor + 16, 'central entry CRC-32');
    const compressedSize = readUint32(bytes, cursor + 20, 'central compressed size');
    const uncompressedSize = readUint32(bytes, cursor + 24, 'central uncompressed size');
    const filenameLength = readUint16(bytes, cursor + 28, 'central filename length');
    const extraFieldLength = readUint16(bytes, cursor + 30, 'central extra-field length');
    const commentLength = readUint16(bytes, cursor + 32, 'central comment length');
    const diskStart = readUint16(bytes, cursor + 34, 'central entry disk start');
    const externalAttributes = readUint32(bytes, cursor + 38, 'central external attributes');
    const localHeaderOffset = readUint32(bytes, cursor + 42, 'central local-header offset');
    const recordEnd = safeAdd(
      fixedEnd,
      filenameLength,
      extraFieldLength,
      commentLength,
      'central-directory variable record',
    );
    if (recordEnd > centralDirectory.end) {
      throw failure(
        'REJECTED_MALFORMED',
        'ZIP_CENTRAL_DIRECTORY_VARIABLE_FIELDS_TRUNCATED',
        'Writer project archive contains malformed central-directory variable field lengths.',
        [ordinal],
      );
    }

    const rawFilename = bytes.slice(fixedEnd, fixedEnd + filenameLength);
    const centralExtra = bytes.slice(
      fixedEnd + filenameLength,
      fixedEnd + filenameLength + extraFieldLength,
    );
    const decoded = decodeFilename(rawFilename, flags, ordinal, state);
    const normalized = normalizeFilename(decoded, ordinal, state);
    const directory = isDirectoryEntry(decoded, externalAttributes);

    const entry: MutableEntry = {
      ordinal,
      rawFilenameBytes: Object.freeze(Array.from(rawFilename)),
      decodedFilename: decoded,
      normalizedFilename: normalized,
      generalPurposeFlags: flags,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      filenameLength,
      extraFieldLength,
      commentLength,
      externalAttributes,
      directory,
      localHeaderRange: null,
      localFilenameRange: null,
      localExtraFieldRange: null,
      compressedDataRange: null,
    };
    state.entries.push(entry);

    if (diskStart !== 0) {
      recordProblem(
        state,
        'REJECTED_UNSUPPORTED',
        'ZIP_ENTRY_MULTI_DISK_UNSUPPORTED',
        `Writer project archive entry "${displayName(entry)}" starts on an unsupported disk.`,
        [ordinal],
      );
    }
    const extraStatus = inspectExtraField(centralExtra);
    if (extraStatus === 'ZIP64') {
      recordProblem(
        state,
        'REJECTED_UNSUPPORTED',
        'ZIP64_ENTRY_UNSUPPORTED',
        `Writer project archive entry "${displayName(entry)}" uses unsupported ZIP64 metadata.`,
        [ordinal],
      );
    } else if (extraStatus === 'MALFORMED') {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_CENTRAL_EXTRA_FIELD_MALFORMED',
        `Writer project archive entry "${displayName(entry)}" has a malformed central-directory extra field.`,
        [ordinal],
      );
    }
    if (
      compressedSize === UINT32_MAX ||
      uncompressedSize === UINT32_MAX ||
      localHeaderOffset === UINT32_MAX
    ) {
      recordProblem(
        state,
        'REJECTED_UNSUPPORTED',
        'ZIP64_ENTRY_SENTINEL_UNSUPPORTED',
        `Writer project archive entry "${displayName(entry)}" requires unsupported ZIP64 values.`,
        [ordinal],
      );
    }
    if (usesEncryption(flags)) {
      recordProblem(
        state,
        'REJECTED_ENCRYPTED',
        'ZIP_ENTRY_ENCRYPTED',
        `Writer project archive entry "${displayName(entry)}" is encrypted.`,
        [ordinal],
      );
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      recordProblem(
        state,
        'REJECTED_UNSUPPORTED',
        'ZIP_COMPRESSION_METHOD_UNSUPPORTED',
        `Writer project archive uses unsupported compression method ${compressionMethod}.`,
        [ordinal],
      );
    }
    if (compressionMethod === 0 && compressedSize !== uncompressedSize) {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_STORED_SIZE_MISMATCH',
        `Writer project archive stored entry "${displayName(entry)}" has contradictory sizes.`,
        [ordinal],
      );
    }

    cursor = recordEnd;
  }

  if (cursor !== centralDirectory.end) {
    throw failure(
      'REJECTED_MALFORMED',
      'ZIP_CENTRAL_DIRECTORY_SIZE_MISMATCH',
      'Writer project archive central-directory byte length does not match its records.',
    );
  }
}

function inspectLocalHeaders(bytes: Uint8Array, state: InspectionState): void {
  const centralDirectory = state.centralDirectory;
  if (!centralDirectory) return;

  const ownershipByOffset = new Map<number, number[]>();

  for (const entry of state.entries) {
    const owners = ownershipByOffset.get(entry.localHeaderOffset) ?? [];
    owners.push(entry.ordinal);
    ownershipByOffset.set(entry.localHeaderOffset, owners);

    if (entry.localHeaderOffset >= centralDirectory.offset) {
      recordProblem(
        state,
        'REJECTED_RANGE_CONFLICT',
        'ZIP_LOCAL_HEADER_INSIDE_CENTRAL_DIRECTORY',
        `Writer project archive entry "${displayName(entry)}" references a local header inside the central directory.`,
        [entry.ordinal],
      );
      continue;
    }

    let fixedEnd: number;
    try {
      fixedEnd = safeAdd(
        entry.localHeaderOffset,
        LOCAL_FILE_HEADER_FIXED_BYTES,
        'local file header',
      );
    } catch (error) {
      recordRangeFailure(state, error, entry.ordinal);
      continue;
    }
    if (fixedEnd > centralDirectory.offset || fixedEnd > bytes.byteLength) {
      recordProblem(
        state,
        'REJECTED_RANGE_CONFLICT',
        'ZIP_LOCAL_HEADER_OUT_OF_RANGE',
        `Writer project archive entry "${displayName(entry)}" references an invalid local file header.`,
        [entry.ordinal],
      );
      continue;
    }
    if (!hasSignature(bytes, entry.localHeaderOffset, LOCAL_FILE_HEADER_SIGNATURE)) {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_LOCAL_HEADER_SIGNATURE_INVALID',
        'Writer project archive references an invalid local file header.',
        [entry.ordinal],
      );
      continue;
    }

    const localFlags = readUint16(bytes, entry.localHeaderOffset + 6, 'local flags');
    const localMethod = readUint16(bytes, entry.localHeaderOffset + 8, 'local method');
    const localCrc32 = readUint32(bytes, entry.localHeaderOffset + 14, 'local CRC-32');
    const localCompressedSize = readUint32(
      bytes,
      entry.localHeaderOffset + 18,
      'local compressed size',
    );
    const localUncompressedSize = readUint32(
      bytes,
      entry.localHeaderOffset + 22,
      'local uncompressed size',
    );
    const localFilenameLength = readUint16(
      bytes,
      entry.localHeaderOffset + 26,
      'local filename length',
    );
    const localExtraFieldLength = readUint16(
      bytes,
      entry.localHeaderOffset + 28,
      'local extra-field length',
    );

    let filenameEnd: number;
    let extraEnd: number;
    let dataEnd: number;
    try {
      filenameEnd = safeAdd(fixedEnd, localFilenameLength, 'local filename range');
      extraEnd = safeAdd(filenameEnd, localExtraFieldLength, 'local extra-field range');
      dataEnd = safeAdd(extraEnd, entry.compressedSize, 'compressed payload range');
    } catch (error) {
      recordRangeFailure(state, error, entry.ordinal);
      continue;
    }

    if (extraEnd > centralDirectory.offset || extraEnd > bytes.byteLength) {
      recordProblem(
        state,
        'REJECTED_RANGE_CONFLICT',
        'ZIP_LOCAL_VARIABLE_FIELDS_OUT_OF_RANGE',
        `Writer project archive entry "${displayName(entry)}" has out-of-range local-header fields.`,
        [entry.ordinal],
      );
      continue;
    }
    if (dataEnd > centralDirectory.offset || dataEnd > bytes.byteLength) {
      recordProblem(
        state,
        'REJECTED_RANGE_CONFLICT',
        'ZIP_COMPRESSED_DATA_OUT_OF_RANGE',
        `Writer project archive entry "${displayName(entry)}" compressed data overlaps or exceeds the central directory.`,
        [entry.ordinal],
      );
      continue;
    }

    const localFilename = bytes.slice(fixedEnd, filenameEnd);
    const localExtra = bytes.slice(filenameEnd, extraEnd);
    if (!equalBytes(localFilename, entry.rawFilenameBytes)) {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_LOCAL_CENTRAL_FILENAME_MISMATCH',
        `Writer project archive entry "${displayName(entry)}" has inconsistent local and central filenames.`,
        [entry.ordinal],
      );
    }
    if (localMethod !== entry.compressionMethod) {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_LOCAL_CENTRAL_METHOD_MISMATCH',
        `Writer project archive entry "${displayName(entry)}" has inconsistent compression methods.`,
        [entry.ordinal],
      );
    }
    if (!relevantFlagsMatch(localFlags, entry.generalPurposeFlags)) {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_LOCAL_CENTRAL_FLAGS_MISMATCH',
        `Writer project archive entry "${displayName(entry)}" has inconsistent general-purpose flags.`,
        [entry.ordinal],
      );
    }

    const localExtraStatus = inspectExtraField(localExtra);
    if (localExtraStatus === 'ZIP64') {
      recordProblem(
        state,
        'REJECTED_UNSUPPORTED',
        'ZIP64_LOCAL_EXTRA_UNSUPPORTED',
        `Writer project archive entry "${displayName(entry)}" uses unsupported ZIP64 local metadata.`,
        [entry.ordinal],
      );
    } else if (localExtraStatus === 'MALFORMED') {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_LOCAL_EXTRA_FIELD_MALFORMED',
        `Writer project archive entry "${displayName(entry)}" has a malformed local extra field.`,
        [entry.ordinal],
      );
    }

    if (!usesDataDescriptor(entry.generalPurposeFlags)) {
      if (
        localCrc32 !== entry.crc32 ||
        localCompressedSize !== entry.compressedSize ||
        localUncompressedSize !== entry.uncompressedSize
      ) {
        recordProblem(
          state,
          'REJECTED_MALFORMED',
          'ZIP_LOCAL_CENTRAL_SIZE_OR_CRC_MISMATCH',
          `Writer project archive entry "${displayName(entry)}" has inconsistent local size or CRC declarations.`,
          [entry.ordinal],
        );
      }
    } else if (
      !zeroOrEqual(localCrc32, entry.crc32) ||
      !zeroOrEqual(localCompressedSize, entry.compressedSize) ||
      !zeroOrEqual(localUncompressedSize, entry.uncompressedSize)
    ) {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_DATA_DESCRIPTOR_DECLARATION_MISMATCH',
        `Writer project archive entry "${displayName(entry)}" has ambiguous data-descriptor declarations.`,
        [entry.ordinal],
      );
    }

    entry.localHeaderRange = {
      kind: 'LOCAL_HEADER',
      start: entry.localHeaderOffset,
      end: fixedEnd,
      entryOrdinal: entry.ordinal,
    };
    entry.localFilenameRange = {
      kind: 'LOCAL_FILENAME',
      start: fixedEnd,
      end: filenameEnd,
      entryOrdinal: entry.ordinal,
    };
    entry.localExtraFieldRange = {
      kind: 'LOCAL_EXTRA_FIELD',
      start: filenameEnd,
      end: extraEnd,
      entryOrdinal: entry.ordinal,
    };
    entry.compressedDataRange = {
      kind: 'COMPRESSED_PAYLOAD',
      start: extraEnd,
      end: dataEnd,
      entryOrdinal: entry.ordinal,
    };
    state.regions.push(
      entry.localHeaderRange,
      entry.localFilenameRange,
      entry.localExtraFieldRange,
      entry.compressedDataRange,
    );
  }

  for (const [offset, ordinals] of ownershipByOffset) {
    if (ordinals.length < 2) continue;
    recordProblem(
      state,
      'REJECTED_RANGE_CONFLICT',
      'ZIP_REPEATED_LOCAL_HEADER_OWNERSHIP',
      `Writer project archive entries ${formatOrdinals(ordinals)} share local header offset ${offset}.`,
      ordinals,
    );
  }
}

function inspectCollisions(state: InspectionState): void {
  collectCollisionGroups(
    state,
    'EXACT_RAW_NAME',
    state.entries,
    (entry) => rawFilenameKey(entry.rawFilenameBytes),
  );
  collectCollisionGroups(
    state,
    'DECODED_NAME',
    state.entries,
    (entry) => entry.decodedFilename,
  );
  collectCollisionGroups(
    state,
    'NORMALIZED_PATH',
    state.entries,
    (entry) => entry.normalizedFilename,
  );

  const normalizedGroups = groupEntries(state.entries, (entry) => entry.normalizedFilename);
  for (const [normalizedName, entries] of normalizedGroups) {
    if (!normalizedName || entries.length < 2) continue;
    if (!entries.some((entry) => entry.directory) || !entries.some((entry) => !entry.directory)) {
      continue;
    }
    addCollision(
      state,
      'FILE_DIRECTORY',
      normalizedName,
      entries.map((entry) => entry.ordinal),
      `Writer project archive uses "${normalizedName}" as both a file and a directory.`,
    );
  }

  const regularFiles = state.entries.filter(
    (entry) => !entry.directory && entry.normalizedFilename.length > 0,
  );
  for (const fileEntry of regularFiles) {
    const prefix = `${fileEntry.normalizedFilename}/`;
    const descendants = state.entries.filter(
      (candidate) =>
        candidate.ordinal !== fileEntry.ordinal &&
        candidate.normalizedFilename.startsWith(prefix),
    );
    if (descendants.length === 0) continue;
    const ordinals = [fileEntry.ordinal, ...descendants.map((entry) => entry.ordinal)];
    addCollision(
      state,
      'FILE_DIRECTORY',
      fileEntry.normalizedFilename,
      ordinals,
      `Writer project archive file "${fileEntry.normalizedFilename}" conflicts with descendant entries.`,
    );
  }
}

function inspectEntryRegionOverlap(state: InspectionState): void {
  const ownershipRanges = state.entries
    .filter(
      (entry): entry is MutableEntry & {
        localHeaderRange: ZipArchiveByteRange;
        compressedDataRange: ZipArchiveByteRange;
      } => Boolean(entry.localHeaderRange && entry.compressedDataRange),
    )
    .map((entry) => ({
      start: entry.localHeaderRange.start,
      end: entry.compressedDataRange.end,
      ordinal: entry.ordinal,
    }))
    .sort((left, right) => left.start - right.start || left.ordinal - right.ordinal);

  for (let index = 1; index < ownershipRanges.length; index += 1) {
    const previous = ownershipRanges[index - 1];
    const current = ownershipRanges[index];
    if (!previous || !current || current.start >= previous.end) continue;
    recordProblem(
      state,
      'REJECTED_RANGE_CONFLICT',
      'ZIP_ENTRY_REGION_OVERLAP',
      `Writer project archive entries ${previous.ordinal} and ${current.ordinal} have overlapping local regions.`,
      [previous.ordinal, current.ordinal],
    );
  }
}

function inspectArchivePreamble(state: InspectionState): void {
  if (state.entries.length === 0) return;
  const firstOffset = Math.min(...state.entries.map((entry) => entry.localHeaderOffset));
  if (firstOffset !== 0) {
    recordProblem(
      state,
      'REJECTED_UNSUPPORTED',
      'ZIP_PREPENDED_STRUCTURE_UNSUPPORTED',
      'Writer project archive contains unsupported prepended structures.',
      [],
    );
  }
}

function decodeFilename(
  bytes: Uint8Array,
  flags: number,
  ordinal: number,
  state: InspectionState,
): string {
  if (isFlagSet(flags, 11)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      recordProblem(
        state,
        'REJECTED_MALFORMED',
        'ZIP_FILENAME_UTF8_INVALID',
        `Writer project archive entry ${ordinal} has an invalid UTF-8 filename.`,
        [ordinal],
      );
      return `<invalid-utf8-${rawFilenameKey(bytes)}>`;
    }
  }

  for (const byte of bytes) {
    if (byte > 0x7f) {
      recordProblem(
        state,
        'REJECTED_UNSUPPORTED',
        'ZIP_LEGACY_FILENAME_ENCODING_UNSUPPORTED',
        `Writer project archive entry ${ordinal} uses unsupported non-ASCII legacy filename bytes.`,
        [ordinal],
      );
      return `<unsupported-legacy-${rawFilenameKey(bytes)}>`;
    }
  }
  return String.fromCharCode(...bytes);
}

function normalizeFilename(
  decodedFilename: string,
  ordinal: number,
  state: InspectionState,
): string {
  const slashed = decodedFilename.replace(/\\/g, '/');
  const control = Array.from(decodedFilename).find((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code === 0 || code < 0x20 || code === 0x7f;
  });
  if (control !== undefined) {
    recordProblem(
      state,
      'REJECTED_UNSAFE_PATH',
      'ZIP_FILENAME_CONTROL_CHARACTER',
      `Writer project archive entry "${displayUnsafeName(decodedFilename)}" contains an unsafe control character.`,
      [ordinal],
    );
  }
  if (slashed.startsWith('/')) {
    recordProblem(
      state,
      'REJECTED_UNSAFE_PATH',
      'ZIP_FILENAME_ABSOLUTE_PATH',
      `Writer project archive entry "${displayUnsafeName(decodedFilename)}" is an absolute path.`,
      [ordinal],
    );
  }
  if (/^[A-Za-z]:\//.test(slashed)) {
    recordProblem(
      state,
      'REJECTED_UNSAFE_PATH',
      'ZIP_FILENAME_WINDOWS_DRIVE',
      `Writer project archive entry "${displayUnsafeName(decodedFilename)}" uses a Windows drive path.`,
      [ordinal],
    );
  }
  if (slashed.startsWith('//')) {
    recordProblem(
      state,
      'REJECTED_UNSAFE_PATH',
      'ZIP_FILENAME_UNC_PATH',
      `Writer project archive entry "${displayUnsafeName(decodedFilename)}" uses a UNC path.`,
      [ordinal],
    );
  }

  const normalizedSegments: string[] = [];
  for (const segment of slashed.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      recordProblem(
        state,
        'REJECTED_UNSAFE_PATH',
        'ZIP_FILENAME_PARENT_TRAVERSAL',
        `Writer project archive entry "${displayUnsafeName(decodedFilename)}" escapes the archive root.`,
        [ordinal],
      );
      continue;
    }
    normalizedSegments.push(segment);
  }
  const normalized = normalizedSegments.join('/');
  if (!normalized) {
    recordProblem(
      state,
      'REJECTED_UNSAFE_PATH',
      'ZIP_FILENAME_EMPTY_NORMALIZED_PATH',
      `Writer project archive entry "${displayUnsafeName(decodedFilename)}" has an empty normalized path.`,
      [ordinal],
    );
  }
  return normalized;
}

function collectCollisionGroups(
  state: InspectionState,
  kind: ZipArchiveCollisionGroup['kind'],
  entries: readonly MutableEntry[],
  keyOf: (entry: MutableEntry) => string,
): void {
  const groups = groupEntries(entries, keyOf);
  for (const [key, group] of groups) {
    if (!key || group.length < 2) continue;
    const ordinals = group.map((entry) => entry.ordinal);
    const displayKey = kind === 'EXACT_RAW_NAME'
      ? group[0]?.decodedFilename ?? key
      : key;
    const message = collisionMessage(kind, displayKey);
    addCollision(state, kind, key, ordinals, message);
  }
}

function addCollision(
  state: InspectionState,
  kind: ZipArchiveCollisionGroup['kind'],
  key: string,
  ordinals: readonly number[],
  message: string,
): void {
  const sortedOrdinals = sortedUnique(ordinals);
  if (
    state.collisions.some(
      (collision) =>
        collision.kind === kind &&
        collision.key === key &&
        equalNumbers(collision.entryOrdinals, sortedOrdinals),
    )
  ) {
    return;
  }
  state.collisions.push({
    kind,
    key,
    entryOrdinals: Object.freeze([...sortedOrdinals]),
  });
  recordProblem(
    state,
    'REJECTED_DUPLICATE',
    `ZIP_${kind}_COLLISION`,
    message,
    sortedOrdinals,
  );
}

function collisionMessage(kind: ZipArchiveCollisionGroup['kind'], key: string): string {
  if (kind === 'EXACT_RAW_NAME' || kind === 'DECODED_NAME') {
    return `Writer project archive contains duplicate entry "${displayUnsafeName(key)}".`;
  }
  if (kind === 'NORMALIZED_PATH') {
    return `Writer project archive contains entries that normalize to the same path "${displayUnsafeName(key)}".`;
  }
  return `Writer project archive contains a file/directory collision at "${displayUnsafeName(key)}".`;
}

function groupEntries(
  entries: readonly MutableEntry[],
  keyOf: (entry: MutableEntry) => string,
): Map<string, MutableEntry[]> {
  const groups = new Map<string, MutableEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return groups;
}

function finalizeInventory(state: InspectionState): ZipArchiveInventory {
  const entries: readonly ZipArchiveEntryInventory[] = Object.freeze(
    state.entries.map((entry) => deepFreeze({ ...entry })),
  );
  const measurements = deepFreeze(calculateMeasurements(state));
  const diagnostics: readonly ZipArchiveDiagnostic[] = Object.freeze(
    state.problems.map((problem) =>
      deepFreeze({
        severity: 'error' as const,
        code: problem.code,
        message: problem.message,
        entryOrdinals: Object.freeze([...problem.entryOrdinals]),
      }),
    ),
  );
  const outcome = state.problems[0]?.outcome ?? 'ADMITTED';

  return deepFreeze({
    profileId: ZIP_STRUCTURAL_ADMISSION_PROFILE_ID,
    sourceBytes: state.sourceBytes,
    archiveFormatProfile: ZIP_ARCHIVE_FORMAT_PROFILE,
    eocd: state.eocd ? { ...state.eocd } : null,
    centralDirectory: state.centralDirectory ? { ...state.centralDirectory } : null,
    entries,
    collisionGroups: Object.freeze(
      state.collisions.map((collision) => deepFreeze({ ...collision })),
    ),
    regions: Object.freeze(state.regions.map((region) => deepFreeze({ ...region }))),
    measurements,
    diagnostics,
    outcome,
    unresolvedPolicy: {
      authority: 'UNRESOLVED_POLICY' as const,
      dimensions: [
        'SOURCE_BYTES',
        'RAW_ENTRY_COUNT',
        'CENTRAL_DIRECTORY_BYTES',
        'TOTAL_COMPRESSED_BYTES_DECLARED',
        'TOTAL_UNCOMPRESSED_BYTES_DECLARED',
        'MAX_ENTRY_COMPRESSED_BYTES',
        'MAX_ENTRY_UNCOMPRESSED_BYTES',
        'MAX_DECLARED_COMPRESSION_RATIO',
        'FILENAME_BYTES_TOTAL',
        'EXTRA_FIELD_BYTES_TOTAL',
        'COMMENT_BYTES_TOTAL',
      ] as const,
    },
  });
}

function calculateMeasurements(state: InspectionState): ZipArchiveMeasurements {
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let maxCompressed = 0;
  let maxUncompressed = 0;
  let maxRatio = 0;
  let filenameBytes = 0;
  let extraFieldBytes = 0;
  let commentBytes = state.archiveCommentBytes;

  for (const entry of state.entries) {
    totalCompressed = safeMeasurementAdd(totalCompressed, entry.compressedSize);
    totalUncompressed = safeMeasurementAdd(totalUncompressed, entry.uncompressedSize);
    filenameBytes = safeMeasurementAdd(filenameBytes, entry.filenameLength);
    extraFieldBytes = safeMeasurementAdd(extraFieldBytes, entry.extraFieldLength);
    commentBytes = safeMeasurementAdd(commentBytes, entry.commentLength);
    maxCompressed = Math.max(maxCompressed, entry.compressedSize);
    maxUncompressed = Math.max(maxUncompressed, entry.uncompressedSize);
    const ratio = entry.compressedSize === 0
      ? entry.uncompressedSize === 0 ? 0 : Number.POSITIVE_INFINITY
      : entry.uncompressedSize / entry.compressedSize;
    maxRatio = Math.max(maxRatio, ratio);
  }

  return {
    SOURCE_BYTES: state.sourceBytes,
    RAW_ENTRY_COUNT: state.entries.length,
    CENTRAL_DIRECTORY_BYTES: state.centralDirectory?.bytes ?? 0,
    TOTAL_COMPRESSED_BYTES_DECLARED: totalCompressed,
    TOTAL_UNCOMPRESSED_BYTES_DECLARED: totalUncompressed,
    MAX_ENTRY_COMPRESSED_BYTES: maxCompressed,
    MAX_ENTRY_UNCOMPRESSED_BYTES: maxUncompressed,
    MAX_DECLARED_COMPRESSION_RATIO: maxRatio,
    FILENAME_BYTES_TOTAL: filenameBytes,
    EXTRA_FIELD_BYTES_TOTAL: extraFieldBytes,
    COMMENT_BYTES_TOTAL: commentBytes,
  };
}

function inspectExtraField(bytes: Uint8Array): 'ZIP64' | 'MALFORMED' | null {
  let cursor = 0;
  let zip64 = false;
  while (cursor < bytes.byteLength) {
    if (cursor + 4 > bytes.byteLength) return 'MALFORMED';
    const id = readUint16(bytes, cursor, 'extra-field ID');
    const length = readUint16(bytes, cursor + 2, 'extra-field length');
    const end = cursor + 4 + length;
    if (end > bytes.byteLength) return 'MALFORMED';
    if (id === ZIP64_EXTRA_FIELD_ID) zip64 = true;
    cursor = end;
  }
  return zip64 ? 'ZIP64' : null;
}

function hasZip64Locator(bytes: Uint8Array, eocdOffset: number): boolean {
  return eocdOffset >= 20 && hasSignature(bytes, eocdOffset - 20, ZIP64_LOCATOR_SIGNATURE);
}

function hasZip64EndRecord(bytes: Uint8Array, eocdOffset: number): boolean {
  const searchStart = Math.max(0, eocdOffset - 80);
  for (let offset = eocdOffset - 4; offset >= searchStart; offset -= 1) {
    if (hasSignature(bytes, offset, ZIP64_EOCD_SIGNATURE)) return true;
  }
  return false;
}

function relevantFlagsMatch(left: number, right: number): boolean {
  return RELEVANT_FLAG_BITS.every(
    (bit) => isFlagSet(left, bit) === isFlagSet(right, bit),
  );
}

function usesEncryption(flags: number): boolean {
  return isFlagSet(flags, 0) || isFlagSet(flags, 6) || isFlagSet(flags, 13);
}

function usesDataDescriptor(flags: number): boolean {
  return isFlagSet(flags, 3);
}

function isFlagSet(flags: number, bit: number): boolean {
  return Math.floor(flags / (2 ** bit)) % 2 === 1;
}

function isDirectoryEntry(decodedFilename: string, externalAttributes: number): boolean {
  const dosAttributes = externalAttributes % 256;
  const dosDirectory = Math.floor(dosAttributes / 16) % 2 === 1;
  return decodedFilename.endsWith('/') || dosDirectory;
}

function readUint16(bytes: Uint8Array, offset: number, label: string): number {
  ensureReadable(bytes, offset, 2, label);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readUint32(bytes: Uint8Array, offset: number, label: string): number {
  ensureReadable(bytes, offset, 4, label);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function ensureReadable(
  bytes: Uint8Array,
  offset: number,
  length: number,
  label: string,
): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    throw failure(
      'REJECTED_RANGE_CONFLICT',
      'ZIP_INTEGER_RANGE_INVALID',
      `Writer project archive ${label} uses an invalid integer range.`,
    );
  }
  if (offset > bytes.byteLength || length > bytes.byteLength - offset) {
    throw failure(
      'REJECTED_RANGE_CONFLICT',
      'ZIP_READ_OUT_OF_RANGE',
      `Writer project archive ${label} is outside the source bytes.`,
    );
  }
}

function safeAdd(...values: readonly (number | string)[]): number {
  const label = String(values[values.length - 1]);
  const numbers = values.slice(0, -1) as readonly number[];
  let total = 0;
  for (const value of numbers) {
    if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) {
      throw failure(
        'REJECTED_RANGE_CONFLICT',
        'ZIP_INTEGER_OVERFLOW',
        `Writer project archive ${label} exceeds safe integer arithmetic.`,
      );
    }
    total += value;
  }
  return total;
}

function safeMeasurementAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || right < 0) {
    throw failure(
      'REJECTED_RANGE_CONFLICT',
      'ZIP_MEASUREMENT_INTEGER_INVALID',
      'Writer project archive measurements exceed safe integer representation.',
    );
  }
  if (left > Number.MAX_SAFE_INTEGER - right) {
    throw failure(
      'REJECTED_RANGE_CONFLICT',
      'ZIP_MEASUREMENT_INTEGER_OVERFLOW',
      'Writer project archive measurements exceed safe integer representation.',
    );
  }
  return left + right;
}

function hasSignature(bytes: Uint8Array, offset: number, signature: number): boolean {
  if (offset < 0 || offset + 4 > bytes.byteLength) return false;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true) === signature;
}

function equalBytes(left: Uint8Array, right: readonly number[]): boolean {
  if (left.byteLength !== right.length) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function rawFilenameKey(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function displayName(entry: Pick<MutableEntry, 'decodedFilename' | 'ordinal'>): string {
  return entry.decodedFilename || `entry-${entry.ordinal}`;
}

function displayUnsafeName(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code !== 0 && code >= 0x20 && code !== 0x7f) return character;
    return `<U+${code.toString(16).toUpperCase().padStart(4, '0')}>`;
  }).join('');
}

function formatOrdinals(ordinals: readonly number[]): string {
  return sortedUnique(ordinals).join(', ');
}

function sortedUnique(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function equalNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function zeroOrEqual(value: number, expected: number): boolean {
  return value === 0 || value === expected;
}

function recordRangeFailure(state: InspectionState, error: unknown, ordinal: number): void {
  if (error instanceof ZipInspectionFailure) {
    recordProblem(state, error.outcome, error.code, error.message, [ordinal]);
    return;
  }
  recordProblem(
    state,
    'REJECTED_RANGE_CONFLICT',
    'ZIP_ENTRY_RANGE_FAILURE',
    'Writer project archive contains an invalid entry byte range.',
    [ordinal],
  );
}

function recordProblem(
  state: InspectionState,
  outcome: InspectionProblem['outcome'],
  code: string,
  message: string,
  entryOrdinals: readonly number[],
): void {
  const normalizedOrdinals = sortedUnique(entryOrdinals);
  if (
    state.problems.some(
      (problem) =>
        problem.code === code &&
        problem.message === message &&
        equalNumbers(problem.entryOrdinals, normalizedOrdinals),
    )
  ) {
    return;
  }
  state.problems.push({
    outcome,
    code,
    message,
    entryOrdinals: Object.freeze([...normalizedOrdinals]),
  });
}

function failure(
  outcome: InspectionProblem['outcome'],
  code: string,
  message: string,
  entryOrdinals: readonly number[] = [],
): ZipInspectionFailure {
  return new ZipInspectionFailure(outcome, code, message, entryOrdinals);
}

function deepFreeze<T>(value: T): T {
  if (ArrayBuffer.isView(value)) return value;
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
