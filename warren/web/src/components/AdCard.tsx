import { Icon } from "@/components/Icon";
import { SponsoredTag } from "@/components/SponsoredTag";
import { WARREN_COLORS } from "@/lib/tokens";

type AdCardProps = {
  title: string;
  body: string;
  cta: string;
  brand: string;
  href: string;
  imageUrl?: string | null;
  slotLabel?: string;
  tone?: string;
  className?: string;
  layout?: "rail" | "inline";
};

export function AdCard({
  title,
  body,
  cta,
  brand,
  href,
  imageUrl,
  slotLabel,
  tone = WARREN_COLORS.navy,
  className,
  layout = "rail",
}: AdCardProps) {
  if (layout === "inline") {
    return (
      <a
        className={[
          "flex flex-col gap-3 rounded-xl border p-3.5 transition-shadow hover:shadow-[0_10px_24px_-14px_rgba(14,8,7,0.22)] sm:flex-row sm:items-center",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        href={href}
        style={{ background: "#FCFBF8", borderColor: WARREN_COLORS.line, borderStyle: "dashed", color: WARREN_COLORS.ink }}
      >
        {imageUrl ? (
          <img alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" src={imageUrl} />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-[24px] font-extrabold text-white" style={{ background: tone }}>
            {brand.slice(0, 1)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-2">
            <SponsoredTag />
            <span className="text-[11px] font-semibold" style={{ color: WARREN_COLORS.sub }}>
              {brand}
            </span>
          </span>
          <span className="block text-[13.5px] font-semibold leading-snug">{title}</span>
          <span className="mt-1 block text-[11.5px]" style={{ color: WARREN_COLORS.sub }}>
            {body}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: tone }}>
          {cta}
          <Icon name="external" size={12} />
        </span>
      </a>
    );
  }

  return (
    <a
      className={["block rounded-xl border p-3.5 transition-shadow hover:shadow-[0_10px_24px_-14px_rgba(14,8,7,0.22)]", className]
        .filter(Boolean)
        .join(" ")}
      href={href}
      style={{ background: "#FCFBF8", borderColor: WARREN_COLORS.line, borderStyle: "dashed", color: WARREN_COLORS.ink }}
    >
      <span className="mb-2 flex items-center gap-2">
        <SponsoredTag />
        <span className="text-[11px] font-semibold" style={{ color: WARREN_COLORS.sub }}>
          {brand}
        </span>
      </span>
      {imageUrl ? (
        <img alt="" className="mb-2 aspect-[29/8] w-full rounded-lg object-cover" src={imageUrl} />
      ) : (
        <span className="mb-2 flex aspect-[29/8] w-full items-center justify-center rounded-lg text-[13px] font-bold text-white" style={{ background: tone }}>
          {slotLabel ?? brand}
        </span>
      )}
      <span className="block text-[13.5px] font-semibold leading-snug">{title}</span>
      <span className="mt-1 block text-[11.5px]" style={{ color: WARREN_COLORS.sub }}>
        {body}
      </span>
      <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: WARREN_COLORS.coral }}>
        {cta}
        <Icon name="external" size={12} />
      </span>
    </a>
  );
}
