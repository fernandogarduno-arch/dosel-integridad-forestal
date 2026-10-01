// Motor cartográfico ligero (Canvas 2D, Web Mercator). Sin dependencias externas.
import { haversine } from './util.js';
export const mx = lon => (lon + 180) / 360;
export const my = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
export const unx = x => x * 360 - 180;
export const uny = y => { const n = Math.PI - 2 * Math.PI * y; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

// Prepara FeatureCollection -> [{p, polys:[[Float64Array ring...]], bb}] en coordenadas mercator
export function prepPolys(fc) {
  return fc.features.map(f => {
    const g = f.geometry; const polysRaw = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
    const polys = polysRaw.map(poly => poly.map(ring => { const a = new Float64Array(ring.length * 2); ring.forEach((c, i) => { const X = mx(c[0]), Y = my(c[1]); a[2 * i] = X; a[2 * i + 1] = Y; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }); return a; }));
    return { p: f.properties, polys, bb: [x0, y0, x1, y1] };
  });
}
export function prepLines(fc) {
  return fc.features.map(f => {
    const g = f.geometry; const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    return { p: f.properties, lines: lines.map(l => { const a = new Float64Array(l.length * 2); l.forEach((c, i) => { a[2 * i] = mx(c[0]); a[2 * i + 1] = my(c[1]); }); return a; }) };
  });
}
export function prepPts(arr) { return arr.map(o => ({ p: o, x: mx(o.lon), y: my(o.lat) })); }
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) { const xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
export const inPoly = (x, y, polys) => polys.some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));

export class GeoMap {
  constructor(el, opts = {}) {
    this.el = el; el.classList.add('geomap');
    this.cv = document.createElement('canvas'); el.appendChild(this.cv); this.ctx = this.cv.getContext('2d');
    this.layers = []; this.ev = {}; this.v = { x: mx(-101.9), y: my(19.35), z: opts.z ?? 7.6 }; this.minZ = 6; this.maxZ = 18.5;
    this.tool = null; this.toolPts = []; this.hover = null; this.dirty = true; this.tiles = null; this.objAlpha = 1; this._ov = null; this._post = []; this.tileCache = new Map(); this.tileFail = 0; this.tileOk = 0;
    this.sel = null; this.mouse = null;
    this.hud = document.createElement('div'); this.hud.className = 'map-hud'; el.appendChild(this.hud);
    this.tip = document.createElement('div'); this.tip.className = 'map-tip'; el.appendChild(this.tip);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); this.resize(); this.bind(); this.loop();
  }
  destroy() { this.dead = true; this.ro.disconnect(); }
  on(e, fn) { (this.ev[e] ||= []).push(fn); return this; }
  emit(e, a) { (this.ev[e] || []).forEach(f => f(a)); }
  addLayer(id, l) { l.id = id; l.visible = l.visible !== false; this.layers.push(l); this.layers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); this.dirty = true; return l; }
  layer(id) { return this.layers.find(l => l.id === id); }
  show(id, v) { const l = this.layer(id); if (l) { l.visible = v; this.dirty = true; } }
  redraw() { this.dirty = true; }
  setObjAlpha(a) { this.objAlpha = Math.max(.1, Math.min(1, a)); this.dirty = true; }
  resize() { const r = this.el.getBoundingClientRect(); this.W = Math.max(50, r.width); this.H = Math.max(50, r.height); const d = window.devicePixelRatio || 1; this.cv.width = this.W * d; this.cv.height = this.H * d; this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; this.d = d; this.dirty = true; }
  get ws() { return 256 * Math.pow(2, this.v.z); }
  toScreen(x, y) { const ws = this.ws; return [(x - this.v.x) * ws + this.W / 2, (y - this.v.y) * ws + this.H / 2]; }
  fromScreen(px, py) { const ws = this.ws; return [this.v.x + (px - this.W / 2) / ws, this.v.y + (py - this.H / 2) / ws]; }
  lonlatAt(px, py) { const [x, y] = this.fromScreen(px, py); return [unx(x), uny(y)]; }
  fitBounds(b, pad = 40, animate = true) { // [w,s,e,n]
    const x0 = mx(b[0]), x1 = mx(b[2]), y0 = my(b[3]), y1 = my(b[1]); const z = Math.min(Math.log2((this.W - pad * 2) / 256 / Math.max(1e-9, x1 - x0)), Math.log2((this.H - pad * 2) / 256 / Math.max(1e-9, y1 - y0)));
    this.flyTo((x0 + x1) / 2, (y0 + y1) / 2, Math.min(this.maxZ, Math.max(this.minZ, z)), animate);
  }
  flyToLL(lon, lat, z, animate = true) { this.flyTo(mx(lon), my(lat), z, animate); }
  flyTo(x, y, z, animate = true) {
    if (!animate) { this.v = { x, y, z }; this.dirty = true; this.emit('move'); return; }
    const a = { ...this.v }, t0 = performance.now(), dur = 700; cancelAnimationFrame(this.anim);
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; this.v = { x: a.x + (x - a.x) * e, y: a.y + (y - a.y) * e, z: a.z + (z - a.z) * e }; this.dirty = true; this.emit('move'); if (k < 1) this.anim = requestAnimationFrame(step); }; this.anim = requestAnimationFrame(step);
  }
  zoomAt(px, py, dz) { const [x, y] = this.fromScreen(px, py); const nz = Math.min(this.maxZ, Math.max(this.minZ, this.v.z + dz)); this.v.z = nz; const [x2, y2] = this.fromScreen(px, py); this.v.x += x - x2; this.v.y += y - y2; this.dirty = true; this.emit('move'); }
  bind() {
    const cv = this.cv; let drag = null, moved = false, pinch = null;
    cv.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && this.ptrs && this.ptrs.size) { } cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, vx: this.v.x, vy: this.v.y }; moved = false; cancelAnimationFrame(this.anim); });
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; this.mouse = [px, py];
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; if (moved) { this.v.x = drag.vx - dx / this.ws; this.v.y = drag.vy - dy / this.ws; this.dirty = true; this.emit('move'); } }
      else this.doHover(px, py);
      this.updateHud();
    });
    cv.addEventListener('pointerup', e => { const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; if (drag && !moved) this.doClick(px, py, e); drag = null; });
    cv.addEventListener('pointerleave', () => { this.mouse = null; this.tip.style.display = 'none'; this.updateHud(); });
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, -e.deltaY * (e.ctrlKey ? .012 : .0022)); }, { passive: false });
    cv.addEventListener('dblclick', e => { const r = cv.getBoundingClientRect(); if (this.tool === 'draw' || this.tool === 'measure') return this.finishTool(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, 1); });
    // touch pinch
    let pd = null; cv.addEventListener('touchmove', e => { if (e.touches.length === 2) { e.preventDefault(); const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pd) { const r = cv.getBoundingClientRect(); this.zoomAt((e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top, Math.log2(d / pd)); } pd = d; } }, { passive: false });
    cv.addEventListener('touchend', () => { pd = null; });
  }
  setTool(t) { this.tool = t; this.toolPts = []; this.cv.style.cursor = t ? 'crosshair' : 'grab'; this.dirty = true; this.emit('tool', t); }
  finishTool() { const pts = this.toolPts.slice(); if (this.tool === 'draw' && pts.length >= 3) this.emit('draw', pts); if (this.tool === 'measure') this.emit('measure', pts); if (this.tool === 'draw') { this.drawn = pts; } this.tool = null; this.toolPts = []; this.cv.style.cursor = 'grab'; this.dirty = true; this.emit('tool', null); }
  clearDrawn() { this.drawn = null; this.toolPts = []; this.dirty = true; }
  pick(px, py) {
    const [x, y] = this.fromScreen(px, py);
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i]; if (!l.visible || !l.pickable || l.minZ > this.v.z) continue;
      if (l.type === 'point') { let best = null, bd = (l.pickR || 9) ** 2; for (const o of l.data) { const [sx, sy] = this.toScreen(o.x, o.y); const d = (sx - px) ** 2 + (sy - py) ** 2; if (d < bd && (!l.filter || l.filter(o.p))) { bd = d; best = o; } } if (best) return { layer: l.id, p: best.p }; }
      else if (l.type === 'poly') { for (let k = l.data.length - 1; k >= 0; k--) { const f = l.data[k]; if (x < f.bb[0] || x > f.bb[2] || y < f.bb[1] || y > f.bb[3]) continue; if (l.filter && !l.filter(f.p)) continue; if (inPoly(x, y, f.polys)) return { layer: l.id, p: f.p }; } }
    }
    return null;
  }
  doHover(px, py) {
    if (this.tool) { this.dirty = true; return; }
    const h = this.pick(px, py); const key = h ? h.layer + ':' + (h.p.id || h.p.name) : null; if (key !== this.hoverKey) { this.hoverKey = key; this.hover = h; this.dirty = true; this.cv.style.cursor = h ? 'pointer' : 'grab'; }
    if (h && this.tipFn) { const html = this.tipFn(h); if (html) { this.tip.innerHTML = html; this.tip.style.display = 'block'; const w = this.tip.offsetWidth; this.tip.style.left = Math.min(this.W - w - 8, px + 14) + 'px'; this.tip.style.top = Math.max(4, py - 8 - this.tip.offsetHeight * .5) + 'px'; return; } }
    this.tip.style.display = 'none';
  }
  doClick(px, py, e) {
    if (this.tool === 'draw' || this.tool === 'measure') { this.toolPts.push(this.lonlatAt(px, py)); this.dirty = true; this.emit('toolpts', this.toolPts); return; }
    const h = this.pick(px, py); this.emit('click', { hit: h, lonlat: this.lonlatAt(px, py), px, py });
  }
  updateHud() {
    const m = this.mouse; const [lon, lat] = m ? this.lonlatAt(m[0], m[1]) : [unx(this.v.x), uny(this.v.y)];
    const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, this.v.z + 0);
    // barra de escala
    const target = 110 * mpp; const pw = Math.pow(10, Math.floor(Math.log10(target))); const n = [1, 2, 5, 10].reduce((a, b) => Math.abs(b * pw - target) < Math.abs(a * pw - target) ? b : a); const meters = n * pw; const wpx = meters / mpp;
    const lab = meters >= 1000 ? (meters / 1000) + ' km' : meters + ' m';
    this.hud.innerHTML = `<span class="mono">${lat.toFixed(5)}°N ${Math.abs(lon).toFixed(5)}°O</span><span class="mono dim">z${this.v.z.toFixed(1)}</span><span class="scale"><i style="width:${wpx}px"></i>${lab}</span>`;
  }
  // ---- Teselas raster opcionales
  enableTiles(urlTpl, attribution) { this.tiles = urlTpl ? { url: urlTpl, attr: attribution } : null; this.tileFail = 0; this.tileOk = 0; this._tf = false; this.dirty = true; }
  getTile(z, x, y) { const k = z + '/' + x + '/' + y; let t = this.tileCache.get(k); if (t) return t; t = { img: new Image(), ok: false, err: false }; t.img.onload = () => { t.ok = true; this.tileOk++; this.dirty = true; }; t.img.onerror = () => { t.err = true; this.tileFail++; if (this.tileFail >= 6 && this.tileOk === 0 && this.tiles && !this._tf) { this._tf = true; this.emit('tilefail'); } }; t.img.src = this.tiles.url.replace('{z}', z).replace('{x}', x).replace('{y}', y); this.tileCache.set(k, t); if (this.tileCache.size > 600) { const first = this.tileCache.keys().next().value; this.tileCache.delete(first); } return t; }
  drawTiles(ctx) {
    const z = Math.min(17, Math.max(3, Math.round(this.v.z))); const n = 2 ** z; const ws = this.ws;
    const [x0, y0] = this.fromScreen(0, 0), [x1, y1] = this.fromScreen(this.W, this.H);
    const tx0 = Math.max(0, Math.floor(x0 * n)), tx1 = Math.min(n - 1, Math.floor(x1 * n)), ty0 = Math.max(0, Math.floor(y0 * n)), ty1 = Math.min(n - 1, Math.floor(y1 * n));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 60) return;
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) { const t = this.getTile(z, tx, ty); if (t.ok) { const [sx, sy] = this.toScreen(tx / n, ty / n); const s = ws / n; ctx.drawImage(t.img, sx, sy, s + .6, s + .6); } }
  }
  loop() { if (this.dead) return; if (this.dirty) { this.dirty = false; try { this.draw(); } catch (e) { console.error(e); } } requestAnimationFrame(() => this.loop()); }
  draw() {
    const ctx = this.ctx, d = this.d; ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = this.bg || '#0F2A24'; ctx.fillRect(0, 0, this.W, this.H);
    if (this.tiles) { this.drawTiles(ctx); }
    // gratícula
    this.drawGrid(ctx);
    const z = this.v.z; const oa = this.tiles ? this.objAlpha : 1; this._post = []; let c2 = ctx;
    if (oa < 1) { const ov = this._ov || (this._ov = document.createElement('canvas')); if (ov.width !== this.cv.width || ov.height !== this.cv.height) { ov.width = this.cv.width; ov.height = this.cv.height; } c2 = ov.getContext('2d'); c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, ov.width, ov.height); c2.setTransform(d, 0, 0, d, 0, 0); }
    for (const l of this.layers) {
      if (!l.visible || (l.minZ != null && z < l.minZ) || (l.maxZ != null && z > l.maxZ)) continue;
      c2.save();
      if (l.type === 'poly') this.drawPoly(c2, l); else if (l.type === 'line') this.drawLine(c2, l); else if (l.type === 'point') this.drawPts(c2, l); else if (l.draw) l.draw(this, c2);
      c2.restore();
    }
    if (oa < 1) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = oa; ctx.drawImage(this._ov, 0, 0); ctx.restore(); }
    for (const fn of this._post) { ctx.save(); try { fn(ctx); } catch (e) { console.error(e); } ctx.restore(); }
    // herramienta
    this.drawTool(ctx);
    this.updateHud();
  }
  drawGrid(ctx) {
    const z = this.v.z; const step = z < 7 ? 1 : z < 9 ? .5 : z < 11 ? .1 : .02; const [w, n] = this.lonlatAt(0, 0), [e, s] = this.lonlatAt(this.W, this.H); const lon0 = Math.floor(Math.min(w, e) / step) * step, lon1 = Math.max(w, e), lat0 = Math.floor(Math.min(s, n) / step) * step, lat1 = Math.max(s, n);
    ctx.strokeStyle = this.tiles ? 'rgba(242,244,240,0)' : 'rgba(242,244,240,.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let lo = lon0; lo <= lon1; lo += step) { const [x] = this.toScreen(mx(lo), 0); ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, this.H); }
    for (let la = lat0; la <= lat1; la += step) { const [, y] = this.toScreen(0, my(la)); ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(this.W, Math.round(y) + .5); }
    ctx.stroke();
  }
  path(ctx, arr, close) { const ws = this.ws, cx = this.v.x, cy = this.v.y, hw = this.W / 2, hh = this.H / 2; for (let i = 0; i < arr.length; i += 2) { const X = (arr[i] - cx) * ws + hw, Y = (arr[i + 1] - cy) * ws + hh; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } if (close) ctx.closePath(); }
  drawPoly(ctx, l) {
    const [x0, y0] = this.fromScreen(-20, -20), [x1, y1] = this.fromScreen(this.W + 20, this.H + 20);
    for (const f of l.data) {
      if (f.bb[2] < x0 || f.bb[0] > x1 || f.bb[3] < y0 || f.bb[1] > y1) continue; if (l.filter && !l.filter(f.p)) continue;
      const st = l.style(f.p, this.v.z, this); if (!st) continue;
      const sizePx = (f.bb[2] - f.bb[0]) * this.ws; if (sizePx < (l.minPx ?? 0)) { // demasiado pequeño: punto
        const [sx, sy] = this.toScreen((f.bb[0] + f.bb[2]) / 2, (f.bb[1] + f.bb[3]) / 2); ctx.fillStyle = st.fill || st.stroke; ctx.globalAlpha = st.alpha ?? 1; ctx.beginPath(); ctx.arc(sx, sy, l.dotR || 1.8, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; continue; }
      ctx.beginPath(); for (const poly of f.polys) for (const ring of poly) this.path(ctx, ring, true);
      if (st.fill) { ctx.globalAlpha = st.fa ?? 1; ctx.fillStyle = st.fill; ctx.fill('evenodd'); ctx.globalAlpha = 1; }
      if (st.stroke) { ctx.strokeStyle = st.stroke; ctx.lineWidth = st.lw ?? 1; ctx.globalAlpha = st.sa ?? 1; if (st.dash) ctx.setLineDash(st.dash); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      if (st.glow) { ctx.shadowColor = st.glow; ctx.shadowBlur = 12; ctx.strokeStyle = st.glow; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0; }
    }
    if (l.labels && this.v.z >= (l.labelZ ?? 8)) this._post.push(ctx => {
      ctx.font = '600 11px IBM Plex Sans, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      for (const f of l.data) { if (l.labelFilter && !l.labelFilter(f.p)) continue; const [sx, sy] = this.toScreen(f.p.cx ? mx(f.p.cx) : (f.bb[0] + f.bb[2]) / 2, f.p.cy ? my(f.p.cy) : (f.bb[1] + f.bb[3]) / 2); if (sx < -50 || sy < -20 || sx > this.W + 50 || sy > this.H + 20) continue;
        const sizePx = (f.bb[2] - f.bb[0]) * this.ws; if (sizePx < 42) continue; ctx.strokeStyle = 'rgba(15,42,36,.85)'; ctx.lineWidth = 3; ctx.strokeText(f.p.name, sx, sy); ctx.fillStyle = l.labelColor || 'rgba(242,244,240,.85)'; ctx.fillText(f.p.name, sx, sy); }
    });
  }
  drawLine(ctx, l) {
    for (const f of l.data) { const st = l.style(f.p, this.v.z); if (!st) continue; ctx.strokeStyle = st.stroke; ctx.lineWidth = st.lw || 1; ctx.globalAlpha = st.alpha ?? 1; ctx.beginPath(); for (const ln of f.lines) this.path(ctx, ln, false); ctx.stroke(); }
  }
  drawPts(ctx, l) {
    const z = this.v.z; for (const o of l.data) { if (l.filter && !l.filter(o.p)) continue; const [sx, sy] = this.toScreen(o.x, o.y); if (sx < -20 || sy < -20 || sx > this.W + 20 || sy > this.H + 20) continue; const st = l.style(o.p, z, this); if (!st) continue;
      ctx.globalAlpha = st.alpha ?? 1; const r = st.r ?? 4; if (st.halo) { ctx.fillStyle = st.halo; ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, 6.3); ctx.fill(); }
      ctx.fillStyle = st.fill || '#FFFFFF'; ctx.strokeStyle = st.stroke || '#0F2A24'; ctx.lineWidth = st.lw ?? 1.4; ctx.beginPath();
      if (st.shape === 'diamond') { ctx.moveTo(sx, sy - r * 1.3); ctx.lineTo(sx + r * 1.1, sy); ctx.lineTo(sx, sy + r * 1.3); ctx.lineTo(sx - r * 1.1, sy); ctx.closePath(); }
      else if (st.shape === 'square') ctx.rect(sx - r, sy - r, r * 2, r * 2);
      else if (st.shape === 'tri') { ctx.moveTo(sx, sy - r * 1.2); ctx.lineTo(sx + r * 1.1, sy + r * .9); ctx.lineTo(sx - r * 1.1, sy + r * .9); ctx.closePath(); }
      else ctx.arc(sx, sy, r, 0, 6.3);
      ctx.fill(); if (st.lw !== 0) ctx.stroke(); ctx.globalAlpha = 1; }
  }
  drawTool(ctx) {
    const pts = this.tool ? this.toolPts : (this.drawn || []); if (!pts.length) return; const sp = pts.map(p => this.toScreen(mx(p[0]), my(p[1])));
    ctx.save(); ctx.strokeStyle = '#BC955C'; ctx.fillStyle = 'rgba(188,149,92,.15)'; ctx.lineWidth = 2; ctx.setLineDash(this.tool ? [6, 4] : []); ctx.beginPath(); sp.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    if (this.tool && this.mouse) ctx.lineTo(this.mouse[0], this.mouse[1]); if (this.tool === 'draw' || !this.tool) { ctx.closePath(); ctx.fill(); } ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#34D399'; sp.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, 6.3); ctx.fill(); });
    if (this.tool === 'measure' && pts.length > 1) { let dist = 0; for (let i = 1; i < pts.length; i++) dist += haversine(pts[i - 1], pts[i]); const q = sp.at(-1); ctx.fillStyle = 'rgba(15,42,36,.85)'; ctx.fillRect(q[0] + 8, q[1] - 22, 92, 20); ctx.fillStyle = '#34D399'; ctx.font = '12px IBM Plex Mono, monospace'; ctx.fillText((dist / 1000).toFixed(2) + ' km', q[0] + 13, q[1] - 8); }
    ctx.restore();
  }
}
