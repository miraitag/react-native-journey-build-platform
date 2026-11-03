import { expect, test } from '@playwright/test';

test('data models and forms are edited in their panels', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir Mini 15' }).first().click();
  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  await screens.getByRole('button', { name: /^Inicio/ }).click();

  await page.getByRole('tab', { name: 'Datos' }).click();
  const data = page.getByRole('tabpanel', { name: 'Datos' });
  await data.getByLabel('Nombre del modelo').fill('UserModel');
  await data.getByRole('button', { name: 'Añadir modelo' }).click();
  const model = data.getByRole('group', { name: 'UserModel' });
  await model.getByRole('button', { name: 'Añadir campo' }).click();
  await expect(model.getByLabel('Campo de UserModel')).toHaveValue('field1');

  await data.getByLabel('Nombre del método').fill('getUser');
  await data.getByRole('button', { name: 'Añadir método' }).click();
  await expect(data.getByRole('group', { name: 'getUser' })).toBeVisible();

  await page.getByRole('tab', { name: 'Formularios' }).click();
  const forms = page.getByRole('tabpanel', { name: 'Formularios' });
  await forms.getByLabel('Nombre del formulario').fill('loginForm');
  await forms.getByRole('button', { name: 'Añadir formulario' }).click();
  const form = forms.getByRole('group', { name: 'loginForm' });
  await form.getByRole('button', { name: 'Añadir campo' }).click();
  const field = form.getByRole('group', { name: 'field1' });
  await field.getByRole('switch', { name: 'field1 es obligatorio' }).click();
  await field.getByLabel('Mensaje required de field1').fill('Obligatorio');
  await field.getByLabel('Mensaje required de field1').press('Enter');
  await expect(field.getByLabel('Mensaje required de field1')).toHaveValue('Obligatorio');
});

test('the Basic journey option creates three chained screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear journey' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre visible').fill('Basico E2E');
  await dialog.getByRole('switch', { name: 'Empezar con el Journey básico' }).click();
  await dialog.getByRole('button', { name: 'Crear journey' }).click();

  const screens = page.getByRole('tabpanel', { name: 'Pantallas' });
  for (const name of ['Inicio', 'Detalle', 'Resultado']) {
    await expect(screens.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
});
