import type { CSSProperties } from 'react'
import type { Health, Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { CameraIcon, PlayIcon } from '../components/Icons'
import { Logo } from '../components/Logo'

interface AlbumProps {
  scenes: Scene[]
  health: Health | null
  personName: string
  onOpen: (scene: Scene) => void
  onSnap: () => void
  onPlay: () => void
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
export function Album({ scenes, health, personName, onOpen, onSnap, onPlay }: AlbumProps) {
  const [latest, ...rest] = scenes
  const drafts = scenes.filter((s) => s.status === 'draft')
  const ready = scenes.some((s) => s.status === 'approved')

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 pb-32 pt-5 sm:px-8">
      <header className="flex items-center justify-between">
        <Logo />
        <button
          onClick={onPlay}
          disabled={!ready}
          className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 font-bold shadow-[0_2px_10px_rgba(21,23,26,0.08)] transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffc95c] text-ink">{personName[0]}</span>
          <PlayIcon className="h-3.5 w-3.5" />
          <span>Open for {personName}</span>
        </button>
      </header>

      <section className="rise mt-9">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{personName}'s world</h1>
        <p className="mt-2 text-lg text-muted">
          {scenes.length === 0
            ? `Snap a photo and every person and thing in it becomes a word ${personName} can tap.`
            : `${scenes.length} ${scenes.length === 1 ? 'moment' : 'moments'}, ${wordCount(scenes)} words to tap`}
        </p>
      </section>

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

      <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center">
        <button
          onClick={onSnap}
          className="group pointer-events-auto flex items-center gap-2.5 rounded-full bg-ink px-7 py-4 text-lg font-bold text-white shadow-[0_14px_34px_rgba(21,23,26,0.35)] transition duration-300 hover:-translate-y-0.5 active:scale-95"
        >
          <CameraIcon className="h-6 w-6 transition-transform duration-500 group-hover:-rotate-12 group-active:scale-90" />
          Snap a moment
        </button>
      </div>
    </div>
  )
}
