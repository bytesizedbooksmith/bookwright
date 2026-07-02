/* Ad-hoc render harness: render the bundled sample book to EPUB + print PDF + reading PDF
   so we can inspect real output. Usage: tsx scripts/render-sample.ts [outDir] [theme] */
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadBook } from "../server/pipeline/ingest.ts";
import { renderEpub } from "../server/pipeline/render-epub.ts";
import { renderPrintPdf } from "../server/pipeline/render-print.ts";
import { renderPdf } from "../server/pipeline/render-pdf.ts";
import { closeBrowser } from "../server/pipeline/render-pdf.ts";
import { DEFAULT_PRINT } from "../server/print.ts";
import { ROOT } from "../server/pipeline/paths.ts";

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, "output", "baseline"));
  const themeOverride = process.argv[3];
  await fs.mkdir(outDir, { recursive: true });

  const sampleDir = path.join(ROOT, "samples", "clockwork-garden");
  const overrides = themeOverride ? { theme: themeOverride as any } : undefined;
  const { book, warnings } = await loadBook(sampleDir, overrides);
  console.log(`Loaded "${book.meta.title}" — theme=${book.meta.theme}, sections=${book.sections.length}`);
  if (warnings.length) console.log("warnings:", warnings.map((w) => w.message));

  const epub = await renderEpub(book, "universal");
  await fs.writeFile(path.join(outDir, "sample.epub"), epub.buffer);
  console.log(`EPUB: ${epub.bytes} bytes`);

  const print = await renderPrintPdf(book, DEFAULT_PRINT);
  await fs.writeFile(path.join(outDir, "sample-print.pdf"), print.buffer);
  console.log(`Print PDF: ${print.buffer.length} bytes, pages=${print.meta.pages}, gutter=${print.meta.gutter}in`);

  const reading = await renderPdf(book);
  await fs.writeFile(path.join(outDir, "sample-reading.pdf"), reading);
  console.log(`Reading PDF: ${reading.length} bytes`);

  await closeBrowser();
  console.log(`\nWrote outputs to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
