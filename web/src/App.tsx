import { useEffect, useState } from "react";
import { api } from "./api";
import type { BookMeta, MatterType, Preset, PrintOptions, ProjectSummary, Theme, Typography } from "./types";
import LoadPanel from "./components/LoadPanel";
import MetadataForm from "./components/MetadataForm";
import ThemePicker from "./components/ThemePicker";
import ExportPanel from "./components/ExportPanel";
import PrintPanel from "./components/PrintPanel";
import TypographyPanel from "./components/TypographyPanel";
import DevicePreview from "./components/DevicePreview";
import Collapsible from "./components/Collapsible";
import MatterManager from "./components/MatterManager";

export default function App() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [matterTypes, setMatterTypes] = useState<MatterType[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [ebookHtml, setEbookHtml] = useState("");
  const [ebookLoading, setEbookLoading] = useState(false);
  const [printHtml, setPrintHtml] = useState("");
  const [printLoading, setPrintLoading] = useState(false);
  const [view, setView] = useState("fit"); // fit | kindle | kobo | phone | tablet | print
  const [printOpts, setPrintOpts] = useState<PrintOptions>({
    trim: "6x9",
    binding: "paperback",
    startChaptersRecto: true,
    layout: "author-title-bottom",
  });
  const [typography, setTypography] = useState<Typography>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverVersion, setCoverVersion] = useState(0);
  const [metaSave, setMetaSave] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    api.themes().then(setThemes).catch(() => {});
    api.presets().then(setPresets).catch(() => {});
    api.matterTypes().then(setMatterTypes).catch(() => {});
  }, []);

  // Debounced live ebook preview whenever metadata or theme changes.
  useEffect(() => {
    if (!project || !meta) return;
    setEbookLoading(true);
    const t = setTimeout(async () => {
      try {
        const { html } = await api.preview(project.projectId, meta, meta.theme, typography);
        setEbookHtml(html);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setEbookLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [meta, project, typography]);

  // Paginated print preview — only fetched while the Print view is active
  // (it runs Paged.js in Chromium, so it's heavier than the ebook preview).
  useEffect(() => {
    if (!project || !meta || view !== "print") return;
    setPrintLoading(true);
    const t = setTimeout(async () => {
      try {
        const { html } = await api.previewPrint(project.projectId, meta, meta.theme, printOpts, typography);
        setPrintHtml(html);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPrintLoading(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [meta, project, view, printOpts, typography]);

  function adopt(summary: ProjectSummary) {
    setProject(summary);
    setMeta(summary.meta);
    setTypography(summary.typography ?? {});
    setCoverVersion((v) => v + 1);
    setError(null);
  }

  async function guard(fn: () => Promise<ProjectSummary>) {
    setBusy(true);
    setError(null);
    try {
      adopt(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const handleFiles = (files: File[]) => guard(() => api.uploadFiles(files));
  const handleSample = () => guard(() => api.loadSample());
  const handleOpenFolder = (path: string) => guard(() => api.openFolder(path));
  const handleReload = () => project && guard(() => api.reload(project.projectId));

  async function handleCover(file: File) {
    if (!project) return;
    try {
      const summary = await api.updateCover(project.projectId, file);
      setProject(summary);
      setCoverVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Matter actions return a fresh summary; keep meta edits, refresh structure/config.
  function onMatterUpdated(summary: ProjectSummary) {
    setProject(summary);
    setError(null);
  }

  function editMeta(patch: Partial<BookMeta>) {
    if (!meta) return;
    setMeta({ ...meta, ...patch });
    if (metaSave !== "idle") setMetaSave("idle");
  }

  async function handleSaveMeta() {
    if (!project || !meta) return;
    setMetaSave("saving");
    try {
      setProject(await api.saveMeta(project.projectId, meta));
      setMetaSave("saved");
      setTimeout(() => setMetaSave((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMetaSave("error");
    }
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      <aside className="flex w-[390px] flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-5 py-4">
          <h1 className="text-lg font-bold text-slate-800">
            Bookwright <span className="text-emerald-600">📖</span>
          </h1>
          <p className="text-xs text-slate-500">Markdown → ebook · print · DOCX · PDF</p>
        </header>

        <div className="flex-1 overflow-y-auto px-5">
          <Collapsible title="Manuscript" defaultOpen>
            <LoadPanel busy={busy} onFiles={handleFiles} onSample={handleSample} onOpenFolder={handleOpenFolder} />
            {error && <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}
            {project && (
              <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    {project.source === "folder" ? "Folder on disk" : project.source === "sample" ? "Sample book" : "Uploaded"}
                  </span>
                  <button
                    disabled={busy}
                    onClick={handleReload}
                    className="rounded bg-slate-700 px-2 py-0.5 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    ↻ Reload
                  </button>
                </div>
                {project.folder && <div className="mt-1 break-all font-mono text-[10px] text-slate-400">{project.folder}</div>}
              </div>
            )}
            {project && project.warnings.length > 0 && (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                {project.warnings.map((w, i) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </div>
            )}
          </Collapsible>

          {project && meta && (
            <>
              <Collapsible title="Theme">
                <ThemePicker themes={themes} value={meta.theme} onChange={(t) => editMeta({ theme: t })} />
              </Collapsible>

              <Collapsible title="Typography" defaultOpen={false}>
                <TypographyPanel
                  projectId={project.projectId}
                  meta={meta}
                  fontFamilies={project.fontFamilies}
                  editable={project.editable}
                  typography={typography}
                  onChange={setTypography}
                  onSaved={(s) => {
                    setProject(s);
                    setError(null);
                  }}
                />
              </Collapsible>

              <Collapsible title="Book details">
                <MetadataForm
                  meta={meta}
                  onChange={editMeta}
                  projectId={project.projectId}
                  hasCover={project.hasCover}
                  coverVersion={coverVersion}
                  onCover={handleCover}
                />
                {project.editable ? (
                  <button
                    onClick={handleSaveMeta}
                    disabled={metaSave === "saving"}
                    className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
                      metaSave === "saved"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-700 text-white hover:bg-slate-800"
                    }`}
                  >
                    {metaSave === "saving"
                      ? "Saving…"
                      : metaSave === "saved"
                        ? "Saved to book.yaml ✓"
                        : "Save details to book.yaml"}
                  </button>
                ) : (
                  <p className="mt-3 text-[11px] leading-snug text-slate-400">
                    Open your book as a <strong>folder on disk</strong> to save details permanently.
                  </p>
                )}
              </Collapsible>

              {project.editable && (
                <Collapsible title="Front & back matter">
                  <MatterManager
                    projectId={project.projectId}
                    config={project.config}
                    matterTypes={matterTypes}
                    meta={meta}
                    onUpdated={onMatterUpdated}
                  />
                </Collapsible>
              )}

              <Collapsible title="Structure" defaultOpen={false}>
                <ol className="space-y-0.5 text-xs text-slate-600">
                  {project.sections.map((s) => (
                    <li key={s.id} className="flex items-center justify-between">
                      <span className={s.kind === "chapter" ? "font-medium text-slate-800" : ""}>{s.title}</span>
                      <span className="text-[10px] uppercase text-slate-400">{s.kind}</span>
                    </li>
                  ))}
                </ol>
              </Collapsible>

              <Collapsible title="Export (ebook)">
                <ExportPanel
                  projectId={project.projectId}
                  meta={meta}
                  theme={meta.theme}
                  typography={typography}
                  presets={presets}
                  hasCover={project.hasCover}
                />
              </Collapsible>

              <Collapsible title="Print book (PDF)" defaultOpen={false}>
                <PrintPanel
                  projectId={project.projectId}
                  meta={meta}
                  theme={meta.theme}
                  typography={typography}
                  bodyChars={project.bodyChars}
                  chapters={project.sections.filter((s) => s.kind === "chapter").length}
                  otherSections={project.sections.filter((s) => s.kind !== "chapter").length}
                  opts={printOpts}
                  onChange={setPrintOpts}
                  onShowPreview={() => setView("print")}
                />
              </Collapsible>
            </>
          )}
          <div className="h-8" />
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <DevicePreview
          html={view === "print" ? printHtml : ebookHtml}
          loading={view === "print" ? printLoading : ebookLoading}
          value={view}
          onChange={setView}
        />
      </main>
    </div>
  );
}
