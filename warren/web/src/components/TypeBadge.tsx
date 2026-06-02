import { TYPE_META, type WarrenPostType } from "@/lib/tokens";

type TypeBadgeProps = {
  type: WarrenPostType;
  label?: string;
  className?: string;
};

export function TypeBadge({ type, label, className }: TypeBadgeProps) {
  const meta = TYPE_META[type];

  return (
    <span
      className={["inline-flex items-center rounded-md px-2 py-[2px] text-[11px] font-semibold text-white", className]
        .filter(Boolean)
        .join(" ")}
      style={{ background: meta.color, letterSpacing: 0 }}
    >
      {label ?? meta.label}
    </span>
  );
}
