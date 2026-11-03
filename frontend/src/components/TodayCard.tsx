import { useEffect, useRef, useState } from 'react'
import { api, type InboxItem, type Job } from '../api'
import { CheckIcon, SparkIcon } from './Icons'

const STEP_TEXT: Record<string, (detail?: string) => string> = {
  list_todays_media: () => "Looked through today's photos",
  look_at_media: () => 'Looked closely at a photo',
  get_tap_stats: (_d) => 'Checked which words get tapped',
  build_draft_moment: (d) => `Made a draft moment${d ? `: ${d}` : ''}`,
  finish: () => 'Wrote you a note',
}

interface TodayCardProps {
  personName: string
  apiReady: boolean
  onDraftsReady: () => Promise<void>
}

/** Moment Builder (Muse Wonder): turns today's photos into draft moments, with a visible trace. */
export function TodayCard({ personName, apiReady, onDraftsReady }: TodayCardProps) {
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

  if (inbox.length === 0 && !job) {
    return (
      <div className="rise mt-6 flex flex-wrap items-center gap-4 rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(21,23,26,0.06)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-canvas"><SparkIcon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Add today's photos</span>
          <span className="block text-sm text-muted">Momentalk picks the best moments for {personName} and makes drafts for you to approve.</span>
        </span>
        <FilePicker inputRef={input} onFiles={async (files) => setInbox(await api.addToInbox(files))} />
        <button onClick={() => input.current?.click()} className="rounded-full bg-canvas px-4 py-2 font-bold">Add photos</button>
      </div>
    )
  }

  return (
    <section className="rise mt-6 rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(21,23,26,0.06)]" aria-live="polite">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex -space-x-3">
          {inbox.slice(0, 4).map((m) => (
            <img key={m.media_id} src={m.url} alt="" className="h-12 w-12 rounded-xl border-2 border-white object-cover" />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">
            {running ? 'Moment Builder is working' : job?.status === 'done' ? 'Drafts are ready for your review' : `${inbox.length} photos from today`}
          </span>
          <span className="block text-sm text-muted">Muse Wonder picks the moments. Nothing reaches {personName} until you approve it.</span>
        </span>
        {!running && job?.status !== 'done' && (
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
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-bold text-white disabled:opacity-40"
          >
            <SparkIcon /> Make moments from today
          </button>
        )}
      </div>

      {steps.length > 0 && (
        <ol className="mt-4 space-y-1.5 border-t border-line pt-3">
          {steps.map((s, i) => (
            <li key={i} className="step-in flex items-center gap-2.5 text-sm" style={{ animationDelay: `${i * 40}ms` }}>
              <CheckIcon className="h-4 w-4 text-muted" />
              <span>{STEP_TEXT[s.tool ?? '']?.(s.detail) ?? s.tool}</span>
            </li>
          ))}
          {running && <li className="flex items-center gap-2.5 text-sm text-muted"><span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-ink" /> Thinking</li>}
        </ol>
      )}
      {job?.run?.note && <p className="mt-3 rounded-2xl bg-canvas p-3 text-sm">{job.run.note}</p>}
      {(error || job?.error) && <p className="mt-3 text-sm text-danger">{error ?? job?.error}</p>}
    </section>
  )
}

function FilePicker({ inputRef, onFiles }: { inputRef: React.RefObject<HTMLInputElement | null>; onFiles: (files: File[]) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])]
        if (files.length) onFiles(files)
        e.target.value = ''
      }}
    />
  )
}
