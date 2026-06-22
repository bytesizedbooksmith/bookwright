import path from "node:path";
import { promises as fs } from "node:fs";
import yaml from "js-yaml";
import { MATTER_TEMPLATES_DIR } from "./pipeline/paths.ts";
import type { BookMeta } from "./pipeline/types.ts";

export type Placement = "frontmatter" | "backmatter";

export interface MatterType {
  key: string;
  label: string;
  placement: Placement; // suggested default
  file: string; // template filename
}

export const MATTER_TYPES: MatterType[] = [
  { key: "copyright", label: "Copyright", placement: "frontmatter", file: "copyright.md" },
  { key: "dedication", label: "Dedication", placement: "frontmatter", file: "dedication.md" },
  { key: "epigraph", label: "Epigraph", placement: "frontmatter", file: "epigraph.md" },
  { key: "foreword", label: "Foreword", placement: "frontmatter", file: "foreword.md" },
  { key: "preface", label: "Preface", placement: "frontmatter", file: "preface.md" },
  { key: "acknowledgments", label: "Acknowledgments", placement: "backmatter", file: "acknowledgments.md" },
  { key: "about-the-author", label: "About the Author", placement: "backmatter", file: "about-the-author.md" },
  { key: "also-by", label: "Also By", placement: "backmatter", file: "also-by.md" },
  { key: "newsletter", label: "Newsletter", placement: "backmatter", file: "newsletter.md" },
  { key: "sneak-peek", label: "Sneak Peek", placement: "backmatter", file: "sneak-peek.md" },
];

interface RawConfig {
  [k: string]: unknown;
  frontmatter?: string[];
  backmatter?: string[];
  chapters?: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
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

function configPath(bookDir: string): string {
  return path.join(bookDir, "book.yaml");
}

async function findConfig(bookDir: string): Promise<string | null> {
  for (const n of ["book.yaml", "book.yml"]) {
    if (await exists(path.join(bookDir, n))) return path.join(bookDir, n);
  }
  return null;
}

export async function readConfig(bookDir: string): Promise<RawConfig | null> {
  const p = await findConfig(bookDir);
  if (!p) return null;
  return (yaml.load(await fs.readFile(p, "utf8")) as RawConfig) ?? {};
}

async function writeConfig(bookDir: string, cfg: RawConfig): Promise<void> {
  const p = (await findConfig(bookDir)) ?? configPath(bookDir);
  const header =
    "# EPUB Maker book configuration. Edit freely — this controls metadata,\n" +
    "# theme, and the order of front matter, chapters, and back matter.\n";
  await fs.writeFile(p, header + yaml.dump(cfg, { lineWidth: 100 }), "utf8");
}

async function detectCover(bookDir: string): Promise<string | undefined> {
  for (const n of ["cover.png", "cover.jpg", "cover.jpeg"]) {
    if (await exists(path.join(bookDir, n))) return n;
  }
  return undefined;
}

async function detectChapters(bookDir: string): Promise<string> {
  if (await isDir(path.join(bookDir, "chapters"))) return "chapters";
  return "."; // top-level .md files are the chapters
}

/**
 * Ensure a book.yaml exists, seeding from the current metadata if it doesn't.
 * Returns the loaded/created config.
 */
export async function ensureConfig(bookDir: string, meta: BookMeta): Promise<RawConfig> {
  const existing = await readConfig(bookDir);
  if (existing) return existing;

  const cfg: RawConfig = {
    title: meta.title,
    author: meta.author,
    language: meta.language,
    theme: meta.theme,
    frontmatter: ["titlepage", "copyright"],
    chapters: await detectChapters(bookDir),
    backmatter: [],
  };
  if (meta.subtitle) cfg.subtitle = meta.subtitle;
  if (meta.series) cfg.series = meta.series;
  if (meta.series_index !== undefined) cfg.series_index = meta.series_index;
  if (meta.publisher) cfg.publisher = meta.publisher;
  if (meta.isbn) cfg.isbn = meta.isbn;
  if (meta.description) cfg.description = meta.description;
  if (meta.copyright) cfg.copyright = meta.copyright;
  const cover = meta.cover ?? (await detectCover(bookDir));
  if (cover) cfg.cover = cover;

  await writeConfig(bookDir, cfg);
  return cfg;
}

function uniqueFilename(dir: string, base: string, used: Set<string>): string {
  let name = base;
  let n = 2;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  while (used.has(`${dir}/${name}`)) name = `${stem}-${n++}${ext}`;
  return name;
}

/** Add a matter section from a template (or a blank custom file). */
export async function addMatter(
  bookDir: string,
  meta: BookMeta,
  opts: { type: string; placement?: Placement; title?: string },
): Promise<{ entry: string; placement: Placement }> {
  const cfg = await ensureConfig(bookDir, meta);
  const def = MATTER_TYPES.find((m) => m.key === opts.type);
  const placement: Placement = opts.placement ?? def?.placement ?? "backmatter";
  const subdir = placement; // "frontmatter" | "backmatter"
  await fs.mkdir(path.join(bookDir, subdir), { recursive: true });

  // Determine the file content + filename.
  const list = (cfg[placement] as string[] | undefined) ?? [];
  const used = new Set(list);
  let filename: string;
  let content: string;

  if (def) {
    const tpl = await fs.readFile(path.join(MATTER_TEMPLATES_DIR, def.file), "utf8");
    filename = uniqueFilename(subdir, def.file, used);
    content = opts.title ? tpl.replace(/^title:.*$/m, `title: ${opts.title}`) : tpl;
  } else {
    const title = opts.title || "New Section";
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
    filename = uniqueFilename(subdir, `${slug}.md`, used);
    content = `---\ntitle: ${title}\nclass: ${slug}\ntoc: true\nshowTitle: true\n---\n\nWrite ${title} here.\n`;
  }

  const entry = `${subdir}/${filename}`;
  const dest = path.join(bookDir, subdir, filename);
  if (!(await exists(dest))) await fs.writeFile(dest, content, "utf8");

  list.push(entry);
  cfg[placement] = list;
  await writeConfig(bookDir, cfg);
  return { entry, placement };
}

/** Remove a matter entry from book.yaml (keeps the file on disk). */
export async function removeMatter(bookDir: string, entry: string): Promise<void> {
  const cfg = await readConfig(bookDir);
  if (!cfg) return;
  for (const placement of ["frontmatter", "backmatter"] as Placement[]) {
    const list = cfg[placement] as string[] | undefined;
    if (list) cfg[placement] = list.filter((e) => e !== entry);
  }
  await writeConfig(bookDir, cfg);
}

/** Replace the ordering of a placement's list (must be a permutation of it). */
export async function reorderMatter(bookDir: string, placement: Placement, order: string[]): Promise<void> {
  const cfg = await readConfig(bookDir);
  if (!cfg) return;
  const current = (cfg[placement] as string[] | undefined) ?? [];
  // keep only entries that currently exist, in the requested order, then append any missed
  const set = new Set(current);
  const next = order.filter((e) => set.has(e));
  for (const e of current) if (!next.includes(e)) next.push(e);
  cfg[placement] = next;
  await writeConfig(bookDir, cfg);
}

/** Create a starter book.yaml (titlepage + copyright + detected chapters). */
export async function scaffold(bookDir: string, meta: BookMeta): Promise<RawConfig> {
  return ensureConfig(bookDir, meta);
}

/** Drop empty/undefined keys so the saved book.yaml stays tidy. */
function prune(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const inner = prune(v as Record<string, unknown>);
      if (inner) out[k] = inner;
    } else {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Persist the typography block into book.yaml. */
export async function saveTypography(bookDir: string, meta: BookMeta, typography: Record<string, unknown>): Promise<void> {
  const cfg = await ensureConfig(bookDir, meta);
  const pruned = prune(typography);
  if (pruned) cfg.typography = pruned;
  else delete cfg.typography;
  await writeConfig(bookDir, cfg);
}

function setOrDelete(cfg: RawConfig, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") delete cfg[key];
  else cfg[key] = value;
}

/**
 * Persist the Book Details metadata into book.yaml, preserving the existing
 * front/back matter and chapters structure (creating them if the file is new).
 */
export async function saveMeta(bookDir: string, meta: BookMeta): Promise<RawConfig> {
  const cfg = (await readConfig(bookDir)) ?? {};

  cfg.title = meta.title;
  cfg.author = meta.author;
  cfg.language = meta.language || "en";
  cfg.theme = meta.theme;
  setOrDelete(cfg, "subtitle", meta.subtitle);
  setOrDelete(cfg, "series", meta.series);
  setOrDelete(cfg, "series_index", meta.series_index);
  setOrDelete(cfg, "publisher", meta.publisher);
  setOrDelete(cfg, "isbn", meta.isbn);
  setOrDelete(cfg, "description", meta.description);
  setOrDelete(cfg, "copyright", meta.copyright);
  setOrDelete(cfg, "rights", meta.rights);

  // Keep cover; adopt an edited one or detect a file if none is recorded.
  if (meta.cover) cfg.cover = meta.cover;
  else if (!cfg.cover) {
    const c = await detectCover(bookDir);
    if (c) cfg.cover = c;
  }

  // Seed structure only when the file is brand new.
  if (!cfg.frontmatter) cfg.frontmatter = ["titlepage", "copyright"];
  if (!cfg.chapters) cfg.chapters = await detectChapters(bookDir);
  if (!cfg.backmatter) cfg.backmatter = [];

  await writeConfig(bookDir, cfg);
  return cfg;
}
