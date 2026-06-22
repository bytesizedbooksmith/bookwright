// Core data model shared across the pipeline.

export type ThemeName = "classic" | "modern" | "decorative";
export type PresetName = "kdp" | "universal";

export interface BookMeta {
  title: string;
  subtitle?: string;
  author: string;
  series?: string;
  series_index?: number | string;
  publisher?: string;
  language: string;
  isbn?: string;
  description?: string;
  copyright?: string;
  rights?: string;
  cover?: string; // path relative to baseDir (as authored)
  theme: ThemeName;
}

export type SectionKind =
  | "titlepage"
  | "copyright"
  | "frontmatter"
  | "chapter"
  | "backmatter";

export interface Section {
  id: string; // unique slug, used as anchor / epub split id
  title: string; // used for the navigation TOC
  kind: SectionKind;
  className?: string; // extra body class, e.g. "dedication", "epigraph"
  toc: boolean; // include in the navigation TOC
  showTitle: boolean; // render the title as a visible heading
  markdown: string; // body markdown (no leading H1, no YAML frontmatter)
  generated?: boolean; // produced from metadata (titlepage / copyright)
}

export interface FontDef {
  file: string; // absolute path to the font file
  family: string; // CSS font-family name to register
  weight?: string | number;
  style?: string;
}

export interface StyleDef {
  font?: string; // CSS font-family (a registered family or a stack)
  size?: string; // e.g. "1.05em"
  color?: string;
  align?: string; // left | center | right
}

export interface ChapterTitleStyle {
  size?: string; // e.g. "1.8em"
  case?: "normal" | "smallcaps" | "uppercase";
  align?: "left" | "center" | "right";
  style?: "normal" | "italic";
}

export interface Typography {
  bodyFont?: string; // family name (registered custom or system stack)
  headingFont?: string;
  fontSize?: string; // base size, e.g. "12pt"
  lineHeight?: number | string;
  dropcap?: boolean; // override the theme default
  sceneOrnament?: string; // override the theme ornament
  chapterTitle?: ChapterTitleStyle;
}

export interface Book {
  meta: BookMeta;
  sections: Section[];
  baseDir: string; // absolute folder the book was loaded from
  coverPath?: string; // absolute path to cover image, if any
  fonts: FontDef[]; // custom fonts to embed
  styles: Record<string, StyleDef>; // per-class style overrides (journal, letter, …)
  typography: Typography; // per-book typography overrides
}

export interface IngestWarning {
  message: string;
}

export interface IngestResult {
  book: Book;
  warnings: IngestWarning[];
}
