import { expect, test } from '@playwright/test';

test('hooks are added to a screen and an effect body is edited in Monaco', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 16' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();

  await page.getByRole('tab', { name: 'Lógica' }).click();
  const logic = page.getByRole('tabpanel', { name: 'Lógica' });
  const pick = logic.getByLabel('Hook a añadir');
  await pick.selectOption('@tanstack/react-query|useQuery');
  await logic.getByRole('button', { name: 'Añadir hook' }).click();
  await expect(logic.getByRole('group', { name: 'useQuery' })).toBeVisible();

  await pick.selectOption('react|useEffect');
  await logic.getByRole('button', { name: 'Añadir hook' }).click();
  const effect = logic.getByRole('group', { name: 'useEffect' });
  await expect(effect).toBeVisible();
  await expect(logic.getByRole('img', { name: /Grafo de dependencias/ })).toBeVisible();

  await effect.getByRole('button', { name: 'Añadir cuerpo' }).click();
  const editor = effect.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.type('console.log(1)');
  await expect(editor).toContainText('console');
});
