import { motion, type Variants } from "framer-motion";
import { BadgeCheck, Check, Eye, Upload } from "lucide-react";

import type { Link, Page, Theme } from "@/lib/types";

const themes: Array<{ name: string; theme: Theme; sw: string[] }> = [
  { name: "Mono", sw: ["#ffffff", "#18181b"], theme: { background: "#ffffff", foreground: "#18181b", card: "#ffffff", accent: "#18181b", radius: "18px", fontFamily: "Inter" } },
  { name: "Ink", sw: ["#18181b", "#ffffff"], theme: { background: "#18181b", foreground: "#ffffff", card: "#27272a", accent: "#ffffff", radius: "18px", fontFamily: "Inter" } },
  { name: "Sand", sw: ["#faf6ef", "#1c1917"], theme: { background: "#faf6ef", foreground: "#1c1917", card: "#ffffff", accent: "#1c1917", radius: "18px", fontFamily: "Serif" } },
  { name: "Sky", sw: ["#f0f7ff", "#0b63d6"], theme: { background: "#f0f7ff", foreground: "#0f172a", card: "#ffffff", accent: "#0b63d6", radius: "18px", fontFamily: "Inter" } },
];
const fonts = ["Inter", "Geist", "Serif", "Mono"];
const item: Variants = { hidden: { opacity: 0, y: 12 }, show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.05 * i, type: "spring", stiffness: 280, damping: 26 } }) };

export function Appearance({ page, links, onSaveTheme, onUpload }: { page: Page; links: Link[]; onSaveTheme: (theme: Theme) => void; onUpload: (kind: "avatar" | "cover") => void }) {
  const current = page.theme ?? {};
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-7 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-3">
        <Field label="Theme" i={0}>
          <div className="grid grid-cols-4 gap-2.5">{themes.map((preset) => <button key={preset.name} className={`relative rounded-xl border p-2.5 text-left transition-colors ${current.background === preset.theme.background ? "border-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`} onClick={() => onSaveTheme({ ...current, ...preset.theme })}><div className="flex gap-1">{preset.sw.map((c) => <span key={c} className="h-6 w-6 rounded-md border border-zinc-200" style={{ background: c }} />)}</div><div className="mt-2 text-[12.5px] font-medium">{preset.name}</div>{current.background === preset.theme.background && <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-zinc-900 text-white"><Check className="h-3 w-3" /></span>}</button>)}</div>
        </Field>
        <Field label="Radius" i={1}><input type="range" min="8" max="28" value={parseInt(current.radius ?? "18", 10)} onChange={(event) => onSaveTheme({ ...current, radius: `${event.target.value}px` })} className="w-full accent-zinc-900" /></Field>
        <Field label="Font" i={2}><div className="flex gap-2">{fonts.map((font) => <button key={font} className={`rounded-lg border px-3.5 py-2 text-[13px] transition-colors ${current.fontFamily === font ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-600 hover:border-zinc-900"}`} onClick={() => onSaveTheme({ ...current, fontFamily: font })}>{font}</button>)}</div></Field>
        <Field label="Images" i={3}><div className="flex gap-3">{(["avatar", "cover"] as const).map((kind) => <button key={kind} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-4 text-[13px] capitalize text-zinc-500 hover:border-zinc-900 hover:text-zinc-900" onClick={() => onUpload(kind)}><Upload className="h-4 w-4" /> {kind}</button>)}</div></Field>
      </div>
      <div className="hidden lg:block"><div className="sticky top-7"><div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-zinc-400"><Eye className="h-3.5 w-3.5" /> Live preview</div><div className="overflow-hidden rounded-[28px] border-[6px] border-zinc-900 bg-white shadow-xl"><div className="h-[460px] px-5 py-6" style={{ background: current.background, color: current.foreground }}><div className="flex flex-col items-center text-center"><span className="grid h-14 w-14 place-items-center rounded-full bg-zinc-900 text-[13px] font-semibold text-white">{page.displayName.slice(0, 2).toUpperCase()}</span><span className="mt-2 flex items-center gap-1 text-[14px] font-semibold">{page.displayName} <BadgeCheck className="h-3.5 w-3.5" /></span><span className="text-[11px] opacity-60">@{page.slug}</span></div><div className="mt-4 space-y-2">{links.slice(0, 4).map((link) => <div key={link.id} className="rounded-xl border px-3 py-3 text-[12px]" style={{ borderColor: current.accent, background: current.card, borderRadius: current.radius }}>{link.title}</div>)}</div></div></div></div></div>
    </div>
  );
}

function Field({ label, children, i }: { label: string; children: React.ReactNode; i: number }) {
  return <motion.div custom={i} variants={item} initial="hidden" animate="show" className="rounded-2xl border border-zinc-200 bg-white p-5"><div className="text-[13px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div><div className="mt-3">{children}</div></motion.div>;
}
