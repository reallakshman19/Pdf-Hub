/**
 * Trigger a download of a Blob in the browser.  When running in a
 * non‑browser environment this function has no effect.  The filename
 * parameter should include the file extension (e.g. `.pdf`).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}