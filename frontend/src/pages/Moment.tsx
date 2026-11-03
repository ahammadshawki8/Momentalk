import { useState } from 'react'
import { api, type Hotspot, type Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { BackIcon, CheckIcon, PlayIcon } from '../components/Icons'
import { SceneCanvas } from '../components/SceneCanvas'

interface MomentProps {
  scene: Scene
  personName: string
  reveal: boolean
  onBack: () => void
  onPlay: (scene: Scene) => void
  onChanged: () => Promise<void>
}

/** One moment: the outlined photo and its words, ready to adjust and share with the person. */
export function Moment({ scene, personName, reveal, onBack, onPlay, onChanged }: MomentProps) {
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
    <div className="mx-auto min-h-full max-w-5xl px-4 pb-16 pt-5 sm:px-8" style={accentStyle(color)}>
      <button onClick={onBack} className="flex items-center gap-1 rounded-full py-2 pr-3 font-bold text-muted hover:text-ink">
        <BackIcon /> {personName}'s world
      </button>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
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
              className="relative shadow-[0_20px_50px_rgba(21,23,26,0.18)]"
            />
          </div>
          <p className="mt-4 text-sm text-muted">
            {note ??
              (scene.hotspots.length === 0
                ? 'Not outlined yet. Connect the Meta API key and SAM 3.1 will outline everything in this photo.'
                : 'Missed something? Tap it on the photo to add it.')}
          </p>
        </div>

        <aside className="rise">
          <h1 className="text-3xl font-bold tracking-tight">{scene.title}</h1>
          <p className="mt-1 text-muted">
            {scene.hotspots.length} words
            {scene.build_seconds ? `, made in ${scene.build_seconds} seconds` : ''}
          </p>

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
                  await api.updateHotspot(scene.id, h.id, patch)
                  await onChanged()
                }}
                onRemove={async () => {
                  await api.deleteHotspot(scene.id, h.id)
                  setSelected(null)
                  await onChanged()
                }}
              />
            ))}
          </ul>

          {scene.status === 'draft' ? (
            <button
              onClick={async () => {
                await api.approve(scene.id)
                await onChanged()
              }}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-lg font-bold text-white"
            >
              <CheckIcon /> Approve for {personName}
            </button>
          ) : (
            <button
              onClick={() => onPlay(scene)}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full bg-ink py-4 text-lg font-bold text-white transition hover:-translate-y-0.5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                <PlayIcon className="h-3.5 w-3.5" />
              </span>
              Open for {personName}
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}

function WordRow({ hotspot, open, lit, onHover, onToggle, onSave, onRemove }: {
  hotspot: Hotspot
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
    <li onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}>
      <button onClick={onToggle} onFocus={() => onHover(true)} onBlur={() => onHover(false)}
              className="group flex w-full items-center gap-3 py-3.5 text-left" aria-expanded={open}>
        <span className={`h-3 w-3 shrink-0 rounded-full transition-transform duration-300 ${lit ? 'scale-150' : ''}`} style={{ background: 'var(--accent)' }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">{hotspot.label}</span>
          <span className="block truncate text-muted">{hotspot.phrase}</span>
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
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <PlayIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
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
            <button type="button" onClick={() => void onRemove()} className="rounded-full px-4 py-2 font-bold text-danger">
              Remove
            </button>
          </div>
        </form>
      )}
    </li>
  )
}
