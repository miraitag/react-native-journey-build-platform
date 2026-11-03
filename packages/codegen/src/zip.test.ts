import { crc32 as nodeCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zipFiles } from './zip.ts';

/** Reads the archive back with the format's own layout, so the test does not trust the writer. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(bytes.length - 22 + 10, true);
  let at = view.getUint32(bytes.length - 22 + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(view.getUint32(at + 16, true)).toBe(nodeCrc32(data));
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLength;
  }
  return out;
}

describe('zipFiles', () => {
  it('round-trips names and contents, with valid checksums', () => {
    const files = {
      'src/a.ts': 'export const a = 1;\n',
      'package.json': '{}\n',
      'ñ/é.txt': 'hola',
    };
    expect(unzip(zipFiles(files))).toEqual(files);
  });

  it('is deterministic and handles an empty project', () => {
    expect(zipFiles({ b: '1', a: '2' })).toEqual(zipFiles({ a: '2', b: '1' }));
    expect(unzip(zipFiles({}))).toEqual({});
  });
});
