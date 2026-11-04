import type { CSSProperties } from 'react'
import type { Hotspot, Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { pop } from '../feedback'
import { PlayIcon } from './Icons'
import { SceneCanvas } from './SceneCanvas'

export const wordCount = (scenes: Scene[]) => scenes.reduce((n, s) => n + s.hotspots.length, 0)
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const KIND_LABEL: Record<string, string> = { photo: 'Photo', video: 'Video', wish: 'Wish' }

/** Home hero: one calm moment. Outlines trace in, then one phrase at a time, no label clutter. */
export function LiveHero({ scene, onOpen }: { scene: Scene; onOpen: (s: Scene) => void }) {
  const color = useMomentColor(scene.media_url)
  return (
    <section style={accentStyle(color)} className="rise mt-8" aria-label={`Featured moment: ${scene.title}`}>
      <div className="overflow-hidden rounded-[28px] bg-stage shadow-[0_24px_60px_rgba(20,20,20,0.14)]">
        <SceneCanvas key={scene.id} scene={scene} mode="speak" reveal ambient labels={false}
                     rounded="rounded-[28px]" transitionName={`photo-${scene.id}`} />
      </div>
      <button onClick={() => onOpen(scene)} className="mt-4 flex w-full items-center justify-between gap-3 text-left active:opacity-70">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--text-title)] font-bold">{scene.title}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[length:var(--text-caption)] text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
            {plural(scene.hotspots.length, 'word', 'words')}, tap the photo to hear them
          </span>
        </span>
        <span className="text-[length:var(--text-caption)] font-bold text-muted">Open</span>
      </button>
    </section>
  )
}

/** A word from one moment, as a calm pill with the moment's color as a small dot. Tap to hear it. */
export function WordChip({ hotspot, scene }: { hotspot: Hotspot; scene: Scene }) {
  const color = useMomentColor(scene.media_url)
  return (
    <button
      onClick={() => {
        pop()
        if (hotspot.audio_url) void new Audio(hotspot.audio_url).play().catch(() => undefined)
        else if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(hotspot.phrase))
      }}
      style={accentStyle(color)}
      className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-white px-4 font-bold transition active:scale-95 active:bg-canvas"
      aria-label={`${hotspot.label}. Says ${hotspot.phrase}`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
      {hotspot.label}
    </button>
  )
}

/** Editorial tile: the photo speaks for itself, the caption sits quietly below. */
export function MomentTile({ scene, onOpen }: { scene: Scene; onOpen: (s: Scene) => void }) {
  const color = useMomentColor(scene.media_url)
  const isVideo = scene.kind === 'video' && !!scene.video_url
  return (
    <button onClick={() => onOpen(scene)} style={accentStyle(color)} className="group block w-full text-left active:scale-[0.98]">
      <span className="relative block aspect-[4/5] overflow-hidden rounded-[20px] bg-stage">
        {isVideo ? (
          <video src={scene.video_url} poster={scene.media_url} muted autoPlay loop playsInline
                 className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <img src={scene.media_url} alt="" draggable={false}
               className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
               style={{ viewTransitionName: `photo-${scene.id}` } as CSSProperties} />
        )}
        {(isVideo || scene.kind === 'wish') && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[length:var(--text-caption)] font-bold text-white backdrop-blur">
            {isVideo && <PlayIcon className="h-3 w-3" />}
            {KIND_LABEL[scene.kind]}
          </span>
        )}
        {scene.status === 'draft' && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-white px-2.5 py-1 text-[length:var(--text-caption)] font-bold">Draft</span>
        )}
      </span>
      <span className="mt-2.5 block truncate font-bold">{scene.kind === 'wish' ? scene.title.replace(/^Wish:\s*/i, '') : scene.title}</span>
      <span className="mt-0.5 flex items-center gap-1.5 text-[length:var(--text-caption)] text-muted">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
        {scene.hotspots.length === 0 ? 'Ready to outline' : plural(scene.hotspots.length, 'word', 'words')}
      </span>
    </button>
  )
}
