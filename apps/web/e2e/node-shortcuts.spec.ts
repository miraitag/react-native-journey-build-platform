import { expect, test } from '@playwright/test';

/** §10.3: multi-select, copy and paste, duplicate, wrap and keyboard move. */
test('nodes can be multi-selected, duplicated, copied, wrapped and moved with the keyboard', async ({
  page,
}) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 06' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  const add = page.getByRole('button', { name: 'Añadir Chip a la pantalla' });
  await add.click();
  await add.click();

  await page.getByRole('tab', { name: 'Capas' }).click();
  const tree = page.getByRole('list', { name: /^Árbol de nodos/ });
  const chips = tree.getByRole('button', { name: 'Chip', exact: true });
  await expect(chips).toHaveCount(2);

  // Shift+clic selects both; duplicating copies each one.
  await chips.nth(0).click();
  await chips.nth(1).click({ modifiers: ['Shift'] });
  await expect(tree.locator('[aria-current="true"]')).toHaveCount(2);
  await page.keyboard.press(`${mod}+D`);
  await expect(chips).toHaveCount(4);

  // Copy one and paste it into the screen root.
  await chips.nth(0).click();
  await page.keyboard.press(`${mod}+C`);
  await tree.getByRole('button').first().click();
  await page.keyboard.press(`${mod}+V`);
  await expect(chips).toHaveCount(5);

  // Wrap two siblings in a View.
  await chips.nth(0).click();
  await chips.nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press(`${mod}+Alt+KeyG`);
  await expect(tree.getByRole('button', { name: 'View', exact: true })).toHaveCount(1);

  // Alt+↓ moves the wrapper below its next sibling; undo puts it back.
  const rows = tree.getByRole('button');
  const wrapperRow = async () =>
    (await rows.allTextContents()).findIndex((text) => text.trim() === 'View');
  const before = await wrapperRow();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(wrapperRow).toBeGreaterThan(before);
  await page.keyboard.press(`${mod}+Z`);
  await expect.poll(wrapperRow).toBe(before);
});
