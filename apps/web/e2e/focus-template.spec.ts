import { expect, test } from '@playwright/test';

test('a journey is saved as a template from the editor and Focus shows one screen', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 17' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();

  const board = page.getByRole('region', { name: 'Lienzo del journey' });
  await expect(board.getByText('Detalle')).toBeVisible();
  const focus = page.getByRole('button', { name: 'Enfoque' });
  await focus.click();
  await expect(focus).toHaveAttribute('aria-pressed', 'true');
  await expect(board.getByText('Detalle')).toHaveCount(0);
  await focus.click();
  await expect(board.getByText('Detalle')).toBeVisible();

  await page.getByRole('button', { name: 'Guardar como plantilla' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre visible').fill('Plantilla del editor');
  await dialog.getByRole('button', { name: 'Guardar plantilla' }).click();
  await expect(page.getByText('Plantilla «Plantilla del editor» creada')).toBeVisible();
});
