import { Inflate, gunzipSync, strFromU8 } from 'fflate';

// Reading a zip without holding it. A Strava or Garmin export can be gigabytes
// (photos, videos, years of files), so the reader only ever asks for the
// pieces it needs: the directory at the end, then one entry at a time. Works
// over any random-access source, so Node tests and the phone share it.

export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export interface ZipEntry {
  name: string;
  /** 0 stored, 8 deflated. Anything else is skipped. */
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

/** No single activity file is ever this big; a bigger one is not a run. */
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const CHUNK = 256 * 1024;

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

/** Bytes as text: UTF-8, or Latin-1 when the bytes aren't UTF-8 (old zip tools). */
export function text(bytes: Uint8Array): string {
  try {
    return strFromU8(bytes);
  } catch {
    return strFromU8(bytes, true);
  }
}

/** True when the bytes start like a zip. */
export function isZip(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6);
}

/** True when the bytes start like gzip. */
export function isGzip(head: Uint8Array): boolean {
  return head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
}

export function gunzip(bytes: Uint8Array): Uint8Array {
  return gunzipSync(bytes);
}

/** Every entry in the zip's directory, folders left out. Throws when it isn't a zip. */
export async function listZip(src: ByteSource): Promise<ZipEntry[]> {
  const tailLen = Math.min(src.size, 22 + 65535);
  const tail = await src.read(src.size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip');
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  // Zip64: over 65,535 entries or 4 GB. The locator sits just before the end record.
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
      const at = u64(tail, loc + 8);
      const z = await src.read(at, 56);
      if (u32(z, 0) === 0x06064b50) {
        count = u64(z, 32);
        cdSize = u64(z, 40);
        cdOffset = u64(z, 48);
      }
    }
  }
  const cd = await src.read(cdOffset, cdSize);
  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const method = u16(cd, p + 10);
    let compressedSize = u32(cd, p + 20);
    let size = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let localOffset = u32(cd, p + 42);
    const name = text(cd.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
    // Zip64 extra field: only the values that overflowed are there, in this order.
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(cd, e);
      const len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) (size = u64(cd, q)), (q += 8);
        if (compressedSize === 0xffffffff) (compressedSize = u64(cd, q)), (q += 8);
        if (localOffset === 0xffffffff) localOffset = u64(cd, q);
      }
      e += 4 + len;
    }
    if (!name.endsWith('/')) out.push({ name, method, compressedSize, size, localOffset });
    p = eEnd + commentLen;
  }
  return out;
}

/** Hands the entry's bytes to `sink` a piece at a time, inflating as it goes. */
export async function streamEntry(src: ByteSource, e: ZipEntry, sink: (chunk: Uint8Array) => void | Promise<void>): Promise<void> {
  if (e.method !== 0 && e.method !== 8) throw new Error(`zip method ${e.method}`);
  const head = await src.read(e.localOffset, 30);
  if (u32(head, 0) !== 0x04034b50) throw new Error('bad zip entry');
  let at = e.localOffset + 30 + u16(head, 26) + u16(head, 28);
  const end = at + e.compressedSize;
  let pending: Uint8Array[] = [];
  const inflate = e.method === 8 ? new Inflate((data) => void pending.push(data)) : null;
  while (at < end) {
    const n = Math.min(CHUNK, end - at);
    const chunk = await src.read(at, n);
    if (!chunk.length) break;
    at += chunk.length;
    if (inflate) inflate.push(chunk, at >= end);
    else pending.push(chunk);
    const ready = pending;
    pending = [];
    for (const c of ready) await sink(c);
  }
  if (inflate && e.compressedSize === 0) inflate.push(new Uint8Array(0), true);
  for (const c of pending) await sink(c);
}

/** One entry, whole. For activity files, which are small; refuses anything absurd. */
export async function entryBytes(src: ByteSource, e: ZipEntry): Promise<Uint8Array> {
  if (e.size > MAX_ENTRY_BYTES) throw new Error('entry too big');
  const parts: Uint8Array[] = [];
  let total = 0;
  await streamEntry(src, e, (c) => {
    total += c.length;
    if (total > MAX_ENTRY_BYTES) throw new Error('entry too big');
    parts.push(c);
  });
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of parts) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** A source over bytes already in memory (tests, small nested zips). */
export function memorySource(bytes: Uint8Array): ByteSource {
  return { size: bytes.length, read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length)) };
}
