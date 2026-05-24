import { useCallback, useEffect, useState } from "react";
import type { DependencyList, Dispatch, SetStateAction } from "react";

export type AsyncResource<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<T | null>;
  setData: Dispatch<SetStateAction<T | null>>;
};

export function useAsyncResource<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  options: { enabled?: boolean } = {}
): AsyncResource<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await load();
      setData(next);
      return next;
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error("Request failed.");
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, ...deps]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    load()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error("Request failed."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, ...deps]);

  return { data, loading, error, refetch, setData };
}
