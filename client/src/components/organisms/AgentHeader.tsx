import { Badge, Dropdown, Logo, LogoMark } from '@/components/atoms'

interface AgentHeaderProps {
  station: string
  agent: string
  bays: number[]
  bay: number
  onBayChange: (bay: number) => void
}

export function AgentHeader({ station, agent, bays, bay, onBayChange }: AgentHeaderProps) {
  const bayRange = `${Math.min(...bays)}–${Math.max(...bays)}`
  const picker = (
    <Dropdown
      ariaLabel="Bay"
      tone="dark"
      size="sm"
      className="w-[112px]"
      value={String(bay)}
      options={bays.map((b) => ({ value: String(b), label: `Bay ${b}` }))}
      onChange={(v) => onBayChange(Number(v))}
    />
  )

  return (
    <header className="bg-ink text-white">
      {/* Phone */}
      <div className="flex items-center justify-between gap-2.5 px-4 py-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <LogoMark size={28} />
          <div>
            <p className="m-0 font-display text-[17px] font-extrabold leading-tight">Agent</p>
            <p className="m-0 text-xs text-on-dark">
              {station.split('—')[1]?.replace(' station', '').trim() ?? station} · bays {bayRange}
            </p>
          </div>
        </div>
        {picker}
      </div>

      {/* Tablet and desktop */}
      <div className="mx-auto hidden max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3.5 md:flex">
        <div className="flex flex-wrap items-center gap-3">
          <Logo label="Seatline Agent" size="sm" />
          <Badge tone="chip">{station}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-on-dark">Signed in as {agent}</span>
          {picker}
        </div>
      </div>
    </header>
  )
}
