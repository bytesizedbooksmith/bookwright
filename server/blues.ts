// Blues export — a markup PDF for reading and hand-annotation on an iPad.
//
// Deliberately NOT a ThemeName. `blues` is a render mode like print, not a book
// theme: adding it to ThemeName would offer it in the theme picker and accept it
// in book.yaml, where it means nothing. The book keeps its real theme; this layer
// sits on top for one export.
//
// Two goals govern every choice here, per the build spec:
//   1. Room to write — a wide, permanently blank right margin.
//   2. Sayable location — every page announces its chapter and page number,
//      because the author reads notes aloud into a transcript.

export interface BluesOptions {
  version: number; // source version (from version.json)
  date: string; // YYYY-MM-DD stamped on the cover and running head
  round: number; // blues round
  maxRounds: number;
  sourceLabel?: string; // shown on the cover, e.g. Books/Author/Series/Bk-1_The-Book
  chapters?: { from: number; to: number }; // 1-based inclusive chapter range
  maxPages?: number; // stop after ~N pages, never mid-chapter
}

/** Page geometry, in inches. The right margin is the whole point of the format. */
export const PAGE = {
  width: 8.5,
  height: 11,
  top: 0.75,
  bottom: 0.75,
  left: 0.9,
  /** The writing gutter. Nothing renders here — no folio, no notes, no ornaments. */
  right: 2.5,
} as const;

/** Width of the text column — everything must stay inside this. */
export const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right; // 5.1in

const RULE = "font-family: Georgia, 'Times New Roman', serif; font-size: 9pt; color: #777;";

function cssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

/** The running head text: what version of what book, on every page. */
export function runningHead(title: string, author: string, opts: BluesOptions): string {
  return `${title} · ${author} · BLUES v${opts.version} · ${opts.date}`;
}

/**
 * The dynamic @page CSS. The running head is static per book so it can be a plain
 * `content:` string; the foot is per-page ("Ch 4 · p 61") and is filled from the
 * DOM after pagination — see render-blues.ts.
 *
 * Every margin box other than the two on the left is explicitly cleared. The
 * right-hand boxes sit inside the 2.5in gutter, so leaving them to default would
 * put ink exactly where the spec forbids it.
 */
export function buildBluesPageCss(title: string, author: string, opts: BluesOptions): string {
  const head = cssString(runningHead(title, author, opts));
  const clearRight =
    "@top-center { content: none; } @top-right { content: none; } " +
    "@top-right-corner { content: none; } @top-left-corner { content: none; } " +
    "@bottom-center { content: none; } @bottom-right { content: none; } " +
    "@bottom-right-corner { content: none; } @bottom-left-corner { content: none; }";
  // Blank every box — used by the cover, which carries no head or foot.
  const clearAll = `@top-left { content: none; } @bottom-left { content: none; } ${clearRight}`;

  return `
@page {
  size: ${PAGE.width}in ${PAGE.height}in;
  margin: ${PAGE.top}in ${PAGE.right}in ${PAGE.bottom}in ${PAGE.left}in;
  @top-left { content: "${head}"; ${RULE} }
  /* Created empty so the box exists; the text is stamped in post-pagination. */
  @bottom-left { content: " "; ${RULE} }
  ${clearRight}
}

/* Cover page: no running head, no foot, nothing but the generated block. */
@page bluescover { ${clearAll} }
@page bluescover:left { ${clearAll} }
@page bluescover:right { ${clearAll} }
/* Any blank page Paged.js inserts stays genuinely blank. */
@page :blank { ${clearAll} }

section.blues-cover { page: bluescover; }
section.blues-toc { page: bluestoc; break-before: page; }
section.chapter { page: chapter; break-before: page; }
`;
}
