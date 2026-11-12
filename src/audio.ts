import { ac } from './sfx'
export interface Tap { level: () => number; setVol: (v: number) => void; stop: () => void }
// Analiza un MediaStream (detector de voz) y, si play=true, lo reproduce con un GainNode (volumen individual 0-200 %).
export function tapStream(stream: MediaStream, play: boolean): Tap {
  const c = ac()
  const src = c.createMediaStreamSource(stream)
  const an = c.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.4
  src.connect(an)
  let gain: GainNode | null = null
  let el: HTMLAudioElement | null = null
  if (play) {
    gain = c.createGain(); src.connect(gain); gain.connect(c.destination)
    // Chrome solo entrega audio remoto a WebAudio si el stream también está enlazado a un elemento multimedia
    el = new Audio(); el.srcObject = stream; el.muted = true; void el.play().catch(() => undefined)
  }
  const buf = new Uint8Array(an.fftSize)
  return {
    level: () => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v } return Math.sqrt(s / buf.length) },
    setVol: (v: number) => { if (gain) gain.gain.value = v },
    stop: () => { try { src.disconnect(); an.disconnect(); if (gain) gain.disconnect() } catch { /* ya desconectado */ } if (el) el.srcObject = null },
  }
}
