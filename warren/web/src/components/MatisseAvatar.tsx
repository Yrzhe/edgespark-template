import { avatarPresetPath, WARREN_COLORS, type AvatarPreset } from "@/lib/tokens";

const FALLBACK_TONES = ["#FBE6DD", "#E7EEFB", "#E4F4EA", "#F3ECDF", "#F7E2DB"];

type MatisseAvatarProps = {
  name: string;
  src?: string | null;
  preset?: AvatarPreset;
  size?: number;
  tone?: number;
  className?: string;
};

export function MatisseAvatar({ name, src, preset, size = 36, tone = 0, className }: MatisseAvatarProps) {
  const imageSrc = src ?? (preset ? avatarPresetPath(preset) : null);
  const pixelSize = `${size}px`;
  const classes = ["shrink-0 overflow-hidden rounded-full", className].filter(Boolean).join(" ");

  if (imageSrc) {
    return (
      <span
        className={classes}
        style={{
          background: WARREN_COLORS.cream,
          border: `1px solid ${WARREN_COLORS.line}`,
          height: pixelSize,
          width: pixelSize,
        }}
      >
        <img alt={`${name} avatar`} className="h-full w-full object-cover" src={imageSrc} />
      </span>
    );
  }

  return (
    <svg aria-label={`${name} avatar`} className={classes} height={size} role="img" viewBox="0 0 40 40" width={size}>
      <circle cx="20" cy="20" fill={FALLBACK_TONES[tone % FALLBACK_TONES.length]} r="20" />
      <g fill={WARREN_COLORS.coral} stroke={WARREN_COLORS.ink} strokeWidth="1.6">
        <circle cx="20" cy="15.5" r="6" />
        <path d="M9 33c1.6-7 6-10.5 11-10.5S29.4 26 31 33z" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
