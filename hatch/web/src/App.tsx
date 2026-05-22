import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { AuthGate } from "@/components/AuthGate";
import { APIKeys } from "@/components/magicpath/api-keys/APIKeys";
import { BaaSData } from "@/components/magicpath/baa-s-data/BaaSData";
import { ConnectAI } from "@/components/magicpath/connect-ai/ConnectAI";
import { SitesDashboard } from "@/components/magicpath/sites-dashboard/SitesDashboard";
import { Layout } from "@/layouts/Layout";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthGate>
        {(session) => <Layout user={session.user} />}
      </AuthGate>
    ),
    children: [
      { index: true, element: <Navigate to="/connect" replace /> },
      { path: "connect", element: <ConnectAI /> },
      { path: "sites", element: <SitesDashboard /> },
      { path: "keys", element: <APIKeys /> },
      { path: "baas", element: <BaaSData /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
