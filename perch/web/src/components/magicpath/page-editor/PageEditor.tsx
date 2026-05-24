import { motion, type Variants } from "framer-motion";
import { ArrowLeft, BadgeCheck, BarChart3, Eye, ExternalLink, GripVertical, Link2, Minus, Palette, Pencil, Plus, Star, Trash2 } from "lucide-react";

import type { Link, Page } from "@/lib/types";

export type EditorTab = "links" | "appearance" | "analytics";

const tabs = [
  { id: "links" as const, label: "Links", icon: Link2 },
  { id: "appearance" as const, label: "Appearance", icon: Palette },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
];
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.04 * i, type: "spring", stiffness: 300, damping: 26 } }),
};

export function PageEditor({
  page,
  links,
  activeTab,
  children,
  saving,
  error,
  onBack,
  onTabChange,
  onEditPage,
  onAddLink,
  onAddSection,
  onEditLink,
  onToggleLink,
  onToggleFeatured,
  onDeleteLink,
  onReorder,
}: {
  page: Page;
  links: Link[];
  activeTab: EditorTab;
  children?: React.ReactNode;
  saving?: boolean;
  error?: Error | null;
  onBack: () => void;
  onTabChange: (tab: EditorTab) => void;
  onEditPage: () => void;
  onAddLink: () => void;
  onAddSection: () => void;
  onEditLink: (link: Link) => void;
  onToggleLink: (link: Link) => void;
  onToggleFeatured: (link: Link) => void;
  onDeleteLink: (link: Link) => void;
  onReorder: (links: Link[]) => void;
}) {
  return (
    <main className="min-w-0 flex-1 bg-zinc-50 text-zinc-900 antialiased">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3.5">
        <div className="flex items-center gap-3">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100" onClick={onBack}><ArrowLeft className="h-[18px] w-[18px]" /></button>
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <button className="rounded-md border border-transparent px-1 text-left hover:border-zinc-200" onClick={onEditPage}>{page.displayName}</button>
            <span className="font-mono text-[12px] font-normal text-zinc-400">/{page.slug}</span>
          </div>
          <button className="ml-1 inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white" onClick={onEditPage}>
            {page.publishedAt ? "Published" : "Draft"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/public/p/${encodeURIComponent(page.slug)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-[13px] font-medium text-zinc-700 hover:border-zinc-900">
            <ExternalLink className="h-4 w-4" /> View
          </a>
          <span className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white">{saving ? "Saving..." : "Saved"}</span>
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-[13.5px] transition-colors ${activeTab === tab.id ? "border-zinc-900 font-medium text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-900"}`} onClick={() => onTabChange(tab.id)}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error.message}</div>}
      {activeTab === "links" ? (
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-7 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2.5 text-[13.5px] font-medium text-white" onClick={onAddLink}><Plus className="h-4 w-4" /> Add link</button>
              <button className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] font-medium text-zinc-700 hover:border-zinc-900" onClick={onAddSection}><Minus className="h-4 w-4" /> Section</button>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {links.map((link, i) => (
                <EditorRow
                  key={link.id}
                  link={link}
                  i={i}
                  onEdit={onEditLink}
                  onToggle={onToggleLink}
                  onToggleFeatured={onToggleFeatured}
                  onDelete={onDeleteLink}
                  onMove={(delta) => onReorder(move(links, i, delta))}
                />
              ))}
            </div>
            <p className="mt-3 text-center text-[12px] text-zinc-400">Use arrows to reorder · toggle to show/hide</p>
          </div>
          <Preview page={page} links={links} />
        </div>
      ) : (
        children
      )}
    </main>
  );
}

function EditorRow({
  link,
  i,
  onEdit,
  onToggle,
  onToggleFeatured,
  onDelete,
  onMove,
}: {
  link: Link;
  i: number;
  onEdit: (link: Link) => void;
  onToggle: (link: Link) => void;
  onToggleFeatured: (link: Link) => void;
  onDelete: (link: Link) => void;
  onMove: (delta: -1 | 1) => void;
}) {
  if (link.linkKind === "section") {
    return (
      <motion.div custom={i} variants={item} initial="hidden" animate="show" className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2.5">
        <GripVertical className="h-4 w-4 shrink-0 text-zinc-300" />
        <Minus className="h-3.5 w-3.5 text-zinc-400" />
        <button className="flex-1 text-left text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-500" onClick={() => onEdit(link)}>{link.title}</button>
        <button className="text-[11px] text-zinc-400" onClick={() => onMove(-1)}>Up</button>
        <button className="text-[11px] text-zinc-400" onClick={() => onMove(1)}>Down</button>
        <button className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700" onClick={() => onEdit(link)}><Pencil className="h-3.5 w-3.5" /></button>
        <button className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700" onClick={() => onDelete(link)}><Trash2 className="h-3.5 w-3.5" /></button>
      </motion.div>
    );
  }
  return (
    <motion.div custom={i} variants={item} initial="hidden" animate="show" whileHover={{ y: -1 }} className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-3 transition-colors ${link.isFeatured ? "border-zinc-900" : "border-zinc-200 hover:border-zinc-400"} ${!link.isActive ? "opacity-55" : ""}`}>
      <GripVertical className="h-4 w-4 shrink-0 text-zinc-300" />
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${link.isFeatured ? "bg-zinc-900 text-white" : "border border-zinc-200 text-zinc-400"}`}>{link.isFeatured ? <Star className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}</span>
      <div className="min-w-0 flex-1">
        <button className="block w-full truncate text-left text-[14px] font-medium text-zinc-900" onClick={() => onEdit(link)}>{link.title}</button>
        <span className="mt-0.5 block truncate font-mono text-[11.5px] text-zinc-400">{link.url}</span>
      </div>
      <button className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${link.isActive ? "bg-zinc-900" : "bg-zinc-200"}`} onClick={() => onToggle(link)}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${link.isActive ? "left-[18px]" : "left-0.5"}`} /></button>
      <button className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900" onClick={() => onToggleFeatured(link)}><Star className="h-3.5 w-3.5" /></button>
      <button className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900" onClick={() => onEdit(link)}><Pencil className="h-3.5 w-3.5" /></button>
      <button className="text-[11px] text-zinc-400" onClick={() => onMove(-1)}>Up</button>
      <button className="text-[11px] text-zinc-400" onClick={() => onMove(1)}>Down</button>
      <button className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900" onClick={() => onDelete(link)}><Trash2 className="h-3.5 w-3.5" /></button>
    </motion.div>
  );
}

function Preview({ page, links }: { page: Page; links: Link[] }) {
  return (
    <div className="hidden lg:block"><div className="sticky top-7"><div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-zinc-400"><Eye className="h-3.5 w-3.5" /> Live preview</div><div className="overflow-hidden rounded-[28px] border-[6px] border-zinc-900 bg-white shadow-xl"><div className="h-[460px] overflow-hidden px-5 py-6"><div className="flex flex-col items-center text-center"><span className="grid h-14 w-14 place-items-center rounded-full bg-zinc-900 text-[13px] font-semibold text-white">{page.displayName.slice(0, 2).toUpperCase()}</span><span className="mt-2 flex items-center gap-1 text-[14px] font-semibold">{page.displayName} <BadgeCheck className="h-3.5 w-3.5" /></span><span className="text-[11px] text-zinc-400">@{page.slug}</span></div><div className="mt-4 space-y-2">{links.filter((link) => link.isActive).slice(0, 6).map((link) => link.linkKind === "section" ? <div key={link.id} className="pt-1 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{link.title}</div> : <div key={link.id} className={`rounded-xl border px-3 py-3 text-[12px] ${link.isFeatured ? "border-zinc-900 font-medium" : "border-zinc-200"}`}>{link.isFeatured ? "★ " : ""}{link.title}</div>)}</div></div></div></div></div>
  );
}

function move<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
