import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPayment, SETTLED, type ApiPayment } from './booking'
import { useEventStream } from './stream'

export const paymentKey = (id: string) => ['payments', id] as const

/**
 * A payment, followed until it settles: the live stream says when it
 * changes, and a poll every 5 seconds backs it up. The poll also nudges the
 * server to ask Paystack after 30 seconds, so a missed webhook can't strand
 * the passenger on the waiting screen.
 */
export function usePayment(paymentId: string | null | undefined, holdToken: string | null | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: paymentKey(paymentId ?? ''),
    queryFn: () => getPayment(paymentId!, holdToken),
    enabled: !!paymentId,
    refetchInterval: (q) => (q.state.data && SETTLED.includes(q.state.data.status) ? false : 5_000),
    staleTime: 0,
  })
  const settled = !!query.data && SETTLED.includes(query.data.status)

  useEventStream<Pick<ApiPayment, 'status'>>(
    paymentId ? `/payments/${paymentId}/stream` : null,
    { holdToken: holdToken ?? undefined },
    {
      event: 'payment',
      enabled: !settled,
      // The event is a summary; read the full payment (tickets, messages) again
      onMessage: () => void queryClient.invalidateQueries({ queryKey: paymentKey(paymentId!) }),
    },
  )
  return query
}
