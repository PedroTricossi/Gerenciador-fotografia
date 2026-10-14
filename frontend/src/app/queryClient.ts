import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { describeUnexpected, isUnexpected } from "../api/errors";

export function makeQueryClient(
  onUnexpected: (message: string) => void,
  retry = true,
): QueryClient {
  const report = (error: unknown) => {
    if (isUnexpected(error)) onUnexpected(describeUnexpected(error));
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: report }),
    mutationCache: new MutationCache({ onError: report }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // One retry, only for failures a retry can fix.
        retry: retry
          ? (count, error) =>
              count < 1 && error instanceof ApiError && (error.status === 0 || error.status >= 500)
          : false,
      },
      mutations: { retry: false },
    },
  });
}
