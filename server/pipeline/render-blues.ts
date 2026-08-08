import path from "node:path";
import { promises as fs } from "node:fs";
import type { Page } from "puppeteer";
import type { Book, Section } from "./types.ts";
import { renderHtml } from "./render-html.ts";
import { getBrowser } from "./render-pdf.ts";
import { ROOT, THEMES_DIR } from "./paths.ts";
import { buildBluesPageCss, runningHead, type BluesOptions } from "../blues.ts";
import { countWords } from "../versioning.ts";

const POLYFILL = path.join(ROOT, "node_modules", "pagedjs", "dist", "paged.polyfill.min.js");
const BLUES_BASE = path.join(THEMES_DIR, "blues-base.css");

declare global {
  interface Window {
    PagedConfig?: { auto: boolean };
    PagedPolyfill?: { preview: () => Promise<unknown> };
  }
}

export interface BluesMeta {
  pages: number; // pages in the finished PDF
  totalPages: number; // pages the full book would have run to
  chapters: number; // chapters included
  totalChapters: number;
  firstChapter: number;
  lastChapter: number;
  words: number;
  truncated: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The generated cover. Everything on it is derived; nothing is typed by hand. */
function coverSection(book: Book, opts: BluesOptions, chapters: Section[], words: number): Section {
  const m = book.meta;
  const src = opts.sourceLabel ?? book.baseDir.replace(/\\/g, "/");
  const rounds = `round ${opts.round} of ${opts.maxRounds}`;
  return {
    id: "blues-cover",
    title: m.title,
    kind: "frontmatter",
    className: "blues-cover",
    toc: false,
    showTitle: false,
    generated: true,
    markdown:
      `<p class="blues-cover-title">${escapeHtml(m.title)}</p>\n` +
      `<p class="blues-cover-author">${escapeHtml(m.author)}</p>\n` +
      `<p class="blues-cover-stamp">BLUES v${opts.version}</p>\n` +
      `<p class="blues-cover-date">${escapeHtml(opts.date)}</p>\n` +
      `<p class="blues-cover-facts">` +
      `${chapters.length} chapters · ${words.toLocaleString("en-US")} words<br>` +
      `<span class="src">source: ${escapeHtml(src)}</span><br>` +
      // The page range isn't known until the book is paginated; it's stamped in
      // after the fact, which is why this span is left empty here.
      `${rounds}<span class="blues-range"></span>` +
      `</p>`,
  };
}

/** Chapter number, title, page. Orientation only — no anchors, so no PDF links. */
function tocSection(chapters: Section[], firstChapter: number): Section {
  const items = chapters
    .map((s, i) => {
      const n = firstChapter + i;
      return (
        // NB: data-toc-ch, not data-ch — the body uses data-ch to work out which
        // chapter a page starts in, and a contents row would otherwise make the
        // contents page claim to be inside chapter 1.
        `<li data-toc-ch="${n}"><span class="n">${n}</span>` +
        `<span class="t">${escapeHtml(s.subtitle || s.title)}</span>` +
        `<span class="p"></span></li>`
      );
    })
    .join("\n");
  return {
    id: "blues-toc",
    title: "Contents",
    kind: "frontmatter",
    className: "blues-toc",
    toc: false,
    showTitle: true,
    generated: true,
    markdown: `<ol class="blues-toc-list">\n${items}\n</ol>`,
  };
}

/**
 * Reduce a book to what a blues contains: chapters only, preceded by a generated
 * cover and contents page. Front and back matter are dropped — none of it gets
 * revised on the iPad — and the typography overrides kill drop caps and the
 * theme's scene ornament, both of which compete with handwriting.
 */
export function buildBluesBook(book: Book, opts: BluesOptions): { book: Book; chapters: Section[]; words: number } {
  const all = book.sections.filter((s) => s.kind === "chapter");
  const from = opts.chapters?.from ?? 1;
  const to = opts.chapters?.to ?? all.length;
  const chapters = all.slice(from - 1, to);
  const words = countWords(chapters);

  return {
    book: {
      ...book,
      sections: [coverSection(book, opts, chapters, words), tocSection(chapters, from), ...chapters],
      typography: { ...book.typography, dropcap: false, sceneOrnament: "* * *" },
    },
    chapters,
    words,
  };
}

/**
 * Paginate and stamp. The running head is static CSS, but everything per-page —
 * the "Ch N · p N" foot, the contents page numbers, the cover's page range — is
 * only knowable after Paged.js has laid the book out, so it's written into the
 * DOM afterwards. Same approach render-print.ts uses for its folios, which is the
 * proven path here: Paged.js's own counter machinery is unreliable across pages.
 */
interface PaginateResult {
  pages: number; // pages kept
  totalPages: number; // pages before any --pages trim
  lastChapter: number | null; // last chapter kept, when trimmed
}

export async function paginate(page: Page, maxPages: number | undefined): Promise<PaginateResult> {
  // Tag every chapter's content BEFORE pagination so the attribute survives onto
  // each fragment when Paged.js splits a chapter across pages.
  await page.evaluate(() => {
    document.querySelectorAll("section.chapter").forEach((sec, i) => {
      sec.setAttribute("data-ch", String(i + 1));
      sec.querySelectorAll("*").forEach((el) => el.setAttribute("data-ch", String(i + 1)));
    });
    // No hyperlinks of any kind: unwrap anchors, keeping their text.
    document.querySelectorAll("a").forEach((a) => {
      a.replaceWith(...Array.from(a.childNodes));
    });
  });

  await page.evaluate(() => {
    window.PagedConfig = { auto: false };
  });
  await page.addScriptTag({ path: POLYFILL });
  await page.evaluate(async () => {
    await window.PagedPolyfill!.preview();
  });
  await new Promise((r) => setTimeout(r, 200));

  // NB: no named functions inside page.evaluate — esbuild (via tsx) rewrites them
  // to reference a __name helper that doesn't exist in the browser. Only anonymous
  // callbacks passed straight to map/forEach. Same trap as render-print.ts.
  return page.evaluate((cap) => {
    const pages = Array.from(document.querySelectorAll(".pagedjs_page"));
    const totalPages = pages.length;

    // The chapter each page STARTS in — the first tagged element on it. That is
    // what the author says out loud, so it must be the chapter she's reading at
    // the top of the page, not whichever one happens to begin lower down.
    const chapterNums = pages.map((p) => {
      const v = p.querySelector("[data-ch]")?.getAttribute("data-ch");
      return v ? parseInt(v, 10) : null;
    });

    let keep = totalPages;
    let lastChapter: number | null = null;
    if (cap && cap > 0) {
      // Last page belonging to each chapter, so we can cut on a boundary.
      const lastPageOf = new Map<number, number>();
      chapterNums.forEach((c, i) => {
        if (c !== null) lastPageOf.set(c, i + 1);
      });
      let chosen: number | null = null;
      for (const [c, lastPage] of [...lastPageOf.entries()].sort((a, b) => a[0] - b[0])) {
        if (lastPage <= cap) chosen = c;
        else break;
      }
      if (chosen !== null) {
        keep = lastPageOf.get(chosen)!;
        lastChapter = chosen;
      }
      // If not even chapter 1 fits, keep it whole rather than cut mid-chapter.
      if (chosen === null && lastPageOf.size) {
        const first = [...lastPageOf.entries()].sort((a, b) => a[0] - b[0])[0];
        keep = first[1];
        lastChapter = first[0];
      }
    }

    if (keep < totalPages) {
      pages.slice(keep).forEach((p) => p.remove());
      // Contents lists only what's in the file.
      document.querySelectorAll(".blues-toc-list li[data-toc-ch]").forEach((li) => {
        if (parseInt(li.getAttribute("data-toc-ch")!, 10) > (lastChapter ?? 0)) li.remove();
      });
      document.querySelectorAll(".blues-toc-list").forEach((ol) => {
        if (!ol.querySelector("li")) ol.closest(".pagedjs_page")?.remove();
      });
    }

    const live = Array.from(document.querySelectorAll(".pagedjs_page"));
    const liveChapters = live.map((p) => {
      const v = p.querySelector("[data-ch]")?.getAttribute("data-ch");
      return v ? parseInt(v, 10) : null;
    });

    // Stamp the running foot. Paged.js renders margin-box content through ::after,
    // so an attribute plus one rule replaces it.
    const style = document.createElement("style");
    style.textContent =
      ".pagedjs_margin-bottom-left .pagedjs_margin-content[data-foot]::after{content:attr(data-foot) !important;}";
    document.head.appendChild(style);

    live.forEach((p, i) => {
      // The cover carries no head and no foot. @page bluescover clears the
      // generated content, but Paged.js still builds the empty margin box, so
      // stamping it here would put the folio back on the one page that must
      // not have one.
      if (p.querySelector(".blues-cover")) return;
      // Printed number == physical PDF page, so the page the author names aloud
      // always matches what the iPad's own page indicator shows.
      const folio = i + 1;
      const c = liveChapters[i];
      const box = p.querySelector(".pagedjs_margin-bottom-left .pagedjs_margin-content");
      if (!box) return;
      box.setAttribute("data-foot", c === null ? `p ${folio}` : `Ch ${c} · p ${folio}`);
    });

    // Contents page numbers, from the real layout.
    const firstPageOf = new Map<number, number>();
    liveChapters.forEach((c, i) => {
      if (c !== null && !firstPageOf.has(c)) firstPageOf.set(c, i + 1);
    });
    document.querySelectorAll(".blues-toc-list li[data-toc-ch]").forEach((li) => {
      const c = parseInt(li.getAttribute("data-toc-ch")!, 10);
      const span = li.querySelector(".p");
      if (span && firstPageOf.has(c)) span.textContent = String(firstPageOf.get(c));
    });

    return { pages: live.length, totalPages, lastChapter };
  }, maxPages);
}

/** Render the blues PDF. */
export async function renderBlues(book: Book, opts: BluesOptions): Promise<{ buffer: Buffer; meta: BluesMeta }> {
  const { book: bluesBook, chapters, words } = buildBluesBook(book, opts);
  const totalChapters = book.sections.filter((s) => s.kind === "chapter").length;
  const from = opts.chapters?.from ?? 1;

  const baseHtml = await renderHtml(bluesBook, "print");
  const bluesCss = await fs.readFile(BLUES_BASE, "utf8");
  const pageCss = buildBluesPageCss(book.meta.title, book.meta.author, opts);

  // The @page size must be in the document before Paged.js initialises or it
  // falls back to US Letter portrait with default margins.
  const styleTag = `<style id="book-formatter-blues">\n${bluesCss}\n${pageCss}\n</style>`;
  const html = baseHtml.includes("</head>")
    ? baseHtml.replace("</head>", `${styleTag}\n</head>`)
    : `${styleTag}\n${baseHtml}`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const r = await paginate(page, opts.maxPages);

    const truncated = r.pages < r.totalPages;
    const lastChapter = truncated && r.lastChapter !== null ? from + r.lastChapter - 1 : from + chapters.length - 1;

    // The cover advertises the range, which is only knowable now.
    await page.evaluate(
      (shown, total, isTrunc) => {
        const el = document.querySelector(".blues-range");
        if (el) el.textContent = isTrunc ? ` · pages 1–${shown} of ~${total}` : "";
      },
      r.pages,
      r.totalPages,
      truncated,
    );

    const buffer = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    return {
      buffer,
      meta: {
        pages: r.pages,
        totalPages: r.totalPages,
        chapters: truncated && r.lastChapter !== null ? r.lastChapter : chapters.length,
        totalChapters,
        firstChapter: from,
        lastChapter,
        words,
        truncated,
      },
    };
  } finally {
    await page.close();
  }
}

export { runningHead };
