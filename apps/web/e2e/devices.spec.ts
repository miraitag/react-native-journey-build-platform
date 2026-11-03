import { expect, test } from '@playwright/test';

/** Devices and system chrome (plan §12): orientation, posture, OS chrome style and comparison. */

test('orientation, posture, chrome style and comparison change the preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 23' }).first().click();
  const preview = page.locator('iframe[title^="Vista previa de"]').first();
  await expect(preview).toBeVisible();
  // An edit made before switching devices must survive every switch (§23.9).
  await page.getByTitle('Renombrar journey').click();
  await page.getByRole('textbox', { name: 'Renombrar journey' }).fill('Mini 23 editado');
  await page.keyboard.press('Enter');

  const device = page.getByRole('combobox', { name: 'Dispositivo', exact: true });
  await device.selectOption({ label: 'iPhone 17' });
  await expect(preview).toHaveAttribute('width', '402');
  // iOS 26 draws the Liquid Glass status bar: blurred, so the content shows through.
  await expect(page.locator('[style*="backdrop-filter"]').first()).toHaveCSS(
    'backdrop-filter',
    /blur/,
  );
  await page.getByRole('combobox', { name: 'Versión del sistema' }).selectOption('18');
  await expect(page.locator('[style*="backdrop-filter"]')).toHaveCount(0);

  await page.getByRole('radio', { name: 'Horizontal' }).click();
  await expect(preview).toHaveAttribute('width', '874');
  await page.getByRole('radio', { name: 'Vertical' }).click();

  await device.selectOption({ label: 'Pixel Fold' });
  await page.getByRole('combobox', { name: 'Postura' }).selectOption({ label: 'Desplegado' });
  await expect(preview).toHaveAttribute('width', '722');

  await page.getByRole('combobox', { name: 'Comparar con otros dispositivos' }).selectOption({
    label: 'iPhone 13',
  });
  const strip = page.getByRole('region', { name: 'Comparación de dispositivos' });
  await expect(strip.getByText('iPhone 13')).toBeVisible();
  await expect(strip.locator('iframe')).toHaveCount(1);

  await page.getByRole('combobox', { name: 'Estado de pantalla' }).selectOption({ index: 0 });
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Mini 23 editado');
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeEnabled();
});
