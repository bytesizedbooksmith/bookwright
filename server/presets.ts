import type { PresetName } from "./pipeline/types.ts";

export interface EpubPreset {
  name: PresetName;
  label: string;
  description: string;
  /** Embed fonts into the EPUB for consistent rendering across apps. */
  embedFonts: boolean;
  /** Soft warning threshold (bytes) — KDP charges per MB; BookFunnel emails up to ~23MB. */
  sizeWarnBytes: number;
}

export const PRESETS: Record<PresetName, EpubPreset> = {
  kdp: {
    name: "kdp",
    label: "Amazon KDP",
    description:
      "Reader-controlled fonts and relative sizing. No embedded body fonts to keep the converted file (and per-MB delivery fee) small.",
    embedFonts: false,
    sizeWarnBytes: 50 * 1024 * 1024,
  },
  universal: {
    name: "universal",
    label: "Universal (Curios / BookFunnel / your site)",
    description:
      "Standards-clean EPUB 3 with an embedded cover, suitable for direct sales and ARC delivery. Kept under ~23 MB so BookFunnel email delivery works.",
    embedFonts: true,
    sizeWarnBytes: 23 * 1024 * 1024,
  },
};

export function getPreset(name: string): EpubPreset {
  return PRESETS[(name as PresetName) in PRESETS ? (name as PresetName) : "universal"];
}
