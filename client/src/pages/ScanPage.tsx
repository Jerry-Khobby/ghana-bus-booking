import { useState } from 'react'
import { Link } from 'react-router'
import { useStation } from '@/app/StationContext'
import { Badge } from '@/components/atoms'
import { InvalidScan, ScanViewfinder, ValidScan } from '@/components/organisms'
import { PassTemplate } from '@/components/templates'

export function ScanPage() {
  const { bay, markBoarded } = useStation()
  const [boarded, setBoarded] = useState(false)

  return (
    <PassTemplate tone="dark">
      <div className="flex items-center justify-between gap-3">
        <Link to="/agent" className="inline-flex min-h-11 items-center font-semibold text-white no-underline hover:text-on-dark">
          ← Console
        </Link>
        <Badge tone="chip">Bay {bay} · GR 4471-24</Badge>
      </div>

      <ScanViewfinder />

      <ValidScan
        passenger="Ama K."
        code="SL-7Q4K-2M"
        seat={14}
        detail="Accra → Kumasi · this bus · paid online"
        boarded={boarded}
        onBoard={() => {
          setBoarded(true)
          markBoarded()
        }}
      />

      <InvalidScan reason="How a rejected scan looks: the ticket was already used at 10:42, or it is for another trip. Do not let the passenger board." />
    </PassTemplate>
  )
}
