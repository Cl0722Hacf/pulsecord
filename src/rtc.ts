import { preferFastCodecs, tuneCall } from './tune'
import Peer from 'peerjs'
import type { DataConnection, MediaConnection } from 'peerjs'
import type { Kind, Msg, Person, Profile } from './types'

const SLOTS = 8
const OPTS = {
  host: '0.peerjs.com', port: 443, secure: true, path: '/', debug: 0,
  config: { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ] },
}

type Wire =
  | ({ t: 'hello' } & Profile & { mic: boolean; deaf: boolean; vroom: string })
  | { t: 'state'; mic: boolean; deaf: boolean; vroom: string }
  | { t: 'chat'; msg: Msg }
  | { t: 'react'; emoji: string }

interface RoomState { mic: boolean; deaf: boolean; vroom: string }
export interface RoomEvents {
  onPeer: (id: string, p: Partial<Person>) => void
  onLeave: (id: string) => void
  onStream: (id: string, kind: Kind, s: MediaStream | null) => void
  onChat: (m: Msg) => void
  onReact: (id: string, emoji: string) => void
  onStatus: (s: string) => void
}

// Malla P2P: cada amigo ocupa un "slot" (pulsecord-CODIGO-N) en el broker público 0.peerjs.com y se conecta con todos los demás.
export class Room {
  code: string
  profile: Profile
  ev: RoomEvents
  peer: Peer | null = null
  myId = ''
  conns = new Map<string, DataConnection>()
  calls = new Map<string, MediaConnection>()
  sent = new Set<string>()
  seen = new Set<string>()
  local: Partial<Record<Kind, MediaStream>> = {}
  state: RoomState = { mic: true, deaf: false, vroom: 'general' }
  bc: BroadcastChannel | null = null
  closed = false

  constructor(code: string, profile: Profile, ev: RoomEvents) { this.code = code; this.profile = profile; this.ev = ev }

  pid(slot: number) { return 'pulsecord-' + this.code.toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + slot }

  async start(): Promise<void> {
    try {
      this.bc = new BroadcastChannel('pulsecord-' + this.code)
      this.bc.onmessage = (e: MessageEvent) => { const m = e.data as Wire; if (m && m.t === 'chat') this.handleChat(m.msg) }
    } catch { this.bc = null }
    for (let s = 0; s < SLOTS && !this.myId; s++) {
      try { await this.claim(s) } catch (e) { if (e === 'taken') continue; throw e }
    }
    if (!this.myId) throw new Error('La sala está llena (máximo 8 amigos)')
    for (let s = 0; s < SLOTS; s++) { const id = this.pid(s); if (id !== this.myId) this.connectTo(id) }
  }

  private claim(slot: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = this.pid(slot)
      const p = new Peer(id, OPTS)
      const timer = setTimeout(() => { p.destroy(); reject(new Error('No se pudo contactar al servidor de señalización (0.peerjs.com)')) }, 12000)
      const onErr = (err: { type?: string }) => {
        clearTimeout(timer); p.destroy()
        if (err.type === 'unavailable-id') reject('taken'); else reject(new Error('Error de conexión: ' + (err.type || 'desconocido')))
      }
      p.on('error', onErr)
      p.on('open', () => { clearTimeout(timer); p.off('error', onErr); this.peer = p; this.myId = id; this.wire(p); resolve() })
    })
  }

  private wire(p: Peer) {
    p.on('connection', (c) => this.setupConn(c, false))
    p.on('call', (call) => { const k = ((call.metadata as { kind?: Kind } | undefined)?.kind) || 'voice'; call.answer(); this.trackCall(call, k, false) })
    p.on('error', (err: { type?: string }) => { if (err.type !== 'peer-unavailable') this.ev.onStatus('Error de red: ' + (err.type || '?')) })
    p.on('disconnected', () => { if (!this.closed) { this.ev.onStatus('Reconectando con el servidor…'); try { p.reconnect() } catch { /* reintento en la siguiente */ } } })
  }

  private connectTo(id: string) {
    if (!this.peer || this.conns.has(id)) return
    const c = this.peer.connect(id, { reliable: true })
    this.setupConn(c, true)
    setTimeout(() => { if (!c.open) c.close() }, 15000)
  }

  private setupConn(c: DataConnection, mine: boolean) {
    const other = c.peer
    c.on('open', () => {
      const old = this.conns.get(other)
      if (old && old.open && old !== c) {
        // conexión duplicada (ambos se buscaron a la vez): se conserva la iniciada por el id menor, igual en los dos extremos
        const keepNew = (mine ? this.myId : other) < (mine ? other : this.myId)
        if (keepNew) { this.conns.set(other, c); old.close() } else { c.close(); return }
      } else this.conns.set(other, c)
      c.send({ t: 'hello', ...this.profile, ...this.state } satisfies Wire)
    })
    c.on('data', (d) => this.onData(other, d as Wire))
    c.on('close', () => { if (this.conns.get(other) === c) this.drop(other) })
    c.on('error', () => undefined)
  }

  private onData(from: string, m: Wire) {
    if (!m || typeof m !== 'object') return
    if (m.t === 'hello') {
      this.ev.onPeer(from, { name: m.name, color: m.color, avatar: m.avatar, mic: m.mic, deaf: m.deaf, vroom: m.vroom })
      if (!this.sent.has(from)) { this.sent.add(from); (['voice', 'cam', 'screen'] as Kind[]).forEach((k) => { const s = this.local[k]; if (s) this.callKind(from, k, s) }) }
    } else if (m.t === 'state') this.ev.onPeer(from, { mic: m.mic, deaf: m.deaf, vroom: m.vroom })
    else if (m.t === 'chat') this.handleChat(m.msg)
    else if (m.t === 'react') this.ev.onReact(from, String(m.emoji).slice(0, 8))
  }

  private drop(id: string) {
    this.conns.delete(id); this.sent.delete(id)
    for (const [k, c] of [...this.calls]) if (k.startsWith(id + '|')) { c.close(); this.calls.delete(k) }
    this.ev.onLeave(id)
  }

  private callKind(id: string, kind: Kind, stream: MediaStream) {
    if (!this.peer) return
    const call = this.peer.call(id, stream, { metadata: { kind }, ...(kind === 'screen' ? { sdpTransform: preferFastCodecs } : {}) })
    this.trackCall(call, kind, true)
    if (kind === 'screen') tuneCall(call)
  }

  private trackCall(call: MediaConnection, kind: Kind, outgoing: boolean) {
    const key = call.peer + '|' + (outgoing ? 'out' : 'in') + '|' + kind
    const prev = this.calls.get(key); this.calls.set(key, call); if (prev) prev.close()
    if (outgoing) return
    call.on('stream', (s) => this.ev.onStream(call.peer, kind, s))
    call.on('close', () => { if (this.calls.get(key) === call) { this.calls.delete(key); this.ev.onStream(call.peer, kind, null) } })
  }

  setLocal(kind: Kind, stream: MediaStream | null) {
    if (stream) this.local[kind] = stream; else delete this.local[kind]
    for (const id of this.conns.keys()) {
      if (stream) this.callKind(id, kind, stream)
      else { const k = id + '|out|' + kind; const c = this.calls.get(k); if (c) { c.close(); this.calls.delete(k) } }
    }
  }

  private broadcast(m: Wire) { for (const c of this.conns.values()) if (c.open) c.send(m) }
  setState(p: Partial<RoomState>) { this.state = { ...this.state, ...p }; this.broadcast({ t: 'state', ...this.state }) }
  react(emoji: string) { this.broadcast({ t: 'react', emoji }) }
  sendChat(m: Msg) { this.seen.add(m.id); this.broadcast({ t: 'chat', msg: m }); try { this.bc?.postMessage({ t: 'chat', msg: m }) } catch { /* canal cerrado */ } }
  private handleChat(m: Msg) { if (!m || this.seen.has(m.id)) return; this.seen.add(m.id); this.ev.onChat(m) }
  peers() { return [...this.conns.keys()] }

  close() {
    this.closed = true
    for (const c of this.calls.values()) c.close()
    for (const c of this.conns.values()) c.close()
    this.calls.clear(); this.conns.clear()
    try { this.bc?.close() } catch { /* ya cerrado */ }
    if (this.peer) this.peer.destroy()
  }
}
