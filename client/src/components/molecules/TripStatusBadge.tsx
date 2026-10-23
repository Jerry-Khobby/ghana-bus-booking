import { Badge } from '@/components/atoms'
import type { TripStatus } from '@/data/types'

interface TripStatusBadgeProps {
  status: TripStatus
  label: string
  size?: 'sm' | 'md'
  live?: boolean
}

export function TripStatusBadge({ status, label, size, live }: TripStatusBadgeProps) {
  return (
    <Badge tone={status} size={size} dot={live}>
      {label}
    </Badge>
  )
}
