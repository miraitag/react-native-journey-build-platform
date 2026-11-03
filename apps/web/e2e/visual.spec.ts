import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Visual checks (plan §23.8): system chrome per OS version (Liquid Glass included), foldable
 * postures, and the platform's light and dark themes. One baseline for every OS, no container:
 * glyphs are hidden (`visual.css`) and Chromium rasterizes without hinting, LCD text or the
 * display's colour profile, so what remains is the same on macOS, Windows and Linux. Refresh with
 * `pnpm --filter @rnjb/web exec playwright test e2e/visual.spec.ts --update-snapshots`.
 */
const SHOT = { maxDiffPixelRatio: 0.01, stylePath: path.join(import.meta.dirname, 'visual.css') };

test.use({
  launchOptions: {
    args: [
      '--font-render-hinting=none',
      '--disable-lcd-text',
      '--force-color-profile=srgb',
      '--disable-gpu',
    ],
  },
});

const frameOf = (page: Page) =>
  page
    .locator('iframe[title^="Vista previa de"]')
    .first()
    .locator('xpath=ancestor::div[contains(@class, "overflow-hidden")][1]');

async function openWith(page: Page, device: string, os?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 24' }).first().click();
  await page.getByRole('combobox', { name: 'Dispositivo', exact: true }).selectOption({
    label: device,
  });
  if (os) await page.getByRole('combobox', { name: 'Versión del sistema' }).selectOption(os);
  await expect(frameOf(page).locator('iframe')).toBeVisible();
}

for (const [device, os, name] of [
  ['iPhone 17', '26', 'ios-26-liquid-glass'],
  ['iPhone 17', '18', 'ios-18-classic'],
  ['Pixel 10', undefined, 'android-16-expressive'],
] as const) {
  test(`system chrome: ${name}`, async ({ page }) => {
    await openWith(page, device, os);
    await expect(frameOf(page)).toHaveScreenshot(`${name}.png`, SHOT);
  });
}

test('landscape: the island turns to the left edge', async ({ page }) => {
  await openWith(page, 'iPhone 17', '26');
  await page.getByRole('radio', { name: 'Horizontal' }).click();
  await expect(frameOf(page).locator('iframe')).toHaveAttribute('width', '874');
  await expect(frameOf(page)).toHaveScreenshot('ios-26-landscape.png', SHOT);
});

test('foldable posture: Pixel Fold unfolded', async ({ page }) => {
  await openWith(page, 'Pixel Fold');
  await page.getByRole('combobox', { name: 'Postura' }).selectOption({ label: 'Desplegado' });
  await expect(frameOf(page).locator('iframe')).toHaveAttribute('width', '722');
  await expect(frameOf(page)).toHaveScreenshot('pixel-fold-unfolded.png', SHOT);
});

for (const theme of ['light', 'dark'] as const) {
  // The editor top bar: controls, menus and accents in the theme, with no run-dependent data.
  test(`platform theme: ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('rnjb.theme', value), theme);
    await openWith(page, 'iPhone 17');
    const topBar = page
      .getByRole('combobox', { name: 'Dispositivo', exact: true })
      .locator('xpath=ancestor::div[contains(@class, "h-10")][1]');
    await expect(topBar).toHaveScreenshot(`topbar-${theme}.png`, SHOT);
  });
}

// Geometry holds on any OS without a baseline: the fold sits mid-screen and splits what crosses it.
test('foldable posture: half opened shows the fold and what it splits', async ({ page }) => {
  await openWith(page, 'Pixel Fold');
  await page.getByRole('combobox', { name: 'Postura' }).selectOption({ label: 'Medio abierto' });
  const frame = frameOf(page);
  const box = await frame.boundingBox();
  const hinge = await frame.getByTestId('device-hinge').boundingBox();
  if (!box || !hinge) throw new Error('no frame or hinge');
  expect(Math.abs(hinge.y + hinge.height / 2 - (box.y + box.height / 2))).toBeLessThan(2);
  expect(hinge.width).toBeCloseTo(box.width, 0);
  // The screen itself fills both segments; only content cut in two is flagged.
  await expect(page.getByText(/Cruzan el pliegue/)).toHaveCount(0);
});
