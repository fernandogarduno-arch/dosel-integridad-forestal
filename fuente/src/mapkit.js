import { GF, GFP, CELLS, HULL_COL, CHORO, munVal, bosqueImg } from './domain/gf.js';
import { GeoMap, mx, my, inPoly } from './map.js';
import { G, P, S, ST, munName, prediosById } from './state.js';
import { CLS, esc, fmt, fdate, pip, polyAreaHa, badge, TODAY } from './util.js';

export const AL_COLOR = { 'Detectada': '#34D399', 'En validación': '#F59E0B', 'Confirmada': '#F97316', 'Notificada': '#A78BFA', 'En audiencia': '#C084FC', 'Firme': '#EF4444', 'Descartada': '#7E9C8B' };
export const SAT_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Crea el mapa estándar con todas sus capas. opts: {predioFilter, showAlerts, showLidar, showRest, z, onlyIds}
export function createMap(el, opts = {}) {
  const map = new GeoMap(el, { z: opts.z ?? 7.4 });
  const f = map.flt = { cls: new Set(['verde', 'amarillo', 'naranja', 'rojo', 'gris']), cul: '', mun: '', from: null, ids: opts.ids || null, alStates: new Set(Object.keys(AL_COLOR)), colorMode: 'clase' };
  map.sel = null; map.choro = opts.choro || 'none'; map.satAlpha = opts.objAlpha ?? .5;
  if (opts.sat !== false) { map.bg = '#000'; map.objAlpha = map.satAlpha; map.enableTiles(SAT_URL); map.on('tilefail', () => { map.enableTiles(null); map.bg = null; map.objAlpha = 1; }); }
  const munMax = () => Math.max(1, ...Object.values(ST.perMun).map(m => m.n ? (m.naranja + m.rojo) / m.n : 0));
  map.addLayer('mun', { type: 'poly', data: P.mun, order: 10, pickable: true, labels: true, labelZ: 7.6, labelFilter: p => p.franja || map.v.z > 9, labelColor: 'rgba(214,235,222,.85)',
    style: p => {
      if (map.choro === 'risk') { const m = ST.perMun[p.id]; const v = m && m.n ? (m.naranja + m.rojo) / m.n : 0; const t = Math.min(1, v / .42); return { fill: `rgba(${Math.round(30 + 210 * t)},${Math.round(60 + 20 * (1 - t))},${Math.round(80 - 40 * t)},${m ? .25 + .5 * t : .1})`, fa: 1, stroke: '#2E6A47', lw: .8 }; }
      if (map.choro && map.choro.startsWith('gf:')) { const k = map.choro.slice(3); const mxv = map._gfMax || (map._gfMax = {}); const top = mxv[k] || (mxv[k] = Math.max(1e-9, ...Object.keys(GF.mun).map(id => munVal(id, k)))); const t = Math.min(1, Math.sqrt(munVal(p.id, k) / top)); const col = CHORO[k][1]; const hv = map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun'; return { fill: col, fa: .06 + .72 * t, stroke: hv ? '#FFFFFF' : 'rgba(255,255,255,.55)', lw: hv ? 1.8 : .7 }; }
      if (map.choro === 'alerts') { const m = ST.perMun[p.id]; const v = m ? m.alerts : 0; const t = Math.min(1, v / 30); return { fill: `rgba(52,211,153,${.04 + .42 * t})`, fa: 1, stroke: '#2E6A47', lw: .8 }; }
      const hv = map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun';
      if (map.tiles) return { fill: 'rgba(8,26,17,.06)', fa: 1, stroke: hv ? '#6EE7B7' : 'rgba(255,255,255,.5)', lw: hv ? 1.8 : .7 };
      return { fill: p.franja ? '#123222' : '#0D2418', fa: 1, stroke: (map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun') ? '#6EE7B7' : '#2E6A47', lw: (map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun') ? 1.6 : .8 };
    } });
  map.addLayer('state', { type: 'poly', data: P.state, order: 12, style: () => ({ stroke: map.tiles ? '#FFFFFF' : '#6EE7B7', lw: 2, sa: map.tiles ? .9 : .6 }) });
  map.addLayer('lakes', { type: 'poly', data: P.lakes, order: 13, style: () => ({ fill: '#123452', fa: map.tiles ? .35 : .9, stroke: '#1F5C8C', lw: 1 }) });
  map.addLayer('rivers', { type: 'line', data: P.rivers, order: 14, style: () => ({ stroke: '#2B6CA3', lw: 1.6, alpha: .8 }) });
  const pf = p => f.cls.has(p.cls) && (!f.cul || p.cul === f.cul) && (!f.mun || p.mun === f.mun) && (!f.ids || f.ids.has(p.id));
  map.addLayer('predios', { type: 'poly', data: P.predios, order: 20, pickable: true, minZ: 7.4, minPx: 4, dotR: 2.1, filter: pf,
    style: (p, z) => { const c = CLS[p.cls].color; const sel = map.sel === p.id; const hov = map.hover && map.hover.layer === 'predios' && map.hover.p.id === p.id;
      if (f.colorMode === 'cultivo') { const cc = { Aguacate: '#4ADE80', Berries: '#F472B6', Durazno: '#FB923C', 'Maíz': '#FACC15', Agave: '#60A5FA', Otro: '#94A3B8' }[p.cul]; return { fill: cc, fa: .5, stroke: cc, lw: 1, alpha: 1 }; }
      return { fill: c, fa: sel ? .8 : hov ? .7 : (map.tiles ? .6 : .48), stroke: sel ? '#FFFFFF' : map.tiles ? 'rgba(255,255,255,.95)' : c, lw: sel ? 2.4 : map.tiles ? 1.3 : 1.1, glow: sel ? '#34D399' : null }; } });
  map.addLayer('heat', { type: 'custom', order: 22, visible: !!opts.heat, draw: (m, ctx) => { if (m.v.z > 10.2) return; ctx.globalCompositeOperation = 'lighter'; const r = 26 * Math.max(.6, (m.v.z - 5.5) / 2); for (const o of P.alertas) { if (!f.alStates.has(o.p.st)) continue; const [sx, sy] = m.toScreen(o.x, o.y); const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, 'rgba(255,90,60,.30)'); g.addColorStop(.5, 'rgba(255,170,40,.10)'); g.addColorStop(1, 'rgba(255,170,40,0)'); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2); } ctx.globalCompositeOperation = 'source-over'; } });
  map.addLayer('alertas', { type: 'point', data: P.alertas, order: 30, pickable: true, pickR: 10, visible: opts.showAlerts !== false, minZ: 7.4,
    filter: p => f.alStates.has(p.st) && (!f.mun || p.mun === f.mun) && (!f.from || new Date(p.d) >= f.from) && (!f.ids || !p.pid || f.ids.has(p.pid)),
    style: (p, z) => { const c = AL_COLOR[p.st]; const hot = p.st === 'Detectada' || p.st === 'En validación'; return { fill: c, stroke: '#0B2117', r: Math.max(3, Math.min(8, (z - 6) * 1.1)), halo: hot ? c + '33' : null, alpha: p.st === 'Descartada' ? .5 : 1 }; } });
  map.addLayer('lidar', { type: 'point', data: P.estudios, order: 32, pickable: true, pickR: 12, visible: opts.showLidar !== false, minZ: 8.4, filter: p => !f.ids || f.ids.has(p.pid),
    style: (p, z) => ({ shape: 'diamond', fill: p.ver === 'Íntegro' ? '#34D399' : p.ver === 'Rechazado' ? '#EF4444' : '#F59E0B', stroke: '#0B2117', r: Math.max(4, Math.min(8, (z - 7) * 1.2)) }) });
  map.addLayer('rest', { type: 'point', data: P.proyectos, order: 33, pickable: true, pickR: 12, visible: opts.showRest !== false, minZ: 8.4, filter: p => !f.ids || f.ids.has(p.pid),
    style: (p, z) => ({ shape: 'tri', fill: '#4ADE80', stroke: '#0B2117', r: Math.max(4, Math.min(8, (z - 7) * 1.2)) }) });
  map.addLayer('user', { type: 'custom', order: 34, draw: (m, ctx) => { for (const L of S.userLayers) { if (!L.visible) continue; ctx.strokeStyle = '#C084FC'; ctx.fillStyle = 'rgba(192,132,252,.25)'; ctx.lineWidth = 1.6; for (const ft of L.prep) { if (ft.polys) { ctx.beginPath(); for (const poly of ft.polys) for (const ring of poly) m.path(ctx, ring, true); ctx.fill('evenodd'); ctx.stroke(); } else if (ft.pt) { const [sx, sy] = m.toScreen(ft.pt[0], ft.pt[1]); ctx.beginPath(); ctx.fillStyle = '#C084FC'; ctx.arc(sx, sy, 3.2, 0, 6.3); ctx.fill(); } } } } });
  // ---------- Guardián Forestal (datos reales; capas espaciales = muestra de tesela) ----------
  map.addLayer('gf_bosque', { type: 'custom', order: 15, visible: false, draw: (m, ctx) => { const im = bosqueImg(); if (!im.complete) { im.onload = () => m.redraw(); return; } const b = GF.bosque.bbox; const [x0, y0] = m.toScreen(mx(b[0]), my(b[3])), [x1, y1] = m.toScreen(mx(b[2]), my(b[1])); ctx.globalAlpha = .62; ctx.drawImage(im, x0, y0, x1 - x0, y1 - y0); ctx.globalAlpha = 1; } });
  map.addLayer('gf_sub', { type: 'poly', data: GFP.sub, order: 16, visible: false, pickable: true, labels: true, labelZ: 8.6, style: () => ({ fill: '#0EA5E9', fa: .05, stroke: '#7DD3FC', lw: 1.2 }) });
  map.addLayer('gf_cuenca', { type: 'poly', data: GFP.cuenca, order: 16, visible: false, pickable: true, style: () => ({ fill: '#38BDF8', fa: .12, stroke: '#38BDF8', lw: 1.6 }) });
  map.addLayer('gf_ran', { type: 'poly', data: GFP.ran, order: 17, visible: false, pickable: true, minPx: 2, style: p => ({ fill: p.tipo === 'comunidad' ? '#C084FC' : '#E879F9', fa: .1, stroke: '#F0ABFC', lw: .8 }) });
  map.addLayer('gf_anp', { type: 'poly', data: GFP.anp, order: 18, visible: false, pickable: true, style: p => ({ fill: '#10B981', fa: .18, stroke: '#6EE7B7', lw: 1.6 }) });
  map.addLayer('gf_alertas', { type: 'custom', order: 23, visible: false, draw: (m, ctx) => { const SZ = GF.alertCells.size; for (const c of CELLS) { const [x0, y0] = m.toScreen(mx(c.i * SZ), my((c.j + 1) * SZ)), [x1, y1] = m.toScreen(mx((c.i + 1) * SZ), my(c.j * SZ)); if (x1 < 0 || y1 < 0 || x0 > m.W || y0 > m.H) continue; const t = Math.min(1, Math.log10(1 + c.n) / 2.3); ctx.fillStyle = `rgba(${Math.round(250)},${Math.round(200 - 160 * t)},${Math.round(60 - 40 * t)},${.15 + .6 * t})`; ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)); } } });
  map.addLayer('gf_fires', { type: 'poly', data: GFP.fires, order: 24, visible: false, pickable: true, minPx: 3, dotR: 2.5, style: p => ({ fill: '#F97316', fa: .35, stroke: '#FDBA74', lw: 1 }) });
  map.addLayer('gf_ev', { type: 'poly', data: GFP.ev2026, order: 25, visible: false, pickable: true, minPx: 3, dotR: 2.6, style: () => ({ fill: '#EF4444', fa: .55, stroke: '#FECACA', lw: 1.2 }) });
  map.addLayer('gf_hulls', { type: 'point', data: GFP.hulls, order: 26, visible: false, pickable: true, minZ: 7, style: (p, z) => ({ fill: HULL_COL[p.o] || '#94A3B8', stroke: 'rgba(0,0,0,.4)', r: Math.max(1.6, Math.min(5, (z - 6.5) * .9)) }) });
  map.addLayer('gf_ollas', { type: 'point', data: GFP.ollas, order: 27, visible: false, pickable: true, minZ: 7, style: (p, z) => ({ shape: 'diamond', fill: '#38BDF8', stroke: 'rgba(0,0,0,.45)', r: Math.max(1.6, Math.min(5, (z - 6.5) * .9)) }) });
  map.addLayer('gf_calor', { type: 'point', data: GFP.calor, order: 28, visible: false, pickable: true, style: () => ({ fill: '#FACC15', stroke: '#7C2D12', r: 5, halo: '#FACC1544' }) });
  map.addLayer('gf_est', { type: 'point', data: GFP.est, order: 29, visible: false, pickable: true, style: () => ({ shape: 'tri', fill: '#22D3EE', stroke: '#083344', r: 5 }) });
  map.addLayer('gf_profepa', { type: 'point', data: GFP.profepa, order: 29, visible: false, pickable: true, style: () => ({ shape: 'diamond', fill: '#A78BFA', stroke: '#2E1065', r: 5 }) });
  map.addLayer('gf_den', { type: 'point', data: GFP.den, order: 29, visible: false, pickable: true, style: () => ({ fill: '#F43F5E', stroke: '#4C0519', r: 5 }) });
  map.addLayer('places', { type: 'custom', order: 40, draw: (m, ctx) => { if (m.v.z < 9.5) return; ctx.font = '600 10.5px Inter,system-ui,sans-serif'; ctx.textAlign = 'left'; for (const o of P.places) { if (m.v.z > 10.2 && false) continue; const [sx, sy] = m.toScreen(o.x, o.y); if (sx < 0 || sy < 0 || sx > m.W || sy > m.H) continue; ctx.fillStyle = '#9FB0CB'; ctx.beginPath(); ctx.rect(sx - 2.5, sy - 2.5, 5, 5); ctx.fill(); ctx.strokeStyle = 'rgba(6,24,15,.9)'; ctx.lineWidth = 3; ctx.strokeText(o.p.name, sx + 7, sy + 3.5); ctx.fillStyle = '#C9D5EA'; ctx.fillText(o.p.name, sx + 7, sy + 3.5); } } });
  map.tipFn = h => {
    const p = h.p;
    if (h.layer === 'predios') return `<div class="mono tiny dim">${esc(p.id)}</div><div>${badge(p.cls)} <span class="dim">· ${fmt(p.ha, 1)} ha · ${esc(p.cul)}</span></div><div class="tiny dim">${esc(munName[p.mun])} · ${esc(p.ten)}</div>`;
    if (h.layer === 'alertas') return `<div class="mono tiny dim">${esc(p.id)}</div><div><b style="color:${AL_COLOR[p.st]}">${esc(p.st)}</b> · ${fmt(p.ha, 2)} ha</div><div class="tiny dim">${esc(p.src)} · confianza ${esc(p.conf)} · ${fdate(p.d)}</div>`;
    if (h.layer === 'lidar') return `<div class="mono tiny dim">${esc(p.id)}</div><div>Levantamiento nivel ${p.nivel} · <b>${esc(p.ver)}</b></div><div class="tiny dim">${fdate(p.fecha)} · ${fmt(p.dens)} pts/m²</div>`;
    if (h.layer === 'rest') return `<div class="mono tiny dim">${esc(p.id)}</div><div>${esc(p.tipo)}</div><div class="tiny dim">${fmt(p.ha, 1)} ha · ${esc(p.st)}</div>`;
    if (h.layer === 'gf_ev') return `<div class="mono tiny dim">${esc(p.id)} · Guardián Forestal</div><div><b style="color:#F87171">Alerta anual 2026 · ${esc(p.tipo)}</b></div><div class="tiny dim">${fmt(p.ha, 2)} ha</div>`;
    if (h.layer === 'gf_fires') return `<div class="mono tiny dim">${esc(p.id)} · CONAFOR vía Guardián Forestal</div><div><b style="color:#FB923C">Incendio ${esc(p.ini)}</b></div><div class="tiny dim">${esc(p.causa)} · ${esc(p.tipo)} · ${esc(p.impacto)}</div>`;
    if (h.layer === 'gf_anp') return `<b>${esc(p.name)}</b><div class="tiny dim">${esc(p.tipo)} · ${esc(p.cat)}</div>`;
    if (h.layer === 'gf_ran') return `<b>${esc(p.name)}</b><div class="tiny dim">Núcleo agrario (${esc(p.tipo)}) · RAN ${esc(p.prog)}</div>`;
    if (h.layer === 'gf_sub' || h.layer === 'gf_cuenca') return `<b>${esc(p.name)}</b><div class="tiny dim">${p.forest != null ? `Bosque remanente ${fmt(p.forest)} ha · huertas ${fmt(p.orchHa)} ha` : p.km2 ? fmt(p.km2) + ' km²' : ''}</div>`;
    if (h.layer === 'gf_hulls') return `<div><b style="color:${HULL_COL[p.o] || '#ccc'}">Cambio agrupado · ${esc(p.o)}</b></div><div class="tiny dim">${fmt(p.ha, 1)} ha · Guardián Forestal</div>`;
    if (h.layer === 'gf_ollas') return `<b>Olla / reservorio detectado</b><div class="tiny dim">Guardián Forestal</div>`;
    if (h.layer === 'gf_calor') return `<b>Punto de calor ${esc(p.f)}</b><div class="tiny dim">${esc(p.s)} · FRP ${fmt(p.frp, 1)} MW</div>`;
    if (h.layer === 'gf_est') return `<b>${esc(p.n)}</b><div class="tiny dim">Estación · ${fmt(p.e)} m · ${p.act ? 'activa' : 'inactiva'}</div>`;
    if (h.layer === 'gf_profepa') return `<b>${esc(p.t)}</b><div class="tiny dim">Actividad registrada por PROFEPA</div>`;
    if (h.layer === 'gf_den') return `<b>Denuncia canalizada</b><div class="tiny dim">${fmt(p.ha, 1)} ha · ${esc(p.au)}</div>`;
    if (h.layer === 'mun' && map.choro && map.choro.startsWith('gf:')) { const m = GF.mun[p.id]; return `<b>${esc(p.name)}</b> <span class="tiny dim">INEGI ${m ? m.cve : ''}</span>${m ? `<div class="tiny dim">Huertas ${fmt(m.orchHa)} ha · exportación ${fmt(m.expHa)} ha · bosque ${fmt(m.forest)} ha · ollas ${fmt(m.ollas)}</div>` : ''}`; }
    if (h.layer === 'mun') { const m = ST.perMun[p.id]; return `<b>${esc(p.name)}</b>${m ? `<div class="tiny dim">${m.n} predios · ${m.alerts} alertas · ${m.rojo} rojos · ${m.naranja} naranjas</div>` : `<div class="tiny dim">Sin predios inscritos en el piloto</div>`}`; }
    return null;
  };
  map.setSel = id => { map.sel = id; map.redraw(); };
  map.setFilters = o => { Object.assign(f, o); map.redraw(); };
  map.home = (anim = true) => map.fitBounds([-103.2, 18.6, -100.4, 20.15], 20, anim);
  map.home(false);
  return map;
}
export function locate(map, id) { const f = prediosById[id]; if (!f) return; const r = f.geometry.coordinates[0]; const xs = r.map(c => c[0]), ys = r.map(c => c[1]); map.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 90); map.setSel(id); }

// controles flotantes (zoom, inicio, medir, dibujar, satélite)
export function attachControls(wrap, map, o = {}) {
  const c = document.createElement('div'); c.className = 'mapctl';
  c.innerHTML = `<button data-c="in" title="Acercar">＋</button><button data-c="out" title="Alejar">－</button><button data-c="home" title="Vista del estado">⌂</button>` +
    (o.tools ? `<button data-c="draw" title="Dibujar área de análisis (doble clic para cerrar)">⬠</button><button data-c="measure" title="Medir distancia">↔</button>` : '') +
    (o.sat !== false ? `<button data-c="sat" title="Imagen satelital de referencia (requiere conexión; los polígonos de este prototipo no corresponden a huertas reales)">🛰</button>` : '');
  wrap.appendChild(c); if (map.tiles) { const sb = c.querySelector('[data-c=sat]'); sb && sb.classList.add('on'); }
  c.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const k = b.dataset.c;
    if (k === 'in') map.zoomAt(map.W / 2, map.H / 2, 1); if (k === 'out') map.zoomAt(map.W / 2, map.H / 2, -1); if (k === 'home') map.home();
    if (k === 'draw') { map.clearDrawn(); map.setTool(map.tool === 'draw' ? null : 'draw'); }
    if (k === 'measure') { map.clearDrawn(); map.setTool(map.tool === 'measure' ? null : 'measure'); }
    if (k === 'sat') { const on = !map.tiles; map.enableTiles(on ? SAT_URL : null); b.classList.toggle('on', on); if (on) { map.bg = '#000'; map.objAlpha = map.satAlpha ?? .5; } else { map.bg = null; map.objAlpha = 1; } map.redraw(); }
  });
  map.on('tool', t => { c.querySelectorAll('[data-c=draw],[data-c=measure]').forEach(b => b.classList.toggle('on', b.dataset.c === t)); });
  map.on('tilefail', () => { map.enableTiles(null); map.bg = null; map.objAlpha = 1; const s = c.querySelector('[data-c=sat]'); if (s) { s.classList.remove('on'); s.title = 'Sin conexión a la imagen satelital'; } wrap.dispatchEvent(new CustomEvent('satfail')); });
  return c;
}
export function areaStats(ring) {
  const inside = S.predios.features.filter(f => { const c = f.geometry.coordinates[0]; const cx = c.reduce((a, p) => a + p[0], 0) / c.length, cy = c.reduce((a, p) => a + p[1], 0) / c.length; return pip([cx, cy], ring); });
  const al = S.alertas.filter(a => pip([a.lon, a.lat], ring));
  const out = { area: polyAreaHa(ring), n: inside.length, ha: 0, by: { verde: 0, amarillo: 0, naranja: 0, rojo: 0, gris: 0 }, aff: 0, alertas: al.length, abiertas: al.filter(a => ['Detectada', 'En validación'].includes(a.st)).length, ids: inside.map(f => f.properties.id) };
  inside.forEach(f => { out.ha += f.properties.ha; out.by[f.properties.cls]++; out.aff += f.properties.aff || 0; }); return out;
}
