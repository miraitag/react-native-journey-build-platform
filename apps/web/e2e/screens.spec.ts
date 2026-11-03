import { expect, test } from '@playwright/test';

test('a screen can be created, duplicated and the change undone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 12' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await expect(screens.getByRole('button', { name: /^Inicio/ })).toBeVisible();

  await screens.getByRole('button', { name: 'Nueva pantalla' }).click();
  await expect(screens.getByRole('button', { name: /^Pantalla 3/ })).toBeVisible();

  await screens.getByRole('button', { name: 'Acciones de Inicio' }).click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(screens.getByRole('button', { name: /^Inicio copia/ })).toBeVisible();

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(screens.getByRole('button', { name: /^Inicio copia/ })).toHaveCount(0);
  await expect(screens.getByRole('button', { name: /^Pantalla 3/ })).toBeVisible();
});
