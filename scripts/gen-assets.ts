/**
 * 生成静态素材：cover.png / icon-192 / icon-512 / favicon.svg
 * 纯 Node + zlib 手写 PNG 编码，不引入图像库（保持依赖最少）
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

type RGB = [number, number, number]

/* 复古露营色板：帆布奶油 / 森林绿 / 砖红 / 芥末黄 / 靛蓝
   （Hudson's Bay 毛毯 + 遮阳篷条纹那套语汇） */
const CANVAS: RGB = [0xf2, 0xe9, 0xd7]
const CANVAS_HI: RGB = [0xfa, 0xf4, 0xe6]
const FOREST: RGB = [0x2f, 0x4a, 0x34]
const FOREST_DEEP: RGB = [0x1f, 0x33, 0x24]
const BRICK: RGB = [0xa6, 0x40, 0x2c]
const MUSTARD: RGB = [0xd9, 0xa2, 0x27]
const NAVY: RGB = [0x2f, 0x48, 0x58]

class Canvas {
  w: number
  h: number
  data: Uint8Array

  constructor(w: number, h: number, bg: RGB) {
    this.w = w
    this.h = h
    this.data = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      this.data[i * 4] = bg[0]
      this.data[i * 4 + 1] = bg[1]
      this.data[i * 4 + 2] = bg[2]
      this.data[i * 4 + 3] = 255
    }
  }

  px(x: number, y: number, c: RGB, a = 1) {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return
    const i = (iy * this.w + ix) * 4
    this.data[i] = Math.round(this.data[i]! * (1 - a) + c[0] * a)
    this.data[i + 1] = Math.round(this.data[i + 1]! * (1 - a) + c[1] * a)
    this.data[i + 2] = Math.round(this.data[i + 2]! * (1 - a) + c[2] * a)
  }

  rect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.px(x, y, c, a)
    }
  }

  /** 圆环（抗锯齿由多点采样近似） */
  ring(cx: number, cy: number, r: number, thickness: number, c: RGB, a = 1) {
    const inner = r - thickness / 2
    const outer = r + thickness / 2
    for (let y = Math.floor(cy - outer - 1); y <= Math.ceil(cy + outer + 1); y++) {
      for (let x = Math.floor(cx - outer - 1); x <= Math.ceil(cx + outer + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        const cover = Math.min(1, Math.max(0, outer - d + 0.5)) * Math.min(1, Math.max(0, d - inner + 0.5))
        if (cover > 0) this.px(x, y, c, a * cover)
      }
    }
  }

  /** 手绘感的粗线段 */
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1) {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t
      for (let dy = -w / 2; dy <= w / 2; dy += 0.5) {
        for (let dx = -w / 2; dx <= w / 2; dx += 0.5) {
          if (dx * dx + dy * dy <= (w / 2) * (w / 2)) this.px(x + dx, y + dy, c, a)
        }
      }
    }
  }

  /** 虚线 */
  dashed(x0: number, y0: number, x1: number, y1: number, w: number, dash: number, gap: number, c: RGB, a = 1) {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const ux = (x1 - x0) / len
    const uy = (y1 - y0) / len
    let d = 0
    while (d < len) {
      const e = Math.min(d + dash, len)
      this.line(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e, w, c, a)
      d = e + gap
    }
  }

  /**
   * 纸纹：只撒稀疏小点，不做全画布噪点。
   * 全量噪点会让 PNG 几乎无法压缩（435KB → 目标 <50KB），稀疏点可达同样观感。
   */
  noise(seed: number, strength: number, density = 0.02) {
    let s = seed
    const rnd = () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
    const total = this.w * this.h
    const count = Math.floor(total * density)
    for (let n = 0; n < count; n++) {
      const x = Math.floor(rnd() * this.w)
      const y = Math.floor(rnd() * this.h)
      const delta = (rnd() - 0.5) * strength * 255
      const i = (y * this.w + x) * 4
      this.data[i] = clamp(this.data[i]! + delta)
      this.data[i + 1] = clamp(this.data[i + 1]! + delta)
      this.data[i + 2] = clamp(this.data[i + 2]! + delta)
    }
  }

  png(): Buffer {
    const { w, h, data } = this
    const raw = Buffer.alloc((w * 4 + 1) * h)
    for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0 // filter: none
      data.subarray(y * w * 4, (y + 1) * w * 4).forEach((v, i) => {
        raw[y * (w * 4 + 1) + 1 + i] = v
      })
    }
    const idat = deflateSync(raw, { level: 9 })

    const chunks: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(body.length)
      const t = Buffer.from(type, 'ascii')
      const crc = Buffer.alloc(4)
      crc.writeUInt32BE(crc32(Buffer.concat([t, body])) >>> 0)
      return Buffer.concat([len, t, body, crc])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(w, 0)
    ihdr.writeUInt32BE(h, 4)
    ihdr[8] = 8 // bit depth
    ihdr[9] = 6 // RGBA
    chunks.push(chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)))
    return Buffer.concat(chunks)
  }
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

let crcTable: Uint32Array | null = null
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** RV 标记：用几何线条拼，不依赖字体 */
function drawMark(cv: Canvas, cx: number, cy: number, size: number, color: RGB) {
  const w = size * 0.09
  // R
  const rx = cx - size * 0.42
  cv.line(rx, cy - size * 0.34, rx, cy + size * 0.34, w, color)
  cv.line(rx, cy - size * 0.34, rx + size * 0.3, cy - size * 0.34, w, color)
  cv.line(rx + size * 0.3, cy - size * 0.34, rx + size * 0.3, cy - size * 0.02, w, color)
  cv.line(rx, cy - size * 0.02, rx + size * 0.3, cy - size * 0.02, w, color)
  cv.line(rx, cy - size * 0.02, rx + size * 0.28, cy + size * 0.34, w, color)
  // V
  const vx = cx + size * 0.12
  cv.line(vx, cy - size * 0.34, vx + size * 0.15, cy + size * 0.34, w, color)
  cv.line(vx + size * 0.3, cy - size * 0.34, vx + size * 0.15, cy + size * 0.34, w, color)
}

/** 分享封面 + 页面横幅：垂直遮阳篷条纹（800×400），无徽章（徽章交给 CSS/SVG） */
function makeCover(w = 800, h = 400): Buffer {
  const cv = new Canvas(w, h, CANVAS)
  const band = Math.round(w / 8) // 8 条竖向条纹

  for (let i = 0; i < 8; i += 2) {
    // 森林绿宽条
    cv.rect(i * band, 0, (i + 1) * band, h, FOREST)
    // 毯子边细节：砖红 + 芥末黄细线
    cv.rect(i * band + band * 0.16, 0, i * band + band * 0.16 + 5, h, BRICK)
    cv.rect(i * band + band * 0.30, 0, i * band + band * 0.30 + 5, h, MUSTARD)
    cv.rect(i * band + band * 0.44, 0, i * band + band * 0.44 + 3, h, NAVY)
  }

  // 帆布织纹
  cv.noise(20261021, 0.05, 0.008)

  // 上下压边
  cv.rect(0, 0, w, 6, FOREST_DEEP)
  cv.rect(0, h - 6, w, h, FOREST_DEEP)

  return cv.png()
}

/** 图标：森林绿圆章 + 奶油 RV */
function makeIcon(size: number): Buffer {
  const cv = new Canvas(size, size, FOREST)
  const cx = size / 2
  const cy = size / 2

  cv.ring(cx, cy, size * 0.44, Math.max(2, size * 0.022), CANVAS, 0.95)
  cv.ring(cx, cy, size * 0.395, Math.max(1, size * 0.008), BRICK, 0.8)
  drawMark(cv, cx, cy, size * 0.46, CANVAS)

  return cv.png()
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#2F4A34"/>
  <circle cx="32" cy="32" r="27" fill="none" stroke="#F2E9D7" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="24" fill="none" stroke="#A6402C" stroke-width="1.2"/>
  <g stroke="#F2E9D7" stroke-width="3.4" stroke-linecap="round" fill="none">
    <path d="M21 22v21M21 22h7a4.2 4.2 0 0 1 0 8.4h-7M21 30.4l8 12.6"/>
    <path d="M33 22l6.4 21 6.4-21"/>
  </g>
</svg>
`

mkdirSync('public', { recursive: true })
writeFileSync('public/cover.png', makeCover(800, 400))
writeFileSync('public/icon-192.png', makeIcon(192))
writeFileSync('public/icon-512.png', makeIcon(512))
writeFileSync('public/favicon.svg', FAVICON_SVG)
console.log('✓ 素材已生成：cover.png / icon-192 / icon-512 / favicon.svg')
