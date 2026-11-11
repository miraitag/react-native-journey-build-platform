import { expect, test } from '@playwright/test';

/** Figma-style keys: Enter / Esc / Tab move the selection; ⇧0, ⇧1 and Space+drag move the camera. */
test('the keyboard walks the selection and drives the camera', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 26' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  const add = page.getByRole('button', { name: 'Añadir Chip a la pantalla' });
  await add.click();
  await add.click();
  await page.getByRole('tab', { name: 'Capas' }).click();
  const tree = page.getByRole('list', { name: /^Árbol de nodos/ });
  const selected = tree.locator('[aria-current="true"]');

  // From the canvas: Esc goes up to the root, Enter selects its children, Tab cycles siblings.
  const board = page.getByRole('region', { name: 'Lienzo del journey' });
  await board.focus();
  await page.keyboard.press('Escape');
  await expect(selected).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(selected).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(selected).toHaveCount(0);
  await page.keyboard.press(`${mod}+A`);
  await expect(selected).toHaveCount(2);

  // Camera: ⇧0 is 100 %, ⌘− zooms out, ⇧1 fits everything (any zoom but 100 %).
  await page.keyboard.press('Shift+Digit0');
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await page.keyboard.press(`${mod}+Minus`);
  await expect(page.getByText('80%', { exact: true })).toBeVisible();

  // Space + drag pans without selecting anything.
  const box = await board.boundingBox();
  if (!box) throw new Error('no board');
  const before = await page.evaluate(
    () => (document.querySelector('[data-board] > div') as HTMLElement).style.transform,
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const after = await page.evaluate(
    () => (document.querySelector('[data-board] > div') as HTMLElement).style.transform,
  );
  expect(after).not.toBe(before);
  await expect(selected).toHaveCount(2);

  // A trackpad pinch (ctrl + wheel) over the live screen zooms the canvas, not the page.
  const frame = page.locator('iframe[title^="Vista previa de"]');
  const area = await frame.boundingBox();
  if (!area) throw new Error('no preview');
  await page.keyboard.press('Shift+Digit0');
  await page.mouse.move(area.x + area.width / 2, area.y + area.height - 40);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(page.getByText('100%', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});
