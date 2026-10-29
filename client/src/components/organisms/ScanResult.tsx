import { Button, StatusMark } from '@/components/atoms'

interface ValidScanProps {
  passenger: string
  code: string
  seat: string
  detail: string
  boarded: boolean
  onBoard: () => void
  busy?: boolean
}

export function ValidScan({ passenger, code, seat, detail, boarded, onBoard, busy }: ValidScanProps) {
  return (
    <section aria-labelledby="result-h" className="overflow-hidden rounded-[18px] bg-surface text-ink">
      <div className="flex items-center gap-2.5 bg-brand px-[18px] py-3.5 text-white">
        <StatusMark ok size={26} />
        <h1 id="result-h" className="m-0 font-display text-[22px] font-extrabold">
          Valid ticket
        </h1>
      </div>
      <div className="flex flex-col gap-3.5 p-[18px]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-lg font-semibold">{passenger}</p>
            <p className="m-0 font-mono text-sm text-muted">{code}</p>
          </div>
          <div className="text-right">
            <p className="m-0 text-xs text-muted">Seat</p>
            <p className="m-0 font-mono text-[34px] font-semibold leading-none">{seat}</p>
          </div>
        </div>
        <p className="m-0 text-sm text-muted">{detail}</p>
        {boarded ? (
          <p role="status" className="m-0 flex min-h-14 items-center justify-center rounded-xl bg-brand-tint text-[17px] font-semibold text-brand-ink">
            Boarded · scan the next ticket
          </p>
        ) : (
          <Button size="xl" className="text-[17px]" onClick={onBoard} disabled={busy} aria-busy={busy}>
            {busy ? 'Boarding…' : 'Mark as boarded'}
          </Button>
        )}
      </div>
    </section>
  )
}

export function InvalidScan({ reason }: { reason: string }) {
  return (
    <section aria-labelledby="invalid-h" className="overflow-hidden rounded-[18px] bg-surface text-ink">
      <div className="flex items-center gap-2.5 bg-danger px-[18px] py-3 text-white">
        <StatusMark ok={false} size={24} tone="#CF0921" />
        <h2 id="invalid-h" className="m-0 font-display text-lg font-extrabold">
          Not valid here
        </h2>
      </div>
      <p className="m-0 px-[18px] py-3 text-sm text-muted">{reason}</p>
    </section>
  )
}
