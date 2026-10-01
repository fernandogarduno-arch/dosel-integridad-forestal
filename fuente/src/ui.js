import { esc, fmt, fdate, CLS, badge, chip, rng, $, $$, on } from './util.js';
import * as ch from './charts.js';
import { S, prediosById, munName, estudioById } from './state.js';
import { VARS } from './semaforo.js';

export const IC = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14"/>', dash: '<path d="M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5.5a3 3 0 0 1 0 5.8M18 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
  alert: '<path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.5"/>', layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>', shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2.2 2.2L15.5 10"/>', file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4"/>', db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>', leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15m-1 0c2-5 5-8 9-10"/>',
  chart: '<path d="M4 20V10m6 10V4m6 16v-8m5 8H3"/>', book: '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4zM12 5v15"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  hash: '<path d="M8 3 6 21M18 3l-2 18M3 8h18M2 16h18"/>', key: '<circle cx="8" cy="14" r="4"/><path d="m11 11 9-8m-4 4 3 3"/>', drone: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><rect x="9" y="10" width="6" height="4" rx="1"/><path d="m7 7 3 3m7-3-3 3M7 17l3-3m7 3-3-3"/>',
  flag: '<path d="M5 21V4m0 0h12l-2 4 2 4H5"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>', scale: '<path d="M12 3v18M5 21h14M4 8h16M4 8l-2 7a3 3 0 0 0 6 0Zm16 0-2 7a3 3 0 0 0 6 0Z"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', download: '<path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16"/>', check: '<path d="m5 12 4 4 10-10"/>', plus: '<path d="M12 5v14M5 12h14"/>',
};
export const icon = (k, s = 17) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${IC[k] || ''}</svg>`;

export const kpi = o => `<div class="card kpi"><div class="l">${o.l}</div><div class="v" style="${o.c ? 'color:' + o.c : ''}">${o.v}</div><div class="s">${o.s || ''}${o.d ? ` <span class="d ${o.dc || ''}">${o.d}</span>` : ''}</div>${o.sp ? `<div class="sp">${o.sp}</div>` : ''}</div>`;
export const tag = (k) => `<span class="tag ${k}">${{ real: 'dato real', demo: 'demostración', plan: 'previsto' }[k]}</span>`;
export const stars = n => n == null ? '<span class="dim">—</span>' : `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;

export function modal(html, o = {}) {
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.innerHTML = `<div class="modal" style="${o.w ? 'max-width:' + o.w : ''}">${html}</div>`; document.body.appendChild(ov);
  const close = () => { ov.remove(); o.onClose && o.onClose(); };
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); }); ov.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  return { el: ov, close, q: s => $(s, ov) };
}

// ---------- Serie forestal ilustrativa por predio ----------
export function forestSeries(p) {
  const r = rng(p.id), base = 78 + r() * 18; const out = [];
  let drop = null; // año y fracción
  if (p.ly && (p.cls === 'naranja' || p.cls === 'rojo' || p.cls === 'amarillo')) drop = { y: p.ly, f: Math.min(.95, (p.aff || 0) / p.ha + .12) };
  else if (p.cls === 'verde' && r() < .45) drop = { y: 1996 + Math.floor(r() * 20), f: .4 + r() * .5 };
  for (let y = 1993; y <= 2025; y++) {
    let v = base + (r() - .5) * 3; if (drop && y >= drop.y) v = base * (1 - drop.f) + (r() - .5) * 3;
    if (drop && y > drop.y && p.cls === 'naranja' && drop.y < 2023) v += (y - drop.y) * (p.niv === 'N1' ? 1.4 : .5);
    if (p.cls === 'gris' && r() < .12) v = null; out.push([y, v == null ? null : Math.max(2, Math.min(99, v))]);
  }
  return { pts: out.filter(x => x[1] != null), drop, base };
}
export function forestChart(p, w = 560, h = 210) {
  const s = forestSeries(p); const v = [{ x: 2012, label: 'Fuego ref. 2012', color: '#A8720F' }, { x: 2018, label: 'Ref. 2018', color: '#A8720F' }]; if (s.drop && s.drop.y > 1996 && p.cls !== 'verde') v.push({ x: s.drop.y, label: 'Pérdida ' + s.drop.y, color: '#B3261E' });
  return ch.line([{ name: 'Cobertura arbórea (%)', color: '#235B4E', pts: s.pts, area: true, dots: false }], { w, h, ymax: 100, ymin: 0, yu: '', xticks: [1995, 2000, 2005, 2010, 2015, 2020, 2025], vlines: v, xmin: 1993, xmax: 2025 });
}
export function varsBars(p) {
  if (!p.v) return '<div class="dim tiny">Índice de Reversibilidad disponible sólo para predios con daño confirmado.</div>';
  return VARS.map((v, i) => `<div class="hbar" title="${esc(v.hint)}"><span>${v.k} · ${esc(v.name)}</span><span class="bar"><i style="width:${p.v[i] / v.max * 100}%;background:${p.v[i] / v.max > .66 ? '#2E7D32' : p.v[i] / v.max > .33 ? '#BC955C' : '#B3261E'}"></i></span><span>${p.v[i]}/${v.max}</span></div>`).join('');
}

// ---------- Imagen ilustrativa antes/después ----------
export function synthScene(cv, p, mode, ring) {
  const W = cv.width = 560, H = cv.height = 340, c = cv.getContext('2d'); const r = rng(p.id + 'img'); const r2 = rng(p.id + 'shape');
  c.fillStyle = '#16301f'; c.fillRect(0, 0, W, H); const greens = ['#1f4a2c', '#26583a', '#2f6b45', '#1b3d2a', '#3a7a4f', '#153323'];
  for (let i = 0; i < 1100; i++) { c.fillStyle = greens[Math.floor(r() * greens.length)]; c.globalAlpha = .55 + r() * .4; c.beginPath(); c.arc(r() * W, r() * H, 5 + r() * 9, 0, 6.3); c.fill(); } c.globalAlpha = 1;
  const xs = ring.map(q => q[0]), ys = ring.map(q => q[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); const lat = (y0 + y1) / 2; const kx = Math.cos(lat * Math.PI / 180);
  const sc = Math.min((W - 90) / ((x1 - x0) * kx), (H - 70) / (y1 - y0)); const ox = (W - (x1 - x0) * kx * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  const pts = ring.map(q => [ox + (q[0] - x0) * kx * sc, H - oy - (q[1] - y0) * sc]);
  const path = () => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); };
  if (mode === 'after' && (p.aff || p.cls === 'amarillo')) {
    const frac = Math.min(.92, (p.aff || 1) / p.ha); const cx = ox + (x1 - x0) * kx * sc * (.3 + r2() * .4), cy = oy + (y1 - y0) * sc * (.3 + r2() * .4);
    const areaPx = (x1 - x0) * kx * sc * (y1 - y0) * sc * .6; const rad = Math.max(30, Math.sqrt(frac * areaPx / Math.PI) * 1.05);
    c.save(); path(); c.clip(); c.beginPath(); c.arc(cx, cy, rad, 0, 6.3); c.clip();
    c.fillStyle = '#5c4b36'; c.fillRect(0, 0, W, H); for (let i = 0; i < 300; i++) { c.fillStyle = r() < .5 ? '#6b5940' : '#4d3f2d'; c.fillRect(r() * W, r() * H, 6 + r() * 14, 3 + r() * 6); }
    const rowsOn = p.cls !== 'amarillo'; if (rowsOn) { for (let yy = cy - rad; yy < cy + rad; yy += 12) { for (let xx = cx - rad; xx < cx + rad; xx += 12) { c.fillStyle = p.ly >= 2023 ? '#8bc26a' : '#4f9a45'; c.beginPath(); c.arc(xx + Math.sin(yy * .3) * 2, yy, p.ly >= 2023 ? 2 : 3.4, 0, 6.3); c.fill(); } } c.strokeStyle = 'rgba(15,42,36,.25)'; c.lineWidth = 1; for (let yy = cy - rad; yy < cy + rad; yy += 36) { c.beginPath(); c.moveTo(cx - rad, yy); c.quadraticCurveTo(cx, yy + 14, cx + rad, yy); c.stroke(); } }
    if (p.cau && p.cau.startsWith('Infra') || (rowsOn && r() < .35)) { c.fillStyle = '#0a2b35'; c.strokeStyle = '#5fb6c9'; c.lineWidth = 2; c.fillRect(cx + rad * .2, cy - rad * .5, 46, 28); c.strokeRect(cx + rad * .2, cy - rad * .5, 46, 28); }
    c.restore();
  }
  path(); c.strokeStyle = '#235B4E'; c.lineWidth = 2; c.setLineDash([7, 4]); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(15,42,36,.55)'; c.fillRect(W - 168, H - 22, 168, 22); c.fillStyle = '#F2F4F0'; c.font = '10px IBM Plex Mono, monospace'; c.fillText('IMAGEN ILUSTRATIVA · DEMO', W - 162, H - 7);
}
export function beforeAfter(host, p) {
  const ring = prediosById[p.id].geometry.coordinates[0]; const d1 = p.ly ? (p.ly - 1) : 2017, d2 = p.ly ? Math.min(2026, p.ly + 1) : 2026;
  host.innerHTML = `<div class="ba"><canvas class="b"></canvas><div class="after"><canvas class="a"></canvas></div><div class="hd"></div><span class="lb" style="left:8px">ANTES · ${d1}</span><span class="lb" style="right:8px">DESPUÉS · ${d2}</span></div>`;
  synthScene($('canvas.b', host), p, 'before', ring); synthScene($('canvas.a', host), p, 'after', ring);
  const ba = $('.ba', host), af = $('.after', ba), hd = $('.hd', ba); const set = x => { const pct = Math.max(2, Math.min(98, x)); af.style.clipPath = `inset(0 0 0 ${pct}%)`; hd.style.left = pct + '%'; };
  const mv = e => { const r = ba.getBoundingClientRect(); set(((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * 100); };
  ba.addEventListener('pointerdown', e => { ba.setPointerCapture(e.pointerId); mv(e); ba.onpointermove = mv; }); ba.addEventListener('pointerup', () => ba.onpointermove = null);
}
export const estadoChip = s => { const k = { 'Íntegro': 'ok', 'Con observaciones': 'warn', 'Rechazado': 'bad' }[s] || ''; return chip(s, k); };
export const projChip = s => chip(s, { 'En evaluación': 'info', 'Aprobado': 'vio', 'En ejecución': 'warn', 'En verificación': 'info', 'Cerrado': 'ok' }[s] || '');
export const conChip = s => chip(s, { 'Vigente': 'ok', 'Por vencer': 'warn', 'En trámite': 'info', 'Condicionada': 'warn', 'Suspendida': 'bad', 'Negada': 'bad', 'No emitida': '' }[s] || '');

// Ficha pública / de productor de un predio
export function predioFicha(id, level = 'public') {
  const f = prediosById[id]; if (!f) return '<div class="dim">Predio no encontrado</div>'; const p = f.properties; const proy = S.proyectos.find(x => x.pid === id); const al = S.alertas.filter(a => a.pid === id).sort((a, b) => b.d.localeCompare(a.d)); const est = S.estudios.find(e => e.pid === id);
  return `<div class="ch" style="margin-bottom:8px"><h2 class="mono">${esc(p.id)}</h2><div class="sp">${badge(p.cls)}</div></div>
  <dl class="kv"><dt>Municipio</dt><dd>${esc(munName[p.mun])}</dd><dt>Superficie</dt><dd class="mono">${fmt(p.ha, 1)} ha</dd><dt>Cultivo</dt><dd>${esc(p.cul)}</dd>
  ${level !== 'public' ? `<dt>Tenencia</dt><dd>${esc(p.ten)}</dd><dt>Productor</dt><dd class="mono">${esc(p.prd)}</dd>` : ''}
  <dt>Constancia</dt><dd>${conChip(p.con)}</dd><dt>Situación</dt><dd>${esc(p.est)}</dd>
  ${p.niv ? `<dt>Nivel de reversibilidad</dt><dd>${p.niv === 'N1' ? 'N1 · regeneración natural' : 'N2 · restauración asistida'}</dd>` : ''}
  ${p.aff ? `<dt>Superficie afectada (validada)</dt><dd class="mono">${fmt(p.aff, 1)} ha${p.ly ? ' · ' + p.ly : ''}</dd>` : ''}
  ${level !== 'public' && p.ir != null ? `<dt>Índice de reversibilidad</dt><dd class="mono">${p.ir}/100</dd>` : ''}</dl>
  <p class="tiny dim" style="margin:8px 0 4px">${CLS[p.cls].desc}.</p>
  ${proy ? `<div class="sec"><h3>Restauración</h3><div style="margin-top:6px">${esc(proy.tipo)} · ${fmt(proy.ha, 1)} ha · ${projChip(proy.st)}</div>${proy.surv ? `<div class="tiny dim" style="margin-top:4px">Supervivencia verificada: ${proy.surv} % · Calificación ${stars(proy.stars)}</div>` : ''}</div>` : ''}
  ${est ? `<div class="sec"><h3>Estudio LiDAR</h3><div style="margin-top:6px" class="mono tiny">${est.id} · ${fdate(est.fecha)} · ${estadoChip(est.ver)}</div></div>` : ''}
  ${al.length ? `<div class="sec"><h3>Alertas</h3>${al.slice(0, 4).map(a => `<div class="tiny" style="padding:3px 0"><span class="mono dim">${fdate(a.d)}</span> · ${esc(a.st)} · ${esc(a.src)}</div>`).join('')}</div>` : ''}
  <div class="sec"><h3>Cobertura arbórea 1993-2025 <span class="tag demo">ilustrativa</span></h3>${forestChart(p, 420, 170)}</div>`;
}
