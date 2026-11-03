import { useEffect, useState } from 'react'

export interface MomentColor {
  accent: string
  accentInk: string
}

const FALLBACK: MomentColor = { accent: '#ffc95c', accentInk: '#15171a' }
const cache = new Map<string, MomentColor>()

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Picks the most present vivid hue in a photo and turns it into a bright, friendly accent. */
export function extractMomentColor(img: HTMLImageElement): MomentColor {
  const canvas = document.createElement('canvas')
  canvas.width = 40
  canvas.height = 40
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return FALLBACK
  ctx.drawImage(img, 0, 0, 40, 40)
  const data = ctx.getImageData(0, 0, 40, 40).data
  const bins = new Map<number, { weight: number; h: number; s: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (s < 0.28 || l < 0.18 || l > 0.85) continue
    const bin = Math.round(h / 20) % 18
    const entry = bins.get(bin) ?? { weight: 0, h: 0, s: 0 }
    const w = s * (1 - Math.abs(l - 0.55))
    entry.weight += w
    entry.h += h * w
    entry.s += s * w
    bins.set(bin, entry)
  }
  let best: { weight: number; h: number; s: number } | null = null
  for (const entry of bins.values()) if (!best || entry.weight > best.weight) best = entry
  if (!best || best.weight < 4) return FALLBACK
  const hue = best.h / best.weight
  const sat = Math.min(0.92, Math.max(0.6, best.s / best.weight + 0.15))
  // Light, juicy tone so dark ink text always reads on it.
  return { accent: hslToHex(hue, sat, 0.68), accentInk: '#15171a' }
}

export function useMomentColor(src: string | undefined): MomentColor {
  const [color, setColor] = useState<MomentColor>(() => (src && cache.get(src)) || FALLBACK)
  useEffect(() => {
    if (!src) return
    const cached = cache.get(src)
    if (cached) {
      setColor(cached)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = extractMomentColor(img)
        cache.set(src, c)
        setColor(c)
      } catch {
        setColor(FALLBACK)
      }
    }
    img.src = src
  }, [src])
  return color
}

export const accentStyle = (c: MomentColor) =>
  ({ '--accent': c.accent, '--accent-ink': c.accentInk }) as React.CSSProperties
