import path from "node:path";
import { promises as fs } from "node:fs";
import yaml from "js-yaml";
import type { Book } from "./types.ts";
import { buildPandocMeta } from "./build-doc.ts";
import { FILTERS_DIR, ROOT, makeTempDir } from "./paths.ts";
import { run } from "./exec.ts";

export const PANDOC = process.env.PANDOC_BIN || "pandoc";
export const BOOK_TEMPLATE = path.join(ROOT, "server", "templates", "book.html");
export const BOOK_FILTER = path.join(FILTERS_DIR, "book.lua");

export interface Workspace {
  dir: string;
  metaPath: string;
}

/** Write the metadata YAML to a temp dir for --metadata-file. */
export async function makeWorkspace(book: Book): Promise<Workspace> {
  const dir = await makeTempDir();
  const metaPath = path.join(dir, "meta.yaml");
  const meta = buildPandocMeta(book);
  await fs.writeFile(metaPath, yaml.dump(meta), "utf8");
  return { dir, metaPath };
}

export function commonArgs(book: Book, metaPath: string): string[] {
  return [
    "--from=markdown",
    `--metadata-file=${metaPath}`,
    `--lua-filter=${BOOK_FILTER}`,
    `--resource-path=${book.baseDir}`,
  ];
}

export async function cleanup(ws: Workspace): Promise<void> {
  await fs.rm(ws.dir, { recursive: true, force: true }).catch(() => {});
}

/** Run pandoc, throwing a useful error on failure. */
export async function runPandoc(args: string[], input: string): Promise<string> {
  const r = await run(PANDOC, args, { input });
  if (r.code !== 0) {
    throw new Error(`pandoc failed (exit ${r.code}):\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}
