import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { useStation } from '@/app/StationContext'
import { Badge, Dropdown, Icon, Logo, LogoMark } from '@/components/atoms'

interface AgentHeaderProps {
  station: string
  agent: string
  /** Phone header shows a back arrow to the console instead of the bay picker. */
  back?: { to: string; label: string; title: string }
}

export function AgentHeader({ station, agent, back }: AgentHeaderProps) {
  const { bays, bay, setBay } = useStation()
  const { signOutStaff } = useAuth()
  const navigate = useNavigate()
  const bayRange = `${Math.min(...bays)}–${Math.max(...bays)}`
  const stationShort = station.split('—')[1]?.replace(' station', '').trim() ?? station

  function signOut() {
    signOutStaff()
    navigate('/staff/signin?role=agent')
  }

  const signOutButton = (
    <button type="button" onClick={signOut} className="flex min-h-11 cursor-pointer items-center border-0 bg-transparent px-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline">
      Sign out
    </button>
  )

  const picker = (
    <Dropdown
      ariaLabel="Bay"
      tone="dark"
      size="sm"
      className="w-[112px]"
      value={String(bay)}
      options={bays.map((b) => ({ value: String(b), label: `Bay ${b}` }))}
      onChange={(v) => setBay(Number(v))}
    />
  )

  return (
    <header className="bg-ink text-white">
      {/* Phone */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 md:hidden">
        {back ? (
          <div className="flex min-w-0 items-center gap-1">
            <Link to={back.to} aria-label={back.label} className="flex size-11 shrink-0 items-center justify-center text-white hover:text-on-dark">
              <Icon name="back" size={22} />
            </Link>
            <div className="min-w-0">
              <p className="m-0 font-display text-[17px] font-extrabold leading-tight">{back.title}</p>
              <p className="m-0 truncate text-xs text-on-dark">
                {stationShort} · bays {bayRange} · {agent}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 pl-1">
            <LogoMark size={28} />
            <div className="min-w-0">
              <p className="m-0 font-display text-[17px] font-extrabold leading-tight">Agent</p>
              <p className="m-0 truncate text-xs text-on-dark">
                {stationShort} · bays {bayRange}
              </p>
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {!back && picker}
          {signOutButton}
        </div>
      </div>

      {/* Tablet and desktop */}
      <div className="mx-auto hidden max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3.5 md:flex">
        <div className="flex flex-wrap items-center gap-3">
          <Logo label="Seatline Agent" size="sm" />
          <Badge tone="chip">{station}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-on-dark">
            <span className="hidden lg:inline">Signed in as </span>
            {agent} · Bays {bayRange}
          </span>
          {!back && picker}
          {signOutButton}
        </div>
      </div>
    </header>
  )
}
