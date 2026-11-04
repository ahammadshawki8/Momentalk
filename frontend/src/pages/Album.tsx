import { useState, type CSSProperties } from 'react'
import type { Health, Hotspot, Point, Prefs, Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { CameraIcon, PlayIcon, SettingsIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { SceneCanvas } from '../components/SceneCanvas'
import { SettingsSheet } from '../components/SettingsSheet'
import { TodayCard } from '../components/TodayCard'
import { pop } from '../feedback'

interface AlbumProps {
  scenes: Scene[]
  health: Health | null
  personName: string
  onOpen: (scene: Scene) => void
  onSnap: () => void
  onPlay: () => void
  onScenesChanged: () => Promise<void>
  prefs: Prefs | null
  onPrefs: (p: Prefs) => void
}

const wordCount = (scenes: Scene[]) => scenes.reduce((n, s) => n + s.hotspots.length, 0)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const toPoints = (poly: Point[], w: number, h: number) => poly.map(([x, y]) => `${x * w},${y * h}`).join(' ')

/** The landing hero performs the product: outlines trace in, then the photo quietly talks. */
function LiveHero({ scene, personName, onOpen }: { scene: Scene; personName: string; onOpen: (s: Scene) => void }) {
  const color = useMomentColor(scene.media_url)
  return (
    <section style={accentStyle(color)} className="rise relative -mx-4 mt-5 sm:mx-0" aria-label={`Latest moment: ${scene.title}`}>
      <img src={scene.media_url} alt="" aria-hidden="true"
           className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-50 blur-3xl saturate-150 sm:rounded-[32px]" />
      <div className="relative">
        <SceneCanvas
          key={scene.id}
          scene={scene}
          mode="speak"
          reveal
          ambient
          rounded="rounded-none sm:rounded-[32px]"
          transitionName={`photo-${scene.id}`}
          className="shadow-[0_30px_80px_rgba(21,23,26,0.25)]"
        />
      </div>
      <div className="relative flex items-center justify-between gap-3 px-4 pt-3 sm:px-1">
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold sm:text-3xl">{scene.title}</p>
          <p className="text-sm text-muted">Tap anything in the photo to hear it</p>
        </div>
        <button
          onClick={() => onOpen(scene)}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-5 font-bold text-white active:scale-95"
        >
          Open
        </button>
      </div>
      <p className="sr-only">Every person and thing in this photo speaks for {personName} when tapped.</p>
    </section>
  )
}

/** A word from one moment, in that moment's color. Tap to hear it. */
function WordChip({ hotspot, scene }: { hotspot: Hotspot; scene: Scene }) {
  const color = useMomentColor(scene.media_url)
  return (
    <button
      onClick={() => {
        pop()
        if (hotspot.audio_url) void new Audio(hotspot.audio_url).play().catch(() => undefined)
        else if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(hotspot.phrase))
      }}
      style={{ ...accentStyle(color), '--press-shadow': 'color-mix(in srgb, var(--accent) 60%, #000)' } as CSSProperties}
      className="press flex h-12 shrink-0 items-center gap-2 rounded-2xl px-4 font-toy text-lg font-extrabold"
      aria-label={`${hotspot.label}. Says ${hotspot.phrase}`}
    >
      <span className="rounded-full" style={{ background: 'var(--accent)', width: 10, height: 10 }} aria-hidden="true" />
      <span style={{ color: 'var(--color-ink)' }}>{hotspot.label}</span>
    </button>
  )
}

function MomentTile({ scene, onOpen }: { scene: Scene; onOpen: (s: Scene) => void }) {
  const color = useMomentColor(scene.media_url)
  const isVideo = scene.kind === 'video' && scene.video_url
  return (
    <button
      onClick={() => onOpen(scene)}
      style={accentStyle(color)}
      className="group relative block aspect-[4/3] w-full overflow-hidden rounded-[24px] bg-stage text-left transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(21,23,26,0.18)] active:scale-[0.98]"
    >
      {isVideo ? (
        <video src={scene.video_url} poster={scene.media_url} muted autoPlay loop playsInline
               className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <img src={scene.media_url} alt="" draggable={false}
             className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
             style={{ viewTransitionName: `photo-${scene.id}` } as CSSProperties} />
      )}
      {!isVideo && (
        <svg viewBox={`0 0 ${scene.width} ${scene.height}`} preserveAspectRatio="xMidYMid slice"
             className="pointer-events-none absolute inset-0 h-full w-full opacity-70 transition group-hover:opacity-100" aria-hidden="true">
          {scene.hotspots.flatMap((h) => h.polygons.map((poly, i) => (
            <polygon key={`${h.id}-${i}`} points={toPoints(poly, scene.width, scene.height)}
                     fill="none" stroke="#fff" strokeWidth={Math.max(4, scene.width / 110)} strokeLinejoin="round"
                     style={{ filter: 'drop-shadow(0 0 4px var(--accent))' }} />
          )))}
        </svg>
      )}
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" aria-hidden="true" />
      <span className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
        <span className="min-w-0 truncate text-lg font-bold text-white drop-shadow">{scene.title}</span>
        <span className="shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          {scene.hotspots.length === 0 ? 'Ready to outline' : plural(scene.hotspots.length, 'word', 'words')}
        </span>
      </span>
      {isVideo && (
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-black/55 px-2 py-0.5 text-sm font-bold text-white backdrop-blur">
          <PlayIcon className="h-3 w-3" /> Video
        </span>
      )}
      {scene.status === 'draft' && (
        <span className="absolute right-3 top-3 rounded-lg bg-white px-2 py-0.5 text-sm font-bold text-ink">Needs review</span>
      )}
    </button>
  )
}

/** The caregiver's home: the person's world, alive and talking. */
export function Album({ scenes, health, personName, onOpen, onSnap, onPlay, onScenesChanged, prefs, onPrefs }: AlbumProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const approved = scenes.filter((s) => s.status === 'approved')
  const drafts = scenes.filter((s) => s.status === 'draft')
  // The richest photo moment makes the strongest first impression.
  const hero = [...approved].filter((s) => s.kind !== 'video').sort((a, b) => b.hotspots.length - a.hotspots.length)[0] ?? approved[0]
  const rest = scenes.filter((s) => s.id !== hero?.id)
  const seen = new Set<string>()
  const words = approved.flatMap((s) => s.hotspots.map((h) => ({ h, s }))).filter(({ h }) => {
    const key = h.label.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div className="px-safe pt-safe mx-auto min-h-full max-w-5xl overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8">
      <header className="flex h-12 items-center justify-between gap-2">
        <Logo />
        <span className="flex-1" />
        {health?.language_model.open_weights === 'true' && (
          <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold">Private</span>
        )}
        <button onClick={() => setSettingsOpen(true)} aria-label="Settings"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(21,23,26,0.08)] active:scale-95">
          <SettingsIcon />
        </button>
      </header>

      <section className="rise mt-5 sm:mt-8">
        <h1 className="text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] sm:text-6xl">{personName}'s world</h1>
        <p className="mt-2 text-lg text-muted">
          {scenes.length === 0
            ? `Snap a photo and every person and thing in it becomes a word ${personName} can tap.`
            : `${plural(scenes.length, 'moment', 'moments')}, ${plural(wordCount(approved), 'word', 'words')} ${personName} can say`}
        </p>
      </section>

      {hero ? (
        <LiveHero scene={hero} personName={personName} onOpen={onOpen} />
      ) : (
        <button onClick={onSnap}
                className="mt-8 flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-dashed border-line bg-white text-muted sm:aspect-[16/9]">
          <CameraIcon className="h-10 w-10" />
          <span className="text-lg font-bold text-ink">Snap your first moment</span>
          <span className="px-6 text-center">A meal, a visit, the park. Anything {personName} might want to talk about.</span>
        </button>
      )}

      {words.length > 0 && (
        <section className="mt-8" aria-labelledby="words-title">
          <div className="flex items-baseline justify-between">
            <h2 id="words-title" className="text-xl font-bold">{personName}'s words</h2>
            <span className="text-sm text-muted">Tap to hear</span>
          </div>
          <div className="snap-row -mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-3 sm:mx-0 sm:flex-wrap sm:px-0">
            {words.map(({ h, s }) => <WordChip key={h.id} hotspot={h} scene={s} />)}
          </div>
        </section>
      )}

      <TodayCard personName={personName} apiReady={!!health?.api_key} onDraftsReady={onScenesChanged} />

      {drafts.length > 0 && (
        <button onClick={() => onOpen(drafts[0])}
                className="rise mt-4 flex w-full items-center gap-4 rounded-[20px] bg-white p-3 pr-5 text-left shadow-[0_2px_14px_rgba(21,23,26,0.06)]">
          <span className="flex -space-x-3">
            {drafts.slice(0, 3).map((d) => <img key={d.id} src={d.media_url} alt="" className="h-12 w-12 rounded-xl border-2 border-white object-cover" />)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{plural(drafts.length, 'new moment', 'new moments')} from today</span>
            <span className="block text-sm text-muted">Made for you. {personName} sees them after you approve.</span>
          </span>
          <span className="font-bold">Review</span>
        </button>
      )}

      {rest.length > 0 && (
        <section className="mt-8" aria-labelledby="moments-title">
          <h2 id="moments-title" className="mb-3 text-xl font-bold">All moments</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {rest.map((s, i) => (
              <div key={s.id} className="rise" style={{ animationDelay: `${80 + i * 50}ms` }}>
                <MomentTile scene={s} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </section>
      )}

      {health && !health.api_key && (
        <p className="mt-6 text-center text-sm text-muted">Demo mode: connect the Meta API key to make new moments.</p>
      )}

      {settingsOpen && prefs && (
        <SettingsSheet prefs={prefs} health={health} onClose={() => setSettingsOpen(false)} onSaved={onPrefs} />
      )}

      {/* Thumb zone dock: the two things a caregiver does most, always within reach. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-canvas via-canvas/90 to-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8">
        <div className="pointer-events-auto mx-auto flex max-w-md gap-3 px-4">
          <button onClick={onPlay} disabled={approved.length === 0}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white font-bold shadow-[0_8px_24px_rgba(21,23,26,0.14)] transition active:scale-95 disabled:opacity-50">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffc95c] text-ink">{personName[0]}</span>
            Open for {personName}
          </button>
          <button onClick={onSnap}
                  className="group flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink font-bold text-white shadow-[0_10px_28px_rgba(21,23,26,0.35)] transition active:scale-95">
            <CameraIcon className="h-6 w-6 transition-transform duration-500 group-hover:-rotate-12" />
            Snap
          </button>
        </div>
      </div>
    </div>
  )
}
