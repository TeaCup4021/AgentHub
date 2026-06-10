import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient singleton.
 *
 * Lives in its own module so non-component code (e.g. artifact cards that
 * persist edits outside the React tree) can invalidate queries via
 * `queryClient.invalidateQueries(...)` without needing a `useQueryClient()`
 * hook and an enclosing `QueryClientProvider`.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});
