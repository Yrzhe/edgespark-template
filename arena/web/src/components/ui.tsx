import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";

import { GREEN, INK, NAVY } from "@/lib/constants";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border-2 bg-white p-4 ${className}`} style={{ borderColor: INK }}>{children}</section>;
}

export function Loading() {
  const { t } = useTranslation();
  return <Panel><div className="py-12 text-center text-sm font-bold text-zinc-500">{t("app.loading")}</div></Panel>;
}

export function Gate({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <Panel>
      <h1 className="text-xl font-black">{title}</h1>
      <p className="mt-2 text-sm font-semibold text-zinc-600">{body}</p>
      <button onClick={onAction} className="mt-4 rounded-lg px-4 py-2 text-sm font-black text-white" style={{ background: NAVY }}>
        {action}
      </button>
    </Panel>
  );
}

export function Avatar({ name, src, color = NAVY, size = "md" }: { name: string; src?: string | null; color?: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-20 w-20 text-2xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm";
  return src ? (
    <img src={src} alt={name} className={`${cls} rounded-full object-cover`} />
  ) : (
    <span className={`${cls} grid shrink-0 place-items-center rounded-full font-black text-white`} style={{ background: color }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Segmented({ value, items, onChange }: { value: string; items: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="flex rounded-lg border-2 p-0.5" style={{ borderColor: INK }}>
      {items.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className={`rounded-md px-2.5 py-1.5 text-xs font-black ${value === id ? "bg-zinc-950 text-white" : ""}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border-2 bg-white px-3 py-2 text-sm font-bold" style={{ borderColor: INK }}>
      <span className="text-zinc-500">{label}</span>
      <select className="bg-transparent font-black outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>
  );
}

export function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-zinc-500">{label}</span>
      <input type={type} className="w-full rounded-lg border-2 px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: INK }} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-black" style={{ borderColor: INK }}>
      <span className="h-5 w-9 rounded-full p-0.5" style={{ background: checked ? GREEN : "#C7C7CC" }}>
        <span className={`block h-4 w-4 rounded-full bg-white ${checked ? "ml-4" : ""}`} />
      </span>
      {label}
    </button>
  );
}

export function CodeBlock({ title, text }: { title: string; text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 overflow-hidden rounded-lg border-2" style={{ borderColor: INK }}>
      <div className="flex items-center gap-2 border-b-2 px-3 py-2" style={{ borderColor: INK, background: "#F7F5F1" }}>
        <span className="text-xs font-black">{title}</span>
        <button className="ml-auto flex items-center gap-1 text-xs font-black" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); }}>
          <Copy size={12} />{copied ? t("app.copied") : t("app.copy")}
        </button>
      </div>
      <pre className="overflow-x-auto bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100">{text}</pre>
    </div>
  );
}
