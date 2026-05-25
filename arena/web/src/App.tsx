import { lazy, Suspense, type ReactElement } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { Shell } from "@/components/Shell";
import { Loading } from "@/components/ui";

const DashboardPage = lazy(() => import("@/pages/Dashboard"));
const ContestantPage = lazy(() => import("@/pages/Contestant"));
const DecisionsPage = lazy(() => import("@/pages/Decisions"));
const DirectoryPage = lazy(() => import("@/pages/Directory"));
const AdminPage = lazy(() => import("@/pages/Admin"));
const ConnectPage = lazy(() => import("@/pages/Connect"));

function withSuspense(element: ReactElement) {
  return <Suspense fallback={<Loading />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: withSuspense(<DashboardPage />) },
      { path: "c/:id", element: withSuspense(<ContestantPage />) },
      { path: "decisions", element: withSuspense(<DecisionsPage />) },
      { path: "contestants", element: withSuspense(<DirectoryPage />) },
      { path: "admin", element: withSuspense(<AdminPage />) },
      { path: "connect", element: withSuspense(<ConnectPage />) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
