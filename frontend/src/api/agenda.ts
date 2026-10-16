import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { agendaKeys } from "./keys";

export function useAgenda(from: string, to: string) {
  return useQuery({
    queryKey: agendaKeys.range(from, to),
    queryFn: () => unwrap(api.GET("/api/v1/agenda", { params: { query: { from, to } } })),
  });
}
