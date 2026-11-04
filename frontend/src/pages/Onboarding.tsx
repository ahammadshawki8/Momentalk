import { useState, type ReactNode } from 'react'
import type { Scene } from '../api'
import { AvatarFace, HAIR, OUTFIT, SKIN, STYLES, type AvatarTraits } from '../components/Avatar'
import { Logo } from '../components/Logo'
import { SceneCanvas } from '../components/SceneCanvas'
import { LANGUAGES, type LocalPrefs } from '../localPrefs'

interface OnboardingProps {
  initial: LocalPrefs
  sample?: Scene
  /** Muse Image drawing of the avatar, once it is ready. */
  avatarUrl?: string
  avatarDrawing: boolean
  onAvatarRequested: (traits: AvatarTraits) => void
  onDone: (prefs: LocalPrefs, next: 'explore' | 'snap') => void
}

const STEPS = ['welcome', 'name', 'look', 'language', 'how', 'ready'] as const
type Step = (typeof STEPS)[number]

const HOW = [
  { title: 'Snap a moment', body: 'A photo or short video of real life: a meal, a visit, the park.' },
  { title: 'Every thing becomes a word', body: 'Momentalk outlines each person and object and gives it a voice.' },
  { title: 'Tap to talk, talk to teach', body: 'They tap to speak. When you talk, the words you say light up.' },
]

const STYLE_LABEL: Record<string, string> = { short: 'Short', curly: 'Curly', long: 'Long', ponytail: 'Ponytail', bun: 'Buns' }
const heading = 'text-[length:var(--text-display)] font-bold leading-[1.1] tracking-[-0.02em] text-balance'

/** First run journey: one question per screen, a single clear action at the bottom. */
export function Onboarding({ initial, sample, avatarUrl, avatarDrawing, onAvatarRequested, onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [dir, setDir] = useState<1 | -1>(1)
  const [name, setName] = useState(initial.personName)
  const [language, setLanguage] = useState(initial.language)
  const [traits, setTraits] = useState<AvatarTraits>(initial.avatar.traits)
  const index = STEPS.indexOf(step)
  const person = name.trim() || 'them'

  const go = (to: number) => {
    setDir(to > index ? 1 : -1)
    setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, to))])
  }
  const next = () => {
    if (step === 'look') onAvatarRequested(traits)
    go(index + 1)
  }
  const prefs = (): LocalPrefs => ({ onboarded: true, personName: name.trim() || 'Maya', language, avatar: { ...initial.avatar, traits } })
  const finish = (choice: 'explore' | 'snap') => onDone(prefs(), choice)

  return (
    <div className="app-surface flex flex-col bg-canvas">
      <header className="pt-safe px-safe mx-auto w-full max-w-md">
        <div className="flex h-14 items-center justify-between px-2">
          {index > 0 ? (
            <button onClick={() => go(index - 1)} className="-ml-3 h-11 rounded-full px-3 font-bold text-muted active:bg-white">Back</button>
          ) : <Logo />}
          {step !== 'ready' && (
            <button onClick={() => finish('explore')} className="-mr-3 h-11 rounded-full px-3 font-bold text-muted active:bg-white">Skip</button>
          )}
        </div>
        <div className="flex gap-1.5 px-2" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-ink transition-all duration-500 ease-out" style={{ width: i <= index ? '100%' : '0%' }} />
            </span>
          ))}
        </div>
      </header>

      <main key={step} className={`${dir > 0 ? 'slide-next' : 'slide-prev'} mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto px-6 pt-8`}>
        {step === 'welcome' && (
          <div className="stagger flex flex-1 flex-col justify-center pb-6">
            {sample && (
              <div className="overflow-hidden rounded-[28px] shadow-[0_24px_60px_rgba(20,20,20,0.16)]">
                <SceneCanvas scene={sample} mode="speak" reveal ambient labels={false} rounded="rounded-[28px]" />
              </div>
            )}
            <div className="pt-8">
              <h1 className={heading}>Every moment has a story.</h1>
              <p className="mt-3 text-[length:var(--text-body)] leading-relaxed text-muted">
                Momentalk turns everyday photos into a voice for people who cannot rely on speech.
              </p>
            </div>
          </div>
        )}

        {step === 'name' && (
          <div className="stagger">
            <h1 className={heading}>Who will use Momentalk?</h1>
            <p className="mt-3 text-[length:var(--text-body)] text-muted">Their name appears on their board and in their phrases.</p>
            <label className="mt-12 block">
              <span className="text-[length:var(--text-caption)] font-bold text-muted">First name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && next()}
                className="mt-2 w-full border-b-2 border-line bg-transparent pb-3 text-[length:var(--text-display)] font-bold outline-none transition focus:border-ink"
                placeholder="Maya"
                maxLength={24}
              />
            </label>
          </div>
        )}

        {step === 'look' && (
          <div className="stagger">
            <h1 className={heading}>What does {person} look like?</h1>
            <p className="mt-2 text-muted">For the drawings of {person} in wishes. A drawing, never a photo.</p>
            <div className="mt-5 flex justify-center">
              <span key={JSON.stringify(traits)} className="avatar-pop flex h-36 w-36 items-end justify-center overflow-hidden rounded-full bg-white">
                <AvatarFace traits={traits} className="h-32 w-32" />
              </span>
            </div>
            <div className="mt-5 space-y-3">
              <TraitRow label="Skin">
                {Object.entries(SKIN).map(([k, c]) => <Swatch key={k} color={c} on={traits.skin === k} label={`${k} skin`} onClick={() => setTraits({ ...traits, skin: k })} />)}
              </TraitRow>
              <TraitRow label="Hair">
                {Object.entries(HAIR).map(([k, c]) => <Swatch key={k} color={c} on={traits.hair_color === k} label={`${k} hair`} onClick={() => setTraits({ ...traits, hair_color: k })} />)}
              </TraitRow>
              <TraitRow label="Style">
                {STYLES.map((k) => <Chip key={k} on={traits.hair_style === k} onClick={() => setTraits({ ...traits, hair_style: k })}>{STYLE_LABEL[k]}</Chip>)}
              </TraitRow>
              <TraitRow label="Top">
                {Object.entries(OUTFIT).map(([k, c]) => <Swatch key={k} color={c} on={traits.outfit === k} label={`${k} top`} onClick={() => setTraits({ ...traits, outfit: k })} />)}
              </TraitRow>
              <TraitRow label="Extras">
                <Chip on={traits.glasses} onClick={() => setTraits({ ...traits, glasses: !traits.glasses })}>Glasses</Chip>
              </TraitRow>
            </div>
          </div>
        )}

        {step === 'language' && (
          <div className="stagger">
            <h1 className={heading}>Which language does {person} hear at home?</h1>
            <p className="mt-3 text-[length:var(--text-body)] text-muted">Words and voices follow it.</p>
            <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-white" role="radiogroup">
              {LANGUAGES.map((l) => (
                <li key={l.code}>
                  <button role="radio" aria-checked={language === l.code} onClick={() => setLanguage(l.code)}
                          className="flex h-14 w-full items-center justify-between px-5 text-left active:bg-canvas">
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
          </div>
        )}

        {step === 'how' && (
          <div className="stagger">
            <h1 className={heading}>How it works</h1>
            {HOW.map((h, i) => (
              <div key={h.title} className="mt-8 flex gap-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-[length:var(--text-title)] font-bold text-white">{i + 1}</span>
                <span>
                  <span className="block text-[length:var(--text-title)] font-bold">{h.title}</span>
                  <span className="mt-1 block leading-relaxed text-muted">{h.body}</span>
                </span>
              </div>
            ))}
            <p className="mt-10 rounded-[16px] border border-line bg-white p-4 text-[length:var(--text-caption)] leading-relaxed text-muted">
              Momentalk is a communication tool. It does not diagnose or give medical advice.
            </p>
          </div>
        )}

        {step === 'ready' && (
          <div className="stagger flex flex-1 flex-col items-center justify-center pb-8 text-center">
            <span className="relative">
              <span className="ready-ring absolute inset-0 rounded-[40px] bg-brand/40" aria-hidden="true" />
              <span className="avatar-pop relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-[40px] bg-white shadow-[0_24px_60px_rgba(20,20,20,0.14)]">
                {avatarUrl
                  ? <img key={avatarUrl} src={avatarUrl} alt={`${person}'s avatar`} className="avatar-pop h-full w-full object-cover" />
                  : <AvatarFace traits={traits} className="mt-6 h-44 w-44" />}
              </span>
            </span>
            {avatarDrawing && !avatarUrl && (
              <span className="mt-4 flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[length:var(--text-caption)] font-bold text-muted">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true" />
                Drawing {person}
              </span>
            )}
            <h1 className={`${heading} mt-8`}>{person}'s world is ready.</h1>
            <p className="mt-3 text-[length:var(--text-body)] leading-relaxed text-muted">Start with the sample moments, or snap the first real one now.</p>
          </div>
        )}
      </main>

      <footer className="px-safe pb-safe mx-auto w-full max-w-md px-6 pt-4">
        {step === 'ready' ? (
          <div className="flex flex-col gap-3">
            <button onClick={() => finish('snap')} className="h-14 rounded-full bg-ink text-[length:var(--text-body)] font-bold text-white active:scale-[0.98]">
              Snap the first moment
            </button>
            <button onClick={() => finish('explore')} className="h-14 rounded-full border border-line bg-white text-[length:var(--text-body)] font-bold active:scale-[0.98]">
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

function TraitRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[length:var(--text-caption)] font-bold text-muted">{label}</span>
      <div className="flex flex-1 flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Swatch({ color, on, label, onClick }: { color: string; on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} aria-label={label}
            className={`h-10 w-10 rounded-full transition active:scale-90 ${on ? 'ring-2 ring-ink ring-offset-2 ring-offset-canvas' : 'ring-1 ring-black/10'}`}
            style={{ background: color }} />
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on}
            className={`h-10 rounded-full border px-3.5 text-[length:var(--text-caption)] font-bold transition active:scale-95 ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted'}`}>
      {children}
    </button>
  )
}
