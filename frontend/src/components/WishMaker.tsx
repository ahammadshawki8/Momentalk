import { useState } from 'react'
import { api, type Job, type Scene } from '../api'
import { SparkIcon } from './Icons'

/** "Imagine Maya here": Muse Image puts an illustrated avatar into this place, doing something they want. */
export function WishMaker({ scene, personName, language, avatarId, onStarted }: {
  scene: Scene
  personName: string
  language: string
  avatarId?: string
  onStarted: (job: Job) => void
}) {
  const [activity, setActivity] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="mt-3 rounded-[20px] border border-line bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!activity.trim() || sending) return
        setError(null)
        setSending(true)
        try {
          onStarted(await api.makeWish(scene.id, { activity: activity.trim(), person_name: personName, language, avatar_id: avatarId }))
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
          setSending(false)
        }
      }}
    >
      <label className="block">
        <span className="block font-bold">Imagine {personName} here</span>
        <span className="mt-3 flex gap-2">
          <input
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="playing with the dogs"
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-canvas px-4 text-base outline-none focus:border-ink"
            disabled={sending}
          />
          <button disabled={sending || !activity.trim()} className="flex h-12 items-center gap-1.5 rounded-full bg-ink px-5 font-bold text-white disabled:opacity-40">
            {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-label="Starting" /> : <SparkIcon />}
            Imagine
          </button>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  )
}
