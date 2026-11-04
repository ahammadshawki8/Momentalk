import { useState } from 'react'
import { api, type Hotspot, type Job, type Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { ConfirmButton } from '../components/ConfirmButton'
import { BackIcon, CheckIcon, PlayIcon, TrashIcon } from '../components/Icons'
import { errorText, toast } from '../toast'
import { Narrate } from '../components/Narrate'
import { WishMaker } from '../components/WishMaker'
import { SceneCanvas } from '../components/SceneCanvas'
import { OpenForButton } from '../components/MomentParts'

interface MomentProps {
  scene: Scene
  personName: string
  language: string
  avatarId?: string
  reveal: boolean
  onBack: () => void
  onPlay: (scene: Scene) => void
  onChanged: () => Promise<void>
  onBuildStarted: (job: Job, photoUrl: string) => void
}

/** One moment: the outlined photo and its words, ready to adjust and share with the person. */
export function Moment({ scene, personName, language, avatarId, reveal, onBack, onPlay, onChanged, onBuildStarted }: MomentProps) {
  const color = useMomentColor(scene.media_url)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function addAt(x: number, y: number) {
    if (scene.placeholder || busy) return
    setBusy(true)
    setNote('Finding what you tapped...')
    try {
      const h = await api.addHotspotAt(scene.id, x, y)
      await onChanged()
      setSelected(h.id)
      setNote(null)
    } catch (e) {
      setNote(e instanceof Error && e.message.includes('Nothing') ? 'Nothing to outline there. Try tapping the middle of it.' : 'Could not add that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-full max-w-5xl overflow-x-clip pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8" style={accentStyle(color)}>
      {/* Sticky app bar: back is always one thumb reach away. */}
      <div className="px-safe pt-safe sticky top-0 z-30 -mb-1 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center bg-canvas/85 backdrop-blur-md sm:static sm:bg-transparent sm:backdrop-blur-none">
        <button onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 rounded-full pl-1 pr-3 font-bold text-muted active:bg-white hover:text-ink">
          <BackIcon /> {personName}'s world
        </button>
      </div>

      <div className="mt-2 grid gap-6 sm:mt-4 sm:gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="relative">
            {/* Ambient light: the photo's own colors spill softly onto the page. */}
            <img src={scene.media_url} alt="" aria-hidden="true"
                 className="pointer-events-none absolute inset-0 h-full w-full scale-105 rounded-[24px] object-cover opacity-55 blur-3xl saturate-150" />
            <SceneCanvas
              key={`${scene.id}-${reveal}`}
              scene={scene}
              mode="edit"
              reveal={reveal}
              showLabels={!reveal}
              selectedId={hovered ?? selected}
              transitionName={`photo-${scene.id}`}
              onSelect={(h) => setSelected(h.id)}
              onEmptyTap={addAt}
              onHover={setHovered}
              rounded="rounded-none sm:rounded-[24px]"
              className="relative shadow-[0_20px_50px_rgba(21,23,26,0.18)]"
            />
          </div>
          {note && (
            <p className="rise mx-4 mt-3 flex w-fit items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-[length:var(--text-caption)] font-bold sm:mx-0" aria-live="polite">
              {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/25 border-t-ink" aria-hidden="true" />}
              {note}
            </p>
          )}
        </div>

        <aside className="rise px-4 sm:px-0">
          <h1 className="text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">{scene.title}</h1>
          <p className="mt-1 text-muted">
            {scene.hotspots.length} {scene.hotspots.length === 1 ? 'word' : 'words'}
            {scene.build_seconds ? `, made in ${scene.build_seconds} seconds` : ''}
          </p>

          {scene.agent_note && (
            <p className="mt-4 rounded-2xl bg-white p-3.5 text-sm shadow-sm">
              <span className="block font-bold">Why Momentalk picked this</span>
              {scene.agent_note}
            </p>
          )}

          <ul className="mt-5 divide-y divide-line border-y border-line">
            {scene.hotspots.map((h) => (
              <WordRow
                key={h.id}
                hotspot={h}
                open={selected === h.id}
                lit={hovered === h.id}
                onHover={(on) => setHovered(on ? h.id : null)}
                onToggle={() => setSelected((s) => (s === h.id ? null : h.id))}
                onSave={async (patch) => {
                  try {
                    await api.updateHotspot(scene.id, h.id, patch)
                    await onChanged()
                  } catch (e) {
                    toast(errorText(e))
                  }
                }}
                onRemove={async () => {
                  await api.deleteHotspot(scene.id, h.id)
                  setSelected(null)
                  await onChanged()
                }}
                hasAudio={!!h.audio_url}
              />
            ))}
          </ul>

          {!scene.placeholder && <Narrate scene={scene} onApplied={onChanged} />}
          {scene.kind !== 'wish' && (
            <WishMaker scene={scene} personName={personName} language={language} avatarId={avatarId}
                       onStarted={(job) => onBuildStarted(job, scene.media_url)} />
          )}

          {scene.status === 'approved' && (
            <ConfirmButton
              label="Delete this moment"
              confirmLabel="Tap again to delete for good"
              onConfirm={async () => {
                await api.deleteScene(scene.id)
                onBack()
                await onChanged()
              }}
              className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-line bg-white font-bold text-danger"
              armedClassName="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-danger font-bold text-white"
            >
              <TrashIcon /> Delete this moment
            </ConfirmButton>
          )}

        </aside>
      </div>

      {/* Sticky primary action in the thumb zone. */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-canvas via-canvas/90 to-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto max-w-md px-4">
          {scene.status === 'draft' ? (
            <div className="flex gap-2">
              <ConfirmButton
                label="Reject this draft"
                confirmLabel="Reject?"
                onConfirm={async () => {
                  await api.rejectScene(scene.id)
                  onBack()
                  await onChanged()
                }}
                className="h-14 shrink-0 rounded-full border border-line bg-white px-6 text-lg font-bold text-danger"
                armedClassName="h-14 shrink-0 rounded-full bg-danger px-6 text-lg font-bold text-white"
              >
                Reject
              </ConfirmButton>
              <button
                onClick={async () => {
                  try {
                    await api.approve(scene.id)
                    await onChanged()
                  } catch (e) {
                    toast(errorText(e))
                  }
                }}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-lg font-bold text-white shadow-[0_10px_28px_rgba(21,23,26,0.35)] active:scale-[0.98]"
              >
                <CheckIcon /> Approve for {personName}
              </button>
            </div>
          ) : (
            <OpenForButton personName={personName} onClick={() => onPlay(scene)} />
          )}
        </div>
      </div>
    </div>
  )
}

function WordRow({ hotspot, open, lit, onHover, onToggle, onSave, onRemove, hasAudio }: {
  hotspot: Hotspot
  hasAudio: boolean
  open: boolean
  lit: boolean
  onHover: (on: boolean) => void
  onToggle: () => void
  onSave: (patch: { label: string; phrase: string }) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [label, setLabel] = useState(hotspot.label)
  const [phrase, setPhrase] = useState(hotspot.phrase)
  const changed = label !== hotspot.label || phrase !== hotspot.phrase

  return (
    <li className="relative" onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}>
      <button onClick={onToggle} onFocus={() => onHover(true)} onBlur={() => onHover(false)}
              className="group flex min-h-14 w-full items-center gap-3 py-3 text-left active:bg-white/60" aria-expanded={open}>
        <span className={`h-3 w-3 shrink-0 rounded-full transition-transform duration-300 ${lit ? 'scale-150' : ''}`} style={{ background: 'var(--accent)' }} aria-hidden="true" />
        <span className={`min-w-0 flex-1 ${hasAudio ? 'pr-12' : 'pr-14'}`}>
          <span className="block text-lg font-bold">{hotspot.label}</span>
          <span className="block text-muted">{hotspot.phrase}</span>
        </span>
        {hotspot.audio_url && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Hear ${hotspot.label}`}
            onClick={(e) => {
              e.stopPropagation()
              void new Audio(hotspot.audio_url).play()
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm active:scale-95"
          >
            <PlayIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      <span className={`absolute top-[1.75rem] -translate-y-1/2 ${hasAudio ? 'right-14' : 'right-0'}`}>
        <ConfirmButton
          label={`Delete the word ${hotspot.label}`}
          confirmLabel="Delete"
          onConfirm={onRemove}
          className="flex h-11 w-11 items-center justify-center rounded-full text-faint hover:text-danger"
          armedClassName="flex h-11 items-center justify-center rounded-full bg-danger px-4 text-sm font-bold text-white"
        >
          <TrashIcon />
        </ConfirmButton>
      </span>
      {open && (
        <form
          className="rise flex flex-col gap-3 pb-4"
          onSubmit={(e) => {
            e.preventDefault()
            void onSave({ label, phrase })
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Word"
                 className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-lg font-bold" />
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} aria-label="What it says"
                 className="rounded-xl border border-line bg-white px-3.5 py-2.5" />
          <div className="flex gap-2">
            <button type="submit" disabled={!changed} className="rounded-full bg-ink px-5 py-2 font-bold text-white disabled:opacity-40">
              Save
            </button>
          </div>
        </form>
      )}
    </li>
  )
}
