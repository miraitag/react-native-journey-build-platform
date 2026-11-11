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

  // Presenting covers the editor: the screen shown is named in the top bar.
  await expect(page.locator('[data-prototype-screen]').getByText('Detalle')).toBeVisible();
});

test('a journey whose navigations have no trigger is walked with the bar, Back and Esc', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear journey' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre visible').fill('Prototipo E2E');
  await dialog.getByRole('switch', { name: 'Empezar con el Journey básico' }).click();
  await dialog.getByRole('button', { name: 'Crear journey' }).click();

  await page.getByRole('button', { name: 'Prototipo', exact: true }).click();
  const bar = page.getByRole('toolbar', { name: 'Controles del prototipo' });
  const shown = page.locator('[data-prototype-screen]');
  await expect(shown.getByText('Inicio', { exact: true })).toBeVisible();
  await expect(bar.getByText(/usa los botones para continuar/)).toBeVisible();

  await bar.getByRole('button', { name: 'Detalle' }).click();
  await expect(shown.getByText('Detalle', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(shown.getByText('Inicio', { exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Atrás' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
});
