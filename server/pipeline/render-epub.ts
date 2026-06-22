import path from "node:path";
import { promises as fs } from "node:fs";
import type { Book, PresetName } from "./types.ts";
import { assembleMarkdown } from "./build-doc.ts";
import { themeCssFiles } from "./paths.ts";
import { cleanup, commonArgs, makeWorkspace, runPandoc } from "./pandoc.ts";
import { buildDocCss, epubFontFiles } from "./doc-css.ts";
import { getPreset } from "../presets.ts";
import { readEpubEntries, writeEpub, reorderSpineToc } from "./epub-zip.ts";

export interface EpubResult {
  buffer: Buffer;
  bytes: number;
  preset: PresetName;
}

/**
 * Reorder the EPUB spine so the nav/TOC sits after the front matter. Counts the
 * body sections (the EPUB drops our title page, so cover & Pandoc's title page
 * are not body items) that precede the first chapter — those should come before
 * the TOC. Falls back to the original buffer on any parse trouble.
 */
async function reorderToc(buffer: Buffer, book: Book): Promise<Buffer> {
  // Every section becomes a body file (we no longer drop the title page for EPUB),
  // in this order. Place the TOC right after the copyright page — the conventional
  // spot (Title, Copyright, Contents, then dedication/epigraph, then chapters).
  const sections = book.sections;
  const isCopyright = (s: (typeof sections)[number]) =>
    s.kind === "copyright" || s.className === "copyright" || /^copyright$/i.test(s.title.trim());
  const copyrightIdx = sections.findIndex(isCopyright);
  let leadingFront: number;
  if (copyrightIdx >= 0) {
    leadingFront = copyrightIdx + 1; // after the copyright page
  } else {
    // No copyright page: fall back to just after the title page, else first.
    const tpIdx = sections.findIndex((s) => s.kind === "titlepage");
    leadingFront = tpIdx >= 0 ? tpIdx + 1 : 0;
  }
  try {
    const entries = await readEpubEntries(buffer);
    const opfEntry = entries.find((e) => e.name.endsWith(".opf"));
    if (!opfEntry) return buffer;
    const opf = Buffer.from(opfEntry.data).toString("utf8");
    const reordered = reorderSpineToc(opf, leadingFront);
    if (reordered === opf) return buffer;
    opfEntry.data = Buffer.from(reordered, "utf8");
    return Buffer.from(writeEpub(entries));
  } catch {
    return buffer; // never fail the export over a cosmetic reorder
  }
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * EPUB-only OPF metadata (dc:rights). Kept out of the document metadata so it
 * lands in the OPF for cataloguing but never renders on Pandoc's title page.
 * Returns a path to a written file, or null if there's nothing to add.
 */
async function writeEpubMetadata(book: Book, dir: string): Promise<string | null> {
  const m = book.meta;
  const rights = m.rights || (m.copyright ? m.copyright.split("\n")[0].trim() : "");
  if (!rights) return null;
  const p = path.join(dir, "epub-metadata.xml");
  await fs.writeFile(p, `<dc:rights>${xmlEscape(rights)}</dc:rights>\n`, "utf8");
  return p;
}

/** Render an EPUB 3 file as a Buffer, applying the chosen distribution preset. */
export async function renderEpub(book: Book, presetName: PresetName): Promise<EpubResult> {
  const preset = getPreset(presetName);
  const ws = await makeWorkspace(book);
  const outPath = path.join(ws.dir, "book.epub");
  try {
    const md = assembleMarkdown(book, "epub");
    const cssFiles = themeCssFiles(book.meta.theme);
    // Custom fonts + per-class style overrides.
    const docCss = await buildDocCss(book, "epub");
    if (docCss.trim()) {
      const docCssPath = path.join(ws.dir, "doc.css");
      await fs.writeFile(docCssPath, docCss, "utf8");
      cssFiles.push(docCssPath);
    }
    const args = [
      ...commonArgs(book, ws.metaPath),
      "--to=epub3",
      // We supply our own title page (first section) so it carries the series
      // line and matches the preview; suppress Pandoc's auto-generated one.
      "--epub-title-page=false",
      "--toc",
      "--toc-depth=1",
      "--split-level=1",
      ...cssFiles.map((c) => `--css=${c}`),
      "-o",
      outPath,
    ];
    const epubMetaPath = await writeEpubMetadata(book, ws.dir);
    if (epubMetaPath) args.push(`--epub-metadata=${epubMetaPath}`);
    if (book.coverPath) args.push(`--epub-cover-image=${book.coverPath}`);
    // Embed the book's custom fonts so journals/letters render everywhere.
    for (const f of epubFontFiles(book)) args.push(`--epub-embed-font=${f}`);
    void preset.embedFonts;

    await runPandoc(args, md);
    let buffer: Buffer = await fs.readFile(outPath);

    // Pandoc pins the nav (TOC) right after the title page, pushing the copyright
    // and other front matter below it. Reorder the spine so the TOC follows the
    // front matter (conventional order: title, copyright, contents, chapters).
    buffer = await reorderToc(buffer, book);

    return { buffer, bytes: buffer.length, preset: presetName };
  } finally {
    await cleanup(ws);
  }
}
