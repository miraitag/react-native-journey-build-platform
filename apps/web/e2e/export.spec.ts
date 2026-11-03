import { expect, test } from '@playwright/test';

test('exporting reviews the files first, writes them, and a second review has nothing to do', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 19' }).first().click();
  await page.getByRole('button', { name: 'Exportar' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Examinar' }).click();
  await dialog.getByRole('button', { name: 'Elegir esta carpeta' }).click();
  await dialog.getByRole('textbox', { name: /Subcarpeta nueva/ }).fill('exported-19');
  await dialog.getByRole('button', { name: 'Revisar cambios' }).click();

  await expect(dialog.getByText('Nuevo').first()).toBeVisible();
  await expect(dialog.getByText('Conflicto')).toHaveCount(0);

  await dialog.getByRole('button', { name: /^Escribir \d+ archivos$/ }).click();
  await expect(dialog.getByRole('button', { name: 'Ejecutar checks' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Revisar cambios' }).click();
  await expect(dialog.getByText('Todo está al día: no hay nada que escribir.')).toBeVisible();
});
