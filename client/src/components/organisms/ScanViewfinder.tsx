const corner = 'absolute size-11 border-gold'

/**
 * Camera frame for scanning tickets. The camera feed itself is not wired up yet;
 * a QR scanning library will render into this frame.
 */
export function ScanViewfinder() {
  return (
    <div
      role="img"
      aria-label="Camera view with a ticket QR code inside the scan frame"
      className="relative flex h-[340px] items-center justify-center overflow-hidden rounded-[18px] bg-ink-deep"
    >
      <div className="relative size-[220px]">
        <div className={`${corner} left-0 top-0 rounded-tl-xl border-l-[5px] border-t-[5px]`} />
        <div className={`${corner} right-0 top-0 rounded-tr-xl border-r-[5px] border-t-[5px]`} />
        <div className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-[5px] border-l-[5px]`} />
        <div className={`${corner} bottom-0 right-0 rounded-br-xl border-b-[5px] border-r-[5px]`} />
        <div className="absolute left-[50px] top-[50px] grid size-[120px] grid-cols-5 gap-1 rounded-lg bg-white p-2.5">
          {[1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1].map((on, i) => (
            <div key={i} className={on ? 'bg-ink' : undefined} />
          ))}
        </div>
        <div className="absolute inset-x-3 top-[108px] h-[3px] animate-pulse rounded-sm bg-gold" />
      </div>
      <p className="absolute inset-x-0 bottom-3.5 m-0 text-center text-sm text-on-dark">
        Point the camera at the passenger's QR code
      </p>
    </div>
  )
}
