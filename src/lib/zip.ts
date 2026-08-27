// Minimal ZIP writer — no external dependencies.
// Implements the PKZIP APPNOTE subset needed to bundle the project for
// download: STORE + DEFLATE (via node:zlib deflateRaw), CRC-32, UTF-8 names,
// Unix mode bits in external attributes. Everything is built in memory
// (the project bundle is ~25 MB — fine).

import { deflateRawSync } from 'node:zlib';

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

interface AddOptions {
  mtime?: Date;
  /** Force STORE (no compression) — for already-compressed payloads. */
  store?: boolean;
  /** Unix permission bits surfaced in external attributes (default 0o644). */
  mode?: number;
}

export class ZipWriter {
  private localChunks: Buffer[] = [];
  private centralChunks: Buffer[] = [];
  private offset = 0;
  private entries = 0;

  add(name: string, data: Buffer, opts: AddOptions = {}): void {
    const crc = crc32(data);
    let method = 8; // DEFLATE
    let comp = opts.store ? data : deflateRawSync(data, { level: 9 });
    if (comp.length >= data.length) {
      method = 0; // STORE wins when deflate can't shrink it
      comp = data;
    }
    const nameBuf = Buffer.from(name, 'utf8');
    const { time, date } = dosDateTime(opts.mtime ?? new Date());

    // ----- local file header -----
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 filename
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field len
    this.localChunks.push(local, nameBuf, comp);

    // ----- central directory entry -----
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra len
    central.writeUInt16LE(0, 32); // comment len
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE((((opts.mode ?? 0o644) & 0o7777) << 16) >>> 0, 38); // external attrs (unix perms)
    central.writeUInt32LE(this.offset, 42); // local header offset
    this.centralChunks.push(central, nameBuf);

    this.offset += local.length + nameBuf.length + comp.length;
    this.entries += 1;
  }

  /** Finalize: returns the complete .zip archive buffer. */
  end(): Buffer {
    const centralDir = Buffer.concat(this.centralChunks);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // this disk
    eocd.writeUInt16LE(0, 6); // disk with central dir
    eocd.writeUInt16LE(this.entries, 8);
    eocd.writeUInt16LE(this.entries, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(this.offset, 16);
    eocd.writeUInt16LE(0, 20); // comment len
    return Buffer.concat([...this.localChunks, centralDir, eocd]);
  }
}
