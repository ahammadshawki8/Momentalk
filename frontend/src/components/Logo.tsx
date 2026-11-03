/** A photo frame whose corner becomes a speech tail: a moment that talks. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M8 4h16a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H13l-6 5v-5.3A4 4 0 0 1 4 20V8a4 4 0 0 1 4-4Z" fill="currentColor" />
      <circle cx="21" cy="10.5" r="2.6" fill="var(--accent)" />
      <path d="M8 19.5l4.5-5.5 3.5 4 2.5-2.5 4 4" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${className}`}>
      <LogoMark />
      <span className="text-xl font-bold tracking-tight">Momentalk</span>
    </span>
  )
}
