/* Drop cap seating: the top of the capital must line up with the top of the
   first line of body text, in every theme and at both cap sizes. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { getBrowser, closeBrowser } from "../server/pipeline/render-pdf.ts";
import { alignDropCaps } from "../server/pipeline/dropcap.ts";
import { THEMES_DIR } from "../server/pipeline/paths.ts";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const base = await fs.readFile(path.join(THEMES_DIR, "base.css"), "utf8");
const printBase = await fs.readFile(path.join(THEMES_DIR, "print-base.css"), "utf8");

const BODY =
  "he new email message made my monitor flicker and smoke. Great. Even Outlook was going to Hell, " +
  "and the rest of this paragraph is here so the cap has real lines to sit against and the wrap " +
  "behaves the way it will on a finished page rather than in a toy fixture.";

async function pageHtml(theme: string, print: boolean): Promise<string> {
  const themeCss = await fs.readFile(path.join(THEMES_DIR, theme, "theme.css"), "utf8");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${base}
${themeCss}
${print ? printBase : ""}
body { width: 4.75in; margin: 0; padding: 20px; }
</style></head><body class="book-formatter"><main class="book">
<section class="level1 chapter"><h1>Chapter 3</h1>
<p><span class="dropcap">T</span>${BODY}</p>
</section></main></body></html>`;
}

const browser = await getBrowser();
const p = await browser.newPage();

/** Ink-top delta between the cap and the first body line, in px. */
async function measure(): Promise<{ delta: number; font: string; capPx: number; linesBeside: number }> {
  return p.evaluate(() => {
    const cap = document.querySelector<HTMLElement>(".dropcap")!;
    const para = cap.closest("p")!;
    const cv = document.createElement("canvas").getContext("2d")!;

    const csC = getComputedStyle(cap);
    cv.font = `${csC.fontStyle} ${csC.fontWeight} ${csC.fontSize} ${csC.fontFamily}`;
    const mC = cv.measureText(cap.textContent!);
    const ascC = mC.fontBoundingBoxAscent;
    const descC = mC.fontBoundingBoxDescent;
    const lhC = csC.lineHeight === "normal" ? ascC + descC : parseFloat(csC.lineHeight);
    const rC = cap.getBoundingClientRect();
    const inkC =
      rC.top + parseFloat(csC.paddingTop || "0") + (lhC - (ascC + descC)) / 2 + ascC - mC.actualBoundingBoxAscent;

    const it = document.createNodeIterator(para, NodeFilter.SHOW_TEXT);
    let body: Text | null = null;
    let n: Node | null;
    while ((n = it.nextNode())) {
      const t = n as Text;
      if (cap.contains(t)) continue;
      if (t.data.trim().length > 2) {
        body = t;
        break;
      }
    }
    const rg = document.createRange();
    rg.setStart(body!, 0);
    rg.setEnd(body!, 20);
    const rects = rg.getClientRects();
    const rB = rects[0];

    const csB = getComputedStyle(para);
    cv.font = `${csB.fontStyle} ${csB.fontWeight} ${csB.fontSize} ${csB.fontFamily}`;
    const mB = cv.measureText("Hh");
    const ascB = mB.fontBoundingBoxAscent;
    const descB = mB.fontBoundingBoxDescent;
    const lhB = csB.lineHeight === "normal" ? ascB + descB : parseFloat(csB.lineHeight);
    const inkB = rB.top + (lhB - (ascB + descB)) / 2 + ascB - mB.actualBoundingBoxAscent;

    // How many body lines sit alongside the cap — the seat shouldn't change.
    const all = document.createRange();
    all.selectNodeContents(para);
    const capBottom = rC.bottom;
    const linesBeside = Array.from(all.getClientRects()).filter((r) => r.top < capBottom - 1 && r.left > rC.right - 1).length;

    return {
      delta: Math.round((inkC - inkB) * 100) / 100,
      // getComputedStyle returns the SPECIFIED stack, not the family that
      // actually resolved, so the ratio of ink ascent to font ascent is the
      // honest way to show these themes really do render in different faces.
      font: `cap/asc ${(mC.actualBoundingBoxAscent / ascC).toFixed(3)}`,
      capPx: Math.round(parseFloat(csC.fontSize) * 10) / 10,
      linesBeside,
    };
  });
}

for (const print of [false, true]) {
  console.log(`\n${print ? "Print / reading PDF (3-line cap)" : "EPUB & preview (2-line cap)"}`);
  for (const theme of ["classic", "modern", "decorative"]) {
    await p.setContent(await pageHtml(theme, print), { waitUntil: "networkidle0" });
    const before = await measure();
    const adjusted = await alignDropCaps(p);
    const after = await measure();
    console.log(
      `    ${theme.padEnd(11)} ${after.font.padEnd(20)} ${String(after.capPx).padStart(5)}px  ` +
        `before ${String(before.delta).padStart(7)}px → after ${String(after.delta).padStart(6)}px  (${after.linesBeside} lines beside)`,
    );
    check(`${theme} seats within half a pixel`, Math.abs(after.delta) <= 0.5, `${after.delta}px`);
    check(`   ${theme} still seats ${print ? 3 : 2}+ lines beside the cap`, after.linesBeside >= (print ? 3 : 2), String(after.linesBeside));
    if (Math.abs(before.delta) > 0.5) check(`   ${theme} was actually corrected`, adjusted === 1);
  }
}

await p.close();
await closeBrowser();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
