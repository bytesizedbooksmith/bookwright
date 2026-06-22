import path from "node:path";
import { promises as fs } from "node:fs";
import type { Book } from "./types.ts";
import { assembleMarkdown } from "./build-doc.ts";
import { cleanup, commonArgs, makeWorkspace, runPandoc } from "./pandoc.ts";

/** Render a Word .docx as a Buffer. Uses Pandoc's default styles for now. */
export async function renderDocx(book: Book): Promise<Buffer> {
  const ws = await makeWorkspace(book);
  const outPath = path.join(ws.dir, "book.docx");
  try {
    const md = assembleMarkdown(book, "docx");
    const args = [
      ...commonArgs(book, ws.metaPath),
      "--to=docx",
      "--toc",
      "--toc-depth=1",
      "-o",
      outPath,
    ];
    await runPandoc(args, md);
    return await fs.readFile(outPath);
  } finally {
    await cleanup(ws);
  }
}
