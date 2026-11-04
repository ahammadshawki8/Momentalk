import { useState, type ReactNode } from 'react'
import type { Health, Scene } from '../api'
import { SettingsIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { LiveHero, MomentTile, plural, WordChip, wordCount } from '../components/MomentParts'
import { TodayCard } from '../components/TodayCard'

interface PageProps {
  scenes: Scene[]
  personName: string
  onOpen: (scene: Scene) => void
}

/** Shared page frame: safe areas, room for the tab bar, one clear title per page. */
function Page({ title, subtitle, action, children, logo = false }: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  logo?: boolean
}) {
  return (
    <div className="px-safe pt-safe mx-auto min-h-full max-w-5xl overflow-x-clip pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-8">
      <header className="flex h-12 items-center justify-between gap-2">
        {logo ? <Logo /> : <span />}
        {action}
      </header>
      <section className="rise mt-4 sm:mt-6">
        <h1 className="text-[2.4rem] font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 text-lg text-muted">{subtitle}</p>}
      </section>
      {children}
    </div>
  )
}

/* ---------- Home ---------- */

export function HomePage({ scenes, personName, onOpen, onPlay, onSettings, onToday, health }: PageProps & {
  onPlay: () => void
  onSettings: () => void
  onToday: () => void
  health: Health | null
}) {
  const approved = scenes.filter((s) => s.status === 'approved')
  const drafts = scenes.filter((s) => s.status === 'draft')
  const hero = [...approved].filter((s) => s.kind === 'photo').sort((a, b) => b.hotspots.length - a.hotspots.length)[0] ?? approved[0]

  return (
    <Page
      logo
      title={`${personName}'s world`}
      subtitle={scenes.length ? `${plural(scenes.length, 'moment', 'moments')}, ${plural(wordCount(approved), 'word', 'words')} ${personName} can say` : undefined}
      action={
        <button onClick={onSettings} aria-label="Settings"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(21,23,26,0.08)] active:scale-95">
          <SettingsIcon />
        </button>
      }
    >
      {hero ? (
        <LiveHero scene={hero} personName={personName} onOpen={onOpen} />
      ) : (
        <p className="mt-10 rounded-[28px] border-2 border-dashed border-line bg-white p-10 text-center text-muted">
          Tap the camera to snap your first moment: a meal, a visit, the park.
        </p>
      )}

      <button
        onClick={onPlay}
        disabled={approved.length === 0}
        className="rise mt-6 flex h-16 w-full items-center justify-center gap-3 rounded-full bg-ink text-lg font-bold text-white shadow-[0_12px_30px_rgba(21,23,26,0.3)] active:scale-[0.98] disabled:opacity-50"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffc95c] text-ink">{personName[0]}</span>
        Open for {personName}
      </button>

      {drafts.length > 0 && (
        <button onClick={onToday}
                className="rise mt-4 flex w-full items-center gap-4 rounded-[20px] bg-white p-3 pr-5 text-left shadow-[0_2px_14px_rgba(21,23,26,0.06)] active:scale-[0.99]">
          <span className="flex -space-x-3">
            {drafts.slice(0, 3).map((d) => <img key={d.id} src={d.media_url} alt="" className="h-12 w-12 rounded-xl border-2 border-white object-cover" />)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{plural(drafts.length, 'new moment', 'new moments')} from today</span>
            <span className="block text-sm text-muted">Made by Moment Builder. Waiting for you.</span>
          </span>
          <span className="font-bold">Review</span>
        </button>
      )}

      {health && !health.api_key && (
        <p className="mt-6 text-center text-sm text-muted">Demo mode: connect the Meta API key to make new moments.</p>
      )}
    </Page>
  )
}

/* ---------- Moments ---------- */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'photo', label: 'Photos' },
  { key: 'video', label: 'Videos' },
  { key: 'wish', label: 'Wishes' },
] as const

export function MomentsPage({ scenes, personName, onOpen }: PageProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const visible = scenes.filter((s) => s.status === 'approved' && (filter === 'all' || s.kind === filter))

  return (
    <Page title="Moments" subtitle={`Everything ${personName} can talk about, from real life.`}>
      <div className="snap-row -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter moments">
        {FILTERS.map((f) => {
          const count = scenes.filter((s) => s.status === 'approved' && (f.key === 'all' || s.kind === f.key)).length
          return (
            <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                    className={`h-11 shrink-0 rounded-full px-4 font-bold transition active:scale-95 ${filter === f.key ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
              {f.label} <span className="opacity-60">{count}</span>
            </button>
          )
        })}
      </div>
      {visible.length === 0 ? (
        <p className="mt-10 text-center text-muted">Nothing here yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {visible.map((s, i) => (
            <div key={s.id} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
              <MomentTile scene={s} onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

/* ---------- Words ---------- */

export function WordsPage({ scenes, personName, onOpen }: PageProps) {
  const approved = scenes.filter((s) => s.status === 'approved' && s.hotspots.length > 0)
  return (
    <Page title={`${personName}'s words`} subtitle={`${plural(wordCount(approved), 'word', 'words')} from ${plural(approved.length, 'moment', 'moments')}. Tap one to hear it.`}>
      <div className="mt-6 space-y-6">
        {approved.map((s) => (
          <section key={s.id} className="rise" aria-label={s.title}>
            <button onClick={() => onOpen(s)} className="flex w-full items-center gap-3 text-left active:opacity-70">
              <img src={s.media_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{s.title}</span>
                <span className="block text-sm text-muted">{plural(s.hotspots.length, 'word', 'words')}</span>
              </span>
              <span className="text-sm font-bold text-muted">Open</span>
            </button>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {[...s.hotspots].sort((a, b) => a.order - b.order).map((h) => <WordChip key={h.id} hotspot={h} scene={s} />)}
            </div>
          </section>
        ))}
      </div>
    </Page>
  )
}

/* ---------- Today ---------- */

export function TodayPage({ scenes, personName, onOpen, health, onScenesChanged }: PageProps & {
  health: Health | null
  onScenesChanged: () => Promise<void>
}) {
  const drafts = scenes.filter((s) => s.status === 'draft')
  return (
    <Page title="Today" subtitle={`Moment Builder turns today's photos into drafts. Nothing reaches ${personName} until you approve it.`}>
      <TodayCard personName={personName} apiReady={!!health?.api_key} onDraftsReady={onScenesChanged} />
      <section className="mt-8" aria-labelledby="review-title">
        <h2 id="review-title" className="text-xl font-bold">Waiting for your review</h2>
        {drafts.length === 0 ? (
          <p className="mt-3 text-muted">All caught up. New drafts appear here after Moment Builder runs.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {drafts.map((s) => <MomentTile key={s.id} scene={s} onOpen={onOpen} />)}
          </div>
        )}
      </section>
    </Page>
  )
}
