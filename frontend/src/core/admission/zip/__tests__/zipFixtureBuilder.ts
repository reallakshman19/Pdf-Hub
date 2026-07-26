const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

export interface RawZipFixtureEntry {
  readonly name: string | readonly number[];
  readonly data?: readonly number[];
  readonly flags?: number;
  readonly method?: number;
  readonly crc32?: number;
  readonly compressedSize?: number;
  readonly uncompressedSize?: number;
  readonly localName?: string | readonly number[];
  readonly localFlags?: number;
  readonly localMethod?: number;
  readonly localCrc32?: number;
  readonly localCompressedSize?: number;
  readonly localUncompressedSize?: number;
  readonly localExtra?: readonly number[];
  readonly centralExtra?: readonly number[];
  readonly comment?: readonly number[];
  readonly externalAttributes?: number;
  readonly localHeaderOffsetOverride?: number;
  readonly localSignature?: number;
  readonly diskStart?: number;
}

export interface RawZipFixtureOptions {
  readonly diskNumber?: number;
  readonly centralDirectoryStartDisk?: number;
  readonly recordsOnDisk?: number;
  readonly totalRecords?: number;
  readonly centralDirectoryOffsetOverride?: number;
  readonly centralDirectorySizeOverride?: number;
  readonly archiveComment?: readonly number[];
  readonly prepend?: readonly number[];
  readonly append?: readonly number[];
  readonly includeZip64Locator?: boolean;
}

export interface RawZipFixture {
  readonly bytes: Uint8Array;
  readonly localHeaderOffsets: readonly number[];
  readonly centralDirectoryOffset: number;
  readonly eocdOffset: number;
}

export function buildRawZipFixture(
  entries: readonly RawZipFixtureEntry[],
  options: RawZipFixtureOptions = {},
): RawZipFixture {
  const prepend = Uint8Array.from(options.prepend ?? []);
  const localParts: Uint8Array[] = [prepend];
  const localHeaderOffsets: number[] = [];
  let localCursor = prepend.byteLength;

  for (const entry of entries) {
    const localName = encodeName(entry.localName ?? entry.name);
    const data = Uint8Array.from(entry.data ?? []);
    const localExtra = Uint8Array.from(entry.localExtra ?? []);
    const method = entry.method ?? 0;
    const flags = entry.flags ?? 0;
    const compressedSize = entry.compressedSize ?? data.byteLength;
    const uncompressedSize = entry.uncompressedSize ?? data.byteLength;
    const localHeader = new Uint8Array(30 + localName.byteLength + localExtra.byteLength);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, entry.localSignature ?? LOCAL_FILE_HEADER_SIGNATURE, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, entry.localFlags ?? flags, true);
    view.setUint16(8, entry.localMethod ?? method, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, entry.localCrc32 ?? entry.crc32 ?? 0, true);
    view.setUint32(18, entry.localCompressedSize ?? compressedSize, true);
    view.setUint32(22, entry.localUncompressedSize ?? uncompressedSize, true);
    view.setUint16(26, localName.byteLength, true);
    view.setUint16(28, localExtra.byteLength, true);
    localHeader.set(localName, 30);
    localHeader.set(localExtra, 30 + localName.byteLength);

    localHeaderOffsets.push(localCursor);
    localParts.push(localHeader, data);
    localCursor += localHeader.byteLength + data.byteLength;
  }

  const centralDirectoryOffset = localCursor;
  const centralParts: Uint8Array[] = [];
  let centralDirectoryBytes = 0;

  entries.forEach((entry, ordinal) => {
    const name = encodeName(entry.name);
    const extra = Uint8Array.from(entry.centralExtra ?? []);
    const comment = Uint8Array.from(entry.comment ?? []);
    const dataLength = entry.data?.length ?? 0;
    const compressedSize = entry.compressedSize ?? dataLength;
    const uncompressedSize = entry.uncompressedSize ?? dataLength;
    const central = new Uint8Array(46 + name.byteLength + extra.byteLength + comment.byteLength);
    const view = new DataView(central.buffer);

    view.setUint32(0, CENTRAL_DIRECTORY_SIGNATURE, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, entry.flags ?? 0, true);
    view.setUint16(10, entry.method ?? 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, entry.crc32 ?? 0, true);
    view.setUint32(20, compressedSize, true);
    view.setUint32(24, uncompressedSize, true);
    view.setUint16(28, name.byteLength, true);
    view.setUint16(30, extra.byteLength, true);
    view.setUint16(32, comment.byteLength, true);
    view.setUint16(34, entry.diskStart ?? 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(
      38,
      entry.externalAttributes ?? (name[name.byteLength - 1] === 0x2f ? 0x10 : 0),
      true,
    );
    view.setUint32(
      42,
      entry.localHeaderOffsetOverride ?? localHeaderOffsets[ordinal] ?? 0,
      true,
    );
    central.set(name, 46);
    central.set(extra, 46 + name.byteLength);
    central.set(comment, 46 + name.byteLength + extra.byteLength);
    centralParts.push(central);
    centralDirectoryBytes += central.byteLength;
  });

  const zip64Locator = options.includeZip64Locator
    ? uint32Record(ZIP64_LOCATOR_SIGNATURE, new Array<number>(16).fill(0))
    : new Uint8Array();
  const archiveComment = Uint8Array.from(options.archiveComment ?? []);
  const eocdOffset = centralDirectoryOffset + centralDirectoryBytes + zip64Locator.byteLength;
  const eocd = new Uint8Array(22 + archiveComment.byteLength);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, EOCD_SIGNATURE, true);
  eocdView.setUint16(4, options.diskNumber ?? 0, true);
  eocdView.setUint16(6, options.centralDirectoryStartDisk ?? 0, true);
  eocdView.setUint16(8, options.recordsOnDisk ?? entries.length, true);
  eocdView.setUint16(10, options.totalRecords ?? entries.length, true);
  eocdView.setUint32(
    12,
    options.centralDirectorySizeOverride ?? centralDirectoryBytes,
    true,
  );
  eocdView.setUint32(
    16,
    options.centralDirectoryOffsetOverride ?? centralDirectoryOffset,
    true,
  );
  eocdView.setUint16(20, archiveComment.byteLength, true);
  eocd.set(archiveComment, 22);

  const bytes = concatBytes([
    ...localParts,
    ...centralParts,
    zip64Locator,
    eocd,
    Uint8Array.from(options.append ?? []),
  ]);

  return {
    bytes,
    localHeaderOffsets: Object.freeze([...localHeaderOffsets]),
    centralDirectoryOffset,
    eocdOffset,
  };
}

export function patchUint16(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = Uint8Array.from(bytes);
  new DataView(copy.buffer).setUint16(offset, value, true);
  return copy;
}

export function patchUint32(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = Uint8Array.from(bytes);
  new DataView(copy.buffer).setUint32(offset, value, true);
  return copy;
}

export function truncateBytes(bytes: Uint8Array, length: number): Uint8Array {
  return bytes.slice(0, Math.max(0, length));
}

function encodeName(value: string | readonly number[]): Uint8Array {
  return typeof value === 'string'
    ? new TextEncoder().encode(value)
    : Uint8Array.from(value);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function uint32Record(signature: number, tail: readonly number[]): Uint8Array {
  const result = new Uint8Array(4 + tail.length);
  new DataView(result.buffer).setUint32(0, signature, true);
  result.set(tail, 4);
  return result;
}
