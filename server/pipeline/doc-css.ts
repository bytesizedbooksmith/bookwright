import { promises as fs } from "node:fs";
import path from "node:path";
import type { Book, StyleDef } from "./types.ts";

function fontFormat(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".otf":
      return "opentype";
    case ".woff2":
      return "woff2";
    case ".woff":
      return "woff";
    default:
      return "truetype";
  }
}

function fontMime(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".otf":
      return "font/otf";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    default:
      return "font/ttf";
  }
}

function familyValue(f: string): string {
  if (f.includes(",")) return f; // already a stack
  return /\s/.test(f) ? `"${f}"` : f; // quote single names with spaces
}

function styleDecls(s: StyleDef): string {
  const d: string[] = [];
  if (s.font) d.push(`font-family: ${familyValue(s.font)} !important;`);
  if (s.size) d.push(`font-size: ${s.size} !important;`);
  if (s.color) d.push(`color: ${s.color};`);
  if (s.align) d.push(`text-align: ${s.align};`);
  return d.join(" ");
}

function safeClass(c: string): string {
  return c.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Build CSS for the book's custom fonts + per-class style overrides.
 * - html/print: fonts are inlined as base64 data URIs (self-contained).
 * - epub: fonts are referenced by filename (Pandoc embeds them via --epub-embed-font).
 */
export async function buildDocCss(book: Book, target: "html" | "epub"): Promise<string> {
  const parts: string[] = [];

  for (const f of book.fonts) {
    let src: string;
    if (target === "epub") {
      // Pandoc embeds fonts under EPUB/fonts/ and writes our CSS to EPUB/styles/,
      // so the @font-face src must be relative to the stylesheet: ../fonts/<file>.
      src = `url('../fonts/${path.basename(f.file)}') format('${fontFormat(f.file)}')`;
    } else {
      const data = await fs.readFile(f.file);
      src = `url('data:${fontMime(f.file)};base64,${data.toString("base64")}') format('${fontFormat(f.file)}')`;
    }
    parts.push(
      `@font-face { font-family: "${f.family.replace(/"/g, '\\"')}"; ` +
        `font-weight: ${f.weight ?? "normal"}; font-style: ${f.style ?? "normal"}; src: ${src}; }`,
    );
  }

  for (const [cls, s] of Object.entries(book.styles)) {
    const decls = styleDecls(s);
    if (decls) parts.push(`.${safeClass(cls)} { ${decls} }`);
  }

  parts.push(typographyCss(book));

  return parts.filter(Boolean).join("\n");
}

/** Per-book typography overrides (body/heading font, chapter-title style). */
function typographyCss(book: Book): string {
  const ty = book.typography ?? {};
  const out: string[] = [];

  const bodyDecls: string[] = [];
  if (ty.bodyFont) bodyDecls.push(`font-family: ${familyValue(ty.bodyFont)} !important;`);
  // !important so the author's size/leading survive the print path, where
  // print-base.css (body { font-size: 11pt; line-height: 1.4 }) is injected AFTER
  // this stylesheet and would otherwise win at equal specificity. See
  // reviews/2026-07-02-creative-lens-fable5.md issue #2.
  if (ty.fontSize) bodyDecls.push(`font-size: ${ty.fontSize} !important;`);
  if (ty.lineHeight) bodyDecls.push(`line-height: ${ty.lineHeight} !important;`);
  if (bodyDecls.length) out.push(`body { ${bodyDecls.join(" ")} }`);

  if (ty.headingFont) {
    out.push(`h1, h2, h3, section.chapter > h1, h1.chapter { font-family: ${familyValue(ty.headingFont)} !important; }`);
  }

  const ct = ty.chapterTitle;
  if (ct) {
    const d: string[] = [];
    if (ct.size) d.push(`font-size: ${ct.size};`);
    if (ct.align) d.push(`text-align: ${ct.align};`);
    if (ct.style) d.push(`font-style: ${ct.style};`);
    if (ct.case === "smallcaps") d.push(`font-variant: small-caps; text-transform: none;`);
    else if (ct.case === "uppercase") d.push(`text-transform: uppercase; font-variant: normal;`);
    else if (ct.case === "normal") d.push(`text-transform: none; font-variant: normal;`);
    if (d.length) out.push(`section.chapter > h1, h1.chapter { ${d.join(" ")} }`);
  }

  return out.join("\n");
}

/** The font files to embed into the EPUB (for --epub-embed-font). */
export function epubFontFiles(book: Book): string[] {
  return book.fonts.map((f) => f.file);
}
