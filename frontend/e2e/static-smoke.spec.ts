import { test, expect } from '@playwright/test';

test.describe('DocCraft Static Mode Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the workspace page and display the static preview banner', async ({ page }) => {
    // 1. Verify title
    await expect(page).toHaveTitle(/PDF Hub/i);

    // 2. Verify static mode banner is displayed at the top and contains the correct text
    const banner = page.getByRole('status');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Running in preview mode/i);

    // 3. Verify App Shell and sidebar mounts
    // Let's just check that some main containers or the shell mounts.
    const mainContainer = page.locator('#root');
    await expect(mainContainer).toBeVisible();
  });
});
