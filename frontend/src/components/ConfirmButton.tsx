import { useEffect, useState, type ReactNode } from 'react'
import { errorText, toast } from '../toast'

interface ConfirmButtonProps {
  onConfirm: () => Promise<void>
  children: ReactNode
  /** What the button says once armed, for example "Tap again to delete". */
  confirmLabel: ReactNode
  label: string
  className: string
  armedClassName: string
}

/** Destructive actions take two taps: the first arms the button for a few seconds, the second does it. */
export function ConfirmButton({ onConfirm, children, confirmLabel, label, className, armedClassName }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 3500)
    return () => window.clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      aria-label={armed ? `Confirm: ${label}` : label}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation()
        if (!armed) {
          setArmed(true)
          return
        }
        setBusy(true)
        try {
          await onConfirm()
        } catch (err) {
          toast(errorText(err))
        } finally {
          setBusy(false)
          setArmed(false)
        }
      }}
      className={`transition active:scale-95 disabled:opacity-60 ${armed ? armedClassName : className}`}
    >
      {busy ? <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : armed ? confirmLabel : children}
    </button>
  )
}
