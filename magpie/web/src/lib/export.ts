// Card export — render the on-canvas composition to PNG / JPG / PDF at the card's
// REAL resolution (card.width × card.height), not the scaled editor preview.
//
// Renderer: `html-to-image` (SVG <foreignObject>), NOT html2canvas. The editor's
// chrome uses `color-mix(in oklab …)` (10× in CardEditor) and Tailwind v4 emits
// `oklch(…)`; html2canvas parses CSS colors itself and throws / mis-renders on
// those functions, and its `text-decoration-style: wavy` support is partial.
// foreignObject defers rendering to the browser engine, so modern CSS + wavy
// underlines render natively. `dom-to-image-more` (the spec's named alternative)
// is the same foreignObject family; html-to-image is its TS-native successor.
// See NOTES R6-export.
import { toPng, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

export type ExportFormat = 'png' | 'jpg' | 'pdf';
export type ExportMultiplier = 1 | 2 | 4;

export type ExportOptions = {
  format: ExportFormat;
  multiplier: ExportMultiplier;
  transparent: boolean;
  ratio: string;
  widthPx: number;
  heightPx: number;
  bg: string;
  title: string;
};

// Mirror of CardEditor.actualSize — the real card resolution for a ratio. Kept in
// sync deliberately: export must emit real px, never the scaled preview box.
function actualSize(ratio: string, widthPx: number, heightPx: number): { width: number; height: number } {
  switch (ratio) {
    case '1:1':
      return { width: 1080, height: 1080 };
    case '9:16':
      return { width: 1080, height: 1920 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '3:4':
      return { width: 1080, height: 1440 };
    case '1.91:1':
      return { width: 1200, height: 628 };
    default:
      return { width: widthPx, height: heightPx };
  }
}

// Keep CJK + alphanumerics, collapse everything else to a single hyphen.
function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9一-鿿]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'card';
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Strip the editor's decorative frame (rounded corners + hairline shadow) and, in
// transparent mode, the card background — so the export is a clean full-bleed
// rectangle of the composed card. Applied to the html-to-image clone only.
function chromeStyle(transparent: boolean, bg: string): Record<string, string> {
  return {
    borderRadius: '0px',
    boxShadow: 'none',
    border: '0',
    background: transparent ? 'transparent' : bg,
  };
}

// Drop selection chrome that may slip into the clone: resize handles, and (in
// transparent mode) the solid background layer marked `data-card-bg-layer`.
// html-to-image never calls `filter` on the root node, so excluding the bg layer
// is safe here.
function chromeFilter(transparent: boolean) {
  return (node: HTMLElement): boolean => {
    if (!(node instanceof HTMLElement)) return true;
    if (node.dataset?.resizeHandle) return false;
    if (transparent && node.dataset?.cardBgLayer !== undefined) return false;
    return true;
  };
}

/**
 * Render `node` (the on-canvas card frame) to PNG/JPG/PDF at real resolution and
 * trigger a browser download. Output pixel size = actualSize(ratio) × multiplier
 * (html-to-image: canvas.width = canvasWidth × pixelRatio). The frame is
 * `overflow-hidden`, so anything bled past ±BLEED is already clipped (Canva-style).
 */
export async function exportCard(node: HTMLElement, opts: ExportOptions): Promise<void> {
  const { format, multiplier, transparent, ratio, widthPx, heightPx, bg, title } = opts;
  const actual = actualSize(ratio, widthPx, heightPx);
  const isTransparent = transparent && format === 'png';

  const common = {
    canvasWidth: actual.width,
    canvasHeight: actual.height,
    pixelRatio: multiplier,
    cacheBust: true,
    style: chromeStyle(isTransparent, bg),
    filter: chromeFilter(isTransparent),
  } as const;

  const ext = format === 'jpg' ? 'jpg' : format === 'pdf' ? 'pdf' : 'png';
  const filename = `${slugify(title)}-${timestamp()}.${ext}`;

  if (format === 'png') {
    const dataUrl = await toPng(node, {
      ...common,
      backgroundColor: isTransparent ? undefined : bg,
    });
    triggerDownload(dataUrl, filename);
    return;
  }

  if (format === 'jpg') {
    // JPG has no alpha — paint a white base, then the card's own bg over it.
    const dataUrl = await toJpeg(node, { ...common, backgroundColor: '#FFFFFF', quality: 0.95 });
    triggerDownload(dataUrl, filename);
    return;
  }

  // PDF — embed the full-resolution PNG into a single page sized to the bitmap.
  const pngDataUrl = await toPng(node, { ...common, backgroundColor: bg });
  const pxW = actual.width * multiplier;
  const pxH = actual.height * multiplier;
  const pdf = new jsPDF({
    orientation: pxW >= pxH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pxW, pxH],
  });
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, pxW, pxH);
  pdf.save(filename);
}
