import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * WP-05 synthetic fixtures only. Persist CI evidence outside Playwright's
 * automatically pruned test-results output, which discards attachments from
 * passing tests. This must NEVER be called with owner/customer PDF bytes.
 */
export async function persistWp05SyntheticEvidence(
  filename: string,
  bytes: Uint8Array,
): Promise<void> {
  const dir = process.env.WP05_EVIDENCE_DIR;
  if (!dir) return;
  if (!/^wp05-[a-z0-9-]+\.(?:pdf|pdfhub\.zip)$/.test(filename)) {
    throw new Error(`Unsafe WP-05 synthetic evidence name: ${filename}`);
  }
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  process.stdout.write(`WP05_SYNTHETIC_NATIVE_EVIDENCE name=${filename} bytes=${bytes.byteLength} sha256=${digest}\n`);
}
