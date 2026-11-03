import { useEffect, useState } from 'react'
import { api, type Job, type Scene } from '../api'
import { SparkIcon } from './Icons'

/** "Imagine Maya here": Muse Image puts an illustrated avatar into this place, doing something they want. */
export function WishMaker({ scene, personName, onMade }: { scene: Scene; personName: string; onMade: (sceneId: string) => void }) {
  const [activity, setActivity] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!job || job.status !== 'running') return
    const timer = window.setInterval(async () => {
      const next = await api.job(job.id)
      setJob(next)
      if (next.status === 'done' && next.scene_id) onMade(next.scene_id)
      if (next.status === 'error') setError(next.error)
    }, 800)
    return () => window.clearInterval(timer)
  }, [job, onMade])

  const busy = job?.status === 'running'

  return (
    <form
      className="mt-3 rounded-2xl bg-white p-4 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!activity.trim()) return
        setError(null)
        try {
          const res = await fetch(`/api/scenes/${scene.id}/wish`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activity }),
          })
          if (!res.ok) throw new Error((await res.json()).detail ?? 'Could not imagine that')
          setJob(await res.json())
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }}
    >
      <label className="block text-sm">
        <span className="block font-bold">Imagine {personName} here</span>
        <span className="block text-muted">So {personName} can ask for it. Made with Muse Image as a drawing, never a real face.</span>
        <span className="mt-3 flex gap-2">
          <input
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="playing with the dogs"
            className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-base"
            disabled={busy}
          />
          <button disabled={busy || !activity.trim()} className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-bold text-white disabled:opacity-40">
            <SparkIcon /> {busy ? 'Imagining' : 'Imagine'}
          </button>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  )
}
