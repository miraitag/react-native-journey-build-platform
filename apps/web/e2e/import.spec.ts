import { expect, test } from '@playwright/test';

/** §17.5: the report is reviewed before the journey is written; then it opens in a tab. */
test('importing analyses first, writes only after confirming, and opens the journey', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 19' }).first().click();

  // A library to import: Mini 19 exported into a new folder.
  await page.getByRole('button', { name: 'Exportar' }).click();
  const exporting = page.getByRole('dialog');
  await exporting.getByRole('button', { name: 'Examinar' }).click();
  await exporting.getByRole('button', { name: 'Elegir esta carpeta' }).click();
  await exporting.getByRole('textbox', { name: /Subcarpeta nueva/ }).fill('import-source');
  await exporting.getByRole('button', { name: 'Revisar cambios' }).click();
  await exporting.getByRole('button', { name: /^Escribir \d+ archivos$/ }).click();
  await expect(exporting.getByRole('button', { name: 'Ejecutar checks' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(exporting).toBeHidden();

  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importar una feature library' });
  await dialog.getByRole('button', { name: 'Examinar' }).click();
  await dialog.getByRole('button', { name: 'import-source' }).click();
  await dialog.getByRole('button', { name: 'Elegir esta carpeta' }).click();
  const name = `Importado ${Date.now()}`;
  await dialog.getByRole('textbox', { name: 'Nombre visible' }).fill(name);

  await dialog.getByRole('button', { name: 'Analizar' }).click();
  await expect(dialog.getByText(/^Perfil detectado: feature-library/)).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Perfil para importar' })).toHaveValue(
    'feature-library',
  );
  // Nothing is written yet: the journey is not in a tab.
  await expect(page.getByRole('tab', { name: new RegExp(name) })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Crear journey' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`«${name}» importado`)).toBeVisible();
});
