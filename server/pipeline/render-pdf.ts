import type { Browser } from "puppeteer";
import puppeteer from "puppeteer";
import type { Book } from "./types.ts";
import { renderHtml } from "./render-html.ts";

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

/**
 * Render a reading PDF from the book's styled HTML via headless Chromium.
 * (Phase 2 will extend this with Paged.js for print-ready trim sizes and margins.)
 */
export async function renderPdf(book: Book): Promise<Buffer> {
  const html = await renderHtml(book, "print");
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      printBackground: true,
      width: "6in",
      height: "9in",
      margin: { top: "0.75in", bottom: "0.75in", left: "0.7in", right: "0.7in" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
