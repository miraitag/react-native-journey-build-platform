import { expect, test } from '@playwright/test';

/** §7.5: «Guardar como bloque» writes a blocks pack; the block is then added as one unit. */
test('a selection saved as a block can be added again as one unit', async ({ page }) => {
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
  await chips.nth(0).click();
  await chips.nth(1).click({ modifiers: ['Shift'] });

  await page.getByRole('tab', { name: 'Bloques' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Bloques' });
  const name = `Par ${Date.now()}`;
  await panel.getByRole('textbox', { name: 'Nombre del bloque' }).fill(name);
  await panel.getByRole('button', { name: 'Guardar como bloque' }).click();
  await expect(page.getByText(`Bloque «${name}» guardado`)).toBeVisible();

  // Adding it inserts a View holding both chips, with fresh ids.
  await panel.getByRole('button', { name: `Añadir ${name} a la pantalla` }).click();
  await page.getByRole('tab', { name: 'Capas' }).click();
  await expect(chips).toHaveCount(4);
  await expect(tree.getByRole('button', { name: 'View', exact: true })).toHaveCount(1);
});
