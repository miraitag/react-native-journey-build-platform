import { expect, test } from '@playwright/test';

test('prototype mode follows a navigation by clicking its trigger', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 13' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  await page.getByRole('button', { name: 'Añadir Chip a la pantalla' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('tab', { name: 'Navegación' }).click();
  await inspector.getByRole('button', { name: 'Añadir navegación' }).click();
  await expect(inspector.getByRole('combobox', { name: 'Pantalla de destino' })).toHaveValue(/.+/);

  await page.getByRole('button', { name: 'Prototipo' }).click();
  const overlay = page.locator('iframe[title^="Vista previa de"] + div');
  await expect(overlay).toBeAttached({ timeout: 30_000 });
  await overlay.locator('button[aria-label="Chip"]').click();

  await page.getByRole('tab', { name: 'Pantallas' }).click();
  await expect(screens.getByRole('button', { name: /^Detalle/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
});
