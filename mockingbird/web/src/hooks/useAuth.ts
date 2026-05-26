import { useEffect, useState } from "react";
import type { AuthSession } from "@edgespark/web";
import { clearManagementToken } from "@/lib/api";
import { client } from "@/lib/edgespark";

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = client.auth.onSessionChange((nextSession) => {
      if (!nextSession) clearManagementToken();
      setSession(nextSession);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    isAuthenticated: Boolean(session),
    signOut: () => client.auth.signOut(),
  };
}
