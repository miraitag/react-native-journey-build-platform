import { expect, test } from '@playwright/test';

test('a prop can be switched to a document text and to an expression, and undone', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 11' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  await page.getByRole('button', { name: 'Añadir Chip a la pantalla' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Asignar label' }).click();
  const frame = page.frameLocator('iframe[title^="Vista previa de"]');
  await expect(frame.getByText('Chip', { exact: true })).toBeVisible({ timeout: 30_000 });

  // Literal -> document text: the text is kept and now lives in the document's strings.
  await inspector.getByRole('button', { name: 'Cambiar tipo de label' }).click();
  await page.getByRole('menuitem', { name: 'Texto' }).click();
  const text = inspector.getByRole('textbox', { name: 'label' });
  await expect(text).toHaveValue('Chip');
  await text.fill('Hola');
  await text.press('Enter');
  await expect(frame.getByText('Hola')).toBeVisible({ timeout: 30_000 });

  // Document text -> expression: shown as typed text, never evaluated.
  await inspector.getByRole('button', { name: 'Cambiar tipo de label' }).click();
  await page.getByRole('menuitem', { name: 'Expresión' }).click();
  await expect(inspector.getByRole('textbox', { name: 'label' })).toHaveValue('"Hola"');

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(inspector.getByRole('textbox', { name: 'label' })).toHaveValue('Hola');
});
