import type { BookMeta } from "./pipeline/types.ts";

export interface Trim {
  key: string;
  label: string;
  w: number; // inches
  h: number;
}

export const TRIMS: Trim[] = [
  { key: "5x8", label: "5 × 8 in", w: 5, h: 8 },
  { key: "5.25x8", label: "5.25 × 8 in", w: 5.25, h: 8 },
  { key: "5.5x8.5", label: "5.5 × 8.5 in", w: 5.5, h: 8.5 },
  { key: "6x9", label: "6 × 9 in", w: 6, h: 9 },
  { key: "8.5x11", label: "8.5 × 11 in (Letter)", w: 8.5, h: 11 },
];

type HeadContent = "none" | "author" | "title" | "chapter";
type FolioPos = "bottom-center" | "top-outer" | "none";

export interface PrintLayout {
  key: string;
  label: string;
  verso: HeadContent; // left page running head
  recto: HeadContent; // right page running head
  folio: FolioPos; // page-number position
}

export const LAYOUTS: PrintLayout[] = [
  { key: "author-title-bottom", label: "Author / Title · number at bottom", verso: "author", recto: "title", folio: "bottom-center" },
  { key: "author-title-top", label: "Author / Title · number at top", verso: "author", recto: "title", folio: "top-outer" },
  { key: "title-chapter-bottom", label: "Title / Chapter · number at bottom", verso: "title", recto: "chapter", folio: "bottom-center" },
  { key: "title-chapter-top", label: "Title / Chapter · number at top", verso: "title", recto: "chapter", folio: "top-outer" },
  { key: "folio-bottom", label: "Page number only · bottom center", verso: "none", recto: "none", folio: "bottom-center" },
  { key: "folio-top", label: "Page number only · top outer", verso: "none", recto: "none", folio: "top-outer" },
];

export function getLayout(key: string): PrintLayout {
  return LAYOUTS.find((l) => l.key === key) ?? LAYOUTS[0];
}

export interface PrintOptions {
  trim: string;
  binding: "paperback" | "hardcover";
  startChaptersRecto: boolean;
  layout: string;
  gutter?: number; // manual inner-margin override (inches); omit for auto
}

// Calibrated against a real 290k-character / 26-chapter novel → 197 pages at 5.5×8.5in.
const CHARS_PER_SQIN = 53; // chars per square inch on a *full* text page

/** Approx. text-area square inches for a trim (using representative margins). */
function textAreaSqIn(trim: string): number {
  const t = getTrim(trim);
  return Math.max(1, t.w - 1.2) * Math.max(1, t.h - 1.4);
}

/**
 * Estimate the printed page count from the body character count, plus per-section
 * overhead (each section opens a fresh page and usually ends mid-page). Used to
 * seed the gutter and show a live figure; the real count comes from pagination.
 */
export function estimatePages(bodyChars: number, trim: string, chapters = 0, otherSections = 0): number {
  const textPages = bodyChars > 0 ? bodyChars / (CHARS_PER_SQIN * textAreaSqIn(trim)) : 0;
  const overhead = chapters * 0.6 + otherSections;
  return Math.max(1, Math.round(textPages + overhead));
}

/**
 * KDP-safe inner (gutter) margin for a given page count: the KDP minimum for the
 * page-count band plus a comfort margin, with extra for hardcover case binding.
 */
export function autoGutter(pages: number, binding: "paperback" | "hardcover"): number {
  const kdpMin = pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875;
  let g = kdpMin + 0.125;
  if (binding === "hardcover") g += 0.125;
  return Math.round(g * 1000) / 1000;
}

export const DEFAULT_PRINT: PrintOptions = {
  trim: "6x9",
  binding: "paperback",
  startChaptersRecto: true,
  layout: "author-title-bottom",
};

export function getTrim(key: string): Trim {
  return TRIMS.find((t) => t.key === key) ?? TRIMS[3];
}

interface Margins {
  top: number;
  bottom: number;
  outer: number;
  inner: number; // binding (gutter) side — larger
}

function margins(gutter: number): Margins {
  return { top: 0.7, bottom: 0.7, outer: 0.55, inner: gutter };
}

function cssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

const FONT = 'font-family: Georgia, "Times New Roman", serif; font-size: 9.5pt; color: #444;';

/** Clear every margin box (no running head, no folio) — for cover/front/back pages. */
const BLANK_MARGINS =
  "@top-left { content: none; } @top-center { content: none; } @top-right { content: none; } " +
  "@bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; }";

function headValue(kind: HeadContent, author: string, title: string): string | null {
  if (kind === "author") return `"${author}"`;
  if (kind === "title") return `"${title}"`;
  if (kind === "chapter") return "string(chaptitle)";
  return null;
}

/**
 * Build the dynamic @page CSS: trim size, mirrored margins, and the chosen
 * running-head / page-number layout. Running heads sit top-center; page numbers
 * sit either bottom-center or in the top outer corner.
 */
export function buildPageCss(meta: BookMeta, opts: PrintOptions, gutter: number): string {
  const t = getTrim(opts.trim);
  const m = margins(gutter);
  const author = cssString(meta.author);
  const title = cssString(meta.title);
  const layout = getLayout(opts.layout);

  const verso = headValue(layout.verso, author, title);
  const recto = headValue(layout.recto, author, title);
  const needChapter = layout.verso === "chapter" || layout.recto === "chapter";

  const folioBottom = layout.folio === "bottom-center" ? `@bottom-center { content: counter(page); ${FONT} }` : "";
  const folioTopLeft = layout.folio === "top-outer" ? `@top-left { content: counter(page); ${FONT} }` : "";
  const folioTopRight = layout.folio === "top-outer" ? `@top-right { content: counter(page); ${FONT} }` : "";

  const head = (content: string | null, italic: boolean) =>
    content ? `@top-center { content: ${content}; ${FONT} ${italic ? "font-style: italic;" : "letter-spacing: .03em;"} }` : "";

  return `
@page {
  size: ${t.w}in ${t.h}in;
  margin: ${m.top}in ${m.outer}in ${m.bottom}in ${m.inner}in;
  ${folioBottom}
}
@page :left {
  margin: ${m.top}in ${m.inner}in ${m.bottom}in ${m.outer}in;
  ${head(verso, false)}
  ${folioBottom}
  ${folioTopLeft}
}
@page :right {
  margin: ${m.top}in ${m.outer}in ${m.bottom}in ${m.inner}in;
  ${head(recto, true)}
  ${folioBottom}
  ${folioTopRight}
}

/* Title/copyright: no running head or folio. */
@page cover {
  margin: ${m.top}in ${m.outer}in ${m.bottom}in ${m.outer}in;
  @top-left { content: none; } @top-center { content: none; } @top-right { content: none; }
  @bottom-center { content: none; } @bottom-left { content: none; } @bottom-right { content: none; }
}
@page cover:left  { @top-left { content: none; } @top-center { content: none; } @top-right { content: none; } @bottom-center { content: none; } }
@page cover:right { @top-left { content: none; } @top-center { content: none; } @top-right { content: none; } @bottom-center { content: none; } }

/* Front & back matter: no running head AND no page number (folio).
   NB: @page rules can't be comma-grouped, so each is written out. */
@page front  { ${BLANK_MARGINS} }
@page front:left  { ${BLANK_MARGINS} }
@page front:right { ${BLANK_MARGINS} }
@page back  { ${BLANK_MARGINS} }
@page back:left  { ${BLANK_MARGINS} }
@page back:right { ${BLANK_MARGINS} }
/* Auto-inserted blank pages (e.g. before a recto chapter start) stay truly blank. */
@page :blank { ${BLANK_MARGINS} }
/* Chapter-opening pages: no header (keeps openings clean); folio stays. */
@page chapter:first { @top-left { content: none; } @top-center { content: none; } @top-right { content: none; } }

${needChapter ? "section.chapter > h1 { string-set: chaptitle content(text); }" : ""}

section.titlepage, section.copyright { page: cover; }
section.frontmatter, section.toc { page: front; }
section.backmatter { page: back; }
section.chapter { page: chapter; break-before: ${opts.startChaptersRecto ? "right" : "page"}; }
`;
}
