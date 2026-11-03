import { useState } from 'react'
import { api, type Health, type Prefs } from '../api'

const LANGUAGES = [
  ['en', 'English'], ['es', 'Spanish'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ar', 'Arabic'], ['fr', 'French'],
] as const

interface SettingsSheetProps {
  prefs: Prefs
  health: Health | null
  onClose: () => void
  onSaved: (p: Prefs) => void
}

/** Who the board is for, which language it speaks, and where the AI runs. */
export function SettingsSheet({ prefs, health, onClose, onSaved }: SettingsSheetProps) {
  const [draft, setDraft] = useState(prefs)
  const [error, setError] = useState<string | null>(null)
  const openAvailable = !!health?.open_weights_available

  async function save() {
    setError(null)
    try {
      onSaved(await api.updatePrefs(draft))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="rise max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:rounded-[28px] sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <h2 id="settings-title" className="text-2xl font-bold">Settings</h2>

        <label className="mt-5 flex flex-col gap-1.5 text-sm text-muted">
          Who is this board for?
          <input value={draft.person_name} onChange={(e) => setDraft({ ...draft, person_name: e.target.value })}
                 className="rounded-xl border border-line px-3.5 py-2.5 text-lg font-bold text-ink" />
        </label>

        <label className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
          Language for words and voice
          <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                  className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-lg text-ink">
            {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>

        <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl bg-canvas p-4">
          <div>
            <span className="block font-bold">Private Mode</span>
            <span className="block text-sm text-muted">
              {openAvailable
                ? 'Photos are understood by Muse Spark Open, an open weights model on partner inference.'
                : 'Needs an open weights partner key. Ask your admin to set OPEN_WEIGHTS_API_KEY.'}
            </span>
          </div>
          <button
            role="switch"
            aria-checked={draft.private_mode}
            disabled={!openAvailable}
            onClick={() => setDraft({ ...draft, private_mode: !draft.private_mode })}
            className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-40 ${draft.private_mode ? 'bg-ink' : 'bg-line'}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${draft.private_mode ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="h-12 rounded-full px-5 font-bold text-muted">Cancel</button>
          <button onClick={() => void save()} className="h-12 rounded-full bg-ink px-7 font-bold text-white active:scale-95">Save</button>
        </div>
      </div>
    </div>
  )
}
