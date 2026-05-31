export interface LabColor {
  l: number;
  a: number;
  b: number;
}

export function hexToLab(hex: string): LabColor | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const [x, y, z] = rgbToXyz(linearize(r), linearize(g), linearize(b));
  return xyzToLab(x, y, z);
}

export function deltaE2000(c1: LabColor, c2: LabColor): number {
  const avgLp = (c1.l + c2.l) / 2;
  const c1p = Math.sqrt(c1.a * c1.a + c1.b * c1.b);
  const c2p = Math.sqrt(c2.a * c2.a + c2.b * c2.b);
  const avgC = (c1p + c2p) / 2;
  const g = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = (1 + g) * c1.a;
  const a2p = (1 + g) * c2.a;
  const c1pp = Math.sqrt(a1p * a1p + c1.b * c1.b);
  const c2pp = Math.sqrt(a2p * a2p + c2.b * c2.b);
  const avgCpp = (c1pp + c2pp) / 2;
  const h1p = hueDeg(c1.b, a1p);
  const h2p = hueDeg(c2.b, a2p);
  const deltahp = Math.abs(h1p - h2p) <= 180 ? h2p - h1p : h2p <= h1p ? h2p - h1p + 360 : h2p - h1p - 360;
  const deltaLp = c2.l - c1.l;
  const deltaCp = c2pp - c1pp;
  const deltaHp = 2 * Math.sqrt(c1pp * c2pp) * Math.sin(toRad(deltahp / 2));
  const avgHp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  const t = 1 - 0.17 * Math.cos(toRad(avgHp - 30)) + 0.24 * Math.cos(toRad(2 * avgHp)) + 0.32 * Math.cos(toRad(3 * avgHp + 6)) - 0.2 * Math.cos(toRad(4 * avgHp - 63));
  const deltaTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(avgCpp ** 7 / (avgCpp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2);
  const sc = 1 + 0.045 * avgCpp;
  const sh = 1 + 0.015 * avgCpp * t;
  const rt = -Math.sin(toRad(2 * deltaTheta)) * rc;
  return Math.sqrt((deltaLp / sl) ** 2 + (deltaCp / sc) ** 2 + (deltaHp / sh) ** 2 + rt * (deltaCp / sc) * (deltaHp / sh));
}

function linearize(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100,
    (r * 0.2126729 + g * 0.7151522 + b * 0.072175) * 100,
    (r * 0.0193339 + g * 0.119192 + b * 0.9503041) * 100,
  ];
}

function xyzToLab(x: number, y: number, z: number): LabColor {
  const fx = labPivot(x / 95.047);
  const fy = labPivot(y / 100);
  const fz = labPivot(z / 108.883);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labPivot(v: number): number {
  return v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
}

function hueDeg(b: number, a: number): number {
  const h = Math.atan2(b, a) * 180 / Math.PI;
  return h >= 0 ? h : h + 360;
}

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}
