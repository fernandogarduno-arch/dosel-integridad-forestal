import { $, $$, on, esc, fmt, fdate, CLS, badge, chip, toast } from '../util.js';
import { S, ST, G, munName, prediosById, alertaById, estudioById } from '../state.js';
import { createMap, attachControls, areaStats, locate, AL_COLOR } from '../mapkit.js';
import { predioFicha, kpi, estadoChip, projChip, stars, icon, tag } from '../ui.js';
import { GF, CHORO, HULL_COL } from '../domain/gf.js';

export const publicIds = () => new Set(S.predios.features.filter(f => f.properties.cls === 'verde' || ((f.properties.cls === 'naranja' || f.properties.cls === 'rojo') && ['Firme', 'En restauración'].includes(f.properties.est))).map(f => f.properties.id));

export function mapPage(main, o = {}) {
  const admin = o.level === 'admin'; main.className = 'main flush';
  const ids = admin ? null : publicIds();
  const cnt = c => S.predios.features.filter(f => f.properties.cls === c && (!ids || ids.has(f.properties.id))).length;
  main.innerHTML = `<div class="split"><div class="mapwrap"><div id="mp" style="height:100%"></div>
  <div class="legend" id="lg">
    <h4 class="lgh" id="lgh" style="cursor:pointer;display:flex;justify-content:space-between">Capas <span>▾</span></h4>
    <label><input type="checkbox" data-l="predios" checked><span class="sw" style="background:linear-gradient(90deg,#2E7D32,#A8720F,#B3261E)"></span>Predios (semáforo)</label>
    ${admin ? `<label><input type="checkbox" data-l="alertas" checked><span class="sw" style="background:#A8720F;border-radius:50%"></span>Alertas</label><label><input type="checkbox" data-l="heat"><span class="sw" style="background:radial-gradient(#B3261E,transparent)"></span>Mapa de calor de alertas</label><label><input type="checkbox" data-l="lidar" checked><span class="sw" style="background:#235B4E;transform:rotate(45deg) scale(.8)"></span>Levantamientos LiDAR</label>` : ''}
    <label><input type="checkbox" data-l="rest" checked><span class="sw" style="background:#2E7D32;clip-path:polygon(50% 0,100% 100%,0 100%)"></span>Proyectos de restauración</label>
    <label><input type="checkbox" data-l="rivers" checked><span class="sw" style="background:#6F7C77"></span>Ríos y lagos</label>
    ${admin ? `<label><input type="checkbox" data-l="user" checked><span class="sw" style="background:#9F2241"></span>Capas cargadas (ingesta)</label>` : ''}
    <hr><h4>Semáforo</h4>
    ${['verde', 'naranja', 'rojo'].concat(admin ? ['amarillo', 'gris'] : []).map(c => `<label><input type="checkbox" data-c="${c}" checked><span class="sw" style="background:${CLS[c].color}"></span>${CLS[c].name}<span class="mono dim" style="margin-left:auto">${fmt(cnt(c))}</span></label>`).join('')}
    <hr><h4>Guardián Forestal ${tag('real')}</h4>
    <label style="display:block;color:var(--mut)">Municipios por<select id="gfc" style="margin-top:3px"><option value="">— Sin coloreado —</option>${Object.entries(CHORO).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
    <div class="tiny dim" style="margin:6px 0 4px">Capas de muestra · sur de la franja aguacatera</div>
    ${[['gf_bosque', 'Bosque detectado 2023', '#2E7D32'], ['gf_alertas', 'Alertas Guardián 2018-2024 (densidad)', '#A8720F'], ['gf_ev', 'Alertas anuales 2026', '#B3261E'], ['gf_fires', 'Incendios CONAFOR 2012-2024', '#A8720F'], ['gf_hulls', 'Cambios agrupados por origen', '#BC955C'], ['gf_ollas', 'Ollas / reservorios', '#45544F'], ['gf_anp', 'Áreas naturales protegidas', '#2E7D32'], ['gf_ran', 'Núcleos agrarios (RAN)', '#9F2241'], ['gf_sub', 'Subcuencas', '#F2F4F0'], ['gf_cuenca', 'Cuenca de Pátzcuaro', '#45544F'], ['gf_calor', 'Puntos de calor sep-2026', '#BC955C'], ['gf_est', 'Estaciones de monitoreo', '#F2F4F0']].concat(admin ? [['gf_profepa', 'Actividades PROFEPA', '#9F2241'], ['gf_den', 'Denuncias canalizadas', '#9F2241']] : []).map(([k, n, c]) => `<label><input type="checkbox" data-l="${k}"><span class="sw" style="background:${c}"></span>${n}</label>`).join('')}
    <hr><h4>Colorear / Analizar por</h4>
    <div class="pill-tabs" id="cm"><button data-m="clase" class="on">Semáforo</button><button data-m="cultivo">Cultivo</button></div>
    <div class="pill-tabs" id="ch" style="margin-top:6px"><button data-m="none" class="on">Sin</button><button data-m="risk">Riesgo</button>${admin ? '<button data-m="alerts">Alertas</button>' : ''}</div>
    <hr><label style="display:block;color:var(--mut)">Municipio<select id="fm" style="margin-top:3px"><option value="">Todos</option>${G.municipios.features.filter(f => ST.perMun[f.properties.id]).sort((a, b) => a.properties.name.localeCompare(b.properties.name)).map(f => `<option value="${f.properties.id}">${esc(f.properties.name)}</option>`).join('')}</select></label>
    <label style="display:block;color:var(--mut);margin-top:6px">Cultivo<select id="fc" style="margin-top:3px"><option value="">Todos</option>${['Aguacate', 'Berries', 'Durazno', 'Maíz', 'Agave', 'Otro'].map(c => `<option>${c}</option>`).join('')}</select></label>
    ${admin ? `<label style="display:block;color:var(--mut);margin-top:6px">Alertas desde<select id="ff" style="margin-top:3px"><option value="">Todas</option><option value="7">7 días</option><option value="30">30 días</option><option value="90">90 días</option><option value="180">180 días</option></select></label>` : ''}
    <div class="tiny dim" style="margin-top:8px">Predios: <b class="mono" id="vis" style="color:#1B2A26">—</b></div>
  </div></div>
  <aside class="side" id="side"></aside></div>`;
  { const lg = main.querySelector('#lg'); const h = main.querySelector('#lgh'); if (innerWidth < 760) lg.classList.add('min'); h.onclick = () => lg.classList.toggle('min'); }
  const wrap = $('.mapwrap', main); const map = createMap($('#mp', main), { ids, showAlerts: admin, showLidar: admin, heat: false, z: 7.3 });
  if (!admin) map.show('alertas', false), map.show('lidar', false);
  attachControls(wrap, map, { tools: admin });
  wrap.addEventListener('satfail', () => window.__satToast || (window.__satToast = 1, toast('No hay conexión a la imagen satelital desde este entorno; se mantiene el mapa vectorial.', 'warn')));
  const side = $('#side', main); const upVis = () => { const f = map.flt; const n = S.predios.features.filter(x => { const p = x.properties; return f.cls.has(p.cls) && (!f.cul || p.cul === f.cul) && (!f.mun || p.mun === f.mun) && (!ids || ids.has(p.id)); }).length; $('#vis', main).textContent = fmt(n); };
  const lg = $('#lg', main);
  lg.addEventListener('change', e => {
    const t = e.target; if (t.dataset.l) map.show(t.dataset.l, t.checked); if (t.dataset.c) { const s = new Set(map.flt.cls); t.checked ? s.add(t.dataset.c) : s.delete(t.dataset.c); map.setFilters({ cls: s }); }
    if (t.id === 'fm') { map.setFilters({ mun: t.value }); if (t.value) { const f = G.municipios.features.find(f => f.properties.id === t.value); const xs = [], ys = []; (function w(c) { if (typeof c[0] === 'number') { xs.push(c[0]); ys.push(c[1]); } else c.forEach(w); })(f.geometry.coordinates); map.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 60); } else map.home(); }
    if (t.id === 'gfc') { map.choro = t.value ? 'gf:' + t.value : 'none'; $$('#ch button', lg).forEach(x => x.classList.toggle('on', x.dataset.m === 'none')); map.redraw(); if (t.value) map.home(); }
    if (t.id === 'fc') map.setFilters({ cul: t.value }); if (t.id === 'ff') map.setFilters({ from: t.value ? new Date(new Date('2026-09-29').getTime() - t.value * 864e5) : null }); upVis();
  });
  on(lg, 'click', '#cm button', (e, b) => { $$('#cm button', lg).forEach(x => x.classList.toggle('on', x === b)); map.setFilters({ colorMode: b.dataset.m }); });
  on(lg, 'click', '#ch button', (e, b) => { $$('#ch button', lg).forEach(x => x.classList.toggle('on', x === b)); map.choro = b.dataset.m; map.redraw(); });
  upVis();
  const home = () => {
    side.innerHTML = o.sideHome ? o.sideHome() : '';
    if (admin) { const b = $('#sb-draw', side); b && (b.onclick = () => { map.clearDrawn(); map.setTool('draw'); toast('Dibuje el área: clic para cada vértice, doble clic para cerrar.'); }); }
  };
  home();
  map.on('click', ({ hit }) => {
    if (!hit) return;
    if (hit.layer === 'predios') { map.setSel(hit.p.id); side.innerHTML = (admin ? o.adminFicha(hit.p.id) : `<div class="note info tiny" style="margin-bottom:10px">Ficha pública: sólo se muestran clasificaciones firmes. No se publican datos personales.</div>` + predioFicha(hit.p.id, 'public')) + `<div style="margin-top:14px;display:flex;gap:8px"><button class="btn sm ghost" id="sb-back">← Volver</button>${admin ? `<button class="btn sm pri" data-open="${hit.p.id}">Abrir expediente</button>` : ''}</div>`; $('#sb-back', side).onclick = () => { map.setSel(null); home(); }; const ob = $('[data-open]', side); ob && (ob.onclick = () => window.__go('admin', 'padron', { id: ob.dataset.open })); }
    else if (hit.layer === 'alertas' && o.alertPanel) { side.innerHTML = o.alertPanel(hit.p); const bk = $('#sb-back', side); bk && (bk.onclick = home); wireAlert(side, hit.p); }
    else if (hit.layer === 'lidar') { const e = estudioById[hit.p.id]; side.innerHTML = `<div class="ch"><h2 class="mono">${e.id}</h2><div class="sp">${estadoChip(e.ver)}</div></div><dl class="kv" style="margin-top:8px"><dt>Predio</dt><dd class="mono">${e.pid}</dd><dt>Fecha de vuelo</dt><dd>${fdate(e.fecha)}</dd><dt>Aeronave / sensor</dt><dd>${esc(e.aero.modelo)} / ${esc(e.sensor.modelo)}</dd><dt>Densidad</dt><dd class="mono">${e.dens} pts/m²</dd><dt>Puntos</dt><dd class="mono">${fmt(e.npts)}</dd></dl><div style="margin-top:12px;display:flex;gap:8px"><button class="btn sm ghost" id="sb-back">← Volver</button><button class="btn sm pri" id="sb-lid">Ver verificación</button></div>`; $('#sb-back', side).onclick = home; $('#sb-lid', side).onclick = () => window.__go('admin', 'lidar', { id: e.id }); }
    else if (hit.layer === 'rest') { const r = hit.p; side.innerHTML = `<div class="ch"><h2 class="mono">${r.id}</h2><div class="sp">${projChip(r.st)}</div></div><p style="margin:8px 0">${esc(r.tipo)}</p><dl class="kv"><dt>Predio</dt><dd class="mono">${r.pid}</dd><dt>Superficie</dt><dd class="mono">${fmt(r.ha, 1)} ha</dd><dt>Especies nativas</dt><dd>${r.esp.map(esc).join(', ')}</dd><dt>Plantas establecidas</dt><dd class="mono">${fmt(r.plant)}</dd><dt>Supervivencia</dt><dd class="mono">${r.surv ? r.surv + ' %' : '—'}</dd><dt>Calificación</dt><dd>${stars(r.stars)}</dd></dl><button class="btn sm ghost" id="sb-back" style="margin-top:12px">← Volver</button>`; $('#sb-back', side).onclick = home; }
    else if (hit.layer === 'mun') { const m = ST.perMun[hit.p.id]; const g = GF.mun[hit.p.id]; side.innerHTML = `<h2>${esc(hit.p.name)}</h2><p class="dim tiny">Clave INEGI 16${g ? g.cve : ''} · ${fmt(hit.p.km2)} km²</p>${g ? `<div class="sec" style="margin-top:6px"><h3>Guardián Forestal ${tag('real')}</h3><dl class="kv" style="margin-top:6px"><dt>Huertas detectadas</dt><dd class="mono">${fmt(g.orch)} · ${fmt(g.orchHa)} ha</dd><dt>Huertas de exportación</dt><dd class="mono">${fmt(g.exp)} · ${fmt(g.expHa)} ha</dd><dt>Bosque remanente</dt><dd class="mono">${fmt(g.forest)} ha</dd><dt>Ollas de agua</dt><dd class="mono">${fmt(g.ollas)} · ${fmt(g.ollasHa, 1)} ha</dd><dt>Superficie denunciada</dt><dd class="mono">${fmt(g.rep)} ha</dd></dl></div><h3 style="margin-top:12px">Piloto del módulo ${tag('demo')}</h3>` : ''}${m ? `<dl class="kv"><dt>Predios inscritos (demo)</dt><dd class="mono">${m.n}</dd><dt>Superficie inscrita</dt><dd class="mono">${fmt(m.ha)} ha</dd><dt>Naranja / Rojo</dt><dd class="mono">${m.naranja} / ${m.rojo}</dd><dt>Alertas 12 meses</dt><dd class="mono">${m.alerts}</dd></dl>` : '<p class="dim">Sin predios inscritos en el piloto.</p>'}<button class="btn sm ghost" id="sb-back" style="margin-top:12px">← Volver</button>`; $('#sb-back', side).onclick = home; }
  });
  map.on('draw', ring => { const a = areaStats(ring); map.setFilters({}); side.innerHTML = o.areaPanel ? o.areaPanel(a) : ''; const bk = $('#sb-back', side); bk && (bk.onclick = () => { map.clearDrawn(); home(); }); const fl = $('#sb-filter', side); fl && (fl.onclick = () => { map.setFilters({ ids: new Set(a.ids) }); upVis(); toast('Mapa filtrado al área: ' + a.n + ' predios'); }); });
  map.on('measure', pts => toast('Distancia medida: ' + (pts.reduce((s, p, i) => i ? s + hav(pts[i - 1], p) : 0, 0) / 1000).toFixed(2) + ' km'));
  if (o.focus) setTimeout(() => locate(map, o.focus), 60);
  return { map, side, home, cleanup: () => map.destroy() };
}
import { haversine as hav } from '../util.js';
export function wireAlert(side, a) { const b = $('#sb-back', side); }
