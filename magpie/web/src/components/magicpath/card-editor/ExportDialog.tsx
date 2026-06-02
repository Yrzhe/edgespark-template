import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, Loader2, FileImage, FileType, FileText } from 'lucide-react';
import type { ExportFormat, ExportMultiplier } from '@/lib/export';

export type ExportRequest = {
  format: ExportFormat;
  multiplier: ExportMultiplier;
  transparent: boolean;
};

const FORMATS: ExportFormat[] = ['png', 'jpg', 'pdf'];
const MULTIPLIERS: ExportMultiplier[] = [1, 2, 4];
const FORMAT_ICON = { png: FileImage, jpg: FileType, pdf: FileText };

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
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(12,10,15,0.28)]"
      onClick={exporting ? undefined : onClose}
    >
      <div
        className="w-[380px] max-w-[92vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(20,28,46,.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdeee9] text-[#F36440]">
            <Download className="w-4 h-4" />
          </span>
          <h2 className="text-[15px] font-bold tracking-tight">
            {t('export.title')}
          </h2>
          <button
            onClick={onClose}
            disabled={exporting}
            className="ml-auto p-1 rounded-md hover:bg-[#f3f4f6] text-[#9aa1b1] hover:text-[#1a1d24] disabled:opacity-40"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format */}
        <div className="px-5 pt-4">
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1.5">
            {t('export.format')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => {
              const Icon = FORMAT_ICON[f];
              return <button
                key={f}
                onClick={() => setFormat(f)}
                disabled={exporting}
                className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-[12px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                  format === f
                    ? 'border-[#f3b39c] bg-[#fdeee9] text-[#1a1d24]'
                    : 'border-[#e4e7ec] bg-white text-[#42485a] hover:bg-[#f6f7f9]'
                }`}
              >
                <Icon className={`h-5 w-5 ${format === f ? 'text-[#F36440]' : 'text-[#7a8194]'}`} />
                <span>{t(`export.${f}`)}</span>
                <span className="normal-case text-[10px] font-medium tracking-normal text-[#9aa1b1]">{t(`export.${f}Hint`)}</span>
              </button>;
            })}
          </div>
        </div>

        {/* Resolution multiplier */}
        <div className="px-5 pt-4">
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1.5">
            {t('export.resolution')}
          </div>
          <div className="flex gap-1 rounded-lg bg-[#f3f4f6] p-0.5 text-[12px]">
            {MULTIPLIERS.map((m) => (
              <button
                key={m}
                onClick={() => setMultiplier(m)}
                disabled={exporting}
                className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                  multiplier === m
                    ? 'bg-white text-[#1a1d24] shadow-sm'
                    : 'text-[#7a8194] hover:text-[#42485a]'
                }`}
              >
                {m}×
              </button>
            ))}
          </div>
        </div>

        {/* Transparent (PNG only) */}
        <label
          title={transparentAllowed ? undefined : t('export.disabledTransparent')}
          className={`mx-5 mt-4 flex items-center justify-between rounded-lg border border-[#e4e7ec] px-3 py-2 text-[12.5px] ${
            transparentAllowed ? 'cursor-pointer text-foreground' : 'cursor-not-allowed text-muted-foreground/60'
          }`}
        >
          <span className="shrink-0 whitespace-nowrap">{t('export.transparent')}</span>
          <input
            type="checkbox"
            checked={transparentAllowed && transparent}
            disabled={!transparentAllowed || exporting}
            onChange={(event) => setTransparent(event.target.checked)}
            className="accent-[var(--primary)] w-3.5 h-3.5"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2 border-t border-[#eef0f3] bg-[#fafbfc] px-5 py-3">
          <button onClick={onClose} disabled={exporting} className="whitespace-nowrap rounded-lg border border-[#e4e7ec] px-3.5 py-2 text-[12.5px] font-semibold text-[#42485a] hover:bg-[#f3f4f6] disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onExport({ format, multiplier, transparent: transparentAllowed && transparent })}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#F36440] px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_1px_2px_rgba(12,10,15,0.08)] transition-opacity hover:bg-[#d9532b] disabled:opacity-60"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? t('export.exporting') : t('export.download')}
          </button>
        </div>
      </div>
    </div>
  );
};
