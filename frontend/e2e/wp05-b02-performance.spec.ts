import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { jumpToPhase8gPage, waitForPhase8gRenderedPage } from './phase8gBrowserBenchmarkSupport';

const WARMUPS = 2;
const MEASURED = 10;
const FIXTURE_DIR = path.join(process.cwd(), 'e2e/fixtures/wp05-source-f01-f08');
const SHA: Record<number,string> = {
  100: '3199e92b935991f31d3b134fa8c907f059bcda243158390f81c681be25883de0',
  500: 'dc42b78cbd6db7c5b90b09a005875ad848d28b19632d47675499adbeb329e078',
};

type Metric = 'admission_ms' | 'navigation_ms' | 'rotate_save_ms' | 'extract_reopen_ms';
interface Sample {
  ordinal: number;
  phase: 'warmup' | 'measured';
  valid: true;
  timings_ms: Record<Metric,number>;
  output_bytes: { rotated: number; extracted: number };
}

function nearestRank(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
}

async function downloadBytes(page: Page, controlName: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45_000 }),
    page.getByRole('button', { name: controlName, exact: true }).click({ timeout: 10_000 }),
  ]).catch(async (error: unknown) => {
    const alerts = await page.getByRole('alert').allTextContents().catch(() => []);
    const status = await page.locator('[role="status"]').allTextContents().catch(() => []);
    const pageCount = await page.locator('input[inputmode="numeric"][aria-label^="Page "]').first().getAttribute('aria-label').catch(() => null);
    throw new Error(`Native ${controlName} failed; ${String(error)}; alerts=${JSON.stringify(alerts)}; status=${JSON.stringify(status)}; navigator=${pageCount}`);
  });
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`${controlName} returned no native file bytes`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

async function assertExtractedText(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await task.promise;
  try {
    expect(pdf.numPages).toBe(3);
    for (let index = 1; index <= 3; index += 1) {
      const page = await pdf.getPage(index);
      const text = (await page.getTextContent()).items
        .map((item) => ('str' in item ? item.str : '')).join(' ');
      expect(text).toContain(`PDFHUB FIXTURE PAGE ${String(index).padStart(4, '0')}`);
    }
  } finally {
    await pdf.destroy();
  }
}

async function oneB02Trial(browser: Browser, source: Uint8Array, count: number, index: number): Promise<Sample> {
  const phase = index < WARMUPS ? 'warmup' : 'measured';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await stubNativeFilePickers(page);
    await page.goto('./');
    const [picker] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Browse Files' }).click(),
    ]);
    const started = performance.now();
    await picker.setFiles({
      name: `F${count === 100 ? '05' : '06'}-benchmark-${count}p.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(source),
    });
    await waitForPhase8gRenderedPage(page, 1);
    const admission = performance.now() - started;

    const middle = Math.floor(count / 2);
    const navStart = performance.now();
    for (const target of [1, middle, count]) {
      await jumpToPhase8gPage(page, target);
      await expect(page.locator(`[data-page="${target}"] canvas`)).toBeVisible();
    }
    const navigation = performance.now() - navStart;

    await jumpToPhase8gPage(page, 2);
    await page.getByRole('tab', { name: 'Organize' }).click();
    const rotateStart = performance.now();
    await page.getByRole('button', { name: 'Rotate selected or current pages' }).click();
    // The command bus is asynchronous. A click is not a commit acknowledgement;
    // wait for an explicit completed mutation before invoking Save.
    await expect(page.getByRole('alert').filter({ hasText: 'Rotated 1 page(s) by 90°.' }))
      .toBeVisible({ timeout: 45_000 });
    await page.getByRole('tab', { name: 'File' }).click();
    const rotatedBytes = await downloadBytes(page, 'Save');
    await fs.mkdir(path.join(process.cwd(), 'wp05-evidence'), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), 'wp05-evidence', `wp05-B02-${count}p-rotated.pdf`), rotatedBytes);
    const rotated = await PDFDocument.load(rotatedBytes);
    expect(rotated.getPageCount()).toBe(count);
    expect(rotated.getPage(0).getRotation().angle).toBe(0);
    expect(rotated.getPage(1).getRotation().angle).toBe(90);
    const rotateSave = performance.now() - rotateStart;

    // Physical page selection via the real virtualized thumbnail sidebar.
    await jumpToPhase8gPage(page, 1);
    let thumb1 = page.getByRole('button', { name: 'Page 1', exact: true });
    if (!await thumb1.isVisible()) {
      await page.getByRole('button', { name: 'Pages', exact: true }).click();
    }
    thumb1 = page.getByRole('button', { name: 'Page 1', exact: true });
    await expect(thumb1).toBeVisible({ timeout: 20_000 });
    const extractStart = performance.now();
    await thumb1.click();
    await page.getByRole('button', { name: 'Page 2', exact: true }).click({ modifiers: ['Control'] });
    await page.getByRole('button', { name: 'Page 3', exact: true }).click({ modifiers: ['Control'] });
    await page.getByRole('tab', { name: 'Organize' }).click();
    const extractedBytes = await downloadBytes(page, 'Extract selected or current pages');
    const extractedPath = path.join(process.cwd(), 'wp05-evidence', `wp05-B02-${count}p-extracted.pdf`);
    await fs.writeFile(extractedPath, extractedBytes);
    const bytesOnDisk = await fs.readFile(extractedPath);
    expect(bytesOnDisk).toEqual(Buffer.from(extractedBytes));
    expect(bytesOnDisk.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    await assertExtractedText(extractedBytes);

    // The extracted native PDF must load in a fresh app context, not only in PDF.js.
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const reopened = await fresh.newPage();
      const browserExceptions: string[] = [];
      const consoleErrors: string[] = [];
      reopened.on('pageerror', (error) => browserExceptions.push(String(error)));
      reopened.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await stubNativeFilePickers(reopened);
      await reopened.goto('./');
      const [reopenPicker] = await Promise.all([
        reopened.waitForEvent('filechooser'),
        reopened.getByRole('button', { name: 'Browse Files' }).click(),
      ]);
      // Reopen the exact *on-disk native PDF* that was downloaded from the
      // product. This avoids inventing a second in-memory Playwright file
      // payload and lets us independently check the browser File bytes.
      await reopenPicker.setFiles(extractedPath);
      const selectedUpload = await reopenPicker.element().evaluate(async (element) => {
        const file = (element as HTMLInputElement).files?.[0];
        if (!file) return null;
        const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
        return { size: file.size, prefix: [...prefix] };
      });
      expect(selectedUpload?.size).toBe(extractedBytes.byteLength);
      expect(selectedUpload?.prefix).toEqual([...extractedBytes.subarray(0, 16)]);
      try {
        await expect(reopened.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 15_000 });
      } catch (error) {
        const openFailure = await reopened.getByTestId('open-pdf-failure').allTextContents().catch(() => []);
        const alerts = await reopened.getByRole('alert').allTextContents().catch(() => []);
        const visibleText = (await reopened.locator('body').innerText().catch(() => '')).slice(-2400);
        const sourceState = await reopened.locator('input[inputmode="numeric"][aria-label^="Page "]').first().getAttribute('aria-label').catch(() => null);
        throw new Error(`Extracted ${count}-page source produced independently parseable 3-page PDF but app did not reopen: ${String(error)}; explicit_open_failure=${JSON.stringify(openFailure)}; alerts=${JSON.stringify(alerts)}; browser_exceptions=${JSON.stringify(browserExceptions)}; console_errors=${JSON.stringify(consoleErrors)}; navigator=${sourceState}; body=${visibleText}`);
      }
    } finally {
      await fresh.close();
    }
    const extractReopen = performance.now() - extractStart;

    return {
      ordinal: index + 1,
      phase,
      valid: true,
      timings_ms: {
        admission_ms: admission,
        navigation_ms: navigation,
        rotate_save_ms: rotateSave,
        extract_reopen_ms: extractReopen,
      },
      output_bytes: {
        rotated: rotatedBytes.byteLength,
        extracted: extractedBytes.byteLength,
      },
    };
  } finally {
    await context.close();
  }
}

for (const pageCount of [100, 500] as const) {
  test(`B02: exact F${pageCount === 100 ? '05' : '06'} ${pageCount} pages, 2 warmups + 10 correctness-gated full workflows`, async ({ browser, browserName }) => {
    test.skip(process.env.WP05_RUN_B02 !== '1', 'B02 runs only in the dedicated performance job.');
    test.setTimeout(30 * 60_000);
    const source = new Uint8Array(await fs.readFile(path.join(FIXTURE_DIR, `F${pageCount === 100 ? '05' : '06'}-benchmark-${pageCount}p.pdf`)));
    const observed = createHash('sha256').update(source).digest('hex');
    expect(observed).toBe(SHA[pageCount]);
    expect((await PDFDocument.load(source)).getPageCount()).toBe(pageCount);
    const samples: Sample[] = [];
    let failure: { ordinal: number; message: string } | null = null;
    const outDir = path.join(process.cwd(), 'wp05-evidence');
    await fs.mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, `wp05-B02-${pageCount}p-observations.json`);
    try {
      for (let i = 0; i < WARMUPS + MEASURED; i += 1) {
        try {
          const sample = await oneB02Trial(browser, source, pageCount, i);
          samples.push(sample);
          console.log('WP05_B02_SAMPLE', JSON.stringify({ fixture: pageCount, ...sample }));
        } catch (error) {
          failure = { ordinal: i + 1, message: String(error) };
          throw error;
        } finally {
          const measured = samples.filter((s) => s.phase === 'measured');
          const metrics = ['admission_ms', 'navigation_ms', 'rotate_save_ms', 'extract_reopen_ms'] as const;
          const summary = Object.fromEntries(metrics.map((metric) => [
            metric, {
              sample_count: measured.length,
              p50_ms: measured.length ? nearestRank(measured.map((s) => s.timings_ms[metric]), 50) : null,
              p95_ms: measured.length ? nearestRank(measured.map((s) => s.timings_ms[metric]), 95) : null,
            },
          ]));
          await fs.writeFile(outFile, JSON.stringify({
            schema: 'wp05-b02-correctness-gated-v1',
            status: failure ? 'FAIL_CLOSED' : samples.length === 12 ? 'OBSERVED_UNGRADED' : 'INCOMPLETE',
            fixture: { id: pageCount === 100 ? 'F05' : 'F06', pages: pageCount, sha256: observed, bytes: source.byteLength },
            environment: { checkout_sha: execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim(), github_event_sha: process.env.GITHUB_SHA ?? null, browser: browserName, browser_version: browser.version(), os: os.platform(), cpu: os.cpus()[0]?.model ?? null },
            warmups_required: WARMUPS, samples_required: MEASURED,
            samples, summary, failure,
            verdict_note: 'No p95 regression threshold authorized; measured success does not imply performance approval.',
          }, null, 2));
        }
      }
    } finally {
      console.log('WP05_B02_OUTPUT', outFile);
    }
    expect(samples.filter((s) => s.phase === 'measured')).toHaveLength(10);
  });
}
