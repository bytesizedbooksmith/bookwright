import { useState } from "react";
import type { BookMeta, ExportResult, Preset, ProjectSummary, Typography } from "../types";
import { api, downloadResult, formatBytes } from "../api";

interface Props {
  projectId: string;
  meta: BookMeta;
  theme: string;
  typography: Typography;
  presets: Preset[];
  hasCover: boolean;
  /** Opened from a real folder, so the server can write exports where they belong. */
  onDisk: boolean;
  /** `blues_output` from book.yaml, or null when this book has no review folder yet. */
  bluesOutput: string | null;
  onSettingsSaved: (summary: ProjectSummary) => void;
}

/**
 * The review folder is stored per book in book.yaml, so it travels with the book.
 * But it's almost always the same folder for every book, and picking it once per
 * book is silly — so the last choice is remembered here and offered as the
 * starting point for the next one.
 */
const LAST_REVIEW_FOLDER = "bsbf.lastReviewFolder";

interface Job {
  key: string;
  label: string;
  format: string;
  preset?: string;
}

export default function ExportPanel({
  projectId,
  meta,
  theme,
  typography,
  presets,
  hasCover,
  onDisk,
  bluesOutput,
  onSettingsSaved,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ExportResult | null>(null);
  const [pageCap, setPageCap] = useState("50");
  const [newRound, setNewRound] = useState(false);

  const remembered = typeof localStorage !== "undefined" ? localStorage.getItem(LAST_REVIEW_FOLDER) : null;

  async function chooseReviewFolder() {
    setError(null);
    try {
      // Seeded with the last folder chosen, so the second book is one click.
      const { path } = await api.pickFolder(bluesOutput ?? remembered ?? undefined);
      if (!path) return;
      const summary = await api.saveExportSettings(projectId, path);
      localStorage.setItem(LAST_REVIEW_FOLDER, path);
      onSettingsSaved(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function useRemembered() {
    if (!remembered) return;
    setError(null);
    try {
      onSettingsSaved(await api.saveExportSettings(projectId, remembered));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const jobs: Job[] = [
    { key: "epub-kdp", label: "EPUB · Amazon KDP", format: "epub", preset: "kdp" },
    { key: "epub-universal", label: "EPUB · Universal", format: "epub", preset: "universal" },
    { key: "docx", label: "Word (.docx)", format: "docx" },
    { key: "md", label: "Compiled Markdown", format: "md" },
    { key: "pdf", label: "Reading PDF", format: "pdf" },
  ];

  async function runJob(job: Job, extra: Record<string, unknown> = {}, force = false) {
    setBusy(job.key);
    setError(null);
    setLast(null);
    try {
      const result = await api.export(projectId, job.format, {
        preset: job.preset,
        meta,
        theme,
        typography,
        force,
        ...extra,
      });

      // The artifact already exists at this version. Ask, then retry with force —
      // regenerating from an unchanged source is usually a mistake.
      if (result.needsConfirm) {
        if (window.confirm(`${result.message}\n\nRegenerate and overwrite it?`)) {
          await runJob(job, extra, true);
          return;
        }
        setBusy(null);
        return;
      }

      // Written server-side when the book has a real folder; otherwise the
      // browser downloads it, which can only ever land in Downloads.
      if (!result.written) downloadResult(result);
      setLast(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function runBlues() {
    const n = Number(pageCap);
    return runJob(
      { key: "blues", label: "Blues", format: "blues" },
      { pages: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined, newRound },
    );
  }

  const preset = last?.filename ? presets.find((p) => last.filename!.includes(p.name)) : undefined;
  const sizeWarn = last && preset && last.bytes > preset.sizeWarnBytes;

  return (
    <div className="space-y-2">
      {!hasCover && (
        <div className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
          ⚠ No cover yet. EPUBs for KDP, Curios &amp; BookFunnel need a cover. Add one under <strong>Book details</strong>
          (Replace), or drop a <code>cover.png</code>/<code>.jpg</code> in your folder.
        </div>
      )}
      <div className="grid grid-cols-1 gap-1.5">
        {jobs.map((job) => (
          <button
            key={job.key}
            disabled={busy !== null}
            onClick={() => runJob(job)}
            className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
          >
            <span>{job.label}</span>
            <span className="text-xs text-slate-400">
              {busy === job.key ? "working…" : onDisk ? "write →" : "download ↓"}
            </span>
          </button>
        ))}
      </div>

      {/* Blues — the markup PDF. Its own block because it takes options and goes
          to a different destination from everything else. */}
      <div className="rounded-lg border border-slate-300 bg-white p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-700">Blues (markup PDF)</span>
          <span className="text-[11px] text-slate-400">→ review folder</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Wide right margin for Apple Pencil. Chapters only — no front or back matter.
        </p>

        {/* Where it goes. Per book, because the destination should travel with
            the book — but seeded from the last one chosen. */}
        {onDisk &&
          (bluesOutput ? (
            <div className="mt-2 flex items-baseline justify-between gap-2 text-[11px]">
              <span className="break-all text-slate-500">
                <span className="text-slate-400">to </span>
                {bluesOutput}
              </span>
              <button onClick={chooseReviewFolder} className="shrink-0 text-slate-400 underline hover:text-slate-600">
                change
              </button>
            </div>
          ) : (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
              <p className="font-medium">No review folder set for this book yet.</p>
              <p className="mt-0.5">This is where the blues lands so your tablet can see it.</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  onClick={chooseReviewFolder}
                  className="rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900 hover:bg-amber-100"
                >
                  📁 Choose review folder…
                </button>
                {remembered && (
                  <button onClick={useRemembered} className="text-amber-800 underline hover:text-amber-900">
                    use {remembered}
                  </button>
                )}
              </div>
            </div>
          ))}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Stop after
            <input
              type="number"
              min={1}
              value={pageCap}
              onChange={(e) => setPageCap(e.target.value)}
              className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
            />
            pages
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={newRound} onChange={(e) => setNewRound(e.target.checked)} />
            New round
          </label>
        </div>
        {/* Gated before the render, not after it — finding out that there is
            nowhere to put the file only once it exists is a waste of a minute. */}
        <button
          disabled={busy !== null || !onDisk || !bluesOutput}
          onClick={runBlues}
          title={
            !onDisk
              ? "Open the book from a folder — a blues is written to your review folder."
              : !bluesOutput
                ? "Choose a review folder first."
                : undefined
          }
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
        >
          {busy === "blues" ? "working…" : "Generate blues"}
        </button>
        {!onDisk && (
          <p className="mt-1 text-[11px] text-amber-700">
            Needs a book opened from a folder — a dropped copy has nowhere permanent to write to.
          </p>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      {last && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
          <div className="font-medium text-slate-700">
            {last.filename} — {formatBytes(last.bytes)}
            {last.version !== undefined && <span className="text-slate-400"> · v{last.version}</span>}
          </div>
          {last.written ? (
            <div className="mt-1 break-all text-slate-500">
              <span className="text-emerald-700">✓ written</span> → {last.path}
              {last.overwrote && <span className="text-slate-400"> (replaced in place)</span>}
            </div>
          ) : (
            <div className="mt-1 text-slate-400">downloaded — this project has no folder to write to</div>
          )}
          {last.archived && last.archived.length > 0 && (
            <div className="mt-1 text-slate-500">archived {last.archived.join(", ")}</div>
          )}
          {last.pages !== undefined && last.firstChapter !== undefined && (
            <div className="mt-1 text-slate-500">
              {last.pages} pages · chapters {last.firstChapter}–{last.lastChapter} of {last.totalChapters}
              {last.round !== undefined && ` · round ${last.round} of ${last.maxRounds}`}
            </div>
          )}
          {last.roundWarning && (
            <div className="mt-1 whitespace-pre-line text-amber-700">{last.roundWarning}</div>
          )}
          {sizeWarn && (
            <div className="mt-1 text-amber-700">
              ⚠ Larger than {formatBytes(preset!.sizeWarnBytes)} — may exceed this channel's comfortable limit.
            </div>
          )}
          {last.validation && (
            <div className="mt-1">
              <span className={last.validation.valid ? "text-emerald-700" : "text-red-700"}>
                {last.validation.valid ? "✓ Valid" : "✗ Invalid"} EPUB
              </span>
              <span className="text-slate-400"> · checked by {last.validation.tool}</span>
              {last.validation.messages.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {last.validation.messages.slice(0, 12).map((m, i) => (
                    <li
                      key={i}
                      className={
                        m.severity === "error"
                          ? "text-red-700"
                          : m.severity === "warning"
                            ? "text-amber-700"
                            : "text-slate-500"
                      }
                    >
                      • {m.text}
                    </li>
                  ))}
                </ul>
              )}
              {last.validation.note && <div className="mt-1 text-slate-400">{last.validation.note}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
