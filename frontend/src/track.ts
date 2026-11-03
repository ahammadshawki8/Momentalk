import type { Hotspot, Point } from './api'

/** Longest gap between samples (seconds) before a hotspot counts as out of view. */
const MAX_GAP = 0.35

function lerpPoly(a: Point[], b: Point[], k: number): Point[] {
  if (a.length !== b.length) return k < 0.5 ? a : b
  return a.map(([x, y], i) => [x + (b[i][0] - x) * k, y + (b[i][1] - y) * k])
}

/** Outline of a hotspot at time t. Photos return their static polygons; videos interpolate their track. */
export function polygonsAt(h: Hotspot, t: number | null): Point[][] {
  if (!h.track || h.track.length === 0 || t === null) return h.polygons
  const keys = h.track
  if (t <= keys[0].t) return t >= keys[0].t - MAX_GAP ? [keys[0].poly] : []
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a.t && t <= b.t) {
      if (b.t - a.t > MAX_GAP) return t - a.t < MAX_GAP / 2 ? [a.poly] : []
      return [lerpPoly(a.poly, b.poly, (t - a.t) / (b.t - a.t))]
    }
  }
  const last = keys[keys.length - 1]
  return t - last.t < MAX_GAP ? [last.poly] : []
}
