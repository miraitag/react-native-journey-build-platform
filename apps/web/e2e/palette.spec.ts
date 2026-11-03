import { expect, test } from '@playwright/test';

/** §10.3: the palette is loaded on demand and still opens with Cmd/Ctrl+K. */
test('the command palette opens with the shortcut and closes with Escape', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Abrir Mini/ })
    .first()
    .waitFor();
  await page.keyboard.press(`${mod}+K`);
  const input = page.getByPlaceholder('Escribe un comando o busca un journey');
  await expect(input).toBeFocused();
  await input.fill('Mini 0');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
});
