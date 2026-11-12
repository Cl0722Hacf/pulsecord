let ctx: AudioContext | null = null
export const ac = (): AudioContext => {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new C()
  }
  return ctx
}
export const resumeAudio = () => { const c = ac(); if (c.state === 'suspended') void c.resume() }
const tone = (f: number, t0: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) => {
  const c = ac(); const o = c.createOscillator(); const g = c.createGain(); const t = c.currentTime + t0
  o.type = type; o.frequency.setValueAtTime(f, t)
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02)
}
export type Sfx = 'join' | 'leave' | 'mute' | 'unmute' | 'deaf' | 'share' | 'msg'
export const sfx = (k: Sfx) => {
  try {
    resumeAudio()
    if (k === 'join') { tone(523, 0, 0.12); tone(784, 0.1, 0.18) }
    else if (k === 'leave') { tone(784, 0, 0.12); tone(440, 0.1, 0.2) }
    else if (k === 'mute') tone(300, 0, 0.12, 'triangle')
    else if (k === 'unmute') tone(620, 0, 0.1, 'triangle')
    else if (k === 'deaf') { tone(360, 0, 0.1, 'square', 0.06); tone(240, 0.09, 0.14, 'square', 0.06) }
    else if (k === 'share') { tone(440, 0, 0.1); tone(554, 0.09, 0.1); tone(659, 0.18, 0.16) }
    else tone(880, 0, 0.07, 'sine', 0.05)
  } catch { /* sin audio disponible */ }
}
