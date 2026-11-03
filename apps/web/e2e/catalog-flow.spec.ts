import { expect, test } from '@playwright/test';

test('extract a library, add its component to a screen and see it rendered for real', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 10' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();

  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: 'Extraer manifiesto' }).click();
  await expect(page.getByText('@rnjb-fixture/ui: 1 componentes').first()).toBeVisible();

  await page.getByRole('button', { name: 'Añadir Chip a la pantalla' }).click();

  const frame = page.frameLocator('iframe[title^="Vista previa de"]');
  await expect(frame.getByText('chip-real-a')).toBeVisible({ timeout: 30_000 });
});

test('dragging a catalog component onto the screen inserts it where it is dropped', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 09' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();

  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  const item = page.getByRole('button', { name: 'Añadir Chip a la pantalla' });
  await expect(item).toBeEnabled();

  // The hit-area overlay (a sibling of the iframe) exists once the frame reports geometry.
  const overlay = page.locator('iframe[title^="Vista previa de"] + div');
  await expect(overlay).toBeAttached({ timeout: 30_000 });
  await item.dragTo(overlay);

  const frame = page.frameLocator('iframe[title^="Vista previa de"]');
  await expect(frame.getByText('chip-real-a')).toBeVisible({ timeout: 30_000 });
});

test('editing a prop in the inspector updates the live preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 08' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  await page.getByRole('button', { name: 'Añadir Chip a la pantalla' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Asignar tone' }).click();
  await inspector.getByRole('combobox', { name: 'tone' }).selectOption('b');

  const frame = page.frameLocator('iframe[title^="Vista previa de"]');
  await expect(frame.getByText('chip-real-b')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(frame.getByText('chip-real-a')).toBeVisible();
});

test('layout and spacing edited in the inspector change the live preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 07' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  await page.getByRole('button', { name: 'Añadir Chip a la pantalla' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('tab', { name: 'Layout' }).click();
  const padding = inspector.getByRole('textbox', { name: 'padding.left' });
  await padding.fill('40');
  await padding.press('Enter');

  const frame = page.frameLocator('iframe[title^="Vista previa de"]');
  const chip = frame.locator('[data-node-id]').filter({ hasText: 'chip-real-a' }).last();
  await expect.poll(async () => (await chip.boundingBox())?.x ?? 0).toBeGreaterThanOrEqual(40);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(padding).toHaveValue('');
});

test('screen states can be created, given sample data and undone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 04' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();

  await page.getByRole('button', { name: 'Gestionar estados' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Nombre del estado' }).fill('sinSaldo');
  await dialog.getByRole('button', { name: 'Añadir estado' }).click();

  const sample = dialog.getByRole('textbox', { name: /Datos de ejemplo/ });
  await sample.fill('[1]');
  await sample.blur();
  await expect(dialog.getByRole('alert')).toContainText('objeto JSON');
  await sample.fill('{"balance": 0}');
  await sample.blur();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const stateSelect = page.getByRole('combobox', { name: 'Estado de pantalla' });
  await expect(stateSelect.locator('option', { hasText: 'sinSaldo' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(stateSelect.locator('option', { hasText: 'sinSaldo' })).toHaveCount(0);
});

test('double click edits a component text on the canvas and undo restores it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 05' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  await page.getByRole('button', { name: 'Añadir Chip a la pantalla' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Asignar label' }).click();
  const frame = page.frameLocator('iframe[title^="Vista previa de"]');
  await expect(frame.getByText('Chip', { exact: true })).toBeVisible({ timeout: 30_000 });

  const overlay = page.locator('iframe[title^="Vista previa de"] + div');
  await overlay.locator('button[aria-label="Chip"]').dblclick();
  const editor = page.getByRole('textbox', { name: 'Editar texto' });
  await editor.fill('Hola mundo');
  await editor.press('Enter');
  await expect(frame.getByText('Hola mundo')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(frame.getByText('Chip', { exact: true })).toBeVisible();
});

test('a component dropped where its nesting rules forbid it is not inserted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 25' }).first().click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  // «Sello» only fits inside a «SoloEnTarjeta», which this screen does not have.
  const item = page.getByRole('button', { name: 'Añadir Sello a la pantalla' });
  await expect(item).toBeEnabled();
  const overlay = page.locator('iframe[title^="Vista previa de"] + div');
  await expect(overlay).toBeAttached({ timeout: 30_000 });
  await item.dragTo(overlay);

  await page.getByRole('tab', { name: 'Capas' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Capas' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Capas' }).getByText('Sello')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeDisabled();
});
