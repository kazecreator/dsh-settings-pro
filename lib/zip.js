import { inflateRawSync } from "node:zlib";

/**
 * Minimal ZIP reader for the pet-material packages (a `manifest.json` plus a
 * handful of images). Handles stored (method 0) and deflate (method 8) entries
 * via node:zlib, so the plugin needs no third-party unzip dependency.
 *
 * @param {Buffer|Uint8Array} input
 * @returns {Map<string, Buffer>} entry path → decompressed bytes.
 */
export function unzip(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const u16 = (off) => buf.readUInt16LE(off);
  const u32 = (off) => buf.readUInt32LE(off);

  // Locate the End Of Central Directory record (scan the last 64 KiB).
  let eocd = -1;
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive");

  const entryCount = u16(eocd + 10);
  let cursor = u32(eocd + 16); // central directory offset
  const out = new Map();

  for (let n = 0; n < entryCount; n++) {
    if (u32(cursor) !== 0x02014b50) break; // central file header signature
    const method = u16(cursor + 10);
    const compSize = u32(cursor + 20);
    const nameLen = u16(cursor + 28);
    const extraLen = u16(cursor + 30);
    const commentLen = u16(cursor + 32);
    const localOffset = u32(cursor + 42);
    const name = buf.toString("utf8", cursor + 46, cursor + 46 + nameLen);

    if (!name.endsWith("/")) {
      const dataStart = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28);
      const raw = buf.subarray(dataStart, dataStart + compSize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) data = inflateRawSync(raw);
      else data = raw; // unsupported method → best-effort raw bytes
      out.set(name, data);
    }

    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}
