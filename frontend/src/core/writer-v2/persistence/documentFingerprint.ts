export async function documentFingerprintFromBytes(
  bytes: Uint8Array,
): Promise<string> {
  const exactBytes = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : new Uint8Array(bytes);

  if (globalThis.crypto?.subtle) {
    const buffer = exactBytes.buffer.slice(exactBytes.byteOffset, exactBytes.byteOffset + exactBytes.byteLength);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(buffer as ArrayBuffer));
    return `sha256:${toHex(new Uint8Array(digest))}`;
  }

  return `fnv1a64:${fallbackFnv1a64(exactBytes)}`;
}

export async function documentFingerprintFromFileLike(input: {
  name?: string;
  bytes: Uint8Array;
}): Promise<string> {
  const hash = await documentFingerprintFromBytes(input.bytes);
  return input.name ? `${hash}:${stableNamePart(input.name)}` : hash;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function stableNamePart(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function fallbackFnv1a64(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, '0');
}
