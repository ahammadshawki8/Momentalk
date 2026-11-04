import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Hotspot, Point, Scene } from '../api'
import { pop } from '../feedback'
import { polygonsAt } from '../track'

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
  /** Speak a hotspot from outside the photo (word buttons), as if it was tapped. */
  speakRequest?: HeardPulse | null
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

/** Fallback voice when a phrase has no cached audio: the device's own speech synthesis. */
function speakWithBrowser(text: string, language = 'en') {
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language
  utterance.rate = 0.95
  window.speechSynthesis.speak(utterance)
}

/** Greedy label layout: nudge a label down until it no longer covers one already placed. */
function layoutLabels(items: { id: string; label: string; x: number; y: number }[], aspect: number) {
  const h = 0.075 * Math.min(1.6, aspect)
  const width = (label: string) => Math.min(0.45, 0.05 + label.length * 0.019)
  const placed: { x: number; y: number; w: number }[] = []
  const out = new Map<string, { x: number; y: number }>()
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    let y = item.y
    const w = width(item.label)
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find((p) => Math.abs(p.x - item.x) < (p.w + w) / 2 && Math.abs(p.y - y) < h)
      if (!hit) break
      y = hit.y + h
    }
    placed.push({ x: item.x, y, w })
    out.set(item.id, { x: item.x, y: Math.min(0.97, y) })
  }
  return out
}

function topCenter(poly: Point[]): [number, number] {
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(0.08, Math.min(...ys))]
}

/** A photo whose people and things are outlined hotspots that speak when touched. */
export function SceneCanvas({
  scene, mode, selectedId, heard = [], reveal = false, showLabels = false, rounded = 'rounded-[24px]',
  transitionName, onSpeak, onSelect, onEmptyTap, onHover, speakRequest, className = '',
}: SceneCanvasProps) {
  const [pressed, setPressed] = useState<string | null>(null)
  const [tapped, setTapped] = useState<string | null>(null)
  const [stickers, setStickers] = useState<Sticker[]>([])
  const counter = useRef(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  // Ref, not state: pointerup can arrive before React re-renders after pointerdown on fast taps.
  const pressedRef = useRef<string | null>(null)

  const isVideo = scene.kind === 'video' && !!scene.video_url
  const video = useRef<HTMLVideoElement | null>(null)
  const [now, setNow] = useState<number | null>(isVideo ? 0 : null)

  // Follow the playing video so tracked outlines move with people and things.
  useEffect(() => {
    if (!isVideo) return
    let frame = 0
    const tick = () => {
      if (video.current) setNow(video.current.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isVideo])

  const ordered = useMemo(() => [...scene.hotspots].sort((a, b) => a.order - b.order), [scene.hotspots])
  const heardKey = useMemo(() => new Map(heard.map((h) => [h.hotspotId, h.key])), [heard])
  const strokeWidth = Math.max(2.5, scene.width / 360)
  const labelSpots = layoutLabels(
    ordered.flatMap((h) => {
      const current = polygonsAt(h, now)[0]
      if (!current) return []
      const [x, y] = topCenter(current)
      return [{ id: h.id, label: h.label, x, y }]
    }),
    scene.width / scene.height,
  )

  function speak(h: Hotspot) {
    pop()
    audio.current?.pause()
    window.speechSynthesis?.cancel()
    if (h.audio_url) {
      audio.current = new Audio(h.audio_url)
      window.setTimeout(() => void audio.current?.play().catch(() => speakWithBrowser(h.phrase, scene.language)), 50)
    } else {
      speakWithBrowser(h.phrase, scene.language)
    }
    const [x, y] = topCenter(polygonsAt(h, now)[0] ?? h.polygons[0])
    const key = ++counter.current
    setTapped(h.id)
    setStickers((s) => [...s.slice(-1), { key, label: h.phrase, x, y }])
    window.setTimeout(() => setTapped((cur) => (cur === h.id ? null : cur)), 650)
    window.setTimeout(() => setStickers((s) => s.filter((item) => item.key !== key)), 1950)
    onSpeak?.(h)
  }

  const speakRef = useRef(speak)
  speakRef.current = speak
  useEffect(() => {
    if (!speakRequest) return
    const h = scene.hotspots.find((x) => x.id === speakRequest.hotspotId)
    if (h) speakRef.current(h)
  }, [speakRequest, scene.hotspots])

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
      {isVideo ? (
        <video
          ref={video}
          src={scene.video_url}
          poster={scene.media_url}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          aria-label={scene.title}
        />
      ) : (
        <img src={scene.media_url} alt={scene.title} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      )}
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
              {polygonsAt(h, now).map((poly, i) => (
                <polygon key={i} points={toPoints(poly, scene.width, scene.height)} pathLength={1}
                         className="hotspot-shape" strokeWidth={strokeWidth} />
              ))}
            </g>
          )
        })}
      </svg>

      {(showLabels || reveal) &&
        ordered.map((h, index) => {
          const spot = labelSpots.get(h.id)
          if (!spot) return null
          const { x, y } = spot
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
