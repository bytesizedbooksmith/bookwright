import type { ThemeName } from "./types.ts";

export interface ThemeConfig {
  name: ThemeName;
  label: string;
  description: string;
  sceneOrnament: string; // glyph(s) used for "* * *" scene breaks
  dropcap: boolean; // large initial letter on the first paragraph of a chapter
}

export const THEMES: Record<ThemeName, ThemeConfig> = {
  classic: {
    name: "classic",
    label: "Classic",
    description: "Traditional serif body with understated centered chapter titles.",
    sceneOrnament: "* * *",
    dropcap: false,
  },
  modern: {
    name: "modern",
    label: "Modern",
    description: "Clean sans-serif headings, generous spacing, minimalist scene breaks.",
    sceneOrnament: "•   •   •",
    dropcap: false,
  },
  decorative: {
    name: "decorative",
    label: "Decorative",
    description: "Serif body with drop caps and a floral ornament between scenes.",
    sceneOrnament: "❧",
    dropcap: true,
  },
};

export function getTheme(name: string): ThemeConfig {
  return THEMES[(name as ThemeName) in THEMES ? (name as ThemeName) : "classic"];
}

export function themeList(): ThemeConfig[] {
  return Object.values(THEMES);
}
