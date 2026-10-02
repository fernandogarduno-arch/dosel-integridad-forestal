// Vistas nuevas del MCE: Seguridad de brigadas (M9, rol restringido) y Paquete UE por lote (M10).
import { $, on, esc, fmt, toast, download } from '../util.js';
import { icon, tag, kpi } from '../ui.js';
import { S, munName } from '../state.js';
import { prepPts, prepLines } from '../map.js';
import { createMap, attachControls } from '../mapkit.js';
import { hById, me, MET, PARAMS } from '../domain/core.js';
import { datosSeguridad, abrirRuta, cerrarRuta, paqueteUE } from '../domain/mce.js';
import { zip } from '../domain/zip.js';
import { sha256Bytes } from '../integrity.js';
import { Doc, VERIFY_BASE, hex } from '../pdf.js';
import { hdr, who } from './verif.js';

// ---------- M9 · Seguridad de brigadas ----------
function seguridad(main) {
  let D; try { D = datosSeguridad(me()); } catch (e) { main.innerHTML = `<div class="card" style="max-width:560px;margin:40px auto;text-align:center">${icon('key', 30)}<h2>Acceso restringido</h2><p class="dim">${esc(e.message)}</p></div>`; return; }
  const COL = ['#2E7D32', '#A8720F', '#B3261E']; let map;
  const pend = (S.cases || []).filter(c => c.estado === 'Abierto' && c.stage === 'revision');
  const draw = () => { if (map) map.destroy();
    main.innerHTML = hdr('Seguridad de brigadas', 'Riesgo por empacadora, ruta y localidad, y protocolo de brigada. Las visitas de campo abren y cierran un registro de ruta. Sólo el rol Seguridad ve esta capa.', `<span class="chip bad">${icon('key', 12)} Rol Seguridad</span> ${tag('demo')}`) +
      `<div class="note tiny" style="margin-bottom:12px"><b>Datos ficticios de demostración.</b> En producción la capa se alimenta de ${esc(D.fuente.replace(' (sin conexión; datos ficticios de demostración)', ''))}; no se muestran niveles de riesgo municipales hasta contar con esa fuente.</div>
      <div class="grid g4">${kpi({ l: 'Empacadoras con riesgo alto', v: D.emp.filter(e => e.k === 2).length, c: '#B3261E' })}${kpi({ l: 'Rutas con riesgo alto', v: D.rutas.filter(r => r.k === 2).length, c: '#B3261E' })}${kpi({ l: 'Registros de ruta abiertos', v: S.rutasBrigada.filter(r => r.estado === 'Abierta').length, c: '#A8720F' })}${kpi({ l: 'Visitas pendientes', v: pend.length, s: 'expedientes en espera de campo' })}</div>
      <div class="grid g21" style="margin-top:14px"><div class="card pad0" style="height:460px;position:relative"><div id="smap" style="height:100%"></div></div>
      <div class="card"><h3>Protocolo de brigada</h3><ol class="tiny" style="line-height:1.8;margin:8px 0 0 16px">${D.protocolo.map(p => `<li>${esc(p)}</li>`).join('')}</ol><h3 style="margin-top:12px">Abrir registro de ruta</h3><select id="rc" style="width:100%;margin-top:6px">${pend.slice(0, 60).map(c => `<option value="${c.id}">${c.id} · ${c.uid}</option>`).join('')}</select><select id="rr" style="width:100%;margin-top:6px">${D.rutas.map(r => `<option value="${r.id}">${r.id} · riesgo ${r.nivel} · ${r.km} km</option>`).join('')}</select><button class="btn pri" id="ro" style="margin-top:8px">${icon('map', 14)} Abrir registro</button></div></div>
      <div class="card" style="margin-top:14px"><div class="ch"><h3>Registro de entrada y salida</h3></div><div class="tw" style="max-height:300px"><table class="tbl"><thead><tr><th>Registro</th><th>Expediente</th><th>Huerta</th><th>Brigada</th><th>Ruta</th><th>Salida</th><th>Regreso</th><th>Estado</th><th></th></tr></thead><tbody>${S.rutasBrigada.map(r => `<tr><td class="mono tiny">${r.id}</td><td class="mono tiny">${r.caso}</td><td class="mono tiny">${r.uid}</td><td class="mono tiny">${r.brigada}</td><td class="mono tiny">${r.ruta}</td><td class="mono tiny">${r.salida.replace('T', ' ').slice(0, 16)}</td><td class="mono tiny">${r.regreso ? r.regreso.replace('T', ' ').slice(0, 16) : '—'}</td><td>${r.estado === 'Abierta' ? '<span class="chip warn">Abierta</span>' : '<span class="chip ok">Cerrada</span>'}</td><td>${r.estado === 'Abierta' ? `<button class="btn sm" data-cl="${r.id}">Cerrar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="dim">Sin registros. Se crean al abrir una ruta o al registrar una visita de campo.</td></tr>'}</tbody></table></div></div>`;
    map = createMap($('#smap', main), { showAlerts: false, showLidar: false, showRest: false }); ['alertas', 'lidar', 'rest', 'predios', 'heat'].forEach(k => map.show(k, false));
    map.addLayer('rutas', { type: 'line', data: prepLines({ features: D.rutas.map(r => ({ type: 'Feature', properties: r, geometry: { type: 'LineString', coordinates: r.coords } })) }), order: 40, style: p => ({ stroke: COL[p.k], lw: 2.2, alpha: .9 }) });
    map.addLayer('emp', { type: 'point', data: prepPts(D.emp), order: 45, pickable: true, style: p => ({ fill: COL[p.k], stroke: '#0F2A24', r: 5.5, shape: 'diamond' }) });
    const tf = map.tipFn; map.tipFn = h => h.layer === 'emp' ? `<div class="mono tiny">${h.p.id}</div><div>Riesgo ${h.p.nivel} · ventana ${h.p.ventana}</div>${h.p.escolta ? '<div class="tiny">Requiere acompañamiento</div>' : ''}` : tf(h);
    map.fitBounds([-102.8, 19.0, -101.3, 19.9], 20, false); attachControls($('#smap', main).parentElement, map, {});
    $('#ro', main).onclick = () => { const c = S.cases.find(x => x.id === $('#rc', main).value); if (!c) return toast('No hay visitas pendientes', 'warn'); const r = abrirRuta(c, me(), $('#rr', main).value); toast('Registro ' + r.id + ' abierto'); draw(); };
  };
  draw(); on(main, 'click', '[data-cl]', (e, b) => { const r = S.rutasBrigada.find(x => x.id === b.dataset.cl); if (!r || r.estado !== 'Abierta') return; cerrarRuta(r, me()); toast('Registro cerrado'); draw(); });
  return () => map && map.destroy();
}

// ---------- M10 · Paquete de evidencia para la Unión Europea (por lote) ----------
export function pdfPaquete(P) {
  const d = new Doc(); const G = hex('#235B4E');
  d.rect(0, 752, 612, 40, G).text(56, 767, 'Paquete de evidencia por lote · Unión Europea', 15, true, [242, 244, 240]);
  d.y = 728; d.text(56, d.y, `Lote ${P.l.id} · huerta ${P.h.uid} · generado ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, 9.5, false, [69, 84, 79]); d.y -= 18;
  d.qr(470, 640, 86, VERIFY_BASE + P.cs.folio); d.text(470, 628, 'Verificar constancia', 8, false, [69, 84, 79]);
  d.h('1. Origen'); d.kv('Huerta (UID)', P.h.uid, { w: 400 }); d.kv('Municipio', munName[P.h.mun], { w: 400 }); d.kv('Superficie', `${P.geo.features[0].properties.superficie_ha} ha (polígono en paquete.geojson)`, { w: 400 }); d.kv('Constancia', `${P.cs.folio} · ${P.cs.estado}`, { w: 400 });
  d.h('2. Dictamen de condición forestal'); d.kv('Fecha de corte', PARAMS.corteFederal.fecha + ' (Acuerdo DOF 24 oct 2025)'); d.kv('¿Fuera de terreno forestal al corte?', { si: 'Sí', no: 'No', indeterminado: 'Indeterminado' }[P.dic.prueba_dos_condiciones.c1]); d.kv('CUSTF', P.dic.prueba_dos_condiciones.custf.estado); d.kv('Condición forestal', P.dic.prueba_dos_condiciones.resultado + ' — ' + P.dic.prueba_dos_condiciones.motivo); d.kv('Reglas', `Pro-Forest: ${P.dic.reglas.proforest} · exportación: ${P.dic.reglas.exportacion} · ruta de restauración: ${P.dic.reglas.ruta_restauracion ? 'aplica' : 'no aplica'}`); d.kv('Metodología / exactitud', `${P.dic.metodologia} · exactitud global ${(P.dic.exactitud_global * 100).toFixed(1)} %`);
  d.h('3. Cadena de custodia'); Object.entries(P.cadena).forEach(([k, v]) => d.kv(k.replace(/_/g, ' '), v == null ? '—' : String(v)));
  d.h('4. Integridad y firma'); d.para('Archivos del paquete con huella SHA-256 en MANIFEST.sha256. Firma electrónica y sello de tiempo simulados en la demostración; en producción, e.firma del servidor público y constancia NOM-151 de un PSC acreditado.', { size: 9 });
  return d.bytes();
}
export function zipPaquete(P) {
  const enc = new TextEncoder(); const pdf = pdfPaquete(P);
  const files = [{ name: 'LEEME.txt', data: `Paquete de evidencia · lote ${P.l.id}\nDEMOSTRACIÓN: datos sintéticos; firma y sello simulados.\n\n- paquete.geojson: polígono de cada huerta del lote, fecha de corte y resultado\n- dictamen_condicion_forestal.json: prueba de dos condiciones y reglas (M2)\n- cadena.json: huerta → lote → empaque → embarque (pedimento, exportador, CLA)\n- paquete.pdf: resumen firmado con QR de verificación\n- MANIFEST.sha256\n` }, { name: 'paquete.geojson', data: JSON.stringify(P.geo, null, 1) }, { name: 'dictamen_condicion_forestal.json', data: JSON.stringify(P.dic, null, 1) }, { name: 'cadena.json', data: JSON.stringify(P.cadena, null, 1) }, { name: 'paquete.pdf', data: pdf }];
  const man = files.map(f => `${sha256Bytes(typeof f.data === 'string' ? enc.encode(f.data) : f.data)}  ${f.name}`).join('\n') + '\n'; files.push({ name: 'MANIFEST.sha256', data: man });
  return zip(files);
}
function paqueteUEView(main, params = {}) {
  const ej = (S.lotes.find(l => l.emb) || S.lotes[0]).id;
  main.innerHTML = hdr('Paquete de evidencia para la Unión Europea', 'Por lote: polígono de cada huerta, fecha de corte, dictamen de condición forestal, cadena huerta–lote–empaque–embarque, en GeoJSON y PDF firmado con QR de verificación.', `${tag('demo')} ${who()}`) +
    `<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="pl" class="mono" placeholder="LOT-000123" value="${esc(params.q || params.id || ej)}" style="flex:1;min-width:220px"><button class="btn pri" id="pg">${icon('download', 14)} Generar paquete</button></div><div class="tiny dim" style="margin-top:6px">Requisito: generación en menos de un minuto para cualquier lote. Ejemplo: <a class="mono" data-l="${ej}">${ej}</a></div><div id="po" style="margin-top:12px"></div></div>`;
  const gen = id => { const t0 = performance.now(); const P = paqueteUE(id.trim().toUpperCase()); const o = $('#po', main); if (!P) { o.innerHTML = '<div class="dim">Lote no encontrado.</div>'; return; } const z = zipPaquete(P); const ms = +(performance.now() - t0).toFixed(0);
    o.innerHTML = `<div class="verdict ok"><div style="flex:1"><div class="big">Paquete generado en ${ms} ms</div><div class="tiny dim">Lote ${P.l.id} · huerta ${P.h.uid} · constancia ${P.cs.folio} (${esc(P.cs.estado)}) · condición forestal ${esc(P.dic.prueba_dos_condiciones.resultado)}${P.e ? ` · embarque ${P.e.id} · pedimento ${P.e.pedimento}` : ''}</div></div><div class="tiny mono">${ms < 60000 ? '✓ < 1 min' : '✕'}</div></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="dz">${icon('download', 14)} ZIP (GeoJSON + JSON + PDF)</button><button class="btn ghost" id="dp">${icon('download', 14)} Sólo PDF</button></div>`;
    $('#dz', main).onclick = () => download(`paquete_UE_${P.l.id}.zip`, z, 'application/zip'); $('#dp', main).onclick = () => download(`paquete_UE_${P.l.id}.pdf`, pdfPaquete(P), 'application/pdf'); };
  $('#pg', main).onclick = () => gen($('#pl', main).value); on(main, 'click', '[data-l]', (e, a) => { $('#pl', main).value = a.dataset.l; gen(a.dataset.l); });
  if (params.q || params.id) gen(params.q || params.id);
}
export const adminViews = { seguridad, 'paquete-ue': paqueteUEView };
