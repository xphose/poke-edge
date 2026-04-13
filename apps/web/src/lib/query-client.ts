import { QueryClient } from '@tanstack/react-query'

/** Shared defaults: avoid refetch storms; server also sets short HTTP cache on several routes. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
