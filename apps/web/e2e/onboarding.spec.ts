import { expect, test } from '@playwright/test';

const SHOTS = process.env.RNJB_SHOTS;

test('first launch: the welcome slides, then the editor coachmarks, both remembered', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('rnjb.onboarding', 'force');
      localStorage.removeItem('rnjb.onboarding.welcome');
      localStorage.removeItem('rnjb.onboarding.tour');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: 'Te damos la bienvenida a RN Journey Builder' });
  await expect(welcome).toBeVisible();
  for (let at = 0; at < 4; at += 1) {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/welcome-${at}.png` });
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/welcome-4.png` });
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // The coachmarks wait for an editor.
  await page.getByRole('button', { name: 'Abrir Mini 13' }).first().click();
  const card = page.getByRole('dialog', { name: 'Pestañas' });
  await expect(card).toBeVisible();
  let step = 0;
  while (await page.getByRole('button', { name: 'Siguiente' }).isVisible()) {
    if (SHOTS) await page.waitForTimeout(300);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tour-${step++}.png` });
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }
  if (SHOTS) await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tour-${step}.png` });
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Seen once, neither comes back (the open tab is restored on reload).
  await page.reload();
  await expect(page.getByRole('region', { name: 'Lienzo del journey' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Replayed from the Help menu at the top right.
  await page.getByRole('button', { name: 'Ayuda' }).click();
  await page.getByRole('menuitem', { name: 'Ver la bienvenida y el tour de nuevo' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Te damos la bienvenida a RN Journey Builder' }),
  ).toBeVisible();
});
