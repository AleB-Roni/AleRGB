'use strict';
/* global h, icon, esc, Pages, Capture, b64, api, Thumbs */
const App = {
  state: null, page: 'effects', lock: false,
  order: ['devices', 'effects', 'studio', 'layout', 'kraken', 'profiles', 'integrations', 'diagnostics', 'settings'],
  async init() {
    this.state = await api('state:get');
    if (!this.state.devices.length) this.page = 'devices';
    window.spectra.on('state', (s) => this.onState(s));
    window.spectra.on('preview', (p) => this.onPreview(p));
    window.spectra.on('log', (l) => Pages.studio.onLog && Pages.studio.onLog(l));
    window.spectra.on('kraken', (k) => { Pages.kraken.data = k; if (this.page === 'kraken') Pages.kraken.update(); });
    document.getElementById('powerBtn').innerHTML = icon('power');
    document.getElementById('powerBtn').onclick = () => api('settings:update', { power: !this.state.settings.power });
    const br = document.getElementById('brightness');
    br.addEventListener('input', () => { rangeFill(br); document.getElementById('brightVal').textContent = br.value + '%'; this._bt && clearTimeout(this._bt); this._bt = setTimeout(() => api('settings:update', { brightness: Number(br.value) }), 60); });
    document.querySelectorAll('[data-icon]').forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
    this.renderChrome();
    this.go(this.page);
    Capture.sync(this.state.requirements, this.state.settings);
  },
  onState(s) {
    const prevReq = (this.state.requirements || []).join();
    this.state = s;
    this.renderChrome();
    if (s.requirements.join() !== prevReq) Capture.sync(s.requirements, s.settings); else Capture.sync(s.requirements, s.settings);
    const ae = document.activeElement;
    const editing = ae && document.getElementById('page').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.type !== 'checkbox';
    if (this.lock || editing || (this.page === 'studio' || this.page === 'kraken')) { this._dirty = true; return; }
    this.rerender();
  },
  renderChrome() {
    const s = this.state;
    const nav = document.getElementById('nav'); nav.innerHTML = '';
    const errs = s.drivers.filter((d) => d.config.enabled && d.status === 'error').length;
    for (const id of this.order) {
      const P = Pages[id];
      const badge = id === 'devices' ? s.devices.length : id === 'integrations' && errs ? errs : id === 'effects' ? s.effects.length : null;
      nav.appendChild(h('button' + (id === this.page ? '.active' : ''), { onclick: () => this.go(id) }, [icon(P.icon), h('span', P.title), badge !== null ? h('span.badge' + (id === 'integrations' ? '.err' : ''), String(badge)) : null]));
    }
    const pb = document.getElementById('powerBtn'); pb.classList.toggle('on', !!s.settings.power);
    const br = document.getElementById('brightness');
    if (document.activeElement !== br) { br.value = s.settings.brightness; rangeFill(br); document.getElementById('brightVal').textContent = s.settings.brightness + '%'; }
    const fx = s.effects.find((e) => e.key === s.effect.key);
    document.getElementById('tbEffect').innerHTML = `Effekt: <b>${esc(fx ? fx.name : '—')}</b>`;
    document.getElementById('sideEffectName').textContent = fx ? fx.name : '—';
  },
  go(id) {
    if ((this.page === 'studio' || this.page === 'kraken') && id !== 'studio') Pages.studio.leave();
    this.page = id; this.renderChrome(); this.rerender();
    document.getElementById('page').scrollTop = 0;
  },
  openStudio(tab, data) { Pages.studio.open(tab, data); this.go('studio'); },
  rerender() {
    this._dirty = false;
    const root = document.getElementById('page');
    const st = root.scrollTop;
    Thumbs.clear();
    root.innerHTML = ''; root.ondragover = null;
    Pages[this.page].render(root);
    root.scrollTop = st;
  },
  paint(cv, p) {
    if (!cv) return;
    if (cv.width !== p.w) { cv.width = p.w; cv.height = p.h; }
    const ctx = cv.getContext('2d');
    if (!this._img || this._img.width !== p.w) this._img = ctx.createImageData(p.w, p.h);
    if (this._imgSrc !== p) {
      const src = b64(p.img), d = this._img.data;
      for (let i = 0, j = 0; i < src.length; i += 3, j += 4) { d[j] = src[i]; d[j + 1] = src[i + 1]; d[j + 2] = src[i + 2]; d[j + 3] = 255; }
      this._imgSrc = p;
    }
    ctx.putImageData(this._img, 0, 0);
  },
  onPreview(p) {
    this.paint(document.getElementById('sidePreview'), p);
    const P = Pages[this.page]; if (P.onPreview) P.onPreview(p);
    if (this._dirty && !this.lock && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) && this.page !== 'studio' && this.page !== 'kraken') this.rerender();
  },
};
window.addEventListener('DOMContentLoaded', () => App.init().catch((e) => { document.getElementById('page').textContent = 'Fehler: ' + e.message; console.error(e); }));
