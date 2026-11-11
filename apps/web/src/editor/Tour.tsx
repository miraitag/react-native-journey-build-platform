import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@rnjb/ui';
import type { MessageKey } from '@rnjb/i18n';
import { useT } from '../app/preferences.ts';
import { useOnboarding } from '../app/onboarding.ts';

/** Each coachmark points at a `data-tour` anchor; steps whose anchor is hidden are skipped. */
type Section = 'app' | 'top' | 'left' | 'canvas' | 'right';

const STEPS: { section: Section; target: string; title: MessageKey; body: MessageKey }[] = [
  {
    section: 'app',
    target: 'tabs',
    title: 'onboarding.tour.tabsTitle',
    body: 'onboarding.tour.tabsBody',
  },
  {
    section: 'app',
    target: 'app',
    title: 'onboarding.tour.appTitle',
    body: 'onboarding.tour.appBody',
  },
  {
    section: 'top',
    target: 'journey',
    title: 'onboarding.tour.journeyTitle',
    body: 'onboarding.tour.journeyBody',
  },
  {
    section: 'top',
    target: 'history',
    title: 'onboarding.tour.historyTitle',
    body: 'onboarding.tour.historyBody',
  },
  {
    section: 'top',
    target: 'device',
    title: 'onboarding.tour.deviceTitle',
    body: 'onboarding.tour.deviceBody',
  },
  {
    section: 'top',
    target: 'preview',
    title: 'onboarding.tour.previewTitle',
    body: 'onboarding.tour.previewBody',
  },
  {
    section: 'top',
    target: 'health',
    title: 'onboarding.tour.healthTitle',
    body: 'onboarding.tour.healthBody',
  },
  {
    section: 'top',
    target: 'files',
    title: 'onboarding.tour.filesTitle',
    body: 'onboarding.tour.filesBody',
  },
  {
    section: 'left',
    target: 'panel-catalog',
    title: 'onboarding.tour.catalogTitle',
    body: 'onboarding.tour.catalogBody',
  },
  {
    section: 'left',
    target: 'panel-blocks',
    title: 'onboarding.tour.blocksTitle',
    body: 'onboarding.tour.blocksBody',
  },
  {
    section: 'left',
    target: 'panel-layers',
    title: 'onboarding.tour.layersTitle',
    body: 'onboarding.tour.layersBody',
  },
  {
    section: 'left',
    target: 'panel-screens',
    title: 'onboarding.tour.screensTitle',
    body: 'onboarding.tour.screensBody',
  },
  {
    section: 'left',
    target: 'panel-forms',
    title: 'onboarding.tour.formsTitle',
    body: 'onboarding.tour.formsBody',
  },
  {
    section: 'left',
    target: 'panel-logic',
    title: 'onboarding.tour.logicTitle',
    body: 'onboarding.tour.logicBody',
  },
  {
    section: 'left',
    target: 'panel-data',
    title: 'onboarding.tour.dataTitle',
    body: 'onboarding.tour.dataBody',
  },
  {
    section: 'left',
    target: 'panel-trash',
    title: 'onboarding.tour.trashTitle',
    body: 'onboarding.tour.trashBody',
  },
  {
    section: 'canvas',
    target: 'canvas',
    title: 'onboarding.tour.canvasTitle',
    body: 'onboarding.tour.canvasBody',
  },
  {
    section: 'canvas',
    target: 'modes',
    title: 'onboarding.tour.modesTitle',
    body: 'onboarding.tour.modesBody',
  },
  {
    section: 'canvas',
    target: 'zoom',
    title: 'onboarding.tour.zoomTitle',
    body: 'onboarding.tour.zoomBody',
  },
  {
    section: 'right',
    target: 'inspector',
    title: 'onboarding.tour.inspectorTitle',
    body: 'onboarding.tour.inspectorBody',
  },
  {
    section: 'app',
    target: 'statusbar',
    title: 'onboarding.tour.statusbarTitle',
    body: 'onboarding.tour.statusbarBody',
  },
];

const CARD_WIDTH = 300;
const GAP = 12;
const PAD = 6;

const rectOf = (target: string): DOMRect | undefined => {
  const rect = document.querySelector(`[data-tour="${target}"]`)?.getBoundingClientRect();
  return rect && rect.width > 0 && rect.height > 0 ? rect : undefined;
};

/** Beside the target where it fits (right, left, below, above), always inside the window. */
function placeCard(rect: DOMRect, height: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(GAP, x), vw - CARD_WIDTH - GAP);
  const clampY = (y: number) => Math.min(Math.max(GAP, y), vh - height - GAP);
  const top = clampY(rect.top);
  if (rect.right + GAP + CARD_WIDTH + GAP <= vw) return { left: rect.right + GAP + PAD, top };
  if (rect.left - GAP - CARD_WIDTH >= GAP) return { left: rect.left - GAP - PAD - CARD_WIDTH, top };
  const left = clampX(rect.left + rect.width / 2 - CARD_WIDTH / 2);
  if (rect.bottom + GAP + height <= vh) return { left, top: rect.bottom + GAP + PAD };
  if (rect.top - GAP - height >= GAP) return { left, top: rect.top - GAP - PAD - height };
  // Huge targets (the canvas): over their top-left corner.
  return {
    left: clampX(rect.left + 24),
    top: clampY(Math.max(rect.top, rect.bottom - GAP - height)),
  };
}

/** Editor coachmarks: the target stays lit, the rest of the app dims and waits. */
export function Tour() {
  const i18n = useT();
  const finish = useOnboarding((state) => state.finishTour);
  const steps = STEPS.filter((step) => rectOf(step.target));
  const [index, setIndex] = useState(0);
  const [, relayout] = useState(0);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const step = steps[index];
  const rect = step ? rectOf(step.target) : undefined;

  useEffect(() => {
    const onResize = () => relayout((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Measure the card once it renders, so its placement knows its height.
  useLayoutEffect(() => relayout((n) => n + 1), [card, index]);

  const last = index >= steps.length - 1;
  const next = () => (last ? finish() : setIndex(index + 1));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      else if (event.key === 'ArrowRight' || event.key === 'Enter') next();
      else if (event.key === 'ArrowLeft') setIndex((at) => Math.max(0, at - 1));
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  });
  useEffect(() => card?.focus(), [card, index]);

  if (!step || !rect) return null;
  const place = placeCard(rect, card?.offsetHeight ?? 160);
  return createPortal(
    <div className="fixed inset-0 z-50" onClick={(event) => event.stopPropagation()}>
      {/* The spotlight: a hole in the dimmed app, drawn by the shadow of the lit box. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-lg shadow-[0_0_0_2px_var(--accent),0_0_0_9999px_oklch(0.18_0.01_256/0.55)] transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none"
        style={{
          left: rect.left - PAD,
          top: rect.top - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
        }}
      />
      <div
        ref={setCard}
        role="dialog"
        aria-modal
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="absolute flex flex-col gap-2 rounded-lg bg-raised p-4 text-fg shadow-popover outline-none transition-[left,top] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: CARD_WIDTH, ...place }}
      >
        <div className="flex items-center justify-between gap-2 text-2xs font-medium">
          <span className="text-accent-fg">
            {i18n.t(`onboarding.tour.section.${step.section}`)}
          </span>
          <span className="tabular text-fg-subtle">
            {i18n.t('onboarding.step', { n: String(index + 1), total: String(steps.length) })}
          </span>
        </div>
        <div aria-hidden className="h-1 overflow-hidden rounded-full bg-hover">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
        <h2 id="tour-title" className="text-sm font-semibold">
          {i18n.t(step.title)}
        </h2>
        <p id="tour-body" className="text-sm text-fg-muted">
          {i18n.t(step.body)}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" variant="ghost" className="mr-auto" onClick={finish}>
            {i18n.t('onboarding.skip')}
          </Button>
          {index > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setIndex(index - 1)}>
              {i18n.t('onboarding.back')}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={next}>
            {i18n.t(last ? 'onboarding.done' : 'onboarding.next')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
