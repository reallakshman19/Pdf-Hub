import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173/Pdf-Hub/',
    trace: 'on-first-retry',
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
  webServer: {
    // `npm run dev` invokes `node node_modules/.bin/vite`, which fails on
    // Linux (node_modules/.bin/vite is a POSIX shell shim, not JS — node
    // cannot execute it directly). Call vite's real JS entrypoint instead.
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/Pdf-Hub/',
    reuseExistingServer: !process.env.CI,
  },
});
