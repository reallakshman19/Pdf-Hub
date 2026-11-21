import { defineConfig, devices } from '@playwright/test';

// Private owner-PDF runs may generate failure diagnostics containing document
// text even when screenshots and attachments are disabled. Require an
// explicitly chosen private output directory and avoid the HTML reporter.
const privateOwnerRun = Boolean(process.env.WP01_PRIVATE_PDF_PATH);
const privateOutputDir = process.env.WP01_PRIVATE_TEST_OUTPUT_DIR;
if (privateOwnerRun && !privateOutputDir) {
  throw new Error('Set WP01_PRIVATE_TEST_OUTPUT_DIR for private owner-PDF tests');
}

export default defineConfig({
  testDir: './e2e',
  ...(privateOwnerRun ? { outputDir: privateOutputDir } : {}),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: privateOwnerRun ? 'line' : 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173/Pdf-Hub/',
    trace: privateOwnerRun ? 'off' : 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional escape hatch for sandboxes with a pre-installed Chromium
        // build that doesn't match this project's pinned @playwright/test
        // version at its default auto-discovered path. Unset in CI, where
        // `playwright install` provides a matching browser at the default
        // path.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    // `npm run dev` invokes `node node_modules/.bin/vite`, which fails on
    // Linux (node_modules/.bin/vite is a POSIX shell shim, not JS — node
    // cannot execute it directly). Call vite's real JS entrypoint instead.
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/Pdf-Hub/',
    reuseExistingServer: !process.env.CI,
  },
});
