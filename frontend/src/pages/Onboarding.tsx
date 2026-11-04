import { useState } from 'react'
import type { Scene } from '../api'
import { LogoMark } from '../components/Logo'
import { SceneCanvas } from '../components/SceneCanvas'
import { LANGUAGES, type LocalPrefs } from '../localPrefs'

interface OnboardingProps {
  initial: LocalPrefs
  sample?: Scene
  onDone: (prefs: LocalPrefs, next: 'explore' | 'snap') => void
}

const STEPS = ['welcome', 'name', 'language', 'how', 'ready'] as const
type Step = (typeof STEPS)[number]

const HOW = [
  { title: 'Snap a moment', body: 'A photo or short video of real life: a meal, a visit, the park.' },
  { title: 'Every thing becomes a word', body: 'Momentalk outlines each person and object and gives it a voice.' },
  { title: 'Tap to talk, talk to teach', body: 'They tap to speak. When you talk, the words you say light up.' },
]

/** First run journey: one question per screen, a single clear action at the bottom. */
export function Onboarding({ initial, sample, onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState(initial.personName)
  const [language, setLanguage] = useState(initial.language)
  const index = STEPS.indexOf(step)
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)])
  const prev = () => setStep(STEPS[Math.max(index - 1, 0)])
  const person = name.trim() || 'them'
  const finish = (choice: 'explore' | 'snap') => onDone({ onboarded: true, personName: name.trim() || 'Maya', language }, choice)

  return (
    <div className="app-surface flex flex-col bg-canvas">
      <header className="pt-safe px-safe flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between">
        {index > 0 ? (
          <button onClick={prev} className="-ml-2 h-11 rounded-full px-3 font-bold text-muted active:bg-white">Back</button>
        ) : <span />}
        <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 rounded-full transition-all duration-500 ${i <= index ? 'w-6 bg-ink' : 'w-1.5 bg-line'}`} />
          ))}
        </div>
        {step !== 'ready' ? (
          <button onClick={() => finish('explore')} className="-mr-2 h-11 rounded-full px-3 font-bold text-muted active:bg-white">Skip</button>
        ) : <span className="w-12" />}
      </header>

      <main key={step} className="rise mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col px-6 pt-6">
        {step === 'welcome' && (
          <>
            <LogoMark className="h-12 w-12 text-ink" />
            <h1 className="mt-8 text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">Every moment has a story.</h1>
            <p className="mt-4 text-[length:var(--text-body)] leading-relaxed text-muted">
              Momentalk turns everyday photos into a voice for people who cannot rely on speech.
            </p>
            {sample && (
              <div className="mt-8 overflow-hidden rounded-[24px] shadow-[0_20px_50px_rgba(20,20,20,0.12)]">
                <SceneCanvas scene={sample} mode="speak" reveal ambient labels={false} rounded="rounded-[24px]" />
              </div>
            )}
          </>
        )}

        {step === 'name' && (
          <>
            <h1 className="text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">Who will use Momentalk?</h1>
            <p className="mt-3 text-[length:var(--text-body)] text-muted">Their name appears on their board and in their phrases.</p>
            <label className="mt-10 block">
              <span className="text-[length:var(--text-caption)] font-bold text-muted">First name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && next()}
                className="mt-2 w-full border-b-2 border-line bg-transparent pb-3 text-[length:var(--text-headline)] font-bold outline-none transition focus:border-ink"
                placeholder="Maya"
                maxLength={24}
              />
            </label>
          </>
        )}

        {step === 'language' && (
          <>
            <h1 className="text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">Which language does {person} hear at home?</h1>
            <p className="mt-3 text-[length:var(--text-body)] text-muted">Words and voices follow it. You can change it later.</p>
            <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-white" role="radiogroup">
              {LANGUAGES.map((l) => (
                <li key={l.code}>
                  <button
                    role="radio"
                    aria-checked={language === l.code}
                    onClick={() => setLanguage(l.code)}
                    className="flex h-14 w-full items-center justify-between px-5 text-left active:bg-canvas"
                  >
                    <span>
                      <span className="font-bold">{l.name}</span>
                      {l.native !== l.name && <span className="ml-2 text-muted">{l.native}</span>}
                    </span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${language === l.code ? 'border-ink bg-ink' : 'border-line'}`}>
                      {language === l.code && <span className="h-2 w-2 rounded-full bg-white" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 'how' && (
          <>
            <h1 className="text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">How it works</h1>
            <ol className="mt-10 space-y-8">
              {HOW.map((h, i) => (
                <li key={h.title} className="flex gap-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[length:var(--text-title)] font-bold shadow-[0_2px_10px_rgba(20,20,20,0.06)]">{i + 1}</span>
                  <span>
                    <span className="block text-[length:var(--text-title)] font-bold">{h.title}</span>
                    <span className="mt-1 block leading-relaxed text-muted">{h.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-10 rounded-[16px] bg-white p-4 text-[length:var(--text-caption)] leading-relaxed text-muted">
              Momentalk is a communication tool. It does not diagnose or give medical advice.
            </p>
          </>
        )}

        {step === 'ready' && (
          <>
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-[length:var(--text-headline)] font-bold">
              {(name.trim() || 'M')[0].toUpperCase()}
            </span>
            <h1 className="mt-8 text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">{person}'s world is ready.</h1>
            <p className="mt-3 text-[length:var(--text-body)] leading-relaxed text-muted">
              Start with the sample moments, or snap the first real one now.
            </p>
          </>
        )}
      </main>

      <footer className="px-safe pb-safe mx-auto w-full max-w-md px-6 pt-4">
        {step === 'ready' ? (
          <div className="flex flex-col gap-3">
            <button onClick={() => finish('snap')} className="h-14 rounded-full bg-ink text-[length:var(--text-body)] font-bold text-white active:scale-[0.98]">
              Snap the first moment
            </button>
            <button onClick={() => finish('explore')} className="h-14 rounded-full bg-white text-[length:var(--text-body)] font-bold active:scale-[0.98]">
              Explore sample moments
            </button>
          </div>
        ) : (
          <button
            onClick={next}
            disabled={step === 'name' && !name.trim()}
            className="h-14 w-full rounded-full bg-ink text-[length:var(--text-body)] font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {step === 'welcome' ? 'Get started' : 'Continue'}
          </button>
        )}
      </footer>
    </div>
  )
}
