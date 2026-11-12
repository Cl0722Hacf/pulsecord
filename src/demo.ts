import { ac } from './sfx'
export interface DemoFriend { id: string; name: string; color: string; avatar: string; freq: number }
export const FRIENDS: DemoFriend[] = [
  { id: 'demo-luna', name: 'Luna', color: '#f472b6', avatar: '🦊', freq: 220 },
  { id: 'demo-kai', name: 'Kai', color: '#38bdf8', avatar: '🐺', freq: 262 },
  { id: 'demo-nova', name: 'Nova', color: '#a78bfa', avatar: '🚀', freq: 330 },
  { id: 'demo-rex', name: 'Rex', color: '#4ade80', avatar: '🦖', freq: 196 },
]
export const SCRIPT: { at: number; who: number; text: string }[] = [
  { at: 800, who: 0, text: '¡Ya llegué! 🎮 ¿Jugamos algo?' },
  { at: 3500, who: 1, text: 'Dale, yo creo la partida' },
  { at: 6500, who: 2, text: 'Les paso mi pantalla para ver el clip 👀' },
  { at: 10000, who: 3, text: 'Jajaja qué bueno 😂 mándalo a #clips-y-links' },
  { at: 14000, who: 0, text: 'Pruébenme el volumen individual, Rex habla muy fuerte' },
]
// Habla simulada: cada amigo alterna turnos con pequeñas ráfagas, como una voz real
export function demoSpeaking(id: string, now: number): boolean {
  const i = FRIENDS.findIndex((f) => f.id === id)
  const phase = (now / 1000 + i * 2.7) % 10
  return phase < 3.2 && Math.sin(now / 140 + i * 1.7) > -0.35
}
export function makeScreen(): { stream: MediaStream; stop: () => void } {
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  const V: [number, number, number][] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  const draw = () => {
    const t = performance.now() / 1000
    const bg = g.createLinearGradient(0, 0, 1280, 720); bg.addColorStop(0, '#0f0c29'); bg.addColorStop(1, '#302b63')
    g.fillStyle = bg; g.fillRect(0, 0, 1280, 720)
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1
    for (let x = (t * 30) % 60; x < 1280; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 720); g.stroke() }
    for (let y = 0; y < 720; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(1280, y); g.stroke() }
    const P = V.map(([x, y, z]) => {
      const a = t * 0.9, b = t * 0.6
      const x1 = x * Math.cos(a) - z * Math.sin(a), z1 = x * Math.sin(a) + z * Math.cos(a)
      const y1 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b)
      const s = 260 / (4 - z2)
      return [640 + x1 * s * 1.6, 380 + y1 * s * 1.6] as [number, number]
    })
    g.strokeStyle = '#7dd3fc'; g.lineWidth = 4; g.shadowColor = '#38bdf8'; g.shadowBlur = 18
    E.forEach(([a, b]) => { g.beginPath(); g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); g.stroke() })
    g.shadowBlur = 0
    g.fillStyle = '#fff'; g.font = 'bold 34px system-ui, sans-serif'; g.fillText('🚀 Nova — pantalla compartida (demo 3D)', 40, 70)
    g.font = '24px system-ui, sans-serif'; g.fillStyle = '#c4b5fd'; g.fillText(new Date().toLocaleTimeString() + '  ·  ' + Math.round(30) + ' FPS simulados', 40, 110)
  }
  draw()
  const timer = setInterval(draw, 33)
  const stream = cv.captureStream(30)
  return { stream, stop: () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()) } }
}
// Voz sintética de cada amigo virtual (tono suave que solo suena cuando "habla"), controlable con su volumen individual
export function startDemoAudio() {
  const c = ac()
  const nodes = new Map<string, { gate: GainNode; vol: GainNode; osc: OscillatorNode; lfo: OscillatorNode }>()
  FRIENDS.forEach((f) => {
    const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f.freq
    const lfo = c.createOscillator(); lfo.frequency.value = 5 + Math.random() * 3
    const lg = c.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(osc.frequency)
    const gate = c.createGain(); gate.gain.value = 0
    const vol = c.createGain(); vol.gain.value = 1
    osc.connect(gate); gate.connect(vol); vol.connect(c.destination); osc.start(); lfo.start()
    nodes.set(f.id, { gate, vol, osc, lfo })
  })
  return {
    gate: (id: string, on: boolean) => { const n = nodes.get(id); if (n) n.gate.gain.setTargetAtTime(on ? 0.05 : 0, c.currentTime, 0.04) },
    setVol: (id: string, v: number) => { const n = nodes.get(id); if (n) n.vol.gain.value = v },
    stop: () => nodes.forEach((n) => { try { n.osc.stop(); n.lfo.stop(); n.vol.disconnect() } catch { /* ya detenido */ } }),
  }
}
