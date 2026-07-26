const CRC32_TABLE = Object.freeze(
  Array.from({ length: 256 }, (_unused, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }
    return value >>> 0;
  }),
);

export class ZipCrc32 {
  private value = 0xffffffff;

  update(bytes: Uint8Array): void {
    let next = this.value;
    for (const byte of bytes) {
      next = CRC32_TABLE[(next ^ byte) & 0xff]! ^ (next >>> 8);
    }
    this.value = next >>> 0;
  }

  digest(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }
}

export function computeZipCrc32(bytes: Uint8Array): number {
  const crc = new ZipCrc32();
  crc.update(bytes);
  return crc.digest();
}
