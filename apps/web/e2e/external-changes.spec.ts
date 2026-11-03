import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { RnjbDocument } from '@rnjb/core';
import { serializeRnjb } from '@rnjb/document-schema';

/** External changes (plan §6.5, §23.9): a file edited outside the app while it is open. */

const SERVICE = 'http://127.0.0.1:4318';
const ORIGIN = 'http://127.0.0.1:4174';

/** Renames the journey on disk through the service, as another program would. */
async function renameOnDisk(request: APIRequestContext, slug: string, name: string) {
  const { token } = await (
    await request.post(`${SERVICE}/v1/session`, { headers: { origin: ORIGIN } })
  ).json();
  const headers = { origin: ORIGIN, authorization: `Bearer ${token}` };
  const path = `journeys/${slug}/${slug}.rnjb`;
  const file = await (
    await request.get(`${SERVICE}/v1/workspace/file?path=${encodeURIComponent(path)}`, { headers })
  ).json();
  const document = JSON.parse(file.contents) as RnjbDocument;
  const contents = await serializeRnjb({ ...document, meta: { ...document.meta, name } });
  const written = await request.put(`${SERVICE}/v1/workspace/file`, {
    headers,
    data: { path, contents },
  });
  expect(written.ok()).toBe(true);
}

async function openJourney(page: Page, name: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: `Abrir ${name}` })
    .first()
    .click();
  await expect(page.getByTitle('Renombrar journey')).toHaveText(name);
}

test('a clean tab reloads when its file changes on disk', async ({ page, request }) => {
  await openJourney(page, 'Mini 21');
  await renameOnDisk(request, 'mini-21', 'Mini 21 desde git');
  await expect(page.getByText('cambió en disco y se recargó')).toBeVisible();
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Mini 21 desde git');
});

test('a tab with changes asks before taking the disk version', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('rnjb.autosaveFile', 'false'));
  await openJourney(page, 'Mini 22');
  await page.getByTitle('Renombrar journey').click();
  await page.getByRole('textbox', { name: 'Renombrar journey' }).fill('Mini 22 mío');
  await page.keyboard.press('Enter');

  await renameOnDisk(request, 'mini-22', 'Mini 22 de otro');
  const dialog = page.getByRole('dialog', { name: /cambió en disco/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Comparar' }).click();
  await dialog.getByRole('button', { name: 'Conservar los míos' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Mini 22 mío');

  // Keeping mine means the next save may overwrite the other version.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('status').filter({ hasText: /Archivo/ })).toHaveText(
    'Archivo guardado',
  );
});

test('closing the question decides nothing: saving asks again', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('rnjb.autosaveFile', 'false'));
  await openJourney(page, 'Mini 25');
  await page.getByTitle('Renombrar journey').click();
  await page.getByRole('textbox', { name: 'Renombrar journey' }).fill('Mini 25 mío');
  await page.keyboard.press('Enter');

  await renameOnDisk(request, 'mini-25', 'Mini 25 de otro');
  const dialog = page.getByRole('dialog', { name: /cambió en disco/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The other version is not overwritten; the save is refused and the question comes back.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Recargar' }).click();
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Mini 25 de otro');
});
