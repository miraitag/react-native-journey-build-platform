import { expect, test, type Page } from '@playwright/test';

/**
 * Persistence (plan F5, §18): drafts, session restore, tab unloading with history, trash
 * and error/offline paths. Runs against the service seeded by `scripts/serve-perf-service.ts`;
 * each test uses its own `mini-NN` journey because the workspace is shared.
 */

const SERVICE = 'http://127.0.0.1:4318';

const homeTab = (page: Page) => page.getByRole('tab', { name: 'Inicio', exact: true });
const documentTab = (page: Page, name: RegExp) =>
  page.getByRole('tablist', { name: 'Pestañas abiertas' }).getByRole('tab', { name });
const screensPanel = (page: Page) => page.getByRole('tabpanel', { name: 'Pantallas' });
const saveStatus = (page: Page) =>
  page.getByRole('status').filter({ hasText: /Archivo|Borrador|archivo/ });

async function openJourney(page: Page, name: string): Promise<void> {
  await homeTab(page).click();
  await page
    .getByRole('button', { name: `Abrir ${name}` })
    .first()
    .click();
  await expect(screensPanel(page).getByRole('button', { name: /^Detalle/ })).toBeVisible();
}

/** Journey names whose snapshot in IndexedDB carries undo history (written when unloading). */
const snapshotsWithHistory = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('rnjb');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const all = request.result.transaction('snapshots').objectStore('snapshots').getAll();
          all.onsuccess = () =>
            resolve(
              (all.result as { document: { meta: { name: string } }; history?: unknown }[])
                .filter((row) => row.history)
                .map((row) => row.document.meta.name),
            );
        };
      }),
  );

test('beyond 8 tabs the oldest is unloaded and comes back with its undo history', async ({
  page,
}) => {
  await page.goto('/');
  await openJourney(page, 'Mini 01');

  await screensPanel(page)
    .getByRole('button', { name: /^Inicio/ })
    .dblclick();
  await screensPanel(page).getByRole('textbox', { name: 'Renombrar' }).fill('Bienvenida');
  await page.keyboard.press('Enter');
  await expect(screensPanel(page).getByRole('button', { name: /^Bienvenida/ })).toBeVisible();

  for (let index = 2; index <= 10; index += 1) {
    await openJourney(page, `Mini ${String(index).padStart(2, '0')}`);
  }
  await expect(
    page.getByRole('tablist', { name: 'Pestañas abiertas' }).getByRole('tab'),
  ).toHaveCount(11);
  await expect.poll(() => snapshotsWithHistory(page)).toContain('Mini 01');

  // Plan §5.1: switching to an unloaded tab takes < 500 ms.
  const start = await page.evaluate(() => performance.now());
  await documentTab(page, /^Mini 01/).click();
  await expect(screensPanel(page).getByRole('button', { name: /^Bienvenida/ })).toBeVisible();
  const switchMs = (await page.evaluate(() => performance.now())) - start;
  expect(switchMs, 'switch to an unloaded tab').toBeLessThan(500);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(screensPanel(page).getByRole('button', { name: /^Inicio/ })).toBeVisible();
});

test('a reload restores the session and unsaved changes stay as a draft', async ({ page }) => {
  // File autosave off: changes live only in the draft until saved by hand.
  await page.addInitScript(() => localStorage.setItem('rnjb.autosaveFile', 'false'));
  await page.goto('/');
  await openJourney(page, 'Mini 02');

  await page.getByTitle('Renombrar journey').click();
  await page.getByRole('textbox', { name: 'Renombrar journey' }).fill('Mini 02 editado');
  await page.keyboard.press('Enter');
  await expect(saveStatus(page)).toHaveText('Borrador guardado · Archivo pendiente');

  await page.reload();
  await expect(documentTab(page, /^Mini 02 editado/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Mini 02 editado');
  await expect(saveStatus(page)).toHaveText('Borrador guardado · Archivo pendiente');

  await page.getByTitle('Cerrar Mini 02 editado').click();
  await expect(page.getByText(/tiene cambios sin guardar en el archivo/)).toBeVisible();
  const drafts = page.getByRole('region', { name: 'Borradores sin guardar' });
  await expect(drafts.getByText('Mini 02 editado')).toBeVisible();

  await drafts.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Mini 02 editado');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveText('Archivo guardado');
  await expect(documentTab(page, /^Mini 02 editado/)).not.toContainText('Cambios sin guardar');
});

test('a file saved before a reload can still be saved after it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rnjb.autosaveFile', 'false'));
  await page.goto('/');
  await openJourney(page, 'Mini 20');

  const rename = async (name: string) => {
    await page.getByTitle('Renombrar journey').click();
    await page.getByRole('textbox', { name: 'Renombrar journey' }).fill(name);
    await page.keyboard.press('Enter');
  };
  await rename('Mini 20 a');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveText('Archivo guardado');
  // Pending again, so the reload restores from the draft instead of re-reading the file.
  await rename('Mini 20 b');
  await expect(saveStatus(page)).toHaveText('Borrador guardado · Archivo pendiente');

  await page.reload();
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Mini 20 b');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveText('Archivo guardado');
});

test('a deleted journey can be restored and is purged after 48 h', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const card = page.getByRole('button', { name: 'Abrir Mini 03' });
  await expect(card.first()).toBeVisible();

  const trash = async () => {
    await page.getByRole('button', { name: 'Acciones de Mini 03' }).first().click();
    await page.getByRole('menuitem', { name: 'Mover a la papelera' }).click();
    await expect(card).toHaveCount(0);
  };

  await trash();
  await page.getByRole('button', { name: 'Papelera' }).click();
  const dialog = page.getByRole('dialog', { name: 'Papelera' });
  await expect(dialog.getByText('Mini 03')).toBeVisible();
  await expect(dialog.getByText('se purga en 48 h')).toBeVisible();
  await dialog.getByRole('button', { name: 'Restaurar' }).click();
  await expect(dialog.getByText('La papelera está vacía')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.first()).toBeVisible();

  await trash();
  await page.clock.fastForward('48:00:01');
  await page.getByRole('button', { name: 'Papelera' }).click();
  await expect(dialog.getByText('La papelera está vacía')).toBeVisible();
});

test('a corrupt file is rejected with an explanation and opens no tab', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'RN Journey Builder' })).toBeVisible();
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['{ esto no es json'], 'roto.rnjb', { type: 'application/json' }));
    return transfer;
  });
  await page
    .getByRole('heading', { name: 'RN Journey Builder' })
    .dispatchEvent('drop', { dataTransfer });
  await expect(page.getByText('No se pudo abrir el archivo')).toBeVisible();
  await expect(
    page.getByRole('tablist', { name: 'Pestañas abiertas' }).getByRole('tab'),
  ).toHaveCount(1);
});

test('without the local service a new journey still survives a reload', async ({ page }) => {
  await page.route(`${SERVICE}/**`, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('El servicio local no está activo')).toBeVisible();

  await page.getByRole('button', { name: 'Crear journey' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Crear journey' });
  await dialog.getByRole('textbox', { name: 'Nombre visible' }).fill('Sin conexión');
  await dialog.getByRole('button', { name: 'Crear journey' }).click();
  await expect(documentTab(page, /^Sin conexión/)).toHaveAttribute('aria-selected', 'true');

  await page.getByTitle('Renombrar journey').click();
  await page.getByRole('textbox', { name: 'Renombrar journey' }).fill('Sin conexión 2');
  await page.keyboard.press('Enter');
  await expect(saveStatus(page)).toHaveText('Borrador guardado · Sin archivo');

  await page.reload();
  await expect(page.getByTitle('Renombrar journey')).toHaveText('Sin conexión 2');
});
