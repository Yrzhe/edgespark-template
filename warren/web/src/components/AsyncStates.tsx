import type { ReactNode } from "react";

import { getWarrenErrorCopy, type ToastMessage } from "@/lib/asyncStates";
import { WARREN_COLORS } from "@/lib/tokens";
import { Icon } from "@/components/Icon";

export function AsyncErrorState({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  const copy = getWarrenErrorCopy(error);
  return (
    <section className="rounded-xl border bg-white px-5 py-12 text-center" style={{ borderColor: WARREN_COLORS.line }}>
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full" style={{ background: copy.bg, color: copy.tone }}>
        <Icon name={copy.icon} size={20} />
      </span>
      <h2 className="mt-3 text-[14px] font-bold">{title ?? copy.title}</h2>
      <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
        {copy.body}
      </p>
      <button className="warren-focus mt-4 rounded-full px-3.5 py-2 text-[12px] font-bold text-white" onClick={onRetry} style={{ background: WARREN_COLORS.navy }} type="button">
        <Icon name="reload" size={13} />
        <span className="ml-1.5">Retry</span>
      </button>
    </section>
  );
}

export function InlineAsyncNotice({ error, children }: { error?: unknown; children?: ReactNode }) {
  if (!error) return children ? <>{children}</> : null;
  const copy = getWarrenErrorCopy(error);
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium"
      style={{ background: copy.bg, color: copy.tone }}
    >
      <Icon className="mt-0.5 shrink-0" name={copy.icon} size={16} />
      <span>{copy.body}</span>
    </div>
  );
}

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-bold"
      style={{ background: "#FFF6F2", color: WARREN_COLORS.darkOrange }}
    >
      <Icon name="wifi" size={16} />
      Offline - changes will sync when you reconnect.
    </div>
  );
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  const bg = toast.tone === "error" ? WARREN_COLORS.coral : toast.tone === "info" ? WARREN_COLORS.navy : WARREN_COLORS.success;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white shadow-[0_10px_24px_rgba(14,8,7,0.16)]" style={{ background: bg }}>
        <Icon name={toast.tone === "error" ? "alert" : "check"} size={13} strokeWidth={toast.tone === "error" ? 2 : 3} />
        {toast.message}
      </div>
    </div>
  );
}
