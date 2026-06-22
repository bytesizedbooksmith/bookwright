import { useState } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  right?: React.ReactNode; // optional control shown on the header row
  children: React.ReactNode;
}

export default function Collapsible({ title, defaultOpen = true, right, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-slate-200">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          {title}
        </button>
        {right && <div className="pl-2">{right}</div>}
      </div>
      {open && <div className="pb-4">{children}</div>}
    </section>
  );
}
