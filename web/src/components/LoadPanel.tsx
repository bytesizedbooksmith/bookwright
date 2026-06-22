import { useRef, useState } from "react";
import { api } from "../api";

interface Props {
  busy: boolean;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onOpenFolder: (path: string) => void;
}

export default function LoadPanel({ busy, onFiles, onSample, onOpenFolder }: Props) {
  const folderRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  async function chooseFolder() {
    setPicking(true);
    setPickError(null);
    try {
      const { path } = await api.pickFolder(folderPath.trim() || undefined);
      if (path) {
        setFolderPath(path);
        onOpenFolder(path);
      }
    } catch (e) {
      setPickError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  return (
    <div className="space-y-3">
      {/* Open a real folder on disk by path — the edit-on-disk workflow. */}
      <div className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="mb-1.5 text-xs font-medium text-slate-700">Open a folder on disk</p>
        <button
          disabled={busy || picking}
          onClick={chooseFolder}
          className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          📁 {picking ? "Choose in the dialog…" : "Choose folder…"}
        </button>
        <div className="flex gap-1.5">
          <input
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && folderPath.trim() && onOpenFolder(folderPath.trim())}
            placeholder="…or paste a path: D:\books\my-novel"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
          />
          <button
            disabled={busy || !folderPath.trim()}
            onClick={() => onOpenFolder(folderPath.trim())}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Open
          </button>
        </div>
        {pickError && <p className="mt-1.5 text-[11px] text-red-600">{pickError}</p>}
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Edits to files in this folder appear when you click <strong>Reload</strong>. Best for swapping
          templates in and out.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
          drag ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50"
        }`}
      >
      <p className="mb-1 text-sm font-medium text-slate-700">Drop your manuscript here</p>
      <p className="mb-4 text-xs text-slate-500">A folder with a book.yaml, or a single Markdown file</p>

      <div className="flex flex-col gap-2">
        <button
          disabled={busy}
          onClick={() => folderRef.current?.click()}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Open book folder…
        </button>
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Open .md file…
        </button>
        <button
          disabled={busy}
          onClick={onSample}
          className="text-xs text-emerald-700 underline hover:text-emerald-900 disabled:opacity-50"
        >
          or load the sample book
        </button>
      </div>

      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error non-standard but widely supported folder picker
        webkitdirectory=""
        directory=""
        multiple
        hidden
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        hidden
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
      />
      </div>
    </div>
  );
}
