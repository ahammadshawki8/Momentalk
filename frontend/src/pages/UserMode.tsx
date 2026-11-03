import { useState, type CSSProperties } from 'react'
import { api, type Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { FitBox } from '../components/FitBox'
import { SceneCanvas } from '../components/SceneCanvas'
import { useLiveModeling } from '../useLiveModeling'

interface UserModeProps {
  scenes: Scene[]
  initialSceneId?: string | null
  personName: string
  onExit: () => void
}

/** The person's view: their moment, big and tappable, and their other moments as chunky buttons. */
export function UserMode({ scenes, initialSceneId, personName, onExit }: UserModeProps) {
  const approved = scenes.filter((s) => s.status === 'approved')
  const [currentId, setCurrentId] = useState<string | null>(initialSceneId ?? approved[0]?.id ?? null)
  const current = approved.find((s) => s.id === currentId) ?? approved[0]
  const color = useMomentColor(current?.media_url)
  const live = useLiveModeling(current?.id ?? null)
  const listening = live.state === 'listening' || live.state === 'offline' || live.state === 'connecting'

  if (!current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-stage p-8 text-center text-white">
        <p className="max-w-md text-xl">No moments yet.</p>
        <button onClick={onExit} className="rounded-full bg-white px-6 py-3 font-bold text-ink">Back</button>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col transition-colors duration-700"
      style={{
        ...accentStyle(color),
        background: `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${color.accent} 22%, #101214), #101214 70%)`,
      }}
    >
      <div className="flex items-center justify-between px-4 pt-4 sm:px-8 sm:pt-6">
        <button
          onClick={() => {
            live.stop()
            onExit()
          }}
          className="rounded-full bg-white/10 px-4 py-2 font-bold text-white/80 backdrop-blur hover:bg-white/20"
        >
          Done
        </button>
        <span className="font-toy text-lg font-extrabold text-white/90">{current.title}</span>
        <span className="w-[72px]" aria-hidden="true" />
      </div>

      <div key={current.id} className="swap-in relative min-h-0 flex-1 px-3 py-4 sm:px-8">
        <FitBox aspect={current.width / current.height}>
          <SceneCanvas
            key={current.id}
            scene={current}
            mode="speak"
            heard={live.heard}
            transitionName={`photo-${current.id}`}
            onSpeak={(h) => void api.recordTap(current.id, h.id).catch(() => undefined)}
            className="h-full w-full shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
          />
        </FitBox>
        {listening && live.caption && (
          <p className="pointer-events-none absolute inset-x-0 bottom-6 mx-auto w-fit max-w-[80%] rounded-2xl bg-black/60 px-4 py-2 text-center text-lg text-white backdrop-blur" aria-live="polite">
            {live.caption}
          </p>
        )}
      </div>

      <nav aria-label="Moments" className="flex items-end gap-3 overflow-x-auto px-4 pb-5 sm:px-8 sm:pb-7 [scrollbar-width:none]">
        <button
          onClick={() => (listening ? live.stop() : void live.start())}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : `Talk to ${personName}: words you say light up`}
          className="press relative flex h-20 shrink-0 items-center gap-2 rounded-[22px] px-5 font-toy text-xl font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)', '--press-shadow': 'color-mix(in srgb, var(--accent) 55%, #000)' } as CSSProperties}
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            {listening && <span className="listening-ring absolute inset-0 rounded-full border-2 border-current" aria-hidden="true" />}
            <span className="h-3 w-3 rounded-full bg-current" />
          </span>
          {listening ? 'Listening' : 'Talk'}
        </button>
        {approved.map((s) => (
          <button
            key={s.id}
            onClick={() => setCurrentId(s.id)}
            aria-current={s.id === current.id}
            aria-label={s.title}
            className={`press block h-20 w-28 shrink-0 overflow-hidden rounded-[22px] border-4 transition ${
              s.id === current.id ? 'border-white' : 'border-white/30 opacity-75 hover:opacity-100'
            }`}
            style={{ '--press-shadow': 'rgba(0,0,0,0.55)' } as CSSProperties}
          >
            <img src={s.media_url} alt="" className="h-full w-full object-cover" draggable={false} />
          </button>
        ))}
      </nav>
      {live.message && live.state !== 'listening' && (
        <p className="px-6 pb-4 text-center text-sm text-white/70">{live.message}</p>
      )}
    </div>
  )
}
