export const ZIP_STRUCTURAL_ADMISSION_PROFILE_ID = 'ZIP_STRUCTURAL_ADMISSION_V1' as const;

export const ZIP_ARCHIVE_FORMAT_PROFILE =
  'single-disk-non-zip64-central-directory-stored-or-deflated-unencrypted' as const;

export type ZipStructuralAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED_MALFORMED'
  | 'REJECTED_UNSUPPORTED'
  | 'REJECTED_UNSAFE_PATH'
  | 'REJECTED_DUPLICATE'
  | 'REJECTED_ENCRYPTED'
  | 'REJECTED_RANGE_CONFLICT'
  | 'CANCELLED';

export type ZipArchiveRegionKind =
  | 'LOCAL_HEADER'
  | 'LOCAL_FILENAME'
  | 'LOCAL_EXTRA_FIELD'
  | 'COMPRESSED_PAYLOAD'
  | 'CENTRAL_DIRECTORY'
  | 'EOCD';

export type ZipCollisionKind =
  | 'EXACT_RAW_NAME'
  | 'DECODED_NAME'
  | 'NORMALIZED_PATH'
  | 'FILE_DIRECTORY';

export interface ZipArchiveDiagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly entryOrdinals: readonly number[];
}

export interface ZipArchiveByteRange {
  readonly kind: ZipArchiveRegionKind;
  readonly start: number;
  readonly end: number;
  readonly entryOrdinal?: number;
}

export interface ZipEndOfCentralDirectoryInventory {
  readonly offset: number;
  readonly diskNumber: number;
  readonly centralDirectoryStartDisk: number;
  readonly recordsOnDisk: number;
  readonly totalRecords: number;
  readonly centralDirectoryBytes: number;
  readonly centralDirectoryOffset: number;
  readonly commentBytes: number;
}

export interface ZipCentralDirectoryInventory {
  readonly offset: number;
  readonly bytes: number;
  readonly end: number;
  readonly recordCount: number;
}

export interface ZipArchiveEntryInventory {
  readonly ordinal: number;
  readonly rawFilenameBytes: readonly number[];
  readonly decodedFilename: string;
  readonly normalizedFilename: string;
  readonly generalPurposeFlags: number;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly filenameLength: number;
  readonly extraFieldLength: number;
  readonly commentLength: number;
  readonly externalAttributes: number;
  readonly directory: boolean;
  readonly localHeaderRange: ZipArchiveByteRange | null;
  readonly localFilenameRange: ZipArchiveByteRange | null;
  readonly localExtraFieldRange: ZipArchiveByteRange | null;
  readonly compressedDataRange: ZipArchiveByteRange | null;
}

export interface ZipArchiveCollisionGroup {
  readonly kind: ZipCollisionKind;
  readonly key: string;
  readonly entryOrdinals: readonly number[];
}

export interface ZipArchiveMeasurements {
  readonly SOURCE_BYTES: number;
  readonly RAW_ENTRY_COUNT: number;
  readonly CENTRAL_DIRECTORY_BYTES: number;
  readonly TOTAL_COMPRESSED_BYTES_DECLARED: number;
  readonly TOTAL_UNCOMPRESSED_BYTES_DECLARED: number;
  readonly MAX_ENTRY_COMPRESSED_BYTES: number;
  readonly MAX_ENTRY_UNCOMPRESSED_BYTES: number;
  readonly MAX_DECLARED_COMPRESSION_RATIO: number;
  readonly FILENAME_BYTES_TOTAL: number;
  readonly EXTRA_FIELD_BYTES_TOTAL: number;
  readonly COMMENT_BYTES_TOTAL: number;
}

export interface ZipArchiveInventory {
  readonly profileId: typeof ZIP_STRUCTURAL_ADMISSION_PROFILE_ID;
  readonly sourceBytes: number;
  readonly archiveFormatProfile: typeof ZIP_ARCHIVE_FORMAT_PROFILE;
  readonly eocd: ZipEndOfCentralDirectoryInventory | null;
  readonly centralDirectory: ZipCentralDirectoryInventory | null;
  readonly entries: readonly ZipArchiveEntryInventory[];
  readonly collisionGroups: readonly ZipArchiveCollisionGroup[];
  readonly regions: readonly ZipArchiveByteRange[];
  readonly measurements: ZipArchiveMeasurements;
  readonly diagnostics: readonly ZipArchiveDiagnostic[];
  readonly outcome: ZipStructuralAdmissionOutcome;
  readonly unresolvedPolicy: {
    readonly authority: 'UNRESOLVED_POLICY';
    readonly dimensions: readonly [
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
    ];
  };
}

export class ZipStructuralAdmissionError extends Error {
  readonly inventory: ZipArchiveInventory;

  constructor(inventory: ZipArchiveInventory, message: string) {
    super(message);
    this.name = 'ZipStructuralAdmissionError';
    this.inventory = inventory;
  }
}
