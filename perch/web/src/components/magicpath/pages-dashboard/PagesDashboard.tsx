import { motion, type Variants } from "framer-motion";
import { ChevronRight, ExternalLink, Eye, MousePointerClick, Plus, Search } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";

import type { Page } from "@/lib/types";

export type PageSummary = {
  page: Page;
  views?: number;
  clicks?: number;
};

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 26 } },
};

export function PagesDashboard({
  pages,
  loading,
  error,
  onCreatePage,
}: {
  pages: PageSummary[];
  loading?: boolean;
  error?: Error | null;
  onCreatePage: () => void;
}) {
  return (
    <main className="flex-1 px-6 py-7 md:px-10 md:py-9">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">Pages</h1>
            <p className="mt-1 text-[13.5px] text-zinc-500">Your link-in-bio pages. Each has its own URL, theme, and analytics.</p>
          </div>
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2.5 text-[13.5px] font-medium text-white" onClick={onCreatePage}>
            <Plus className="h-4 w-4" />
            New page
          </motion.button>
        </div>

        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error.message}</div>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-400">
            <Search className="h-4 w-4" />
            <input className="w-full bg-transparent text-[13.5px] text-zinc-700 outline-none placeholder:text-zinc-400" placeholder="Search pages" readOnly />
          </div>
          <span className="shrink-0 text-[12.5px] text-zinc-400">{loading ? "Loading..." : `${pages.length} pages`}</span>
        </div>

        <motion.div variants={container} initial="hidden" animate="show" className="mt-3 flex flex-col gap-2.5">
          {pages.map(({ page, views = 0, clicks = 0 }) => (
            <motion.div key={page.id} variants={item} whileHover={{ y: -2 }} className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-3.5 transition-colors duration-200 hover:border-zinc-900">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-900 text-[13px] font-semibold text-white">{initials(page.displayName)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-medium text-zinc-900">{page.displayName || page.title}</span>
                  {page.isDefault && <span className="shrink-0 rounded-full border border-zinc-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Default</span>}
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${page.publishedAt ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-500"}`}>{page.publishedAt ? "Published" : "Draft"}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12.5px] text-zinc-400">
                  <span className="font-mono text-zinc-500">/{page.slug}</span>
                  <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {formatNumber(views)}</span>
                  <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" /> {formatNumber(clicks)}</span>
                  <span>· {relativeTime(page.updatedAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a href={`/api/public/p/${encodeURIComponent(page.slug)}`} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900" aria-label="Open public page" target="_blank" rel="noreferrer">
                  <ExternalLink className="h-[17px] w-[17px]" />
                </a>
                <RouterLink to={`/pages/${page.id}`} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-[13px] font-medium text-zinc-700 transition-colors group-hover:border-zinc-900 group-hover:bg-zinc-900 group-hover:text-white">
                  Edit
                  <ChevronRight className="h-4 w-4" />
                </RouterLink>
              </div>
            </motion.div>
          ))}
          {!loading && pages.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-[13px] text-zinc-500">No pages yet.</div>}
        </motion.div>
      </div>
    </main>
  );
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";
}
function formatNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
function relativeTime(timestamp: number): string {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
