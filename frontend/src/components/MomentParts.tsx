import type { CSSProperties } from 'react'
import type { Hotspot, Point, Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { pop } from '../feedback'
import { PlayIcon } from './Icons'
import { SceneCanvas } from './SceneCanvas'

export const wordCount = (scenes: Scene[]) => scenes.reduce((n, s) => n + s.hotspots.length, 0)
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const toPoints = (poly: Point[], w: number, h: number) => poly.map(([x, y]) => `${x * w},${y * h}`).join(' ')

/** The landing hero performs the product: outlines trace in, then the photo quietly talks. */
export function LiveHero({ scene, personName, onOpen }: { scene: Scene; personName: string; onOpen: (s: Scene) => void }) {
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
export function WordChip({ hotspot, scene }: { hotspot: Hotspot; scene: Scene }) {
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

export function MomentTile({ scene, onOpen }: { scene: Scene; onOpen: (s: Scene) => void }) {
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

