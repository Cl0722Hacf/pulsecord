const z = require('zlib'), fs = require('fs')
const T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc = (b) => { let c = -1; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
function png(size, maskable) {
  const pad = maskable ? 0.3 : 0.18, H = [0.25, 0.55, 0.85, 0.5, 0.3], n = H.length, area = size * (1 - 2 * pad), bw = area / (n * 1.6), gap = (area - n * bw) / (n - 1), r = bw / 2
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size); let R = 88 - 58 * t * 0.6, G = 101 + 99 * t * 0.5, B = 242 - 82 * t * 0.5
      for (let i = 0; i < n; i++) {
        const x0 = size * pad + i * (bw + gap), hh = area * H[i], cy = size / 2
        if (x >= x0 && x <= x0 + bw) {
          const dy = Math.abs(y - cy), cx = x0 + r; const dx = x - cx
          if (dy <= hh / 2 - r || dx * dx + (dy - (hh / 2 - r)) ** 2 <= r * r) { R = G = B = 255 }
        }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3; raw[o] = R; raw[o + 1] = G; raw[o + 2] = B
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', z.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('public/icon-192.png', png(192, false)); fs.writeFileSync('public/icon-512.png', png(512, false)); fs.writeFileSync('public/icon-maskable-512.png', png(512, true))
console.log('ICONOS_OK')
