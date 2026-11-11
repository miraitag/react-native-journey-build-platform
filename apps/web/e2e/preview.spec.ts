import { expect, test } from '@playwright/test';

test('the selected screen renders live in a sandboxed iframe and reports node geometry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Journey 50 (fixture)' }).first().click();
  const board = page.getByRole('region', { name: 'Lienzo del journey' });
  await expect(board.getByRole('button', { name: 'Pantalla 2', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Pantallas' }).click();
  await page
    .getByRole('button', { name: /^Pantalla 3\b/ })
    .first()
    .click();

  // With 50 screens the board is zoomed out (structure only); frame the selected screen.
  await board.focus();
  await page.keyboard.press('Shift+Digit2');

  // The selected screen is live; screens picked just before may stay live too (no flash on switch).
  const iframe = page.locator('iframe[title="Vista previa de Pantalla 3"]');
  await expect(iframe).toHaveCount(1);
  // Opaque origin: scripts run, but the frame cannot reach the editor's storage or DOM.
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');

  const frame = page.frameLocator('iframe[title="Vista previa de Pantalla 3"]');
  await expect(frame.locator('[data-node-id]').first()).toBeVisible();
  // The overlay hit areas come from the geometry the frame reported.
  await expect(board.locator('button[tabindex="-1"]').first()).toBeAttached();
  await expect(board.getByText('Vista aproximada').first()).toBeVisible();
});
