/* Screenshot the paginated print pages to PNGs for visual inspection.
   Usage: tsx scripts/shoot-pages.ts [outDir] [theme] [dropcap on|off] */
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadBook } from "../server/pipeline/ingest.ts";
import { renderPrintPreviewHtml } from "../server/pipeline/render-print.ts";
import { getBrowser, closeBrowser } from "../server/pipeline/render-pdf.ts";
import { DEFAULT_PRINT } from "../server/print.ts";
import { ROOT } from "../server/pipeline/paths.ts";

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, "output", "shots"));
  const themeOverride = process.argv[3];
  const dropcap = process.argv[4]; // "on" | "off" | undefined
  await fs.mkdir(outDir, { recursive: true });

  const sampleDir = path.join(ROOT, "samples", "clockwork-garden");
  const overrides = themeOverride ? { theme: themeOverride as any } : undefined;
  const { book } = await loadBook(sampleDir, overrides);
  if (dropcap === "on") book.typography = { ...book.typography, dropcap: true };
  if (dropcap === "off") book.typography = { ...book.typography, dropcap: false };

  const trim = process.env.TRIM || DEFAULT_PRINT.trim;
  const { html } = await renderPrintPreviewHtml(book, { ...DEFAULT_PRINT, trim });
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 1000, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const n = await page.evaluate(() => document.querySelectorAll(".pagedjs_page").length);
  console.log(`theme=${book.meta.theme} dropcap=${dropcap ?? "default"} pages=${n}`);
  const shots = Math.min(n, 8);
  for (let i = 0; i < shots; i++) {
    const el = await page.evaluateHandle((idx) => document.querySelectorAll(".pagedjs_page")[idx], i);
    const box = await (el as any).boundingBox?.();
    if (box) {
      await page.screenshot({
        path: path.join(outDir, `page-${String(i + 1).padStart(2, "0")}.png`),
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
    }
  }
  await page.close();
  await closeBrowser();
  console.log(`Wrote ${shots} page shots to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
