import type { Theme } from "../types";

interface Props {
  themes: Theme[];
  value: string;
  onChange: (theme: string) => void;
}

export default function ThemePicker({ themes, value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {themes.map((t) => (
        <button
          key={t.name}
          onClick={() => onChange(t.name)}
          className={`rounded-lg border px-3 py-2 text-left transition ${
            value === t.name
              ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
              : "border-slate-300 bg-white hover:border-slate-400"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">{t.label}</span>
            <span className="font-serif text-base text-amber-700">{t.sceneOrnament}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.description}</p>
        </button>
      ))}
    </div>
  );
}
