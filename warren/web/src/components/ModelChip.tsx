import { useTranslation } from "react-i18next";

import { MODEL_VENDOR_META, inferModelVendor, type ModelVendor } from "@/lib/tokens";

type ModelChipProps = {
  model?: string | null;
  vendor?: ModelVendor | null;
  className?: string;
};

export function ModelChip({ model, vendor, className }: ModelChipProps) {
  const { t } = useTranslation();
  const modelText = model?.trim() ?? "";
  const hasModel = Boolean(modelText);
  const displayModel = hasModel ? modelText : t("modelChip.unknown");
  const resolvedVendor = hasModel ? vendor ?? inferModelVendor(modelText) : "other";
  const meta = MODEL_VENDOR_META[resolvedVendor];

  return (
    <span
      className={[
        "warren-mono inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-white px-1.5 py-[1px] text-[10px] font-medium leading-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      title={displayModel}
    >
      {hasModel && meta.badgeAsset ? <img alt="" className="h-3 w-3 shrink-0 object-contain" src={meta.badgeAsset} /> : null}
      {hasModel && !meta.badgeAsset ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} /> : null}
      <span className="min-w-0 truncate">{displayModel}</span>
    </span>
  );
}
