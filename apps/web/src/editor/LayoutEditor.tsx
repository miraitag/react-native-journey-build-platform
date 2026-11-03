import {
  parseSpacingInput,
  setSpacing,
  snapToScale,
  updateLayout,
  type Command,
  type ComponentNode,
  type Layout,
  type SpacingTarget,
} from '@rnjb/core';
import { Select } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { CommitInput } from './CommitInput.tsx';

const ENUMS: { key: keyof Layout; options: readonly string[] }[] = [
  { key: 'flexDirection', options: ['row', 'column', 'row-reverse', 'column-reverse'] },
  {
    key: 'justifyContent',
    options: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
  },
  { key: 'alignItems', options: ['flex-start', 'flex-end', 'center', 'stretch', 'baseline'] },
  {
    key: 'alignSelf',
    options: ['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline'],
  },
  { key: 'flexWrap', options: ['nowrap', 'wrap', 'wrap-reverse'] },
];
const NUMBERS: (keyof Layout)[] = ['flex', 'flexGrow', 'flexShrink'];
const SIZES: (keyof Layout)[] = ['width', 'height'];
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** `16` stays a number, `50%` stays a string: React Native accepts both for width/height. */
const parseSize = (text: string): number | string | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const number = Number(trimmed);
  if (Number.isFinite(number)) return number;
  return /^\d+(\.\d+)?%$/.test(trimmed) || trimmed === 'auto' ? trimmed : undefined;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-2 py-1">
      <dt className="truncate font-mono text-2xs text-fg-muted" title={label}>
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * Layout and spacing of a component node (§9.1, §11.7). Layout is flexbox only; `position` shows
 * up only when the manifest admits absolute positioning. Spacing snaps to the pack's scale and
 * is free when the pack has none.
 */
export function LayoutEditor({
  node,
  screenId,
  scale,
  supportsAbsolutePosition,
  onRun,
}: {
  node: ComponentNode;
  screenId: string;
  scale: readonly number[] | undefined;
  supportsAbsolutePosition: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const setLayout = (patch: Partial<Layout>) => onRun(updateLayout(screenId, node.id, patch));

  const spacingValue = (target: SpacingTarget): string => {
    const [kind, side] = target.split('.') as ['margin' | 'padding', (typeof SIDES)[number]];
    const value = target === 'gap' ? node.spacing.gap : node.spacing[kind]?.[side];
    if (!value) return '';
    return value.type === 'literal' ? String(value.value) : `${value.group}.${value.name}`;
  };
  const spacingInput = (target: SpacingTarget) => {
    const current = node.spacing;
    const [kind, side] = target.split('.') as ['margin' | 'padding', (typeof SIDES)[number]];
    const stored = target === 'gap' ? current.gap : current[kind]?.[side];
    // Token values are shown as read-only text; editing replaces them with a literal.
    return (
      <CommitInput
        mono
        label={target}
        value={spacingValue(target)}
        onCommit={(text) => {
          if (text.trim() === '') {
            if (stored) onRun(setSpacing(screenId, node.id, target, undefined));
            return;
          }
          const parsed = parseSpacingInput(text);
          if (parsed === undefined) return;
          onRun(
            setSpacing(screenId, node.id, target, {
              type: 'literal',
              value: snapToScale(parsed, scale),
            }),
          );
        }}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <section>
        <h4 className="pb-1 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">
          {i18n.t('editor.inspector.layoutSection')}
        </h4>
        <dl>
          {ENUMS.map(({ key, options }) => {
            const current = node.layout[key];
            return (
              <Row key={key} label={key}>
                <Select
                  aria-label={key}
                  className="w-full"
                  value={typeof current === 'string' ? current : ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setLayout({ [key]: value === '' ? undefined : value } as Partial<Layout>);
                  }}
                >
                  <option value="">—</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Row>
            );
          })}
          {NUMBERS.map((key) => (
            <Row key={key} label={key}>
              <CommitInput
                mono
                label={key}
                value={node.layout[key] === undefined ? '' : String(node.layout[key])}
                onCommit={(text) => {
                  const number = Number(text.trim());
                  if (text.trim() === '') setLayout({ [key]: undefined });
                  else if (Number.isFinite(number) && number >= 0) setLayout({ [key]: number });
                }}
              />
            </Row>
          ))}
          {SIZES.map((key) => (
            <Row key={key} label={key}>
              <CommitInput
                mono
                label={key}
                value={node.layout[key] === undefined ? '' : String(node.layout[key])}
                onCommit={(text) => {
                  if (text.trim() === '') setLayout({ [key]: undefined });
                  else {
                    const size = parseSize(text);
                    if (size !== undefined) setLayout({ [key]: size });
                  }
                }}
              />
            </Row>
          ))}
          {supportsAbsolutePosition && (
            <Row label="position">
              <Select
                aria-label="position"
                className="w-full"
                value={node.layout.position ?? 'relative'}
                onChange={(event) =>
                  setLayout({ position: event.target.value as 'relative' | 'absolute' })
                }
              >
                <option value="relative">relative</option>
                <option value="absolute">absolute</option>
              </Select>
            </Row>
          )}
        </dl>
      </section>
      <section>
        <h4 className="pb-1 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">
          {i18n.t('editor.inspector.spacingSection')}
        </h4>
        <p className="pb-1 text-2xs text-fg-subtle">
          {scale && scale.length > 0
            ? i18n.t('editor.inspector.scaleHint', { scale: scale.join(', ') })
            : i18n.t('editor.inspector.freeSpacing')}
        </p>
        <dl>
          {(['margin', 'padding'] as const).flatMap((kind) =>
            SIDES.map((side) => (
              <Row key={`${kind}.${side}`} label={`${kind}.${side}`}>
                {spacingInput(`${kind}.${side}`)}
              </Row>
            )),
          )}
          <Row label="gap">{spacingInput('gap')}</Row>
        </dl>
      </section>
    </div>
  );
}
