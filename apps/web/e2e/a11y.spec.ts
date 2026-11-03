import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** WCAG 2.1 AA (plan F10) on the main views, in the platform's light and dark themes. */

const audit = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // The preview iframe renders the user's design, not the platform UI.
      .exclude('iframe')
      .analyze()
  ).violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }));

for (const theme of ['light', 'dark'] as const) {
  test(`home and editor meet WCAG AA (${theme})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('rnjb.theme', value), theme);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Abrir Mini 24' }).first()).toBeVisible();
    expect(await audit(page)).toEqual([]);

    await page.getByRole('button', { name: 'Abrir Mini 24' }).first().click();
    await expect(page.locator('iframe[title^="Vista previa de"]').first()).toBeVisible();
    expect(await audit(page)).toEqual([]);

    // The close button is pointer-only; the keyboard closes the focused tab with Delete.
    const tab = page.getByRole('tab', { name: /^Mini 24/ });
    await tab.press('Delete');
    await expect(tab).toHaveCount(0);
  });
}
