import { useState, type CSSProperties } from 'react'
import type { Health, Prefs, Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { CameraIcon, SettingsIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { SettingsSheet } from '../components/SettingsSheet'
import { TodayCard } from '../components/TodayCard'

interface AlbumProps {
  scenes: Scene[]
  health: Health | null
  personName: string
  onOpen: (scene: Scene) => void
  onSnap: () => void
  onPlay: () => void
  onScenesChanged: () => Promise<void>
  prefs: Prefs | null
  onPrefs: (p: Prefs) => void
}

function wordCount(scenes: Scene[]) {
  return scenes.reduce((n, s) => n + s.hotspots.length, 0)
}

function MomentTile({ scene, large = false, onOpen }: { scene: Scene; large?: boolean; onOpen: (s: Scene) => void }) {
  const color = useMomentColor(scene.media_url)
  return (
    <button
      onClick={() => onOpen(scene)}
      style={accentStyle(color)}
      className={`group relative block w-full overflow-hidden rounded-[24px] bg-stage text-left transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(21,23,26,0.18)] ${large ? 'aspect-[4/3] sm:aspect-[16/9]' : 'aspect-[4/3]'}`}
    >
      <img
        src={scene.media_url}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        style={{ viewTransitionName: `photo-${scene.id}` } as CSSProperties}
        draggable={false}
      />
      <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 to-transparent" aria-hidden="true" />
      <span className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
        <span className={`font-bold text-white drop-shadow ${large ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{scene.title}</span>
        <span className="shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          {scene.hotspots.length === 0 ? 'Ready to outline' : `${scene.hotspots.length} ${scene.hotspots.length === 1 ? 'word' : 'words'}`}
        </span>
      </span>
      {scene.status === 'draft' && (
        <span className="absolute left-3 top-3 rounded-lg bg-white px-2 py-0.5 text-sm font-bold text-ink">Needs review</span>
      )}
    </button>
  )
}

/** The caregiver's home: the person's world as an album of talking moments. */
export function Album({ scenes, health, personName, onOpen, onSnap, onPlay, onScenesChanged, prefs, onPrefs }: AlbumProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [latest, ...rest] = scenes
  const drafts = scenes.filter((s) => s.status === 'draft')
  const ready = scenes.some((s) => s.status === 'approved')

  return (
    <div className="px-safe pt-safe mx-auto min-h-full max-w-5xl pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8">
      <header className="flex h-12 items-center justify-between gap-2">
        <Logo />
        <span className="flex-1" />
        {health?.language_model.open_weights === 'true' && (
          <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold">Private</span>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(21,23,26,0.08)] active:scale-95"
        >
          <SettingsIcon />
        </button>
      </header>

      <section className="rise mt-6 sm:mt-9">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{personName}'s world</h1>
        <p className="mt-2 text-lg text-muted">
          {scenes.length === 0
            ? `Snap a photo and every person and thing in it becomes a word ${personName} can tap.`
            : `${scenes.length} ${scenes.length === 1 ? 'moment' : 'moments'}, ${wordCount(scenes)} ${wordCount(scenes) === 1 ? 'word' : 'words'} to tap`}
        </p>
      </section>

      <TodayCard personName={personName} apiReady={!!health?.api_key} onDraftsReady={onScenesChanged} />

      {drafts.length > 0 && (
        <button
          onClick={() => onOpen(drafts[0])}
          className="rise mt-6 flex w-full items-center gap-4 rounded-[20px] bg-white p-3 pr-5 text-left shadow-[0_2px_14px_rgba(21,23,26,0.06)]"
        >
          <span className="flex -space-x-3">
            {drafts.slice(0, 3).map((d) => (
              <img key={d.id} src={d.media_url} alt="" className="h-12 w-12 rounded-xl border-2 border-white object-cover" />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{drafts.length} new {drafts.length === 1 ? 'moment' : 'moments'} from today</span>
            <span className="block text-sm text-muted">Made for you. {personName} sees them after you approve.</span>
          </span>
          <span className="font-bold">Review</span>
        </button>
      )}

      {latest ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-muted">Latest</h2>
          <div className="rise">
            <MomentTile scene={latest} large onOpen={onOpen} />
          </div>
          {rest.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-bold text-muted">Earlier</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {rest.map((s, i) => (
                  <div key={s.id} className="rise" style={{ animationDelay: `${80 + i * 50}ms` }}>
                    <MomentTile scene={s} onOpen={onOpen} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <button
          onClick={onSnap}
          className="mt-10 flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-dashed border-line bg-white text-muted sm:aspect-[16/9]"
        >
          <CameraIcon className="h-10 w-10" />
          <span className="text-lg font-bold text-ink">Snap your first moment</span>
          <span>A meal, a visit, the park. Anything {personName} might want to talk about.</span>
        </button>
      )}

      {health && !health.api_key && (
        <p className="mt-6 text-center text-sm text-muted">Demo mode: connect the Meta API key to make new moments.</p>
      )}

      {settingsOpen && prefs && (
        <SettingsSheet prefs={prefs} health={health} onClose={() => setSettingsOpen(false)} onSaved={onPrefs} />
      )}

      {/* Thumb zone dock: the two things a caregiver does most, always within reach. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-canvas via-canvas/90 to-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8">
        <div className="pointer-events-auto mx-auto flex max-w-md gap-3 px-4">
          <button
            onClick={onPlay}
            disabled={!ready}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white font-bold shadow-[0_8px_24px_rgba(21,23,26,0.14)] transition active:scale-95 disabled:opacity-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffc95c] text-ink">{personName[0]}</span>
            Open for {personName}
          </button>
          <button
            onClick={onSnap}
            className="group flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink font-bold text-white shadow-[0_10px_28px_rgba(21,23,26,0.35)] transition active:scale-95"
          >
            <CameraIcon className="h-6 w-6 transition-transform duration-500 group-hover:-rotate-12" />
            Snap
          </button>
        </div>
      </div>
    </div>
  )
}
