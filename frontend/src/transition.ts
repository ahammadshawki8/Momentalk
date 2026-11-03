import { flushSync } from 'react-dom'

/** Runs a state change inside a View Transition when the browser supports it. */
export function withTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  doc.startViewTransition(() => flushSync(update))
}
