import type { Page } from '@playwright/test';

/**
 * Pdf-Hub's FileAdapter prefers the File System Access API
 * (window.showOpenFilePicker / showSaveFilePicker) when available, and only
 * falls back to a real <input type="file"> / <a download> anchor otherwise.
 * The FSA API opens a genuine OS file dialog that Playwright cannot drive,
 * so every spec that opens or saves a file must call this before
 * page.goto() to force the app down its already-implemented, fully
 * automatable fallback path.
 */
export async function stubNativeFilePickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
}
