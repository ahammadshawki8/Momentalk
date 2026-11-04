import { useCallback, useEffect, useRef, useState } from 'react'
import type { HeardPulse } from './components/SceneCanvas'

export type LiveState = 'idle' | 'connecting' | 'listening' | 'offline' | 'error'

/** Streams the caregiver's mic to the backend and returns hotspot pulses for words that were heard. */
export function useLiveModeling(sceneId: string | null) {
  const [state, setState] = useState<LiveState>('idle')
  const [caption, setCaption] = useState('')
  const [heard, setHeard] = useState<HeardPulse[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null)
  const pulseKey = useRef(0)

  const stop = useCallback(() => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'stop' }))
    socket.current?.close()
    socket.current = null
    audio.current?.stream.getTracks().forEach((t) => t.stop())
    void audio.current?.ctx.close()
    audio.current = null
    setState('idle')
  }, [])

  const start = useCallback(async () => {
    if (!sceneId) return
    setMessage(null)
    setState('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/live/${sceneId}`)
    ws.binaryType = 'arraybuffer'
    socket.current = ws

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string)
      if (data.type === 'status') {
        setState(data.state === 'listening' ? 'listening' : 'offline')
        if (data.message) setMessage(data.message)
      } else if (data.type === 'transcript') {
        setCaption(data.text)
      } else if (data.type === 'heard') {
        const pulses = (data.hotspot_ids as string[]).map((hotspotId) => ({ hotspotId, key: ++pulseKey.current }))
        setHeard((prev) => [...prev.filter((p) => !pulses.some((n) => n.hotspotId === p.hotspotId)), ...pulses])
        // Clear after the animation so a chip does not reappear on re-render.
        window.setTimeout(() => setHeard((prev) => prev.filter((p) => !pulses.some((n) => n.key === p.key))), 2700)
      } else if (data.type === 'error') {
        setMessage(data.message)
        setState('error')
      }
    }
    ws.onclose = () => setState((s) => (s === 'error' ? s : 'idle'))

    await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve(), { once: true }))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const ctx = new AudioContext({ sampleRate: 16000 })
      await ctx.audioWorklet.addModule('/pcm-worklet.js')
      const node = new AudioWorkletNode(ctx, 'pcm-worklet')
      node.port.onmessage = (e) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data as ArrayBuffer)
      }
      ctx.createMediaStreamSource(stream).connect(node)
      audio.current = { ctx, stream }
    } catch {
      setMessage('Microphone is blocked. Allow microphone access to use Live Modeling.')
      setState('error')
    }
  }, [sceneId])

  /** Feed a typed phrase through the same matcher (testing and demos without a mic). */
  const say = useCallback((text: string) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'say', text }))
  }, [])

  useEffect(() => stop, [sceneId, stop])

  // Dev only: lets automated checks send a typed phrase through the real live pipeline.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __momentalkSay?: (t: string) => void }
    w.__momentalkSay = say
    return () => {
      delete w.__momentalkSay
    }
  }, [say])

  return { state, caption, heard, message, start, stop, say }
}
