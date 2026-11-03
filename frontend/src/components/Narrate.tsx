import { useRef, useState } from 'react'
import type { Scene } from '../api'

interface Change {
  hotspot_id: string
  label: string
  phrase: string
  why: string
}

type State =
  | { name: 'idle' }
  | { name: 'recording' }
  | { name: 'thinking' }
  | { name: 'review'; transcript: string; changes: Change[]; title: string }
  | { name: 'error'; message: string }

/** "Describe this moment": the caregiver talks, Momentalk proposes words in their own language. */
export function Narrate({ scene, onApplied }: { scene: Scene; onApplied: () => Promise<void> }) {
  const [state, setState] = useState<State>({ name: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => chunks.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setState({ name: 'thinking' })
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
        const form = new FormData()
        form.append('audio', blob, `narration.${blob.type.includes('ogg') ? 'ogg' : 'webm'}`)
        try {
          const res = await fetch(`/api/scenes/${scene.id}/narration`, { method: 'POST', body: form })
          if (!res.ok) throw new Error((await res.json()).detail ?? 'Could not understand the recording')
          const data = await res.json()
          setState(data.changes.length
            ? { name: 'review', transcript: data.transcript, changes: data.changes, title: data.title }
            : { name: 'error', message: data.transcript ? `Heard "${data.transcript}" but found nothing to rename.` : 'Nothing was heard. Try again a little closer.' })
        } catch (e) {
          setState({ name: 'error', message: e instanceof Error ? e.message : String(e) })
        }
      }
      rec.start()
      recorder.current = rec
      setState({ name: 'recording' })
    } catch {
      setState({ name: 'error', message: 'Microphone is blocked. Allow it to describe moments by voice.' })
    }
  }

  async function apply(changes: Change[], title: string) {
    await fetch(`/api/scenes/${scene.id}/narration/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes, title: title || null }),
    })
    await onApplied()
    setState({ name: 'idle' })
  }

  const byId = new Map(scene.hotspots.map((h) => [h.id, h]))

  return (
    <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
      {state.name === 'review' ? (
        <div className="rise">
          <p className="text-sm text-muted">You said: "{state.transcript}"</p>
          <ul className="mt-3 space-y-2">
            {state.changes.map((c) => (
              <li key={c.hotspot_id} className="rounded-xl bg-canvas px-3 py-2">
                <span className="text-muted line-through">{byId.get(c.hotspot_id)?.label}</span>{' '}
                <span className="font-bold">{c.label}</span>
                <span className="block text-sm text-muted">{c.phrase}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void apply(state.changes, state.title)} className="rounded-full bg-ink px-4 py-2 font-bold text-white">
              Use these words
            </button>
            <button onClick={() => setState({ name: 'idle' })} className="rounded-full px-4 py-2 font-bold text-muted">Keep mine</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={() => (state.name === 'recording' ? recorder.current?.stop() : void start())}
            disabled={state.name === 'thinking' || scene.hotspots.length === 0}
            aria-pressed={state.name === 'recording'}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${state.name === 'recording' ? 'bg-danger text-white' : 'bg-ink text-white'}`}
            aria-label={state.name === 'recording' ? 'Stop recording' : 'Describe this moment out loud'}
          >
            {state.name === 'recording' && <span className="listening-ring absolute inset-0 rounded-full border-2 border-danger" aria-hidden="true" />}
            <span className={state.name === 'recording' ? 'h-3.5 w-3.5 rounded-sm bg-white' : 'h-3.5 w-3.5 rounded-full bg-white'} />
          </button>
          <span className="min-w-0 text-sm">
            <span className="block font-bold">
              {state.name === 'recording' ? 'Listening. Tap to finish.' : state.name === 'thinking' ? 'Finding your words...' : 'Describe it in your words'}
            </span>
            <span className="block text-muted">
              {state.name === 'error' ? state.message : '"This is Nana, she makes pancakes." Names become words.'}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
