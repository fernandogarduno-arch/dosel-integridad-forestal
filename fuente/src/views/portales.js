// Portal de empacadora, vistas públicas nuevas (bilingües) y procedimientos del productor.
import { $, $$, on, esc, fmt, chip, toast, download } from '../util.js';
import { S, munName } from '../state.js';
import { kpi, tag, icon, modal } from '../ui.js';
import { ledgerAppend, sha256File, shortHash } from '../integrity.js';
import { H, hById, ESTADOS, PARAMS, MET, CULTIVOS, elegibilidad, elegibles, listaVersion, cortes, dating, pOf, businessDaysBetween, todayIso, addBusinessDays, ringOf } from '../domain/core.js';
import { STAGES, stageIdx, presentarAlegatos, interponerRecurso } from '../domain/process.js';
import { EMP, balance, recibir } from '../domain/trace.js';
import { olofsson, publicable } from '../domain/accuracy.js';
import { t, EST_EN, evTxt, docHTML, expedienteZip } from '../domain/dictamen.js';
import { accuracyTables } from './rigor.js';
import { DEFS } from './gob.js';
import { hdr, estChip, seriesChart } from './verif.js';

// ================= Empacadora =================
S.emp = S.emp || 'EMP-07';
const empSel = () => `<select id="empsel">${EMP.map(e => `<option value="${e.id}" ${e.id === S.emp ? 'selected' : ''}>${e.id} · ${esc(e.nombre)}</option>`).join('')}</select>`;
const wireEmp = (main, redraw) => { const s = $('#empsel', main); if (s) s.onchange = () => { S.emp = s.value; redraw(); }; };
function recepcion(main) {
  const draw = () => { const mine = S.consultas.filter(c => c.emp === S.emp).slice(0, 30); const lv = listaVersion();
    main.innerHTML = hdr('Recepción de fruta', 'Antes de recibir cada lote, la empacadora consulta la elegibilidad de la huerta proveedora. El sistema verifica el estado legal y la capacidad productiva remanente (balance de masa).', empSel()) +
      `<div class="grid g21"><div class="card"><div class="ch"><h3>Consulta de elegibilidad en la recepción</h3></div><div class="grid g3" style="margin-top:8px"><label class="tiny">Huerta (UID)<input id="uid" class="mono" value="${(balance().filter(b => ESTADOS[b.h.estado].eleg).sort((a, b) => (b.cap * PARAMS.balanceTolerancia - b.ent) - (a.cap * PARAMS.balanceTolerancia - a.ent))[0] || { h: elegibles()[0] }).h.uid}"></label><label class="tiny">Toneladas del lote<input id="tn" type="number" step=".1" value="9.5"></label><label class="tiny">&nbsp;<button class="btn pri" id="ok" style="width:100%;justify-content:center">Consultar y recibir</button></label></div>
      <div class="tiny dim" style="margin-top:6px">Pruebe con una huerta bloqueada: <a data-u="${H.find(h => h.estado === 'Bloqueado' && h.senasica).uid}" class="mono">${H.find(h => h.estado === 'Bloqueado' && h.senasica).uid}</a> · o con una que ya entregó más de su capacidad: <a data-u="${(balance().sort((a, b) => b.ratio - a.ratio)[0] || {}).h?.uid}" class="mono">${(balance().sort((a, b) => b.ratio - a.ratio)[0] || {}).h?.uid}</a></div><div id="out" style="margin-top:12px"></div></div>
      <div class="card"><div class="ch"><h3>Lista de elegibles vigente</h3></div><dl class="kv" style="margin-top:6px"><dt>Versión</dt><dd class="mono">${lv.id}</dd><dt>Huertas</dt><dd class="mono">${fmt(lv.n)}</dd><dt>Huella</dt><dd class="mono tiny">${shortHash(lv.sha)}</dd><dt>Generada</dt><dd class="mono tiny">${lv.gen}</dd></dl><div class="tiny dim" style="margin-top:8px">Integración por API con certificado de cliente: <span class="mono">GET /v1/elegibilidad/{uid}</span>. Cada consulta queda en la bitácora.</div></div></div>
      <div class="card" style="margin-top:14px"><div class="ch"><h3>Consultas recientes de ${S.emp}</h3></div><div class="tw" style="max-height:320px"><table class="tbl"><thead><tr><th>Fecha</th><th>Huerta</th><th class="num">t</th><th>Resultado</th><th>Motivo</th></tr></thead><tbody>${mine.map(c => `<tr><td class="mono tiny">${c.ts.replace('T', ' ').slice(0, 16)}</td><td class="mono tiny">${c.uid}</td><td class="num">${c.t}</td><td>${c.elegible ? chip('Aceptado', 'ok') : chip('Rechazado', 'bad')}</td><td class="tiny">${esc(c.motivo)}</td></tr>`).join('') || '<tr><td colspan="5" class="dim">Sin consultas.</td></tr>'}</tbody></table></div></div>`;
    wireEmp(main, draw);
    $('#ok', main).onclick = () => { const uid = $('#uid', main).value.trim().toUpperCase(), tn = +$('#tn', main).value; if (!(tn > 0)) return toast('Indique las toneladas', 'warn'); const r = recibir(S.emp, uid, tn);
      $('#out', main).innerHTML = `<div class="verdict ${r.q.elegible ? 'ok' : 'fail'}"><div><div class="big">${r.q.elegible ? 'Recepción autorizada · ' + r.lote.id : 'Recepción rechazada'}</div><div class="tiny dim">${esc(r.q.motivo)}</div></div></div><pre class="mono tiny" style="margin-top:8px;background:#0A1C12;border:1px solid var(--line);border-radius:8px;padding:10px;white-space:pre-wrap">${esc(JSON.stringify(r.resp, null, 1))}</pre>`; };
    on(main, 'click', '[data-u]', (e, a) => { $('#uid', main).value = a.dataset.u; });
  };
  draw();
}
function lotes(main) {
  const draw = () => { const ls = S.lotes.filter(l => l.emp === S.emp).slice().reverse(); const em = S.embarques.filter(e => e.emp === S.emp).slice().reverse();
    main.innerHTML = hdr('Lotes y embarques', 'Cadena huerta → lote → empacadora → embarque. Cada lote conserva la versión de la lista de elegibles con que se recibió.', empSel()) +
      `<div class="grid g3">${kpi({ l: 'Lotes recibidos', v: fmt(ls.length), s: fmt(ls.reduce((s, l) => s + l.t, 0), 1) + ' t' })}${kpi({ l: 'Embarques', v: fmt(em.length) })}${kpi({ l: 'Lotes de huertas hoy no elegibles', v: fmt(ls.filter(l => !ESTADOS[hById[l.uid].estado].eleg).length), s: 'recibidos cuando eran elegibles', c: '#F59E0B' })}</div>
      <div class="grid g2" style="margin-top:14px"><div class="card pad0"><div class="tw" style="max-height:520px"><table class="tbl"><thead><tr><th>Lote</th><th>Fecha</th><th>Huerta</th><th class="num">t</th><th>Lista</th><th>Embarque</th></tr></thead><tbody>${ls.slice(0, 300).map(l => `<tr><td class="mono tiny">${l.id}</td><td class="mono tiny">${l.fecha}</td><td class="mono tiny">${l.uid}</td><td class="num">${l.t}</td><td class="mono tiny">${l.lista}</td><td class="mono tiny">${l.emb || '—'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card pad0"><div class="tw" style="max-height:520px"><table class="tbl"><thead><tr><th>Embarque</th><th>Semana</th><th class="num">Lotes</th><th class="num">t</th><th>Destino</th><th>Certificado</th></tr></thead><tbody>${em.map(e => `<tr><td class="mono tiny">${e.id}</td><td class="mono tiny">${e.semana}</td><td class="num">${e.lotes}</td><td class="num">${e.t}</td><td class="tiny">${e.destino}</td><td class="mono tiny">${e.cfi}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    wireEmp(main, draw); };
  draw();
}
function integracion(main) {
  const ex = elegibles()[0].uid;
  main.innerHTML = hdr('Integración por API', 'Las empacadoras integran la consulta a su sistema de recepción. Autenticación con certificado de cliente; respuestas firmadas; límites por minuto.') +
    `<div class="card"><h3>Ejemplo</h3><pre class="mono tiny" style="background:#0A1C12;border:1px solid var(--line);border-radius:8px;padding:12px;white-space:pre-wrap;margin-top:8px">curl --cert empacadora.pem --key empacadora.key \\
  https://api.ejemplo.invalid/v1/elegibilidad/${ex}

${esc(JSON.stringify(elegibilidad(ex), null, 1))}</pre><div class="tiny dim">Dominio de ejemplo: el despliegue institucional publica la URL oficial.</div></div>`;
}

// ================= Público =================
function elegibilidadPub(main) {
  const draw = (q) => { const lv = listaVersion(); const r = q ? elegibilidad(q.trim().toUpperCase()) : null;
    main.innerHTML = hdr(t('Consulta de elegibilidad', 'Eligibility lookup'), t('Consulte si una huerta es elegible por su identificador. Se publica el estado por identificador y los agregados territoriales; nunca el nombre del propietario.', 'Look up an orchard by its identifier. Status is published by identifier and territorial aggregates only; owners are never named.'), `<button class="btn" id="lc">${icon('download', 14)} ${t('Lista de elegibles', 'Eligible list')} CSV</button> <button class="btn ghost" id="lg">GeoJSON</button>`) +
      `<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="q" class="mono" placeholder="HUE-16102-00001" value="${esc(q || '')}" style="flex:1;min-width:220px"><button class="btn pri" id="go">${t('Consultar', 'Look up')}</button></div><div class="tiny dim" style="margin-top:6px">${t('Ejemplo', 'Example')}: <a class="mono" data-q="${elegibles()[0].uid}">${elegibles()[0].uid}</a> · <a class="mono" data-q="${H.find(h => h.estado === 'Bloqueado').uid}">${H.find(h => h.estado === 'Bloqueado').uid}</a></div>
      ${r ? `<div class="verdict ${r.elegible ? 'ok' : r.encontrado ? 'fail' : 'warn'}" style="margin-top:12px"><div><div class="big">${r.encontrado ? (r.elegible ? t('Elegible', 'Eligible') : t('No elegible', 'Not eligible')) : t('No encontrada', 'Not found')}</div><div class="tiny dim">${r.encontrado ? `${esc(r.municipio)} · ${esc(r.cultivo)} · ${t(r.estado_legal, EST_EN[r.estado_legal])} · ${t('lista', 'list')} ${r.version_lista.id}` : esc(r.motivo)}</div></div></div>${r.encontrado ? (() => { const h = hById[r.uid]; const c = cortes(h); return `<dl class="kv" style="margin-top:10px"><dt>${t('Corte estatal', 'State cut-off')} ${PARAMS.corteEstatal.fecha.slice(0, 4)}</dt><dd>${evTxt(c.estatal)}</dd><dt>${t('Corte federal', 'Federal cut-off')} ${PARAMS.corteFederal.fecha.slice(0, 4)}</dt><dd>${evTxt(c.federal)}</dd><dt>${t('Dictaminó', 'Determined by')}</dt><dd>${t('Servidor público facultado (identidad resguardada)', 'Authorized official (identity withheld)')}</dd></dl><div class="sec">${seriesChart(h, 600, 170)}</div>`; })() : ''}` : ''}</div>
      <div class="grid g3" style="margin-top:14px">${kpi({ l: t('Huertas elegibles', 'Eligible orchards'), v: fmt(lv.n), s: t('versión', 'version') + ' ' + lv.id })}${kpi({ l: t('Municipios con huertas inscritas', 'Municipalities with registered orchards'), v: new Set(H.map(h => h.mun)).size + ' / 113', s: t('franja aguacatera primero, estado después', 'avocado belt first, then statewide') })}${kpi({ l: t('Huella de la lista', 'List hash'), v: shortHash(lv.sha), s: 'SHA-256' })}</div>`;
    $('#go', main).onclick = () => draw($('#q', main).value); on(main, 'click', '[data-q]', (e, a) => draw(a.dataset.q));
    $('#lc', main).onclick = () => download('lista_elegibles_' + lv.id + '.csv', 'uid,municipio,cultivo,estado_legal,version_lista\n' + elegibles().map(h => [h.uid, munName[h.mun], h.cul, h.estado, lv.id].join(',')).join('\n'), 'text/csv');
    $('#lg', main).onclick = () => download('lista_elegibles_' + lv.id + '.geojson', JSON.stringify({ type: 'FeatureCollection', version: lv, features: elegibles().map(h => ({ type: 'Feature', properties: { uid: h.uid, municipio: munName[h.mun], cultivo: h.cul, estado_legal: h.estado }, geometry: { type: 'Polygon', coordinates: [ringOf(h)] } })) }), 'application/geo+json');
  };
  draw();
}
function metodo(main) {
  const R = olofsson(S.accSample); const pb = publicable(R, PARAMS.umbralPublicacion);
  const S1 = [
    [t('1. Unidad de análisis', '1. Unit of analysis'), t('La huerta: polígono con identificador único ligado a la clave SENASICA, la clave catastral, el núcleo agrario (RAN) y el RFC/CURP del titular.', 'The orchard: a polygon with a unique ID linked to its SENASICA registration, cadastral ID, agrarian unit (RAN) and holder tax ID.')],
    [t('2. Serie temporal', '2. Time series'), t('Cobertura arbórea anual 1993-hoy con el archivo Landsat (compuesto de estación seca), densificada con Sentinel-2 y Landsat 8/9 desde 2017 y con radar Sentinel-1 para alertas bajo nubes.', 'Annual tree cover 1993–present from the Landsat archive (dry-season composite), densified with Sentinel-2 and Landsat 8/9 since 2017 and Sentinel-1 radar for alerts under clouds.')],
    [t('3. Fechado de la conversión', '3. Dating the conversion'), t('Se detecta la ruptura de la serie (diferencia máxima de medias ≥ ' + PARAMS.umbralRuptura + ' puntos) y se acota una ventana entre la última observación con bosque y la primera sin bosque.', 'A break is detected (maximum difference of means ≥ ' + PARAMS.umbralRuptura + ' points) and bracketed between the last forested and the first non-forested observation.')],
    [t('4. Dos cortes a la vez', '4. Both cut-offs at once'), t(`Se evalúan el corte estatal (${PARAMS.corteEstatal.fecha}) y el federal (${PARAMS.corteFederal.fecha}). Cada uno da cumple, indeterminado o incumple; cuando difieren se aplica una regla explícita y publicada (hoy: el más restrictivo).`, `Both the state (${PARAMS.corteEstatal.fecha}) and federal (${PARAMS.corteFederal.fecha}) cut-offs are evaluated as compliant, undetermined or non-compliant; when they differ an explicit, published rule applies (currently: the stricter one).`)],
    [t('5. Incendios desde 2012', '5. Fires since 2012'), t('Focos NASA FIRMS (VIIRS/MODIS) y severidad por índice NBR. Un incendio seguido de conversión en ' + PARAMS.ventanaFuegoAnios + ' años hace a la huerta no elegible.', 'NASA FIRMS hotspots (VIIRS/MODIS) and NBR burn severity. A fire followed by conversion within ' + PARAMS.ventanaFuegoAnios + ' years renders the orchard non-compliant.')],
    [t('6. Sequía no es deforestación', '6. Drought is not deforestation'), t('Se integra la lluvia de CHIRPS (SPI) y la altura del dosel (GEDI y mapas globales de altura): una caída espectral en año seco con dosel estable no se trata como pérdida.', 'CHIRPS rainfall (SPI) and canopy height (GEDI and global canopy height maps) are integrated: a spectral drop in a dry year with stable canopy is not treated as loss.')],
    [t('7. Revisión humana y debido proceso', '7. Human review and due process'), t('Alerta → revisión de analista → visita de campo → proyecto de dictamen → garantía de audiencia → dictamen firme → recurso ante un área distinta.', 'Alert → analyst review → field visit → draft determination → hearing → final determination → appeal to a separate unit.')],
    [t('8. Reproducibilidad', '8. Reproducibility'), t('Cada dictamen se descarga con identificadores de escena, huellas SHA-256, parámetros y un script que reproduce el resultado.', 'Each determination ships with scene IDs, SHA-256 hashes, parameters and a script that reproduces the finding.')],
  ];
  main.innerHTML = hdr(t('Metodología de verificación', 'Verification methodology'), `${MET.id} v${MET.ver} · ${t(MET.estado, 'Draft for academic validation')}`, `<button class="btn" id="md">${icon('download', 14)} ${t('Descargar', 'Download')} (ES/EN)</button>`) +
    `<div class="grid g2">${S1.map(s => `<div class="card"><h3>${s[0]}</h3><p class="tiny" style="margin-top:6px;line-height:1.7">${s[1]}</p></div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><div class="ch"><h3>${t('Exactitud publicada', 'Published accuracy')}</h3><div class="sp">${S.accSrc === 'demo' ? tag('demo') : ''} ${chip(pb.ok ? t('Cumple el criterio de publicación', 'Meets publication criterion') : t('No cumple el criterio', 'Below criterion'), pb.ok ? 'ok' : 'warn')}</div></div>${accuracyTables(R, { compact: true })}</div>
    <div class="card" style="margin-top:14px"><h3>${t('Definiciones', 'Definitions')}</h3>${DEFS.map(d => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${t(d[0], d[1])}</b><div class="tiny dim">${t(d[2], d[3])}</div></div>`).join('')}</div>`;
  $('#md', main).onclick = () => download(`metodologia_${MET.id}_v${MET.ver}.md`, `# ${MET.id} v${MET.ver}\n\n` + S1.map(s => `## ${s[0]}\n\n${s[1]}\n`).join('\n') + '\n## Exactitud / Accuracy\n\n' + ['Pérdida', 'Bosque estable', 'No bosque estable'].map((k, i) => `- ${k}: UA ${(R.ua[i] * 100).toFixed(1)} %, PA ${(R.pa[i] * 100).toFixed(1)} %, área ${Math.round(R.area[i])} ± ${Math.round(R.areaCI[i])} ha`).join('\n') + '\n', 'text/markdown');
}

// ================= Productor: procedimientos =================
export function procedimientos(main, prd) {
  const mine = H.filter(h => h.prd === prd); const ids = new Set(mine.map(h => h.uid)); const cs = S.cases.filter(c => ids.has(c.uid) && c.stage !== 'alerta');
  main.innerHTML = hdr('Mis procedimientos', 'Notificaciones electrónicas, plazos en días hábiles, presentación de alegatos y pruebas propias, y recurso de revisión ante un área distinta.') +
    `<div class="card pad0"><div class="tw"><table class="tbl"><thead><tr><th>Huerta</th><th>Estado legal</th><th>Elegible</th><th>Clave SENASICA</th><th class="num">Ha</th></tr></thead><tbody>${mine.map(h => `<tr><td class="mono">${h.uid}</td><td>${estChip(h.estado)}</td><td>${ESTADOS[h.estado].eleg ? chip('Sí', 'ok') : chip('No', 'bad')}</td><td class="mono tiny">${h.senasica || '—'}</td><td class="num">${fmt(pOf(h).ha, 1)}</td></tr>`).join('')}</tbody></table></div></div>
    <h2 style="margin:18px 0 10px">Expedientes</h2>${cs.map(c => { const h = hById[c.uid]; const dic = c.dicFolio && S.dictamenes.find(d => d.folio === c.dicFolio); const aud = c.stage === 'audiencia' && todayIso() <= c.vence; const rec = c.stage === 'firme' && c.estado === 'Abierto' && todayIso() <= c.recVence;
      return `<div class="card" style="margin-bottom:12px"><div class="ch"><h3 class="mono">${c.id}</h3><div class="sp">${estChip(h.estado)}</div></div><div class="tiny dim">Huerta ${c.uid} · etapa: <b>${esc(STAGES[stageIdx(c.stage)].n)}</b></div>
      ${aud ? `<div class="note info tiny" style="margin-top:8px">Se le notificó un proyecto de dictamen el ${c.notif}. Tiene hasta el <b>${c.vence}</b> (${businessDaysBetween(todayIso(), c.vence)} días hábiles) para presentar alegatos y pruebas: facturas de plantación, fotografías fechadas, estudios propios.</div><button class="btn pri sm" data-al="${c.id}" style="margin-top:8px">Presentar alegatos y pruebas</button>` : ''}
      ${c.alegatos.map(a => `<div class="tiny" style="margin-top:6px">✓ Alegatos presentados ${a.ts.slice(0, 10)} · ${a.files.length} archivo(s) sellado(s)</div>`).join('')}
      ${rec ? `<div class="note tiny" style="margin-top:8px">Dictamen firme ${c.dicFolio}. Puede interponer recurso de revisión hasta el <b>${c.recVence}</b>; lo resuelve un área distinta de la que dictaminó.</div><button class="btn sm" data-rc="${c.id}" style="margin-top:8px">Interponer recurso de revisión</button>` : ''}
      ${c.recurso ? `<div class="tiny" style="margin-top:6px">✓ Recurso interpuesto ${c.recurso.ts.slice(0, 10)}${c.res ? ' · resuelto: ' + c.res : ' · en trámite'}</div>` : ''}
      ${dic ? `<div style="margin-top:8px"><button class="btn sm ghost" data-dz="${dic.folio}">${icon('download', 12)} Expediente del dictamen (ZIP reproducible)</button></div>` : ''}</div>`; }).join('') || '<div class="card dim">No tiene procedimientos abiertos.</div>'}`;
  const form = (c, kind) => { const m = modal(`<h2>${kind === 'al' ? 'Alegatos y pruebas' : 'Recurso de revisión'} · ${c.id}</h2><label class="tiny">Escrito<textarea id="tx" rows="5" style="width:100%" placeholder="Exponga los hechos y ofrezca pruebas"></textarea></label><label class="tiny">Pruebas (se sellan con SHA-256 al recibirse)<input type="file" id="fi" multiple></label><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="ok">Presentar</button></div>`, { w: '520px' });
    m.q('#ok').onclick = async () => { const txt = m.q('#tx').value.trim(); if (!txt) return toast('Escriba su escrito', 'warn'); const files = []; for (const f of m.q('#fi').files) files.push({ n: f.name, sha: await sha256File(f) }); const r = kind === 'al' ? presentarAlegatos(c, txt, files, prd) : interponerRecurso(c, txt, files, prd); if (!r.ok) return toast(r.why, 'warn'); m.close(); toast('Presentado; acuse sellado en la bitácora'); procedimientos(main, prd); }; };
  on(main, 'click', '[data-al]', (e, b) => form(S.cases.find(c => c.id === b.dataset.al), 'al'));
  on(main, 'click', '[data-rc]', (e, b) => form(S.cases.find(c => c.id === b.dataset.rc), 'rc'));
  on(main, 'click', '[data-dz]', (e, b) => { const d = S.dictamenes.find(x => x.folio === b.dataset.dz); download(`expediente_${d.folio}.zip`, expedienteZip(d), 'application/zip'); });
}
export const empViews = { recepcion, lotes, integracion };
export const pubViews = { elegibilidad: elegibilidadPub, metodo };
