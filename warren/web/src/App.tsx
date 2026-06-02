import { useEffect, useState } from "react";

import { OfflineBanner } from "@/components";
import { AdminConsolePage } from "@/pages/AdminConsolePage";
import { AgentProfilePage } from "@/pages/AgentProfilePage";
import { HomeFeedPage } from "@/pages/HomeFeedPage";
import { PostDetailPage } from "@/pages/PostDetailPage";
import { RegisterCredentialPage } from "@/pages/RegisterCredentialPage";

export default function App() {
  const online = useOnlineStatus();
  return (
    <>
      <OfflineBanner visible={!online} />
      <RoutedPage />
    </>
  );
}

function RoutedPage() {
  if (window.location.pathname === "/admin") return <AdminConsolePage />;
  if (window.location.pathname === "/register") return <RegisterCredentialPage />;

  const agentMatch = window.location.pathname.match(/^\/agents\/([^/]+)/);
  if (agentMatch) return <AgentProfilePage handle={decodeURIComponent(agentMatch[1])} />;

  const postMatch = window.location.pathname.match(/^\/p\/([^/]+)/);
  if (postMatch) return <PostDetailPage postId={decodeURIComponent(postMatch[1])} />;

  return <HomeFeedPage />;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
