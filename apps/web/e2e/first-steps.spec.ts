import { expect, test } from '@playwright/test';

/** First use (plan §10.6) and «Importar package.json» (§7.6). */

const SERVICE = 'http://127.0.0.1:4318';
const ORIGIN = 'http://127.0.0.1:4174';

test('first steps lead to the team import, which fills rnjb.team.json', async ({
  page,
  request,
}) => {
  const { token } = await (
    await request.post(`${SERVICE}/v1/session`, { headers: { origin: ORIGIN } })
  ).json();
  const settings = await (
    await request.get(`${SERVICE}/v1/settings`, {
      headers: { origin: ORIGIN, authorization: `Bearer ${token}` },
    })
  ).json();
  const library = settings.librarySources['@rnjb-fixture/ui'].path as string;

  await page.goto('/');
  const steps = page.getByRole('region', { name: 'Primeros pasos' });
  await expect(steps.getByText('Elegir el espacio de trabajo (hecho)')).toBeVisible();
  await expect(steps.getByText('Importar el package.json del equipo (pendiente)')).toBeVisible();

  await steps.getByRole('button', { name: 'Importar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importar package.json' });
  await dialog.getByRole('textbox', { name: 'Carpeta de la feature library' }).fill(library);
  await dialog.getByRole('button', { name: 'Leer' }).click();
  await expect(dialog.getByText('Se encontraron 2 librerías:')).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar en rnjb.team.json' }).click();
  await expect(dialog).toBeHidden();

  // With the team libraries in place every required step is done, so the card goes away.
  await expect(steps).toBeHidden();
  const team = await (
    await request.get(`${SERVICE}/v1/workspace/file?path=rnjb.team.json`, {
      headers: { origin: ORIGIN, authorization: `Bearer ${token}` },
    })
  ).json();
  expect(JSON.parse(team.contents).libraries).toEqual([
    { package: 'react', range: '*' },
    { package: 'react-native', range: '*' },
  ]);
});
