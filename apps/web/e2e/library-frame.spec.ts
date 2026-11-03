import { expect, test, type Page } from '@playwright/test';

/**
 * The preview page is driven directly (top-level, so `window.parent` is the window itself):
 * this exercises the frame runtime without the editor or the local service.
 */

const scene = (component: string) => ({
  type: 'rnjb:render',
  scene: {
    screenId: 's1',
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'component',
        label: 'Box',
        props: {},
        style: {},
        children: ['hello'],
      },
      hello: {
        id: 'hello',
        kind: 'component',
        label: 'Hello',
        ref: { package: '@acme/ui', component },
        props: { label: 'mundo' },
        style: {},
        children: [],
      },
    },
  },
  size: { width: 360, height: 640 },
  theme: 'light',
});

const send = (page: Page, message: unknown) =>
  page.evaluate((payload) => window.postMessage(payload, '*'), message);

test('the frame renders a real library component from a compiled bundle', async ({ page }) => {
  await page.goto('/preview.html');
  await send(page, {
    type: 'rnjb:library',
    package: '@acme/ui',
    key: '@acme/ui@1.0.0+abc',
    globalName: 'RnjbLib_acme_ui',
    code:
      'var RnjbLib_acme_ui=(function(){return {Hello:function(p){' +
      "return __rnjb.jsx.jsx(__rnjb.ReactNative.Text,{children:'real:'+p.label});}};})();",
  });
  await send(page, scene('Hello'));
  await expect(page.getByText('real:mundo')).toBeVisible();
  await expect(page.locator('[data-node-id="hello"]')).toHaveCount(1);
});

test('a library that cannot load (missing shim) leaves placeholders', async ({ page }) => {
  await page.goto('/preview.html');
  await send(page, {
    type: 'rnjb:library',
    package: '@acme/ui',
    key: '@acme/ui@1.0.0+bad',
    globalName: 'RnjbLib_acme_ui',
    code: "var RnjbLib_acme_ui=(function(){return {Hello:__rnjb.shims['react-native-unknown'].default};})();",
  });
  await send(page, scene('Hello'));
  await expect(page.getByText('Hello', { exact: true })).toBeVisible();
  await expect(page.getByText('label: mundo')).toBeVisible();
});

test('shimmed native modules render: svg drawn by the DOM, hooks callable', async ({ page }) => {
  await page.goto('/preview.html');
  await send(page, {
    type: 'rnjb:library',
    package: '@acme/ui',
    key: '@acme/ui@1.0.0+shims',
    globalName: 'RnjbLib_acme_ui',
    code:
      'var RnjbLib_acme_ui=(function(){var S=__rnjb.shims["react-native-svg"];' +
      'var A=__rnjb.shims["react-native-safe-area-context"];' +
      'var R=__rnjb.shims["react-native-reanimated"];var j=__rnjb.jsx;' +
      'return {Hello:function(p){var i=A.useSafeAreaInsets();var v=R.useSharedValue(3);' +
      'return j.jsx(S.default,{width:24,height:24,"data-testid":"icon",children:' +
      'j.jsx(S.Path,{d:"M0 0L24 24",stroke:"red"})});}};})();',
  });
  await send(page, scene('Hello'));
  await expect(page.locator('svg[data-testid="icon"] path')).toHaveAttribute('d', 'M0 0L24 24');
});

test('a component that throws falls back to its placeholder', async ({ page }) => {
  await page.goto('/preview.html');
  await send(page, {
    type: 'rnjb:library',
    package: '@acme/ui',
    key: '@acme/ui@1.0.0+throw',
    globalName: 'RnjbLib_acme_ui',
    code: "var RnjbLib_acme_ui=(function(){return {Hello:function(){throw new Error('boom');}};})();",
  });
  await send(page, scene('Hello'));
  await expect(page.getByText('label: mundo')).toBeVisible();
});

test('messages with an unsafe global name are rejected', async ({ page }) => {
  await page.goto('/preview.html');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await send(page, {
    type: 'rnjb:library',
    package: '@acme/ui',
    key: 'k',
    globalName: 'alert(1)',
    code: 'window.__pwned = true',
  });
  await send(page, scene('Hello'));
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned),
  ).toBeUndefined();
});
