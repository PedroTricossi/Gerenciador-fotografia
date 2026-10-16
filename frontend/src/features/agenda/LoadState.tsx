import type { UseQueryResult } from "@tanstack/react-query";
import { Banner, Button } from "../../ui";

/** "Carregando…" while loading, the error banner with a retry on failure, else nothing. */
export function LoadState({ query }: { query: UseQueryResult<unknown> }) {
  if (query.isPending) return <p>Carregando…</p>;
  if (query.isError) {
    return (
      <Banner tone="error">
        Não foi possível carregar a agenda.{" "}
        <Button onClick={() => void query.refetch()}>Tentar de novo</Button>
      </Banner>
    );
  }
  return null;
}
