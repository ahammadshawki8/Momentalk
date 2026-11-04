import { useState, type CSSProperties } from 'react'
import type { Hotspot, Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { pop } from '../feedback'
import { ConfirmButton } from './ConfirmButton'
import { PlayIcon, TrashIcon } from './Icons'

/** Titles as people read them: wish scenes are already marked by their badge. */
export const momentTitle = (scene: Scene) => {
  const title = scene.kind === 'wish' ? scene.title.replace(/^Wish:\s*/i, '') : scene.title
  return title.charAt(0).toUpperCase() + title.slice(1)
}
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const KIND_LABEL: Record<string, string> = { photo: 'Photo', video: 'Video', wish: 'Wish' }

/** Say a word: its cached voice, or the device voice when there is no audio. */
export function sayHotspot(hotspot: Hotspot) {
  pop()
  if (hotspot.audio_url) void new Audio(hotspot.audio_url).play().catch(() => undefined)
  else if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(hotspot.phrase))
}

const outlineOf = (h: Hotspot) => (h.polygons.length ? h.polygons : h.track?.length ? [h.track[0].poly] : [])

/** Square crop around a hotspot, in image pixels, kept inside the photo when it fits. */
function cropBox(polys: Hotspot['polygons'], w: number, h: number) {
  const xs = polys.flat().map((p) => p[0] * w)
  const ys = polys.flat().map((p) => p[1] * h)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const side = Math.min(Math.min(w, h), Math.max((x1 - x0) * 1.3, (y1 - y0) * 1.3, Math.min(w, h) * 0.14))
  const clamp = (c: number, size: number) => (side >= size ? size / 2 : Math.min(size - side / 2, Math.max(side / 2, c)))
  const cx = clamp((x0 + x1) / 2, w)
  const cy = clamp((y0 + y1) / 2, h)
  return { x: cx - side / 2, y: cy - side / 2, side }
}

/** One word as a card: the object itself lifted out of its photo, its name below. */
export function WordCard({ hotspot, scene, onDelete }: { hotspot: Hotspot; scene: Scene; onDelete?: () => Promise<void> }) {
  const [said, setSaid] = useState(0)
  const polys = outlineOf(hotspot)
  const W = scene.width
  const H = scene.height
  const box = polys.length ? cropBox(polys, W, H) : { x: 0, y: 0, side: Math.min(W, H) }
  const clipId = `word-${scene.id}-${hotspot.id}`
  const points = (poly: Hotspot['polygons'][number]) => poly.map(([x, y]) => `${x * W},${y * H}`).join(' ')

  return (
    <div className="relative">
    <button
      key={said}
      onClick={() => {
        sayHotspot(hotspot)
        setSaid((n) => n + 1)
      }}
      className={`flex flex-col overflow-hidden rounded-[20px] border border-line bg-white text-left active:scale-95 ${said ? 'word-said' : ''}`}
      aria-label={`${hotspot.label}. Says ${hotspot.phrase}`}
    >
      <svg viewBox={`${box.x} ${box.y} ${box.side} ${box.side}`} className="block aspect-square w-full" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>{polys.map((p, i) => <polygon key={i} points={points(p)} />)}</clipPath>
        </defs>
        <image href={scene.media_url} width={W} height={H} preserveAspectRatio="none" />
        <rect x={box.x} y={box.y} width={box.side} height={box.side} fill="#ffffff" opacity={polys.length ? 0.72 : 0} />
        {polys.length > 0 && (
          <g style={{ filter: 'drop-shadow(0 3px 6px rgba(20,20,20,0.28))' }}>
            <image href={scene.media_url} width={W} height={H} preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
          </g>
        )}
      </svg>
      <span className="px-3 pb-3 pt-1 text-center font-bold leading-tight [overflow-wrap:anywhere]">{hotspot.label.charAt(0).toUpperCase() + hotspot.label.slice(1)}</span>
    </button>
    {onDelete && (
      <span className="rise absolute -right-1.5 -top-1.5">
        <ConfirmButton
          label={`Delete the word ${hotspot.label}`}
          confirmLabel="Delete"
          onConfirm={onDelete}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-danger text-white shadow-md"
          armedClassName="flex h-9 items-center justify-center rounded-full bg-danger px-3 text-sm font-bold text-white shadow-md"
        >
          <TrashIcon className="h-4 w-4" />
        </ConfirmButton>
      </span>
    )}
    </div>
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
      <span className="mt-2.5 line-clamp-2 font-bold leading-snug">{momentTitle(scene)}</span>
      <span className="mt-0.5 flex items-center gap-1.5 text-[length:var(--text-caption)] text-muted">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
        {scene.hotspots.length === 0 ? 'Ready to outline' : plural(scene.hotspots.length, 'word', 'words')}
      </span>
    </button>
  )
}

/** The one handoff action: give the phone to the person. Tactile, warm, the brand yellow. */
export function OpenForButton({ personName, onClick, disabled, className = '' }: {
  personName: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`press flex h-16 w-full items-center justify-center gap-3 rounded-full bg-brand text-[length:var(--text-title)] font-bold text-ink disabled:opacity-40 ${className}`}
      style={{ '--press-shadow': '#d39a2a' } as CSSProperties}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-brand">
        <PlayIcon className="ml-0.5 h-4 w-4" />
      </span>
      Open for {personName}
    </button>
  )
}
