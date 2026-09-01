// Unified version tracking. Applies to EVERY artifact the formatter produces,
// not just the blues.
//
// The governing rule: the Markdown is the book, and every export is a dated
// snapshot that is stale the moment it is written. So the version tracks the
// SOURCE, not the export run — three artifacts generated from one untouched
// manuscript all read the same version, because they are the same version.
//
// Metadata lives in `{book}/_meta/`, never the book root. Most books set
// `chapters: .`, which makes the root the chapters directory; a LINEAGE.md
// sitting there is a chapter candidate. Ingest also refuses it by name, but
// that is the second line of defence, not the first.

import path from "node:path";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import type { Book, Section } from "./pipeline/types.ts";

export interface ExportRecord {
  type: string; // blues | epub | print | reading | docx | md
  file: string;
  at: string; // ISO timestamp
}

export interface VersionEntry {
  version: number;
  source_hash?: string;
  first_seen: string;
  words: number;
  chapters: number;
  note?: string;
  reconstructed?: boolean;
  adopted?: boolean; // took over a hash this tool didn't write
  exports: ExportRecord[];
}

export interface VersionFile {
  book: string;
  pen_name?: string;
  series?: string;
  series_index?: number;
  source: string;
  current_version: number;
  current_source_hash: string;
  hash_method?: string;
  blues_round: number;
  max_rounds: number;
  word_count_method?: string;
  hash_note?: string;
  history: VersionEntry[];
  // Unknown keys are preserved verbatim on write — this file is partly
  // hand-authored and must survive a round trip through the formatter.
  [key: string]: unknown;
}

export const META_DIRNAME = "_meta";
export const HASH_METHOD = "publication-source-v2";
const LINEAGE_MARKER = "<!-- formatter:insert-rows-above -->";

export function metaDir(bookDir: string): string {
  return path.join(bookDir, META_DIRNAME);
}

/**
 * Word count, and the one definition of it. Whitespace-split tokens of chapter
 * title + subtitle + body; heading markers are already stripped by ingest; front
 * and back matter excluded.
 *
 * The pre-formatter figures in these books were counted with `wc -w` on raw
 * files, which counts a bare "#" and "##" as words — 52 phantom tokens across 26
 * chapters. Those historical numbers are kept as recorded and are not
 * comparable to anything this function returns.
 */
export function countWords(chapters: Section[]): number {
  return chapters.reduce(
    (n, s) => n + `${s.title} ${s.subtitle ?? ""} ${s.markdown}`.split(/\s+/).filter(Boolean).length,
    0,
  );
}

export function chaptersOf(book: Book): Section[] {
  return book.sections.filter((s) => s.kind === "chapter");
}

/**
 * Hash of the source. Line endings are normalised first: these manuscripts live
 * in a git repo with `text=auto`, so the same book can arrive CRLF on one
 * machine and LF on another, and that must not mint a new version.
 *
 * Chapter titles and subtitles are included because ingest lifts them out of the
 * Markdown into fields — hashing bodies alone would miss a heading change, which
 * is a real change to the book.
 */
export function hashChapters(chapters: Section[]): string {
  const h = crypto.createHash("sha256");
  for (const s of chapters) {
    h.update(`# ${s.title}\n`);
    if (s.subtitle) h.update(`## ${s.subtitle}\n`);
    h.update(s.markdown.replace(/\r\n/g, "\n").trim());
    h.update("\n\n");
  }
  return `sha256:${h.digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Hash every input that can materially change a publication artifact. Chapter
 * word counts remain chapter-only, but the version also covers front/back
 * matter, metadata, typography, styles, cover bytes, and embedded font bytes.
 * Absolute paths are deliberately excluded so moving a book does not mint a
 * new version.
 */
export async function hashBookSource(book: Book): Promise<string> {
  const h = crypto.createHash("sha256");
  const sections = book.sections.map((section) => ({
    ...section,
    markdown: section.markdown.replace(/\r\n/g, "\n").trim(),
  }));
  h.update(canonicalJson({
    method: HASH_METHOD,
    meta: book.meta,
    sections,
    styles: book.styles,
    typography: book.typography,
    fonts: book.fonts.map(({ file, ...font }) => ({ ...font, file: path.basename(file) })),
    cover: book.coverPath ? path.basename(book.coverPath) : null,
  }));
  if (book.coverPath) h.update(await fs.readFile(book.coverPath));
  for (const font of book.fonts) h.update(await fs.readFile(font.file));
  return `sha256:${h.digest("hex")}`;
}

/** Our canonical form: the algorithm name plus a full 64-hex digest. */
function isCanonicalHash(v: unknown): boolean {
  return typeof v === "string" && /^sha256:[0-9a-f]{64}$/.test(v);
}

/** Short form for humans — file names, console lines, LINEAGE. */
export function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 8);
}

export async function readVersionFile(bookDir: string): Promise<VersionFile | null> {
  try {
    const raw = await fs.readFile(path.join(metaDir(bookDir), "version.json"), "utf8");
    return JSON.parse(raw) as VersionFile;
  } catch {
    return null;
  }
}

export async function writeVersionFile(bookDir: string, vf: VersionFile): Promise<void> {
  const dir = metaDir(bookDir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "version.json"), `${JSON.stringify(vf, null, 2)}\n`, "utf8");
}

function seedVersionFile(book: Book, bookDir: string, hash: string, words: number, chapters: number): VersionFile {
  const now = new Date().toISOString();
  return {
    book: book.meta.title,
    pen_name: book.meta.author,
    series: book.meta.series,
    source: bookDir.replace(/\\/g, "/"),
    current_version: 1,
    current_source_hash: hash,
    hash_method: HASH_METHOD,
    blues_round: 0,
    max_rounds: 3,
    word_count_method:
      "Whitespace-split tokens of chapter title + subtitle + body, Markdown heading markers stripped. Front and back matter excluded.",
    history: [
      { version: 1, source_hash: hash, first_seen: now, words, chapters, note: "first tracked by the formatter", exports: [] },
    ],
  };
}

export interface SyncResult {
  file: VersionFile;
  version: number;
  entry: VersionEntry;
  words: number;
  chapters: number;
  hash: string;
  /** Source changed since the last recorded hash — a new version was opened. */
  changed: boolean;
  /** The stored hash wasn't ours, so the current source was adopted at the current version. */
  adopted: boolean;
  /** No version.json existed; one was seeded. */
  seeded: boolean;
}

/**
 * Reconcile version.json with the source as it stands. Call before rendering
 * anything. Does not write — pass the result to `commitSync` so a dry run or a
 * failed render leaves no trace.
 *
 * Adoption: if the stored hash isn't in our canonical form it was written by
 * something else (these files were seeded by hand from file forensics). Comparing
 * against it would mint a spurious new version on the very first run, so instead
 * the current source is adopted AT the current version and the hash is rewritten.
 * Detected by format, not by a first-run flag, so it is deterministic.
 */
export async function syncVersion(book: Book, bookDir: string): Promise<SyncResult> {
  const chapters = chaptersOf(book);
  const words = countWords(chapters);
  const hash = await hashBookSource(book);
  const existing = await readVersionFile(bookDir);

  if (!existing) {
    const file = seedVersionFile(book, bookDir, hash, words, chapters.length);
    return { file, version: 1, entry: file.history[0], words, chapters: chapters.length, hash, changed: false, adopted: false, seeded: true };
  }

  const file: VersionFile = { ...existing, history: [...(existing.history ?? [])] };
  const now = new Date().toISOString();

  if (!isCanonicalHash(file.current_source_hash) || file.hash_method !== HASH_METHOD) {
    const version = file.current_version;
    let entry = file.history.find((e) => e.version === version);
    if (!entry) {
      entry = { version, first_seen: now, words, chapters: chapters.length, exports: [] };
      file.history.push(entry);
    }
    entry.source_hash = hash;
    entry.words = words;
    entry.chapters = chapters.length;
    entry.adopted = true;
    entry.exports = entry.exports ?? [];
    file.current_source_hash = hash;
    file.hash_method = HASH_METHOD;
    delete file.hash_note; // the note described exactly this handover; it's done
    return { file, version, entry, words, chapters: chapters.length, hash, changed: false, adopted: true, seeded: false };
  }

  if (file.current_source_hash === hash) {
    const version = file.current_version;
    let entry = file.history.find((e) => e.version === version);
    if (!entry) {
      entry = { version, source_hash: hash, first_seen: now, words, chapters: chapters.length, exports: [] };
      file.history.push(entry);
    }
    entry.exports = entry.exports ?? [];
    return { file, version, entry, words, chapters: chapters.length, hash, changed: false, adopted: false, seeded: false };
  }

  // Source moved — open a new version.
  const version = file.current_version + 1;
  const entry: VersionEntry = {
    version,
    source_hash: hash,
    first_seen: now,
    words,
    chapters: chapters.length,
    exports: [],
  };
  file.history.push(entry);
  file.current_version = version;
  file.current_source_hash = hash;
  return { file, version, entry, words, chapters: chapters.length, hash, changed: true, adopted: false, seeded: false };
}

/** Persist a SyncResult. Separate from syncVersion so nothing is written on a dry run. */
export async function commitSync(bookDir: string, sync: SyncResult): Promise<void> {
  await writeVersionFile(bookDir, sync.file);
}

export interface RoundResult {
  round: number;
  maxRounds: number;
  overCap: boolean;
}

/**
 * Increment the blues round. The cap is a discipline, not a lock: going past it
 * warns loudly and proceeds, because remaining issues at that point are judgment
 * calls, and judgment calls ship.
 */
export function bumpRound(file: VersionFile): RoundResult {
  const round = (file.blues_round ?? 0) + 1;
  file.blues_round = round;
  const maxRounds = file.max_rounds ?? 3;
  return { round, maxRounds, overCap: round > maxRounds };
}

export function roundWarning(r: RoundResult): string | null {
  if (!r.overCap) return null;
  return (
    `⚠  ROUND ${r.round} OF ${r.maxRounds}. The cap exists because rounds have diminishing returns.\n` +
    `   Remaining issues at this point are judgment calls, and judgment calls ship.`
  );
}

/** Record an artifact against a version entry. Mutates the entry in place. */
export function recordExport(entry: VersionEntry, type: string, file: string, at = new Date().toISOString()): void {
  entry.exports = entry.exports ?? [];
  entry.exports.push({ type, file, at });
}

/** Has this artifact type already been written at this version? */
export function priorExport(entry: VersionEntry, type: string): ExportRecord | null {
  return (entry.exports ?? []).filter((e) => e.type === type).slice(-1)[0] ?? null;
}

export interface LineageRow {
  date: string; // YYYY-MM-DD
  version: number;
  artifact: string;
  words: number;
  note?: string;
}

function lineageRowText(r: LineageRow): string {
  const note = (r.note ?? "").replace(/\|/g, "\\|");
  return `| ${r.date} | v${r.version} | ${r.artifact} | ${r.words.toLocaleString("en-US")} | ${note} |`;
}

const LINEAGE_SEED = `# LINEAGE

Append-only. Nothing above the marker is ever rewritten.

## Export log

| Date | Ver | Artifact | Words | Note |
|---|---|---|---|---|
${LINEAGE_MARKER}
`;

/**
 * Append a row to LINEAGE.md, immediately above the marker so it stays contiguous
 * with the table. Never rewrites anything already in the file — these documents
 * are largely hand-authored and carry reconstructed history that predates the
 * formatter. If the marker is missing the row is appended at the end rather than
 * guessing where the table is.
 */
export async function appendLineage(bookDir: string, row: LineageRow): Promise<void> {
  const dir = metaDir(bookDir);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "LINEAGE.md");

  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    text = LINEAGE_SEED;
  }

  const line = lineageRowText(row);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (text.includes(LINEAGE_MARKER)) {
    text = text.replace(LINEAGE_MARKER, `${line}${eol}${LINEAGE_MARKER}`);
  } else {
    text = `${text.replace(/\s*$/, "")}${eol}${eol}${line}${eol}`;
  }
  await fs.writeFile(file, text, "utf8");
}

export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
