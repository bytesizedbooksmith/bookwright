import path from "node:path";
import { promises as fs } from "node:fs";
import yaml from "js-yaml";
import type { Book } from "./types.ts";
import { buildPandocMeta, type Target } from "./build-doc.ts";
import { FILTERS_DIR, ROOT, makeTempDir } from "./paths.ts";
import { run } from "./exec.ts";
import { AppError, tailLines } from "../errors.ts";

export const PANDOC = process.env.PANDOC_BIN || "pandoc";
export const BOOK_TEMPLATE = path.join(ROOT, "server", "templates", "book.html");
export const BOOK_FILTER = path.join(FILTERS_DIR, "book.lua");

export interface Workspace {
  dir: string;
  metaPath: string;
}

/** Write the metadata YAML to a temp dir for --metadata-file. */
export async function makeWorkspace(book: Book, target: Target = "html"): Promise<Workspace> {
  const dir = await makeTempDir();
  const metaPath = path.join(dir, "meta.yaml");
  const meta = buildPandocMeta(book, target);
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

/** Run pandoc, throwing a tagged AppError on failure (see server/errors.ts). */
export async function runPandoc(args: string[], input: string): Promise<string> {
  let r;
  try {
    r = await run(PANDOC, args, { input });
  } catch (e) {
    // spawn() failed before Pandoc ran — almost always "not on PATH".
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new AppError(
        "PANDOC_MISSING",
        "Pandoc isn't installed or isn't on your PATH. Install Pandoc 3.x from https://pandoc.org/installing.html, then restart the app.",
        { cause: e },
      );
    }
    throw new AppError("PANDOC_FAILED", "Pandoc couldn't be started.", { detail: (e as Error).message, cause: e });
  }
  if (r.code !== 0) {
    throw new AppError(
      "PANDOC_FAILED",
      "Pandoc couldn't convert your book. The details below show what it reported.",
      { detail: tailLines(r.stderr || r.stdout) },
    );
  }
  return r.stdout;
}
