import { $, on, esc, fmt, chip, download } from '../util.js';
import * as ch from '../charts.js';
import { kpi, tag, icon } from '../ui.js';
import { createMap, attachControls } from '../mapkit.js';
import { GF, GF_TOT, CELLS, evidence, imgsAround } from '../domain/gf.js';
import { hdr } from './verif.js';

const MATRIZ = [
  ['Estadísticas por municipio (113)', 'API pública', 'Tablero estatal, municipios, priorización de carteras territoriales', 'Contexto y planeación', 'completo'],
  ['Estadísticas por subcuenca (64)', 'API pública', 'Módulo de agua; presión huerta/bosque por cuenca', 'Contexto', 'completo'],
  ['Alertas Guardián (2018-actualidad)', 'Teselas vectoriales', 'Entrada de la cola de triaje; evidencia en la ficha de huerta', 'Detección', 'muestra'],
  ['Alertas anuales 2001-2026', 'Teselas vectoriales por año', 'Fechado de la conversión frente a los cortes 2018/2019', 'Rigor técnico', 'muestra'],
  ['Incendios CONAFOR 2012-2024 y dNBR', 'Teselas vectoriales', 'Criterio de incendio desde 2012', 'Rigor técnico', 'muestra'],
  ['Bosque detectado 2023', 'Teselas vectoriales', 'Línea base y estrato del muestreo de exactitud', 'Exactitud', 'muestra'],
  ['Cambios agrupados por origen', 'Teselas vectoriales', 'Separar deforestación de incendio, aprovechamiento y sanidad en el triaje', 'Detección', 'muestra'],
  ['Ollas / reservorios detectados', 'Teselas vectoriales', 'Módulo de agua; causal de cambio de uso permanente', 'Agua', 'muestra'],
  ['ANP estatales, federales, AVC y zonas de restauración', 'Teselas vectoriales', 'Prioridad en triaje y competencia (CONANP / estado)', 'Detección', 'muestra'],
  ['Núcleos agrarios (RAN)', 'Teselas vectoriales', 'Tenencia en el registro de huertas; competencia de PROFEPA', 'Registro', 'muestra'],
  ['Denuncias públicas y canalizadas', 'Teselas vectoriales', 'Apertura de expediente; vista a FGE (sin publicar identificadores)', 'Debido proceso', 'muestra'],
  ['Actividades PROFEPA (75)', 'Archivo estático', 'Antecedentes por ubicación en el expediente', 'Debido proceso', 'completo'],
  ['Estaciones (39) y sensores en árboles (5)', 'Archivo estático / API', 'Clima local para separar sequía de pérdida', 'Rigor técnico', 'completo'],
  ['Imágenes históricas: color, falso color, NDVI, NDWI, SCL', 'WMTS (8,466 fechas)', 'Imagen anterior y posterior a la conversión en cada dictamen', 'Dictamen', 'catálogo'],
  ['Puntos y píxeles de calor', 'Teselas por fecha', 'Triaje de incendios activos', 'Detección', 'muestra'],
];
const EST = { completo: ['Integrado completo', 'ok'], muestra: ['Integrado con muestra', 'info'], 'catálogo': ['Catálogo integrado', 'info'] };

function guardian(main) {
  const years = {}; GF.wmts.entries.forEach(e => { if (e[0] < 0) return; const y = e[1].slice(0, 4); years[y] = (years[y] || 0) + 1; });
  const alY = GF.alertCells.years.map((y, i) => ({ label: String(y), value: CELLS.reduce((s, c) => s + c.ys[i], 0), color: y >= 2019 ? '#F97316' : '#F59E0B' }));
  const fiY = {}; GF.fires.features.forEach(f => { const y = f.properties.ini.slice(0, 4); if (y) fiY[y] = (fiY[y] || 0) + 1; });
  main.innerHTML = hdr('Integración con Guardián Forestal', 'Guardián Forestal detecta y monitorea; este módulo verifica, garantiza el debido proceso y dictamina. Aquí se documenta qué capa alimenta qué paso del dictamen, en qué estado está y qué falta para operarla completa.', `${tag('real')} <button class="btn ghost" id="cx">${icon('download', 14)} Matriz CSV</button>`) +
    `<div class="grid g5">${kpi({ l: 'Capas publicadas catalogadas', v: fmt(GF.conteos.capas), s: GF.conteos.estados + ' estados · ' + GF.conteos.servicios_ok + ' de ' + GF.conteos.servicios_vector + ' servicios responden' })}${kpi({ l: 'Fechas de imagen satelital', v: fmt(GF.conteos.wmts), s: '5 productos: color, falso color, NDVI, NDWI, SCL', c: '#38BDF8' })}${kpi({ l: 'Municipios con estadística', v: '113 / 113', s: 'unidos por clave INEGI', c: '#22C55E' })}${kpi({ l: 'Fragmentos de alertas en la muestra', v: fmt(CELLS.reduce((s, c) => s + c.n, 0)), s: fmt(CELLS.length) + ' celdas de ~1 km', c: '#F97316' })}${kpi({ l: 'Superficie de huertas (estatal)', v: fmt(GF_TOT.orchHa) + ' ha', s: fmt(GF_TOT.exp) + ' huertas de exportación', c: '#F59E0B' })}</div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><div class="ch"><h3>Reparto de funciones</h3></div><div class="grid g2" style="margin-top:8px;gap:10px"><div style="border-left:3px solid #38BDF8;padding:4px 12px"><b>Guardián Forestal</b><div class="tiny dim" style="line-height:1.7;margin-top:4px">Monitoreo satelital continuo, alertas, imágenes históricas, capas territoriales, denuncia ciudadana. Es el sensor.</div></div><div style="border-left:3px solid #22C55E;padding:4px 12px"><b>Módulo de verificación y dictamen</b><div class="tiny dim" style="line-height:1.7;margin-top:4px">Huerta como unidad, fechado contra los cortes, exactitud medida, garantía de audiencia, dictamen firmado, lista de elegibles, trazabilidad y recaudación. Es el acto administrativo.</div></div></div><div class="note info tiny" style="margin-top:10px">El dictamen regresa a Guardián Forestal como estado de cada huerta: una sola fuente para el productor, la empacadora, SENASICA, SEMARNAT y la contraparte estadounidense.</div></div>
    <div class="card pad0" style="height:330px;position:relative"><div id="gm" style="height:100%"></div></div></div>
    <div class="card" style="margin-top:14px"><div class="ch"><h3>Matriz de integración capa por capa</h3></div><div class="tw"><table class="tbl"><thead><tr><th>Capa de Guardián Forestal</th><th>Servicio</th><th>Uso en el módulo</th><th>Paso</th><th>Estado en esta versión</th></tr></thead><tbody>${MATRIZ.map(r => `<tr><td><b>${esc(r[0])}</b></td><td class="tiny">${esc(r[1])}</td><td class="tiny">${esc(r[2])}</td><td class="tiny">${esc(r[3])}</td><td>${chip(EST[r[4]][0], EST[r[4]][1])}</td></tr>`).join('')}</tbody></table></div><div class="tiny dim" style="margin-top:6px">«Con muestra»: la capa está conectada al flujo, pero en esta demostración sólo se cargó una tesela de visualización (sur de la franja aguacatera, entre Tierra Caliente y la meseta). Para operar se requiere la exportación original del proveedor.</div></div>
    <div class="grid g3" style="margin-top:14px"><div class="card"><div class="ch"><h3>Alertas Guardián por año (muestra)</h3></div>${ch.bars(alY, { h: 200 })}<div class="tiny dim">La serie de alertas inicia en 2018, igual que el corte estatal: la base es compatible con el dictamen.</div></div>
    <div class="card"><div class="ch"><h3>Incendios CONAFOR por año (muestra)</h3></div>${ch.bars(Object.keys(fiY).sort().map(y => ({ label: y.slice(2), value: fiY[y], color: '#F97316' })), { h: 200 })}<div class="tiny dim">Cubre el criterio de incendio desde 2012.</div></div>
    <div class="card"><div class="ch"><h3>Fechas de imagen por año</h3></div>${ch.bars(Object.keys(years).sort().map(y => ({ label: y.slice(2), value: years[y], color: '#38BDF8' })), { h: 200 })}<div class="tiny dim">Cada dictamen cita la imagen anterior y posterior a la ventana de conversión.</div></div></div>
    <div class="card" style="margin-top:14px"><div class="ch"><h3>Muestras de imagen servidas por Guardián Forestal</h3></div><div class="grid g5" style="margin-top:8px">${GF.raster.map(r => `<figure style="margin:0"><img src="${r.img}" alt="${esc(r.layer)}" style="width:100%;border-radius:8px;border:1px solid var(--line);aspect-ratio:1;object-fit:cover"><figcaption class="tiny dim" style="margin-top:4px">${esc({ mapcache: 'Color verdadero', falsecolor: 'Falso color', ndvi: 'NDVI', ndwi: 'NDWI', scl: 'Calidad (SCL)' }[r.svc] || r.svc)} · ${r.fecha.slice(0, 4)}-${r.fecha.slice(4, 6)}-${r.fecha.slice(6, 8)}</figcaption></figure>`).join('')}</div><div class="tiny dim" style="margin-top:6px">Productos renderizados (no valores de reflectancia). Para medir se requieren las bandas originales o la serie Landsat/Sentinel propia.</div></div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><div class="ch"><h3>Hallazgos de calidad a resolver con el proveedor</h3></div><ul class="tiny" style="line-height:1.8;margin:6px 0 0 16px">
      <li>No hay exportación pública completa (WFS, GeoPackage o Shapefile): las teselas de visualización están simplificadas y recortadas; no sirven para medir superficies de un dictamen.</li>
      <li>«Huertas de exportación» (${fmt(GF_TOT.exp)}) supera a «huertas detectadas» (${fmt(GF_TOT.orch)}): son conteos con definiciones distintas. Hay que conciliarlos con el padrón SENASICA antes de publicarlos como cifra oficial.</li>
      <li>27 servicios anunciados en el menú no están configurados (p. ej. ANP de Jalisco); 2000 aparece en el selector sin datos.</li>
      <li>La capa pública de denuncias contiene registros de prueba («Ejemplo de denuncia»).</li>
      <li>Un registro de PROFEPA tiene longitud inválida (−101291); se conserva en cuarentena, sin corregir.</li>
      <li>No se identificó una licencia que autorice redistribución: el uso en producción requiere convenio de datos.</li></ul></div>
    <div class="card"><div class="ch"><h3>Ruta de integración</h3></div><ol class="tiny" style="line-height:1.85;margin:6px 0 0 18px">
      <li><b>Convenio de datos</b> con el operador: exportación original (PostGIS/GeoPackage) y licencia de uso institucional.</li>
      <li><b>Eventos de alerta por API</b> hacia la cola de triaje, con identificador estable y nivel de confianza.</li>
      <li><b>Imágenes por fecha (WMTS)</b> enlazadas al expediente: antes y después de la ventana de conversión.</li>
      <li><b>Conciliación del padrón</b>: huertas detectadas por Guardián ↔ padrón SENASICA ↔ registro de huertas del módulo.</li>
      <li><b>Retorno del dictamen</b>: estado legal y elegibilidad por identificador de huerta, publicados en Guardián Forestal.</li></ol></div></div>
    <div class="card" style="margin-top:14px"><div class="ch"><h3>Capas de Michoacán publicadas (${GF.catalogo.length})</h3></div><div class="grid g3" style="margin-top:8px">${[...new Set(GF.catalogo.map(c => c.sec))].map(sec => `<div><div class="tiny" style="color:var(--cyan);font-weight:600;margin-bottom:4px">${esc(sec)}</div>${GF.catalogo.filter(c => c.sec === sec).map(c => `<div class="tiny dim">· ${esc(c.name)}</div>`).join('')}</div>`).join('')}</div></div>`;
  const map = createMap($('#gm', main), { showAlerts: false, showLidar: false, showRest: false }); ['alertas', 'lidar', 'rest', 'predios'].forEach(k => map.show(k, false)); ['gf_bosque', 'gf_alertas', 'gf_ev', 'gf_fires', 'gf_anp'].forEach(k => map.show(k, true));
  map.fitBounds(GF.meta.tesela_muestra.bbox, 10, false); attachControls($('#gm', main).parentElement, map, {});
  $('#cx', main).onclick = () => download('matriz_integracion_guardian_forestal.csv', 'capa,servicio,uso,paso,estado\n' + MATRIZ.map(r => r.map(x => JSON.stringify(x)).join(',')).join('\n'), 'text/csv');
  return () => map.destroy();
}

// Bloque de evidencia para la ficha de huerta
export function gfEvidenceHTML(ring, win) {
  const e = evidence(ring); const im = imgsAround(e.imgs, win);
  const tot = e.alertas.reduce((a, b) => a + b, 0);
  return `<div class="sec"><h3>Evidencia de Guardián Forestal ${tag('real')}</h3>${e.muestra ? `<dl class="kv" style="margin-top:6px"><dt>Alertas 2018-2024 en ~1 km</dt><dd class="mono">${fmt(tot)} ${tot ? `<span class="tiny dim">(${GF.alertCells.years.map((y, i) => e.alertas[i] ? `${y}: ${e.alertas[i]}` : '').filter(Boolean).join(' · ')})</span>` : ''}</dd><dt>Alertas anuales 2026 cercanas</dt><dd class="mono">${e.ev.length}${e.ev.length ? ' · ' + fmt(e.ev.reduce((s, x) => s + x.ha, 0), 2) + ' ha' : ''}</dd><dt>Incendios CONAFOR cercanos</dt><dd>${e.fires.length ? e.fires.slice(0, 3).map(f => `${esc(f.ini)} · ${esc(f.causa)}`).join('<br>') : 'Ninguno'}</dd><dt>Área natural protegida</dt><dd>${e.anp ? esc(e.anp.name) + ' · ' + esc(e.anp.cat) : 'Fuera de ANP'}</dd><dt>Núcleo agrario</dt><dd>${e.ran ? esc(e.ran.name) + ' (' + esc(e.ran.tipo) + ')' : 'Sin traslape con núcleo agrario'}</dd><dt>Subcuenca</dt><dd>${e.sub ? esc(e.sub.name) : '—'}</dd></dl>` : `<div class="tiny dim" style="margin:6px 0">La huerta está fuera de la tesela de muestra de las capas vectoriales; con la exportación completa del proveedor se consulta en todo el estado.</div>`}
  <div class="tiny" style="margin-top:6px">Imágenes históricas disponibles en esta ubicación: <b>${fmt(e.imgs.length)}</b> fechas${win ? ` · color verdadero antes de la ventana: <b class="mono">${im.antes || '—'}</b> · después: <b class="mono">${im.despues || '—'}</b>` : ''}</div></div>`;
}
export const views = { guardian };
