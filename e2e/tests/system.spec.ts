import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * One end-to-end pass over the whole system against a FRESH stack (no admin):
 * first-run setup → issue a real credential (.ovpn download via the PKI) →
 * admins → change password → logout → re-login with the new password.
 *
 * Along the way it captures the screenshots used in the README. Run via
 * `bash e2e/run.sh` (brings up a clean Docker stack first).
 */

const SHOTS = resolve(__dirname, '../../docs/screenshots');
const ADMIN = 'admin';
const PASSWORD = 'Sup3rSecret!Pass';
const NEW_PASSWORD = 'N3w!StrongPass2026';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: resolve(SHOTS, name) });
}

test('full system flow (and README screenshots)', async ({ page }) => {
  await test.step('first-run setup screen', async () => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Welcome to OCM' }),
    ).toBeVisible();
    await shot(page, '01-setup.png');
  });

  await test.step('create the first admin (auto-login)', async () => {
    await page.getByPlaceholder('admin').fill(ADMIN);
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill(PASSWORD);
    await pw.nth(1).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create administrator' }).click();
    await expect(page).toHaveURL(/\/credentials$/);
  });

  await test.step('issue a VPN credential (real .ovpn download)', async () => {
    await page.getByRole('button', { name: 'New credential' }).click();
    await expect(
      page.getByRole('heading', { name: 'New VPN credential' }),
    ).toBeVisible();
    await page.getByPlaceholder('alice', { exact: true }).fill('alice');
    await shot(page, '03-create-credential.png');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Create & download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('alice.ovpn');

    const row = page.getByRole('row').filter({ hasText: 'alice' });
    await expect(row).toContainText('ACTIVE');
    await shot(page, '02-credentials.png');
  });

  await test.step('admins page', async () => {
    await page.getByRole('link', { name: 'Admins' }).click();
    await expect(
      page.getByRole('heading', { name: 'Administrators' }),
    ).toBeVisible();
    await expect(page.getByRole('table')).toContainText(ADMIN);
    await shot(page, '04-admins.png');
  });

  await test.step('change password', async () => {
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: 'Change password' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Change password')).toBeVisible();
    await shot(page, '05-change-password.png');

    const pw = dialog.locator('input[type="password"]');
    await pw.nth(0).fill(PASSWORD);
    await pw.nth(1).fill(NEW_PASSWORD);
    await pw.nth(2).fill(NEW_PASSWORD);
    await dialog.getByRole('button', { name: 'Update password' }).click();
    await expect(dialog.getByText('Password updated')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('logout → login screen', async () => {
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await shot(page, '06-login.png');
  });

  await test.step('re-login with the new password', async () => {
    await page.getByPlaceholder('admin').fill(ADMIN);
    await page.locator('input[type="password"]').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/credentials$/);
  });
});
