import {
  ZipStructuralAdmissionError,
  type ZipArchiveDiagnostic,
  type ZipArchiveInventory,
  type ZipStructuralAdmissionOutcome,
} from './zipTypes';

interface AdmissionProblem {
  readonly outcome: Exclude<ZipStructuralAdmissionOutcome, 'ADMITTED' | 'CANCELLED'>;
  readonly code: string;
  readonly message: string;
  readonly entryOrdinals: readonly number[];
}

const UNSUPPORTED_GENERAL_PURPOSE_FLAG_BITS = [0, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15] as const;

export function admitZipArchive(inventory: ZipArchiveInventory): ZipArchiveInventory {
  if (inventory.outcome !== 'ADMITTED') {
    throwAdmissionError(inventory);
  }

  const profileProblem = findSupportedProfileProblem(inventory);
  if (profileProblem) {
    throwAdmissionError(rejectInventory(inventory, profileProblem));
  }

  return inventory;
}

function findSupportedProfileProblem(inventory: ZipArchiveInventory): AdmissionProblem | null {
  for (const entry of inventory.entries) {
    const unsupportedBit = UNSUPPORTED_GENERAL_PURPOSE_FLAG_BITS.find((bit) =>
      isFlagSet(entry.generalPurposeFlags, bit),
    );
    if (unsupportedBit !== undefined) {
      const dataDescriptor = unsupportedBit === 3;
      return {
        outcome: 'REJECTED_UNSUPPORTED',
        code: dataDescriptor
          ? 'ZIP_DATA_DESCRIPTOR_UNSUPPORTED'
          : 'ZIP_GENERAL_PURPOSE_FLAG_UNSUPPORTED',
        message: dataDescriptor
          ? `Writer project archive entry "${displayName(entry.decodedFilename)}" uses an unsupported data descriptor.`
          : `Writer project archive entry "${displayName(entry.decodedFilename)}" uses unsupported general-purpose flag bit ${unsupportedBit}.`,
        entryOrdinals: [entry.ordinal],
      };
    }

    if (
      entry.compressionMethod === 0 &&
      (isFlagSet(entry.generalPurposeFlags, 1) || isFlagSet(entry.generalPurposeFlags, 2))
    ) {
      return {
        outcome: 'REJECTED_UNSUPPORTED',
        code: 'ZIP_STORED_COMPRESSION_OPTIONS_UNSUPPORTED',
        message: `Writer project archive stored entry "${displayName(entry.decodedFilename)}" uses unsupported compression-option flags.`,
        entryOrdinals: [entry.ordinal],
      };
    }
  }

  return findOwnershipCoverageProblem(inventory);
}

function findOwnershipCoverageProblem(inventory: ZipArchiveInventory): AdmissionProblem | null {
  const centralDirectory = inventory.centralDirectory;
  if (!centralDirectory) {
    return {
      outcome: 'REJECTED_MALFORMED',
      code: 'ZIP_CENTRAL_DIRECTORY_INVENTORY_MISSING',
      message: 'Writer project archive central-directory inventory is unavailable.',
      entryOrdinals: [],
    };
  }

  const ownership = inventory.entries.map((entry) => {
    if (!entry.localHeaderRange || !entry.compressedDataRange) {
      return null;
    }
    return {
      start: entry.localHeaderRange.start,
      end: entry.compressedDataRange.end,
      ordinal: entry.ordinal,
    };
  });

  const missing = ownership.findIndex((range) => range === null);
  if (missing >= 0) {
    return {
      outcome: 'REJECTED_RANGE_CONFLICT',
      code: 'ZIP_LOCAL_OWNERSHIP_INCOMPLETE',
      message: 'Writer project archive contains an entry without complete local byte-range ownership.',
      entryOrdinals: [inventory.entries[missing]?.ordinal ?? missing],
    };
  }

  const ranges = ownership
    .filter((range): range is NonNullable<typeof range> => range !== null)
    .sort((left, right) => left.start - right.start || left.ordinal - right.ordinal);

  if (ranges.length === 0) {
    if (centralDirectory.offset === 0) return null;
    return {
      outcome: 'REJECTED_UNSUPPORTED',
      code: 'ZIP_EMPTY_ARCHIVE_PREAMBLE_UNSUPPORTED',
      message: 'Writer project archive contains unsupported bytes before an empty central directory.',
      entryOrdinals: [],
    };
  }

  const first = ranges[0];
  if (first && first.start !== 0) {
    return {
      outcome: 'REJECTED_UNSUPPORTED',
      code: 'ZIP_PREPENDED_STRUCTURE_UNSUPPORTED',
      message: 'Writer project archive contains unsupported prepended structures.',
      entryOrdinals: [first.ordinal],
    };
  }

  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (!previous || !current || current.start === previous.end) continue;
    return {
      outcome: 'REJECTED_RANGE_CONFLICT',
      code: 'ZIP_LOCAL_OWNERSHIP_GAP',
      message: `Writer project archive contains unaccounted bytes between entries ${previous.ordinal} and ${current.ordinal}.`,
      entryOrdinals: [previous.ordinal, current.ordinal],
    };
  }

  const last = ranges[ranges.length - 1];
  if (last && last.end !== centralDirectory.offset) {
    return {
      outcome: 'REJECTED_RANGE_CONFLICT',
      code: 'ZIP_LOCAL_CENTRAL_DIRECTORY_GAP',
      message: 'Writer project archive contains unaccounted bytes before the central directory.',
      entryOrdinals: [last.ordinal],
    };
  }

  return null;
}

function rejectInventory(
  inventory: ZipArchiveInventory,
  problem: AdmissionProblem,
): ZipArchiveInventory {
  const diagnostic: ZipArchiveDiagnostic = Object.freeze({
    severity: 'error',
    code: problem.code,
    message: problem.message,
    entryOrdinals: Object.freeze([...problem.entryOrdinals]),
  });

  return Object.freeze({
    ...inventory,
    outcome: problem.outcome,
    diagnostics: Object.freeze([diagnostic, ...inventory.diagnostics]),
  });
}

function throwAdmissionError(inventory: ZipArchiveInventory): never {
  const diagnostic = inventory.diagnostics[0];
  throw new ZipStructuralAdmissionError(
    inventory,
    diagnostic?.message ?? 'Writer project archive failed structural admission.',
  );
}

function isFlagSet(flags: number, bit: number): boolean {
  return Math.floor(flags / (2 ** bit)) % 2 === 1;
}

function displayName(value: string): string {
  return Array.from(value)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code === 0 || code < 0x20 || code === 0x7f
        ? `\\u{${code.toString(16).padStart(4, '0')}}`
        : character;
    })
    .join('');
}
