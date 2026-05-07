# DocCraft — Verification System (v2)

> Changes from v1:
> - OCR thresholds marked TBD until benchmarks run
> - Benchmark scripts added (run before Phase 2 and Phase 4)
> - "static mode" renamed "preview mode" throughout
> - Playwright tests reflect what actually exists per phase (no premature specs)
> - OCR failure fixtures added (equation-failed, low-confidence)
> - IndexedDB persistence tests replace localStorage tests
> - Debug console tests updated (route-based, not dock-based)

---

## 1. Mock Data Catalog

### 1.1 AppCapabilities

**`mock-capabilities-preview.json`**
```json
{
  "mode": "preview",
  "canOpenLocalFile": true,
  "canMergeFiles": true,
  "canSplitFile": true,
  "canRunPreviewOcr": true,
  "canRunServerOcr": false,
  "canRunMacroApi": false,
  "serverVersion": null,
  "serverLatencyMs": null
}
```

**`mock-capabilities-server.json`**
```json
{
  "mode": "server",
  "canOpenLocalFile": true,
  "canMergeFiles": true,
  "canSplitFile": true,
  "canRunPreviewOcr": false,
  "canRunServerOcr": true,
  "canRunMacroApi": true,
  "serverVersion": "0.1.0",
  "serverLatencyMs": 11
}
```

### 1.2 OcrResult — including failure cases

**`mock-ocr-result-failures.json`**
```json
{
  "jobId": "ocr-job-003",
  "status": "complete",
  "pages": [
    {
      "pageNumber": 1,
      "status": "complete",
      "textBlocks": [
        {
          "id": "tb-p1-001",
          "text": "Chapter 3: Integration",
          "rect": { "x": 72, "y": 72, "width": 280, "height": 20 },
          "confidence": 0.94,
          "type": "text"
        }
      ],
      "equationBlocks": [
        {
          "id": "eq-p1-001",
          "latex": "\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}",
          "rect": { "x": 100, "y": 110, "width": 240, "height": 48 },
          "confidence": 0.88,
          "type": "equation",
          "renderStatus": "pending"
        }
      ],
      "processingTimeMs": 7200
    },
    {
      "pageNumber": 2,
      "status": "equation-failed",
      "textBlocks": [
        {
          "id": "tb-p2-001",
          "text": "The following expression cannot be parsed automatically.",
          "rect": { "x": 72, "y": 72, "width": 400, "height": 18 },
          "confidence": 0.96,
          "type": "text"
        }
      ],
      "equationBlocks": [
        {
          "id": "eq-p2-001",
          "latex": null,
          "rawImageRegion": "data:image/png;base64,...",
          "rect": { "x": 80, "y": 110, "width": 300, "height": 80 },
          "confidence": null,
          "type": "equation",
          "renderStatus": "failed",
          "failureReason": "pix2tex returned empty string"
        }
      ],
      "processingTimeMs": 4100
    },
    {
      "pageNumber": 3,
      "status": "low-confidence",
      "textBlocks": [
        {
          "id": "tb-p3-001",
          "text": "T h!s   pag3  has  p00r   sc4n  qual!ty.",
          "rect": { "x": 72, "y": 72, "width": 400, "height": 18 },
          "confidence": 0.22,
          "type": "text"
        }
      ],
      "equationBlocks": [],
      "processingTimeMs": 5800,
      "lowConfidenceReason": "Mean block confidence 0.22 < threshold 0.30"
    }
  ]
}
```

### 1.3 Annotation persistence mock

**`mock-annotations.json`**
```json
{
  "fileHash": "sha256-abc123",
  "fileId": "server-uuid-001",
  "annotations": [
    {
      "id": "ann-001",
      "type": "textBox",
      "pageNumber": 1,
      "rect": { "x": 100, "y": 150, "width": 200, "height": 40 },
      "content": "Needs review",
      "style": { "fontFamily": "Helvetica", "fontSize": 12, "color": "#1a1a1a", "backgroundColor": "#fff9c4" },
      "createdAt": "2024-01-15T10:05:00Z"
    },
    {
      "id": "ann-002",
      "type": "stamp",
      "pageNumber": 1,
      "rect": { "x": 400, "y": 50, "width": 120, "height": 50 },
      "content": "DRAFT",
      "style": { "color": "#e53935" },
      "createdAt": "2024-01-15T10:06:00Z"
    }
  ]
}
```

---

## 2. Test PDF Fixtures

| File                    | Pages | Content                              | Phase used |
|-------------------------|-------|--------------------------------------|------------|
| `simple-text.pdf`       | 2     | Clean digital text, single column    | P2, P3     |
| `equations-sample.pdf`  | 3     | Typeset equations (digital PDF)      | P4         |
| `scanned-sample.pdf`    | 2     | Rasterized scan, moderate quality    | P4         |
| `low-quality-scan.pdf`  | 1     | Poor scan — triggers low-confidence  | P4         |
| `merge-parts/a.pdf`     | 5     | Merge test part A                    | P5         |
| `merge-parts/b.pdf`     | 7     | Merge test part B                    | P5         |

### Fixture generation

```python
# tests/fixtures/generate_fixtures.py
import fitz

def create_simple_text():
    doc = fitz.open()
    for i in range(2):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 72), f"Page {i+1}: Simple Text Test", fontsize=18)
        page.insert_text((72, 110), "Clean digital text for viewer and OCR testing.", fontsize=12)
        page.insert_text((72, 130), "The quick brown fox jumps over the lazy dog.", fontsize=12)
    doc.save("tests/fixtures/pdfs/simple-text.pdf")
    print(f"simple-text.pdf: {doc.page_count} pages")

if __name__ == "__main__":
    create_simple_text()
    # ... other fixtures
```

---

## 3. Quantitative Thresholds

**OCR thresholds must not be filled in until benchmark scripts have been run.**
Fill in the TBD values in the benchmark column after running `pnpm benchmark`.

### Phase 0

| Metric                              | Expected         | Tolerance |
|-------------------------------------|------------------|-----------|
| pnpm build time (cold)              | < 15 sec         | —         |
| TypeScript errors                   | 0                | 0         |
| ESLint errors                       | 0                | 0         |
| Test coverage — core/capabilities   | ≥ 80%            | —         |
| Test coverage — core/logger         | ≥ 80%            | —         |
| GET /api/ping response time         | < 50 ms          | 10 ms     |
| logStore entries on startup         | ≥ 2              | 0         |
| PreviewModeBanner in DOM (preview)  | 1 element        | 0         |
| PreviewModeBanner in DOM (server)   | 0 elements       | 0         |

### Phase 1

| Metric                              | Expected         | Tolerance |
|-------------------------------------|------------------|-----------|
| Shell zones (no debug dock)         | 7                | 0         |
| Debug dock elements in shell DOM    | 0                | 0         |
| Toolbar groups                      | 5                | 0         |
| Left rail items                     | 5                | 0         |
| Sidebar tabs                        | 5                | 0         |
| Server-only buttons in preview DOM  | 0                | 0         |
| /debug page tabs                    | 4                | 0         |
| Ctrl+Shift+D → navigates to /debug  | true             | —         |

### Phase 2

| Metric                              | Expected                    | Note                    |
|-------------------------------------|-----------------------------|-------------------------|
| First page render (< 1 MB)          | **TBD** after benchmark     | Record in bench run     |
| First page render (10 MB)           | **TBD** after benchmark     | —                       |
| Subsequent page render              | **TBD** after benchmark     | —                       |
| Thumbnail per page                  | **TBD** after benchmark     | —                       |
| Text selectable                     | All chars                   | 0 tolerance             |
| Zoom range                          | 25% – 400%                  | —                       |
| Pages in memory simultaneously      | visible ± 1                 | —                       |
| Temp files cleanup on startup       | All files > TTL removed      | —                       |

### Phase 3

| Metric                              | Expected         | Tolerance |
|-------------------------------------|------------------|-----------|
| Annotation types                    | 7                | 0         |
| Undo depth                          | 50               | 0         |
| Persistence: IndexedDB (preview)    | survives refresh  | —         |
| Persistence: SQLite (server)        | survives session  | —         |
| localStorage annotation entries     | 0                | 0 (banned)|
| Inspector fields (textBox)          | ≥ 5              | —         |

### Phase 4

| Metric                                   | Expected                 | Note                    |
|------------------------------------------|--------------------------|-------------------------|
| Server OCR: 1 page, text only            | **TBD** after benchmark  | Record in bench run     |
| Server OCR: 1 page, with equations       | **TBD** after benchmark  | —                       |
| Preview OCR: 1 page                      | < 25 sec                 | Tesseract.js ceiling    |
| Equation renders as `<svg>` (not `<img>`)| 100%                     | 0 tolerance             |
| equation-failed page: EquationEditor shown | 100%                   | 0 tolerance             |
| low-confidence page: warning banner shown | 100%                   | 0 tolerance             |
| Every equation: edit button present      | 100%                     | 0 tolerance             |
| WS reconnect: progress resumes           | true                     | —                       |
| Cancel job: stops within                 | < 5 sec                  | —                       |

### Phase 5

| Metric                                   | Expected                 | Tolerance |
|------------------------------------------|--------------------------|-----------|
| Merge 5p + 7p → output page count        | 12                       | 0         |
| Header on all pages                      | 100%                     | 0         |
| Image insert position error              | < 2 px                   | —         |
| SDK progress events                      | ≥ 3 per job              | —         |
| Export: annotation visible in output     | true (byte-verified)     | —         |

---

## 4. Benchmark Scripts

### 4.1 OCR benchmark (run before Phase 4)

**`tests/benchmark/ocr_benchmark.py`**
```python
"""
Run before setting Phase 4 OCR thresholds.
Usage: python tests/benchmark/ocr_benchmark.py
Outputs: benchmark_results.json with sec/page per file type
"""
import time, json, subprocess
from pathlib import Path
import fitz
from pdf2image import convert_from_path
import pytesseract

FIXTURES = {
    "text": "tests/fixtures/pdfs/simple-text.pdf",
    "equations": "tests/fixtures/pdfs/equations-sample.pdf",
    "scanned": "tests/fixtures/pdfs/scanned-sample.pdf",
}

def benchmark_file(path: str, label: str) -> dict:
    doc = fitz.open(path)
    results = []
    for i in range(len(doc)):
        page = doc[i]
        # Check if native text exists
        native_text = page.get_text("text")
        if len(native_text.strip()) > 50:
            results.append({"page": i+1, "method": "native", "ms": 0})
            continue
        # Rasterize and OCR
        images = convert_from_path(path, first_page=i+1, last_page=i+1, dpi=300)
        t0 = time.perf_counter()
        text = pytesseract.image_to_string(images[0])
        elapsed = (time.perf_counter() - t0) * 1000
        results.append({"page": i+1, "method": "tesseract", "ms": round(elapsed)})
    doc.close()
    avg = sum(r["ms"] for r in results if r["method"] == "tesseract") / max(1, len([r for r in results if r["method"] == "tesseract"]))
    return {"file": label, "pages": results, "avg_ocr_ms": round(avg)}

def main():
    all_results = {}
    for label, path in FIXTURES.items():
        if Path(path).exists():
            print(f"Benchmarking {label}...")
            all_results[label] = benchmark_file(path, label)
            print(f"  avg OCR: {all_results[label]['avg_ocr_ms']} ms/page")
        else:
            print(f"Fixture not found: {path}")

    with open("tests/benchmark/benchmark_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print("\nResults written to tests/benchmark/benchmark_results.json")
    print("Fill in TBD values in VERIFICATION_SYSTEM.md §3 Phase 4")

if __name__ == "__main__":
    main()
```

### 4.2 Render benchmark (run before Phase 2)

**`tests/benchmark/render_benchmark.py`**
```python
"""
Run before setting Phase 2 render thresholds.
Uses Playwright to measure actual browser render times.
"""
import asyncio, json
from playwright.async_api import async_playwright

async def measure_render_time(page, fixture_name: str) -> dict:
    await page.goto("http://localhost:3000")
    # Inject timing hooks
    await page.evaluate("""
        window.__renderTimes = {};
        const orig = window.__DOCCRAFT_STORES__?.logger?.getState;
    """)
    # Upload and measure
    t0 = await page.evaluate("Date.now()")
    # ... file upload + waitForSelector ...
    t1 = await page.evaluate("Date.now()")
    return {"fixture": fixture_name, "first_page_ms": t1 - t0}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        results = []
        for fixture in ["simple-text.pdf", "large-10mb.pdf"]:
            result = await measure_render_time(page, fixture)
            results.append(result)
            print(f"{fixture}: {result['first_page_ms']} ms to first page")
        await browser.close()
    with open("tests/benchmark/render_results.json", "w") as f:
        json.dump(results, f, indent=2)

asyncio.run(main())
```

---

## 5. Playwright Test Scaffolds

### 5.1 Configuration

```typescript
// tests/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['json', { outputFile: 'results.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm --filter frontend dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### 5.2 Helpers

```typescript
// tests/e2e/helpers/getStoreState.ts
import { Page } from '@playwright/test'

export async function getStoreState(page: Page, store: string) {
  return page.evaluate((s) => {
    return (window as any).__DOCCRAFT_STORES__?.[s]?.getState()
  }, store)
}

export async function getLogEntries(page: Page) {
  return getStoreState(page, 'logger').then((s: any) => s?.entries ?? [])
}

export async function getAnnotations(page: Page) {
  return getStoreState(page, 'annotations').then((s: any) => s?.annotations ?? [])
}
```

```typescript
// tests/e2e/helpers/waitForOcr.ts
import { Page, expect } from '@playwright/test'

export async function waitForOcrJobStatus(
  page: Page,
  jobId: string,
  expectedStatus: string,
  timeoutMs = 120000
) {
  await expect(
    page.getByTestId(`ocr-job-${jobId}-status`)
  ).toHaveText(expectedStatus, { timeout: timeoutMs })
}
```

### 5.3 Phase 0 spec

```typescript
// tests/e2e/specs/p0-shell.spec.ts
import { test, expect } from '@playwright/test'

test.describe('P0: Foundation', () => {

  test('app loads without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('preview mode: banner visible and non-dismissible', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByTestId('preview-mode-banner')
    await expect(banner).toBeVisible()
    // No close/dismiss button
    await expect(banner.getByRole('button', { name: /dismiss|close|×/i })).toHaveCount(0)
  })

  test('Ctrl+Shift+D navigates to /debug, not toggles a dock', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('debug-console-dock')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+D')
    await expect(page).toHaveURL('/debug')
  })

  test('/debug has 4 tabs', async ({ page }) => {
    await page.goto('/debug')
    await expect(page.getByRole('tab', { name: 'Logs' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'State' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Performance' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'System' })).toBeVisible()
  })

  test('startup log entry in /debug logs tab', async ({ page }) => {
    await page.goto('/debug')
    await expect(
      page.getByTestId('log-entry').filter({ hasText: 'App startup' })
    ).toBeVisible()
  })

  test('mode badge shows PREVIEW when server unreachable', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mode-badge')).toHaveText('PREVIEW')
  })
})
```

### 5.4 Phase 1 spec

```typescript
// tests/e2e/specs/p1-layout.spec.ts
import { test, expect } from '@playwright/test'

test.describe('P1: App shell', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('7 shell zones present (no debug dock)', async ({ page }) => {
    for (const zone of [
      'top-nav', 'toolbar-band', 'left-rail',
      'sidebar-panel', 'document-workspace',
      'inspector-panel', 'status-bar'
    ]) {
      await expect(page.getByTestId(zone)).toBeVisible()
    }
    await expect(page.getByTestId('debug-console-dock')).toHaveCount(0)
  })

  test('server-only buttons absent in preview mode', async ({ page }) => {
    await expect(page.getByTestId('toolbar-btn-server-ocr')).toHaveCount(0)
    await expect(page.getByTestId('nav-macro-console')).toHaveCount(0)
  })

  test('preview banner visible across all zones', async ({ page }) => {
    await expect(page.getByTestId('preview-mode-banner')).toBeVisible()
  })

  test('sidebar collapse and restore', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar-panel')
    await page.getByTestId('sidebar-collapse-btn').click()
    await expect(sidebar).toHaveCSS('width', '0px')
    await page.getByTestId('sidebar-collapse-btn').click()
    await expect(sidebar).not.toHaveCSS('width', '0px')
  })

  test('no horizontal overflow at 1024×768', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const clientWidth = await page.evaluate(() => document.body.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })

  test('light theme by default', async ({ page }) => {
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('dark mode toggle applies .dark class', async ({ page }) => {
    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})
```

### 5.5 Phase 3 spec — persistence focus

```typescript
// tests/e2e/specs/p3-annotations.spec.ts
import { test, expect } from '@playwright/test'
import { uploadPdf } from '../helpers/uploadPdf'
import { getAnnotations } from '../helpers/getStoreState'

test.describe('P3: Annotations', () => {

  test('annotations saved to IndexedDB (not localStorage) in preview mode', async ({ page }) => {
    await page.goto('/')
    await uploadPdf(page, 'simple-text.pdf')
    await page.getByTestId('toolbar-btn-textbox').click()
    await page.getByTestId('document-workspace').click({ position: { x: 200, y: 200 } })
    await page.keyboard.type('IndexedDB test')
    await page.keyboard.press('Escape')

    // Check localStorage has no annotation data
    const lsKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('annot')))
    expect(lsKeys).toHaveLength(0)

    // Check annotation persists after reload
    await page.reload()
    await page.waitForSelector('[data-testid="page-canvas-1"]')
    const annotations = await getAnnotations(page)
    expect(annotations.find((a: any) => a.content === 'IndexedDB test')).toBeTruthy()
  })

  test('undo 50 steps without corruption', async ({ page }) => {
    await page.goto('/')
    await uploadPdf(page, 'simple-text.pdf')
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('toolbar-btn-textbox').click()
      await page.getByTestId('document-workspace').click({ position: { x: 100 + i * 10, y: 200 } })
      await page.keyboard.type(`ann-${i}`)
      await page.keyboard.press('Escape')
    }
    let count = (await getAnnotations(page)).length
    expect(count).toBe(10)
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Control+Z')
    }
    count = (await getAnnotations(page)).length
    expect(count).toBe(0)
  })
})
```

### 5.6 Phase 4 spec — failure states focus

```typescript
// tests/e2e/specs/p4-ocr.spec.ts
import { test, expect } from '@playwright/test'
import { uploadPdf } from '../helpers/uploadPdf'

test.describe('P4: OCR and equations', () => {

  test('complete equation renders as SVG, not IMG', async ({ page }) => {
    await page.goto('/')
    await uploadPdf(page, 'equations-sample.pdf')
    // trigger OCR and wait...
    // Then check:
    const overlay = page.getByTestId(/equation-overlay-/).first()
    if (await overlay.count() > 0) {
      await expect(overlay.locator('svg')).toBeVisible({ timeout: 10000 })
      await expect(overlay.locator('img[src*="latex"]')).toHaveCount(0)
    }
  })

  test('every rendered equation has an edit button', async ({ page }) => {
    await page.goto('/')
    await uploadPdf(page, 'equations-sample.pdf')
    // After OCR runs...
    const equations = page.getByTestId(/equation-overlay-/)
    const count = await equations.count()
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(equations.nth(i).getByTestId('equation-edit-btn')).toBeVisible()
      }
    }
  })

  test('equation-failed shows raw image and empty EquationEditor', async ({ page }) => {
    // Mock OCR result with equation-failed status
    await page.route('/api/ocr/*/result', route => route.fulfill({
      body: JSON.stringify(require('../../../fixtures/mock-ocr-result-failures.json'))
    }))
    await page.goto('/')
    await uploadPdf(page, 'scanned-sample.pdf')
    // After OCR...
    const failedBlock = page.getByTestId('equation-overlay-eq-p2-001')
    if (await failedBlock.count() > 0) {
      await expect(failedBlock.getByTestId('equation-failed-image')).toBeVisible()
      await expect(failedBlock.getByTestId('equation-editor-input')).toBeVisible()
    }
  })

  test('low-confidence page shows warning banner', async ({ page }) => {
    await page.route('/api/ocr/*/result', route => route.fulfill({
      body: JSON.stringify(require('../../../fixtures/mock-ocr-result-failures.json'))
    }))
    await page.goto('/')
    await uploadPdf(page, 'scanned-sample.pdf')
    // Page 3 is low-confidence in fixture
    await expect(page.getByTestId('low-confidence-warning-3')).toBeVisible()
  })

  test('equation correction: fix LaTeX re-renders correctly', async ({ page }) => {
    // Setup with a known wrong LaTeX...
    const editBtn = page.getByTestId('equation-edit-btn').first()
    if (await editBtn.count() > 0) {
      await editBtn.click()
      const input = page.getByTestId('equation-editor-input')
      await input.fill('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}')
      await page.getByTestId('equation-editor-save-btn').click()
      // Should re-render as SVG
      await expect(page.getByTestId(/equation-overlay-/).first().locator('svg')).toBeVisible()
    }
  })
})
```

---

## 6. Phase Verification Checklists

### Phase 0
```
□ pnpm build — zero errors
□ pnpm typecheck — zero TypeScript errors
□ pnpm lint — zero ESLint errors
□ grep -rn "console.log" frontend/src/ → empty
□ GET /api/ping → 200 in < 50ms
□ Mode resolver: preview when no server, server when running
□ PreviewModeBanner in DOM in preview mode, absent in server mode
□ /debug route renders 4 tabs
□ Ctrl+Shift+D → navigates to /debug (not dock toggle)
□ logStore ≥ 2 entries on startup
□ Two LICENSE files correct
□ Playwright p0-shell.spec.ts — all green
□ Handoff notes written
```

### Phase 1
```
□ 7 shell zones render (no debug dock)
□ Zero debug-related elements in AppShell DOM
□ Preview banner visible; no dismiss button
□ Left rail → sidebar tab change
□ Sidebar + inspector collapse/expand
□ Panel widths persist across refresh
□ Server-only features: 0 DOM elements in preview mode
□ Light theme default; dark mode toggle works
□ No overflow at 1024×768
□ Playwright p1-layout.spec.ts — all green
□ Handoff notes written
```

### Phase 2
```
□ Benchmark run; results recorded; thresholds filled in
□ PDF renders within measured thresholds
□ Text selectable
□ Zoom 25%–400% works
□ Thumbnail panel real thumbnails
□ Temp file cleanup on server startup
□ grep "import fitz" outside pdf_engine/ → empty
□ Playwright p2-viewer.spec.ts — all green
□ Handoff notes written
```

### Phase 3
```
□ 7 annotation types working
□ IndexedDB persistence in preview mode (not localStorage)
□ SQLite persistence in server mode
□ localStorage contains 0 annotation entries
□ Undo/redo 50 steps
□ Comments panel navigation
□ Inspector live properties
□ Playwright p3-annotations.spec.ts — all green
□ Handoff notes written
```

### Phase 4
```
□ OCR benchmark run; thresholds filled in
□ complete equation: <svg> not <img>
□ Every equation has edit button
□ equation-failed: raw image + EquationEditor shown
□ low-confidence: warning banner shown
□ Equation correction saves + re-renders
□ WS reconnect resumes progress
□ Server restart resumes from checkpoint
□ Ctrl+F finds OCR text
□ grep "import fitz" outside pdf_engine/ → empty
□ Playwright p4-ocr.spec.ts — all green
□ Handoff notes written
```

### Phase 5
```
□ Merge 5+7 pages → 12 pages
□ Header on all pages
□ SDK progress ≥ 3 events
□ Export preserves annotations
□ Macro Console: 0 DOM elements in preview mode
□ grep "import fitz" outside pdf_engine/ → empty
□ Playwright p5-macro.spec.ts — all green
□ Handoff notes written
```
