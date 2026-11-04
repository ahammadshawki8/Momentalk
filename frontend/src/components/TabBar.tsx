import type { ReactElement } from 'react'
import type { Tab } from '../router'
import { CameraIcon } from './Icons'

type IconProps = { className?: string; active?: boolean }
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const HomeIcon = ({ className = 'h-6 w-6', active }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} fill={active ? 'currentColor' : 'none'}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
)
const MomentsIcon = ({ className = 'h-6 w-6', active }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} fill={active ? 'currentColor' : 'none'}>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" /><rect x="13" y="13" width="7.5" height="7.5" rx="2" />
  </svg>
)
const WordsIcon = ({ className = 'h-6 w-6', active }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
    <path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3.5V16H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill={active ? 'currentColor' : 'none'} />
    <path d="M8 9.5h8M8 12.5h5" stroke={active ? '#fff' : 'currentColor'} />
  </svg>
)
const TodayIcon = ({ className = 'h-6 w-6', active }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} fill={active ? 'currentColor' : 'none'}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z" />
    <path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </svg>
)

const ITEMS: { tab: Tab; label: string; Icon: (p: IconProps) => ReactElement }[] = [
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

/** Quiet bottom bar in the thumb zone: four destinations and one action, the camera, in the middle. */
export function TabBar({ current, onTab, onSnap, todayBadge = 0 }: TabBarProps) {
  const button = (item: (typeof ITEMS)[number]) => {
    const active = item.tab === current
    return (
      <button
        key={item.tab}
        onClick={() => onTab(item.tab)}
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold tracking-wide transition active:opacity-60 ${
          active ? 'text-ink' : 'text-faint'
        }`}
      >
        <item.Icon active={active} />
        {item.label}
        {item.tab === 'today' && todayBadge > 0 && (
          <span className="absolute left-1/2 top-1.5 ml-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white ring-2 ring-white">
            {todayBadge}
          </span>
        )}
      </button>
    )
  }

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-xl items-center px-2">
        {ITEMS.slice(0, 2).map(button)}
        <div className="flex flex-1 justify-center">
          <button
            onClick={onSnap}
            aria-label="Snap a moment"
            className="group -mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-ink text-white shadow-[0_12px_28px_rgba(20,20,20,0.35)] ring-[5px] ring-canvas transition active:scale-90"
          >
            <CameraIcon className="h-7 w-7 transition-transform duration-500 group-hover:-rotate-12" />
          </button>
        </div>
        {ITEMS.slice(2).map(button)}
      </div>
    </nav>
  )
}
