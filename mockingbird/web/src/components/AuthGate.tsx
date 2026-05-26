import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthSession } from "@edgespark/web";
import { client } from "@/lib/edgespark";

export function AuthGate({ children }: { children: (session: AuthSession) => ReactNode }) {
  const authRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    client.auth
      .requireSession()
      .then((next) => {
        if (!cancelled) setSession(next);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || session || !authRef.current) return;
    const mounted = client.authUI.mount(authRef.current, {
      onSuccess: (event) => {
        if (event.session) setSession(event.session);
        else window.location.reload();
      },
    });
    return () => mounted.destroy();
  }, [loading, session]);

  if (loading) return <main className="min-h-screen bg-background" />;
  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded border border-border bg-card p-4">
          <p className="mb-3 text-sm text-muted-foreground">Sign in as the owner to manage Mockingbird.</p>
          <div ref={authRef} />
        </div>
      </main>
    );
  }
  return <>{children(session)}</>;
}
