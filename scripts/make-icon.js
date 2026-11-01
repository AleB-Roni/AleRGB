// Erzeugt assets/icon.png (256x256) und assets/icon.ico (16–256 px) ohne externe Abhängigkeiten
const zlib = require('zlib'), fs = require('fs'), path = require('path');
function hsv(h, s, v) { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; }
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(S) {
  const raw = Buffer.alloc(S * (S * 4 + 1)); const SS = 4; // Supersampling
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const dx = (x + (sx + 0.5) / SS) - S / 2, dy = (y + (sy + 0.5) / SS) - S / 2, d = Math.sqrt(dx * dx + dy * dy) / (S / 2);
      if (d > 1) continue;
      const glow = Math.pow(Math.max(0, 1 - Math.abs(d - 0.62) / 0.22), 1.4);
      const [cr, cg, cb] = hsv((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, 0.8, 1);
      r += 14 + (cr * 255 - 14) * glow; g += 15 + (cg * 255 - 15) * glow; b += 26 + (cb * 255 - 26) * glow; a += 255;
    }
    const n = SS * SS, o = y * (S * 4 + 1) + 1 + x * 4;
    raw[o] = a ? r / (a / 255) : 0; raw[o + 1] = a ? g / (a / 255) : 0; raw[o + 2] = a ? b / (a / 255) : 0; raw[o + 3] = a / n;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dir = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(dir, 'icon.png'), png(256));
const sizes = [16, 24, 32, 48, 64, 128, 256], imgs = sizes.map(png);
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = 6 + 16 * sizes.length; const entries = sizes.map((s, i) => { const e = Buffer.alloc(16); e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(imgs[i].length, 8); e.writeUInt32LE(off, 12); off += imgs[i].length; return e; });
fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([head, ...entries, ...imgs]));
console.log('icon.png + icon.ico erstellt');
