import path from "node:path";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { loadBook } from "./pipeline/ingest.ts";
import { makeTempDir, ROOT } from "./pipeline/paths.ts";
import type { Book, BookMeta } from "./pipeline/types.ts";

export interface UploadedFile {
  relPath: string; // path relative to the dropped folder (or just a filename)
  buffer: Buffer;
}

export type ProjectSource = "folder" | "upload" | "sample";

interface ProjectRecord {
  id: string;
  inputPath: string; // path passed to loadBook (a folder or a single .md)
  bookDir: string | null; // writable folder the book lives in (null = single file)
  source: ProjectSource;
  onDisk: boolean; // true when inputPath is the user's real folder
  tempToClean: string | null; // temp dir to remove on cleanup (never the user's folder)
  copied: boolean; // sample has been copied to a writable temp dir
}

export interface ProjectInfo {
  source: ProjectSource;
  folder: string | null; // displayable path to the book folder
  onDisk: boolean;
  editable: boolean; // matter/scaffold operations are possible
}

const projects = new Map<string, ProjectRecord>();

/** Safe-join that prevents path traversal outside base. */
function safeJoin(base: string, rel: string): string {
  const target = path.normalize(path.join(base, rel));
  if (!target.startsWith(path.normalize(base))) throw new Error(`Unsafe path: ${rel}`);
  return target;
}

/** Longest shared directory prefix across a set of "/"-separated file paths. */
function commonDir(paths: string[]): string {
  const dirs = paths.map((p) => p.split("/").slice(0, -1));
  if (dirs.length === 0) return "";
  let prefix = dirs[0];
  for (const segs of dirs.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix.join("/");
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Reconstruct an uploaded folder/file on disk and register a project. */
export async function createProjectFromFiles(files: UploadedFile[]): Promise<string> {
  if (files.length === 0) throw new Error("No files uploaded.");
  const dir = await makeTempDir("project-");

  for (const f of files) {
    const dest = safeJoin(dir, f.relPath.replace(/\\/g, "/"));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.buffer);
  }

  const written = files.map((f) => f.relPath.replace(/\\/g, "/"));
  const bookYaml = written.find((p) => /(^|\/)book\.ya?ml$/i.test(p));
  let inputPath: string;
  if (bookYaml) {
    inputPath = path.dirname(safeJoin(dir, bookYaml));
  } else {
    const mds = written.filter((p) => /\.(md|markdown)$/i.test(p));
    if (mds.length === 0) inputPath = dir;
    else if (mds.length === 1) inputPath = safeJoin(dir, mds[0]);
    else {
      const common = commonDir(mds);
      inputPath = common ? safeJoin(dir, common) : dir;
    }
  }

  const id = crypto.randomUUID();
  const bookDir = (await isDir(inputPath)) ? inputPath : null;
  projects.set(id, { id, inputPath, bookDir, source: "upload", onDisk: false, tempToClean: dir, copied: false });
  return id;
}

/** Open a real folder on the user's disk directly (no copy). */
export async function createProjectFromFolderPath(folderPath: string): Promise<string> {
  const abs = path.resolve(folderPath.trim());
  if (!(await isDir(abs))) throw new Error(`Not a folder: ${abs}`);
  const id = crypto.randomUUID();
  projects.set(id, {
    id,
    inputPath: abs,
    bookDir: abs,
    source: "folder",
    onDisk: true,
    tempToClean: null,
    copied: false,
  });
  return id;
}

/** Register the bundled sample book as a project. */
export function createSampleProject(): string {
  const id = crypto.randomUUID();
  const dir = path.join(ROOT, "samples", "clockwork-garden");
  projects.set(id, { id, inputPath: dir, bookDir: dir, source: "sample", onDisk: false, tempToClean: null, copied: false });
  return id;
}

export function hasProject(id: string): boolean {
  return projects.has(id);
}

export function projectInfo(id: string): ProjectInfo {
  const rec = projects.get(id);
  if (!rec) throw new Error("Project not found.");
  return {
    source: rec.source,
    folder: rec.bookDir,
    onDisk: rec.onDisk,
    editable: rec.bookDir !== null,
  };
}

/** Load the book and apply optional metadata/theme overrides from the UI. */
export async function loadProject(
  id: string,
  overrides?: Partial<BookMeta>,
): Promise<{ book: Book; warnings: { message: string }[] }> {
  const rec = projects.get(id);
  if (!rec) throw new Error("Project not found.");
  return loadBook(rec.inputPath, overrides);
}

/**
 * Return a writable book directory for the project, copying the bundled sample
 * into a temp dir on first write so we never modify the repo's sample.
 */
export async function writableBookDir(id: string): Promise<string> {
  const rec = projects.get(id);
  if (!rec) throw new Error("Project not found.");
  if (!rec.bookDir) throw new Error("This project has no editable book folder. Use a folder, not a single file.");

  if (rec.source === "sample" && !rec.copied) {
    const dest = await makeTempDir("project-");
    await fs.cp(rec.bookDir, dest, { recursive: true });
    rec.inputPath = dest;
    rec.bookDir = dest;
    rec.tempToClean = dest;
    rec.copied = true;
  }
  return rec.bookDir!;
}

/** Replace the cover image for a project. */
export async function setProjectCover(id: string, filename: string, buffer: Buffer): Promise<void> {
  const dir = await writableBookDir(id);
  const safe = path.basename(filename) || "cover.png";
  await fs.writeFile(path.join(dir, safe), buffer);
  await updateCoverInConfig(dir, safe);
}

async function updateCoverInConfig(dir: string, coverFile: string): Promise<void> {
  for (const name of ["book.yaml", "book.yml"]) {
    const p = path.join(dir, name);
    try {
      let text = await fs.readFile(p, "utf8");
      if (/^cover:.*$/m.test(text)) text = text.replace(/^cover:.*$/m, `cover: ${coverFile}`);
      else text += `\ncover: ${coverFile}\n`;
      await fs.writeFile(p, text);
      return;
    } catch {
      /* no config here */
    }
  }
}
