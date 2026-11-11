import { expect, test } from '@playwright/test';

/** The flow tree in Pantallas (drag = "navigates to") and the flow layer on the canvas. */
test('screens nest by flow with drag or menu, and the flow layer draws the navigations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear journey' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre visible').fill('Flujo E2E');
  await dialog.getByRole('switch', { name: 'Empezar con el Journey básico' }).click();
  await dialog.getByRole('button', { name: 'Crear journey' }).click();

  const flow = page.getByRole('list', { name: 'Flujo de pantallas' });
  const row = (name: string) => flow.locator('li').filter({ hasText: new RegExp(`^${name}`) });
  const indent = async (name: string) =>
    Number.parseFloat(
      await row(name)
        .first()
        .getByRole('button')
        .first()
        .evaluate((element) => getComputedStyle(element).paddingLeft),
    );
  // Basic journey: Inicio > Detalle > Resultado.
  expect(await indent('Detalle')).toBeLessThan(await indent('Resultado'));

  // Dragging Resultado onto Inicio moves it next to Detalle.
  await row('Resultado').first().dragTo(row('Inicio').first());
  await expect
    .poll(async () => (await indent('Resultado')) === (await indent('Detalle')))
    .toBe(true);

  // The keyboard path: the row menu nests it under the previous sibling again.
  await row('Resultado').first().hover();
  await page.getByRole('button', { name: 'Acciones de Resultado' }).click();
  await page.getByRole('menuitem', { name: 'Anidar bajo «Detalle»' }).click();
  await expect.poll(async () => (await indent('Detalle')) < (await indent('Resultado'))).toBe(true);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect
    .poll(async () => (await indent('Resultado')) === (await indent('Detalle')))
    .toBe(true);

  // Flow layer: toggled with the button or ⇧F, with one arrowhead per navigation.
  const toggle = page.getByRole('button', { name: 'Flujo', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // The flow layer draws bigger arrowheads; the plain ones come back when it is off.
  await expect(page.locator('[data-board] svg[width="18"]')).toHaveCount(2);
  await page.getByRole('region', { name: 'Lienzo del journey' }).focus();
  await page.keyboard.press('Shift+KeyF');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-board] svg[width="14"]')).toHaveCount(2);
});
