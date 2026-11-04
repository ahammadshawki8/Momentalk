import { useState } from 'react'
import { api, type Health, type Prefs } from '../api'
import { LANGUAGES, type LocalPrefs } from '../localPrefs'

interface SettingsSheetProps {
  local: LocalPrefs
  prefs: Prefs | null
  health: Health | null
  onClose: () => void
  onSaved: (local: LocalPrefs, prefs: Prefs | null) => void
  onRestartOnboarding: () => void
}

/** Grouped list in a bottom sheet: who it is for, the language, and where the AI runs. */
export function SettingsSheet({ local, prefs, health, onClose, onSaved, onRestartOnboarding }: SettingsSheetProps) {
  const [name, setName] = useState(local.personName)
  const [language, setLanguage] = useState(local.language)
  const [privateMode, setPrivateMode] = useState(!!prefs?.private_mode)
  const [error, setError] = useState<string | null>(null)
  const openAvailable = !!health?.open_weights_available
  const shared = !health?.public

  async function save() {
    setError(null)
    const nextLocal = { ...local, personName: name.trim() || local.personName, language }
    let nextPrefs = prefs
    try {
      if (shared && prefs) {
        nextPrefs = await api.updatePrefs({ person_name: nextLocal.personName, language, private_mode: privateMode })
      }
      onSaved(nextLocal, nextPrefs)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const groupLabel = 'mb-2 px-1 text-[length:var(--text-caption)] font-bold text-muted'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="rise max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-canvas px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:rounded-[28px] sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="mb-6 flex items-center justify-between">
          <button onClick={onClose} className="h-11 px-1 font-bold text-muted">Cancel</button>
          <h2 id="settings-title" className="text-[length:var(--text-body)] font-bold">Settings</h2>
          <button onClick={() => void save()} className="h-11 px-1 font-bold text-ink">Done</button>
        </div>

        <p className={groupLabel}>Who is this for</p>
        <label className="block rounded-[16px] bg-white px-4">
          <span className="sr-only">First name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24}
                 className="h-14 w-full bg-transparent text-[length:var(--text-body)] font-bold outline-none" />
        </label>

        <p className={`${groupLabel} mt-7`}>Language for words and voice</p>
        <ul className="divide-y divide-line overflow-hidden rounded-[16px] bg-white" role="radiogroup">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button role="radio" aria-checked={language === l.code} onClick={() => setLanguage(l.code)}
                      className="flex h-12 w-full items-center justify-between px-4 text-left active:bg-canvas">
                <span>
                  {l.name}
                  {l.native !== l.name && <span className="ml-2 text-muted">{l.native}</span>}
                </span>
                {language === l.code && (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>

        <p className={`${groupLabel} mt-7`}>Privacy</p>
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-white p-4">
          <div>
            <span className="block font-bold">Private Mode</span>
            <span className="mt-0.5 block text-[length:var(--text-caption)] leading-relaxed text-muted">
              {!shared
                ? 'Not available in the public demo.'
                : openAvailable
                  ? 'Photos are understood by Muse Spark Open, an open weights model on partner inference.'
                  : 'Needs an open weights partner key (OPEN_WEIGHTS_API_KEY).'}
            </span>
          </div>
          <button
            role="switch"
            aria-checked={privateMode}
            aria-label="Private Mode"
            disabled={!openAvailable || !shared}
            onClick={() => setPrivateMode(!privateMode)}
            className={`relative h-8 w-[52px] shrink-0 rounded-full transition disabled:opacity-40 ${privateMode ? 'bg-ink' : 'bg-line'}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${privateMode ? 'left-[24px]' : 'left-1'}`} />
          </button>
        </div>

        <button onClick={onRestartOnboarding} className="mt-7 h-12 w-full rounded-[16px] bg-white font-bold text-muted active:bg-line">
          Show the welcome again
        </button>
        <p className="mt-6 px-1 text-center text-[length:var(--text-caption)] leading-relaxed text-faint">
          Momentalk is a communication tool, not a medical product.
        </p>
        {error && <p className="mt-3 text-center text-[length:var(--text-caption)] text-danger">{error}</p>}
      </div>
    </div>
  )
}
