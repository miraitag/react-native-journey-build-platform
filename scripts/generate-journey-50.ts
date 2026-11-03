/**
 * Generates `fixtures/journey-50/journey-50.rnjb`: 50 screens × 200 nodes (plan §5.1).
 * Component refs point at a synthetic fixture package so no project data is implied.
 * Run: pnpm fixtures
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  addConnection,
  addScreen,
  applyCommand,
  createDocument,
  insertNode,
  type CommandContext,
  type ComponentRef,
  type DocumentNode,
  type RnjbDocument,
} from '@rnjb/core';
import { FORMAT_VERSION, serializeRnjb } from '@rnjb/document-schema';

const SCREENS = 50;
const NODES_PER_SCREEN = 200;
const PACKAGE = '@rnjb-fixture/components';
const VERSION = '0.0.0-fixture';

const ref = (component: string): ComponentRef => ({
  package: PACKAGE,
  component,
  version: VERSION,
});

let counter = 0;
const context: CommandContext = {
  ids: { next: () => `f${(++counter).toString(36).padStart(6, '0')}` },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};

const leaf = (component: string, index: number): DocumentNode => ({
  id: 'leaf',
  kind: 'component',
  ref: ref(component),
  props: {
    testID: { type: 'literal', value: `${component.toLowerCase()}-${index}` },
    ...(component === 'Text'
      ? { children: { type: 'string', key: `fixture.text.${index % 40}` } }
      : {}),
  },
  children: [],
  layout: {},
  spacing: { padding: { top: { type: 'literal', value: 8 } } },
});

function build(): RnjbDocument {
  let doc = createDocument(
    {
      kind: 'journey',
      name: 'Journey 50 (fixture)',
      slug: 'journey-50',
      profile: { id: 'fixture-profile', version: '1.0.0' },
      libraries: [{ package: PACKAGE, version: VERSION, packId: 'fixture' }],
      platformVersion: '0.1.0',
      formatVersion: FORMAT_VERSION,
    },
    context.clock,
  );

  const screenIds: string[] = [];
  for (let s = 0; s < SCREENS; s += 1) {
    let screenId = '';
    doc = applyCommand(
      doc,
      addScreen(
        {
          name: `Pantalla ${s + 1}`,
          root: ref('Screen'),
          position: { x: (s % 10) * 480, y: Math.floor(s / 10) * 960 },
          initialStates: ['loading', 'success', 'error', 'empty'],
        },
        (id) => (screenId = id),
      ),
      context,
    ).document;
    screenIds.push(screenId);

    // 19 sections × (1 section + 9 leaves) + root = 191; topped up with leaves on the root.
    const rootId = doc.screens[s]!.rootId;
    let created = 1;
    for (let section = 0; created + 10 <= NODES_PER_SCREEN; section += 1) {
      let sectionId = '';
      doc = applyCommand(
        doc,
        insertNode(
          {
            screenId,
            parentId: rootId,
            node: { ...leaf('Stack', section), props: {} },
          },
          (id) => (sectionId = id),
        ),
        context,
      ).document;
      created += 1;
      for (let i = 0; i < 9; i += 1) {
        doc = applyCommand(
          doc,
          insertNode({
            screenId,
            parentId: sectionId,
            node: leaf(i % 3 === 0 ? 'Button' : 'Text', i),
          }),
          context,
        ).document;
        created += 1;
      }
    }
    while (created < NODES_PER_SCREEN) {
      doc = applyCommand(
        doc,
        insertNode({ screenId, parentId: rootId, node: leaf('Text', created) }),
        context,
      ).document;
      created += 1;
    }
  }

  for (let s = 0; s < SCREENS - 1; s += 1) {
    doc = applyCommand(
      doc,
      addConnection({ fromScreenId: screenIds[s]!, toScreenId: screenIds[s + 1]!, params: [] }),
      context,
    ).document;
  }

  const strings: Record<string, string> = {};
  for (let i = 0; i < 40; i += 1) strings[`fixture.text.${i}`] = `Texto de ejemplo ${i + 1}`;
  return { ...doc, strings };
}

const target = path.resolve(import.meta.dirname, '..', 'fixtures', 'journey-50', 'journey-50.rnjb');
await mkdir(path.dirname(target), { recursive: true });
const text = await serializeRnjb(build());
await writeFile(target, text);
console.warn(
  `journey-50: ${(text.length / 1024 / 1024).toFixed(1)} MB → ${path.relative(process.cwd(), target)}`,
);
