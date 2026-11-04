import type { Tab } from '../router'
import { CameraIcon } from './Icons'

type IconProps = { className?: string }
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const HomeIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
)
const MomentsIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" /><rect x="13" y="13" width="7.5" height="7.5" rx="2" />
  </svg>
)
const WordsIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
    <path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3.5V16H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
)
const TodayIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z" />
    <path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </svg>
)

const ITEMS: { tab: Tab; label: string; Icon: (p: IconProps) => React.ReactElement }[] = [
  { tab: 'home', label: 'Home', Icon: HomeIcon },
  { tab: 'moments', label: 'Moments', Icon: MomentsIcon },
  { tab: 'words', label: 'Words', Icon: WordsIcon },
  { tab: 'today', label: 'Today', Icon: TodayIcon },
]

interface TabBarProps {
  current: Tab
  onTab: (tab: Tab) => void
  onSnap: () => void
  todayBadge?: number
}

/** Floating bottom tab bar in the thumb zone, with the camera raised in the middle. */
export function TabBar({ current, onTab, onSnap, todayBadge = 0 }: TabBarProps) {
  const button = (item: (typeof ITEMS)[number]) => {
    const active = item.tab === current
    return (
      <button
        key={item.tab}
        onClick={() => onTab(item.tab)}
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-14 min-w-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-bold transition active:scale-95 ${
          active ? 'text-ink' : 'text-muted'
        }`}
      >
        <span className={`flex h-8 w-12 items-center justify-center rounded-full transition ${active ? 'bg-canvas' : ''}`}>
          <item.Icon />
        </span>
        {item.label}
        {item.tab === 'today' && todayBadge > 0 && (
          <span className="absolute right-3 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] text-white">
            {todayBadge}
          </span>
        )}
      </button>
    )
  }

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-md items-center gap-1 rounded-[28px] bg-white/95 px-2 py-1.5 shadow-[0_10px_40px_rgba(21,23,26,0.18)] backdrop-blur-md">
        {ITEMS.slice(0, 2).map(button)}
        <button
          onClick={onSnap}
          aria-label="Snap a moment"
          className="group -mt-7 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-[0_12px_28px_rgba(21,23,26,0.4)] ring-4 ring-canvas transition active:scale-90"
        >
          <CameraIcon className="h-7 w-7 transition-transform duration-500 group-hover:-rotate-12" />
        </button>
        {ITEMS.slice(2).map(button)}
      </div>
    </nav>
  )
}
