import { PageLayout, TextLink } from "../ui";

export function NotFoundPage() {
  return (
    <PageLayout title="Página não encontrada">
      <TextLink to="/agenda">Ir para a agenda</TextLink>
    </PageLayout>
  );
}
