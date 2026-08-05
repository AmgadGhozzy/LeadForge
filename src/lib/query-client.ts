// ──────────────────────────────────────────────
// TanStack Query Client Configuration
// ──────────────────────────────────────────────

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 minutes — data stays "fresh"
      gcTime: 1000 * 60 * 30,      // 30 minutes — garbage collection
      retry: 1,                     // Retry once on failure
      refetchOnWindowFocus: false,  // Don't refetch when user returns to tab
    },
    mutations: {
      retry: 0,                     // Don't retry mutations
    },
  },
});
