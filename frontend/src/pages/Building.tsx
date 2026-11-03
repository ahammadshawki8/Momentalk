import type { Job } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { CheckIcon } from '../components/Icons'

const STEPS = [
  { stage: 'understanding', model: 'Muse Spark', text: (_?: Job['stages'][number]) => 'Seeing who and what is here' },
  { stage: 'segmenting', model: 'SAM 3.1', text: (s?: Job['stages'][number]) => (s?.labels?.length ? `Outlining ${s.labels.join(', ')}` : 'Outlining each one') },
  { stage: 'voicing', model: 'Voice', text: (_?: Job['stages'][number]) => 'Giving every outline a voice' },
]
const ORDER = ['understanding', 'segmenting', 'voicing', 'done']

/** Full focus on the new photo while each model reports in. */
export function Building({ photoUrl, job, onCancel }: { photoUrl: string; job: Job | null; onCancel: () => void }) {
  const color = useMomentColor(photoUrl)
  const reached = new Map<string, Job['stages'][number]>((job?.stages ?? []).map((s) => [s.stage, s]))
  const latest = Math.max(0, ...[...reached.keys()].map((k) => ORDER.indexOf(k)))
  const failed = job?.status === 'error'

  return (
    <div className="mx-auto min-h-full max-w-3xl px-4 pb-16 pt-8 sm:px-8" style={accentStyle(color)}>
      <div className="relative overflow-hidden rounded-[24px] bg-stage shadow-[0_20px_50px_rgba(21,23,26,0.2)]">
        <img src={photoUrl} alt="Your new moment" className="block max-h-[60vh] w-full object-cover" />
        {!failed && <div className="scan absolute inset-0" aria-hidden="true" />}
      </div>

      <ol className="mt-6 space-y-2" aria-live="polite">
        {STEPS.map((step, i) => {
          const done = i < latest || job?.status === 'done'
          const active = !done && i === latest && !failed
          return (
            <li key={step.stage} className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition ${active ? 'bg-white shadow-sm' : ''} ${!done && !active ? 'opacity-40' : ''}`}>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: done || active ? 'var(--accent)' : 'var(--color-line)', color: 'var(--accent-ink)' }}
              >
                {done ? <CheckIcon className="h-4 w-4" /> : <span className={`h-2.5 w-2.5 rounded-full bg-ink ${active ? 'animate-pulse' : 'opacity-30'}`} />}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight">{step.text(reached.get(step.stage))}</span>
                <span className="block text-sm text-muted">{step.model}</span>
              </span>
            </li>
          )
        })}
      </ol>

      {failed && (
        <div className="mt-4 rounded-2xl bg-white p-4">
          <p className="font-bold text-danger">{job?.error}</p>
          <button onClick={onCancel} className="mt-3 rounded-full bg-ink px-5 py-2 font-bold text-white">Back to album</button>
        </div>
      )}
    </div>
  )
}
