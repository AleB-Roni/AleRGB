'use strict';
/** Minimaler mDNS/DNS-SD-Browser (One-Shot-Query, RFC 6762 §5.1) – ohne externe Abhängigkeiten. */
const dgram = require('dgram');

function encName(name) {
  const parts = name.split('.').filter(Boolean);
  return Buffer.concat([...parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])), Buffer.from([0])]);
}
function readName(buf, off) {
  const labels = []; let jumped = false, end = off, guard = 0;
  while (guard++ < 64) {
    const len = buf[off];
    if (len === undefined) break;
    if ((len & 0xc0) === 0xc0) { if (!jumped) end = off + 2; off = ((len & 0x3f) << 8) | buf[off + 1]; jumped = true; continue; }
    if (len === 0) { if (!jumped) end = off + 1; break; }
    labels.push(buf.toString('utf8', off + 1, off + 1 + len)); off += len + 1;
  }
  return { name: labels.join('.'), end };
}
function parse(buf) {
  const qd = buf.readUInt16BE(4), an = buf.readUInt16BE(6), ns = buf.readUInt16BE(8), ar = buf.readUInt16BE(10);
  let off = 12; const recs = [];
  for (let i = 0; i < qd; i++) { off = readName(buf, off).end + 4; }
  for (let i = 0; i < an + ns + ar; i++) {
    const n = readName(buf, off); off = n.end;
    const type = buf.readUInt16BE(off), len = buf.readUInt16BE(off + 8); const d = off + 10; off = d + len;
    const r = { name: n.name, type };
    if (type === 12) r.ptr = readName(buf, d).name;
    else if (type === 33) { r.port = buf.readUInt16BE(d + 4); r.target = readName(buf, d + 6).name; }
    else if (type === 1) r.ip = [...buf.subarray(d, d + 4)].join('.');
    else if (type === 16) { r.txt = {}; let p = d; while (p < d + len) { const l = buf[p]; const s = buf.toString('utf8', p + 1, p + 1 + l); const [k, ...v] = s.split('='); r.txt[k] = v.join('='); p += l + 1; } }
    recs.push(r);
  }
  return recs;
}

/** Sucht Dienste, z.B. '_wled._tcp.local'. Liefert [{name, ip, port, txt}] */
function browse(service, timeout = 2500) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const found = new Map(); const all = [];
    const q = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), encName(service), Buffer.from([0, 12, 0x80, 1])]);
    sock.on('message', (msg, rinfo) => {
      try {
        const recs = parse(msg); all.push(...recs);
        for (const r of recs) if (r.type === 12 && r.name === service) found.set(r.ptr, { name: r.ptr.replace('.' + service, ''), ip: rinfo.address });
      } catch {}
    });
    sock.on('error', () => {});
    sock.bind(0, () => {
      try { sock.setMulticastTTL(255); } catch {}
      const send = () => sock.send(q, 5353, '224.0.0.251', () => {});
      send(); setTimeout(send, 800);
    });
    setTimeout(() => {
      try { sock.close(); } catch {}
      for (const [inst, v] of found) {
        const srv = all.find((r) => r.type === 33 && r.name === inst);
        if (srv) { v.port = srv.port; const a = all.find((r) => r.type === 1 && r.name === srv.target); if (a) v.ip = a.ip; }
        const txt = all.find((r) => r.type === 16 && r.name === inst); if (txt) v.txt = txt.txt;
      }
      resolve([...found.values()]);
    }, timeout);
  });
}
module.exports = { browse };
