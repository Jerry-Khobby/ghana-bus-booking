import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

/**
 * Shared cache for server data. A failed read is retried once unless the
 * server said no on purpose (4xx), and data counts as fresh for 15 seconds,
 * since seats and trips change all day.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
    },
    mutations: { retry: false },
  },
})
