import { NAVY, ORANGE, GREEN, RED } from "@/lib/constants";

export function toNum(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function number(value: number) {
  return new Intl.NumberFormat().format(Math.round(value));
}

export function money(value: number, compact = false) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatDate(ms: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function shortTime(ms: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

export function countdown(ms: number) {
  const diff = Math.abs(ms - Date.now());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export function palette(index: number) {
  return [NAVY, ORANGE, GREEN, RED, "#7A4FB0", "#0C8C8C"][index % 6];
}

export function dateInput(ms: number | null) {
  return ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
}

export function msInput(value: string) {
  return value ? new Date(value).getTime() : null;
}
