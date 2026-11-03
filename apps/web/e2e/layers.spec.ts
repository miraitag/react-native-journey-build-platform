import { expect, test } from '@playwright/test';

test('layers can be reordered with the move buttons and by dragging, and undone', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 06' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: /extraer/i }).click();
  const add = page.getByRole('button', { name: 'Añadir Chip a la pantalla' });
  await add.click();
  // The second Chip is selected after inserting; give it tone b so the two can be told apart.
  await add.click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Asignar tone' }).click();
  await inspector.getByRole('combobox', { name: 'tone' }).selectOption('b');

  const frame = page.frameLocator('iframe[title^="Vista previa de"]');
  const a = frame.getByText('chip-real-a');
  const b = frame.getByText('chip-real-b');
  const top = async (locator: typeof a) => (await locator.boundingBox())?.y ?? Number.NaN;
  await expect(b).toBeVisible({ timeout: 30_000 });
  await expect(a).toBeVisible();
  expect(await top(a)).toBeLessThan(await top(b));

  await page.getByRole('tab', { name: 'Capas' }).click();
  const tree = page.getByRole('list', { name: /^Árbol de nodos/ });

  // Move buttons: the selected (second) Chip goes up, so b is now above a.
  await tree.getByRole('button', { name: 'Subir Chip' }).click();
  await expect.poll(async () => (await top(b)) < (await top(a))).toBe(true);
  await expect(tree.getByRole('button', { name: 'Subir Chip' })).toBeDisabled();

  // Dragging the first Chip row onto the lower edge of the last one puts it back below.
  const chips = tree.locator('li', { hasText: 'Chip' });
  await chips.first().dragTo(chips.last(), { targetPosition: { x: 30, y: 22 } });
  await expect.poll(async () => (await top(a)) < (await top(b))).toBe(true);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect.poll(async () => (await top(b)) < (await top(a))).toBe(true);
});
