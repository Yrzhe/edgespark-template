import { useEffect, useRef } from "react";

export function usePoll(fn: () => void | Promise<void>, ms: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (enabled && document.visibilityState === "visible") await fnRef.current();
      if (!cancelled) timer = window.setTimeout(tick, ms);
    }

    function onVisibility() {
      if (document.visibilityState === "visible" && enabled) void fnRef.current();
    }

    timer = window.setTimeout(tick, ms);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, ms]);
}
