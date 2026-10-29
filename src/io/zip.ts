// A small ZIP writer for "all your runs" exports. Entries are stored as they
// are (no compression library on the phone), and written one at a time
// through `write`, so a few hundred runs never sit in memory together.

let table: Uint32Array | null = null;

export function crc32(data: Uint8Array, crc = 0): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  crc = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return ~crc >>> 0;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function dosTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface Entry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

export class ZipWriter {
  private entries: Entry[] = [];
  private offset = 0;
  private write: (chunk: Uint8Array) => void | Promise<void>;
  constructor(write: (chunk: Uint8Array) => void | Promise<void>) {
    this.write = write;
  }

  private async out(chunk: Uint8Array) {
    await this.write(chunk);
    this.offset += chunk.length;
  }

  async add(fileName: string, data: Uint8Array | string, modifiedMs = Date.now()): Promise<void> {
    const bytes = typeof data === 'string' ? utf8(data) : data;
    const name = utf8(fileName);
    const { time, date } = dosTime(modifiedMs);
    const crc = crc32(bytes);
    const h = new Uint8Array(30 + name.length);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // version needed
    v.setUint16(6, 0x0800, true); // UTF-8 names
    v.setUint16(8, 0, true); // stored
    v.setUint16(10, time, true);
    v.setUint16(12, date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, bytes.length, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true);
    h.set(name, 30);
    this.entries.push({ name, crc, size: bytes.length, offset: this.offset, time, date });
    await this.out(h);
    await this.out(bytes);
  }

  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const h = new Uint8Array(46 + e.name.length);
      const v = new DataView(h.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, 0x0800, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, e.time, true);
      v.setUint16(14, e.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.size, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      v.setUint32(42, e.offset, true);
      h.set(e.name, 46);
      await this.out(h);
    }
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, this.offset - start, true);
    v.setUint32(16, start, true);
    await this.out(end);
  }
}
