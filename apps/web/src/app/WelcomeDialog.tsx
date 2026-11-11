import { useState, type ReactNode } from 'react';
import { Button, Dialog, DialogContent, cx } from '@rnjb/ui';
import type { MessageKey } from '@rnjb/i18n';
import { useT } from './preferences.ts';
import { useOnboarding } from './onboarding.ts';

/** Illustrations are drawn with the app's own tokens, so they follow the light and dark themes. */
const C = {
  canvas: 'var(--canvas)',
  panel: 'var(--panel)',
  line: 'var(--line)',
  subtle: 'var(--line-subtle)',
  muted: 'var(--fg-subtle)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-subtle)',
  success: 'var(--success)',
};

/** A phone frame at (x, y), 64×120, with a few content bars. */
function Phone({
  x,
  y,
  active,
  children,
}: {
  x: number;
  y: number;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width="64"
        height="120"
        rx="10"
        fill={C.panel}
        stroke={active ? C.accent : C.line}
        strokeWidth={active ? 2 : 1}
      />
      <rect x="24" y="5" width="16" height="3" rx="1.5" fill={C.line} />
      {children ?? (
        <>
          <rect x="8" y="18" width="48" height="8" rx="2" fill={active ? C.accentSoft : C.subtle} />
          <rect x="8" y="32" width="36" height="5" rx="2" fill={C.subtle} />
          <rect x="8" y="42" width="44" height="5" rx="2" fill={C.subtle} />
          <rect x="8" y="98" width="48" height="12" rx="4" fill={active ? C.accent : C.line} />
        </>
      )}
    </g>
  );
}

const Arrow = ({ d }: { d: string }) => (
  <path
    d={d}
    fill="none"
    stroke={C.accent}
    strokeWidth="2.5"
    strokeLinecap="round"
    markerEnd="url(#welcome-arrow)"
  />
);

function Stage({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 480 200"
      className="block h-auto w-full rounded-md"
      role="presentation"
      aria-hidden
    >
      <defs>
        <marker
          id="welcome-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 L2.5,5 z" fill={C.accent} />
        </marker>
        <pattern id="welcome-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill={C.line} />
        </pattern>
      </defs>
      <rect width="480" height="200" fill={C.canvas} />
      <rect width="480" height="200" fill="url(#welcome-dots)" />
      {children}
    </svg>
  );
}

const ILLUSTRATIONS: ReactNode[] = [
  // Intro: a journey of three screens.
  <Stage key="intro">
    <Phone x={88} y={40} active />
    <Phone x={208} y={40} />
    <Phone x={328} y={40} />
    <Arrow d="M156,100 C176,100 184,100 204,100" />
    <Arrow d="M276,100 C296,100 304,100 324,100" />
  </Stage>,
  // Flow: the screens tree beside the canvas.
  <Stage key="flow">
    <rect x="40" y="30" width="150" height="140" rx="8" fill={C.panel} stroke={C.subtle} />
    {[
      [0, 'Inicio', true],
      [1, 'Detalle', false],
      [2, 'Resultado', false],
      [1, 'Ayuda', false],
    ].map(([depth, , selected], index) => (
      <g key={index} transform={`translate(${52 + Number(depth) * 14} ${44 + index * 28})`}>
        <rect
          width={126 - Number(depth) * 14}
          height="20"
          rx="4"
          fill={selected ? C.accentSoft : 'transparent'}
        />
        <rect
          x="8"
          y="7"
          width={60 - Number(depth) * 8}
          height="6"
          rx="3"
          fill={selected ? C.accent : C.muted}
          opacity={selected ? 1 : 0.6}
        />
      </g>
    ))}
    <rect x="66" y="98" width="110" height="2" rx="1" fill={C.accent} />
    <circle cx="66" cy="99" r="3.5" fill={C.panel} stroke={C.accent} strokeWidth="2" />
    <Phone x={240} y={40} active />
    <Phone x={350} y={40} />
    <Arrow d="M308,100 C326,100 330,100 346,100" />
  </Stage>,
  // Build: a component dragged from the catalog into a screen.
  <Stage key="build">
    <rect x="40" y="30" width="130" height="140" rx="8" fill={C.panel} stroke={C.subtle} />
    {[0, 1, 2, 3].map((index) => (
      <g key={index} transform={`translate(52 ${44 + index * 30})`}>
        <rect
          width="106"
          height="22"
          rx="5"
          fill={index === 1 ? C.accentSoft : C.canvas}
          stroke={index === 1 ? C.accent : C.subtle}
        />
        <rect x="8" y="8" width="10" height="6" rx="2" fill={index === 1 ? C.accent : C.muted} />
        <rect x="24" y="8" width={48 - index * 6} height="6" rx="3" fill={C.muted} opacity="0.6" />
      </g>
    ))}
    <Phone x={300} y={36} active>
      <rect x="8" y="18" width="48" height="8" rx="2" fill={C.subtle} />
      <rect
        x="8"
        y="34"
        width="48"
        height="26"
        rx="5"
        fill={C.accentSoft}
        stroke={C.accent}
        strokeDasharray="4 3"
      />
      <rect x="8" y="98" width="48" height="12" rx="4" fill={C.line} />
    </Phone>
    <g transform="translate(206 78) rotate(-4)">
      <rect width="74" height="22" rx="5" fill={C.panel} stroke={C.accent} strokeWidth="1.5" />
      <rect x="8" y="8" width="10" height="6" rx="2" fill={C.accent} />
      <rect x="24" y="8" width="38" height="6" rx="3" fill={C.muted} opacity="0.6" />
    </g>
    <path
      d="M276,104 l0,16 l4,-4 l4,8 l3,-1.5 l-4,-8 l6,0 z"
      fill={C.panel}
      stroke={'var(--fg)'}
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </Stage>,
  // Prototype: one screen on a dark stage, a hotspot under the pointer.
  <Stage key="prototype">
    <rect width="480" height="200" fill="oklch(0.16 0 0)" />
    <rect x="16" y="12" width="92" height="18" rx="5" fill={C.panel} />
    <rect x="26" y="19" width="48" height="4" rx="2" fill={C.accent} />
    <rect x="404" y="12" width="60" height="18" rx="5" fill={C.panel} />
    <Phone x={208} y={36}>
      <rect x="8" y="18" width="48" height="8" rx="2" fill={C.subtle} />
      <rect x="8" y="32" width="36" height="5" rx="2" fill={C.subtle} />
      <rect
        x="6"
        y="96"
        width="52"
        height="16"
        rx="5"
        fill={C.accentSoft}
        stroke={C.accent}
        strokeWidth="1.5"
      />
      <rect x="8" y="98" width="48" height="12" rx="4" fill={C.accent} />
    </Phone>
    <path
      d="M254,146 l0,16 l4,-4 l4,8 l3,-1.5 l-4,-8 l6,0 z"
      fill={C.panel}
      stroke="oklch(0.16 0 0)"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <rect x="170" y="172" width="140" height="18" rx="5" fill={C.panel} />
  </Stage>,
  // Export: the journey becomes code.
  <Stage key="export">
    <Phone x={96} y={40} active />
    <Arrow d="M180,100 C210,100 230,100 262,100" />
    <rect x="272" y="40" width="120" height="120" rx="8" fill={C.panel} stroke={C.line} />
    {[0, 1, 2, 3, 4, 5].map((index) => (
      <rect
        key={index}
        x={286 + (index % 3 === 1 ? 12 : 0)}
        y={58 + index * 14}
        width={[56, 70, 44, 64, 50, 30][index]}
        height="6"
        rx="3"
        fill={index % 2 ? C.accent : C.muted}
        opacity={index % 2 ? 0.8 : 0.5}
      />
    ))}
    <circle cx="392" cy="40" r="13" fill={C.success} />
    <path
      d="M386,40 l4,4 l8,-8"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Stage>,
];

const SLIDES: { title: MessageKey; body: MessageKey }[] = [
  { title: 'onboarding.welcome.introTitle', body: 'onboarding.welcome.introBody' },
  { title: 'onboarding.welcome.flowTitle', body: 'onboarding.welcome.flowBody' },
  { title: 'onboarding.welcome.buildTitle', body: 'onboarding.welcome.buildBody' },
  { title: 'onboarding.welcome.prototypeTitle', body: 'onboarding.welcome.prototypeBody' },
  { title: 'onboarding.welcome.exportTitle', body: 'onboarding.welcome.exportBody' },
];

/** First-launch welcome, a few slides as in design tools; closing it at any step counts as seen. */
export function WelcomeDialog() {
  const i18n = useT();
  const finish = useOnboarding((state) => state.finishWelcome);
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index] ?? SLIDES[0]!;
  const last = index === SLIDES.length - 1;
  return (
    <Dialog open onOpenChange={(open) => !open && finish()}>
      <DialogContent
        title={i18n.t(slide.title)}
        description={i18n.t(slide.body)}
        closeLabel={i18n.t('onboarding.skip')}
        width={560}
        footer={
          <>
            <div
              className="mr-auto flex items-center gap-1.5"
              aria-label={i18n.t('onboarding.step', {
                n: String(index + 1),
                total: String(SLIDES.length),
              })}
            >
              {SLIDES.map((item, at) => (
                <button
                  key={item.title}
                  type="button"
                  aria-label={i18n.t(item.title)}
                  aria-current={at === index || undefined}
                  onClick={() => setIndex(at)}
                  className={cx(
                    'h-1.5 rounded-full transition-[width,background-color] duration-200',
                    at === index ? 'w-5 bg-accent' : 'w-1.5 bg-line hover:bg-fg-subtle',
                  )}
                />
              ))}
            </div>
            {index === 0 ? (
              <Button size="sm" variant="ghost" onClick={finish}>
                {i18n.t('onboarding.skip')}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setIndex(index - 1)}>
                {i18n.t('onboarding.back')}
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() => (last ? finish() : setIndex(index + 1))}
            >
              {i18n.t(last ? 'onboarding.start' : 'onboarding.next')}
            </Button>
          </>
        }
      >
        <div className="pt-1">{ILLUSTRATIONS[index]}</div>
      </DialogContent>
    </Dialog>
  );
}
