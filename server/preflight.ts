// Startup dependency checks. Pandoc 3.x is required for every export; today a
// missing/old Pandoc is only discovered on the first export as an opaque error.
// This probes it once at boot (and on demand via /api/health) so the failure is
// surfaced up front with an actionable message. See reviews/2026-07-02-code-lens.md #2.

import { run } from "./pipeline/exec.ts";
import { PANDOC } from "./pipeline/pandoc.ts";

export interface PandocStatus {
  ok: boolean; // pandoc ran and reported a version
  version?: string; // e.g. "3.8"
  major?: number; // parsed major version
  supported?: boolean; // ok && major >= 3
  error?: string;
}

let cached: PandocStatus | null = null;

/** Run `pandoc --version` and parse the result. Cached after the first call. */
export async function checkPandoc(force = false): Promise<PandocStatus> {
  if (cached && !force) return cached;
  try {
    const r = await run(PANDOC, ["--version"]);
    if (r.code !== 0) {
      return (cached = { ok: false, error: `pandoc --version exited ${r.code}` });
    }
    const first = (r.stdout.split(/\r?\n/)[0] ?? "").trim();
    const m = first.match(/pandoc(?:\.exe)?\s+v?(\d+)\.(\d+(?:\.\d+)?)/i);
    const major = m ? parseInt(m[1], 10) : undefined;
    const version = m ? `${m[1]}.${m[2]}` : first || undefined;
    return (cached = { ok: true, version, major, supported: major !== undefined && major >= 3 });
  } catch (e) {
    // ENOENT etc. — not on PATH.
    return (cached = { ok: false, error: (e as Error).message });
  }
}

/** A console banner for a bad Pandoc status, or null if all is well. */
export function pandocBanner(s: PandocStatus): string | null {
  if (!s.ok) {
    return (
      "  ⚠  Pandoc was not found on your PATH — EPUB, DOCX and PDF export will fail.\n" +
      "     Install Pandoc 3.x → https://pandoc.org/installing.html"
    );
  }
  if (s.supported === false) {
    return (
      `  ⚠  Pandoc ${s.version} was found, but this tool needs 3.x — some exports may fail.\n` +
      "     Update Pandoc → https://pandoc.org/installing.html"
    );
  }
  return null;
}
