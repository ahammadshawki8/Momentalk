import { useEffect, useRef, useState } from 'react'
import { MicIcon } from './Icons'
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
  const busy = state.name === 'thinking'

  return (
    <div className="relative mt-5 overflow-hidden rounded-[20px] border border-line bg-white p-4">
      {state.name === 'review' ? (
        <div className="rise">
          <p className="text-[length:var(--text-caption)] text-muted">"{state.transcript}"</p>
          <ul className="mt-3 space-y-2">
            {state.changes.map((c) => (
              <li key={c.hotspot_id} className="rounded-[14px] bg-canvas px-3 py-2.5">
                <span className="text-muted line-through">{byId.get(c.hotspot_id)?.label}</span>{' '}
                <span className="font-bold">{c.label}</span>
                <span className="block text-[length:var(--text-caption)] text-muted">{c.phrase}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void apply(state.changes, state.title)} className="h-12 flex-1 rounded-full bg-ink font-bold text-white active:scale-[0.98]">
              Use these words
            </button>
            <button onClick={() => setState({ name: 'idle' })} className="h-12 rounded-full bg-canvas px-5 font-bold active:scale-[0.98]">Keep mine</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            onClick={() => (state.name === 'recording' ? recorder.current?.stop() : void start())}
            disabled={busy || scene.hotspots.length === 0}
            aria-pressed={state.name === 'recording'}
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-60 ${state.name === 'recording' ? 'bg-danger' : 'bg-ink'}`}
            aria-label={state.name === 'recording' ? 'Stop recording' : "Say who's in it"}
          >
            {state.name === 'recording' && <span className="listening-ring absolute inset-0 rounded-full border-2 border-danger" aria-hidden="true" />}
            {busy ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : state.name === 'recording' ? (
              <span className="h-4 w-4 rounded-[4px] bg-white" />
            ) : (
              <MicIcon />
            )}
          </button>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">
              {state.name === 'recording' ? 'Listening' : busy ? <ThinkingStep /> : "Say who's in it"}
            </span>
            {state.name === 'recording' && <RecordingMeter />}
            {state.name === 'error' && <span className="block text-[length:var(--text-caption)] text-muted">{state.message}</span>}
          </span>
        </div>
      )}
      {busy && <span className="progress-indeterminate absolute inset-x-0 bottom-0 h-1" aria-hidden="true" />}
    </div>
  )
}

/** One request does two jobs; show them in turn so the wait reads as progress. */
function ThinkingStep() {
  const [second, setSecond] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSecond(true), 2500)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <span key={String(second)} className="rise block">
      {second ? 'Matching names to the photo' : 'Writing down what you said'}
      <span className="block text-[length:var(--text-caption)] font-normal text-muted">{second ? 'Muse Spark' : 'Muse Voice Transcribe'}</span>
    </span>
  )
}

function RecordingMeter() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <span className="mt-1 flex items-center gap-2 text-[length:var(--text-caption)] text-muted">
      <span className="flex h-4 items-center gap-[3px] text-danger" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className="eq-bar w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 110}ms` }} />)}
      </span>
      <span className="tabular-nums">0:{String(seconds).padStart(2, '0')}</span>
      <span>Tap to finish</span>
    </span>
  )
}
