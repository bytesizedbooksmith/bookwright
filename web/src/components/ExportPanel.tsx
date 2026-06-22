import { useState } from "react";
import type { BookMeta, ExportResult, Preset, Typography } from "../types";
import { api, downloadResult, formatBytes } from "../api";

interface Props {
  projectId: string;
  meta: BookMeta;
  theme: string;
  typography: Typography;
  presets: Preset[];
  hasCover: boolean;
}

interface Job {
  key: string;
  label: string;
  format: string;
  preset?: string;
}

export default function ExportPanel({ projectId, meta, theme, typography, presets, hasCover }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ExportResult | null>(null);

  const jobs: Job[] = [
    { key: "epub-kdp", label: "EPUB · Amazon KDP", format: "epub", preset: "kdp" },
    { key: "epub-universal", label: "EPUB · Universal", format: "epub", preset: "universal" },
    { key: "docx", label: "Word (.docx)", format: "docx" },
    { key: "md", label: "Compiled Markdown", format: "md" },
    { key: "pdf", label: "Reading PDF", format: "pdf" },
  ];

  async function runJob(job: Job) {
    setBusy(job.key);
    setError(null);
    setLast(null);
    try {
      const result = await api.export(projectId, job.format, { preset: job.preset, meta, theme, typography });
      downloadResult(result);
      setLast(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const preset = last ? presets.find((p) => last.filename.includes(p.name)) : undefined;
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
            <span className="text-xs text-slate-400">{busy === job.key ? "working…" : "download ↓"}</span>
          </button>
        ))}
      </div>

      {error && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      {last && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
          <div className="font-medium text-slate-700">
            {last.filename} — {formatBytes(last.bytes)}
          </div>
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
