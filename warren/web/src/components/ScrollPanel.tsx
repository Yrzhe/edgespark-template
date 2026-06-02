import type { ReactNode } from "react";

type ScrollPanelProps = {
  children: ReactNode;
  maxHeight?: number | string;
  className?: string;
  ariaLabel?: string;
};

export function ScrollPanel({ children, maxHeight = 320, className, ariaLabel }: ScrollPanelProps) {
  const resolvedMaxHeight = typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight;

  return (
    <div
      aria-label={ariaLabel}
      className={["overflow-y-auto pr-1", className].filter(Boolean).join(" ")}
      role={ariaLabel ? "region" : undefined}
      style={{ maxHeight: resolvedMaxHeight }}
    >
      {children}
    </div>
  );
}
