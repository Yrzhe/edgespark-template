import { ctx } from "edgespark";

// Single place that offloads a fire-and-forget promise to the Worker's post-response window.
// Prefers waitUntil (canonical Cloudflare/EdgeSpark name) and falls back to runInBackground.
// In test/dev with neither, the promise still runs (its rejection is swallowed by callers).
export function scheduleBackground(task: Promise<unknown>): void {
  const runtime = ctx as unknown as {
    waitUntil?: (promise: Promise<unknown>) => void;
    runInBackground?: (promise: Promise<unknown>) => void;
  };
  if (typeof runtime.waitUntil === "function") {
    runtime.waitUntil(task);
    return;
  }
  if (typeof runtime.runInBackground === "function") {
    runtime.runInBackground(task);
    return;
  }
  void task;
}

// Resolve a promise or reject with `tool_timeout` after `ms`. Used as the per-tool-call watchdog
// (M-102) so a single slow tool can never hang an agent run forever in "running".
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
