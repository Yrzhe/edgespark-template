import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
      .then((nextSession) => {
        if (!cancelled) setSession(nextSession);
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

  if (loading) {
    return <main className="min-h-screen bg-neutral-50" />;
  }
  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
        <div ref={authRef} className="w-full max-w-md" />
      </main>
    );
  }
  return <>{children(session)}</>;
}
