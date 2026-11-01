'use strict';
/**
 * GIF-Browser: Suche über GIPHY (kostenloser API-Schlüssel) + Download beliebiger GIF-Links
 * (direkte .gif-Links, GIPHY-/Tenor-Seiten, Reddit, Imgur …).
 */
const MAX_BYTES = 40 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AleRGB';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error('GIPHY-API-Schlüssel ungültig oder gesperrt.');
  if (res.status === 429) throw new Error('GIPHY-Limit erreicht – bitte etwas später erneut versuchen.');
  if (!res.ok) throw new Error(`GIPHY antwortet mit HTTP ${res.status}`);
  return JSON.parse(text);
}

function mapGiphy(g) {
  const im = g.images || {};
  const preview = im.fixed_width || im.fixed_width_downsampled || im.preview_gif || im.original;
  // „downsized_large“ ist ≤ 8 MB und reicht für das Display; sonst Original
  const full = im.downsized_large || im.original;
  return {
    id: g.id, title: g.title || '',
    preview: preview && (preview.webp || preview.url),
    url: full && full.url,
    width: Number((full && full.width) || 0), height: Number((full && full.height) || 0),
    size: Number((full && full.size) || 0),
  };
}

/** Sucht GIFs. Leere Suche = aktuelle Trends. */
async function search(key, query, offset = 0, limit = 30) {
  if (!key) throw new Error('Für die Suche wird ein kostenloser GIPHY-API-Schlüssel benötigt.');
  const q = String(query || '').trim();
  const base = q ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending';
  const params = new URLSearchParams({ api_key: key, limit: String(limit), offset: String(offset), rating: 'pg-13', bundle: 'messaging_non_clips' });
  if (q) { params.set('q', q); params.set('lang', 'de'); }
  const j = await getJson(`${base}?${params}`);
  const items = (j.data || []).map(mapGiphy).filter((x) => x.url && x.preview);
  const p = j.pagination || {};
  return { items, offset: (p.offset || offset) + (p.count || items.length), total: p.total_count ?? null };
}

/** Wandelt Seiten-Links in direkte GIF-Links um, wo das ohne Netzwerk geht. */
function normalizeUrl(u) {
  u = String(u || '').trim();
  if (!/^https?:\/\//i.test(u)) throw new Error('Bitte einen Link angeben, der mit http(s):// beginnt.');
  // giphy.com/gifs/name-ID  bzw. giphy.com/embed/ID  → media.giphy.com/media/ID/giphy.gif
  let m = /giphy\.com\/(?:gifs|embed|stickers|clips)\/(?:[\w-]*-)?([A-Za-z0-9]{8,})(?:[/?#]|$)/i.exec(u);
  if (m) return `https://media.giphy.com/media/${m[1]}/giphy.gif`;
  m = /media\d*\.giphy\.com\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]+)\//i.exec(u);
  if (m && !/\.gif(\?|$)/i.test(u)) return `https://media.giphy.com/media/${m[1]}/giphy.gif`;
  // Imgur .gifv/.mp4 → .gif
  m = /^(https?:\/\/i\.imgur\.com\/\w+)\.(gifv|mp4|webm)/i.exec(u);
  if (m) return m[1] + '.gif';
  return u;
}

/** Sucht in einer HTML-Seite nach dem eigentlichen GIF (og:image, Tenor-Media-Links …). */
function findGifInHtml(html) {
  const metas = [/property=["']og:image["'][^>]*content=["']([^"']+\.gif[^"']*)/i, /content=["']([^"']+\.gif[^"']*)["'][^>]*property=["']og:image/i, /name=["']twitter:image["'][^>]*content=["']([^"']+\.gif[^"']*)/i];
  for (const re of metas) { const m = re.exec(html); if (m) return m[1].replace(/&amp;/g, '&'); }
  const any = /https?:\/\/[^"'\s<>]+?\.gif(?:\?[^"'\s<>]*)?/i.exec(html);
  return any ? any[0].replace(/&amp;/g, '&') : null;
}

/** Lädt ein GIF (oder Bild) herunter. Gibt { data: Uint8Array, name, type } zurück. */
async function download(url, depth = 0) {
  const u = normalizeUrl(url);
  const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'image/gif,image/*;q=0.9,text/html;q=0.5,*/*;q=0.1' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status}).`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error(`Datei zu groß (${(len / 1e6).toFixed(1)} MB, max. 40 MB).`);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('Datei zu groß (max. 40 MB).');
  const sig = Buffer.from(buf.subarray(0, 12)).toString('latin1');
  if (sig.startsWith('GIF8')) return { data: buf, name: fileName(u, 'gif'), type: 'image/gif' };
  if (sig.startsWith('\x89PNG')) return { data: buf, name: fileName(u, 'png'), type: 'image/png' };
  if (sig.startsWith('\xff\xd8\xff')) return { data: buf, name: fileName(u, 'jpg'), type: 'image/jpeg' };
  if (sig.startsWith('RIFF') && sig.slice(8, 12) === 'WEBP') return { data: buf, name: fileName(u, 'webp'), type: 'image/webp' };
  if (type.includes('html') && depth === 0) {
    const gif = findGifInHtml(Buffer.from(buf).toString('utf8'));
    if (gif) return download(new URL(gif, u).href, 1);
    throw new Error('Auf dieser Seite wurde kein GIF gefunden. Tipp: Rechtsklick auf das GIF → „Bildadresse kopieren“.');
  }
  if (/mp4|webm|video/.test(type)) throw new Error('Das ist ein Video, kein GIF. Bitte den direkten GIF-Link verwenden.');
  throw new Error('Der Link liefert kein GIF oder Bild.');
}
function fileName(u, ext) {
  try { const p = new URL(u).pathname.split('/').filter(Boolean); const base = (p.length > 1 && /^giphy/.test(p[p.length - 1]) ? p[p.length - 2] : p[p.length - 1]) || 'gif'; return base.replace(/\.[a-z0-9]+$/i, '') + '.' + ext; } catch { return 'download.' + ext; }
}

module.exports = { search, download, normalizeUrl, findGifInHtml, mapGiphy };
