import { useState } from 'react'
import { api, type Health, type Prefs } from '../api'
import { LANGUAGES, type LocalPrefs } from '../localPrefs'

interface SettingsSheetProps {
  local: LocalPrefs
  prefs: Prefs | null
  health: Health | null
  onClose: () => void
  onSaved: (local: LocalPrefs, prefs: Prefs | null) => void
  onDeleteProfile: () => Promise<void>
}

const groupLabel = 'mb-2 px-1 text-[length:var(--text-caption)] font-bold text-muted'

const Check = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

const Chevron = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 text-faint" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 5 7 7-7 7" />
  </svg>
)

/** Compact bottom sheet: profile, privacy, and a guarded delete. Languages open in their own view. */
export function SettingsSheet({ local, prefs, health, onClose, onSaved, onDeleteProfile }: SettingsSheetProps) {
  const [name, setName] = useState(local.personName)
  const [language, setLanguage] = useState(local.language)
  const [privateMode, setPrivateMode] = useState(!!prefs?.private_mode)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [view, setView] = useState<'main' | 'language'>('main')
  const openAvailable = !!health?.open_weights_available
  const shared = !health?.public
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0]

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

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      await onDeleteProfile()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="rise max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-canvas px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:rounded-[28px] sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />

        {view === 'language' ? (
          <div key="language" className="slide-next">
            <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center">
              <button onClick={() => setView('main')} className="h-11 justify-self-start px-1 font-bold text-muted">Back</button>
              <h2 id="settings-title" className="text-[length:var(--text-body)] font-bold">Language</h2>
              <span />
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-[16px] bg-white" role="radiogroup">
              {LANGUAGES.map((l) => (
                <li key={l.code}>
                  <button
                    role="radio"
                    aria-checked={language === l.code}
                    onClick={() => {
                      setLanguage(l.code)
                      setView('main')
                    }}
                    className="flex h-12 w-full items-center justify-between px-4 text-left active:bg-canvas"
                  >
                    <span>
                      {l.name}
                      {l.native !== l.name && <span className="ml-2 text-muted">{l.native}</span>}
                    </span>
                    {language === l.code && <Check />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div key="main">
            <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center">
              <button onClick={onClose} className="h-11 justify-self-start px-1 font-bold text-muted">Cancel</button>
              <h2 id="settings-title" className="text-[length:var(--text-body)] font-bold">Settings</h2>
              <button onClick={() => void save()} className="h-11 justify-self-end px-1 font-bold text-ink">Done</button>
            </div>

            <p className={groupLabel}>Profile</p>
            <div className="divide-y divide-line overflow-hidden rounded-[16px] bg-white">
              <label className="flex h-14 items-center gap-3 px-4">
                <span className="w-24 shrink-0 text-muted">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-label="First name"
                       className="min-w-0 flex-1 bg-transparent text-right text-[length:var(--text-body)] font-bold outline-none" />
              </label>
              <button onClick={() => setView('language')} className="flex h-14 w-full items-center gap-3 px-4 text-left active:bg-canvas">
                <span className="w-24 shrink-0 text-muted">Language</span>
                <span className="min-w-0 flex-1 text-right font-bold">{current.name}</span>
                <Chevron />
              </button>
            </div>

            <p className={`${groupLabel} mt-6`}>Privacy</p>
            <div className="flex items-center justify-between gap-4 rounded-[16px] bg-white px-4 py-3">
              <span className="min-w-0">
                <span className="block font-bold">Private Mode</span>
                <span className="block text-[length:var(--text-caption)] text-muted">
                  {!shared ? 'Not available in the public demo' : openAvailable ? 'Muse Spark Open on partner inference' : 'Needs an open weights partner key'}
                </span>
              </span>
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

            <div className="mt-6">
              {confirmDelete ? (
                <div className="rise rounded-[16px] border-2 border-danger/30 bg-white p-4" role="alertdialog" aria-labelledby="delete-title">
                  <p id="delete-title" className="font-bold text-danger">Delete {local.personName}'s profile?</p>
                  <p className="mt-1 text-[length:var(--text-caption)] leading-relaxed text-muted">
                    {local.personName}'s moments, words, drafts and avatar are deleted for good. Sample moments stay.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="h-12 flex-1 rounded-full bg-canvas font-bold active:scale-[0.98]">
                      Keep it
                    </button>
                    <button
                      disabled={deleting}
                      onClick={() => void remove()}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-danger font-bold text-white active:scale-[0.98] disabled:opacity-60"
                    >
                      {deleting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="h-12 w-full rounded-[16px] bg-white font-bold text-danger active:bg-line">
                  Delete profile and start over
                </button>
              )}
            </div>
            <p className="mt-5 text-center text-[length:var(--text-caption)] text-faint">A communication tool, not a medical product.</p>
            {error && <p className="mt-3 text-center text-[length:var(--text-caption)] text-danger">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
