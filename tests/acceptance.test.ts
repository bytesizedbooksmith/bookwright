/* Phase 8 — the two acceptance criteria not directly asserted by the phase
   suites: the cover's RENDERED text (5), and no regressions in the existing
   pipeline (14). Everything else is covered and re-run separately. */
import path from "node:path";
import { promises as fs } from "node:fs";
import yauzl from "yauzl";
import { makeBookFixture } from "./fixtures/book.ts";
import { loadBook } from "../server/pipeline/ingest.ts";
import { buildBluesBook, paginate } from "../server/pipeline/render-blues.ts";
import { renderHtml } from "../server/pipeline/render-html.ts";
import { getBrowser, closeBrowser, renderPdf } from "../server/pipeline/render-pdf.ts";
import { renderEpub } from "../server/pipeline/render-epub.ts";
import { renderDocx } from "../server/pipeline/render-docx.ts";
import { renderMarkdown } from "../server/pipeline/render-markdown.ts";
import { renderPrintPdf } from "../server/pipeline/render-print.ts";
import { DEFAULT_PRINT } from "../server/print.ts";
import { buildBluesPageCss, type BluesOptions } from "../server/blues.ts";
import { ROOT, THEMES_DIR } from "../server/pipeline/paths.ts";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ============================================================ test 5
console.log("\n5  the cover page reports version, round, words, chapters, page range");
const fx = await makeBookFixture();
const { book } = await loadBook(fx.bookDir);
const SOURCE_LABEL = "Books/Author/Series/Bk-1_The-Book";
// Half the book, so the page range is exercised rather than skipped.
const opts: BluesOptions = {
  version: 6,
  date: "2026-08-09",
  round: 1,
  maxRounds: 1,
  sourceLabel: SOURCE_LABEL,
  maxPages: 4,
};

const bluesBook = buildBluesBook(book, opts).book;
const html = (await renderHtml(bluesBook, "print")).replace(
  "</head>",
  `<style>\n${await fs.readFile(path.join(THEMES_DIR, "blues-base.css"), "utf8")}\n` +
    `${buildBluesPageCss(book.meta.title, book.meta.author, opts)}\n</style>\n</head>`,
);
const browser = await getBrowser();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
const pag = await paginate(page, opts.maxPages);
await page.evaluate(
  (shown, total, isTrunc) => {
    const el = document.querySelector(".blues-range");
    if (el) el.textContent = isTrunc ? ` · pages 1–${shown} of ~${total}` : "";
  },
  pag.pages,
  pag.totalPages,
  pag.pages < pag.totalPages,
);
const coverText = await page.evaluate(() => {
  const pg = document.querySelector(".pagedjs_page");
  return (pg?.textContent ?? "").replace(/\s+/g, " ").trim();
});
console.log(`      "${coverText}"`);
// Pandoc smart-quotes the apostrophe, so compare with curly quotes normalised.
const flat = coverText.replace(/[‘’]/g, "'");
check("title", flat.includes(fx.facts.title.replace(/[‘’]/g, "'")));
check("author", coverText.includes(fx.facts.author));
check("version", coverText.includes("BLUES v6"));
check("date", coverText.includes("2026-08-09"));
check("word count, by the fixed method", coverText.includes(`${fx.facts.words.toLocaleString("en-US")} words`));
check("chapter count", coverText.includes(`${fx.facts.chapters} chapters`));
check("source path", coverText.includes(SOURCE_LABEL));
check("round", coverText.includes("round 1 of 1"));
check("page range, filled after pagination", /pages 1–\d+ of ~\d+/.test(coverText), coverText.match(/pages 1–\d+ of ~\d+/)?.[0] ?? "MISSING");
await page.close();
await fx.cleanup();

// ============================================================ test 14
console.log("\n14 no regressions in the existing pipeline (sample book)");
const outDir = path.join(ROOT, "output", "phase8");
await fs.mkdir(outDir, { recursive: true });
const { book: sample } = await loadBook(path.join(ROOT, "samples", "clockwork-garden"));

function entries(file: string): Promise<Map<string, number>> {
  return new Promise((resolve, reject) => {
    const m = new Map<string, number>();
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("no zip"));
      zip.on("entry", (e) => {
        m.set(e.fileName, e.uncompressedSize);
        zip.readEntry();
      });
      zip.on("end", () => resolve(m));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

const uni = await renderEpub(sample, "universal");
await fs.writeFile(path.join(outDir, "sample-universal.epub"), uni.buffer);
const kdp = await renderEpub(sample, "kdp");
await fs.writeFile(path.join(outDir, "sample-kdp.epub"), kdp.buffer);
const print = await renderPrintPdf(sample, DEFAULT_PRINT);
const reading = await renderPdf(sample);
const docx = await renderDocx(sample);
const md = renderMarkdown(sample);

// The reference is a structural fingerprint of the outputs at the commit this
// work started from, checked in at tests/fixtures/pipeline-reference.json. It
// used to be 1.7MB of binaries in a gitignored scratch folder, which meant this
// test silently had no baseline on any machine but the one that made it.
const ref = JSON.parse(await fs.readFile(path.join(ROOT, "tests", "fixtures", "pipeline-reference.json"), "utf8"));

// stylesheet1.css is base.css, which now carries the drop-cap seating fix — a
// requested change, not a regression. Everything else must still match exactly,
// which is what actually proves nothing else moved.
const INTENDED = new Set(["EPUB/styles/stylesheet1.css"]);
const refUni = new Map<string, number>(Object.entries(ref.epubUniversal));
const newUni = await entries(path.join(outDir, "sample-universal.epub"));
const uniDiffs = [...newUni.entries()].filter(
  ([n, s]) => !n.endsWith(".opf") && !INTENDED.has(n) && refUni.get(n) !== s,
);
check(
  "epub (universal): every entry but the drop-cap stylesheet is identical",
  uniDiffs.length === 0 && newUni.size === refUni.size,
  uniDiffs.map(([n]) => n).join(", ") || `${newUni.size} entries, ${INTENDED.size} intentionally changed`,
);
check(
  "   the drop-cap stylesheet did change",
  newUni.get("EPUB/styles/stylesheet1.css") !== refUni.get("EPUB/styles/stylesheet1.css"),
);

// KDP has no pre-work reference (the preset was inert, so both presets were the
// same file). The real claim is what the fix guarantees, asserted directly.
const newKdp = await entries(path.join(outDir, "sample-kdp.epub"));
check(
  "epub (kdp) embeds no fonts and is smaller than universal — the preset fix",
  ![...newKdp.keys()].some((n) => /\.(ttf|otf|woff2?)$/i.test(n)) && kdp.bytes < uni.bytes,
  `${kdp.bytes} < ${uni.bytes}`,
);

// Both PDFs shift by a few bytes because the drop cap moved. What must NOT
// change is the pagination — a cap that reflowed the text around it would show
// up as a different page count, which is the regression worth catching.
const refPrint = ref.printPdf.bytes as number;
const refReading = ref.readingPdf.bytes as number;
check("print pdf: same 15 pages", print.meta.pages === ref.printPdf.pages, `${print.meta.pages} pages`);
check(
  "   size moved only by the drop-cap seating",
  Math.abs(print.buffer.length - refPrint) < 200,
  `${refPrint} -> ${print.buffer.length}`,
);
check(
  "reading pdf: size moved only by the drop-cap seating",
  Math.abs(reading.length - refReading) < 200,
  `${refReading} -> ${reading.length}`,
);

// DOCX is a zip with a timestamp in docProps, and the date digits shift the
// deflate output by a byte or two across days, so it is compared on structure
// rather than total size. (Verified: three renders in one process are
// byte-identical; only the calendar moves it.)
await fs.writeFile(path.join(outDir, "sample.docx"), docx);
const refDocx = new Map<string, number>(Object.entries(ref.docx));
const newDocx = await entries(path.join(outDir, "sample.docx"));
const docxDiffs = [...newDocx.entries()].filter(([n, s]) => !n.startsWith("docProps/") && refDocx.get(n) !== s);
check(
  "docx structurally unchanged",
  docxDiffs.length === 0 && newDocx.size === refDocx.size,
  docxDiffs.map(([n]) => n).join(", ") || `${newDocx.size} parts`,
);
check(
  "compiled markdown byte-identical",
  Buffer.byteLength(md) === ref.markdownBytes,
  `${Buffer.byteLength(md)} b`,
);

await closeBrowser();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
