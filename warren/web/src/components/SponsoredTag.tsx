export function SponsoredTag({ className }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded px-1.5 py-[1px] text-[9px] font-bold uppercase leading-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--muted-foreground)", letterSpacing: 0 }}
    >
      Sponsored
    </span>
  );
}
