/** A tiny app wide notice, for actions that could not be done (for example sample moments in the live demo). */
type Listener = (message: string) => void

const listeners = new Set<Listener>()

export function toast(message: string): void {
  listeners.forEach((listener) => listener(message))
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
