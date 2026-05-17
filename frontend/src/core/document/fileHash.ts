/**
 * Compute a simple SHA‑256 hash of an ArrayBuffer or Uint8Array and
 * return it as a hex string.  When the Web Crypto API is available
 * (in the browser), it is used; otherwise Node.js `crypto` is used.
 */
export async function computeFileHash(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof Uint8Array ? data.buffer : data;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Fallback to Node.js crypto
    const { createHash } = await import('crypto');
    const hash = createHash('sha256');
    hash.update(Buffer.from(buffer));
    return hash.digest('hex');
  }
}