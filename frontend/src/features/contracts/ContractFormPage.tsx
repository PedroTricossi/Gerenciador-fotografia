import { PageLayout } from "../../ui";

export function ContractFormPage({ id }: { id?: string }) {
  return <PageLayout title={id ? "Editar contrato" : "Novo contrato"} />;
}
