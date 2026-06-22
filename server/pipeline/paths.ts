import { fileURLToPath } from "node:url";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", ".."); // project root
export const THEMES_DIR = path.join(ROOT, "themes");
export const FILTERS_DIR = path.join(ROOT, "server", "filters");
export const OUTPUT_DIR = path.join(ROOT, "output");
export const VENDOR_DIR = path.join(ROOT, "vendor");
export const MATTER_TEMPLATES_DIR = path.join(ROOT, "templates", "matter");

export function themeCss(theme: string): string {
  return path.join(THEMES_DIR, theme, "theme.css");
}

/** Shared base CSS + the theme's own CSS, in load order. */
export function themeCssFiles(theme: string): string[] {
  return [path.join(THEMES_DIR, "base.css"), themeCss(theme)];
}

export function printCss(theme: string): string {
  return path.join(THEMES_DIR, theme, "print.css");
}

/** Create a fresh temp working directory for one render. Caller cleans up. */
export async function makeTempDir(prefix = "bookwright-"): Promise<string> {
  const base = path.join(os.tmpdir(), "bookwright");
  await fs.mkdir(base, { recursive: true });
  return fs.mkdtemp(path.join(base, prefix));
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}
