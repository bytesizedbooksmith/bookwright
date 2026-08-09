import type { Page } from "puppeteer";

/**
 * Seat every drop cap so the top of the capital lines up with the top of the
 * first line of body text.
 *
 * A floated drop cap aligns its BOX to the top of the line box, but the glyph
 * sits on its baseline with the font's ascender above it — so the visible cap
 * lands below the body text by (ascender − cap-height), which at 5em is roughly
 * two-thirds of a body line. That is the sink you can see on a chapter opener.
 *
 * The correction is a negative margin, but it can't be a constant: it depends on
 * the ascender-to-cap-height ratio of whichever font actually resolved. The
 * three themes use three different stacks, and a book may supply its own font in
 * book.yaml, so this measures each cap in place and nudges it by exactly what it
 * turns out to need. Static CSS gets a reasonable default for the EPUB, which
 * has no browser to measure in.
 *
 * Runs before pagination, since it changes line wrapping around the float.
 *
 * NB: no named functions inside page.evaluate — esbuild rewrites them to call a
 * __name helper that doesn't exist in the browser, and puppeteer's isolated
 * world can't see a shim installed on the page.
 */
export async function alignDropCaps(page: Page): Promise<number> {
  return page.evaluate(() => {
    const caps = Array.from(document.querySelectorAll<HTMLElement>(".dropcap"));
    if (caps.length === 0) return 0;

    // Clear any previous correction so re-runs measure from a known state.
    for (const c of caps) c.style.marginTop = "";
    void document.body.offsetHeight;

    const cv = document.createElement("canvas").getContext("2d")!;
    let adjusted = 0;

    for (const cap of caps) {
      const para = cap.closest("p");
      if (!para) continue;

      // --- ink top of the cap ---
      const csC = getComputedStyle(cap);
      cv.font = `${csC.fontStyle} ${csC.fontWeight} ${csC.fontSize} ${csC.fontFamily}`;
      const mC = cv.measureText(cap.textContent || "H");
      const ascC = mC.fontBoundingBoxAscent;
      const descC = mC.fontBoundingBoxDescent;
      const lhC = csC.lineHeight === "normal" ? ascC + descC : parseFloat(csC.lineHeight);
      const rC = cap.getBoundingClientRect();
      const baseC = rC.top + parseFloat(csC.paddingTop || "0") + (lhC - (ascC + descC)) / 2 + ascC;
      const inkC = baseC - mC.actualBoundingBoxAscent;

      // --- ink top of the first body line beside it ---
      const it = document.createNodeIterator(para, NodeFilter.SHOW_TEXT);
      let body: Text | null = null;
      let n: Node | null;
      while ((n = it.nextNode())) {
        const t = n as Text;
        if (cap.contains(t)) continue; // skip the cap's own letter
        if (t.data.trim().length > 2) {
          body = t;
          break;
        }
      }
      if (!body) continue;
      const rg = document.createRange();
      rg.setStart(body, 0);
      rg.setEnd(body, Math.min(20, body.data.length));
      const rB = rg.getClientRects()[0];
      if (!rB) continue;

      const csB = getComputedStyle(para);
      cv.font = `${csB.fontStyle} ${csB.fontWeight} ${csB.fontSize} ${csB.fontFamily}`;
      const mB = cv.measureText("Hh");
      const ascB = mB.fontBoundingBoxAscent;
      const descB = mB.fontBoundingBoxDescent;
      const lhB = csB.lineHeight === "normal" ? ascB + descB : parseFloat(csB.lineHeight);
      const baseB = rB.top + (lhB - (ascB + descB)) / 2 + ascB;
      const inkB = baseB - mB.actualBoundingBoxAscent;

      // Adjust RELATIVE to the margin already in the stylesheet. Writing
      // -delta absolutely would discard that margin, and since it is what the
      // cap was measured against, the cap would move by the wrong amount.
      const delta = inkC - inkB;
      if (Math.abs(delta) > 0.25) {
        cap.style.marginTop = `${parseFloat(csC.marginTop || "0") - delta}px`;
        adjusted++;
      }
    }
    return adjusted;
  });
}
