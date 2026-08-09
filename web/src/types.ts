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
  cover?: string;
  theme: string;
}

export interface SectionSummary {
  id: string;
  title: string;
  kind: string;
  toc: boolean;
}

export interface BookConfig {
  frontmatter: string[];
  backmatter: string[];
  chapters: string | null;
}

export interface ChapterTitleStyle {
  size?: string;
  case?: "normal" | "smallcaps" | "uppercase";
  align?: "left" | "center" | "right";
  style?: "normal" | "italic";
}

export interface Typography {
  bodyFont?: string;
  headingFont?: string;
  fontSize?: string;
  lineHeight?: number | string;
  dropcap?: boolean;
  sceneOrnament?: string;
  chapterTitle?: ChapterTitleStyle;
}

export interface ProjectSummary {
  projectId: string;
  meta: BookMeta;
  sections: SectionSummary[];
  warnings: string[];
  hasCover: boolean;
  bodyChars: number;
  fontFamilies: string[];
  typography: Typography;
  source: "folder" | "upload" | "sample";
  folder: string | null;
  editable: boolean;
  config: BookConfig | null;
}

export interface MatterType {
  key: string;
  label: string;
  placement: "frontmatter" | "backmatter";
  file: string;
}

export interface Trim {
  key: string;
  label: string;
  w: number;
  h: number;
}

export interface PrintLayout {
  key: string;
  label: string;
}

export interface PrintOptions {
  trim: string;
  binding: "paperback" | "hardcover";
  startChaptersRecto: boolean;
  layout: string;
  gutter?: number; // manual inner-margin override; omit for auto
}

export interface Theme {
  name: string;
  label: string;
  description: string;
  sceneOrnament: string;
  dropcap: boolean;
}

export interface Preset {
  name: string;
  label: string;
  description: string;
  embedFonts: boolean;
  sizeWarnBytes: number;
}

export interface ValidationMessage {
  severity: "error" | "warning" | "info";
  text: string;
}

export interface ValidationReport {
  tool: "epubcheck" | "builtin";
  valid: boolean;
  messages: ValidationMessage[];
  note?: string;
}

export interface ExportResult {
  /** True when the server wrote the file itself; false means download the bytes. */
  written?: boolean;
  /** Set instead of a result when the artifact already exists at this version. */
  needsConfirm?: boolean;
  message?: string;

  filename?: string;
  mime?: string;
  dataBase64?: string;
  bytes: number;
  path?: string;
  version?: number;
  archived?: string[];
  overwrote?: boolean;

  validation?: ValidationReport;
  pages?: number;
  gutter?: number;

  // Blues only.
  totalPages?: number;
  firstChapter?: number;
  lastChapter?: number;
  totalChapters?: number;
  round?: number;
  maxRounds?: number;
  roundWarning?: string | null;
}

export interface PrintPreviewResult {
  html: string;
  pages: number;
  gutter: number;
}
