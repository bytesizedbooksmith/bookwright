/* Phase 1 verification — acceptance tests 7b / 7c / 7d, plus the F1 preset fix.
   Builds a throwaway book in the OS temp dir so nothing is ever written into a
   real manuscript folder. */
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import yauzl from "yauzl";
import { TEST_BOOK } from "./fixtures/book.ts";
import { loadBook } from "../server/pipeline/ingest.ts";
import { renderEpub } from "../server/pipeline/render-epub.ts";
import { validateEpub } from "../server/validate/epubcheck.ts";
import { ROOT } from "../server/pipeline/paths.ts";

// The book under test — the bundled sample unless BSBF_TEST_BOOK says otherwise.
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

function entryNames(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const out: string[] = [];
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("no zip"));
      zip.on("entry", (e) => {
        out.push(e.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

function epubText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    let all = "";
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("no zip"));
      zip.on("entry", (e) => {
        if (!/\.(xhtml|opf|ncx)$/i.test(e.fileName)) return zip.readEntry();
        zip.openReadStream(e, (er, s) => {
          if (er || !s) return zip.readEntry();
          const c: Buffer[] = [];
          s.on("data", (d) => c.push(d));
          s.on("end", () => {
            all += Buffer.concat(c).toString("utf8");
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(all));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

// ---------------------------------------------------------------- 7b / 7c
// A throwaway book that mirrors The Inn's shape: `chapters: .`, so the book
// folder IS the chapters directory. This is the configuration that made stray
// markdown ship as a chapter.
console.log("\n7b/7c — ingestion hardening (throwaway book, chapters: .)");
const tmp = path.join(os.tmpdir(), `bf-phase1-${crypto.randomUUID().slice(0, 8)}`);
await fs.mkdir(path.join(tmp, "_meta"), { recursive: true });
await fs.writeFile(
  path.join(tmp, "book.yaml"),
  ["title: Filter Test", "author: Test Author", "language: en", "theme: classic", "chapters: .", "backmatter: []"].join("\n"),
);
await fs.writeFile(path.join(tmp, "chapter-01.md"), "# Chapter 1\n\nFirst chapter body.\n");
await fs.writeFile(path.join(tmp, "chapter-27.md"), "# Chapter 27\n\nA real chapter with a high number.\n");
// The sidecars that must never become chapters:
await fs.writeFile(path.join(tmp, "ZZZ-notes.md"), "# ZZZ Notes\n\nScratch notes, not a chapter.\n");
await fs.writeFile(path.join(tmp, "LINEAGE.md"), "# Lineage\n\n| Date | Version |\n|---|---|\n");
await fs.writeFile(path.join(tmp, "README.md"), "# Readme\n\nHow this book is organised.\n");
await fs.writeFile(path.join(tmp, "_scratch.md"), "# Scratch\n\nDraft fragment.\n");
// The exact shape that is already live in two of the real books.
await fs.writeFile(path.join(tmp, "copyright.md"), "# Copyright\n\nAll rights reserved.\n");
await fs.writeFile(path.join(tmp, "_meta", "version.json"), JSON.stringify({ current_version: 1 }));

const t = await loadBook(tmp);
const titles = t.book.sections.filter((s) => s.kind === "chapter").map((s) => s.title);
console.log(`    chapters ingested: ${JSON.stringify(titles)}`);
t.warnings.forEach((w) => console.log(`    warn: ${w.message}`));

const warnText = t.warnings.map((w) => w.message).join(" ");

check("7c  chapter-27.md is still included (filter does not over-reach)", titles.includes("Chapter 27"));
check("     LINEAGE.md excluded (reserved name)", !titles.some((x) => /lineage/i.test(x)));
check("     README.md excluded (reserved name)", !titles.some((x) => /readme/i.test(x)));
check("     _scratch.md excluded (underscore prefix)", !titles.some((x) => /scratch/i.test(x)));
check("     copyright.md excluded (matter vocabulary)", !titles.some((x) => /copyright/i.test(x)));
check(
  "     a warning names every skipped file",
  ["_scratch.md", "LINEAGE.md", "README.md", "copyright.md"].every((f) => warnText.includes(f)),
  warnText || "(no warning emitted)",
);

// ZZZ-notes.md has an arbitrary name no rule can recognise. It is still ingested
// — we can't know it isn't a chapter — but it must not be SILENT.
check("7b  ZZZ-notes.md is flagged as a naming outlier", warnText.includes("ZZZ-notes.md"), warnText);

// …and once declared in `exclude:`, it must actually go away.
await fs.writeFile(
  path.join(tmp, "book.yaml"),
  [
    "title: Filter Test",
    "author: Test Author",
    "language: en",
    "theme: classic",
    "chapters: .",
    "backmatter: []",
    "exclude:",
    '  - "ZZZ-note?.md"', // exercises ? and the escaped literal dot
    '  - "**/never-matches-*.md"', // exercises the ** branch without matching

  ].join("\n"),
);
const t2 = await loadBook(tmp);
const titles2 = t2.book.sections.filter((s) => s.kind === "chapter").map((s) => s.title);
check("7b  exclude: glob removes ZZZ-notes.md", !titles2.some((x) => /zzz/i.test(x)), JSON.stringify(titles2));
check("     exactly 2 chapters remain", titles2.length === 2, `got ${titles2.length}`);

// The excluded sidecars must be absent from a rendered EPUB, not just from ingest.
const tEpub = await renderEpub(t2.book, "universal");
const tText = await epubText(tEpub.buffer);
check(
  "     no sidecar content reaches the rendered EPUB",
  !/ZZZ Notes|Scratch fragment|How this book is organised/i.test(tText),
);
await fs.rm(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------- 7d
console.log("\n7d — the book under test ingests cleanly");
const inn = await loadBook(TEST_BOOK);
const innChapters = inn.book.sections.filter((s) => s.kind === "chapter");
check("every chapter ingested", innChapters.length > 0, `got ${innChapters.length}`);
inn.warnings.forEach((w) => console.log(`    warn: ${w.message}`));
const innEpub = await renderEpub(inn.book, "universal");
const innNames = await entryNames(innEpub.buffer);
const innText = await epubText(innEpub.buffer);
check("nothing from _meta/ appears in the archive", !innNames.some((n) => /_meta/i.test(n)));
check("no LINEAGE/version content in the text", !/LINEAGE|current_version/i.test(innText));

// ---------------------------------------------------------------- F1
console.log("\nF1 — EPUB preset now actually differs");
const { book: sample } = await loadBook(path.join(ROOT, "samples", "clockwork-garden"));
const out: Record<string, { bytes: number; fonts: string[]; sha: string; faces: number; valid: boolean; tool: string }> = {};
for (const preset of ["kdp", "universal"] as const) {
  const e = await renderEpub(sample, preset);
  const names = await entryNames(e.buffer);
  const text = await epubText(e.buffer);
  void text;
  const css = await new Promise<string>((resolve, reject) => {
    let s = "";
    yauzl.fromBuffer(e.buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("no zip"));
      zip.on("entry", (en) => {
        if (!/\.css$/i.test(en.fileName)) return zip.readEntry();
        zip.openReadStream(en, (er, st) => {
          if (er || !st) return zip.readEntry();
          const c: Buffer[] = [];
          st.on("data", (d) => c.push(d));
          st.on("end", () => {
            s += Buffer.concat(c).toString("utf8");
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(s));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
  const v = await validateEpub(e.buffer);
  out[preset] = {
    bytes: e.bytes,
    fonts: names.filter((n) => /\.(ttf|otf|woff2?)$/i.test(n)),
    sha: crypto.createHash("sha256").update(e.buffer).digest("hex").slice(0, 16),
    faces: (css.match(/@font-face/g) ?? []).length,
    valid: v.valid,
    tool: v.tool,
  };
  console.log(
    `    ${preset.padEnd(10)} ${String(out[preset].bytes).padStart(9)} b · sha ${out[preset].sha} · ` +
      `@font-face×${out[preset].faces} · fonts=[${out[preset].fonts.join(", ") || "none"}] · ${v.tool} valid=${v.valid}`,
  );
  v.messages.filter((m) => m.severity === "error").forEach((m) => console.log(`      [error] ${m.text}`));
}
check("kdp embeds NO font files", out.kdp.fonts.length === 0);
check("kdp emits NO @font-face rules (no dangling src)", out.kdp.faces === 0);
check("universal still embeds its font", out.universal.fonts.length === 1);
check("universal still emits its @font-face", out.universal.faces === 1);
check("the two presets now differ", out.kdp.sha !== out.universal.sha);
check("kdp is smaller than universal", out.kdp.bytes < out.universal.bytes, `${out.kdp.bytes} vs ${out.universal.bytes}`);
check("EPUBCheck is the validator now (not the builtin fallback)", out.universal.tool === "epubcheck", out.universal.tool);
check("kdp validates clean", out.kdp.valid);
check("universal validates clean", out.universal.valid);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
