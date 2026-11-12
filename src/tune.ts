export type ScreenMode = '720' | '1080' | '720-30'
type Callish = { peerConnection?: RTCPeerConnection }
let mode: ScreenMode = '720'
export const setScreenMode = (m: ScreenMode) => { mode = m }
const cfg = () => (mode === '1080' ? { br: 4000000, fps: 60 } : mode === '720-30' ? { br: 2500000, fps: 30 } : { br: 2500000, fps: 60 })

/** Pone VP8 y luego H264 al principio de la lista de codecs de video del SDP (codifican rapido por hardware). */
export function preferFastCodecs(sdp: string): string {
  try {
    const lines = sdp.split('\r\n')
    const i = lines.findIndex((l) => l.startsWith('m=video'))
    if (i < 0) return sdp
    let end = lines.findIndex((l, k) => k > i && l.startsWith('m='))
    if (end < 0) end = lines.length
    const pts = (name: string) => lines.slice(i, end).map((l) => l.match(new RegExp('^a=rtpmap:(\\d+) ' + name + '/'))?.[1]).filter((x): x is string => !!x)
    const first = [...pts('VP8'), ...pts('H264')]
    const parts = lines[i].split(' ')
    const head = parts.slice(0, 3), rest = parts.slice(3)
    lines[i] = [...head, ...first.filter((p) => rest.includes(p)), ...rest.filter((p) => !first.includes(p))].join(' ')
    return lines.join('\r\n')
  } catch { return sdp }
}

async function tuneOnce(pc: RTCPeerConnection) {
  const { br, fps } = cfg()
  for (const s of pc.getSenders()) {
    if (s.track?.kind !== 'video') continue
    try {
      const p = s.getParameters() as RTCRtpSendParameters & { degradationPreference?: string }
      if (!p.encodings || !p.encodings.length) p.encodings = [{}]
      p.degradationPreference = 'maintain-framerate'
      p.encodings[0].maxBitrate = br
      p.encodings[0].maxFramerate = fps
      await s.setParameters(p)
    } catch { /* el navegador no admite alguno de los ajustes */ }
  }
  try {
    const caps = RTCRtpSender.getCapabilities?.('video')
    if (caps) {
      const rank = (c: { mimeType: string }) => (/VP8/i.test(c.mimeType) ? 0 : /H264/i.test(c.mimeType) ? 1 : 2)
      const sorted = [...caps.codecs].sort((a, b) => rank(a) - rank(b))
      for (const t of pc.getTransceivers()) if (t.sender.track?.kind === 'video' && 'setCodecPreferences' in t) t.setCodecPreferences(sorted)
    }
  } catch { /* sin soporte */ }
}

/** Reaplica el ajuste durante unos segundos: la conexion se negocia de forma asincrona. */
export function tuneCall(call: Callish) {
  let n = 0
  const id = window.setInterval(() => {
    n++
    if (call.peerConnection) void tuneOnce(call.peerConnection)
    if (n >= 12) window.clearInterval(id)
  }, 1000)
}
