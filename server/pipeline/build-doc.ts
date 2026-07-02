import type { Book, Section } from "./types.ts";
import { getTheme } from "./themes.ts";

export type Target = "html" | "epub" | "docx" | "print";

/** Build the Pandoc header attribute string for a section, e.g. {#id .chapter .unlisted}. */
function headerAttr(section: Section): string {
  const classes: string[] = [section.kind];
  if (section.className && section.className !== section.kind) classes.push(section.className);
  if (!section.showTitle) classes.push("hide-title");
  if (!section.toc) classes.push("unlisted", "unnumbered");
  // Static hook (EPUB-safe, unlike :has()) so themes can restyle a title that has
  // a subtitle beneath it — e.g. Decorative moves its ornament below the subtitle.
  if (section.subtitle && section.showTitle) classes.push("has-subtitle");
  const classStr = classes.map((c) => `.${c}`).join(" ");
  return `{#${section.id} ${classStr}}`;
}

/**
 * Assemble all sections into a single Markdown document. Each section becomes a
 * top-level "# Title {attrs}" so Pandoc can split chapters and apply section divs.
 *
 * For EPUB we use our own title page (which includes the series line and matches
 * the preview) and suppress Pandoc's auto title page via --epub-title-page=false
 * in render-epub.ts.
 */
export function assembleMarkdown(book: Book, _target: Target): string {
  const parts: string[] = [];
  for (const section of book.sections) {
    parts.push(`# ${section.title} ${headerAttr(section)}`);
    parts.push("");
    // Chapter subtitle: a fenced div right under the title (before the body, so
    // the drop-cap filter still lands on the first body paragraph, not this).
    // A native div (not raw HTML) so the text survives EPUB and DOCX.
    if (section.subtitle && section.showTitle) {
      parts.push(`::: chapter-subtitle`);
      parts.push(section.subtitle);
      parts.push(`:::`);
      parts.push("");
    }
    if (section.markdown.trim()) parts.push(section.markdown.trim());
    parts.push("");
  }
  return parts.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const isCopyrightSection = (s: Section) =>
  s.kind === "copyright" || s.className === "copyright" || /^copyright$/i.test(s.title.trim());

/**
 * A printed table of contents section. Each entry links to a section anchor; the
 * page numbers are filled in from the real layout after Paged.js paginates (see
 * render-print.ts). Lists the sections flagged for the TOC, like the EPUB nav.
 */
function buildTocSection(book: Book): Section | null {
  const entries = book.sections.filter((s) => s.toc);
  if (entries.length === 0) return null;
  const items = entries
    .map((s) => `<li class="toc-entry"><a href="#${s.id}"><span class="toc-t">${escapeHtml(s.title)}</span></a></li>`)
    .join("\n");
  return {
    id: "toc-print",
    title: "Contents",
    kind: "frontmatter",
    className: "toc",
    toc: false,
    showTitle: true,
    generated: true,
    markdown: `<nav class="toc-print" role="doc-toc">\n<ol class="toc-list">\n${items}\n</ol>\n</nav>`,
  };
}

/**
 * Return a copy of the book with a printed Table of Contents inserted right after
 * the copyright page (falling back to just before the first chapter). Used only for
 * the paginated print PDF/preview — the reflowable reading PDF and EPUB don't get it.
 */
export function insertPrintToc(book: Book): Book {
  const toc = buildTocSection(book);
  if (!toc) return book;
  const sections = [...book.sections];
  const copyrightIdx = sections.findIndex(isCopyrightSection);
  let at: number;
  if (copyrightIdx >= 0) at = copyrightIdx + 1;
  else {
    const firstChapter = sections.findIndex((s) => s.kind === "chapter");
    at = firstChapter >= 0 ? firstChapter : sections.length;
  }
  sections.splice(at, 0, toc);
  return { ...book, sections };
}

/** A clean, attribute-free compiled Markdown export for reuse elsewhere. */
export function assembleCleanMarkdown(book: Book): string {
  const parts: string[] = [];
  for (const section of book.sections) {
    if (section.kind === "titlepage") {
      const m = book.meta;
      parts.push(`# ${m.title}`);
      if (m.subtitle) parts.push(`\n*${m.subtitle}*`);
      parts.push(`\n${m.author}`);
      if (m.series) parts.push(`\n${m.series}${m.series_index ? ` · Book ${m.series_index}` : ""}`);
      parts.push("\n");
      continue;
    }
    parts.push(`# ${section.title}`);
    if (section.subtitle) parts.push(`\n## ${section.subtitle}`);
    parts.push("");
    if (section.markdown.trim()) parts.push(section.markdown.trim());
    parts.push("");
  }
  return parts.join("\n");
}

/** Build the Pandoc metadata object (dumped to a YAML file passed with --metadata-file). */
export function buildPandocMeta(book: Book, target: Target = "html"): Record<string, unknown> {
  const m = book.meta;
  const theme = getTheme(m.theme);
  const ty = book.typography ?? {};
  // Subtitle carries into export metadata per format:
  //  - EPUB: structured `title` list → OPF `dc:title` refinements (main/subtitle),
  //    the EPUB 3 convention. Our own title page still shows it (title-page suppressed).
  //  - DOCX: a `subtitle` field → Pandoc renders a Subtitle-styled line in the title block.
  //  - HTML/print: plain string title (keeps <title> clean); our generated title
  //    page already renders the subtitle line, so nothing else is needed.
  const meta: Record<string, unknown> = {
    title:
      target === "epub" && m.subtitle
        ? [
            { type: "main", text: m.title },
            { type: "subtitle", text: m.subtitle },
          ]
        : m.title,
    author: [m.author],
    lang: m.language,
    // filter inputs — typography may override the theme's defaults
    scene_ornament: ty.sceneOrnament || theme.sceneOrnament,
    dropcap: (ty.dropcap ?? theme.dropcap) ? "true" : "false",
  };
  if (target === "docx" && m.subtitle) meta.subtitle = m.subtitle;
  if (m.publisher) meta.publisher = m.publisher;
  if (m.description) meta.description = m.description;
  // NB: `rights` is intentionally NOT set here. Pandoc's EPUB writer renders it
  // onto the auto-generated title page, which duplicates the dedicated copyright
  // page. For EPUB it's injected into the OPF via --epub-metadata instead
  // (see render-epub.ts / epubRightsMeta). Our own title page never shows it.
  if (m.isbn) {
    meta.identifier = [{ scheme: "ISBN", text: m.isbn }];
  }
  return meta;
}
