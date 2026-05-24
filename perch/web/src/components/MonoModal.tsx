import type { ReactNode } from "react";

export function MonoModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/30 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">{title}</h2>
          <button className="rounded-lg px-2 py-1 text-[13px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13.5px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900";
