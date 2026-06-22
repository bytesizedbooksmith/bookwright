import { useState } from "react";
import type { BookMeta, ProjectSummary, Typography } from "../types";
import { api } from "../api";

interface Props {
  projectId: string;
  meta: BookMeta;
  fontFamilies: string[]; // custom embedded families
  editable: boolean;
  typography: Typography;
  onChange: (t: Typography) => void;
  onSaved: (s: ProjectSummary) => void;
}

const SYSTEM_FONTS = [
  "Georgia",
  "Palatino Linotype",
  "Iowan Old Style",
  "Book Antiqua",
  "Times New Roman",
  "Garamond",
  "Baskerville",
  "Helvetica Neue",
  "Segoe UI",
  "Arial",
  "Verdana",
  "system-ui",
];

const ORNAMENTS = ["* * *", "•  •  •", "❧", "❦", "✦  ✦  ✦", "⁂", "— ⁂ —"];

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function FontOptions({ families }: { families: string[] }) {
  return (
    <>
      <option value="">Theme default</option>
      {families.length > 0 && (
        <optgroup label="Your embedded fonts">
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="System fonts">
        {SYSTEM_FONTS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export default function TypographyPanel({ projectId, meta, fontFamilies, editable, typography, onChange, onSaved }: Props) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function set(patch: Partial<Typography>) {
    onChange({ ...typography, ...patch });
    setSaveState("idle");
  }
  function setCT(patch: Partial<NonNullable<Typography["chapterTitle"]>>) {
    onChange({ ...typography, chapterTitle: { ...(typography.chapterTitle ?? {}), ...patch } });
    setSaveState("idle");
  }

  const ct = typography.chapterTitle ?? {};
  const dropcapValue = typography.dropcap === undefined ? "" : typography.dropcap ? "on" : "off";

  async function save() {
    setSaveState("saving");
    setError(null);
    try {
      onSaved(await api.saveTypography(projectId, meta, typography));
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveState("error");
    }
  }

  return (
    <div className="space-y-3">
      <Select label="Body font" value={typography.bodyFont ?? ""} onChange={(v) => set({ bodyFont: v || undefined })}>
        <FontOptions families={fontFamilies} />
      </Select>
      <Select label="Heading font" value={typography.headingFont ?? ""} onChange={(v) => set({ headingFont: v || undefined })}>
        <FontOptions families={fontFamilies} />
      </Select>

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Drop caps"
          value={dropcapValue}
          onChange={(v) => set({ dropcap: v === "" ? undefined : v === "on" })}
        >
          <option value="">Theme default</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </Select>
        <Select
          label="Scene break"
          value={typography.sceneOrnament ?? ""}
          onChange={(v) => set({ sceneOrnament: v || undefined })}
        >
          <option value="">Theme default</option>
          {ORNAMENTS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Chapter title</span>
        <div className="grid grid-cols-2 gap-2">
          <Select label="Size" value={ct.size ?? ""} onChange={(v) => setCT({ size: v || undefined })}>
            <option value="">Default</option>
            <option value="1.4em">Small</option>
            <option value="1.7em">Medium</option>
            <option value="2.2em">Large</option>
          </Select>
          <Select label="Case" value={ct.case ?? ""} onChange={(v) => setCT({ case: (v || undefined) as any })}>
            <option value="">Default</option>
            <option value="normal">Normal</option>
            <option value="smallcaps">Small caps</option>
            <option value="uppercase">UPPERCASE</option>
          </Select>
          <Select label="Alignment" value={ct.align ?? ""} onChange={(v) => setCT({ align: (v || undefined) as any })}>
            <option value="">Default</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </Select>
          <Select label="Style" value={ct.style ?? ""} onChange={(v) => setCT({ style: (v || undefined) as any })}>
            <option value="">Default</option>
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </Select>
        </div>
      </div>

      {editable ? (
        <button
          onClick={save}
          disabled={saveState === "saving"}
          className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
            saveState === "saved" ? "bg-emerald-100 text-emerald-800" : "bg-slate-700 text-white hover:bg-slate-800"
          }`}
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to book.yaml ✓" : "Save typography to book.yaml"}
        </button>
      ) : (
        <p className="text-[11px] leading-snug text-slate-400">Open your book as a folder to save typography.</p>
      )}
      {error && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <p className="text-[11px] leading-snug text-slate-400">
        Overrides the theme. Custom fonts (from <code>fonts:</code> in book.yaml) appear under “Your embedded fonts” and
        render everywhere; system fonts are suggestions e-readers may substitute.
      </p>
    </div>
  );
}
