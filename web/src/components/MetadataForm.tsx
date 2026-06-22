import type { BookMeta } from "../types";

interface Props {
  meta: BookMeta;
  onChange: (patch: Partial<BookMeta>) => void;
  projectId: string;
  hasCover: boolean;
  coverVersion: number;
  onCover: (file: File) => void;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value?: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {textarea ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        />
      ) : (
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        />
      )}
    </label>
  );
}

export default function MetadataForm({ meta, onChange, projectId, hasCover, coverVersion, onCover }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <div className="h-28 w-[5.5rem] overflow-hidden rounded-md border border-slate-300 bg-slate-100">
            {hasCover ? (
              <img
                src={`/api/projects/${projectId}/cover?v=${coverVersion}`}
                alt="cover"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-[10px] text-slate-400">
                No cover
              </div>
            )}
          </div>
          <label className="mt-1 block cursor-pointer text-center text-[11px] text-emerald-700 underline">
            Replace
            <input
              type="file"
              accept="image/png,image/jpeg"
              hidden
              onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])}
            />
          </label>
        </div>
        <div className="flex-1 space-y-2">
          <Field label="Title" value={meta.title} onChange={(v) => onChange({ title: v })} />
          <Field label="Author" value={meta.author} onChange={(v) => onChange({ author: v })} />
        </div>
      </div>

      <Field label="Subtitle" value={meta.subtitle} onChange={(v) => onChange({ subtitle: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Series" value={meta.series} onChange={(v) => onChange({ series: v })} />
        <Field label="Book #" value={meta.series_index} onChange={(v) => onChange({ series_index: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Publisher" value={meta.publisher} onChange={(v) => onChange({ publisher: v })} />
        <Field label="Language" value={meta.language} onChange={(v) => onChange({ language: v })} placeholder="en" />
      </div>
      <Field label="ISBN (optional)" value={meta.isbn} onChange={(v) => onChange({ isbn: v })} placeholder="auto UUID if blank" />
      <p className="text-[11px] leading-snug text-slate-400">
        Copyright is its own page — add a <strong>Copyright</strong> section under Front &amp; back matter and edit it as
        a Markdown file. A blurb goes in each store's upload form, not the EPUB.
      </p>
    </div>
  );
}
