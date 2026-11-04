import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CloseIcon } from '../components/Icons'

const MAX_SECONDS = 20 // the video pipeline keeps the first 20 seconds anyway

type Mode = 'photo' | 'video'
type Facing = 'environment' | 'user'

/** First recording format this browser supports (Safari records MP4, Chrome and Firefox record WebM). */
function recordingFormat(): { mime: string; ext: string } {
  const options = [
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ]
  return options.find((o) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(o.mime)) ?? { mime: '', ext: 'webm' }
}

const FlipIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" />
    <path d="M20 4v4h-4M4 20v-4h4" />
  </svg>
)

const GalleryIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m5 18 5-5 3 3 2.5-2.5L20 18" />
  </svg>
)

/** Momentalk's own camera: live preview, photo or up to 20 seconds of video, and the gallery one tap away. */
export function Camera({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('photo')
  const [facing, setFacing] = useState<Facing>('environment')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [flash, setFlash] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  const stopStream = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(() => {
    let cancelled = false
    async function open() {
      setReady(false)
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera here. Pick a photo or video from the gallery instead.')
        return
      }
      try {
        stopStream()
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current = media
        const el = video.current
        if (el) {
          el.srcObject = media
          await el.play().catch(() => undefined)
          // Ready only once a real frame has arrived, so the first tap always has something to capture.
          await new Promise<void>((resolve) => {
            if (el.videoWidth) return resolve()
            el.addEventListener('loadeddata', () => resolve(), { once: true })
            window.setTimeout(resolve, 4000)
          })
        }
        if (cancelled) return
        setError(null)
        setReady(true)
      } catch {
        if (!cancelled) setError('Camera access is blocked. Allow the camera for this site, or pick from the gallery.')
      }
    }
    void open()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [facing])

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      const s = (Date.now() - started) / 1000
      setSeconds(s)
      if (s >= MAX_SECONDS) recorder.current?.stop()
    }, 100)
    return () => window.clearInterval(timer)
  }, [recording])

  function finish(file: File) {
    stopStream()
    onCapture(file)
  }

  function takePhoto(attempt = 0) {
    const el = video.current
    if (!el) return
    if (!el.videoWidth) {
      // The camera is still warming up: try again shortly instead of ignoring the tap.
      if (attempt < 20) window.setTimeout(() => takePhoto(attempt + 1), 100)
      else setNotice('The camera is not sending a picture yet. Try again.')
      return
    }
    setNotice(null)
    const canvas = document.createElement('canvas')
    canvas.width = el.videoWidth
    canvas.height = el.videoHeight
    canvas.getContext('2d')?.drawImage(el, 0, 0)
    setFlash((n) => n + 1)
    canvas.toBlob((blob) => blob && finish(new File([blob], 'moment.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92)
  }

  function toggleRecording() {
    if (recording) {
      recorder.current?.stop()
      return
    }
    if (!stream.current) return
    const format = recordingFormat()
    const rec = format.mime ? new MediaRecorder(stream.current, { mimeType: format.mime }) : new MediaRecorder(stream.current)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      setRecording(false)
      const type = rec.mimeType || format.mime || 'video/webm'
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      if (chunks.length) finish(new File(chunks, `moment.${ext}`, { type: type.split(';')[0] }))
      else setNotice('That recording came out empty. Try again.')
    }
    rec.onerror = () => {
      setRecording(false)
      setNotice('Recording stopped unexpectedly. Try again.')
    }
    setNotice(null)
    recorder.current = rec
    rec.start(250)
    setSeconds(0)
    setRecording(true)
  }

  const shutter = () => (mode === 'photo' ? takePhoto() : toggleRecording())
  const clock = `0:${String(Math.floor(seconds)).padStart(2, '0')}`

  return (
    <div className="app-surface fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video
        ref={video}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
        style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
      />
      {flash > 0 && <span key={flash} className="camera-flash pointer-events-none absolute inset-0 bg-white" aria-hidden="true" />}

      <header className="pt-safe px-safe relative z-10 flex items-center justify-between">
        <button onClick={() => { recorder.current?.stop(); stopStream(); onClose() }} aria-label="Close camera"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur">
          <CloseIcon />
        </button>
        {recording ? (
          <span className="flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 font-bold tabular-nums" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {clock}
          </span>
        ) : <span />}
        <span className="h-12 w-12" aria-hidden="true" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-8 text-center">
        {error ? (
          <div className="rise max-w-xs">
            <p className="text-[length:var(--text-body)] leading-relaxed">{error}</p>
            <button onClick={() => gallery.current?.click()} className="mt-6 h-12 rounded-full bg-white px-6 font-bold text-ink">
              Open the gallery
            </button>
          </div>
        ) : !ready ? (
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Opening the camera" />
        ) : null}
      </main>

      <footer className="pb-safe relative z-10 bg-gradient-to-t from-black/70 to-transparent pt-6">
        {notice && <p className="mx-auto mb-3 w-fit rounded-full bg-black/60 px-4 py-2 text-[length:var(--text-caption)] font-bold" role="status">{notice}</p>}
        <div className="mb-5 flex justify-center gap-1 text-[length:var(--text-caption)] font-bold" role="tablist" aria-label="Camera mode">
          {(['photo', 'video'] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} disabled={recording} onClick={() => setMode(m)}
                    className={`h-9 rounded-full px-4 uppercase tracking-wider transition ${mode === m ? 'bg-white text-ink' : 'text-white/75'}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="mx-auto flex max-w-sm items-center justify-between px-8 pb-2">
          <button onClick={() => gallery.current?.click()} disabled={recording} aria-label="Pick from the gallery"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur disabled:opacity-30">
            <GalleryIcon />
          </button>
          <button
            onClick={shutter}
            disabled={!ready}
            aria-label={mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'}
            className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40"
          >
            {recording && (
              <span className="hold-ring absolute -inset-1 rounded-full text-white"
                    style={{ '--hold': Math.min(1, seconds / MAX_SECONDS) } as CSSProperties} aria-hidden="true" />
            )}
            <span className={`transition-all duration-200 ${
              mode === 'photo' ? 'h-16 w-16 rounded-full bg-white' : recording ? 'h-7 w-7 rounded-md bg-danger' : 'h-16 w-16 rounded-full bg-danger'
            }`} />
          </button>
          <button onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} disabled={recording}
                  aria-label="Switch camera" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur disabled:opacity-30">
            <FlipIcon />
          </button>
        </div>
      </footer>

      <input
        ref={gallery}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) finish(file)
        }}
      />
    </div>
  )
}
