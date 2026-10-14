import { Link } from "react-router";
import { PageLayout } from "../ui";

export function NotFoundPage() {
  return (
    <PageLayout title="Página não encontrada">
      <p>
        <Link to="/contratos">Ir para contratos</Link>
      </p>
    </PageLayout>
  );
}
