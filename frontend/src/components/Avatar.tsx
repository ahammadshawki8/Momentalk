/** The person's look, described (never photographed). Drawn instantly here, then by Muse Image for wishes. */
export interface AvatarTraits {
  skin: string
  hair_color: string
  hair_style: string
  glasses: boolean
  outfit: string
}

export const DEFAULT_TRAITS: AvatarTraits = { skin: 'medium', hair_color: 'black', hair_style: 'short', glasses: false, outfit: 'yellow' }

export const SKIN: Record<string, string> = { light: '#f7d9c6', fair: '#eebc98', medium: '#c98e66', tan: '#a6704b', deep: '#6b4530' }
export const HAIR: Record<string, string> = { black: '#2a2420', brown: '#6b4428', blond: '#e2b65e', red: '#b5522e', gray: '#bdb7ae' }
export const OUTFIT: Record<string, string> = { yellow: '#ffc24b', red: '#f0644a', blue: '#4a8bf0', green: '#5cb87a', purple: '#9a6cf0' }
export const STYLES = ['short', 'curly', 'long', 'ponytail', 'bun'] as const

export function AvatarFace({ traits, className = 'h-32 w-32' }: { traits: AvatarTraits; className?: string }) {
  const skin = SKIN[traits.skin] ?? SKIN.medium
  const hair = HAIR[traits.hair_color] ?? HAIR.black
  const top = OUTFIT[traits.outfit] ?? OUTFIT.yellow
  const style = traits.hair_style
  const cap = 'M29 58C29 32 44 23 60 23C78 23 92 34 91 58C85 45 73 40 60 42C47 40 35 46 29 58Z'

  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden="true">
      {style === 'long' && <path d="M27 58C25 40 40 22 60 22C80 22 95 40 93 58L96 104C80 110 40 110 24 104Z" fill={hair} />}
      <path d="M18 140C18 108 38 97 60 97C82 97 102 108 102 140Z" fill={top} />
      <path d="M48 99Q60 108 72 99" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      <rect x="52" y="82" width="16" height="18" rx="6" fill={skin} />
      <circle cx="30" cy="62" r="6.5" fill={skin} />
      <circle cx="90" cy="62" r="6.5" fill={skin} />
      <circle cx="60" cy="60" r="30" fill={skin} />
      {style === 'ponytail' && <><circle cx="94" cy="40" r="11" fill={hair} /><circle cx="86" cy="44" r="3.5" fill={top} /></>}
      {style === 'bun' && <><circle cx="35" cy="28" r="11" fill={hair} /><circle cx="85" cy="28" r="11" fill={hair} /></>}
      {style === 'curly'
        ? [[34, 46, 10], [42, 34, 11], [55, 28, 12], [69, 28, 12], [81, 35, 11], [88, 47, 10]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={hair} />)
        : <path d={cap} fill={hair} />}
      <ellipse cx="49" cy="62" rx="3.6" ry="4.6" fill="#141414" />
      <ellipse cx="71" cy="62" rx="3.6" ry="4.6" fill="#141414" />
      <circle cx="50.3" cy="60.4" r="1.2" fill="#fff" />
      <circle cx="72.3" cy="60.4" r="1.2" fill="#fff" />
      <circle cx="41" cy="72" r="4.5" fill="#ff7a66" opacity="0.35" />
      <circle cx="79" cy="72" r="4.5" fill="#ff7a66" opacity="0.35" />
      <path d="M52 74q8 7 16 0" fill="none" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
      {traits.glasses && (
        <g fill="none" stroke="#141414" strokeWidth="2.4">
          <circle cx="49" cy="62" r="8.5" />
          <circle cx="71" cy="62" r="8.5" />
          <path d="M57.5 62h5" />
        </g>
      )}
    </svg>
  )
}
