// Erzeugt assets/icon.png (256x256) ohne externe Abhängigkeiten
const zlib = require('zlib'), fs = require('fs'), path = require('path');
const S = 256, px = Buffer.alloc(S * S * 4);
function hsv(h, s, v) { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; }
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5, d = Math.sqrt(dx * dx + dy * dy) / (S / 2);
  const k = (y * S + x) * 4;
  const bg = d < 0.98 ? 1 : Math.max(0, (1 - d) / 0.02);
  const ring = Math.max(0, 1 - Math.abs(d - 0.62) / 0.2);
  const [r, g, b] = hsv((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, 0.8, 1);
  const glow = Math.pow(ring, 1.5);
  px[k] = 14 + (r * 255 - 14) * glow; px[k + 1] = 15 + (g * 255 - 15) * glow; px[k + 2] = 26 + (b * 255 - 26) * glow; px[k + 3] = 255 * bg;
}
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), png);
console.log('icon.png erstellt');
