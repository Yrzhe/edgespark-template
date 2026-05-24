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
    user: session?.user ?? null,
    session,
    loading,
    isAuthenticated: !!session,
    signOut: () => client.auth.signOut(),
  };
}
