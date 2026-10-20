import { useQuery } from "@tanstack/react-query";
import { todayIso } from "../domain/dates";
import { api, unwrap } from "./client";
import { overviewKeys } from "./keys";

export { overviewKeys };

export function useOverview(period: "month" | "year", value: string) {
  const today = todayIso();
  return useQuery({
    queryKey: overviewKeys.overview(period, value, today),
    queryFn: () =>
      unwrap(api.GET("/api/v1/overview", { params: { query: { period, value, today } } })),
  });
}

export function useTransportGuide(distanceTenths?: number, leftHomeAt?: string) {
  const today = todayIso();
  return useQuery({
    queryKey: overviewKeys.guide(today, distanceTenths ?? null, leftHomeAt ?? null),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/transport-guide", {
          params: {
            query: {
              today,
              ...(distanceTenths === undefined ? {} : { distance_tenths: distanceTenths }),
              ...(leftHomeAt === undefined ? {} : { left_home_at: leftHomeAt }),
            },
          },
        }),
      ),
  });
}
