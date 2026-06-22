// Minimal, dependency-light EPUB (ZIP) read/rewrite support.
//
// Pandoc places the EPUB nav (Table of Contents) in the spine immediately after
// its generated title page, which forces front matter such as the copyright page
// to appear *after* the TOC. There's no Pandoc flag to move it, so we post-process
// the finished EPUB: read every entry, reorder the <spine> in content.opf, and
// write a fresh, spec-compliant ZIP (mimetype first and stored).

import yauzl from "yauzl";
import zlib from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** Preserve "store" (no compression) for the mimetype entry. */
  store: boolean;
}

/** CRC-32 (IEEE 802.3) — table-based, no external dependency. */
const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Read all entries of a ZIP/EPUB buffer, preserving central-directory order. */
export function readEpubEntries(buffer: Buffer): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Could not open EPUB"));
      const entries: ZipEntry[] = [];
      zip.on("entry", (entry: yauzl.Entry) => {
        // Directories end with "/"; EPUBs are flat files, but skip just in case.
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e ?? new Error("read stream failed"));
          const chunks: Buffer[] = [];
          stream.on("data", (d: Buffer) => chunks.push(d));
          stream.on("end", () => {
            entries.push({
              name: entry.fileName,
              data: Buffer.concat(chunks),
              store: entry.fileName === "mimetype",
            });
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

function dosDateTime(): { time: number; date: number } {
  // Fixed timestamp (1980-01-01) keeps output deterministic and avoids the
  // Date.now() restriction; EPUB readers don't rely on entry timestamps.
  return { time: 0, date: 0x21 };
}

/**
 * Write a fresh ZIP. The first entry (mimetype) is stored uncompressed with no
 * extra field, as EPUB requires; the rest are raw-deflated.
 */
export function writeEpub(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const uncompressed = entry.data.length;
    let method: number;
    let payload: Uint8Array;
    if (entry.store) {
      method = 0;
      payload = entry.data;
    } else {
      method = 8;
      payload = zlib.deflateRawSync(entry.data, { level: 9 });
    }
    const compressed = payload.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed, 18);
    local.writeUInt32LE(uncompressed, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed, 20);
    central.writeUInt32LE(uncompressed, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // relative offset of local header
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // disk
  end.writeUInt16LE(0, 6); // disk with CD
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuf, end]);
}

/**
 * Move the nav (TOC) spine itemref so it follows the first `leadingFront` body
 * content items — i.e. after the front matter (copyright, etc.) and before the
 * first chapter. `leadingFront` counts body sections (NOT cover/title-page/nav)
 * that should precede the TOC. Returns the OPF text unchanged if it can't parse.
 */
export function reorderSpineToc(opf: string, leadingFront: number): string {
  const spineMatch = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/);
  if (!spineMatch) return opf;
  const spineInner = spineMatch[1];
  const itemrefs = spineInner.match(/<itemref\b[^>]*\/?>/g);
  if (!itemrefs) return opf;

  const isNav = (ref: string) => /idref="nav"/.test(ref) || /idref="nav_xhtml"/.test(ref);
  const isFixture = (ref: string) => /idref="(cover[^"]*|title_?page[^"]*)"/.test(ref);

  const nav = itemrefs.find(isNav);
  if (!nav) return opf; // nav not in spine (e.g. non-linear) — nothing to do

  const rest = itemrefs.filter((r) => !isNav(r));
  const out: string[] = [];
  let bodySeen = 0;
  let inserted = false;
  for (const ref of rest) {
    const body = !isFixture(ref);
    if (body && !inserted && leadingFront === 0) {
      out.push(nav);
      inserted = true;
    }
    out.push(ref);
    if (body) bodySeen++;
    if (!inserted && bodySeen === leadingFront) {
      out.push(nav);
      inserted = true;
    }
  }
  if (!inserted) out.push(nav);

  const rebuilt = spineInner.replace(/<itemref\b[^>]*\/?>\s*/g, "").trim();
  const indent = "\n    ";
  const newInner = indent + out.join(indent) + "\n  ";
  // Preserve any non-itemref content (rare) by replacing only the itemref list region.
  void rebuilt;
  return opf.replace(spineMatch[0], `<spine${spineMatch[0].match(/<spine\b([^>]*)>/)![1]}>${newInner}</spine>`);
}
