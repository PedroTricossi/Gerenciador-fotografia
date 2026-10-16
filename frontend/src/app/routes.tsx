import { Navigate, Outlet, type RouteObject, useParams } from "react-router";
import { AgendaPage } from "../features/agenda/AgendaPage";
import { ClientListPage } from "../features/clients/ClientListPage";
import { ContractFormPage } from "../features/contracts/ContractFormPage";
import { ContractListPage } from "../features/contracts/ContractListPage";
import { ServiceListPage } from "../features/services/ServiceListPage";
import { Nav } from "../ui";
import { NotFoundPage } from "./NotFoundPage";

const LINKS = [
  { to: "/agenda", label: "Agenda" },
  { to: "/contratos", label: "Contratos" },
  { to: "/clientes", label: "Clientes" },
  { to: "/servicos", label: "Serviços" },
];

function AppShell() {
  return (
    <>
      <Nav links={LINKS} />
      <Outlet />
    </>
  );
}

function ContractFormRoute() {
  const { id } = useParams();
  return <ContractFormPage key={id ?? "novo"} id={id} />;
}

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/agenda" replace /> },
      { path: "agenda", element: <AgendaPage /> },
      { path: "contratos", element: <ContractListPage /> },
      { path: "contratos/novo", element: <ContractFormRoute /> },
      { path: "contratos/:id", element: <ContractFormRoute /> },
      { path: "clientes", element: <ClientListPage /> },
      { path: "servicos", element: <ServiceListPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
