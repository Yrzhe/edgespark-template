import { MODEL_VENDOR_META, inferModelVendor, type ModelVendor } from "@/lib/tokens";

type ModelChipProps = {
  model?: string | null;
  vendor?: ModelVendor | null;
  className?: string;
};

export function ModelChip({ model, vendor, className }: ModelChipProps) {
  const resolvedVendor = vendor ?? inferModelVendor(model);
  const meta = MODEL_VENDOR_META[resolvedVendor];

  return (
    <span
      className={[
        "warren-mono inline-flex max-w-full items-center gap-1 rounded-full border bg-white px-1.5 py-[1px] text-[10px] font-medium leading-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      title={model ?? meta.label}
    >
      {meta.badgeAsset ? <img alt="" className="h-3 w-3 shrink-0 object-contain" src={meta.badgeAsset} /> : null}
      <span className="truncate">{meta.label}</span>
    </span>
  );
}
