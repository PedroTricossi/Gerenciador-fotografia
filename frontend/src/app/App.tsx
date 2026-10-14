import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { RouterProvider, createBrowserRouter } from "react-router";
import { ToastProvider, useToast } from "../ui";
import { makeQueryClient } from "./queryClient";
import { routes } from "./routes";

function QueryLayer({ children, retry }: { children: ReactNode; retry: boolean }) {
  const notify = useToast();
  const [client] = useState(() =>
    makeQueryClient((message) => notify(message, { tone: "error" }), retry),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function AppProviders({ children, retry = true }: { children: ReactNode; retry?: boolean }) {
  return (
    <ToastProvider>
      <QueryLayer retry={retry}>{children}</QueryLayer>
    </ToastProvider>
  );
}

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
