import { GF, GFP, CELLS, HULL_COL, CHORO, munVal, bosqueImg } from './domain/gf.js';
import { GeoMap, mx, my, inPoly } from './map.js';
import { G, P, S, ST, munName, prediosById } from './state.js';
import { CLS, esc, fmt, fdate, pip, polyAreaHa, badge, TODAY } from './util.js';
import { hByPid } from './domain/core.js';

// Semáforo ambiental de exportación (M1): Libre/Rehabilitado verde; En revisión/Con alerta ámbar; Bloqueado rojo; En restauración: restauración
const AMB_COL = { 'Libre': '#2E7D32', 'Rehabilitado': '#2E7D32', 'En revisión': '#A8720F', 'Con alerta': '#A8720F', 'Bloqueado': '#B3261E', 'En restauración': '#235B4E' };
export const AL_COLOR = { 'Detectada': '#235B4E', 'En validación': '#A8720F', 'Confirmada': '#A8720F', 'Notificada': '#9F2241', 'En audiencia': '#9F2241', 'Firme': '#B3261E', 'Descartada': '#6F7C77' };
export const SAT_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Crea el mapa estándar con todas sus capas. opts: {predioFilter, showAlerts, showLidar, showRest, z, onlyIds}
export function createMap(el, opts = {}) {
  const map = new GeoMap(el, { z: opts.z ?? 7.4 });
  const f = map.flt = { cls: new Set(['verde', 'amarillo', 'naranja', 'rojo', 'gris']), cul: '', mun: '', from: null, ids: opts.ids || null, alStates: new Set(Object.keys(AL_COLOR)), colorMode: 'clase' };
  map.sel = null; map.choro = opts.choro || 'none'; map.satAlpha = opts.objAlpha ?? .5;
  if (opts.sat !== false) { map.bg = '#0F2A24'; map.objAlpha = map.satAlpha; map.enableTiles(SAT_URL); map.on('tilefail', () => { map.enableTiles(null); map.bg = null; map.objAlpha = 1; }); }
  const munMax = () => Math.max(1, ...Object.values(ST.perMun).map(m => m.n ? (m.naranja + m.rojo) / m.n : 0));
  map.addLayer('mun', { type: 'poly', data: P.mun, order: 10, pickable: true, labels: true, labelZ: 7.6, labelFilter: p => p.franja || map.v.z > 9, labelColor: 'rgba(242,244,240,.85)',
    style: p => {
      if (map.choro === 'risk') { const m = ST.perMun[p.id]; const v = m && m.n ? (m.naranja + m.rojo) / m.n : 0; const t = Math.min(1, v / .42); return { fill: '#9F2241', fa: (m ? .25 + .5 * t : .1) * .85, stroke: '#6F7C77', lw: .8 }; }
      if (map.choro && map.choro.startsWith('gf:')) { const k = map.choro.slice(3); const mxv = map._gfMax || (map._gfMax = {}); const top = mxv[k] || (mxv[k] = Math.max(1e-9, ...Object.keys(GF.mun).map(id => munVal(id, k)))); const t = Math.min(1, Math.sqrt(munVal(p.id, k) / top)); const col = CHORO[k][1]; const hv = map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun'; return { fill: col, fa: .06 + .72 * t, stroke: hv ? '#FFFFFF' : 'rgba(242,244,240,.55)', lw: hv ? 1.8 : .7 }; }
      if (map.choro === 'alerts') { const m = ST.perMun[p.id]; const v = m ? m.alerts : 0; const t = Math.min(1, v / 30); return { fill: '#BC955C', fa: .05 + .6 * t, stroke: 'rgba(242,244,240,.4)', lw: .8 }; }
      const hv = map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun';
      if (map.tiles) return { fill: 'rgba(15,42,36,.06)', fa: 1, stroke: hv ? '#BC955C' : 'rgba(242,244,240,.5)', lw: hv ? 1.8 : .7 };
      return { fill: p.franja ? '#235B4E' : '#1E4D42', fa: 1, stroke: (map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun') ? '#BC955C' : 'rgba(242,244,240,.35)', lw: (map.hover && map.hover.p.id === p.id && map.hover.layer === 'mun') ? 1.6 : .8 };
    } });
  map.addLayer('state', { type: 'poly', data: P.state, order: 12, style: () => ({ stroke: map.tiles ? '#F2F4F0' : '#BC955C', lw: 2, sa: map.tiles ? .9 : .6 }) });
  map.addLayer('lakes', { type: 'poly', data: P.lakes, order: 13, style: () => ({ fill: '#45544F', fa: map.tiles ? .35 : .9, stroke: '#45544F', lw: 1 }) });
  map.addLayer('rivers', { type: 'line', data: P.rivers, order: 14, style: () => ({ stroke: '#6F7C77', lw: 1.6, alpha: .8 }) });
  const pf = p => f.cls.has(p.cls) && (!f.cul || p.cul === f.cul) && (!f.mun || p.mun === f.mun) && (!f.ids || f.ids.has(p.id));
  map.addLayer('predios', { type: 'poly', data: P.predios, order: 20, pickable: true, minZ: 7.4, minPx: 4, dotR: 2.1, filter: pf,
    style: (p, z) => { const c = CLS[p.cls].color; const sel = map.sel === p.id; const hov = map.hover && map.hover.layer === 'predios' && map.hover.p.id === p.id;
      if (f.colorMode === 'ambiental') { const h = hByPid[p.id]; const cc = h ? AMB_COL[h.estado] : '#6F7C77'; return { fill: cc, fa: sel ? .85 : .62, stroke: sel ? '#FFFFFF' : cc, lw: sel ? 2.4 : 1.1, alpha: 1 }; }
      if (f.colorMode === 'cultivo') { const cc = { Aguacate: '#2E7D32', Berries: '#9F2241', Durazno: '#A8720F', 'Maíz': '#BC955C', Agave: '#235B4E', Otro: '#6F7C77' }[p.cul]; return { fill: cc, fa: .5, stroke: cc, lw: 1, alpha: 1 }; }
      return { fill: c, fa: sel ? .8 : hov ? .7 : (map.tiles ? .6 : .48), stroke: sel ? '#FFFFFF' : map.tiles ? 'rgba(242,244,240,.95)' : c, lw: sel ? 2.4 : map.tiles ? 1.3 : 1.1, glow: sel ? '#235B4E' : null }; } });
  map.addLayer('heat', { type: 'custom', order: 22, visible: !!opts.heat, draw: (m, ctx) => { if (m.v.z > 10.2) return; ctx.globalCompositeOperation = 'lighter'; const r = 26 * Math.max(.6, (m.v.z - 5.5) / 2); for (const o of P.alertas) { if (!f.alStates.has(o.p.st)) continue; const [sx, sy] = m.toScreen(o.x, o.y); const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, 'rgba(179,38,30,.30)'); g.addColorStop(.5, 'rgba(168,114,15,.10)'); g.addColorStop(1, 'rgba(168,114,15,0)'); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2); } ctx.globalCompositeOperation = 'source-over'; } });
  map.addLayer('alertas', { type: 'point', data: P.alertas, order: 30, pickable: true, pickR: 10, visible: opts.showAlerts !== false, minZ: 7.4,
    filter: p => f.alStates.has(p.st) && (!f.mun || p.mun === f.mun) && (!f.from || new Date(p.d) >= f.from) && (!f.ids || !p.pid || f.ids.has(p.pid)),
    style: (p, z) => { const c = AL_COLOR[p.st]; const hot = p.st === 'Detectada' || p.st === 'En validación'; return { fill: c, stroke: '#0F2A24', r: Math.max(3, Math.min(8, (z - 6) * 1.1)), halo: hot ? c + '33' : null, alpha: p.st === 'Descartada' ? .5 : 1 }; } });
  map.addLayer('lidar', { type: 'point', data: P.estudios, order: 32, pickable: true, pickR: 12, visible: opts.showLidar !== false, minZ: 8.4, filter: p => !f.ids || f.ids.has(p.pid),
    style: (p, z) => ({ shape: 'diamond', fill: p.ver === 'Íntegro' ? '#235B4E' : p.ver === 'Rechazado' ? '#B3261E' : '#A8720F', stroke: '#0F2A24', r: Math.max(4, Math.min(8, (z - 7) * 1.2)) }) });
  map.addLayer('rest', { type: 'point', data: P.proyectos, order: 33, pickable: true, pickR: 12, visible: opts.showRest !== false, minZ: 8.4, filter: p => !f.ids || f.ids.has(p.pid),
    style: (p, z) => ({ shape: 'tri', fill: '#2E7D32', stroke: '#0F2A24', r: Math.max(4, Math.min(8, (z - 7) * 1.2)) }) });
  map.addLayer('user', { type: 'custom', order: 34, draw: (m, ctx) => { for (const L of S.userLayers) { if (!L.visible) continue; ctx.strokeStyle = '#9F2241'; ctx.fillStyle = 'rgba(159,34,65,.25)'; ctx.lineWidth = 1.6; for (const ft of L.prep) { if (ft.polys) { ctx.beginPath(); for (const poly of ft.polys) for (const ring of poly) m.path(ctx, ring, true); ctx.fill('evenodd'); ctx.stroke(); } else if (ft.pt) { const [sx, sy] = m.toScreen(ft.pt[0], ft.pt[1]); ctx.beginPath(); ctx.fillStyle = '#9F2241'; ctx.arc(sx, sy, 3.2, 0, 6.3); ctx.fill(); } } } } });
  // ---------- Guardián Forestal (datos reales; capas espaciales = muestra de tesela) ----------
  map.addLayer('gf_bosque', { type: 'custom', order: 15, visible: false, draw: (m, ctx) => { const im = bosqueImg(); if (!im.complete) { im.onload = () => m.redraw(); return; } const b = GF.bosque.bbox; const [x0, y0] = m.toScreen(mx(b[0]), my(b[3])), [x1, y1] = m.toScreen(mx(b[2]), my(b[1])); ctx.globalAlpha = .62; ctx.drawImage(im, x0, y0, x1 - x0, y1 - y0); ctx.globalAlpha = 1; } });
  map.addLayer('gf_sub', { type: 'poly', data: GFP.sub, order: 16, visible: false, pickable: true, labels: true, labelZ: 8.6, style: () => ({ fill: '#F2F4F0', fa: .05, stroke: '#F2F4F0', lw: 1.2 }) });
  map.addLayer('gf_cuenca', { type: 'poly', data: GFP.cuenca, order: 16, visible: false, pickable: true, style: () => ({ fill: '#45544F', fa: .12, stroke: '#45544F', lw: 1.6 }) });
  map.addLayer('gf_ran', { type: 'poly', data: GFP.ran, order: 17, visible: false, pickable: true, minPx: 2, style: p => ({ fill: p.tipo === 'comunidad' ? '#9F2241' : '#9F2241', fa: .1, stroke: '#9F2241', lw: .8 }) });
  map.addLayer('gf_anp', { type: 'poly', data: GFP.anp, order: 18, visible: false, pickable: true, style: p => ({ fill: '#2E7D32', fa: .18, stroke: '#235B4E', lw: 1.6 }) });
  map.addLayer('gf_alertas', { type: 'custom', order: 23, visible: false, draw: (m, ctx) => { const SZ = GF.alertCells.size; for (const c of CELLS) { const [x0, y0] = m.toScreen(mx(c.i * SZ), my((c.j + 1) * SZ)), [x1, y1] = m.toScreen(mx((c.i + 1) * SZ), my(c.j * SZ)); if (x1 < 0 || y1 < 0 || x0 > m.W || y0 > m.H) continue; const t = Math.min(1, Math.log10(1 + c.n) / 2.3); ctx.fillStyle = t > .55 ? `rgba(179,38,30,${.2 + .6 * t})` : `rgba(168,114,15,${.15 + .6 * t})`; ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)); } } });
  map.addLayer('gf_fires', { type: 'poly', data: GFP.fires, order: 24, visible: false, pickable: true, minPx: 3, dotR: 2.5, style: p => ({ fill: '#A8720F', fa: .35, stroke: '#BC955C', lw: 1 }) });
  map.addLayer('gf_ev', { type: 'poly', data: GFP.ev2026, order: 25, visible: false, pickable: true, minPx: 3, dotR: 2.6, style: () => ({ fill: '#B3261E', fa: .55, stroke: '#F2F4F0', lw: 1.2 }) });
  map.addLayer('gf_hulls', { type: 'point', data: GFP.hulls, order: 26, visible: false, pickable: true, minZ: 7, style: (p, z) => ({ fill: HULL_COL[p.o] || '#6F7C77', stroke: 'rgba(15,42,36,.4)', r: Math.max(1.6, Math.min(5, (z - 6.5) * .9)) }) });
  map.addLayer('gf_ollas', { type: 'point', data: GFP.ollas, order: 27, visible: false, pickable: true, minZ: 7, style: (p, z) => ({ shape: 'diamond', fill: '#45544F', stroke: 'rgba(15,42,36,.45)', r: Math.max(1.6, Math.min(5, (z - 6.5) * .9)) }) });
  map.addLayer('gf_calor', { type: 'point', data: GFP.calor, order: 28, visible: false, pickable: true, style: () => ({ fill: '#BC955C', stroke: '#0F2A24', r: 5, halo: '#FACC1544' }) });
  map.addLayer('gf_est', { type: 'point', data: GFP.est, order: 29, visible: false, pickable: true, style: () => ({ shape: 'tri', fill: '#F2F4F0', stroke: '#0F2A24', r: 5 }) });
  map.addLayer('gf_profepa', { type: 'point', data: GFP.profepa, order: 29, visible: false, pickable: true, style: () => ({ shape: 'diamond', fill: '#9F2241', stroke: '#0F2A24', r: 5 }) });
  map.addLayer('gf_den', { type: 'point', data: GFP.den, order: 29, visible: false, pickable: true, style: () => ({ fill: '#9F2241', stroke: '#0F2A24', r: 5 }) });
  map.addLayer('places', { type: 'custom', order: 40, draw: (m, ctx) => { if (m.v.z < 9.5) return; ctx.font = '600 10.5px IBM Plex Sans,system-ui,sans-serif'; ctx.textAlign = 'left'; for (const o of P.places) { if (m.v.z > 10.2 && false) continue; const [sx, sy] = m.toScreen(o.x, o.y); if (sx < 0 || sy < 0 || sx > m.W || sy > m.H) continue; ctx.fillStyle = '#F2F4F0'; ctx.beginPath(); ctx.rect(sx - 2.5, sy - 2.5, 5, 5); ctx.fill(); ctx.strokeStyle = 'rgba(15,42,36,.9)'; ctx.lineWidth = 3; ctx.strokeText(o.p.name, sx + 7, sy + 3.5); ctx.fillStyle = '#F2F4F0'; ctx.fillText(o.p.name, sx + 7, sy + 3.5); } } });
  map.tipFn = h => {
    const p = h.p;
    if (h.layer === 'predios') return `<div class="mono tiny dim">${esc(p.id)}</div><div>${badge(p.cls)} <span class="dim">· ${fmt(p.ha, 1)} ha · ${esc(p.cul)}</span></div><div class="tiny dim">${esc(munName[p.mun])} · ${esc(p.ten)}</div>`;
    if (h.layer === 'alertas') return `<div class="mono tiny dim">${esc(p.id)}</div><div><b style="color:${AL_COLOR[p.st]}">${esc(p.st)}</b> · ${fmt(p.ha, 2)} ha</div><div class="tiny dim">${esc(p.src)} · confianza ${esc(p.conf)} · ${fdate(p.d)}</div>`;
    if (h.layer === 'lidar') return `<div class="mono tiny dim">${esc(p.id)}</div><div>Levantamiento nivel ${p.nivel} · <b>${esc(p.ver)}</b></div><div class="tiny dim">${fdate(p.fecha)} · ${fmt(p.dens)} pts/m²</div>`;
    if (h.layer === 'rest') return `<div class="mono tiny dim">${esc(p.id)}</div><div>${esc(p.tipo)}</div><div class="tiny dim">${fmt(p.ha, 1)} ha · ${esc(p.st)}</div>`;
    if (h.layer === 'gf_ev') return `<div class="mono tiny dim">${esc(p.id)} · Guardián Forestal</div><div><b style="color:#B3261E">Alerta anual 2026 · ${esc(p.tipo)}</b></div><div class="tiny dim">${fmt(p.ha, 2)} ha</div>`;
    if (h.layer === 'gf_fires') return `<div class="mono tiny dim">${esc(p.id)} · CONAFOR vía Guardián Forestal</div><div><b style="color:#A8720F">Incendio ${esc(p.ini)}</b></div><div class="tiny dim">${esc(p.causa)} · ${esc(p.tipo)} · ${esc(p.impacto)}</div>`;
    if (h.layer === 'gf_anp') return `<b>${esc(p.name)}</b><div class="tiny dim">${esc(p.tipo)} · ${esc(p.cat)}</div>`;
    if (h.layer === 'gf_ran') return `<b>${esc(p.name)}</b><div class="tiny dim">Núcleo agrario (${esc(p.tipo)}) · RAN ${esc(p.prog)}</div>`;
    if (h.layer === 'gf_sub' || h.layer === 'gf_cuenca') return `<b>${esc(p.name)}</b><div class="tiny dim">${p.forest != null ? `Bosque remanente ${fmt(p.forest)} ha · huertas ${fmt(p.orchHa)} ha` : p.km2 ? fmt(p.km2) + ' km²' : ''}</div>`;
    if (h.layer === 'gf_hulls') return `<div><b style="color:${HULL_COL[p.o] || '#6F7C77'}">Cambio agrupado · ${esc(p.o)}</b></div><div class="tiny dim">${fmt(p.ha, 1)} ha · Guardián Forestal</div>`;
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
    if (k === 'sat') { const on = !map.tiles; map.enableTiles(on ? SAT_URL : null); b.classList.toggle('on', on); if (on) { map.bg = '#0F2A24'; map.objAlpha = map.satAlpha ?? .5; } else { map.bg = null; map.objAlpha = 1; } map.redraw(); }
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
