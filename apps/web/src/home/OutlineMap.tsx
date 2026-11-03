import type { JourneyOutline } from '@rnjb/core';
import { FRAME_HEIGHT, FRAME_WIDTH, boundsOf } from '../editor/board-geometry.ts';

/** Miniature board map: real screen positions and connections, initial screen in accent. */
export function OutlineMap({ outline }: { outline: JourneyOutline }) {
  const bounds = boundsOf(outline.screens);
  const pad = Math.max(bounds.width, bounds.height) * 0.08;
  const viewBox = `${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`;
  const center = (index: number) => {
    const screen = outline.screens[index];
    return screen
      ? { x: screen.x + FRAME_WIDTH / 2, y: screen.y + FRAME_HEIGHT / 2 }
      : { x: 0, y: 0 };
  };
  const stroke = Math.max(bounds.width, bounds.height) / 160;

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden className="size-full">
      {outline.links.map(([from, to]) => {
        const a = center(from);
        const b = center(to);
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--line-control)"
            strokeWidth={stroke}
          />
        );
      })}
      {outline.screens.map((screen, index) => (
        <rect
          key={index}
          x={screen.x}
          y={screen.y}
          width={FRAME_WIDTH}
          height={FRAME_HEIGHT}
          rx={FRAME_WIDTH / 12}
          fill={screen.initial ? 'var(--accent-subtle)' : 'var(--panel)'}
          stroke={screen.initial ? 'var(--accent)' : 'var(--line-control)'}
          strokeWidth={stroke}
        />
      ))}
    </svg>
  );
}
