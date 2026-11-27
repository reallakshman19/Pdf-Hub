/**
 * Compute a simple SHA-256 hash of an ArrayBuffer or Uint8Array and
 * return it as a hex string using the standard Web Crypto API
 * (available in browsers, Web Workers, and Node >= 19).
 */
export async function computeFileHash(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer: ArrayBuffer = data instanceof Uint8Array
    ? (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength && data.buffer instanceof ArrayBuffer
        ? data.buffer
        : Uint8Array.from(data).buffer)
    : data;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto subtle.digest is unavailable in this environment.');
  }

  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}