// Mirrors server/print.ts so the Print panel can show a live page-count + gutter
// estimate as options change, without a server round-trip.

const TRIM_DIMS: Record<string, [number, number]> = {
  "5x8": [5, 8],
  "5.25x8": [5.25, 8],
  "5.5x8.5": [5.5, 8.5],
  "6x9": [6, 9],
};

const CHARS_PER_SQIN = 53;

function textAreaSqIn(trim: string): number {
  const [w, h] = TRIM_DIMS[trim] ?? [6, 9];
  return Math.max(1, w - 1.2) * Math.max(1, h - 1.4);
}

export function estimatePages(bodyChars: number, trim: string, chapters = 0, otherSections = 0): number {
  const textPages = bodyChars > 0 ? bodyChars / (CHARS_PER_SQIN * textAreaSqIn(trim)) : 0;
  const overhead = chapters * 0.6 + otherSections;
  return Math.max(1, Math.round(textPages + overhead));
}

export function autoGutter(pages: number, binding: "paperback" | "hardcover"): number {
  const kdpMin = pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875;
  let g = kdpMin + 0.125;
  if (binding === "hardcover") g += 0.125;
  return Math.round(g * 1000) / 1000;
}

export function inchLabel(n: number): string {
  return `${n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}″`;
}
