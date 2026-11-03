import {
  addScreen,
  applyCommand,
  createDocument,
  insertNode,
  setString,
  type CommandContext,
  type RnjbDocument,
} from '@rnjb/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from './canonical.ts';
import { computeIntegrity } from './integrity.ts';
import { openRnjb, serializeRnjb } from './rnjb-file.ts';
import { documentSchema } from './schema.ts';

const ref = { package: 'react-native', component: 'View', version: '0.0.0-test' };

function sampleDocument(): RnjbDocument {
  let counter = 0;
  const ctx: CommandContext = {
    ids: { next: () => `n${++counter}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
  let doc = createDocument(
    {
      kind: 'journey',
      name: 'Pagos',
      slug: 'payments',
      profile: { id: 'feature-library', version: '1.0.0' },
      libraries: [{ package: 'react-native', version: '0.0.0-test', packId: 'rn' }],
      platformVersion: '0.0.0-test',
      formatVersion: 1,
    },
    ctx.clock,
  );
  let screenId = '';
  doc = applyCommand(
    doc,
    addScreen({ name: 'Inicio', root: ref, initialStates: ['loading'] }, (s) => (screenId = s)),
    ctx,
  ).document;
  const rootId = doc.screens[0]!.rootId;
  doc = applyCommand(
    doc,
    insertNode({
      screenId,
      parentId: rootId,
      node: {
        id: 'x',
        kind: 'component',
        ref: { ...ref, component: 'Text' },
        props: { children: { type: 'string', key: 'home.title' } },
        children: [],
        layout: {},
        spacing: { padding: { top: { type: 'literal', value: 16 } } },
      },
    }),
    ctx,
  ).document;
  return applyCommand(doc, setString('home.title', 'Hola'), ctx).document;
}

describe('canonical serialization', () => {
  it('is independent of key insertion order (property)', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(canonicalStringify(reversed)).toBe(canonicalStringify(record));
      }),
    );
  });

  it('round-trips arbitrary JSON (property)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = canonicalStringify(value);
        expect(canonicalStringify(JSON.parse(once))).toBe(once);
      }),
    );
  });
});

describe('.rnjb file', () => {
  it('validates the sample document', () => {
    expect(documentSchema.safeParse(sampleDocument()).success).toBe(true);
  });

  it('open + save without changes produces the same bytes', async () => {
    const text = await serializeRnjb(sampleDocument());
    const opened = await openRnjb(text);
    expect(opened.ok && opened.mode).toBe('edit');
    if (!opened.ok) return;
    expect(await serializeRnjb(opened.document)).toBe(text);
  });

  it('opens in recovery when the checksum does not match', async () => {
    const text = (await serializeRnjb(sampleDocument())).replace('"Hola"', '"Adiós"');
    const opened = await openRnjb(text);
    expect(opened.ok && opened.mode).toBe('recovery');
    expect(opened.ok && opened.issues.map((issue) => issue.code)).toEqual(['RNJB-203']);
  });

  it('opens newer formats read-only', async () => {
    const text = await serializeRnjb(sampleDocument());
    const opened = await openRnjb(text.replace('"formatVersion": 1', '"formatVersion": 2'));
    expect(opened.ok && opened.mode).toBe('recovery');
    expect(opened.ok && opened.issues[0]?.code).toBe('RNJB-202');
  });

  it('applies migrations from older formats', async () => {
    const doc = sampleDocument();
    const { meta, ...rest } = doc;
    const legacy = { ...rest, formatVersion: 1, info: meta };
    const opened = await openRnjb(JSON.stringify(legacy), {
      formatVersion: 2,
      migrations: {
        1: ({ info, ...raw }) => ({ ...raw, meta: info }),
      },
    });
    expect(opened.ok && opened.migratedFrom).toBe(1);
    expect(opened.ok && opened.document.formatVersion).toBe(2);
  });

  it('reports the exact field path of a schema error', async () => {
    const doc = sampleDocument();
    const broken = { ...doc, libraries: [{ package: '', version: '1', packId: 'x' }] };
    const opened = await openRnjb(JSON.stringify(broken));
    expect(!opened.ok && opened.error.code).toBe('RNJB-201');
    expect(!opened.ok && opened.error.params.path).toBe('libraries[0].package');
  });

  it.each(['../secret.png', '/etc/passwd', 'a/../../b.png', 'C:/x.png', 'a\\b.png'])(
    'rejects asset path %s',
    (path) => {
      const doc = { ...sampleDocument(), assets: [{ id: 'a', path }] };
      expect(documentSchema.safeParse(doc).success).toBe(false);
    },
  );

  it('rejects unknown keys instead of silently dropping them', () => {
    const doc = { ...sampleDocument(), surprise: true };
    expect(documentSchema.safeParse(doc).success).toBe(false);
  });

  it('integrity ignores the integrity field itself', async () => {
    const doc = sampleDocument();
    expect(await computeIntegrity({ ...doc, integrity: 'a' })).toBe(
      await computeIntegrity({ ...doc, integrity: 'b' }),
    );
  });
});
