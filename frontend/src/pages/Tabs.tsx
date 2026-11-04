import { useState, type ReactNode } from 'react'
import type { Health, Scene } from '../api'
import { SettingsIcon } from '../components/Icons'
import { LiveHero, MomentTile, plural, WordChip, wordCount } from '../components/MomentParts'
import { TodayCard } from '../components/TodayCard'

interface PageProps {
  scenes: Scene[]
  personName: string
  onOpen: (scene: Scene) => void
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 text-faint" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 5 7 7-7 7" />
  </svg>
)

/** Shared page frame: safe areas, generous margins, one large title, room for the tab bar. */
function Page({ eyebrow, title, subtitle, action, children }: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="pt-safe mx-auto min-h-full max-w-2xl overflow-x-clip px-5 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:px-8">
      <header className="flex min-h-12 items-end justify-between gap-4 pt-4">
        <div className="rise min-w-0">
          {eyebrow && <p className="text-[length:var(--text-caption)] font-bold text-muted">{eyebrow}</p>}
          <h1 className="mt-1 text-[length:var(--text-display)] font-bold leading-[1.08] tracking-[-0.02em]">{title}</h1>
        </div>
        {action}
      </header>
      {subtitle && <p className="rise mt-2 text-[length:var(--text-body)] leading-relaxed text-muted">{subtitle}</p>}
      {children}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rise mt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[length:var(--text-title)] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

/* ---------- Home: minimal, one primary action ---------- */

export function HomePage({ scenes, personName, onOpen, onPlay, onSettings, onToday, onSeeAll, health }: PageProps & {
  onPlay: () => void
  onSettings: () => void
  onToday: () => void
  onSeeAll: () => void
  health: Health | null
}) {
  const approved = scenes.filter((s) => s.status === 'approved')
  const drafts = scenes.filter((s) => s.status === 'draft')
  const hero = [...approved].filter((s) => s.kind === 'photo').sort((a, b) => b.hotspots.length - a.hotspots.length)[0] ?? approved[0]
  const recent = approved.filter((s) => s.id !== hero?.id).slice(0, 6)

  return (
    <Page
      eyebrow={today()}
      title={`${personName}'s world`}
      action={
        <button onClick={onSettings} aria-label="Settings"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white active:scale-95">
          <SettingsIcon />
        </button>
      }
    >
      {hero ? (
        <LiveHero scene={hero} onOpen={onOpen} />
      ) : (
        <p className="mt-8 rounded-[28px] border border-dashed border-line bg-white p-10 text-center text-muted">
          Tap the camera below to snap the first moment.
        </p>
      )}

      <button
        onClick={onPlay}
        disabled={approved.length === 0}
        className="rise mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-ink text-[length:var(--text-body)] font-bold text-white active:scale-[0.98] disabled:opacity-40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-ink">{personName[0]}</span>
        Open for {personName}
      </button>

      {drafts.length > 0 && (
        <button onClick={onToday}
                className="rise mt-4 flex w-full items-center gap-4 rounded-[20px] border border-line bg-white p-4 text-left active:bg-canvas">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas font-bold">
            {drafts.length}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Waiting for you</span>
            <span className="block text-[length:var(--text-caption)] text-muted">{plural(drafts.length, 'draft', 'drafts')} from today's photos</span>
          </span>
          <Chevron />
        </button>
      )}

      {recent.length > 0 && (
        <Section title="Recent" action={<button onClick={onSeeAll} className="font-bold text-muted active:opacity-60">See all</button>}>
          <div className="snap-row -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8">
            {recent.map((s) => (
              <div key={s.id} className="w-36 shrink-0"><MomentTile scene={s} onOpen={onOpen} /></div>
            ))}
          </div>
        </Section>
      )}

      {health && !health.api_key && (
        <p className="mt-10 text-center text-[length:var(--text-caption)] text-muted">Demo mode: connect the Meta API key to make new moments.</p>
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
  const approved = scenes.filter((s) => s.status === 'approved')
  const visible = approved.filter((s) => filter === 'all' || s.kind === filter)

  return (
    <Page title="Moments" subtitle={`${plural(approved.length, 'moment', 'moments')} from ${personName}'s real life.`}>
      <div className="rise mt-6 flex rounded-full border border-line bg-white p-1" role="tablist" aria-label="Filter moments">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                  className={`h-10 flex-1 rounded-full text-[length:var(--text-caption)] font-bold transition ${filter === f.key ? 'bg-ink text-white' : 'text-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-16 text-center text-muted">No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} yet.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
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
    <Page title="Words" subtitle={`${plural(wordCount(approved), 'word', 'words')} ${personName} can say. Tap one to hear it.`}>
      {approved.map((s) => (
        <section key={s.id} className="rise mt-10">
          <button onClick={() => onOpen(s)} className="mb-4 flex w-full items-center gap-3 text-left active:opacity-70">
            <img src={s.media_url} alt="" className="h-11 w-11 shrink-0 rounded-[12px] object-cover" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[length:var(--text-title)] font-bold">{s.title}</span>
              <span className="block text-[length:var(--text-caption)] text-muted">{plural(s.hotspots.length, 'word', 'words')}</span>
            </span>
            <Chevron />
          </button>
          <div className="flex flex-wrap gap-2">
            {[...s.hotspots].sort((a, b) => a.order - b.order).map((h) => <WordChip key={h.id} hotspot={h} scene={s} />)}
          </div>
        </section>
      ))}
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
      <Section title="Waiting for your review">
        {drafts.length === 0 ? (
          <p className="text-muted">All caught up.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {drafts.map((s) => <MomentTile key={s.id} scene={s} onOpen={onOpen} />)}
          </div>
        )}
      </Section>
    </Page>
  )
}
