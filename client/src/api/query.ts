import { QueryClient } from '@tanstack/react-query'
import { ApiError, isNetworkError } from './client'

/**
 * Shared cache for server data. Data counts as fresh for 15 seconds, since
 * seats and trips change all day. api() already retries a lost connection
 * twice; a read that still fails is tried twice more, a few seconds apart,
 * unless the server said no on purpose (4xx). Coming back online re-reads.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return count < (isNetworkError(error) ? 2 : 1)
      },
      retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 10_000),
    },
    mutations: { retry: false },
  },
})
