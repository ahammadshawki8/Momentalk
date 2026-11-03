// Tactile feedback for taps: a short synthesized "pop" plus a tiny vibration where supported.
let ctx: AudioContext | null = null

export function pop(): void {
  try {
    ctx ??= new AudioContext()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(660, t)
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.09)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.13)
  } catch {
    /* audio unavailable */
  }
  if ('vibrate' in navigator) navigator.vibrate?.(12)
}
