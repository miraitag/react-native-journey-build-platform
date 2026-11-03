import { expect, test } from '@playwright/test';

test('dragging a padding handle on the canvas sets the spacing and undo restores it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 18' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  await page.getByRole('button', { name: 'Añadir Chip a la pantalla' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('tab', { name: 'Layout' }).click();
  const padding = inspector.getByRole('textbox', { name: 'padding.left' });
  await expect(padding).toHaveValue('');

  const handle = page.getByRole('button', { name: 'Ajustar padding.left' });
  await expect(handle).toBeVisible({ timeout: 30_000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error('handle not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await padding.inputValue())).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(padding).toHaveValue('');

  // Keyboard: ArrowRight on a padding-left handle grows it by one step.
  await page.getByRole('button', { name: 'Ajustar padding.left' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(padding).toHaveValue('1');
});
