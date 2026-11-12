import { setScreenMode, type ScreenMode } from './tune'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, CSSProperties } from 'react'
import { Room } from './rtc'
import { sfx, resumeAudio } from './sfx'
import { tapStream } from './audio'
import type { Tap } from './audio'
import { FRIENDS, SCRIPT, demoSpeaking, makeScreen, startDemoAudio } from './demo'
import type { Kind, Msg, Person, Profile } from './types'

const COLORS = ['#5865f2', '#f472b6', '#38bdf8', '#4ade80', '#facc15', '#fb923c', '#a78bfa', '#f87171']
const AVATARS = ['🦊', '🐺', '🐼', '🐯', '🦄', '🐙', '🚀', '🎮', '👾', '🔥', '🐸', '🦉']
const VROOMS = [{ id: 'general', name: 'Sala General' }, { id: 'gaming', name: 'Sala Gaming' }, { id: 'chill', name: 'Sala Chill' }]
const TCH = ['general', 'clips-y-links']
const EMOJIS = ['👍', '😂', '🔥', '❤️', '👏', '😮']
const uid = () => Math.random().toString(36).slice(2, 10)
const mkRoom = () => 'SQUAD-' + Math.random().toString(36).slice(2, 4).toUpperCase()
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const blank = (id: string): Person => ({ id, name: 'Amigo', color: '#5865f2', avatar: '🙂', mic: true, deaf: false, vroom: 'general' })
const resizeImg = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onerror = () => rej(new Error('lectura'))
  r.onload = () => {
    const im = new Image()
    im.onerror = () => rej(new Error('imagen'))
    im.onload = () => {
      const k = Math.min(1, 480 / Math.max(im.width, im.height)); const cv = document.createElement('canvas')
      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k)
      const g = cv.getContext('2d'); if (!g) return rej(new Error('canvas'))
      g.drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.7))
    }
    im.src = String(r.result)
  }
  r.readAsDataURL(f)
})
const getMic = async (id: string): Promise<MediaStream | null> => {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(id ? { deviceId: { exact: id } } : {}) } })
  } catch { return null }
}

function Vid({ stream, muted, volume, contain }: { stream: MediaStream; muted: boolean; volume: number; contain?: boolean }) {
  const r = useRef<HTMLVideoElement>(null)
  useEffect(() => { const v = r.current; if (v && v.srcObject !== stream) { v.srcObject = stream; void v.play().catch(() => undefined) } }, [stream])
  useEffect(() => { const v = r.current; if (v) { v.muted = muted; v.volume = Math.max(0, Math.min(1, volume)) } }, [muted, volume])
  return <video ref={r} playsInline disablePictureInPicture autoPlay muted={muted} className={contain ? 'contain' : ''} />
}

export default function App() {
  const [phase, setPhase] = useState<'join' | 'call'>('join')
  const [code, setCode] = useState(() => (new URLSearchParams(location.search).get('room') || mkRoom()).toUpperCase())
  const [prof, setProf] = useState<Profile>(() => {
    try { const s = localStorage.getItem('pulsecord.profile'); if (s) return JSON.parse(s) as Profile } catch { /* perfil nuevo */ }
    return { name: '', color: COLORS[0], avatar: AVATARS[0] }
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [myMic, setMyMic] = useState(true)
  const [deaf, setDeaf] = useState(false)
  const [localCam, setLocalCam] = useState<MediaStream | null>(null)
  const [localScr, setLocalScr] = useState<MediaStream | null>(null)
  const [vroom, setVroom] = useState('general')
  const [vol, setVol] = useState<Record<string, number>>({})
  const [lmute, setLmute] = useState<Record<string, boolean>>({})
  const [spk, setSpk] = useState<Record<string, boolean>>({})
  const [chat, setChat] = useState<Msg[]>([])
  const [tch, setTch] = useState('general')
  const [text, setText] = useState('')
  const [stage, setStage] = useState<{ id: string; kind: 'cam' | 'screen' } | null>(null)
  const [floats, setFloats] = useState<{ id: string; emoji: string; x: number; name: string }[]>([])
  const [panel, setPanel] = useState<'chan' | 'call' | 'chat'>('call')
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState('')
  const [demoOn, setDemoOn] = useState(false)
  const [demoScr, setDemoScr] = useState<MediaStream | null>(null)
  const [showSet, setShowSet] = useState(false)
  const [quality, setQuality] = useState<ScreenMode>('720')
  const [devs, setDevs] = useState<{ mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[] }>({ mics: [], cams: [] })
  const [micId, setMicId] = useState('')
  const [camId, setCamId] = useState('')
  const [installEv, setInstallEv] = useState<Event | null>(null)

  const roomRef = useRef<Room | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const camRef = useRef<MediaStream | null>(null)
  const scrRef = useRef<MediaStream | null>(null)
  const tapsRef = useRef(new Map<string, Tap>())
  const myTapRef = useRef<Tap | null>(null)
  const peopleRef = useRef<Record<string, Person>>({})
  const demoRef = useRef<{ audio: ReturnType<typeof startDemoAudio>; screen: { stop: () => void }; timers: number[] } | null>(null)
  const holdRef = useRef<Record<string, number>>({})
  const prevMic = useRef(true)
  const stageEl = useRef<HTMLDivElement>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  const fileEl = useRef<HTMLInputElement>(null)
  const volR = useRef(vol); volR.current = vol
  const lmuteR = useRef(lmute); lmuteR.current = lmute
  const deafR = useRef(deaf); deafR.current = deaf
  const micOnR = useRef(myMic); micOnR.current = myMic
  const vroomR = useRef(vroom); vroomR.current = vroom
  const panelR = useRef(panel); panelR.current = panel

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3500) }
  const eff = (id: string, room: string) => (deafR.current || lmuteR.current[id] || room !== vroomR.current ? 0 : (volR.current[id] ?? 1))
  const applyVols = () => {
    tapsRef.current.forEach((t, id) => { const p = peopleRef.current[id]; t.setVol(p ? eff(id, p.vroom) : 0) })
    const d = demoRef.current; if (d) FRIENDS.forEach((f) => d.audio.setVol(f.id, eff(f.id, 'general')))
  }
  const addMsg = (m: Msg) => { setChat((c) => [...c.slice(-300), m]); if (m.from !== (roomRef.current?.myId || 'me')) { sfx('msg'); if (panelR.current !== 'chat') setUnread((u) => u + 1) } }
  const floatReact = (emoji: string, name: string) => {
    const f = { id: uid(), emoji, x: 8 + Math.random() * 80, name }
    setFloats((a) => [...a, f]); window.setTimeout(() => setFloats((a) => a.filter((x) => x.id !== f.id)), 3400)
  }

  const upsert = (id: string, patch: Partial<Person>) => {
    const prev = peopleRef.current[id]
    if (!prev) sfx('join')
    else { if (patch.mic !== undefined && patch.mic !== prev.mic) sfx(patch.mic ? 'unmute' : 'mute'); if (patch.deaf && !prev.deaf) sfx('deaf') }
    const n = { ...peopleRef.current, [id]: { ...(prev ?? blank(id)), ...patch, id } }
    peopleRef.current = n; setPeople(n)
  }
  const onLeave = (id: string) => {
    const p = peopleRef.current[id]; if (p) flash(p.name + ' salió de la sala')
    sfx('leave')
    const n = { ...peopleRef.current }; delete n[id]; peopleRef.current = n; setPeople(n)
    const t = tapsRef.current.get(id); if (t) { t.stop(); tapsRef.current.delete(id) }
    setStage((s) => (s && s.id === id ? null : s))
  }
  const onStream = (id: string, kind: Kind, s: MediaStream | null) => {
    const prev = peopleRef.current[id]
    if (kind === 'voice') {
      const old = tapsRef.current.get(id); if (old) { old.stop(); tapsRef.current.delete(id) }
      if (s) tapsRef.current.set(id, tapStream(s, true))
      window.setTimeout(applyVols, 0)
    } else if (kind === 'screen' && s && !(prev && prev.screen)) sfx('share')
    const np: Person = { ...(prev ?? blank(id)), id }
    np[kind] = s ?? undefined
    const n = { ...peopleRef.current, [id]: np }
    peopleRef.current = n; setPeople(n)
    if (!s && kind !== 'voice') setStage((st) => (st && st.id === id && st.kind === kind ? null : st))
  }
  const onReact = (id: string, emoji: string) => floatReact(emoji, peopleRef.current[id]?.name || 'Amigo')

  const setMicStream = (m: MediaStream | null) => {
    if (myTapRef.current) { myTapRef.current.stop(); myTapRef.current = null }
    micRef.current = m
    if (m) { m.getAudioTracks().forEach((t) => { t.enabled = micOnR.current && !deafR.current }); myTapRef.current = tapStream(m, false) }
  }

  const enter = async (demo: boolean) => {
    const name = prof.name.trim()
    if (!name) { setErr('Escribe tu apodo para entrar'); return }
    const room = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (!demo && room.length < 3) { setErr('El código de sala debe tener al menos 3 caracteres'); return }
    resumeAudio(); setBusy(true); setErr('')
    try { localStorage.setItem('pulsecord.profile', JSON.stringify({ ...prof, name })) } catch { /* sin almacenamiento */ }
    const mic = await getMic('')
    if (!mic) flash('Sin micrófono: podrás escuchar y chatear')
    setMicStream(mic)
    if (!demo) {
      const r = new Room(room, { ...prof, name }, { onPeer: upsert, onLeave, onStream, onChat: addMsg, onReact, onStatus: flash })
      if (mic) r.setLocal('voice', mic)
      try { await r.start() } catch (e) {
        setErr(e instanceof Error ? e.message : String(e)); r.close(); if (mic) mic.getTracks().forEach((t) => t.stop()); setMicStream(null); setBusy(false); return
      }
      roomRef.current = r
      try { history.replaceState(null, '', '?room=' + room) } catch { /* sin historial */ }
    }
    setBusy(false); setPhase('call'); setPanel('call'); sfx('join')
    if (demo) startDemo()
  }

  const startDemo = () => {
    if (demoRef.current) return
    const audio = startDemoAudio(); const sc = makeScreen()
    const timers = SCRIPT.map((s) => window.setTimeout(() => { const f = FRIENDS[s.who]; addMsg({ id: uid(), ch: 'general', from: f.id, name: f.name, color: f.color, avatar: f.avatar, text: s.text, ts: Date.now() }) }, s.at))
    timers.push(window.setInterval(() => floatReact(EMOJIS[Math.floor(Math.random() * EMOJIS.length)], FRIENDS[Math.floor(Math.random() * 4)].name), 4500))
    demoRef.current = { audio, screen: sc, timers }
    setDemoScr(sc.stream); setDemoOn(true); sfx('join'); sfx('share')
    window.setTimeout(applyVols, 0)
  }
  const stopDemo = () => {
    const d = demoRef.current; if (!d) return
    d.timers.forEach((t) => { window.clearTimeout(t); window.clearInterval(t) }); d.audio.stop(); d.screen.stop(); demoRef.current = null
    setDemoScr(null); setDemoOn(false); setStage((s) => (s && s.id.startsWith('demo-') ? null : s)); sfx('leave')
  }

  const toggleMic = () => {
    if (deaf) return
    const m = micRef.current; if (!m) { flash('No hay micrófono activo'); return }
    const on = !myMic; m.getAudioTracks().forEach((t) => { t.enabled = on }); setMyMic(on); sfx(on ? 'unmute' : 'mute'); roomRef.current?.setState({ mic: on })
  }
  const toggleDeaf = () => {
    const d = !deaf; setDeaf(d); deafR.current = d
    const m = micRef.current
    if (d) { prevMic.current = myMic; m?.getAudioTracks().forEach((t) => { t.enabled = false }); setMyMic(false); roomRef.current?.setState({ deaf: true, mic: false }); sfx('deaf') }
    else { const on = prevMic.current; m?.getAudioTracks().forEach((t) => { t.enabled = on }); setMyMic(on); roomRef.current?.setState({ deaf: false, mic: on }); sfx('unmute') }
  }
  const stopCam = () => { camRef.current?.getTracks().forEach((t) => t.stop()); camRef.current = null; setLocalCam(null); roomRef.current?.setLocal('cam', null) }
  const startCam = async (id: string) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(id ? { deviceId: { exact: id } } : {}) } })
      camRef.current?.getTracks().forEach((t) => t.stop()); camRef.current = s; setLocalCam(s); roomRef.current?.setLocal('cam', s); sfx('unmute')
    } catch { flash('No se pudo abrir la cámara (revisa los permisos)') }
  }
  const toggleCam = () => { if (localCam) stopCam(); else void startCam(camId) }
  const stopScreen = () => { scrRef.current?.getTracks().forEach((t) => t.stop()); scrRef.current = null; setLocalScr(null); roomRef.current?.setLocal('screen', null) }
  const toggleScreen = async () => {
    if (localScr) { stopScreen(); return }
    if (!navigator.mediaDevices.getDisplayMedia) { flash('Este dispositivo no permite compartir pantalla'); return }
    const hd = quality === '1080'
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: quality === '720-30' ? 30 : 60 }, width: { ideal: hd ? 1920 : 1280 }, height: { ideal: hd ? 1080 : 720 } }, audio: true })
      const v = s.getVideoTracks()[0]; if (v) { v.contentHint = 'motion'; v.addEventListener('ended', stopScreen) }
      setScreenMode(quality); scrRef.current = s; setLocalScr(s); roomRef.current?.setLocal('screen', s); sfx('share')
    } catch { flash('No se compartió la pantalla') }
  }
  const changeMic = async (id: string) => {
    setMicId(id); const m = await getMic(id); if (!m) { flash('No se pudo usar ese micrófono'); return }
    micRef.current?.getTracks().forEach((t) => t.stop()); setMicStream(m); roomRef.current?.setLocal('voice', m)
  }
  const changeCam = (id: string) => { setCamId(id); if (localCam) void startCam(id) }
  const openSettings = () => {
    setShowSet(true)
    navigator.mediaDevices.enumerateDevices().then((d) => setDevs({ mics: d.filter((x) => x.kind === 'audioinput'), cams: d.filter((x) => x.kind === 'videoinput') })).catch(() => undefined)
  }
  const switchRoom = (id: string) => { setVroom(id); vroomR.current = id; roomRef.current?.setState({ vroom: id }); sfx('join'); window.setTimeout(applyVols, 0) }
  const hangup = () => {
    stopDemo(); stopCam(); stopScreen()
    roomRef.current?.close(); roomRef.current = null
    micRef.current?.getTracks().forEach((t) => t.stop()); setMicStream(null)
    tapsRef.current.forEach((t) => t.stop()); tapsRef.current.clear()
    peopleRef.current = {}; setPeople({}); setStage(null); setChat([]); setMyMic(true); setDeaf(false); setSpk({}); setUnread(0)
    sfx('leave'); setPhase('join')
  }
  const invite = () => {
    const link = location.origin + location.pathname + '?room=' + code.trim().toUpperCase()
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => flash('Enlace de invitación copiado'), () => window.prompt('Copia este enlace:', link))
    else window.prompt('Copia este enlace:', link)
  }
  const sendMsg = (t: string, img?: string) => {
    if (!t.trim() && !img) return
    const m: Msg = { id: uid(), ch: tch, from: roomRef.current?.myId || 'me', name: prof.name.trim() || 'Yo', color: prof.color, avatar: prof.avatar, text: t.trim(), img, ts: Date.now() }
    setChat((c) => [...c, m]); roomRef.current?.sendChat(m); setText('')
  }
  const pickImg = async (f: File | undefined | null) => { if (!f || !f.type.startsWith('image/')) return; try { sendMsg('', await resizeImg(f)) } catch { flash('No se pudo leer la imagen') } }
  const react = (e: string) => { floatReact(e, 'Tú'); roomRef.current?.react(e) }
  const fullscreen = () => { const el = stageEl.current; if (el && el.requestFullscreen) void el.requestFullscreen().catch(() => undefined) }

  useEffect(() => { applyVols() })
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }) }, [chat, tch, panel])
  useEffect(() => { if (panel === 'chat') setUnread(0) }, [panel])
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEv(e) }
    window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  useEffect(() => {
    if (phase !== 'call') return
    const iv = window.setInterval(() => {
      const now = performance.now(); const next: Record<string, boolean> = {}; const hold = holdRef.current
      const test = (id: string, lvl: number, on: boolean) => { if (on && lvl > 0.035) hold[id] = now; next[id] = on && now - (hold[id] ?? -1e9) < 320 }
      tapsRef.current.forEach((t, id) => { const p = peopleRef.current[id]; test(id, t.level(), !!p && p.mic && !p.deaf) })
      if (myTapRef.current) test('me', myTapRef.current.level(), micOnR.current && !deafR.current)
      const d = demoRef.current
      if (d) FRIENDS.forEach((f) => { const on = demoSpeaking(f.id, now); next[f.id] = on; d.audio.gate(f.id, on) })
      setSpk((prev) => { const a = Object.keys(next); return a.length === Object.keys(prev).length && a.every((k) => prev[k] === next[k]) ? prev : next })
    }, 100)
    return () => window.clearInterval(iv)
  }, [phase])

  const me: Person = { id: 'me', ...prof, name: prof.name.trim() || 'Yo', mic: myMic, deaf, vroom, local: true, cam: localCam ?? undefined, screen: localScr ?? undefined }
  const demoPeople: Person[] = demoOn ? FRIENDS.map((f) => ({ id: f.id, name: f.name, color: f.color, avatar: f.avatar, mic: true, deaf: false, vroom: 'general', demo: true, screen: f.id === 'demo-nova' ? demoScr ?? undefined : undefined })) : []
  const all: Person[] = [me, ...Object.values(people), ...demoPeople]
  const inRoom = all.filter((p) => p.vroom === vroom)
  const tiles = inRoom.flatMap((p) => [{ p, kind: 'cam' as const }, ...(p.screen ? [{ p, kind: 'screen' as const }] : [])])
  const stT = stage ? tiles.find((t) => t.p.id === stage.id && t.kind === stage.kind) : undefined
  const stStream = stT ? (stT.kind === 'screen' ? stT.p.screen : stT.p.cam) : undefined
  useEffect(() => { if (stage && !stStream) setStage(null) }, [stage, stStream])

  const renderTile = (p: Person, kind: 'cam' | 'screen', compact: boolean, audible: boolean) => {
    const stream = kind === 'screen' ? p.screen : p.cam
    const sp = kind === 'cam' && !!spk[p.id]
    const pct = Math.round((vol[p.id] ?? 1) * 100)
    return (
      <div key={p.id + kind} className={'tile' + (sp ? ' speaking' : '') + (stream ? ' hasvideo' : '') + (compact ? ' compact' : '')} style={{ '--c': p.color } as CSSProperties}
        onClick={() => { if (stream) setStage((s) => (s && s.id === p.id && s.kind === kind ? null : { id: p.id, kind })) }}>
        {stream ? <Vid stream={stream} muted={!!p.local || kind === 'cam' || !audible} volume={p.demo ? 0 : eff(p.id, p.vroom)} /> : <div className="avatar" style={{ background: p.color }}>{p.avatar}</div>}
        <div className="tag">{kind === 'screen' ? '🖥️ ' : ''}{p.name}{p.local ? ' (tú)' : ''}{!p.mic && kind === 'cam' ? ' 🔇' : ''}{p.deaf ? ' 🎧🚫' : ''}</div>
        {!p.local && kind === 'cam' && !compact && (
          <div className="vol" onClick={(e) => e.stopPropagation()}>
            <button title="Silenciar a este amigo (solo para ti)" onClick={() => setLmute((m) => ({ ...m, [p.id]: !m[p.id] }))}>{lmute[p.id] ? '🔇' : '🔊'}</button>
            <input type="range" min={0} max={200} value={pct} aria-label={'Volumen de ' + p.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setVol((v) => ({ ...v, [p.id]: Number(e.target.value) / 100 }))} />
            <span>{lmute[p.id] ? '0' : pct}%</span>
          </div>
        )}
      </div>
    )
  }

  if (phase === 'join') {
    return (
      <div className="join">
        <div className="joincard">
          <div className="logo">🎙️ PulseCord</div>
          <p className="sub">Chat, voz, video y pantalla compartida con tu squad. Sin cuentas: solo un código de sala.</p>
          <label>Código de sala<input value={code} maxLength={20} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SQUAD-MX" /></label>
          <label>Apodo<input value={prof.name} maxLength={18} onChange={(e) => setProf({ ...prof, name: e.target.value })} placeholder="¿Cómo te llamas?" /></label>
          <div className="lbl">Color</div>
          <div className="swatches">{COLORS.map((c) => <button key={c} className={'sw' + (prof.color === c ? ' on' : '')} style={{ background: c }} aria-label={'Color ' + c} onClick={() => setProf({ ...prof, color: c })} />)}</div>
          <div className="lbl">Avatar</div>
          <div className="swatches">{AVATARS.map((a) => <button key={a} className={'av' + (prof.avatar === a ? ' on' : '')} onClick={() => setProf({ ...prof, avatar: a })}>{a}</button>)}</div>
          {err && <div className="err">{err}</div>}
          <button className="primary" disabled={busy} onClick={() => void enter(false)}>{busy ? 'Conectando…' : 'Entrar a la sala'}</button>
          <button className="ghost" disabled={busy} onClick={() => void enter(true)}>🧪 Simular 4 Amigos en Sala (Demo Squad)</button>
          <p className="hint">Hasta 8 amigos por sala · conexión directa P2P (WebRTC) · comparte el código o el enlace de invitación.</p>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  const online = all.filter((p) => !p.local)
  return (
    <div className="app">
      <aside className={'side' + (panel === 'chan' ? ' show' : '')}>
        <div className="srv">PulseCord <small>{code}</small></div>
        <div className="sect">Canales de texto</div>
        {TCH.map((c) => <button key={c} className={'chan' + (tch === c ? ' on' : '')} onClick={() => { setTch(c); setPanel('chat') }}># {c}</button>)}
        <div className="sect">Canales de voz</div>
        {VROOMS.map((v) => (
          <div key={v.id}>
            <button className={'chan' + (vroom === v.id ? ' on' : '')} onClick={() => switchRoom(v.id)}>🔊 {v.name}</button>
            {all.filter((p) => p.vroom === v.id).map((p) => <div key={p.id} className={'member' + (spk[p.id] ? ' speaking' : '')}><span className="dot" style={{ background: p.color }}>{p.avatar}</span>{p.name}{!p.mic ? ' 🔇' : ''}</div>)}
          </div>
        ))}
        <div className="sect">En línea — {online.length + 1}</div>
        {all.map((p) => <div key={p.id} className="member"><span className="dot" style={{ background: p.color }}>{p.avatar}</span>{p.name}{p.local ? ' (tú)' : ''}</div>)}
        <div className="me">
          <span className="dot big" style={{ background: prof.color }}>{prof.avatar}</span>
          <div className="mename">{me.name}<small>{deaf ? 'Ensordecido' : myMic ? 'En línea' : 'Silenciado'}</small></div>
          <button className="mini" onClick={toggleMic} aria-label="Micrófono">{myMic ? '🎙️' : '🔇'}</button>
          <button className="mini" onClick={toggleDeaf} aria-label="Audífonos">{deaf ? '🎧🚫' : '🎧'}</button>
        </div>
      </aside>

      <main className={'center' + (panel === 'call' ? ' show' : '')}>
        <header className="top">
          <div className="title">🔊 {VROOMS.find((v) => v.id === vroom)?.name} <small>· {inRoom.length} en llamada</small></div>
          <div className="topbtns">
            <button onClick={invite}>🔗 Invitar</button>
            <button onClick={demoOn ? stopDemo : startDemo}>{demoOn ? '🧪 Quitar demo' : '🧪 Demo Squad'}</button>
            {installEv ? <button onClick={() => (installEv as unknown as { prompt: () => void }).prompt()}>⬇️ Instalar app</button> : null}
          </div>
        </header>
        <section className="callarea">
          {stage && stT && stStream ? (
            <div className="stagewrap">
              <div className="stage" ref={stageEl}>
                <Vid stream={stStream} muted={!!stT.p.local || stT.kind === 'cam'} volume={stT.p.demo ? 0 : eff(stT.p.id, stT.p.vroom)} contain />
                <div className="stagebar"><span>{stT.kind === 'screen' ? '🖥️ Pantalla de ' : '📷 Cámara de '}{stT.p.name}</span><div><button onClick={fullscreen}>⛶ Pantalla completa</button><button onClick={() => setStage(null)}>✕ Salir del escenario</button></div></div>
              </div>
              <div className="strip">{tiles.filter((t) => !(t.p.id === stage.id && t.kind === stage.kind)).map((t) => renderTile(t.p, t.kind, true, false))}</div>
            </div>
          ) : (
            <div className={'grid n' + Math.min(tiles.length, 9)}>{tiles.map((t) => renderTile(t.p, t.kind, false, true))}</div>
          )}
          <div className="floats">{floats.map((f) => <div key={f.id} className="float" style={{ left: f.x + '%' }}>{f.emoji}<small>{f.name}</small></div>)}</div>
        </section>
        <footer className="controls">
          <button className={myMic ? '' : 'off'} onClick={toggleMic} aria-label="Micrófono" title="Micrófono (silenciar / activar)">{myMic ? '🎙️' : '🔇'}</button>
          <button className={deaf ? 'off' : ''} onClick={toggleDeaf} aria-label="Audífonos" title="Ensordecer / activar audio">{deaf ? '🎧🚫' : '🎧'}</button>
          <button className={localCam ? 'on' : ''} onClick={toggleCam} aria-label="Cámara" title="Cámara">📷</button>
          {typeof navigator.mediaDevices?.getDisplayMedia === 'function' && <button className={localScr ? 'on' : ''} onClick={() => void toggleScreen()} aria-label="Compartir pantalla" title="Compartir pantalla">🖥️</button>}
          <button onClick={openSettings} aria-label="Ajustes de dispositivos" title="Micrófono, cámara y calidad">⚙️</button>
          <button className="hang" onClick={hangup} aria-label="Colgar" title="Colgar">📞</button>
        </footer>
      </main>

      <aside className={'chatp' + (panel === 'chat' ? ' show' : '')}>
        <div className="chead"># {tch}</div>
        <div className="msgs">
          {chat.filter((m) => m.ch === tch).map((m) => (
            <div key={m.id} className={'msg' + (m.from === (roomRef.current?.myId || 'me') ? ' mine' : '')}>
              <span className="dot" style={{ background: m.color }}>{m.avatar}</span>
              <div><b style={{ color: m.color }}>{m.name}</b> <small>{hhmm(m.ts)}</small>{m.text && <p>{m.text}</p>}{m.img && <img src={m.img} alt="imagen enviada" />}</div>
            </div>
          ))}
          <div ref={chatEnd} />
        </div>
        <div className="reacts">{EMOJIS.map((e) => <button key={e} onClick={() => react(e)} aria-label={'Reaccionar ' + e}>{e}</button>)}</div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); sendMsg(text) }}>
          <button type="button" className="mini" onClick={() => fileEl.current?.click()} aria-label="Enviar imagen">🖼️</button>
          <input ref={fileEl} type="file" accept="image/*" hidden onChange={(e) => { void pickImg(e.target.files?.[0]); e.target.value = '' }} />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={'Mensaje en #' + tch} maxLength={500}
            onPaste={(e: ClipboardEvent<HTMLInputElement>) => { const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void pickImg(f) } }} />
          <button className="send" type="submit">➤</button>
        </form>
      </aside>

      <nav className="tabs">
        <button className={panel === 'chan' ? 'on' : ''} onClick={() => setPanel('chan')}>📂<span>Canales</span></button>
        <button className={panel === 'call' ? 'on' : ''} onClick={() => setPanel('call')}>🎥<span>Llamada</span></button>
        <button className={panel === 'chat' ? 'on' : ''} onClick={() => setPanel('chat')}>💬<span>Chat</span>{unread > 0 && <i>{unread}</i>}</button>
      </nav>

      {showSet && (
        <div className="modal" onClick={() => setShowSet(false)}>
          <div className="mcard" onClick={(e) => e.stopPropagation()}>
            <h3>Ajustes de llamada</h3>
            <label>Micrófono<select value={micId} onChange={(e) => void changeMic(e.target.value)}><option value="">Predeterminado</option>{devs.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Micrófono'}</option>)}</select></label>
            <label>Cámara<select value={camId} onChange={(e) => changeCam(e.target.value)}><option value="">Predeterminada</option>{devs.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Cámara'}</option>)}</select></label>
            <label>Calidad al compartir pantalla<select value={quality} onChange={(e) => setQuality(e.target.value as ScreenMode)}><option value="720">720p · 60 FPS</option><option value="1080">1080p · 60 FPS</option><option value="720-30">720p · 30 FPS Ultra Fluido / Juego</option></select></label>
            <button className="primary" onClick={() => setShowSet(false)}>Listo</button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
