import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { api, type InboxItem, type Job } from '../api'
import { CheckIcon, PlayIcon, SparkIcon } from './Icons'

const STEP_TEXT: Record<string, (detail?: string) => string> = {
  list_todays_media: () => "Looked through today's photos",
  look_at_media: () => 'Looked closely at a photo',
  get_tap_stats: () => 'Checked which words get tapped',
  build_draft_moment: (d) => `Made a draft${d ? `: ${d}` : ''}`,
  finish: () => 'Wrote you a note',
}

interface TodayCardProps {
  personName?: string
  apiReady: boolean
  onDraftsReady: () => Promise<void>
}

const FAN: Record<number, string[]> = {
  1: ['rotate-2'],
  2: ['-rotate-6 -translate-x-10', 'rotate-6 translate-x-10'],
  3: ['-rotate-6 -translate-x-16', 'rotate-2', 'rotate-[10deg] translate-x-16'],
}

/** Moment Builder (Muse Wonder): today's photos in a stack, one action, and a live trace while it works. */
export function TodayCard({ apiReady, onDraftsReady }: TodayCardProps) {
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void api.inbox().then(setInbox).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!job || job.status !== 'running') return
    const timer = window.setInterval(async () => {
      const next = await api.job(job.id)
      setJob(next)
      if (next.status !== 'running') {
        await onDraftsReady()
        setInbox(await api.inbox())
      }
    }, 800)
    return () => window.clearInterval(timer)
  }, [job, onDraftsReady])

  const steps = (job?.stages ?? []).filter((s) => s.stage === 'agent_step')
  const running = job?.status === 'running'
  const done = job?.status === 'done'
  const [adding, setAdding] = useState(false)
  // Gallery upload for the day: photos and short videos, several at once (the camera button is for one moment now).
  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/*,video/*"
      multiple
      className="hidden"
      onChange={async (e) => {
        const files = [...(e.target.files ?? [])]
        e.target.value = ''
        if (!files.length) return
        setAdding(true)
        setError(null)
        try {
          setInbox(await api.addToInbox(files))
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setAdding(false)
        }
      }}
    />
  )
  const spinner = <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true" />

  if (inbox.length === 0 && !job) {
    return (
      <>
        {picker}
        <button onClick={() => input.current?.click()} disabled={adding}
                className="rise mt-8 flex w-full flex-col items-center rounded-[28px] border-2 border-dashed border-line px-6 py-10 text-center active:bg-white">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl font-bold shadow-[0_6px_20px_rgba(20,20,20,0.08)]">
            {adding ? spinner : '+'}
          </span>
          <span className="mt-4 text-[length:var(--text-title)] font-bold">{adding ? 'Adding' : "Add today's photos and videos"}</span>
        </button>
        {error && <p className="mt-3 text-center text-[length:var(--text-caption)] text-danger">{error}</p>}
      </>
    )
  }

  const stack = inbox.slice(0, 3)
  const videos = inbox.filter((m) => m.kind === 'video').length
  const photos = inbox.length - videos
  const counted = [photos && `${photos} ${photos === 1 ? 'photo' : 'photos'}`, videos && `${videos} ${videos === 1 ? 'video' : 'videos'}`]
    .filter(Boolean).join(' and ')

  return (
    <section className="rise mt-8 overflow-hidden rounded-[28px] border border-line bg-white" aria-live="polite">
      {picker}
      <div className="relative flex h-56 items-center justify-center overflow-hidden bg-canvas">
        {stack.map((m, i) => (
          <span
            key={m.media_id}
            className={`absolute h-40 w-32 overflow-hidden rounded-[18px] border-4 border-white bg-stage shadow-[0_14px_32px_rgba(20,20,20,0.18)] ${
              FAN[stack.length][i]
            } ${running ? 'animate-pulse' : ''}`}
          >
            <img src={m.url} alt="" className="h-full w-full object-cover" />
            {m.kind === 'video' && (
              <span className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Video">
                <PlayIcon className="ml-0.5 h-3 w-3" />
              </span>
            )}
          </span>
        ))}
        {running && <span className="scan pointer-events-none absolute inset-0" style={{ '--accent': '#ffc24b' } as CSSProperties} aria-hidden="true" />}
        {inbox.length > 3 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-ink px-2.5 py-1 text-[length:var(--text-caption)] font-bold text-white">+{inbox.length - 3}</span>
        )}
      </div>

      <div className="p-5">
        <h2 className="text-[length:var(--text-headline)] font-bold leading-tight">
          {running ? 'Making moments' : done ? 'Drafts are ready' : `${counted} from today`}
        </h2>

        {!running && !done && (
          <div className="mt-5 flex gap-2">
            <button
              disabled={!apiReady}
              onClick={async () => {
                setError(null)
                try {
                  setJob(await api.runAgent())
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e))
                }
              }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink font-bold text-white active:scale-[0.98] disabled:opacity-40"
            >
              <SparkIcon /> Make moments
            </button>
            <button onClick={() => input.current?.click()} aria-label="Add more photos and videos" disabled={adding}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-2xl font-bold active:scale-95">{adding ? spinner : '+'}</button>
          </div>
        )}

        {steps.length > 0 && (
          <ol className="mt-5">
            {steps.map((s, i) => (
              <li key={i} className="step-in relative flex gap-3 pb-3 last:pb-0" style={{ animationDelay: `${i * 40}ms` }}>
                {(i < steps.length - 1 || running) && <span className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-line" aria-hidden="true" />}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-white"><CheckIcon className="h-3.5 w-3.5" /></span>
                <span className="pt-0.5 leading-snug">{STEP_TEXT[s.tool ?? '']?.(s.detail) ?? s.tool}</span>
              </li>
            ))}
            {running && (
              <li className="flex gap-3 pt-3 text-muted">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-ink" /></span>
                <span className="pt-0.5">Thinking</span>
              </li>
            )}
          </ol>
        )}

        {job?.run?.note && <p className="mt-5 rounded-[16px] bg-canvas p-4 leading-relaxed">{job.run.note}</p>}
        {(error || job?.error) && <p className="mt-4 text-[length:var(--text-caption)] text-danger">{error ?? job?.error}</p>}
      </div>
    </section>
  )
}
