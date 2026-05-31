import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, Loader2 } from 'lucide-react';
import type { ExportFormat, ExportMultiplier } from '@/lib/export';

export type ExportRequest = {
  format: ExportFormat;
  multiplier: ExportMultiplier;
  transparent: boolean;
};

const FORMATS: ExportFormat[] = ['png', 'jpg', 'pdf'];
const MULTIPLIERS: ExportMultiplier[] = [1, 2, 4];

// Pure-UI export dialog. CardEditor owns the canvas ref + the actual render
// (deselect → html-to-image), so this stays a dumb chooser: format, resolution
// multiplier, transparent-PNG toggle. Soft Bloome editorial style; i18n zh/en.
export const ExportDialog = ({
  open,
  exporting,
  onClose,
  onExport,
}: {
  open: boolean;
  exporting: boolean;
  onClose: () => void;
  onExport: (req: ExportRequest) => void;
}) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>('png');
  const [multiplier, setMultiplier] = useState<ExportMultiplier>(2);
  const [transparent, setTransparent] = useState(false);

  if (!open) return null;

  const transparentAllowed = format === 'png';

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(12,10,15,0.28)] backdrop-blur-[2px]"
      onClick={exporting ? undefined : onClose}
    >
      <div
        className="bloome-card-hero w-[360px] max-w-[92vw] p-5 bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold inline-flex items-center gap-2">
            <Download className="w-4 h-4 text-[var(--primary)]" />
            {t('export.title')}
          </h2>
          <button
            onClick={onClose}
            disabled={exporting}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-40"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format */}
        <div className="mb-4">
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1.5">
            {t('export.format')}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                disabled={exporting}
                className={`rounded-md px-2 py-2 text-[12px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                  format === f
                    ? 'bg-[var(--primary)] text-primary-foreground shadow-[0_1px_2px_rgba(12,10,15,0.08)]'
                    : 'bg-white border border-[var(--border-subtle)] text-foreground hover:bg-muted'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution multiplier */}
        <div className="mb-4">
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1.5">
            {t('export.resolution')}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MULTIPLIERS.map((m) => (
              <button
                key={m}
                onClick={() => setMultiplier(m)}
                disabled={exporting}
                className={`rounded-md px-2 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                  multiplier === m
                    ? 'bg-[var(--primary)] text-primary-foreground shadow-[0_1px_2px_rgba(12,10,15,0.08)]'
                    : 'bg-white border border-[var(--border-subtle)] text-foreground hover:bg-muted'
                }`}
              >
                {m}×
              </button>
            ))}
          </div>
        </div>

        {/* Transparent (PNG only) */}
        <label
          className={`flex items-center gap-2 mb-5 text-[12px] ${
            transparentAllowed ? 'cursor-pointer text-foreground' : 'cursor-not-allowed text-muted-foreground/60'
          }`}
        >
          <input
            type="checkbox"
            checked={transparentAllowed && transparent}
            disabled={!transparentAllowed || exporting}
            onChange={(event) => setTransparent(event.target.checked)}
            className="accent-[var(--primary)] w-3.5 h-3.5"
          />
          <span>{t('export.transparent')}</span>
          <span className="text-[10px] font-mono text-muted-foreground/70">{t('export.transparentHint')}</span>
        </label>

        <button
          onClick={() => onExport({ format, multiplier, transparent: transparentAllowed && transparent })}
          disabled={exporting}
          className="w-full rounded-md bg-[var(--primary)] text-primary-foreground font-semibold text-[13px] px-3 py-2.5 inline-flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(12,10,15,0.08)] hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? t('export.exporting') : t('export.download')}
        </button>
      </div>
    </div>
  );
};
