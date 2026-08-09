/* Blues format — page geometry, the gutter, the running head and foot, --pages.
   Test 4 (the right 2.5in is empty) is measured geometrically: every laid-out box
   on every page is checked against the gutter edge, which is stricter and far
   faster than eyeballing a render. */
import path from "node:path";
import { promises as fs } from "node:fs";
import { makeBookFixture } from "./fixtures/book.ts";
import { loadBook } from "../server/pipeline/ingest.ts";
import { renderBlues, buildBluesBook, paginate } from "../server/pipeline/render-blues.ts";
import { getBrowser, closeBrowser } from "../server/pipeline/render-pdf.ts";
import { renderHtml } from "../server/pipeline/render-html.ts";
import { buildBluesPageCss, PAGE, CONTENT_WIDTH, type BluesOptions } from "../server/blues.ts";
import { ROOT, THEMES_DIR } from "../server/pipeline/paths.ts";

// The book under test — the bundled sample unless BSBF_TEST_BOOK says otherwise.
const outDir = path.join(ROOT, "output", "blues-format");
await fs.mkdir(outDir, { recursive: true });

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
/** Not applicable to this book. Reported, and counted as neither pass nor fail —
 *  a check that quietly passes on an empty set is how a real bug hides. */
const skip = (label: string, why: string) => console.log(`  ○ ${label} — skipped: ${why}`);

const fx = await makeBookFixture();
const meta = JSON.parse(await fs.readFile(path.join(fx.bookDir, "_meta", "version.json"), "utf8"));
const opts: BluesOptions = {
  version: meta.current_version,
  date: "2026-08-08",
  round: 1,
  maxRounds: meta.max_rounds,
  sourceLabel: "Books/Author/Series/Bk-1_The-Book",
};

const { book } = await loadBook(fx.bookDir);

// ---------------------------------------------------------------- full render
console.log("\nFull book");
const full = await renderBlues(book, opts);
await fs.writeFile(path.join(outDir, "blues-full.pdf"), full.buffer);
console.log(`  ${full.meta.pages} pages · ${full.meta.chapters} chapters · ${full.meta.words.toLocaleString()} words`);
check("7  front and back matter absent", (() => {
  const kinds = new Set(buildBluesBook(book, opts).book.sections.map((s) => s.className));
  return !kinds.has("copyright") && !kinds.has("titlepage");
})());
check("   word count matches the fixed method", full.meta.words === fx.facts.words, String(full.meta.words));
check("   every chapter present", full.meta.chapters === fx.facts.chapters, String(full.meta.chapters));

// ---------------------------------------------------------------- the page cap
// A cap of about half the book, so truncation actually happens whatever the
// book's length. Hard-coding 50 only exercises this on a full-length manuscript.
const CAP = Math.max(1, Math.floor(full.meta.pages / 2));
console.log(`\n--pages ${CAP}`);
const capped = await renderBlues(book, { ...opts, maxPages: CAP });
await fs.writeFile(path.join(outDir, "blues-capped.pdf"), capped.buffer);
console.log(
  `  ${capped.meta.pages} pages (cap ${CAP}, book runs ~${capped.meta.totalPages}) · chapters ${capped.meta.firstChapter}-${capped.meta.lastChapter} of ${capped.meta.totalChapters}`,
);
check("6  stops at or under the cap", capped.meta.pages <= CAP, `${capped.meta.pages} pages`);
check(
  "6  stopped on a chapter boundary, not mid-chapter",
  capped.meta.truncated && capped.meta.lastChapter < fx.facts.chapters,
  `last chapter ${capped.meta.lastChapter} of ${fx.facts.chapters}`,
);
check("   full-book total reported for the cover", capped.meta.totalPages === full.meta.pages);

// ------------------------------------------------- geometry + stamping checks
// Re-paginate in a live page so the laid-out boxes can be measured directly.
console.log("\nGeometry and stamping (live layout)");
const bluesBook = buildBluesBook(book, opts).book;
const baseHtml = await renderHtml(bluesBook, "print");
const css = await fs.readFile(path.join(THEMES_DIR, "blues-base.css"), "utf8");
const pageCss = buildBluesPageCss(book.meta.title, book.meta.author, opts);
const html = baseHtml.replace("</head>", `<style>\n${css}\n${pageCss}\n</style>\n</head>`);

const browser = await getBrowser();
const p = await browser.newPage();
await p.setContent(html, { waitUntil: "networkidle0" });
// Drive the renderer's own pagination + stamping, so these assertions run
// against the shipping code path rather than a reimplementation of it.
await paginate(p, undefined);

// Measure COMPUTED widths, not bounding rects.
//
// Paged.js lays a chapter out as one wide multi-column block — roughly one
// column per page it spans — and shows a single column per sheet. So
// getBoundingClientRect() on a paragraph reports the whole multi-page strip
// (24in for a five-page chapter) even though only 5.10in of it is ever on
// paper. Ranges over text nodes inherit the same inflation. The computed
// width is the real constraint, and it is what actually governs where a
// glyph can land inside a column.
//
// The ways ink could genuinely reach the gutter are: a box wider than the
// column, something pushed right by a negative margin or absolute offset, or
// an inked right-hand margin box. All three are checked.
const geo = await p.evaluate(
  (gutterIn, pageWIn, leftIn) => {
    const DPI = 96;
    const colPx = (pageWIn - gutterIn - leftIn) * DPI; // 5.10in
    const pages = Array.from(document.querySelectorAll(".pagedjs_page"));
    let worst = { w: 0, where: "", text: "" };
    let tooWide = 0;
    let pushedRight = 0;
    let inkedRightBox = 0;

    pages.forEach((pg) => {
      pg.querySelectorAll(".pagedjs_page_content *").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        const w = parseFloat(cs.width);
        if (!Number.isNaN(w) && w > worst.w) {
          worst = {
            w,
            where: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
            text: (el.textContent ?? "").trim().slice(0, 46),
          };
        }
        if (!Number.isNaN(w) && w > colPx + 0.5) tooWide++;
        // Anything shoved rightward out of the column.
        const mr = parseFloat(cs.marginRight);
        const left = parseFloat(cs.left);
        if ((!Number.isNaN(mr) && mr < -0.5) || (cs.position === "absolute" && !Number.isNaN(left) && left > colPx)) {
          pushedRight++;
        }
      });
      // Right-hand margin boxes must never carry generated content.
      ["top-center", "top-right", "top-right-corner", "bottom-center", "bottom-right", "bottom-right-corner"].forEach(
        (k) => {
          const el = pg.querySelector(`.pagedjs_margin-${k} .pagedjs_margin-content`);
          if (!el) return;
          const c = getComputedStyle(el, "::after").content;
          if (c && c !== "none" && c !== "normal" && c !== '""' && c !== '" "') inkedRightBox++;
        },
      );
    });
    return { colPx, worst, violations: tooWide + pushedRight + inkedRightBox, tooWide, pushedRight, inkedRightBox, pageCount: pages.length };
  },
  PAGE.right,
  PAGE.width,
  PAGE.left,
);

console.log(
  `  widest laid-out box: ${(geo.worst.w / 96).toFixed(3)}in (column is ${(geo.colPx / 96).toFixed(3)}in) in <${geo.worst.where}>`,
);
check(
  "4  NOTHING can reach the 2.5in right margin",
  geo.violations === 0,
  `${geo.tooWide} over-wide, ${geo.pushedRight} pushed right, ${geo.inkedRightBox} inked right boxes`,
);
check("   text column is exactly 5.10in", Math.abs(geo.colPx / 96 - CONTENT_WIDTH) < 0.001, `${(geo.colPx / 96).toFixed(3)}in`);

// No named functions inside evaluate — see the note in render-blues.ts.
const stamps = await p.evaluate(() => {
  const pages = Array.from(document.querySelectorAll(".pagedjs_page"));
  const chapterSeq = pages.map((pg) => {
    const v = pg.querySelector("[data-ch]")?.getAttribute("data-ch");
    return v ? parseInt(v, 10) : null;
  });
  const heads = pages.map((pg) => {
    const el = pg.querySelector(".pagedjs_margin-top-left .pagedjs_margin-content");
    return el ? getComputedStyle(el, "::after").content : "";
  });
  const rightBoxes = pages.map((pg) =>
    ["top-center", "top-right", "bottom-center", "bottom-right"].some((k) => {
      const el = pg.querySelector(`.pagedjs_margin-${k} .pagedjs_margin-content`);
      const c = el ? getComputedStyle(el, "::after").content : "none";
      return c && c !== "none" && c !== '""' && c !== "normal";
    }),
  );
  return {
    total: pages.length,
    coverHasHead: heads[0] !== "none" && heads[0] !== "" && heads[0] !== "normal",
    headsOnBody: heads.slice(2).filter((h) => h && h !== "none" && h !== "normal").length,
    chapterSeq,
    anyRightBoxInked: rightBoxes.filter(Boolean).length,
    anchors: document.querySelectorAll("a[href]").length,
    // Counted, not just `.every()` — an empty NodeList makes `every` vacuously
    // true, which is how a broken selector passes as a green test.
    coverParas: document.querySelectorAll(".pagedjs_page section.blues-cover p").length,
    coverCentred: Array.from(document.querySelectorAll(".pagedjs_page section.blues-cover p")).filter((el) => {
      const cs = getComputedStyle(el);
      // Both matter: base.css forces `text-align-last: left` on every p so the
      // last line of justified body text stays ragged, and every line of the
      // cover is a last line.
      return cs.textAlign === "center" && cs.textAlignLast === "center";
    }).length,
    subtitles: document.querySelectorAll(".pagedjs_page .chapter-subtitle").length,
    subtitleLeft: Array.from(document.querySelectorAll(".pagedjs_page .chapter-subtitle")).filter(
      (el) => getComputedStyle(el).textAlign === "left",
    ).length,
    // The SOP calls for ragged right and no hyphenation: justified rivers and
    // line-end hyphens both read as pencil strokes on a marked-up page.
    bodyParas: document.querySelectorAll(".pagedjs_page section.chapter p").length,
    bodyRagged: Array.from(document.querySelectorAll(".pagedjs_page section.chapter p")).filter((el) => {
      const cs = getComputedStyle(el);
      return cs.textAlign === "left" && cs.hyphens === "none";
    }).length,
    hyphenatedBreaks: document.querySelectorAll(".pagedjs_hyphen").length,
    coverPageIndex: pages.findIndex((pg) => pg.querySelector(".blues-cover")),
  };
});

check("3  every body page carries the running head", stamps.headsOnBody === stamps.total - 2, `${stamps.headsOnBody}/${stamps.total - 2}`);
check("   the cover carries no running head", !stamps.coverHasHead);
check("4  no right-hand margin box is ever inked", stamps.anyRightBoxInked === 0);
check("   no hyperlinks survive anywhere", stamps.anchors === 0, `${stamps.anchors} anchors`);

const seq = stamps.chapterSeq.filter((c): c is number => c !== null);
const monotonic = seq.every((c, i) => i === 0 || c >= seq[i - 1]);
check("3  chapter-per-page runs 1..N without going backwards", monotonic && seq[0] === 1 && seq[seq.length - 1] === fx.facts.chapters);
check("   cover and contents carry no chapter number", stamps.chapterSeq[0] === null && stamps.chapterSeq[1] === null);
check(
  "5  every cover line is centred (align AND align-last)",
  stamps.coverParas > 0 && stamps.coverCentred === stamps.coverParas,
  `${stamps.coverCentred}/${stamps.coverParas}`,
);
if (stamps.subtitles === 0) {
  skip("   chapter subtitles align with their titles", "this book has no chapter subtitles");
} else {
  check(
    "   chapter subtitles align with their titles",
    stamps.subtitleLeft === stamps.subtitles,
    `${stamps.subtitleLeft}/${stamps.subtitles}`,
  );
}
check(
  "   body text is ragged right with no hyphenation (SOP)",
  stamps.bodyParas > 0 && stamps.bodyRagged === stamps.bodyParas,
  `${stamps.bodyRagged}/${stamps.bodyParas}`,
);
check("   no words broken across lines", stamps.hyphenatedBreaks === 0, `${stamps.hyphenatedBreaks} hyphenated breaks`);
check("   the cover is page 1", stamps.coverPageIndex === 0);

// Feet and contents numbers, as stamped by the renderer itself.
const feet = await p.evaluate(() => {
  const pages = Array.from(document.querySelectorAll(".pagedjs_page"));
  const stampedFeet = pages.map((pg) => {
    const box = pg.querySelector(".pagedjs_margin-bottom-left .pagedjs_margin-content");
    return box ? box.getAttribute("data-foot") : null;
  });
  const tocNums = Array.from(document.querySelectorAll(".blues-toc-list li[data-toc-ch] .p")).map(
    (el) => (el.textContent ?? "").trim(),
  );
  return { stampedFeet, tocNums };
});

check("   the cover carries no running foot", feet.stampedFeet[0] === null, String(feet.stampedFeet[0]));
check("   the contents page has a foot", feet.stampedFeet[1] === "p 2", String(feet.stampedFeet[1]));
check("3  the foot reads 'Ch N · p N' on body pages", feet.stampedFeet[2] === "Ch 1 · p 3", String(feet.stampedFeet[2]));
check(
  "   every contents row carries a page number",
  feet.tocNums.length === fx.facts.chapters && feet.tocNums.every((n) => /^\d+$/.test(n)),
  `${feet.tocNums.filter((n) => n).length}/${fx.facts.chapters} filled`,
);
check("   contents page numbers ascend", feet.tocNums.every((n, i) => i === 0 || Number(n) >= Number(feet.tocNums[i - 1])));

await p.close();
await closeBrowser();

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`PDFs in ${outDir}`);
process.exit(fail === 0 ? 0 : 1);
