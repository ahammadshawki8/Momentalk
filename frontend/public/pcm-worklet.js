// Converts mic audio to 16-bit PCM chunks of about 100 ms and posts them to the main thread.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Int16Array(1600)
    this.length = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]))
        this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff
        if (this.length === this.buffer.length) {
          this.port.postMessage(this.buffer.slice(0).buffer, [])
          this.length = 0
        }
      }
    }
    return true
  }
}

registerProcessor('pcm-worklet', PcmWorklet)
