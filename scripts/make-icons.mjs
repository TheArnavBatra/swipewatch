// Writes the PWA icons into public/ with no dependencies: two swipe cards on a vermilion tile,
// the same mark as public/favicon.svg.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const RED = [201, 53, 24], GOLD = [245, 189, 65], CREAM = [252, 248, 241], INK = [29, 25, 21]
// Geometry in fractions of the icon size. Both cards stay inside the central 80%, so the mark
// survives maskable cropping.
const CARD = { w: 0.344, h: 0.516, r: 0.055 }
const tilted = (x, y, deg) => ({ x, y, cos: Math.cos((deg * Math.PI) / 180), sin: Math.sin((deg * Math.PI) / 180) })
const BACK = tilted(0.445, 0.508, -12)
const FRONT = tilted(0.547, 0.5, 8)
const SAMPLES = 4 // per pixel edge, for smooth edges

// A point in a card's own frame: the card upright and centred on the origin.
const local = (card, px, py) => {
  const dx = px - card.x, dy = py - card.y
  return [dx * card.cos + dy * card.sin, dy * card.cos - dx * card.sin]
}
const inCard = ([x, y]) => {
  const qx = Math.max(Math.abs(x) - (CARD.w / 2 - CARD.r), 0)
  const qy = Math.max(Math.abs(y) - (CARD.h / 2 - CARD.r), 0)
  return qx * qx + qy * qy <= CARD.r * CARD.r
}
const inPlay = ([x, y]) => x >= -0.045 && x <= 0.089 && Math.abs(y) <= (0.078 * (0.089 - x)) / 0.134
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

function colorAt(px, py) {
  const front = local(FRONT, px, py)
  if (inPlay(front)) return RED
  if (inCard(front)) return CREAM
  const under = inCard(local(BACK, px, py)) ? GOLD : RED
  // A hard offset shadow below the front card, like a misregistered print.
  return inCard(local(FRONT, px - 0.0125, py - 0.02)) ? mix(under, INK, 0.22) : under
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = colorAt((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size)
          sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]
        }
      }
      const i = y * (size * 3 + 1) + 1 + x * 3
      const n = SAMPLES * SAMPLES
      raw[i] = Math.round(sum[0] / n); raw[i + 1] = Math.round(sum[1] / n); raw[i + 2] = Math.round(sum[2] / n)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
writeFileSync('public/apple-touch-icon.png', png(180))
console.log('Icons written to public/')
