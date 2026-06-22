import { useEffect, useState } from "react";
import type { BookMeta, PrintLayout, PrintOptions, Trim, Typography } from "../types";
import { api, downloadResult, formatBytes } from "../api";
import { autoGutter, estimatePages, inchLabel } from "../print-estimate";

interface Props {
  projectId: string;
  meta: BookMeta;
  theme: string;
  typography: Typography;
  bodyChars: number;
  chapters: number;
  otherSections: number;
  opts: PrintOptions;
  onChange: (opts: PrintOptions) => void;
  onShowPreview: () => void;
}

export default function PrintPanel({
  projectId,
  meta,
  theme,
  typography,
  bodyChars,
  chapters,
  otherSections,
  opts,
  onChange,
  onShowPreview,
}: Props) {
  const [trims, setTrims] = useState<Trim[]>([]);
  const [layouts, setLayouts] = useState<PrintLayout[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ filename: string; bytes: number; pages?: number; gutter?: number } | null>(null);

  const estPages = estimatePages(bodyChars, opts.trim, chapters, otherSections);
  const estGutter = opts.gutter ?? autoGutter(estPages, opts.binding);

  useEffect(() => {
    api.trims().then(setTrims).catch(() => {});
    api.printLayouts().then(setLayouts).catch(() => {});
  }, []);

  function set<K extends keyof PrintOptions>(k: K, v: PrintOptions[K]) {
    onChange({ ...opts, [k]: v });
    setDone(null);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await api.export(projectId, "print", { meta, theme, print: opts, typography });
      downloadResult(result);
      setDone({ filename: result.filename, bytes: result.bytes, pages: result.pages, gutter: result.gutter });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Trim size</span>
        <select
          value={opts.trim}
          onChange={(e) => set("trim", e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {trims.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">Binding</span>
        <div className="flex gap-2">
          {(["paperback", "hardcover"] as const).map((b) => (
            <button
              key={b}
              onClick={() => set("binding", b)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition ${
                opts.binding === b
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Hardcover adds a wider gutter for binding.</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Header &amp; footer</span>
        <select
          value={opts.layout}
          onChange={(e) => set("layout", e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {layouts.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          Running head sits top-center (left page / right page); the page number sits where the option says.
          Title and chapter-opening pages stay clean.
        </p>
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={opts.startChaptersRecto}
          onChange={(e) => set("startChaptersRecto", e.target.checked)}
        />
        Start chapters on a right-hand page
      </label>

      <div className="rounded-md bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
        ≈ <strong>{estPages}</strong> pages · gutter <strong>{inchLabel(estGutter)}</strong>
        {opts.gutter === undefined && <span className="text-slate-400"> (auto, KDP-safe)</span>}
        <div className="mt-0.5 text-slate-400">
          Inner margin scales with page count so the spine never swallows the text. Estimated until you generate.
        </div>
      </div>

      <button
        onClick={onShowPreview}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        👁 Preview in print view
      </button>
      <button
        disabled={busy}
        onClick={generate}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Generating… (this takes a few seconds)" : "Generate print PDF ↓"}
      </button>

      {error && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      {done && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          {done.filename} — {formatBytes(done.bytes)}
          {done.pages != null && (
            <div className="mt-0.5 text-slate-500">
              {done.pages} pages · gutter {inchLabel(done.gutter ?? 0)} applied
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] leading-snug text-slate-400">
        Interior PDF for KDP / IngramSpark. Mirrored margins, running heads, page numbers, and recto chapter
        openings. (A separate cover wrap is created in your print provider.)
      </p>
    </div>
  );
}
