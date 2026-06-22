import { useEffect, useRef, useState } from "react";

interface Props {
  html: string;
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
}

interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
  bezel: number;
  frame: string;
  screen: string;
  radius: number;
  eink?: boolean;
}

const DEVICES: Device[] = [
  { id: "fit", label: "Fit width", width: 0, height: 0, bezel: 0, frame: "", screen: "#fff", radius: 0 },
  { id: "kindle", label: "Kindle", width: 400, height: 560, bezel: 22, frame: "#3b3b3b", screen: "#f7f6f1", radius: 14, eink: true },
  { id: "kobo", label: "Kobo", width: 390, height: 560, bezel: 20, frame: "#2a2a2a", screen: "#f8f7f3", radius: 16, eink: true },
  { id: "phone", label: "Phone", width: 380, height: 720, bezel: 14, frame: "#111", screen: "#ffffff", radius: 38 },
  { id: "tablet", label: "iPad", width: 720, height: 940, bezel: 26, frame: "#1b1b1b", screen: "#ffffff", radius: 26 },
];

export default function DevicePreview({ html, loading, value, onChange }: Props) {
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPrint = value === "print";
  const device = DEVICES.find((d) => d.id === value);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !device || device.id === "fit") {
      setScale(1);
      return;
    }
    const recompute = () => {
      const frameW = device.width + device.bezel * 2;
      const frameH = device.height + device.bezel * 2;
      setScale(Math.min(1, (el.clientWidth - 40) / frameW, (el.clientHeight - 40) / frameH));
    };
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    recompute();
    return () => ro.disconnect();
  }, [value, device]);

  const frame = (
    <iframe
      title="Book preview"
      srcDoc={html}
      className="h-full w-full border-0"
      style={{ background: device?.screen ?? "#fff" }}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">
        <span className="mr-1 text-xs text-slate-400">Preview as:</span>
        {DEVICES.map((d) => (
          <button
            key={d.id}
            onClick={() => onChange(d.id)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              value === d.id ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {d.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button
          onClick={() => onChange("print")}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${
            isPrint ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          🖨 Print
        </button>
        {loading && <span className="ml-auto text-xs text-slate-400">updating…</span>}
      </div>

      <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-auto bg-slate-200">
        {!html ? (
          <div className="text-slate-400">{isPrint ? "Generating print preview…" : "Preview will appear here"}</div>
        ) : isPrint ? (
          <div className="h-full w-full">{frame}</div>
        ) : device && device.id !== "fit" ? (
          <div
            style={{
              padding: device.bezel,
              background: device.frame,
              borderRadius: device.radius,
              boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
              transform: `scale(${scale})`,
              transformOrigin: "center",
            }}
          >
            <div
              style={{
                width: device.width,
                height: device.height,
                background: device.screen,
                borderRadius: Math.max(2, device.radius - device.bezel),
                overflow: "hidden",
                filter: device.eink ? "grayscale(0.85) contrast(0.95)" : undefined,
              }}
            >
              {frame}
            </div>
          </div>
        ) : (
          <div className="h-full w-full bg-white">{frame}</div>
        )}
      </div>
    </div>
  );
}
