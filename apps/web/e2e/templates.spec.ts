import { expect, test } from '@playwright/test';

test('a journey can be saved as a template and a new journey created from it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Acciones de Mini 14' }).first().click({ force: true });
  await page.getByRole('menuitem', { name: 'Guardar como plantilla' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre visible').fill('Plantilla E2E');
  await dialog.getByRole('button', { name: 'Guardar plantilla' }).click();
  await expect(page.getByText('Plantilla «Plantilla E2E» creada')).toBeVisible();

  await page.getByRole('tab', { name: 'Inicio' }).click();
  await page.getByRole('button', { name: 'Acciones de Plantilla E2E' }).click({ force: true });
  await page.getByRole('menuitem', { name: 'Crear journey desde esta plantilla' }).click();

  await dialog.getByLabel('Nombre visible').fill('Desde plantilla E2E');
  await dialog.getByRole('button', { name: 'Crear journey' }).click();
  await expect(page.getByText('Journey «Desde plantilla E2E» creado')).toBeVisible();
});
