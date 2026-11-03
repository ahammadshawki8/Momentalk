import { useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Hotspot, Point, Scene } from '../api'
import { pop } from '../feedback'

export interface HeardPulse {
  hotspotId: string
  key: number
}

interface SceneCanvasProps {
  scene: Scene
  mode: 'speak' | 'edit'
  selectedId?: string | null
  heard?: HeardPulse[]
  reveal?: boolean
  showLabels?: boolean
  rounded?: string
  transitionName?: string
  onSpeak?: (hotspot: Hotspot) => void
  onSelect?: (hotspot: Hotspot) => void
  onEmptyTap?: (x: number, y: number) => void
  onHover?: (hotspotId: string | null) => void
  className?: string
}

interface Sticker {
  key: number
  label: string
  x: number
  y: number
}

// Stored normalized (0..1), drawn in image pixels so stroke and glow scale with the photo.
const toPoints = (poly: Point[], w: number, h: number) => poly.map(([x, y]) => `${x * w},${y * h}`).join(' ')

function topCenter(poly: Point[]): [number, number] {
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(0.08, Math.min(...ys))]
}

/** A photo whose people and things are outlined hotspots that speak when touched. */
export function SceneCanvas({
  scene, mode, selectedId, heard = [], reveal = false, showLabels = false, rounded = 'rounded-[24px]',
  transitionName, onSpeak, onSelect, onEmptyTap, onHover, className = '',
}: SceneCanvasProps) {
  const [pressed, setPressed] = useState<string | null>(null)
  const [tapped, setTapped] = useState<string | null>(null)
  const [stickers, setStickers] = useState<Sticker[]>([])
  const counter = useRef(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  // Ref, not state: pointerup can arrive before React re-renders after pointerdown on fast taps.
  const pressedRef = useRef<string | null>(null)

  const ordered = useMemo(() => [...scene.hotspots].sort((a, b) => a.order - b.order), [scene.hotspots])
  const heardKey = useMemo(() => new Map(heard.map((h) => [h.hotspotId, h.key])), [heard])
  const strokeWidth = Math.max(2.5, scene.width / 360)

  function speak(h: Hotspot) {
    pop()
    if (h.audio_url) {
      audio.current?.pause()
      audio.current = new Audio(h.audio_url)
      window.setTimeout(() => void audio.current?.play().catch(() => undefined), 50)
    }
    const [x, y] = topCenter(h.polygons[0])
    const key = ++counter.current
    setTapped(h.id)
    setStickers((s) => [...s.slice(-1), { key, label: h.phrase, x, y }])
    window.setTimeout(() => setTapped((cur) => (cur === h.id ? null : cur)), 650)
    window.setTimeout(() => setStickers((s) => s.filter((item) => item.key !== key)), 1950)
    onSpeak?.(h)
  }

  function activate(h: Hotspot) {
    if (mode === 'speak') speak(h)
    else onSelect?.(h)
  }

  function handleBackground(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== 'edit' || !onEmptyTap || event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    onEmptyTap((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height)
  }

  return (
    <div
      className={`relative select-none overflow-hidden bg-stage ${rounded} ${className}`}
      style={{ aspectRatio: `${scene.width} / ${scene.height}`, viewTransitionName: transitionName } as CSSProperties}
    >
      <img src={scene.media_url} alt={scene.title} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <svg
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full touch-manipulation"
        onPointerDown={handleBackground}
        role="group"
        aria-label={`${scene.title}: ${scene.hotspots.length} things to tap`}
      >
        {ordered.map((h, index) => {
          const pulse = heardKey.get(h.id)
          const classes = [
            'hotspot',
            reveal ? 'is-revealing' : '',
            pressed === h.id ? 'is-pressed' : '',
            tapped === h.id ? 'is-tapped' : '',
            pulse !== undefined ? 'is-heard' : '',
            selectedId === h.id ? 'is-selected' : '',
          ].join(' ')
          return (
            <g
              key={pulse !== undefined ? `${h.id}-${pulse}` : h.id}
              className={classes}
              style={{ '--delay': `${200 + index * 200}ms` } as CSSProperties}
              role="button"
              tabIndex={0}
              aria-label={`${h.label}. Says: ${h.phrase}`}
              onPointerDown={(e) => {
                e.stopPropagation()
                pressedRef.current = h.id
                setPressed(h.id)
              }}
              onPointerUp={() => {
                if (pressedRef.current === h.id) activate(h)
                pressedRef.current = null
                setPressed(null)
              }}
              onPointerEnter={() => onHover?.(h.id)}
              onPointerLeave={() => {
                if (pressedRef.current === h.id) pressedRef.current = null
                setPressed((p) => (p === h.id ? null : p))
                onHover?.(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  activate(h)
                }
              }}
            >
              {h.polygons.map((poly, i) => (
                <polygon key={i} points={toPoints(poly, scene.width, scene.height)} pathLength={1}
                         className="hotspot-shape" strokeWidth={strokeWidth} />
              ))}
            </g>
          )
        })}
      </svg>

      {(showLabels || reveal) &&
        ordered.map((h, index) => {
          const [x, y] = topCenter(h.polygons[0])
          return (
            <span
              key={`label-${h.id}`}
              className={`pointer-events-none absolute whitespace-nowrap rounded-xl px-2.5 py-1 text-sm font-bold shadow-sm sm:text-base ${reveal ? 'reveal-label' : ''}`}
              style={{
                left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -100%)',
                background: 'var(--accent)', color: 'var(--accent-ink)', '--delay': `${200 + index * 200}ms`,
              } as CSSProperties}
            >
              {h.label}
            </span>
          )
        })}

      {stickers.map((s) => (
        <div
          key={s.key}
          className="sticker pointer-events-none absolute whitespace-nowrap rounded-2xl px-4 py-2 text-xl font-extrabold sm:text-3xl"
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
        >
          {s.label}
        </div>
      ))}
    </div>
  )
}
