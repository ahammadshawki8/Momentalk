import type { CSSProperties } from 'react'
import type { Scene } from '../api'

/** The brand mark come alive: the talking photo frame, with a face. */
export function Mascot({ className = 'h-32 w-32' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={`mascot ${className}`} aria-hidden="true">
      <ellipse cx="62" cy="114" rx="30" ry="4" fill="#141414" opacity="0.08" className="mascot-shadow" />
      <g className="mascot-body">
        <path transform="scale(3.75)" d="M8 4h16a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H13l-6 5v-5.3A4 4 0 0 1 4 20V8a4 4 0 0 1 4-4Z" fill="var(--color-brand)" />
        <path transform="scale(3.75)" d="M8 4h16a4 4 0 0 1 4 4v1.5H4V8a4 4 0 0 1 4-4Z" fill="#fff" opacity="0.28" />
        <g className="mascot-eyes">
          <ellipse cx="45" cy="45" rx="5.2" ry="7" fill="#141414" />
          <ellipse cx="75" cy="45" rx="5.2" ry="7" fill="#141414" />
          <circle cx="46.8" cy="42.4" r="1.7" fill="#fff" />
          <circle cx="76.8" cy="42.4" r="1.7" fill="#fff" />
        </g>
        <circle cx="35" cy="58" r="5" fill="#ff8a6b" opacity="0.45" />
        <circle cx="85" cy="58" r="5" fill="#ff8a6b" opacity="0.45" />
        <path d="M50 58q10 10 20 0" fill="none" stroke="#141414" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  )
}

const ORBIT: CSSProperties[] = [
  { left: '4%', top: '6%', width: 68, animationDelay: '0s' },
  { right: '2%', top: '0%', width: 80, animationDelay: '-1.2s' },
  { left: '0%', bottom: '4%', width: 58, animationDelay: '-2.4s' },
  { right: '9%', bottom: '0%', width: 66, animationDelay: '-3.1s' },
]

/** Home hero: the mascot at the center of the person's world, their moments floating around it. */
export function WorldHero({ scenes, onOpen }: { scenes: Scene[]; onOpen: (s: Scene) => void }) {
  const photos = scenes.slice(0, ORBIT.length)
  return (
    <div className="relative mx-auto h-64 w-full max-w-sm">
      {photos.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onOpen(s)}
          aria-label={`Open ${s.title}`}
          className="float-photo absolute aspect-square overflow-hidden rounded-full border-[3px] border-white shadow-[0_10px_26px_rgba(20,20,20,0.16)] active:scale-95"
          style={ORBIT[i]}
        >
          <img src={s.media_url} alt="" draggable={false} className="h-full w-full object-cover" />
        </button>
      ))}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Mascot className="h-36 w-36" />
      </div>
    </div>
  )
}
