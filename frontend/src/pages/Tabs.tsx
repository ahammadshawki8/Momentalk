import { useState, type ReactNode } from 'react'
import type { Health, Scene } from '../api'
import { SettingsIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { MomentTile, plural, WordCard } from '../components/MomentParts'
import { TodayCard } from '../components/TodayCard'
import { WorldHero } from '../components/WorldHero'

interface PageProps {
  scenes: Scene[]
  personName: string
  onOpen: (scene: Scene) => void
}

/** Shared page frame: safe areas, generous margins, one large title, room for the tab bar. */
function Page({ lead, eyebrow, title, subtitle, action, children }: {
  lead?: ReactNode
  eyebrow?: string
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="pt-safe mx-auto min-h-full max-w-2xl overflow-x-clip px-5 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:px-8">
      <header className="flex min-h-12 items-center justify-between gap-4 pt-4">
        <div className="rise min-w-0">
          {lead}
          {eyebrow && <p className="text-[length:var(--text-caption)] font-bold text-muted">{eyebrow}</p>}
          {title && <h1 className="mt-1 text-[length:var(--text-display)] font-bold leading-[1.08] tracking-[-0.02em]">{title}</h1>}
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

/* ---------- Home: the person's world, one primary action ---------- */

export function HomePage({ scenes, personName, onOpen, onPlay, onSettings, onSeeAll, health }: PageProps & {
  onPlay: () => void
  onSettings: () => void
  onSeeAll: () => void
  health: Health | null
}) {
  const approved = scenes.filter((s) => s.status === 'approved')
  const photos = approved.filter((s) => s.kind === 'photo')

  return (
    <Page
      action={
        <button onClick={onSettings} aria-label="Settings"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white active:scale-95">
          <SettingsIcon />
        </button>
      }
      lead={<Logo />}
    >
      <div className="rise mt-8">
        <WorldHero scenes={photos} onOpen={onOpen} />
      </div>

      <h1 className="rise mt-6 text-center text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">
        Welcome to {personName}'s world
      </h1>

      <button
        onClick={onPlay}
        disabled={approved.length === 0}
        className="rise mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-ink text-[length:var(--text-body)] font-bold text-white active:scale-[0.98] disabled:opacity-40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-ink">{personName[0]}</span>
        Open for {personName}
      </button>

      {approved.length > 0 && (
        <Section title="Recent" action={<button onClick={onSeeAll} className="font-bold text-muted active:opacity-60">See all</button>}>
          <div className="snap-row -mx-5 flex scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:scroll-px-8 sm:px-8">
            {approved.slice(0, 8).map((s) => (
              <div key={s.id} className="w-36 shrink-0"><MomentTile scene={s} onOpen={onOpen} /></div>
            ))}
          </div>
        </Section>
      )}

      {health && !health.api_key && (
        <p className="mt-10 text-center text-[length:var(--text-caption)] text-muted">Demo mode</p>
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

export function MomentsPage({ scenes, onOpen }: PageProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const approved = scenes.filter((s) => s.status === 'approved')
  const visible = approved.filter((s) => filter === 'all' || s.kind === filter)

  return (
    <Page eyebrow={plural(approved.length, 'moment', 'moments')} title="Moments">
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

/* ---------- Words: a visual vocabulary, each word shown as its own object ---------- */

const KINDS: [string, string][] = [
  ['person', 'People'],
  ['animal', 'Animals'],
  ['food', 'Food'],
  ['toy', 'Toys'],
  ['object', 'Things'],
]

export function WordsPage({ scenes }: PageProps) {
  const [kind, setKind] = useState('all')
  const seen = new Set<string>()
  const words = scenes
    .filter((s) => s.status === 'approved')
    .flatMap((s) => s.hotspots.map((h) => ({ h, s })))
    .sort((a, b) => (b.h.confidence ?? 0) - (a.h.confidence ?? 0))
    .filter(({ h }) => {
      const key = h.label.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  const kindOf = (k: string) => (KINDS.some(([id]) => id === k) ? k : 'object')
  const groups = KINDS.map(([id, name]) => ({
    id,
    name,
    items: words.filter(({ h }) => kindOf(h.kind) === id).sort((a, b) => a.h.label.localeCompare(b.h.label)),
  })).filter((g) => g.items.length > 0)
  const shown = kind === 'all' ? groups : groups.filter((g) => g.id === kind)

  return (
    <Page eyebrow={plural(words.length, 'word', 'words')} title="Words">
      <div className="snap-row -mx-5 mt-6 flex scroll-px-5 gap-2 overflow-x-auto px-5 sm:-mx-8 sm:scroll-px-8 sm:px-8" role="tablist" aria-label="Kinds of words">
        {[{ id: 'all', name: 'All' }, ...groups].map((g) => (
          <button key={g.id} role="tab" aria-selected={kind === g.id} onClick={() => setKind(g.id)}
                  className={`h-10 shrink-0 rounded-full border px-4 text-[length:var(--text-caption)] font-bold transition ${
                    kind === g.id ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted'
                  }`}>
            {g.name}
          </button>
        ))}
      </div>

      {shown.map((g) => (
        <Section key={g.id} title={g.name} action={<span className="text-[length:var(--text-caption)] font-bold text-faint">{g.items.length}</span>}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {g.items.map(({ h, s }) => <WordCard key={`${s.id}-${h.id}`} hotspot={h} scene={s} />)}
          </div>
        </Section>
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
    <Page title="Today">
      <TodayCard personName={personName} apiReady={!!health?.api_key} onDraftsReady={onScenesChanged} />
      <Section title="Drafts">
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
