# PulseCord

Chat, voz, videollamadas y pantalla compartida para tu squad. React + TypeScript + Vite + PeerJS (WebRTC en malla).

## Ejecutar
```bash
npm install
npm run dev
```
Abre la dirección que muestre la terminal. Para probar en el celular usa la dirección de red (o súbelo a un hosting HTTPS: el micrófono, la cámara y la instalación como app exigen HTTPS).

## Cómo se usa
1. Escribe un **Código de Sala** (ej. `SQUAD-MX`), tu **apodo**, color y avatar.
2. Comparte el código o el botón **Invitar** (copia el enlace con `?room=CODIGO`). Hasta 8 amigos.
3. **Demo Squad** inyecta 4 amigos virtuales para probar la grilla, el Modo Escenario (clic en una pantalla/cámara) y el volumen individual.

## Notas técnicas
- Señalización: broker público `0.peerjs.com`. Cada amigo ocupa un "slot" `pulsecord-CODIGO-N` y se conecta con todos (malla P2P): `DataConnection` para chat/estado/reacciones y `MediaConnection` para voz, cámara y pantalla.
- STUN de Google/Twilio y un TURN público de respaldo (openrelay). En redes muy restrictivas puede hacer falta un TURN propio.
- `getDisplayMedia` no existe en Android: allí el botón de pantalla se oculta (sí puedes ver la pantalla de otros).
- PWA: `public/manifest.json`, `public/sw.js` e iconos PNG (`npm run icons` los regenera).
