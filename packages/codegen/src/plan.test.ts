import { describe, expect, it } from 'vitest';
import { buildLock, planExport } from './plan.ts';

const hash = async (text: string): Promise<string> => `h:${text}`;
const meta = { document: 'd', profile: { id: 'p', version: '1' }, platformVersion: '0' };

describe('planExport', () => {
  it('creates files that do not exist and skips identical ones', async () => {
    const plan = await planExport({
      generated: { 'a.ts': 'A', 'b.ts': 'B' },
      current: { 'b.ts': 'B' },
      hash,
    });
    expect(plan.entries.map((entry) => [entry.path, entry.status])).toEqual([
      ['a.ts', 'new'],
      ['b.ts', 'unchanged'],
    ]);
  });

  it('merges against the git base when there is one', async () => {
    const plan = await planExport({
      generated: { 'a.ts': 'x\n1\ny\nz' },
      current: { 'a.ts': 'x\n0\ny\nZ' },
      base: { 'a.ts': 'x\n0\ny\nz' },
      hash,
    });
    expect(plan.entries[0]).toMatchObject({
      status: 'merged',
      proposed: 'x\n1\ny\nZ',
      twoWay: false,
    });
  });

  it('reports a conflict with markers', async () => {
    const plan = await planExport({
      generated: { 'a.ts': '1' },
      current: { 'a.ts': '2' },
      base: { 'a.ts': '0' },
      hash,
    });
    expect(plan.entries[0]?.status).toBe('conflict');
    expect(plan.entries[0]?.proposed).toContain('<<<<<<< ours');
  });

  it('without git, updates files the lock says were not touched by hand', async () => {
    const lock = await buildLock({ 'a.ts': 'old', 'b.ts': 'old' }, meta, hash);
    const plan = await planExport({
      generated: { 'a.ts': 'new', 'b.ts': 'new' },
      current: { 'a.ts': 'old', 'b.ts': 'edited' },
      lock,
      hash,
    });
    expect(plan.entries.map((entry) => [entry.status, entry.twoWay])).toEqual([
      ['update', false],
      ['conflict', true],
    ]);
  });

  it('trusts an uncommitted lock over an older git base', async () => {
    const lock = await buildLock({ 'a.ts': 'x\n2\ny' }, meta, hash);
    const plan = await planExport({
      generated: { 'a.ts': 'x\n3\ny' },
      current: { 'a.ts': 'x\n2\ny' },
      base: { 'a.ts': 'x\n1\ny' },
      lock,
      hash,
    });
    expect(plan.entries[0]).toMatchObject({ status: 'update', proposed: 'x\n3\ny' });
  });

  it('compares two ways when there is no base and no lock', async () => {
    const plan = await planExport({ generated: { 'a.ts': '1' }, current: { 'a.ts': '2' }, hash });
    expect(plan.entries[0]).toMatchObject({ status: 'conflict', twoWay: true });
  });

  it('lists files that the previous export generated and this one does not', async () => {
    const lock = await buildLock({ 'gone.ts': 'x', 'a.ts': 'a' }, meta, hash);
    const plan = await planExport({ generated: { 'a.ts': 'a' }, current: {}, lock, hash });
    expect(plan.stale).toEqual(['gone.ts']);
  });
});
