// Where exports land, what they're called, and what happens to the previous one.
//
// Two destinations, and which one an artifact goes to depends on whether a human
// has to carry it somewhere. The blues must physically travel to an iPad, so it
// goes where the iPad can see it; everything else stays with the book.
//
// The rule that makes this work: the top level of any output folder contains only
// CURRENT artifacts. If four books sit in the review folder, there are four PDFs,
// and that folder *is* the to-do list.

import path from "node:path";
import { promises as fs } from "node:fs";
import { readConfig } from "./matter.ts";
import { slugify } from "./pipeline/util.ts";

export type ArtifactType = "blues" | "print" | "reading" | "epub-kdp" | "epub-universal" | "docx" | "md";

interface ArtifactDef {
  ext: string;
  /** Filename suffix before the extension, or null for none. */
  variant: string | null;
  /** blues travels to the review folder; everything else stays with the book. */
  travels: boolean;
  label: string;
}

// NB: the spec lists `_universal` among the variants and then says "No variant
// suffix for EPUB-universal and DOCX". The explicit rule wins — universal is the
// default EPUB and reads as the plain name, with `_kdp` marking the exception.
const ARTIFACTS: Record<ArtifactType, ArtifactDef> = {
  blues: { ext: "pdf", variant: "blues", travels: true, label: "blues" },
  print: { ext: "pdf", variant: "print", travels: false, label: "print pdf" },
  reading: { ext: "pdf", variant: "reading", travels: false, label: "reading pdf" },
  "epub-kdp": { ext: "epub", variant: "kdp", travels: false, label: "epub (kdp)" },
  "epub-universal": { ext: "epub", variant: null, travels: false, label: "epub (universal)" },
  docx: { ext: "docx", variant: null, travels: false, label: "docx" },
  md: { ext: "md", variant: null, travels: false, label: "compiled markdown" },
};

export function artifactLabel(type: ArtifactType): string {
  return ARTIFACTS[type].label;
}

export const DEFAULT_EXPORTS_DIR = "_exports";
export const ARCHIVE_DIRNAME = "_archive";

export interface DestinationConfig {
  slug: string;
  exportsDir: string; // absolute
  bluesDir: string | null; // absolute, or null when unconfigured
}

/**
 * The filename stem, derived from the FOLDER, not the title. `Bk-1_The-Book`
 * gives `the-book`; the title would give `the-book-that-wasnt-there-yesterday`,
 * which is unusable on a page and in a folder listing. A `slug:` in book.yaml
 * overrides it.
 */
export function slugForFolder(bookDir: string): string {
  const base = path.basename(path.resolve(bookDir));
  return slugify(base.replace(/^bk[-_ ]?\d+[_-]/i, ""));
}

export async function resolveDestinations(bookDir: string, outOverride?: string): Promise<DestinationConfig> {
  const cfg = ((await readConfig(bookDir)) ?? {}) as Record<string, unknown>;
  const slug = typeof cfg.slug === "string" && cfg.slug.trim() ? slugify(cfg.slug) : slugForFolder(bookDir);
  const exportsRel = typeof cfg.exports_dir === "string" && cfg.exports_dir.trim() ? cfg.exports_dir : DEFAULT_EXPORTS_DIR;
  const bluesCfg = typeof cfg.blues_output === "string" && cfg.blues_output.trim() ? cfg.blues_output : null;
  return {
    slug,
    exportsDir: path.resolve(bookDir, exportsRel),
    bluesDir: outOverride ? path.resolve(outOverride) : bluesCfg ? path.resolve(bluesCfg) : null,
  };
}

/** `{slug}_v{N}_{YYYY-MM-DD}[_{variant}].{ext}` — version first, so name-sort is version-sort. */
export function artifactFilename(slug: string, version: number, date: string, type: ArtifactType, tag?: string): string {
  const d = ARTIFACTS[type];
  if (tag && !/^[a-z0-9-]+$/i.test(tag)) throw new Error(`Unsafe artifact tag: ${tag}`);
  if (tag && !d.variant) throw new Error(`Artifact type ${type} does not support filename tags`);
  return `${slug}_v${version}_${date}${d.variant ? `_${d.variant}` : ""}${tag ? `_${tag}` : ""}.${d.ext}`;
}

interface ParsedName {
  version: number;
  date: string;
  variant: string | null;
  tag: string | null;
  ext: string;
}

/** Read one of our filenames back. Returns null for anything we didn't write. */
export function parseArtifactName(name: string, slug: string): ParsedName | null {
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = name.match(new RegExp(`^${esc}_v(\\d+)_(\\d{4}-\\d{2}-\\d{2})(?:_([a-z0-9]+))?(?:_([a-z0-9-]+))?\\.([a-z0-9]+)$`, "i"));
  if (!m) return null;
  return { version: Number(m[1]), date: m[2], variant: m[3] ?? null, tag: m[4] ?? null, ext: m[5].toLowerCase() };
}

/** Same book, same artifact type — matched on variant AND extension, not name. */
function isSameArtifact(parsed: ParsedName, type: ArtifactType): boolean {
  const d = ARTIFACTS[type];
  return parsed.ext === d.ext && (parsed.variant ?? null) === d.variant;
}

export class NoBluesDestinationError extends Error {
  readonly code = "NO_BLUES_DESTINATION";
  constructor() {
    // Phrased for whoever is asking: the CLI adds the --out hint itself, and the
    // web UI offers a folder picker rather than repeating a flag at someone who
    // never opened a terminal.
    super("No review folder set for this book yet — the blues has nowhere to go.");
  }
}

export function destinationFor(type: ArtifactType, dest: DestinationConfig): string {
  if (!ARTIFACTS[type].travels) return dest.exportsDir;
  if (!dest.bluesDir) throw new NoBluesDestinationError();
  return dest.bluesDir;
}

export interface WritePlan {
  dir: string;
  filename: string;
  fullPath: string;
  /** A file of this exact name is already there — same version, regenerating. */
  exists: boolean;
  /** Older-version files of this artifact type that will be archived first. */
  toArchive: string[];
}

export async function planWrite(
  type: ArtifactType,
  dest: DestinationConfig,
  version: number,
  date: string,
  tag?: string,
): Promise<WritePlan> {
  const dir = destinationFor(type, dest);
  const filename = artifactFilename(dest.slug, version, date, type, tag);
  const fullPath = path.join(dir, filename);

  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    entries = []; // destination doesn't exist yet
  }

  const toArchive: string[] = [];
  for (const e of entries) {
    const parsed = parseArtifactName(e, dest.slug);
    if (!parsed || !isSameArtifact(parsed, type)) continue;
    if (e === filename) continue; // this one gets overwritten in place, not archived
    // Anything else of this type is superseded, INCLUDING the same version under
    // a different date. Regenerating v6 the morning after v6 was first written
    // produces a new filename, not an overwrite, and archiving only older
    // versions would leave two v6 files side by side — which is exactly the
    // "which one is latest?" question this whole system exists to answer.
    // A HIGHER version is left alone: burying newer work would be worse than
    // any duplicate.
    if (parsed.version < version || (parsed.version === version && parsed.tag === (tag ?? null))) toArchive.push(e);
  }

  return { dir, filename, fullPath, exists: entries.includes(filename), toArchive: toArchive.sort() };
}

/**
 * Move a file into `_archive/`. Never deletes: if something of that name is
 * already archived, the incoming one is parked beside it under a numbered name
 * rather than overwritten.
 */
async function archiveOne(dir: string, name: string): Promise<string> {
  const archive = path.join(dir, ARCHIVE_DIRNAME);
  await fs.mkdir(archive, { recursive: true });
  let target = path.join(archive, name);
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let n = 2;
  for (;;) {
    try {
      await fs.access(target);
      target = path.join(archive, `${stem}(${n++})${ext}`);
    } catch {
      break;
    }
  }
  await fs.rename(path.join(dir, name), target);
  return path.basename(target);
}

export interface WriteResult {
  path: string;
  filename: string;
  archived: string[];
  overwrote: boolean;
}

/** Archive anything older, then write. The caller has already resolved conflicts. */
export async function writeArtifact(plan: WritePlan, data: Buffer | string): Promise<WriteResult> {
  await fs.mkdir(plan.dir, { recursive: true });
  const archived: string[] = [];
  for (const name of plan.toArchive) archived.push(await archiveOne(plan.dir, name));
  await fs.writeFile(plan.fullPath, data);
  return { path: plan.fullPath, filename: plan.filename, archived, overwrote: plan.exists };
}
