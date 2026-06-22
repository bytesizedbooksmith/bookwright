import { useState } from "react";
import type { BookConfig, BookMeta, MatterType, ProjectSummary } from "../types";
import { api } from "../api";

interface Props {
  projectId: string;
  config: BookConfig | null;
  matterTypes: MatterType[];
  meta: BookMeta;
  onUpdated: (s: ProjectSummary) => void;
}

const GENERATED: Record<string, string> = { titlepage: "Title page", copyright: "Copyright" };

function labelFor(entry: string, matterTypes: MatterType[]): { label: string; note?: string } {
  if (GENERATED[entry]) return { label: GENERATED[entry], note: "generated" };
  const file = entry.split("/").pop() ?? entry;
  const match = matterTypes.find((m) => m.file === file);
  if (match) return { label: match.label, note: file };
  const stem = file.replace(/\.(md|markdown)$/i, "").replace(/[-_]/g, " ");
  return { label: stem.replace(/\b\w/g, (c) => c.toUpperCase()), note: file };
}

export default function MatterManager({ projectId, config, matterTypes, meta, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAdd, setOpenAdd] = useState<"frontmatter" | "backmatter" | null>(null);

  async function call(fn: () => Promise<ProjectSummary>) {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setOpenAdd(null);
    }
  }

  function move(placement: "frontmatter" | "backmatter", list: string[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const order = [...list];
    [order[i], order[j]] = [order[j], order[i]];
    call(() => api.reorderMatter(projectId, placement, order));
  }

  function List({ placement, list }: { placement: "frontmatter" | "backmatter"; list: string[] }) {
    const types = matterTypes; // any type can go in either list
    return (
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {placement === "frontmatter" ? "Front matter" : "Back matter"}
          </span>
          <div className="relative">
            <button
              disabled={busy}
              onClick={() => setOpenAdd(openAdd === placement ? null : placement)}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              + Add ▾
            </button>
            {openAdd === placement && (
              <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                {types.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => call(() => api.addMatter(projectId, t.key, placement, meta))}
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-emerald-50"
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const title = prompt("Section title?")?.trim();
                    if (title) call(() => api.addMatter(projectId, "custom", placement, meta, title));
                  }}
                  className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-emerald-50"
                >
                  Custom…
                </button>
              </div>
            )}
          </div>
        </div>

        {list.length === 0 ? (
          <p className="text-[11px] text-slate-400">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {list.map((entry, i) => {
              const { label, note } = labelFor(entry, matterTypes);
              const generated = Boolean(GENERATED[entry]);
              return (
                <li
                  key={entry}
                  className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {label}
                    {note && <span className="ml-1 text-[10px] text-slate-400">{note}</span>}
                  </span>
                  <span className="flex items-center gap-0.5 text-slate-400">
                    <button disabled={busy || i === 0} onClick={() => move(placement, list, i, -1)} className="px-1 hover:text-slate-700 disabled:opacity-30" title="Move up">↑</button>
                    <button disabled={busy || i === list.length - 1} onClick={() => move(placement, list, i, 1)} className="px-1 hover:text-slate-700 disabled:opacity-30" title="Move down">↓</button>
                    <button
                      disabled={busy}
                      onClick={() => call(() => api.removeMatter(projectId, entry))}
                      className="px-1 text-red-400 hover:text-red-600 disabled:opacity-30"
                      title={generated ? "Remove (this is generated from your metadata)" : "Remove"}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div>
      {!config && (
        <button
          disabled={busy}
          onClick={() => call(() => api.scaffold(projectId, meta))}
          className="mb-3 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          Set up front &amp; back matter (creates book.yaml)
        </button>
      )}
      <List placement="frontmatter" list={config?.frontmatter ?? []} />
      <List placement="backmatter" list={config?.backmatter ?? []} />
      {error && <div className="rounded bg-red-50 p-2 text-[11px] text-red-700">{error}</div>}
      <p className="text-[11px] leading-snug text-slate-400">
        Each item is a Markdown file in your book folder — edit it in your own editor, then Reload.
      </p>
    </div>
  );
}
