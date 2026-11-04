/**
 * Per device preferences. Kept in the browser so each judge on the shared live demo gets their
 * own onboarding and name, without changing it for anyone else. Storage can be unavailable
 * (private windows), so every access is guarded and defaults always work.
 */
import { DEFAULT_TRAITS, type AvatarTraits } from './components/Avatar'

export interface LocalPrefs {
  onboarded: boolean
  personName: string
  language: string
  /** Described look; id and url once Muse Image has drawn it. */
  avatar: { traits: AvatarTraits; id?: string; url?: string }
}

const KEY = 'momentalk.prefs'
const DEFAULTS: LocalPrefs = { onboarded: false, personName: 'Maya', language: 'en', avatar: { traits: DEFAULT_TRAITS } }

export function loadLocalPrefs(): LocalPrefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Forget this device's profile (after the server side is deleted) and start fresh. */
export function resetLocalPrefs(): LocalPrefs {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: nothing stored to remove */
  }
  return { ...DEFAULTS, avatar: { traits: { ...DEFAULTS.avatar.traits } } }
}

export function saveLocalPrefs(prefs: LocalPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage blocked: preferences last for this visit only */
  }
}

export const LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'fr', name: 'French', native: 'Français' },
]
