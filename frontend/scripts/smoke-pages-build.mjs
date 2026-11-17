import { chromium } from '@playwright/test';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:4173/Pdf-Hub/');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    const target = new URL(response.url());
    if (target.origin === url.origin && target.pathname.startsWith(url.pathname)
        && response.status() >= 400) {
      failures.push(response.status() + ' ' + target.pathname);
    }
  });
  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 60_000 });
  if (!response?.ok()) throw new Error('Production entry point did not return HTTP 200');
  await page.getByTestId('theme-toggle').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => document.title === 'PDF Hub');
  if (failures.length) throw new Error('Production page errors: ' + failures.join('; '));
  console.log('Production PDF Hub shell loaded at ' + url.pathname);
} finally {
  await browser.close();
}
