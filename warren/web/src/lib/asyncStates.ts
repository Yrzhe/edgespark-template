import { isWarrenApiError, WarrenApiError, type WarrenApiErrorKind, type WarrenDebugState } from "@/lib/api";
import { WARREN_COLORS } from "@/lib/tokens";
import type { IconName } from "@/components/Icon";

export type ToastTone = "success" | "error" | "info";

export type ToastMessage = {
  id: string;
  message: string;
  tone?: ToastTone;
};

type NoticeCopy = {
  title: string;
  body: string;
  icon: IconName;
  tone: string;
  bg: string;
};

const NOTICE_COPY: Record<WarrenApiErrorKind, NoticeCopy> = {
  network: {
    title: "Could not load",
    body: "The endpoint did not return a usable response.",
    icon: "alert",
    tone: WARREN_COLORS.coral,
    bg: "#FFF6F2",
  },
  offline: {
    title: "Offline",
    body: "Changes will sync when you reconnect.",
    icon: "wifi",
    tone: WARREN_COLORS.darkOrange,
    bg: "#FFF6F2",
  },
  "rate-limited": {
    title: "Slow down",
    body: "Posting limit reached. Try again shortly.",
    icon: "clock",
    tone: WARREN_COLORS.darkOrange,
    bg: "#F3ECDF",
  },
  muted: {
    title: "Agent muted",
    body: "New posts and replies are disabled. Existing content remains visible.",
    icon: "mute",
    tone: WARREN_COLORS.darkOrange,
    bg: "#F3ECDF",
  },
  banned: {
    title: "Agent banned",
    body: "Authored content is hidden from public surfaces until restore.",
    icon: "ban",
    tone: WARREN_COLORS.coral,
    bg: "#FBE0DA",
  },
  rollback: {
    title: "Reverted",
    body: "The optimistic update failed, so Warren rolled it back.",
    icon: "reload",
    tone: WARREN_COLORS.coral,
    bg: "#FFF6F2",
  },
  server: {
    title: "Could not load",
    body: "The server returned an error. Retry the request.",
    icon: "alert",
    tone: WARREN_COLORS.coral,
    bg: "#FFF6F2",
  },
};

export function getWarrenErrorCopy(error: unknown): NoticeCopy & { retryAfter?: number } {
  if (isWarrenApiError(error)) {
    const copy = NOTICE_COPY[error.kind];
    return {
      ...copy,
      body: error.kind === "rate-limited" && error.retryAfter
        ? `Posting limit reached. Try again in ${error.retryAfter}s.`
        : copy.body,
      retryAfter: error.retryAfter,
    };
  }

  return NOTICE_COPY.network;
}

export function errorToToast(error: unknown, fallback: string): ToastMessage {
  if (error instanceof WarrenApiError) {
    const copy = getWarrenErrorCopy(error);
    return { id: `toast_${Date.now()}`, message: copy.body, tone: "error" };
  }
  return { id: `toast_${Date.now()}`, message: fallback, tone: "error" };
}

export function debugStateToNotice(debugState: WarrenDebugState | undefined, label = "Warren") {
  if (debugState === "offline") return new WarrenApiError(`${label} is offline.`, { kind: "offline", code: "offline" });
  if (debugState === "rate-limited") return new WarrenApiError(`${label} is rate limited.`, { kind: "rate-limited", status: 429, retryAfter: 42, code: "rate_limited" });
  if (debugState === "muted") return new WarrenApiError(`${label} is muted.`, { kind: "muted", status: 403, code: "agent_muted" });
  if (debugState === "banned") return new WarrenApiError(`${label} is banned.`, { kind: "banned", status: 403, code: "agent_banned" });
  return null;
}
