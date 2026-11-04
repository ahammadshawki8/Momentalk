import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { api, type Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { FitBox } from '../components/FitBox'
import { CloseIcon, MicIcon } from '../components/Icons'
import { momentTitle } from '../components/MomentParts'
import { SceneCanvas, type HeardPulse } from '../components/SceneCanvas'
import { useLiveModeling } from '../useLiveModeling'

interface UserModeProps {
  scenes: Scene[]
  initialSceneId?: string | null
  personName: string
  onExit: () => void
}

const HOLD_MS = 900

/** Close, guarded: a tap only shows the hint, a short hold leaves (so a child cannot exit by accident). */
function HoldToClose({ onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState(0)
  const [hint, setHint] = useState(false)
  const raf = useRef(0)
  const start = useRef(0)
  const hintTimer = useRef(0)

  function begin() {
    start.current = performance.now()
    setHint(true)
    window.clearTimeout(hintTimer.current)
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
    hintTimer.current = window.setTimeout(() => setHint(false), 1400)
  }

  useEffect(() => () => {
    cancelAnimationFrame(raf.current)
    window.clearTimeout(hintTimer.current)
  }, [])

  return (
    <div className="relative">
      <button
        onPointerDown={begin}
        onPointerUp={cancel}
        onPointerLeave={() => progress > 0 && cancel()}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => e.key === 'Enter' && onExit()}
        aria-label="Hold to close"
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/85 backdrop-blur"
      >
        <span className="hold-ring absolute inset-0 rounded-full text-white" style={{ '--hold': progress } as CSSProperties} aria-hidden="true" />
        <CloseIcon />
      </button>
      {hint && (
        <span className="rise pointer-events-none absolute left-0 top-14 z-20 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[length:var(--text-caption)] font-bold text-ink shadow-lg">
          Hold to close
        </span>
      )}
    </div>
  )
}

/** Caregiver's Talk control: words they say light up on the moment. */
function TalkButton({ listening, onToggle, personName }: { listening: boolean; onToggle: () => void; personName: string }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : `Talk to ${personName}`}
      className="flex h-12 shrink-0 items-center gap-2 rounded-full px-4 font-bold transition active:scale-95"
      style={listening
        ? { background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 0 0 6px color-mix(in srgb, var(--accent) 30%, transparent)' }
        : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }}
    >
      {listening ? (
        <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <span key={i} className="eq-bar w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 120}ms` }} />)}
        </span>
      ) : (
        <MicIcon />
      )}
      {listening ? 'Listening' : 'Talk'}
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
      {/* Caregiver controls live together at the top; everything below belongs to the person. */}
      <header className="pt-safe px-safe grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 pb-1">
        <HoldToClose
          onExit={() => {
            live.stop()
            onExit()
          }}
        />
        <h1 className="line-clamp-2 min-w-0 text-center font-toy text-lg font-extrabold leading-tight text-white/90">{momentTitle(current)}</h1>
        <TalkButton listening={listening} personName={personName} onToggle={() => (listening ? live.stop() : void live.start())} />
      </header>

      <main key={current.id} className="swap-in flex min-h-0 flex-1 flex-col gap-4 pb-1 pt-3 landscape:flex-row landscape:items-stretch landscape:gap-4 sm:px-6">
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
            <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit max-w-[85%] rounded-2xl bg-black/65 px-4 py-2 text-center text-base text-white backdrop-blur sm:text-lg" aria-live="polite">
              {live.caption}
            </p>
          )}
        </div>

        {/* Big word buttons: the same things as the outlines, easy to hit on a small screen. */}
        {words.length > 0 && (
          <div className="grid min-h-0 shrink-0 grid-cols-2 content-start gap-2.5 overflow-y-auto px-3 portrait:flex-1 landscape:w-64 landscape:grid-cols-1 landscape:content-center sm:grid-cols-3 sm:px-0">
            {words.map((h) => {
              const pulse = live.heard.find((p) => p.hotspotId === h.id)
              return (
              <button
                key={pulse ? `${h.id}-${pulse.key}` : h.id}
                onClick={() => setSpeakRequest({ hotspotId: h.id, key: ++speakKey.current })}
                className={`press flex min-h-14 items-center justify-center rounded-2xl bg-white px-3 py-2 text-center font-toy text-xl font-extrabold text-ink ${pulse ? 'word-heard' : ''}`}
                style={{ '--press-shadow': 'color-mix(in srgb, var(--accent) 70%, #000)' } as CSSProperties}
              >
                {h.label}
              </button>
              )
            })}
          </div>
        )}
      </main>

      <nav aria-label="Moments" className="pb-safe shrink-0 pt-2">
        <div className="snap-row flex scroll-px-4 gap-2.5 overflow-x-auto px-4 py-2">
          {approved.map((s) => {
            const on = s.id === current.id
            return (
              <button
                key={s.id}
                onClick={() => setCurrentId(s.id)}
                aria-current={on}
                aria-label={momentTitle(s)}
                className={`block h-16 w-16 shrink-0 overflow-hidden rounded-[18px] transition duration-300 active:scale-90 ${
                  on ? 'ring-[3px] ring-white ring-offset-2 ring-offset-[#101214]' : 'opacity-55'
                }`}
              >
                <img src={s.media_url} alt="" className="h-full w-full object-cover" draggable={false} />
              </button>
            )
          })}
        </div>
      </nav>
      {live.message && live.state !== 'listening' && (
        <p className="px-6 pb-3 text-center text-sm text-white/70">{live.message}</p>
      )}
    </div>
  )
}
