// Dev/test harness: render a book to every format from the command line.
//   tsx server/pipeline/cli.ts <bookPath> [theme] [--html|--epub|--docx|--md|--pdf|--all]
import path from "node:path";
import { promises as fs } from "node:fs";
import { loadBook } from "./ingest.ts";
import { renderHtml } from "./render-html.ts";
import { renderEpub } from "./render-epub.ts";
import { renderDocx } from "./render-docx.ts";
import { renderMarkdown } from "./render-markdown.ts";
import { renderPdf, closeBrowser } from "./render-pdf.ts";
import { OUTPUT_DIR, ensureDir } from "./paths.ts";
import type { ThemeName } from "./types.ts";

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a) => !a.startsWith("--"));
  const bookPath = positional[0] ?? "samples/clockwork-garden";
  const theme = positional[1] as ThemeName | undefined;
  const want = (f: string) => flags.includes("--all") || flags.includes(f) || flags.length === 0;

  const { book, warnings } = await loadBook(bookPath);
  if (theme) book.meta.theme = theme;
  warnings.forEach((w) => console.warn("  ⚠", w.message));
  console.log(`Loaded "${book.meta.title}" — ${book.sections.length} sections, theme=${book.meta.theme}`);

  await ensureDir(OUTPUT_DIR);
  const base = path.join(OUTPUT_DIR, "clockwork");

  if (want("--html")) {
    const html = await renderHtml(book, "html");
    await fs.writeFile(`${base}.preview.html`, html);
    console.log("  ✓ preview.html", html.length, "bytes");
  }
  if (want("--md")) {
    await fs.writeFile(`${base}.md`, renderMarkdown(book));
    console.log("  ✓ compiled .md");
  }
  if (want("--docx")) {
    await fs.writeFile(`${base}.docx`, await renderDocx(book));
    console.log("  ✓ .docx");
  }
  if (want("--epub")) {
    const e = await renderEpub(book, "universal");
    await fs.writeFile(`${base}.epub`, e.buffer);
    console.log("  ✓ .epub", e.bytes, "bytes");
  }
  if (want("--pdf")) {
    await fs.writeFile(`${base}.pdf`, await renderPdf(book));
    console.log("  ✓ .pdf");
    await closeBrowser();
  }
  console.log(`\nOutputs in ${OUTPUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
