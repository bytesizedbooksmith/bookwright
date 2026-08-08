import { promises as fs } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import matter from "gray-matter";
import type {
  Book,
  BookMeta,
  FontDef,
  IngestResult,
  Section,
  SectionKind,
  StyleDef,
  ThemeName,
  Typography,
} from "./types.ts";
import { extractSubtitle, extractTitle, slugify, splitOnH1, uniqueId } from "./util.ts";
import { AppError } from "../errors.ts";

const THEMES: ThemeName[] = ["classic", "modern", "decorative"];

interface RawConfig {
  title?: string;
  subtitle?: string;
  author?: string;
  series?: string;
  series_index?: number | string;
  publisher?: string;
  language?: string;
  isbn?: string;
  description?: string;
  copyright?: string;
  rights?: string;
  cover?: string;
  theme?: string;
  frontmatter?: string[];
  chapters?: string;
  backmatter?: string[];
  exclude?: string[]; // glob patterns of markdown to keep out of the chapter list
  fonts?: Array<{ file: string; family: string; weight?: string | number; style?: string }>;
  styles?: Record<string, StyleDef>;
  typography?: Typography;
}

async function parseFonts(
  cfg: RawConfig,
  baseDir: string,
  warnings: { message: string }[],
): Promise<FontDef[]> {
  const fonts: FontDef[] = [];
  for (const f of cfg.fonts ?? []) {
    if (!f?.file || !f?.family) continue;
    const abs = path.resolve(baseDir, f.file);
    if (await exists(abs)) fonts.push({ file: abs, family: f.family, weight: f.weight, style: f.style });
    else warnings.push({ message: `Font file not found: ${f.file}` });
  }
  return fonts;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function normalizeMeta(cfg: RawConfig, overrides?: Partial<BookMeta>): BookMeta {
  const theme = (cfg.theme && THEMES.includes(cfg.theme as ThemeName) ? cfg.theme : "classic") as ThemeName;
  const meta: BookMeta = {
    title: cfg.title?.trim() || "Untitled",
    subtitle: cfg.subtitle?.trim() || undefined,
    author: cfg.author?.trim() || "Unknown Author",
    series: cfg.series?.trim() || undefined,
    series_index: cfg.series_index,
    publisher: cfg.publisher?.trim() || undefined,
    language: cfg.language?.trim() || "en",
    isbn: cfg.isbn ? String(cfg.isbn).trim() : undefined,
    description: cfg.description?.trim() || undefined,
    copyright: cfg.copyright?.trim() || undefined,
    rights: cfg.rights?.trim() || undefined,
    cover: cfg.cover?.trim() || undefined,
    theme,
  };
  // Overrides from the UI are applied BEFORE sections (title page, copyright)
  // are generated, so generated content reflects edited metadata.
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined && v !== null && v !== "") (meta as any)[k] = v;
    }
  }
  // A blank/zero "Book #" means no book number — so the title page reads
  // "A Gadding Goose Novella" rather than "… · Book 0". An explicitly cleared
  // field from the UI (key present but empty) also clears any stored value,
  // so the live preview reflects the empty field even before saving.
  const clearedIndex = overrides ? "series_index" in overrides && !overrides.series_index : false;
  meta.series_index = clearedIndex ? undefined : cleanSeriesIndex(meta.series_index);
  return meta;
}

/** Normalize a series index: blank, whitespace, or zero count as "no number". */
function cleanSeriesIndex(v: unknown): number | string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s === "" || s === "0") return undefined;
  return typeof v === "number" ? v : s;
}

function buildTitlePage(meta: BookMeta): string {
  const lines: string[] = [];
  if (meta.subtitle) lines.push(`<p class="tp-subtitle">${escapeHtml(meta.subtitle)}</p>`);
  lines.push(`<p class="tp-author">${escapeHtml(meta.author)}</p>`);
  if (meta.series) {
    const n = meta.series_index ? ` · Book ${meta.series_index}` : "";
    lines.push(`<p class="tp-series">${escapeHtml(meta.series)}${n}</p>`);
  }
  if (meta.publisher) lines.push(`<p class="tp-publisher">${escapeHtml(meta.publisher)}</p>`);
  return lines.join("\n\n");
}

// Keep the author's line structure: blank lines stay paragraph breaks, single
// newlines become hard breaks (Markdown soft breaks would collapse them to one
// run-on paragraph).
function preserveLines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.split(/\n/).join("  \n"))
    .join("\n\n");
}

function buildCopyright(meta: BookMeta): string {
  const parts: string[] = [];
  if (meta.copyright) parts.push(preserveLines(meta.copyright));
  else parts.push(`Copyright © ${meta.author}. All rights reserved.`);
  if (meta.publisher) parts.push(`Published by ${meta.publisher}`);
  if (meta.isbn) parts.push(`ISBN: ${meta.isbn}`);
  if (meta.rights && meta.rights !== meta.copyright) parts.push(meta.rights);
  return parts.join("\n\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sectionFromFile(
  filePath: string,
  kind: SectionKind,
  used: Set<string>,
  defaults: { toc: boolean; showTitle: boolean },
): Promise<Section> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  const fromBody = extractTitle(parsed.content);
  const title =
    (typeof fm.title === "string" && fm.title) || fromBody.title || path.basename(filePath, path.extname(filePath));
  const body = fromBody.title ? fromBody.body : parsed.content;
  // Chapter subtitle: an explicit `subtitle:` in frontmatter wins; otherwise a
  // leading "## …" line under the title. The leading H2 is stripped either way.
  const ex = extractSubtitle(body);
  const subtitle = (typeof fm.subtitle === "string" && fm.subtitle.trim()) || ex.subtitle || undefined;
  const id = uniqueId(slugify(title), used);
  return {
    id,
    title,
    subtitle,
    kind,
    className: typeof fm.class === "string" ? fm.class : slugify(title),
    toc: typeof fm.toc === "boolean" ? fm.toc : defaults.toc,
    showTitle: typeof fm.showTitle === "boolean" ? fm.showTitle : defaults.showTitle,
    markdown: ex.body.trim(),
  };
}

/**
 * Markdown files that must never be read as chapters. Many books set
 * `chapters: .`, which makes the book folder itself the chapters directory — so
 * any sidecar dropped beside the manuscript would silently become a chapter,
 * sort into place by filename, and ship inside the EPUB. Matched case-insensitively.
 */
const RESERVED_MARKDOWN = new Set([
  // Sidecars the toolchain itself writes next to a manuscript.
  "lineage.md",
  "readme.md",
  "notes.md",
  "changelog.md",
  "todo.md",
  // The front/back matter vocabulary (mirrors templates/matter/). A file named
  // after one of these is matter by any reading, never a chapter — and two live
  // books already had a loose copyright.md being swept in as a final chapter.
  "copyright.md",
  "dedication.md",
  "epigraph.md",
  "acknowledgments.md",
  "foreword.md",
  "preface.md",
  "about-the-author.md",
  "also-by.md",
  "newsletter.md",
  "sneak-peek.md",
]);

/**
 * Translate one `exclude:` glob (`*`, `?`, `**`) into an anchored regex.
 * Scanned character by character rather than by chained replaces: a sentinel
 * approach has to survive its own escaping pass, and gets that wrong quietly.
 */
function globToRegExp(glob: string): RegExp {
  const SPECIAL = /[.+^${}()|[\]\\]/;
  let body = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        body += ".*"; // ** crosses separators
        i++;
      } else {
        body += "[^/]*";
      }
    } else if (c === "?") {
      body += ".";
    } else {
      body += SPECIAL.test(c) ? `\\${c}` : c;
    }
  }
  return new RegExp(`^${body}$`, "i");
}

/**
 * Sidecars are excluded by NAME, never by content, so a genuinely-named chapter
 * can't be dropped: `_`/`.` prefixes, the reserved vocabulary above, and any
 * `exclude:` glob the book declares. Arbitrary names we can't know about are
 * handled by the outlier warning below rather than by guessing.
 */
function isChapterCandidate(name: string, excludes: RegExp[]): boolean {
  if (name.startsWith("_") || name.startsWith(".")) return false;
  if (RESERVED_MARKDOWN.has(name.toLowerCase())) return false;
  return !excludes.some((re) => re.test(name));
}

/**
 * The filename "shape" — digit runs collapsed to `#`, so `chapter-07.md` and
 * `chapter-21.md` share one key. Used only to spot the odd file out.
 */
function nameShape(name: string): string {
  return name.toLowerCase().replace(/\d+/g, "#");
}

/**
 * Files that survived the filters but don't match the folder's dominant naming
 * pattern. These are still ingested as chapters — we can't know they aren't —
 * but they get named in a warning, because silent inclusion is the failure that
 * ships to a store.
 */
function shapeOutliers(names: string[]): string[] {
  if (names.length < 3) return [];
  const counts = new Map<string, number>();
  for (const n of names) counts.set(nameShape(n), (counts.get(nameShape(n)) ?? 0) + 1);
  const [shape, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n / names.length < 0.6) return []; // no dominant convention — don't guess
  return names.filter((x) => nameShape(x) !== shape);
}

/**
 * Chapter files in a directory, plus the markdown deliberately skipped and the
 * files that look out of place. Callers surface both: silence here is how a
 * mis-named chapter vanishes, or a stray note ships as chapter 27.
 */
async function listMarkdown(
  dir: string,
  excludes: RegExp[] = [],
): Promise<{ files: string[]; skipped: string[]; outliers: string[] }> {
  const entries = await fs.readdir(dir);
  const markdown = entries.filter((e) => /\.(md|markdown)$/i.test(e));
  const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
  const kept = markdown.filter((e) => isChapterCandidate(e, excludes)).sort(byName);
  return {
    files: kept.map((e) => path.join(dir, e)),
    skipped: markdown.filter((e) => !isChapterCandidate(e, excludes)).sort(byName),
    outliers: shapeOutliers(kept),
  };
}

/** Surface skipped sidecars and odd-looking chapters on the ingest warnings. */
function warnChapterFiles(
  r: { skipped: string[]; outliers: string[] },
  warnings: { message: string }[],
): void {
  if (r.skipped.length) {
    warnings.push({
      message: `Skipped ${r.skipped.length} non-chapter file${r.skipped.length === 1 ? "" : "s"} in the chapters folder: ${r.skipped.join(", ")}`,
    });
  }
  if (r.outliers.length) {
    warnings.push({
      message:
        `Read as chapters but they don't match this folder's naming pattern: ${r.outliers.join(", ")}. ` +
        `If these aren't chapters, rename them with a leading "_" or add them to "exclude:" in book.yaml.`,
    });
  }
}

/** Load a book from a folder (with book.yaml) or a single markdown file. */
export async function loadBook(inputPath: string, overrides?: Partial<BookMeta>): Promise<IngestResult> {
  const warnings: { message: string }[] = [];
  const abs = path.resolve(inputPath);
  const dir = await isDir(abs);

  // ---- Single markdown file: split on H1 into chapters. ----
  if (!dir) {
    const raw = await fs.readFile(abs, "utf8");
    const parsed = matter(raw);
    const meta = normalizeMeta(parsed.data as RawConfig, overrides);
    if (meta.title === "Untitled" && typeof (parsed.data as RawConfig).title !== "string") {
      meta.title = path.basename(abs, path.extname(abs));
    }
    const used = new Set<string>();
    const chapters = splitOnH1(parsed.content);
    const sections: Section[] =
      chapters.length > 0
        ? chapters.map((c) => {
            const ex = extractSubtitle(c.body);
            return {
              id: uniqueId(slugify(c.title), used),
              title: c.title,
              subtitle: ex.subtitle,
              kind: "chapter" as const,
              toc: true,
              showTitle: true,
              markdown: ex.body,
            };
          })
        : [
            {
              id: "content",
              title: meta.title,
              kind: "chapter" as const,
              toc: true,
              showTitle: true,
              markdown: parsed.content.trim(),
            },
          ];
    return {
      book: { meta, sections, baseDir: path.dirname(abs), fonts: [], styles: {}, typography: {} },
      warnings,
    };
  }

  // ---- Folder. Prefer book.yaml; otherwise treat as a chapters folder. ----
  const cfgPath = (await exists(path.join(abs, "book.yaml")))
    ? path.join(abs, "book.yaml")
    : (await exists(path.join(abs, "book.yml")))
      ? path.join(abs, "book.yml")
      : null;

  if (!cfgPath) {
    const listing = await listMarkdown(abs);
    warnChapterFiles(listing, warnings);
    const files = listing.files;
    const used = new Set<string>();
    const sections: Section[] = [];
    for (const f of files) {
      sections.push(await sectionFromFile(f, "chapter", used, { toc: true, showTitle: true }));
    }
    const meta = normalizeMeta({ title: path.basename(abs) }, overrides);
    if (sections.length === 0) warnings.push({ message: `No markdown files found in ${abs}` });
    return { book: { meta, sections, baseDir: abs, fonts: [], styles: {}, typography: {} }, warnings };
  }

  let cfg: RawConfig;
  try {
    cfg = (yaml.load(await fs.readFile(cfgPath, "utf8")) as RawConfig) ?? {};
  } catch (e) {
    if ((e as Error).name === "YAMLException") {
      throw new AppError(
        "BAD_CONFIG",
        `Couldn't parse ${path.basename(cfgPath)} — it isn't valid YAML. Check the indentation and punctuation near the line it reports.`,
        { detail: (e as Error).message, cause: e },
      );
    }
    throw new AppError("IO_ERROR", `Couldn't read ${path.basename(cfgPath)}.`, {
      detail: (e as Error).message,
      cause: e,
    });
  }
  const meta = normalizeMeta(cfg, overrides);
  const used = new Set<string>();
  const sections: Section[] = [];

  // Front matter (in order).
  for (const entry of cfg.frontmatter ?? []) {
    if (entry === "titlepage") {
      sections.push({
        id: uniqueId("titlepage", used),
        title: meta.title,
        kind: "titlepage",
        className: "titlepage",
        toc: false,
        showTitle: true,
        markdown: buildTitlePage(meta),
        generated: true,
      });
    } else if (entry === "copyright") {
      sections.push({
        id: uniqueId("copyright", used),
        title: "Copyright",
        kind: "copyright",
        className: "copyright",
        toc: false,
        showTitle: false,
        markdown: buildCopyright(meta),
        generated: true,
      });
    } else {
      const fp = path.resolve(abs, entry);
      if (await exists(fp)) {
        sections.push(await sectionFromFile(fp, "frontmatter", used, { toc: false, showTitle: false }));
      } else {
        warnings.push({ message: `Front matter file not found: ${entry}` });
      }
    }
  }

  // Chapters: a folder of files, or a single file split on H1.
  const chaptersRef = cfg.chapters ? path.resolve(abs, cfg.chapters) : null;
  if (chaptersRef && (await exists(chaptersRef))) {
    if (await isDir(chaptersRef)) {
      const listing = await listMarkdown(chaptersRef, (cfg.exclude ?? []).map(globToRegExp));
      warnChapterFiles(listing, warnings);
      for (const f of listing.files) {
        sections.push(await sectionFromFile(f, "chapter", used, { toc: true, showTitle: true }));
      }
    } else {
      const raw = await fs.readFile(chaptersRef, "utf8");
      for (const c of splitOnH1(matter(raw).content)) {
        const ex = extractSubtitle(c.body);
        sections.push({
          id: uniqueId(slugify(c.title), used),
          title: c.title,
          subtitle: ex.subtitle,
          kind: "chapter",
          toc: true,
          showTitle: true,
          markdown: ex.body,
        });
      }
    }
  } else if (cfg.chapters) {
    warnings.push({ message: `Chapters path not found: ${cfg.chapters}` });
  }

  // Back matter (in order).
  for (const entry of cfg.backmatter ?? []) {
    const fp = path.resolve(abs, entry);
    if (await exists(fp)) {
      sections.push(await sectionFromFile(fp, "backmatter", used, { toc: true, showTitle: true }));
    } else {
      warnings.push({ message: `Back matter file not found: ${entry}` });
    }
  }

  const book: Book = {
    meta,
    sections,
    baseDir: abs,
    fonts: await parseFonts(cfg, abs, warnings),
    styles: cfg.styles ?? {},
    typography: cfg.typography ?? {},
  };
  if (meta.cover) {
    const coverAbs = path.resolve(abs, meta.cover);
    if (await exists(coverAbs)) book.coverPath = coverAbs;
    else warnings.push({ message: `Cover image not found: ${meta.cover}` });
  }

  return { book, warnings };
}
