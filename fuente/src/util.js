export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (n, d = 0) => fmt(n, d) + ' %';
export const fdate = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); };
export const ftime = s => { const d = new Date(s); return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); };
export function on(root, ev, sel, fn) { root.addEventListener(ev, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); }); }
export function rng(seed) { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let _dlq = Promise.resolve();
export function download(name, content, type = 'text/plain') {
  const fallback = () => { const b = content instanceof Blob ? content : new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const nm = name.replace(/\.geojson$/i, '.geojson.json');
  _dlq = _dlq.then(async () => {
    let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (!dl) return fallback();
    try { await dl.save({ filename: nm, data: content }); } catch (e) { if (e && e.code === 'declined') return; if (window.__toast) window.__toast('No se pudo guardar el archivo: ' + (e && e.message || e), 'warn'); else fallback(); }
  });
}
export const CLS = {
  verde: { name: 'Verde', color: '#22C55E', desc: 'Sin pérdida confirmada posterior a la fecha de referencia' },
  amarillo: { name: 'Amarillo', color: '#EAB308', desc: 'Indicio en validación (sin efectos jurídicos)' },
  naranja: { name: 'Naranja', color: '#F97316', desc: 'Daño confirmado y reversible: restauración exigible' },
  rojo: { name: 'Rojo', color: '#EF4444', desc: 'Daño irreversible o causal determinante' },
  gris: { name: 'Gris', color: '#8FAA98', desc: 'Información insuficiente o polígono sin validar' },
};
export const badge = (cls, txt) => `<span class="sem"><i style="background:${CLS[cls].color}"></i>${esc(txt || CLS[cls].name)}</span>`;
export const chip = (txt, kind = '') => `<span class="chip ${kind}">${esc(txt)}</span>`;
export const dot = c => `<i class="dot" style="background:${c}"></i>`;
export function toast(msg, kind = 'ok') { let t = document.getElementById('toasts'); if (!t) { t = document.createElement('div'); t.id = 'toasts'; document.body.appendChild(t); } const e = document.createElement('div'); e.className = 'toast ' + kind; e.textContent = msg; t.appendChild(e); setTimeout(() => e.classList.add('out'), 3800); setTimeout(() => e.remove(), 4300); }
export function polyAreaHa(ring) { // ring lon/lat
  const lat0 = ring.reduce((a, p) => a + p[1], 0) / ring.length; const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574; let a = 0;
  for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky); } return Math.abs(a) / 2 / 10000;
}
export function haversine(a, b) { const R = 6371008.8, r = Math.PI / 180; const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
export function pip(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c; } return c; }
export const TODAY = new Date('2026-09-29T12:00:00');
if (typeof window !== 'undefined') window.__toast = (m, k) => toast(m, k);
