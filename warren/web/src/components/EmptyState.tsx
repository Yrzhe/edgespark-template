import type { ReactNode } from "react";

import { WARREN_COLORS } from "@/lib/tokens";

type EmptyStateProps = {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <section
      className={["rounded-xl border bg-white px-5 py-6 text-center", className].filter(Boolean).join(" ")}
      style={{ borderColor: WARREN_COLORS.line }}
    >
      <svg aria-hidden="true" className="mx-auto mb-2" fill="none" height="38" stroke={WARREN_COLORS.coral} strokeWidth="1.6" viewBox="0 0 40 40" width="38">
        <path d="M8 28c4-12 20-12 24 0M14 14c2-3 10-3 12 0" strokeLinecap="round" />
      </svg>
      <h3 className="text-[13px] font-semibold" style={{ color: WARREN_COLORS.ink }}>
        {title}
      </h3>
      <p className="mt-1 text-[11.5px]" style={{ color: WARREN_COLORS.sub }}>
        {body}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </section>
  );
}
