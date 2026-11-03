import { formatOklch, oklch, type Oklch } from './color.ts';

/**
 * Platform design tokens (plan §10.1) in three levels: primitives → semantic → component.
 * Independent from any library the user loads. `pnpm --filter @rnjb/ui tokens` writes the CSS.
 */

export type ThemeName = 'light' | 'dark';

type Scale = Record<string, Oklch>;

const GRAY_HUE = 256;
const scale = (hue: number, steps: Record<string, [number, number]>): Scale =>
  Object.fromEntries(Object.entries(steps).map(([step, [l, c]]) => [step, oklch(l, c, hue)]));

// --- Primitives -------------------------------------------------------------

export const primitives: Record<ThemeName, Record<string, Scale>> = {
  light: {
    gray: scale(GRAY_HUE, {
      1: [0.993, 0.002],
      2: [0.982, 0.003],
      3: [0.963, 0.004],
      4: [0.944, 0.005],
      5: [0.925, 0.006],
      6: [0.899, 0.007],
      7: [0.862, 0.009],
      8: [0.79, 0.011],
      9: [0.635, 0.014],
      10: [0.53, 0.014],
      11: [0.47, 0.014],
      12: [0.225, 0.012],
    }),
    blue: scale(258, {
      3: [0.948, 0.03],
      4: [0.918, 0.05],
      6: [0.832, 0.09],
      9: [0.55, 0.2],
      10: [0.5, 0.2],
      11: [0.48, 0.18],
    }),
    green: scale(150, { 3: [0.952, 0.04], 6: [0.82, 0.09], 9: [0.56, 0.14], 11: [0.45, 0.11] }),
    amber: scale(75, { 3: [0.962, 0.05], 6: [0.86, 0.1], 9: [0.8, 0.16], 11: [0.48, 0.1] }),
    red: scale(25, { 3: [0.957, 0.03], 6: [0.84, 0.08], 9: [0.56, 0.2], 11: [0.5, 0.18] }),
    cyan: scale(215, { 3: [0.952, 0.03], 6: [0.83, 0.07], 9: [0.56, 0.1], 11: [0.46, 0.09] }),
  },
  dark: {
    gray: scale(GRAY_HUE, {
      1: [0.165, 0.006],
      2: [0.193, 0.007],
      3: [0.222, 0.008],
      4: [0.248, 0.009],
      5: [0.272, 0.01],
      6: [0.3, 0.011],
      7: [0.345, 0.012],
      8: [0.42, 0.013],
      9: [0.52, 0.014],
      10: [0.64, 0.013],
      11: [0.77, 0.01],
      12: [0.945, 0.005],
    }),
    blue: scale(258, {
      3: [0.27, 0.06],
      4: [0.31, 0.08],
      6: [0.4, 0.11],
      9: [0.55, 0.2],
      10: [0.5, 0.19],
      11: [0.79, 0.12],
    }),
    green: scale(150, { 3: [0.25, 0.05], 6: [0.38, 0.08], 9: [0.55, 0.14], 11: [0.8, 0.13] }),
    amber: scale(75, { 3: [0.27, 0.05], 6: [0.4, 0.08], 9: [0.8, 0.16], 11: [0.85, 0.13] }),
    red: scale(25, { 3: [0.26, 0.06], 6: [0.38, 0.1], 9: [0.56, 0.2], 11: [0.78, 0.12] }),
    cyan: scale(215, { 3: [0.26, 0.04], 6: [0.38, 0.07], 9: [0.56, 0.1], 11: [0.8, 0.1] }),
  },
};

export const WHITE = oklch(1, 0, 0);

// --- Semantic ---------------------------------------------------------------

type Ref = `${string}-${string}` | 'white';

const sharedSemantic = {
  fg: 'gray-12',
  'fg-muted': 'gray-11',
  'fg-subtle': 'gray-10',
  'line-control': 'gray-9',
  accent: 'blue-9',
  'accent-hover': 'blue-10',
  'accent-fg': 'blue-11',
  'accent-subtle': 'blue-3',
  'accent-muted': 'blue-4',
  'accent-line': 'blue-6',
  'on-accent': 'white',
  focus: 'blue-9',
  success: 'green-9',
  'success-fg': 'green-11',
  'success-subtle': 'green-3',
  'success-line': 'green-6',
  warning: 'amber-9',
  'warning-fg': 'amber-11',
  'warning-subtle': 'amber-3',
  'warning-line': 'amber-6',
  danger: 'red-9',
  'danger-fg': 'red-11',
  'danger-subtle': 'red-3',
  'danger-line': 'red-6',
  info: 'cyan-9',
  'info-fg': 'cyan-11',
  'info-subtle': 'cyan-3',
  'info-line': 'cyan-6',
} as const satisfies Record<string, Ref>;

export const semantic: Record<ThemeName, Record<string, Ref>> = {
  light: {
    ...sharedSemantic,
    canvas: 'gray-4',
    chrome: 'gray-3',
    panel: 'gray-1',
    raised: 'gray-1',
    input: 'gray-1',
    hover: 'gray-3',
    active: 'gray-5',
    'line-subtle': 'gray-5',
    line: 'gray-7',
    'on-warning': 'gray-12',
  },
  dark: {
    ...sharedSemantic,
    canvas: 'gray-1',
    chrome: 'gray-1',
    panel: 'gray-2',
    raised: 'gray-3',
    input: 'gray-1',
    hover: 'gray-4',
    active: 'gray-5',
    'line-subtle': 'gray-4',
    line: 'gray-6',
    'on-warning': 'gray-1',
  },
};

export function resolve(theme: ThemeName, token: string): Oklch {
  const ref = semantic[theme][token];
  if (!ref) throw new Error(`Unknown semantic token ${token}`);
  if (ref === 'white') return WHITE;
  const [hue, step] = ref.split('-') as [string, string];
  const color = primitives[theme][hue]?.[step];
  if (!color) throw new Error(`Unknown primitive ${ref}`);
  return color;
}

// --- Component --------------------------------------------------------------

/** Values that do not depend on the theme; colours reference semantic tokens. */
export const component: Record<string, string> = {
  'control-h-sm': '28px',
  'control-h-md': '32px',
  'radius-sm': '4px',
  'radius-md': '6px',
  'radius-lg': '8px',
  'icon-size': '16px',
  // Canvas overlays (§10.1): readable over light and dark preview content.
  'selection-width': '1.5px',
  'selection-color': 'var(--accent)',
  'selection-halo': 'color-mix(in oklch, var(--accent) 28%, transparent)',
  'hover-outline': 'color-mix(in oklch, var(--accent) 40%, transparent)',
  'drop-valid': 'color-mix(in oklch, var(--accent) 8%, transparent)',
  'drop-invalid': 'var(--danger)',
  'duration-fast': '120ms',
  'duration-base': '180ms',
  'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
};

export const themeComponent: Record<ThemeName, Record<string, string>> = {
  light: {
    'shadow-popover':
      '0 8px 24px -6px oklch(0.2 0.02 256 / 0.18), 0 2px 6px -1px oklch(0.2 0.02 256 / 0.1)',
    'shadow-frame':
      '0 12px 32px -12px oklch(0.2 0.02 256 / 0.22), 0 2px 6px -2px oklch(0.2 0.02 256 / 0.12)',
  },
  // Dark elevation is drawn with borders, not shadows (§10.1).
  dark: {
    'shadow-popover': '0 0 0 1px var(--line)',
    'shadow-frame': '0 0 0 1px var(--line)',
  },
};

// --- CSS output ------------------------------------------------------------

export function generateCss(): string {
  const lines: string[] = [
    '/* Generated by `pnpm --filter @rnjb/ui tokens` from src/tokens/tokens.ts. Do not edit. */',
    '',
    ':root {',
    ...Object.entries(component).map(([name, value]) => `  --${name}: ${value};`),
    '}',
  ];
  for (const theme of ['light', 'dark'] as const) {
    lines.push('', `:root[data-theme='${theme}'] {`, `  color-scheme: ${theme};`);
    for (const [hue, steps] of Object.entries(primitives[theme])) {
      for (const [step, color] of Object.entries(steps))
        lines.push(`  --${hue}-${step}: ${formatOklch(color)};`);
    }
    for (const [name, ref] of Object.entries(semantic[theme])) {
      lines.push(`  --${name}: ${ref === 'white' ? formatOklch(WHITE) : `var(--${ref})`};`);
    }
    for (const [name, value] of Object.entries(themeComponent[theme]))
      lines.push(`  --${name}: ${value};`);
    lines.push('}');
  }
  return `${lines.join('\n')}\n`;
}

/** Pairs that must meet WCAG AA (§10.1): 4.5:1 text, 3:1 components. */
export const CONTRAST_PAIRS: { fg: string; bg: string; min: number }[] = [
  ...['canvas', 'chrome', 'panel', 'raised', 'hover', 'active', 'input'].flatMap((bg) => [
    { fg: 'fg', bg, min: 4.5 },
    { fg: 'fg-muted', bg, min: 4.5 },
  ]),
  ...['panel', 'raised', 'input', 'chrome'].map((bg) => ({ fg: 'fg-subtle', bg, min: 4.5 })),
  { fg: 'on-accent', bg: 'accent', min: 4.5 },
  { fg: 'on-accent', bg: 'accent-hover', min: 4.5 },
  { fg: 'on-warning', bg: 'warning', min: 4.5 },
  { fg: 'on-accent', bg: 'danger', min: 4.5 },
  ...['panel', 'raised', 'chrome'].flatMap((bg) =>
    ['accent-fg', 'success-fg', 'warning-fg', 'danger-fg', 'info-fg'].map((fg) => ({
      fg,
      bg,
      min: 4.5,
    })),
  ),
  { fg: 'accent-fg', bg: 'accent-subtle', min: 4.5 },
  { fg: 'success-fg', bg: 'success-subtle', min: 4.5 },
  { fg: 'warning-fg', bg: 'warning-subtle', min: 4.5 },
  { fg: 'danger-fg', bg: 'danger-subtle', min: 4.5 },
  { fg: 'info-fg', bg: 'info-subtle', min: 4.5 },
  ...['panel', 'input', 'raised'].map((bg) => ({ fg: 'line-control', bg, min: 3 })),
  ...['panel', 'canvas', 'chrome', 'raised'].map((bg) => ({ fg: 'focus', bg, min: 3 })),
  { fg: 'accent', bg: 'canvas', min: 3 },
];
