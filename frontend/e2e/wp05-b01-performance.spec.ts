import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { expect, test, type Page, type Browser } from '@playwright/test';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

const SOURCE_DIR = path.join(process.cwd(), 'e2e/fixtures');
const SOURCE_SHA = '658b6536b8edc10931744bd75707155a0e731666c04c6ff46e8591d016f258f7';
const WARMUPS = 2;
const MEASURED = 10;

interface Observation {
  condition: 'fresh-browser-context' | 'reused-browser-context';
  phase: 'warmup' | 'measured';
  ordinal: number;
  elapsed_ms: number;
  source_correct: true;
  recognized: string;
}

function nearestRank(values: number[], percentile: number) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * percentile / 100) - 1)] ?? NaN;
}

async function prepareRealF03Region(page: Page, bytes: Buffer) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({ name: 'F03-scan-only.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await page.getByTestId('ocr-run-advanced-settings').locator('summary').click();
  await page.getByTestId('ocr-engine-select').selectOption('tesseract-js');
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /OCR Area/ }).click();
  const capture = page.getByTestId('writer-overlay-capture').first();
  const bounds = await capture.boundingBox();
  if (!bounds) throw new Error('F03 OCR Area viewport not rendered');
  await page.mouse.move(bounds.x + bounds.width * 0.10, bounds.y + bounds.height * 0.135);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.87, bounds.y + bounds.height * 0.222, { steps: 7 });
  await page.mouse.up();
  await page.getByTestId('ocr-document-region-mode-picker')
    .getByRole('button', { name: 'text', exact: true }).click();
  await page.getByTestId('ocr-region-select').click();
  await expect(page.getByTestId('ocr-region-run')).toBeEnabled();
}

async function recognizeRealRegion(page: Page) {
  const started = performance.now();
  await page.getByTestId('ocr-region-run').click();
  await expect(page.getByTestId('ocr-region-action-message')).toContainText('Region OCR completed.', {
    timeout: 60_000,
  });
  const elapsed = performance.now() - started;
  const recognized = (await page.getByTestId('ocr-region-result-preview').textContent()) ?? '';
  expect(recognized, 'F03 source phrase must be present in every timed trial')
    .toMatch(/ALPHA\s+VALVE\s+10\s+BAR/i);
  return { elapsed_ms: elapsed, recognized };
}

test('B01: original F03 real region OCR 2 warmups plus 10 measured runs per fresh/reused browser condition', async ({ browser, browserName }) => {
  test.skip(process.env.WP05_RUN_B01 !== '1', 'B01 executes only in the dedicated benchmark CI job.');
  test.setTimeout(25 * 60_000);
  const bytes = await fs.readFile(path.join(SOURCE_DIR, 'F03-scan-only.pdf'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(SOURCE_SHA);
  const samples: Observation[] = [];
  const outDir = process.env.WP05_EVIDENCE_DIR ?? path.join(process.cwd(), 'wp05-evidence');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'wp05-B01-F03-region-observations.json');
  let failure: { condition: string; ordinal: number; message: string } | null = null;
  const writeEvidence = async () => {
    const stats = Object.fromEntries(
      (['fresh-browser-context', 'reused-browser-context'] as const).map((condition) => {
        const measured = samples.filter((s) => s.condition === condition && s.phase === 'measured');
        return [condition, {
          measurements: measured.length,
          p50_ms: measured.length ? nearestRank(measured.map((s) => s.elapsed_ms), 50) : null,
          p95_ms: measured.length ? nearestRank(measured.map((s) => s.elapsed_ms), 95) : null,
        }];
      }),
    );
    await fs.writeFile(outFile, JSON.stringify({
      schema: 'wp05-b01-source-verified-region-v1',
      status: failure ? 'FAIL_CLOSED' : samples.length === 24 ? 'OBSERVED_UNGRADED' : 'INCOMPLETE',
      source: { id: 'F03', sha256: SOURCE_SHA, bytes: bytes.byteLength, expected_text: 'ALPHA VALVE 10 BAR' },
      engine: 'tesseract-js',
      conditions: ['fresh-browser-context', 'reused-browser-context'],
      warming_note: 'This Tesseract adapter terminates its worker after every region call; reused browser context is not a warmed persistent OCR model.',
      environment: { checkout_sha: execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim(), github_event_sha: process.env.GITHUB_SHA ?? null, browser: browserName, browser_version: browser.version(), os: os.platform(), cpu: os.cpus()[0]?.model ?? null },
      warmups_required: WARMUPS, measured_required: MEASURED,
      samples, stats, failure,
      certification_note: 'Measured original F03 region recognition only. Correction/cancellation workload metrics require separate cases. No p95 budget authorized.',
    }, null, 2));
  };
  try {
    for (const condition of ['fresh-browser-context', 'reused-browser-context'] as const) {
      let persistentContext: Awaited<ReturnType<Browser['newContext']>> | null = null;
      let persistentPage: Page | null = null;
      try {
        if (condition === 'reused-browser-context') {
          persistentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          persistentPage = await persistentContext.newPage();
          await prepareRealF03Region(persistentPage, bytes);
        }
        for (let i = 0; i < WARMUPS + MEASURED; i += 1) {
          const fresh = condition === 'fresh-browser-context'
            ? await browser.newContext({ viewport: { width: 1440, height: 900 } })
            : null;
          try {
            const page = fresh ? await fresh.newPage() : persistentPage!;
            if (fresh) await prepareRealF03Region(page, bytes);
            const measured = await recognizeRealRegion(page);
            const sample: Observation = {
              condition, phase: i < WARMUPS ? 'warmup' : 'measured',
              ordinal: i + 1, source_correct: true, ...measured,
            };
            samples.push(sample);
            process.stdout.write(`WP05_B01_SAMPLE ${JSON.stringify(sample)}\n`);
          } catch (error) {
            failure = { condition, ordinal: i + 1, message: String(error) };
            throw error;
          } finally {
            await writeEvidence();
            await fresh?.close();
          }
        }
      } finally {
        await persistentContext?.close();
      }
    }
  } finally {
    await writeEvidence();
  }
  expect(samples.filter((s) => s.phase === 'measured')).toHaveLength(20);
});
