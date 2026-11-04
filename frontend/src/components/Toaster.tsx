import { useEffect, useState } from 'react'
import { onToast } from '../toast'

/** Shows one notice at a time above the tab bar, then fades it away. */
export function Toaster() {
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null)

  useEffect(() => onToast((text) => setMessage({ text, key: Date.now() })), [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-6" role="status" aria-live="polite">
      <p key={message.key} className="rise max-w-sm rounded-[16px] bg-ink px-4 py-3 text-center text-[length:var(--text-caption)] font-bold leading-relaxed text-white shadow-[0_12px_30px_rgba(20,20,20,0.3)]">
        {message.text}
      </p>
    </div>
  )
}
