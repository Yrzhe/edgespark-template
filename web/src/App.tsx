import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { AuthGate } from "@/components/AuthGate";
import { ConnectAI } from "@/components/magicpath/connect-ai/ConnectAI";
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
      { path: "sites", element: <Placeholder title="Sites" /> },
      { path: "keys", element: <Placeholder title="API Keys" /> },
      { path: "baas", element: <Placeholder title="BaaS Data" /> },
    ],
  },
]);

function Placeholder({ title }: { title: string }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500">This page is installed from MagicPath and will be wired after Connect AI.</p>
      </header>
    </main>
  );
}

function App() {
  return <RouterProvider router={router} />;
}

export default App;
