import { expect, test, type Page } from '@playwright/test';

/** Budgets from plan §5.1 (ms). The run fails if any is exceeded (§5.3). */
const BUDGET = {
  initialLoad: 2000,
  openJourney: 1000,
  screenChange: 200,
  deviceChange: 200,
  propToPreview: 50,
  tabSwitch: 300,
  longTask: 50,
  frame: 16.7,
};

declare global {
  interface Window {
    __longTasks: number[];
  }
}

async function longTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => window.__longTasks.splice(0));
}

/** Time from `action` until `ready` resolves, measured in the page clock. */
async function measure(
  page: Page,
  action: () => Promise<void>,
  ready: () => Promise<void>,
): Promise<number> {
  const start = await page.evaluate(() => performance.now());
  await action();
  await ready();
  return (await page.evaluate(() => performance.now())) - start;
}

test('journey-50 meets the interaction budgets', async ({ page }) => {
  await page.addInitScript(() => {
    window.__longTasks = [];
    window.__reactCommits = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  });

  // Initial load until Home can be used.
  await page.goto('/');
  // The card can also appear under «Recientes».
  const card = page.getByRole('button', { name: 'Abrir Journey 50 (fixture)' }).first();
  await expect(card).toBeVisible();
  const initialLoad = await page.evaluate(() => performance.now());
  expect(initialLoad, 'initial load').toBeLessThan(BUDGET.initialLoad);
  await longTasks(page);

  // Open the journey until frames are on the board.
  const board = page.getByRole('region', { name: 'Lienzo del journey' });
  const openJourney = await measure(
    page,
    () => card.click(),
    () => expect(board.getByRole('button', { name: 'Pantalla 2', exact: true })).toBeVisible(),
  );
  expect(openJourney, 'open journey').toBeLessThan(BUDGET.openJourney);
  // Parsing, validation and hashing run in the worker: opening must not block the main thread.
  const openLongTask = Math.max(0, ...(await longTasks(page)));
  expect(openLongTask, 'longest task while opening').toBeLessThan(BUDGET.longTask);

  // Pan and zoom: frame times sampled with rAF while wheel events stream in.
  const box = await board.boundingBox();
  if (!box) throw new Error('board not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => {
    const samples: number[] = [];
    let last = performance.now();
    const tick = (now: number) => {
      samples.push(now - last);
      last = now;
      if (samples.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as unknown as { __frames: number[] }).__frames = samples;
  });
  for (let step = 0; step < 40; step++) await page.mouse.wheel(12, 18);
  await page.keyboard.down('Control');
  for (let step = 0; step < 20; step++) await page.mouse.wheel(0, step < 10 ? -40 : 40);
  await page.keyboard.up('Control');
  const frames = await page.evaluate(() =>
    (window as unknown as { __frames: number[] }).__frames.slice(5),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  expect(p95, 'p95 frame while panning/zooming').toBeLessThan(BUDGET.frame + 1);
  expect(
    Math.max(0, ...(await longTasks(page))),
    'longest task while panning/zooming',
  ).toBeLessThan(BUDGET.longTask);

  // Change the screen being edited from the Screens panel.
  await page.getByRole('tab', { name: 'Pantallas' }).click();
  const screenChange = await measure(
    page,
    () =>
      page
        .getByRole('button', { name: /^Pantalla 37\b/ })
        .first()
        .click(),
    () =>
      expect(page.getByRole('button', { name: /^Pantalla 37\b/ }).first()).toHaveAttribute(
        'aria-current',
        'true',
      ),
  );
  expect(screenChange, 'screen change').toBeLessThan(BUDGET.screenChange);

  // Change the device: the live preview takes the new size. Frame the selected screen first:
  // zoomed out, the board shows structure only.
  await board.focus();
  await page.keyboard.press('Shift+Digit2');
  const preview = page.locator('iframe[title^="Vista previa de"]').first();
  await expect(
    page.frameLocator('iframe[title^="Vista previa de"]').locator('[data-node-id]').first(),
  ).toBeVisible();
  const width = await preview.getAttribute('width');
  const deviceChange = await measure(
    page,
    async () => {
      await page
        .getByRole('combobox', { name: 'Dispositivo', exact: true })
        .selectOption({ label: 'iPhone 17' });
    },
    () => expect(preview).not.toHaveAttribute('width', width ?? ''),
  );
  expect(deviceChange, 'device change').toBeLessThan(BUDGET.deviceChange);

  // Change a prop until the preview has rendered it (the frame reports its layout after each render).
  await board.locator('button[tabindex="-1"][aria-label]').nth(3).click();
  const field = page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('textbox', { name: 'testID' });
  await field.fill('perf-check');
  // Measured in the page, from the key press to the frame's report, without automation latency.
  await page.evaluate(() => {
    const target = window as unknown as { __propToPreview: Promise<number> };
    target.__propToPreview = new Promise((resolve) => {
      let pressed = 0;
      window.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Enter') pressed = performance.now();
        },
        { capture: true, once: true },
      );
      window.addEventListener('message', function onRects(event: MessageEvent) {
        if (!pressed || (event.data as { type?: string })?.type !== 'rnjb:rects') return;
        window.removeEventListener('message', onRects);
        resolve(performance.now() - pressed);
      });
    });
  });
  await field.press('Enter');
  const propToPreview = await page.evaluate(
    () => (window as unknown as { __propToPreview: Promise<number> }).__propToPreview,
  );
  expect(propToPreview, 'prop change to preview').toBeLessThan(BUDGET.propToPreview);

  // Save the file: serializing 50 screens runs in the worker, never as a long main-thread task.
  await longTasks(page);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('status').filter({ hasText: /Archivo/ })).toHaveText(
    'Archivo guardado',
  );
  const saveLongTask = Math.max(0, ...(await longTasks(page)));
  expect(saveLongTask, 'longest task while saving').toBeLessThan(BUDGET.longTask);

  // Switch tabs: Home and back.
  const homeTab = page.getByRole('tab', { name: 'Inicio' });
  const journeyTab = page.getByRole('tab', { name: /Journey 50/ });
  const toHome = await measure(
    page,
    () => homeTab.click(),
    () => expect(card).toBeVisible(),
  );
  const toJourney = await measure(
    page,
    () => journeyTab.click(),
    () => expect(board.getByRole('button', { name: 'Pantalla 2', exact: true })).toBeVisible(),
  );
  expect(Math.max(toHome, toJourney), 'tab switch').toBeLessThan(BUDGET.tabSwitch);

  // React Profiler (§23.10): the build profiles commits; no single commit may block for a long task.
  const commits = await page.evaluate(() => window.__reactCommits ?? []);
  expect(commits.length, 'React commits recorded').toBeGreaterThan(0);
  const slowestCommit = Math.max(...commits.map((commit) => commit.duration));
  expect(slowestCommit, 'slowest React commit').toBeLessThan(BUDGET.longTask);

  const timings = {
    initialLoad,
    openJourney,
    openLongTask,
    p95,
    screenChange,
    deviceChange,
    propToPreview,
    saveLongTask,
    toHome,
    toJourney,
    slowestCommit,
  };
  test.info().annotations.push({ type: 'timings', description: JSON.stringify(timings) });
  console.log('perf', timings);
});
