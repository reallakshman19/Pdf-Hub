/**
 * Trigger a download of a Blob in the browser.  When running in a
 * non‑browser environment this function has no effect.  The filename
 * parameter should include the file extension (e.g. `.pdf`).
 *
 * The object URL is revoked after a delay rather than in the same tick
 * as the click: revoking immediately aborts the download in Firefox and
 * older Safari, which read the URL asynchronously after `click()` returns.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}