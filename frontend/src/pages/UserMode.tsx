import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { api, type Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { FitBox } from '../components/FitBox'
import { SceneCanvas, type HeardPulse } from '../components/SceneCanvas'
import { useLiveModeling } from '../useLiveModeling'

interface UserModeProps {
  scenes: Scene[]
  initialSceneId?: string | null
  personName: string
  onExit: () => void
}

const HOLD_MS = 900

/** Press and hold to leave, so a child cannot exit by accident (common guard in AAC apps). */
function HoldToExit({ onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState(0)
  const raf = useRef(0)
  const start = useRef(0)

  function begin() {
    start.current = performance.now()
    const tick = () => {
      const p = Math.min(1, (performance.now() - start.current) / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        onExit()
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  function cancel() {
    cancelAnimationFrame(raf.current)
    setProgress(0)
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <button
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => e.key === 'Enter' && onExit()}
      aria-label="Hold to go back to caregiver"
      className="relative flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/10 pl-1.5 pr-4 text-sm font-bold text-white/80 backdrop-blur"
    >
      <span className="relative flex h-8 w-8 items-center justify-center">
        <span className="hold-ring absolute inset-0 rounded-full text-white" style={{ '--hold': progress } as CSSProperties} aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-sm bg-white/80" />
      </span>
      {progress > 0 ? 'Keep holding' : 'Hold to exit'}
    </button>
  )
}

/** The person's view: their moment, big and tappable, plus big word buttons and their other moments. */
export function UserMode({ scenes, initialSceneId, personName, onExit }: UserModeProps) {
  const approved = scenes.filter((s) => s.status === 'approved')
  const [currentId, setCurrentId] = useState<string | null>(initialSceneId ?? approved[0]?.id ?? null)
  const current = approved.find((s) => s.id === currentId) ?? approved[0]
  const color = useMomentColor(current?.media_url)
  const live = useLiveModeling(current?.id ?? null)
  const listening = live.state === 'listening' || live.state === 'offline' || live.state === 'connecting'
  const [speakRequest, setSpeakRequest] = useState<HeardPulse | null>(null)
  const speakKey = useRef(0)

  if (!current) {
    return (
      <div className="app-surface flex flex-col items-center justify-center gap-5 bg-stage p-8 text-center text-white">
        <p className="max-w-md text-xl">No moments yet.</p>
        <button onClick={onExit} className="h-12 rounded-full bg-white px-6 font-bold text-ink">Back</button>
      </div>
    )
  }

  const words = [...current.hotspots].sort((a, b) => a.order - b.order)

  return (
    <div
      className="app-surface flex flex-col transition-colors duration-700"
      style={{
        ...accentStyle(color),
        background: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${color.accent} 24%, #101214), #101214 72%)`,
      }}
    >
      <header className="pt-safe px-safe flex items-center justify-between gap-3">
        <HoldToExit
          onExit={() => {
            live.stop()
            onExit()
          }}
        />
        <span className="min-w-0 truncate font-toy text-lg font-extrabold text-white/90">{current.title}</span>
        <span className="w-11" aria-hidden="true" />
      </header>

      <main key={current.id} className="swap-in flex min-h-0 flex-1 flex-col gap-4 py-3 landscape:flex-row landscape:items-stretch landscape:gap-4 sm:px-6">
        <div className="relative min-h-0 px-3 portrait:max-h-[58%] portrait:flex-none portrait:basis-auto landscape:flex-1 sm:px-0" style={{ aspectRatio: `${current.width} / ${current.height}` }}>
          <FitBox aspect={current.width / current.height} align="start">
            <SceneCanvas
              key={current.id}
              scene={current}
              mode="speak"
              heard={live.heard}
              speakRequest={speakRequest}
              transitionName={`photo-${current.id}`}
              onSpeak={(h) => void api.recordTap(current.id, h.id).catch(() => undefined)}
              rounded="rounded-[22px]"
              className="h-full w-full shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
            />
          </FitBox>
          {listening && live.caption && (
            <p className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[85%] rounded-2xl bg-black/65 px-4 py-2 text-center text-lg text-white backdrop-blur" aria-live="polite">
              {live.caption}
            </p>
          )}
        </div>

        {/* Big word buttons: the same things as the outlines, easy to hit on a small screen. */}
        {words.length > 0 && (
          <div className="grid min-h-0 shrink-0 grid-cols-2 content-start gap-2.5 overflow-y-auto px-3 portrait:flex-1 landscape:w-64 landscape:grid-cols-1 landscape:content-center sm:grid-cols-3 sm:px-0">
            {words.map((h) => (
              <button
                key={h.id}
                onClick={() => setSpeakRequest({ hotspotId: h.id, key: ++speakKey.current })}
                className="press flex min-h-14 items-center justify-center rounded-2xl bg-white px-3 py-2 text-center font-toy text-xl font-extrabold text-ink"
                style={{ '--press-shadow': 'color-mix(in srgb, var(--accent) 70%, #000)' } as CSSProperties}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}
      </main>

      <nav aria-label="Moments" className="px-safe pb-safe flex shrink-0 items-end gap-3">
        <button
          onClick={() => (listening ? live.stop() : void live.start())}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : `Talk to ${personName}: words you say light up`}
          className="press relative flex h-[72px] shrink-0 items-center gap-2 rounded-[22px] px-5 font-toy text-xl font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)', '--press-shadow': 'color-mix(in srgb, var(--accent) 55%, #000)' } as CSSProperties}
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            {listening && <span className="listening-ring absolute inset-0 rounded-full border-2 border-current" aria-hidden="true" />}
            <span className="h-3 w-3 rounded-full bg-current" />
          </span>
          {listening ? 'Listening' : 'Talk'}
        </button>
        <div className="snap-row -mr-4 flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1.5 pr-4">
          {approved.map((s) => (
            <button
              key={s.id}
              onClick={() => setCurrentId(s.id)}
              aria-current={s.id === current.id}
              aria-label={s.title}
              className={`press block h-[72px] w-24 shrink-0 overflow-hidden rounded-[20px] border-4 transition ${
                s.id === current.id ? 'border-white' : 'border-white/25 opacity-75'
              }`}
              style={{ '--press-shadow': 'rgba(0,0,0,0.55)' } as CSSProperties}
            >
              <img src={s.media_url} alt="" className="h-full w-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      </nav>
      {live.message && live.state !== 'listening' && (
        <p className="px-6 pb-3 text-center text-sm text-white/70">{live.message}</p>
      )}
    </div>
  )
}
