import { useEffect, useState } from 'react'
import type { Job } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { CheckIcon } from '../components/Icons'

type Stage = Job['stages'][number]
interface Step { stage: string; model: string; text: (s?: Stage) => string }

const PHOTO_STEPS: Step[] = [
  { stage: 'understanding', model: 'Muse Spark', text: () => 'Seeing who and what is here' },
  { stage: 'segmenting', model: 'SAM 3.1', text: (s) => (s?.labels?.length ? `Outlining ${s.labels.join(', ')}` : 'Outlining each one') },
  { stage: 'voicing', model: 'Voice', text: () => 'Giving every outline a voice' },
]

/** Full focus on the new photo while each model reports in, with a running clock so waits never look frozen. */
export function Building({ photoUrl, isVideo = false, job, personName, onCancel }: {
  photoUrl: string
  isVideo?: boolean
  job: Job | null
  personName: string
  onCancel: () => void
}) {
  const color = useMomentColor(isVideo ? undefined : photoUrl)
  const wish = job?.kind === 'wish'
  const steps: Step[] = wish
    ? [{ stage: 'imagining', model: 'Muse Image', text: () => `Drawing ${personName} into this place` }, ...PHOTO_STEPS]
    : PHOTO_STEPS
  const order = [...steps.map((s) => s.stage), 'done']
  const reached = new Map<string, Stage>((job?.stages ?? []).map((s) => [s.stage, s]))
  const latest = Math.max(0, ...[...reached.keys()].map((k) => order.indexOf(k)))
  const failed = job?.status === 'error'

  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (failed || job?.status === 'done') return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [failed, job?.status])
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="pt-safe mx-auto min-h-full max-w-2xl px-5 pb-16 sm:px-8" style={accentStyle(color)}>
      <header className="flex h-14 items-center justify-between">
        <p className="text-[length:var(--text-caption)] font-bold text-muted">
          {failed ? 'Stopped' : wish ? `Imagining ${personName} here` : 'Making a moment'}
        </p>
        {!failed && <p className="font-bold tabular-nums text-muted" aria-label={`${seconds} seconds`}>{clock}</p>}
      </header>

      <div className="relative overflow-hidden rounded-[28px] bg-stage shadow-[0_20px_50px_rgba(20,20,20,0.18)]">
        {isVideo ? (
          <video src={photoUrl} className="block max-h-[56vh] w-full object-cover" autoPlay muted loop playsInline aria-label="Your new moment" />
        ) : (
          <img src={photoUrl} alt="Your new moment" className={`block max-h-[56vh] w-full object-cover transition duration-700 ${wish && latest === 0 && !failed ? 'blur-[2px] saturate-50' : ''}`} />
        )}
        {!failed && <div className="scan absolute inset-0" aria-hidden="true" />}
      </div>

      <ol className="mt-6 space-y-2" aria-live="polite">
        {steps.map((step, i) => {
          const done = i < latest || job?.status === 'done'
          const active = !done && i === latest && !failed
          return (
            <li key={step.stage} className={`flex items-center gap-4 rounded-[20px] px-4 py-3 transition duration-500 ${active ? 'bg-white' : ''} ${!done && !active ? 'opacity-35' : ''}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: done ? 'var(--color-ink)' : active ? 'var(--accent)' : 'var(--color-line)', color: done ? '#fff' : 'var(--accent-ink)' }}>
                {done ? <CheckIcon className="h-4 w-4" /> : active ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <span className="h-2 w-2 rounded-full bg-ink/30" />}
              </span>
              <span className="min-w-0">
                <span className="block font-bold leading-snug">{step.text(reached.get(step.stage))}</span>
                <span className="block text-[length:var(--text-caption)] text-muted">{step.model}</span>
              </span>
            </li>
          )
        })}
      </ol>

      {failed && (
        <div className="mt-4 rounded-[20px] border border-line bg-white p-5">
          <p className="font-bold text-danger">{job?.error}</p>
          <button onClick={onCancel} className="mt-4 h-12 rounded-full bg-ink px-6 font-bold text-white">Go back</button>
        </div>
      )}
    </div>
  )
}
