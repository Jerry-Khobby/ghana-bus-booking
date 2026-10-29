import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

const corner = 'absolute size-11 border-gold'

/** How often to look for a QR code in the camera picture. */
const SCAN_EVERY_MS = 250

interface DetectedCode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedCode[]>
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike

interface ScanViewfinderProps {
  /** Called once per code read; scanning pauses until `paused` goes false again. */
  onRead: (text: string) => void
  paused?: boolean
}

/**
 * The phone's back camera, reading ticket QR codes. Chrome on Android has a
 * built-in detector; elsewhere (iPhone Safari) jsQR reads the frames.
 * Without a camera, or permission, it says so and the code can be typed.
 */
export function ScanViewfinder({ onRead, paused }: ScanViewfinderProps) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const latest = useRef({ onRead, paused })
  latest.current = { onRead, paused }

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: number | undefined
    let stopped = false
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null

    async function read(): Promise<string | null> {
      const v = video.current
      if (!v || v.readyState < 2) return null
      if (detector) {
        const [code] = await detector.detect(v).catch(() => [] as DetectedCode[])
        return code?.rawValue ?? null
      }
      const c = canvas.current
      const ctx = c?.getContext('2d', { willReadFrequently: true })
      if (!c || !ctx) return null
      // A smaller picture is plenty for a QR code and much quicker to search
      const scale = Math.min(1, 480 / v.videoWidth)
      c.width = Math.round(v.videoWidth * scale)
      c.height = Math.round(v.videoHeight * scale)
      ctx.drawImage(v, 0, 0, c.width, c.height)
      const image = ctx.getImageData(0, 0, c.width, c.height)
      return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null
    }

    async function tick() {
      if (stopped) return
      if (!latest.current.paused) {
        const text = await read()
        if (text && !latest.current.paused) latest.current.onRead(text)
      }
      timer = window.setTimeout(tick, SCAN_EVERY_MS)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem('This browser can’t use the camera. Type the ticket code below.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        if (video.current) {
          video.current.srcObject = stream
          await video.current.play().catch(() => undefined)
        }
        void tick()
      } catch (error) {
        const denied = (error as DOMException).name === 'NotAllowedError'
        setProblem(
          denied
            ? 'Camera access was refused. Allow it in the browser settings, or type the ticket code below.'
            : 'No camera found. Type the ticket code below.',
        )
      }
    }
    void start()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="relative flex h-[340px] items-center justify-center overflow-hidden rounded-[18px] bg-ink-deep">
      <video ref={video} muted playsInline aria-label="Camera view" className="absolute inset-0 size-full object-cover" />
      <canvas ref={canvas} hidden />
      <div aria-hidden="true" className="relative size-[220px]">
        <div className={`${corner} left-0 top-0 rounded-tl-xl border-l-[5px] border-t-[5px]`} />
        <div className={`${corner} right-0 top-0 rounded-tr-xl border-r-[5px] border-t-[5px]`} />
        <div className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-[5px] border-l-[5px]`} />
        <div className={`${corner} bottom-0 right-0 rounded-br-xl border-b-[5px] border-r-[5px]`} />
        {!paused && !problem && <div className="absolute inset-x-3 top-[108px] h-[3px] animate-pulse rounded-sm bg-gold" />}
      </div>
      <p role={problem ? 'alert' : undefined} className="absolute inset-x-0 bottom-3.5 m-0 px-4 text-center text-sm text-on-dark">
        {problem ?? (paused ? 'Checking the ticket…' : "Point the camera at the passenger's QR code")}
      </p>
    </div>
  )
}
