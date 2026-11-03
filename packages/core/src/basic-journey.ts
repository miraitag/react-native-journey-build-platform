import { addConnection, addScreen, applyCommand, type CommandContext } from './commands.ts';
import type { ComponentRef, RnjbDocument } from './entities.ts';

export interface BasicJourneyInput {
  /** Display names, in navigation order: entry screen, detail, result. */
  screenNames: readonly [string, string, string];
  /** Initial states from the profile (§9.3). */
  initialStates: readonly string[];
  /** Root container of each screen; the generic React Native `View` unless a pack says otherwise. */
  root?: ComponentRef;
}

const SPACING = 120;
const FRAME_WIDTH = 390;

/**
 * The included "Journey básico" (§19.2): three generic screens chained by navigation, with the
 * first one as the initial screen. It names no library, so it works with any profile.
 */
export function applyBasicJourney(
  document: RnjbDocument,
  input: BasicJourneyInput,
  context: CommandContext,
): RnjbDocument {
  const root = input.root ?? { package: 'react-native', component: 'View', version: '*' };
  const ids: string[] = [];
  let next = document;
  input.screenNames.forEach((name, index) => {
    next = applyCommand(
      next,
      addScreen(
        {
          name,
          root,
          position: { x: index * (FRAME_WIDTH + SPACING), y: 0 },
          initialStates: input.initialStates,
        },
        (id) => ids.push(id),
      ),
      context,
    ).document;
  });
  for (let index = 0; index < ids.length - 1; index += 1) {
    next = applyCommand(
      next,
      addConnection({
        fromScreenId: ids[index] as string,
        toScreenId: ids[index + 1] as string,
        params: [],
      }),
      context,
    ).document;
  }
  return next;
}
