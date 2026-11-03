/**
 * Line-based three-way merge (§16.3, ADR 0007). `base` is the common ancestor, `ours` what was
 * just generated and `theirs` what is on disk today.
 */

export interface Merge3Result {
  text: string;
  conflicts: number;
}

const splitLines = (text: string): string[] => (text === '' ? [] : text.split('\n'));

/** Base index -> index in `other`, for the lines of a longest common subsequence. */
function matchLines(base: readonly string[], other: readonly string[]): Map<number, number> {
  const matches = new Map<number, number>();
  let start = 0;
  while (start < base.length && start < other.length && base[start] === other[start]) {
    matches.set(start, start);
    start += 1;
  }
  let endBase = base.length;
  let endOther = other.length;
  const tail: [number, number][] = [];
  while (endBase > start && endOther > start && base[endBase - 1] === other[endOther - 1]) {
    endBase -= 1;
    endOther -= 1;
    tail.push([endBase, endOther]);
  }

  const n = endBase - start;
  const m = endOther - start;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        base[start + i] === other[start + j]
          ? (table[(i + 1) * width + j + 1] as number) + 1
          : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[start + i] === other[start + j]) {
      matches.set(start + i, start + j);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  for (const [b, o] of tail) matches.set(b, o);
  return matches;
}

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

export function merge3(base: string, ours: string, theirs: string): Merge3Result {
  if (ours === theirs) return { text: ours, conflicts: 0 };
  if (base === ours) return { text: theirs, conflicts: 0 };
  if (base === theirs) return { text: ours, conflicts: 0 };

  const b = splitLines(base);
  const o = splitLines(ours);
  const t = splitLines(theirs);
  const toOurs = matchLines(b, o);
  const toTheirs = matchLines(b, t);

  const out: string[] = [];
  let conflicts = 0;
  let baseAt = 0;
  let oursAt = 0;
  let theirsAt = 0;

  const flush = (baseEnd: number, oursEnd: number, theirsEnd: number): void => {
    const baseSeg = b.slice(baseAt, baseEnd);
    const oursSeg = o.slice(oursAt, oursEnd);
    const theirsSeg = t.slice(theirsAt, theirsEnd);
    if (same(oursSeg, theirsSeg)) out.push(...oursSeg);
    else if (same(oursSeg, baseSeg)) out.push(...theirsSeg);
    else if (same(theirsSeg, baseSeg)) out.push(...oursSeg);
    else {
      conflicts += 1;
      out.push('<<<<<<< ours', ...oursSeg, '=======', ...theirsSeg, '>>>>>>> theirs');
    }
  };

  for (let index = 0; index < b.length; index += 1) {
    const inOurs = toOurs.get(index);
    const inTheirs = toTheirs.get(index);
    if (inOurs === undefined || inTheirs === undefined) continue;
    // Sync points must advance on all three sides.
    if (inOurs < oursAt || inTheirs < theirsAt) continue;
    flush(index, inOurs, inTheirs);
    out.push(b[index] as string);
    baseAt = index + 1;
    oursAt = inOurs + 1;
    theirsAt = inTheirs + 1;
  }
  flush(b.length, o.length, t.length);
  return { text: out.join('\n'), conflicts };
}
