import { $, $$, on, esc, fmt, fdate, CLS, badge, chip, toast, download, TODAY } from '../util.js';
import { S, ST, G, P, munName, prediosById, refresh, monthly } from '../state.js';
import * as ch from '../charts.js';
import { kpi, tag, icon, stars, projChip, predioFicha, modal } from '../ui.js';
import { createMap, attachControls } from '../mapkit.js';
import { mapPage, publicIds } from './mapPage.js';
import { REAL_FACTS, AVO_MM, AVO_SO } from '../sources.js';
import { VARS } from '../semaforo.js';
import { sha256Str, ledgerAppend } from '../integrity.js';
import { prepPts } from '../map.js';

const hdr = (t, p, act = '') => `<div class="page-h"><div><h1>${t}</h1>${p ? `<p>${p}</p>` : ''}</div><div class="act">${act}</div></div>`;
const pub = () => { const ids = publicIds(); const rows = S.predios.features.filter(f => ids.has(f.properties.id)).map(f => f.properties); return { ids, rows, v: rows.filter(p => p.cls === 'verde').length, n: rows.filter(p => p.cls === 'naranja').length, r: rows.filter(p => p.cls === 'rojo').length }; };

function inicio(main) {
  const pb = pub(); const st = ST; const mm = monthly();
  const validating = st.cnt.amarillo, sinfo = st.cnt.gris;
  main.innerHTML = `
  <div class="hero"><div>
    <span class="tag demo" style="margin-bottom:10px">Panorama estatal · datos de demostración</span>
    <h1>Los bosques de Michoacán, medidos y a la vista de todos</h1>
    <p>El programa registra cada huerta, reconstruye su historia forestal con imágenes satelitales, exige levantamientos LiDAR verificables y publica un semáforo que distingue el daño que se puede reparar del que ya no. Sólo se publican clasificaciones firmes y nunca datos personales.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-go="mapa">${icon('map', 15)} Explorar el mapa</button><button class="btn" data-go="metodologia">${icon('book', 15)} Cómo se calcula</button><button class="btn ghost" data-go="denuncia">${icon('flag', 15)} Reportar un hecho</button></div>
  </div>
  <div style="display:flex;gap:18px;align-items:center;justify-content:center;flex-wrap:wrap">
    <div style="width:170px">${ch.donut([{ name: 'Verde', v: pb.v, color: CLS.verde.color }, { name: 'Naranja', v: pb.n, color: CLS.naranja.color }, { name: 'Rojo', v: pb.r, color: CLS.rojo.color }], { s: 170, sub: 'predios publicados' })}</div>
    <div style="display:grid;gap:7px;font-size:13px">${[['verde', pb.v], ['naranja', pb.n], ['rojo', pb.r]].map(([c, v]) => `<div class="sem"><i style="background:${CLS[c].color}"></i>${CLS[c].name} <span class="mono dim">${fmt(v)}</span></div>`).join('')}<div class="tiny dim" style="max-width:190px;margin-top:4px">+ ${fmt(validating)} en validación y ${fmt(sinfo)} sin información suficiente (no publicados individualmente)</div></div>
  </div></div>
  <div class="grid g4" style="margin-top:14px">
    ${kpi({ l: 'Huertas inscritas', v: fmt(st.tot), s: fmt(st.totHa) + ' ha · ' + Object.values(st.perMun).filter(m => m.n).length + ' de 113 municipios (franja aguacatera)' })}
    ${kpi({ l: 'Padrón con polígono validado', v: fmt(st.validated * 100, 0) + ' %', s: 'Meta 2028: 80 % del universo exportador', c: '#34D399' })}
    ${kpi({ l: 'Alertas últimos 30 días', v: fmt(st.a30), s: fmt(st.open) + ' pendientes de validación', c: '#F59E0B', sp: ch.spark(mm.slice(-8).map(x => x[1]), '#F59E0B') })}
    ${kpi({ l: 'Superficie en restauración', v: fmt(st.resHa, 0) + ' ha', s: fmt(S.proyectos.length) + ' proyectos · ' + fmt(st.plantados / 1000, 0) + ' mil plantas', c: '#4ADE80' })}
  </div>
  <div class="grid g21" style="margin-top:14px">
    <div class="card pad0" style="height:420px;position:relative"><div class="ch" style="position:absolute;z-index:3;top:10px;left:12px;background:rgba(14,22,38,.9);padding:6px 10px;border-radius:8px;border:1px solid var(--line2)"><h3 style="margin:0">Predios por semáforo</h3></div><div id="pm" style="height:100%"></div><div style="position:absolute;right:12px;bottom:34px;z-index:3"><button class="btn pri sm" data-go="mapa">Abrir mapa completo</button></div></div>
    <div class="card"><div class="ch"><h3>Contexto público</h3><div class="sp">${tag('real')}</div></div>${REAL_FACTS.map(f => `<div style="padding:8px 0;border-bottom:1px solid #163A27"><div class="tiny dim">${esc(f[0])}</div><div style="font-weight:600">${esc(f[1])}</div><div class="tiny dim">Fuente: ${esc(f[2])}</div></div>`).join('')}</div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><div class="ch"><h3>Expansión del aguacate en la franja central (ha)</h3><div class="sp">${tag('real')}</div></div>
      ${ch.line([{ name: 'Reconstrucción 1974-2024 (fotografía aérea, ortofotos y VHR)', color: '#34D399', pts: AVO_MM, dots: true, area: true }, { name: 'Landsat 1993-2024 (CCDC + RF)', color: '#F59E0B', pts: AVO_SO, dots: true, dashed: true }], { h: 230, xticks: [1974, 1985, 1995, 2005, 2015, 2024], xmin: 1974, xmax: 2026, ymax: 280000 })}
      <div class="tiny dim" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px"><span><i class="dot" style="background:#34D399"></i> Morales Manilla et al. (2026, preprint)</span><span><i class="dot" style="background:#F59E0B"></i> Solórzano et al. (2025, <i>Land</i> 14:1792)</span></div>
      <div class="note info tiny" style="margin-top:8px">Las dos series usan métodos y resoluciones distintos; por eso difieren. El programa propone medirlo predio por predio con una sola metodología auditable.</div></div>
    <div class="card"><div class="ch"><h3>Alertas por mes</h3><div class="sp">${tag('demo')}</div></div>${ch.bars(mm.map(([k, v]) => ({ label: k.slice(5) + '/' + k.slice(2, 4), value: v, color: '#34D399' })), { h: 230 })}<div class="tiny dim">Detecciones por satélite antes de validación humana; no todas son deforestación.</div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="ch"><h3>Cómo leer el semáforo</h3></div><div class="grid g5" style="margin-top:6px">${['verde', 'amarillo', 'naranja', 'rojo', 'gris'].map(c => `<div style="border-left:3px solid ${CLS[c].color};padding:2px 12px"><b style="color:${CLS[c].color}">${CLS[c].name}</b><div class="tiny dim" style="margin-top:2px">${CLS[c].desc}</div></div>`).join('')}</div></div>`;
  on(main, 'click', '[data-go]', (e, b) => window.__go('ciudadano', b.dataset.go));
  const map = createMap($('#pm', main), { ids: pb.ids, showAlerts: false, showLidar: false, showRest: false, z: 7.4 }); map.show('alertas', false); map.show('lidar', false); map.show('rest', false);
  map.fitBounds([-102.7, 19.0, -101.2, 19.85], 30, false); attachControls($('#pm', main).parentElement, map, {}); map.on('click', () => window.__go('ciudadano', 'mapa'));
  return () => map.destroy();
}

function mapa(main) {
  const m = mapPage(main, {
    level: 'public',
    sideHome: () => { const pb = pub(); return `<h2>Mapa forestal público</h2><p class="dim" style="margin:6px 0 12px">Haga clic en un predio para ver su ficha. Acerque el mapa: los polígonos aparecen a partir de escala municipal.</p>
      <div class="card" style="padding:10px;margin-bottom:10px"><div class="tiny dim">Predios con clasificación firme</div><div class="mono" style="font-size:24px;font-weight:600">${fmt(pb.rows.length)}</div><div style="display:flex;gap:12px;margin-top:6px;font-size:12px"><span class="sem"><i style="background:${CLS.verde.color}"></i>${pb.v}</span><span class="sem"><i style="background:${CLS.naranja.color}"></i>${pb.n}</span><span class="sem"><i style="background:${CLS.rojo.color}"></i>${pb.r}</span></div></div>
      <div class="note tiny">Por debido proceso sólo se publican clasificaciones firmes. Los predios en validación o sin información suficiente no se muestran individualmente. En zonas de riesgo el Comité Técnico puede generalizar la geometría.</div>
      <div class="sec"><h3>Buscar por folio</h3><div style="display:flex;gap:6px;margin-top:6px"><input id="sf" placeholder="PF-URU-00012"><button class="btn" id="sfb">Buscar</button></div></div>
      <div class="sec"><h3>Consejo de lectura</h3><p class="tiny dim">El color no equivale a una sanción: un predio <b style="color:${CLS.naranja.color}">naranja</b> tiene daño reparable y una ruta de restauración; un predio <b style="color:${CLS.rojo.color}">rojo</b> tiene daño irreversible y pasa a la autoridad competente.</p></div>`; }
  });
  const side = m.side; side.addEventListener('click', e => { if (e.target.id === 'sfb') { const q = $('#sf', side).value.trim().toUpperCase(); const f = prediosById[q]; if (!f || !publicIds().has(q)) return toast('Folio no encontrado o aún no publicable', 'warn'); import('../mapkit.js').then(k => { k.locate(m.map, q); side.innerHTML = predioFicha(q, 'public') + '<button class="btn sm ghost" id="sb-back" style="margin-top:12px">← Volver</button>'; $('#sb-back', side).onclick = m.home; }); } });
  return m.cleanup;
}

function municipios(main) {
  main.innerHTML = hdr('Municipios', 'Distribución del semáforo y de las alertas por municipio inscrito en el piloto.', tag('demo')) + `<div class="grid g12"><div class="card pad0" style="height:560px"><div id="mm" style="height:100%"></div></div><div class="tw" style="max-height:560px"><table class="tbl" id="tm"></table></div></div>`;
  let sort = 'rojo', dir = -1; const rows = () => Object.values(ST.perMun).filter(m => m.n).map(m => ({ ...m, name: munName[m.id], riesgo: (m.naranja + m.rojo) / m.n * 100 }));
  const draw = () => { const r = rows().sort((a, b) => dir * ((typeof a[sort] === 'string' ? a[sort].localeCompare(b[sort]) : a[sort] - b[sort]))); $('#tm', main).innerHTML = `<thead><tr>${[['name', 'Municipio'], ['n', 'Predios'], ['ha', 'Ha'], ['naranja', 'Naranja'], ['rojo', 'Rojo'], ['alerts', 'Alertas'], ['riesgo', 'Riesgo %']].map(([k, l]) => `<th class="s ${k !== 'name' ? 'num' : ''}" data-k="${k}">${l}${sort === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${r.map(m => `<tr><td>${esc(m.name)}</td><td class="num">${m.n}</td><td class="num">${fmt(m.ha)}</td><td class="num" style="color:${CLS.naranja.color}">${m.naranja}</td><td class="num" style="color:${CLS.rojo.color}">${m.rojo}</td><td class="num">${m.alerts}</td><td class="num"><div style="display:flex;align-items:center;gap:6px;justify-content:flex-end"><span class="bar" style="width:50px"><i style="width:${Math.min(100, m.riesgo * 2.4)}%;background:${m.riesgo > 30 ? '#EF4444' : m.riesgo > 20 ? '#F97316' : '#22C55E'}"></i></span>${fmt(m.riesgo, 0)}</div></td></tr>`).join('')}</tbody>`; };
  draw(); on(main, 'click', 'th.s', (e, t) => { const k = t.dataset.k; dir = sort === k ? -dir : -1; sort = k; draw(); });
  const map = createMap($('#mm', main), { showAlerts: false, showLidar: false, showRest: false, ids: publicIds() }); map.choro = 'risk'; map.show('alertas', false); map.show('lidar', false); map.show('rest', false); map.show('predios', false); map.fitBounds([-103.0, 18.7, -100.6, 20.1], 10, false); attachControls($('#mm', main).parentElement, map, { sat: false });
  return () => map.destroy();
}

function indicadores(main) {
  const st = ST; const mm = monthly().map(x => x[1]); const ind = [
    ['Fin', 'Cambio neto anual de cobertura forestal en la franja aguacatera', 'Se fijará con la línea base LiDAR 2027', '—', 'Tendencia a cero en 2030', 'plan', 0],
    ['Propósito', 'Superficie agrícola mapeada con polígono validado', fmt(st.validated * 100, 0) + ' %', '', '80 % del universo exportador (2028)', 'demo', st.validated * 100 / 80],
    ['Propósito', 'Predios en gris (sin información suficiente)', fmt(st.cnt.gris / st.tot * 100, 0) + ' %', '', '< 10 % a fines de 2028', 'demo', 1 - (st.cnt.gris / st.tot * 100 - 10) / 20],
    ['C1', 'Registros validados / declarados', fmt(st.validated * 100, 0) + ' %', '', '≥ 85 %', 'demo', st.validated * 100 / 85],
    ['C1', 'Percentil 90 del tiempo de validación documental', '12 días hábiles', '', '≤ 15 días hábiles', 'demo', 1],
    ['C2', 'Predios validados con Historial Forestal emitido', fmt((st.tot - st.cnt.gris) / st.tot * 100 * .78, 0) + ' %', '', '100 % en el plazo fijado', 'demo', .78],
    ['C3', 'Estudios prediales aceptados en la primera revisión', fmt(S.estudios.filter(e => e.ver === 'Íntegro').length / S.estudios.length * 100, 0) + ' %', '', '≥ 70 % al segundo año', 'demo', S.estudios.filter(e => e.ver === 'Íntegro').length / S.estudios.length / .7],
    ['C4', 'Exactitud de la clasificación vs. verificación de campo', '91 %', '', '≥ 90 % antes de producir efectos', 'demo', 1],
    ['C5', 'Supervivencia al segundo año en proyectos verificados', fmt(S.proyectos.filter(p => p.surv).reduce((a, p) => a + p.surv, 0) / Math.max(1, S.proyectos.filter(p => p.surv).length), 0) + ' %', '', 'Umbral que fije la norma técnica', 'demo', .9],
    ['C6', 'Disponibilidad de los portales', '99.7 %', '', '≥ 99.5 %', 'demo', 1],
    ['C7', 'Tiempo de alerta a validación (mediana)', '6 días hábiles', '', '≤ 10 días hábiles', 'demo', 1],
    ['C7', 'Informes a SEMARNAT entregados en plazo', '3 de 3', '', '100 %', 'demo', 1]];
  main.innerHTML = hdr('Indicadores del Programa', 'Matriz de indicadores para resultados (MIR). Cada indicador se publica con definición, fuente, fecha de corte, método y unidad mínima de detección.', tag('demo')) +
    `<div class="tw"><table class="tbl"><thead><tr><th>Nivel</th><th>Indicador</th><th>Valor actual</th><th>Meta propuesta</th><th>Avance</th></tr></thead><tbody>${ind.map(r => `<tr><td><span class="chip">${r[0]}</span></td><td>${esc(r[1])}</td><td class="mono">${r[2]}</td><td class="dim">${esc(r[4])}</td><td style="width:140px"><div class="bar"><i style="width:${Math.max(3, Math.min(100, r[6] * 100))}%;background:${r[6] >= 1 ? '#22C55E' : r[6] > .6 ? '#EAB308' : '#F97316'}"></i></div></td></tr>`).join('')}</tbody></table></div>
    <div class="note info tiny" style="margin-top:12px">Las metas de resultado se fijarán con la línea base que se mida en 2027; los valores mostrados son ilustrativos. Unidad mínima de detección del monitoreo: 0.09 ha (Landsat, 30 m) a 0.01 ha (Sentinel-2, 10 m); por debajo de ese umbral <b>no debe leerse "cero deforestación"</b>.</div>`;
}

function restauracion(main) {
  const pr = S.proyectos; const by = s => pr.filter(p => p.st === s).length;
  main.innerHTML = hdr('Restauración forestal verificada', 'Proyectos de reforestación y regeneración evaluados con LiDAR antes, durante y después. El avance se publica sólo tras verificación.', tag('demo')) +
    `<div class="grid g4">${kpi({ l: 'Proyectos', v: pr.length, s: 'aprobados o en curso' })}${kpi({ l: 'Superficie', v: fmt(ST.resHa, 0) + ' ha', s: 'en restauración', c: '#4ADE80' })}${kpi({ l: 'Plantas establecidas', v: fmt(ST.plantados), s: 'especies nativas' })}${kpi({ l: 'Cerrados', v: by('Cerrado'), s: 'con calificación final', c: '#34D399' })}</div>
    <div class="grid g3" style="margin-top:14px">${ ['En evaluación', 'En ejecución', 'En verificación', 'Cerrado', 'Aprobado'].map(s => `<div class="card"><div class="ch"><h3>${s}</h3><div class="sp mono">${by(s)}</div></div>${pr.filter(p => p.st === s).slice(0, 4).map(p => `<div style="padding:7px 0;border-top:1px solid #163A27"><div class="mono tiny dim">${p.id} · ${esc(munName[p.mun])}</div><div style="font-size:12.5px">${esc(p.tipo)}</div><div class="tiny dim">${fmt(p.ha, 1)} ha ${p.stars ? ' · ' : ''}${p.stars ? stars(p.stars) : ''}${p.surv ? ' · superv. ' + p.surv + ' %' : ''}</div></div>`).join('') || '<div class="dim tiny">Sin proyectos</div>'}</div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><div class="ch"><h3>Calificación de recuperación al cierre</h3></div><p class="tiny dim" style="margin:4px 0 8px">Escala de cero a cinco estrellas según supervivencia, cobertura de copa lograda, estructura vertical medida con LiDAR y diversidad de especies nativas frente a un ecosistema de referencia.</p>${ch.bars([0, 1, 2, 3, 4, 5].map(k => ({ label: k + '★', value: pr.filter(p => p.stars === k).length, color: '#FBBF24' })), { h: 150 })}</div>`;
}

function datos(main) {
  const pb = pub(); const pubRows = pb.rows.map(p => ({ folio: p.id, municipio: munName[p.mun], superficie_ha: p.ha, cultivo: p.cul, semaforo: CLS[p.cls].name, situacion: p.est, superficie_afectada_ha: p.aff ?? '', anio_perdida: p.ly ?? '', constancia: p.con }));
  const csv = rows => { const k = Object.keys(rows[0]); return '﻿' + k.join(',') + '\n' + rows.map(r => k.map(c => JSON.stringify(r[c] ?? '')).join(',')).join('\n'); };
  const defs = [
    ['predios_publicos.geojson', 'Predios con clasificación firme (geometría, municipio, cultivo, semáforo)', 'GeoJSON', 'demo', () => download('predios_publicos.geojson', JSON.stringify({ type: 'FeatureCollection', features: S.predios.features.filter(f => pb.ids.has(f.properties.id)).map(f => ({ type: 'Feature', properties: { folio: f.properties.id, municipio: munName[f.properties.mun], superficie_ha: f.properties.ha, cultivo: f.properties.cul, semaforo: CLS[f.properties.cls].name, situacion: f.properties.est }, geometry: f.geometry })) }), 'application/geo+json')],
    ['predios_publicos.csv', 'Tabla de predios publicables', 'CSV', 'demo', () => download('predios_publicos.csv', csv(pubRows), 'text/csv')],
    ['indicadores_municipales.csv', 'Predios, semáforo y alertas por municipio', 'CSV', 'demo', () => download('indicadores_municipales.csv', csv(Object.values(ST.perMun).filter(m => m.n).map(m => ({ municipio: munName[m.id], predios: m.n, superficie_ha: Math.round(m.ha), verde: m.verde, amarillo: m.amarillo, naranja: m.naranja, rojo: m.rojo, gris: m.gris, alertas: m.alerts }))), 'text/csv')],
    ['restauracion.csv', 'Proyectos de restauración: tipo, superficie y avance verificado', 'CSV', 'demo', () => download('restauracion.csv', csv(S.proyectos.map(p => ({ id: p.id, municipio: munName[p.mun], tipo: p.tipo, superficie_ha: p.ha, estado: p.st, plantas: p.plant, supervivencia_pct: p.surv ?? '', calificacion: p.stars ?? '' }))), 'text/csv')],
    ['municipios_michoacan.geojson', 'Límites municipales (geoBoundaries, CC BY 4.0)', 'GeoJSON', 'real', () => download('municipios_michoacan.geojson', JSON.stringify(G.municipios), 'application/geo+json')],
    ['diccionario_de_datos.json', 'Definición de campos, unidades, fuente y umbrales', 'JSON', 'plan', () => download('diccionario_de_datos.json', JSON.stringify({ version: 'SF-v0.3-demo', campos: { folio: 'Folio público seudonimizado; no es la CURT ni identifica a la persona', semaforo: 'Verde, amarillo, naranja, rojo o gris (véase Metodología)', situacion: 'Estado procesal de la clasificación', superficie_afectada_ha: 'Superficie con pérdida confirmada tras validación humana', anio_perdida: 'Año en que se produjo la pérdida', constancia: 'Estado de la Constancia de Integridad Forestal' }, licencia: 'CC BY 4.0 (propuesta)', umbral_deteccion_ha: 0.09 }, null, 2), 'application/json')],
  ];
  main.innerHTML = hdr('Datos abiertos', 'Publicados con licencia abierta, diccionario de datos y bitácora de cambios. Formatos: GeoJSON, GeoPackage y GeoParquet para vectores; GeoTIFF optimizado para la nube; CSV para indicadores.') +
    `<div class="grid g3">${defs.map((d, i) => `<div class="card"><div class="ch"><span class="mono" style="font-weight:600;word-break:break-all">${d[0]}</span></div><p class="tiny dim" style="margin:6px 0 10px">${d[1]}</p><div style="display:flex;align-items:center;gap:8px"><span class="chip">${d[2]}</span>${tag(d[3])}<button class="btn sm pri" style="margin-left:auto" data-dl="${i}">${icon('download', 14)} Descargar</button></div></div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><div class="ch"><h3>Servicios estándar previstos</h3><div class="sp">${tag('plan')}</div></div><div class="tw" style="margin-top:8px"><table class="tbl"><thead><tr><th>Servicio</th><th>Estándar</th><th>Ejemplo</th></tr></thead><tbody>
      <tr><td>Predios y semáforo</td><td>OGC API – Features</td><td class="mono tiny">/ogc/collections/predios/items?bbox=-102.2,19.3,-101.9,19.5&amp;semaforo=rojo</td></tr>
      <tr><td>Teselas vectoriales</td><td>OGC API – Tiles</td><td class="mono tiny">/ogc/collections/predios/tiles/WebMercatorQuad/{z}/{y}/{x}</td></tr>
      <tr><td>Catálogo de imágenes y nubes de puntos</td><td>STAC 1.1</td><td class="mono tiny">/stac/collections/lidar-nivel-a</td></tr>
      <tr><td>Metadatos del conjunto</td><td>OGC API – Records / ISO 19115-1</td><td class="mono tiny">/ogc/collections/catalogo/items</td></tr>
      <tr><td>Verificación de constancia</td><td>REST + código QR</td><td class="mono tiny">/verificar/CIF-2026-000123</td></tr></tbody></table></div></div>`;
  on(main, 'click', '[data-dl]', (e, b) => { defs[+b.dataset.dl][4](); toast('Descarga generada'); });
}

function metodologia(main) {
  main.innerHTML = hdr('Metodología pública', 'Cómo se clasifica un predio y por qué se puede confiar (y desconfiar) del resultado.', tag('plan')) +
  `<div class="grid g2"><div class="card"><h3>Cinco colores, una regla de oro</h3>${['gris', 'verde', 'amarillo', 'naranja', 'rojo'].map(c => `<div class="sem-row"><span class="lamp" style="background:${CLS[c].color};color:${CLS[c].color}"></span><div><b>${CLS[c].name}</b><div class="tiny dim">${{ gris: 'No hay polígono validado o la información es insuficiente. No es una acusación; es una pendiente de la administración.', verde: 'No se detectó ni se confirmó pérdida de cobertura posterior a la fecha de referencia. En huertas de menos de 1 ha el resultado puede ser no concluyente por la resolución del satélite.', amarillo: 'Hay una alerta pero todavía ninguna persona la ha validado con imagen de alta resolución. No produce efectos y no se publica.', naranja: 'Daño confirmado y reversible. N1: regeneración natural protegida. N2: restauración asistida. Un predio naranja jamás regresa a verde: se vuelve verde sólo un predio que nunca fue naranja.', rojo: 'Daño irreversible o con una causal determinante (infraestructura permanente, remoción del suelo, pérdida de bosque maduro de recuperación lenta, nueva pérdida en área en restauración).' }[c]}</div></div></div>`).join('')}</div>
  <div class="card"><h3>Índice de Reversibilidad (0 a 100)</h3><p class="tiny dim" style="margin:6px 0 10px">Ocho variables medidas con satélite, LiDAR y campo. Más puntos significa que el sitio se puede recuperar. Menos de 50: rojo. De 50 a 74: naranja N2. 75 o más: naranja N1. Una causal determinante convierte el resultado en rojo sin importar el puntaje.</p>${VARS.map(v => `<div class="hbar"><span title="${esc(v.hint)}">${v.k} · ${esc(v.name)}</span><span class="bar"><i style="width:${v.max * 5}%"></i></span><span>${v.max}</span></div>`).join('')}<div class="note tiny" style="margin-top:10px">El algoritmo está versionado (${'SF-v0.3-demo'}). Ninguna clasificación produce efectos sin validación humana, aviso al interesado y derecho de audiencia.</div></div></div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Fechas de referencia</h3><dl class="kv" style="margin-top:8px"><dt>Ventana legal de 20 años</dt><dd>Ley General de Desarrollo Forestal Sustentable, art. 97</dd><dt>Prescripción del daño ambiental</dt><dd>12 años (ley federal y estatal)</dd><dt>Incendios</dt><dd>Desde enero de 2012</dd><dt>Certificación Pro-Forest</dt><dd>Sin deforestación desde enero de 2018</dd><dt>Mercados con debida diligencia</dt><dd>31-dic-2020</dd></dl><p class="tiny dim" style="margin-top:8px">El programa conserva todas las fechas porque las obligaciones, los mercados y la prescripción no coinciden.</p></div>
  <div class="card"><h3>Qué información es pública</h3><dl class="kv" style="margin-top:8px"><dt>Público</dt><dd>Geometría, municipio, superficie, cultivo, semáforo, constancia, folio seudonimizado, proyectos y avance</dd><dt>Restringido</dt><dd>Vínculo predio-lote para compradores autorizados por el productor</dd><dt>Interinstitucional</dt><dd>Expediente completo a autoridades con convenio</dd><dt>Reservado</dt><dd>Nombre y datos personales, documentos de tenencia, nubes de puntos completas, calendario de inspecciones, identidad de denunciantes</dd></dl></div></div>
  <div class="card faq" style="margin-top:14px"><h3>Límites que hay que conocer</h3>
    <details><summary>¿Qué no puede hacer el LiDAR?</summary><p>No reconstruye el pasado, no cuenta todos los árboles, no identifica especies por sí solo y no verifica plántulas menores a 30–50 cm. Por eso se combina con series satelitales desde 1993 y con muestreo de campo.</p></details>
    <details><summary>¿Un predio verde tiene "cero deforestación"?</summary><p>No necesariamente. El resultado verde significa que no se confirmó una pérdida mayor a la unidad mínima de detección. En huertas muy pequeñas o recientes puede ser no concluyente.</p></details>
    <details><summary>¿Quién decide si un predio puede cambiar de uso de suelo?</summary><p>La autorización de cambio de uso de suelo en terrenos forestales es exclusivamente federal. El programa aporta evidencia técnica y registra la situación; no autoriza ni sanciona en nombre de la Federación.</p></details>
    <details><summary>¿Por qué no aparece un predio que conozco?</summary><p>Sólo se publican clasificaciones firmes. Un predio en validación, en audiencia o sin información suficiente no se muestra individualmente para proteger el debido proceso.</p></details></div>`;
}

function cuentas(main) {
  const q = [['1.er trimestre 2026', 'Entregado', '2026-04-15'], ['2.º trimestre 2026', 'Entregado', '2026-07-15'], ['3.er trimestre 2026', 'En integración', null]];
  main.innerHTML = hdr('Rendición de cuentas', 'La Federación (SEMARNAT) recibe informes de resultados y cifras verificables; no opera ni decide sobre los datos estatales. Los informes se publican aquí en el mismo plazo.', tag('demo')) +
    `<div class="grid g3">${q.map((r, i) => `<div class="card"><div class="ch"><h3>${r[0]}</h3><div class="sp">${chip(r[1], r[1] === 'Entregado' ? 'ok' : 'warn')}</div></div><dl class="kv" style="margin:8px 0 12px"><dt>Entrega</dt><dd>${r[2] ? fdate(r[2]) : 'Antes del 15-oct-2026'}</dd><dt>Alertas validadas</dt><dd class="mono">${[74, 96, 58][i]}</dd><dt>Superficie en restauración</dt><dd class="mono">${[212, 388, fmt(ST.resHa, 0)][i]} ha</dd><dt>Expedientes enviados</dt><dd class="mono">${[9, 17, 11][i]}</dd></dl><button class="btn sm" data-rep="${i}">${icon('download', 14)} Descargar resumen (CSV)</button></div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><h3>Contenido mínimo del informe</h3><ol class="tiny" style="line-height:1.9;color:#B7D0BF;margin:8px 0 0;padding-left:20px"><li>Cambio de cobertura forestal en la franja monitoreada, con unidad mínima de detección.</li><li>Distribución de predios y superficie por color del semáforo.</li><li>Expedientes enviados a las autoridades competentes y su estado procesal.</li><li>Superficie en restauración con verificación al corriente.</li><li>Exactitud del monitoreo y auditoría académica más reciente.</li></ol></div>`;
  on(main, 'click', '[data-rep]', (e, b) => { const i = +b.dataset.rep; download('informe_semarnat_T' + (i + 1) + '_2026.csv', '﻿indicador,valor\nPredios inscritos,' + ST.tot + '\nVerde,' + ST.cnt.verde + '\nNaranja,' + ST.cnt.naranja + '\nRojo,' + ST.cnt.rojo + '\nGris,' + ST.cnt.gris + '\nAmarillo,' + ST.cnt.amarillo + '\nDatos,DEMOSTRACIÓN\n', 'text/csv'); toast('Resumen descargado'); });
}

function denuncia(main) {
  main.innerHTML = hdr('Denuncia ciudadana', 'Reporte de desmonte, incendio, quema o reservorio sin autorización. Puede ser anónimo: no se recaba ningún dato de identidad ni se publica.', tag('demo')) +
    `<div class="grid g2"><div class="card"><form id="fd"><label class="f">Tipo de hecho<select id="dt"><option>Desmonte o cambio de uso de suelo</option><option>Incendio o quema</option><option>Construcción de reservorio (olla)</option><option>Tala</option><option>Otro</option></select></label>
      <label class="f">Ubicación (haga clic en el mapa)<div class="two"><input id="dlat" placeholder="Latitud" readonly><input id="dlon" placeholder="Longitud" readonly></div></label>
      <label class="f">Descripción<textarea id="dd" rows="4" placeholder="¿Qué observó? ¿Desde cuándo? Evite datos personales de terceros."></textarea></label>
      <label class="f">Fotografía (opcional; se conserva su metadato EXIF para la verificación)<input type="file" id="df" accept="image/*"></label>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:13px"><input type="checkbox" id="da" checked> Presentar de forma anónima</label>
      <button class="btn pri" type="submit">${icon('flag', 15)} Enviar denuncia</button></form></div>
    <div class="card pad0" style="height:460px;position:relative"><div id="dm" style="height:100%"></div></div></div>
    <div class="note info tiny" style="margin-top:12px">Al enviar se genera un folio y un acuse con huella SHA-256 del contenido. En esta demostración la denuncia aparece de inmediato en la cola de alertas del Portal de Administración.</div>`;
  const map = createMap($('#dm', main), { showAlerts: false, showLidar: false, showRest: false, ids: new Set() }); map.show('alertas', false); map.show('lidar', false); map.show('rest', false); map.show('predios', false); map.fitBounds([-102.7, 19.0, -101.2, 19.85], 20, false); attachControls($('#dm', main).parentElement, map, { sat: true });
  let pin = null; map.addLayer('pin', { type: 'custom', order: 99, draw: (m, ctx) => { if (!pin) return; const [x, y] = m.toScreen(pin[0], pin[1]); ctx.fillStyle = '#EF4444'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 10, 8, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x, y + 3); ctx.lineTo(x + 5, y - 5); ctx.fill(); } });
  map.on('click', ({ lonlat }) => { const { mx, my } = { mx: v => (v + 180) / 360, my: v => { const s = Math.sin(v * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); } }; pin = [mx(lonlat[0]), my(lonlat[1])]; $('#dlat', main).value = lonlat[1].toFixed(5); $('#dlon', main).value = lonlat[0].toFixed(5); map.redraw(); });
  $('#fd', main).addEventListener('submit', async e => {
    e.preventDefault(); const lat = +$('#dlat', main).value, lon = +$('#dlon', main).value; if (!lat) return toast('Marque la ubicación en el mapa', 'warn');
    const payload = JSON.stringify({ t: $('#dt', main).value, d: $('#dd', main).value, lat, lon, ts: new Date().toISOString() }); const h = sha256Str(payload); const folio = 'DEN-2026-' + h.slice(0, 5).toUpperCase();
    const mun = (() => { let best = null, bd = 9; G.municipios.features.forEach(f => { const dx = f.properties.cx - lon, dy = f.properties.cy - lat, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = f.properties.id; } }); return best; })();
    const al = { id: folio, d: new Date('2026-09-29').toISOString().slice(0, 10), lon, lat, mun, pid: null, src: 'Denuncia ciudadana', conf: 'alta', ha: 0.5, st: 'Detectada', dias: 0 }; S.alertas.unshift(al); P.alertas.push(...prepPts([al])); refresh(); ledgerAppend(S.ledger, 'Sistema', 'ALERTA_CREADA', folio);
    modal(`<h2>Denuncia recibida</h2><div class="verdict ok"><div class="big mono">${folio}</div><div class="tiny dim">Conserve este folio. No se recabó identidad.</div></div><dl class="kv" style="margin-top:12px"><dt>Huella SHA-256 del contenido</dt><dd class="hash">${h}</dd><dt>Ubicación</dt><dd class="mono">${lat.toFixed(5)}, ${lon.toFixed(5)}</dd><dt>Municipio</dt><dd>${esc(munName[mun])}</dd></dl><p class="tiny dim">Pasa a validación con imagen satelital de alta resolución. Recibirá respuesta pública en el tablero cuando la clasificación sea firme.</p><div style="text-align:right"><button class="btn pri" data-close>Entendido</button></div>`);
    $('#fd', main).reset(); pin = null; map.redraw();
  });
  return () => map.destroy();
}

export const views = { inicio, mapa, municipios, indicadores, restauracion, datos, metodologia, cuentas, denuncia };
