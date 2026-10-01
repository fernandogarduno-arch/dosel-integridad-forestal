// Participación ciudadana: opiniones, sugerencias, propuestas y denuncias recibidas por Arbolín (o el formulario web).
// Cada registro se CONSIDERA (se valida y georreferencia), se CATALOGA (reglas versionadas CAT-1.0, auditables) y se
// INTEGRA (folio + huella SHA-256 + asiento en bitácora; las denuncias entran a la cola de triaje como alerta).
import { S, P, G, munName, alertaById, refresh } from '../state.js';
import { mx, my, inPoly, prepPts } from '../map.js';
import { sha256Str, ledgerAppend } from '../integrity.js';
import { rng, haversine, TODAY } from '../util.js';
import { hByPid, addBusinessDays, todayIso } from './core.js';
import { evidence, GF } from './gf.js';

export const REGLAS_CAT = { id: 'CAT-1.0', fecha: '2026-09-30', nota: 'Reglas deterministas; la catalogación automática se revisa por personal antes de turnar.' };
export const TIPOS = {
  denuncia: { n: 'Denuncia', pref: 'DEN', c: '#B3261E', plazo: 10 },
  sugerencia: { n: 'Sugerencia', pref: 'CIU', c: '#235B4E', plazo: 15 },
  propuesta: { n: 'Propuesta', pref: 'CIU', c: '#A8720F', plazo: 15 },
  opinion: { n: 'Opinión', pref: 'CIU', c: '#45544F', plazo: 15 },
};
export const CAT_DEN = ['Tala o desmonte', 'Incendio o quema', 'Cambio de uso de suelo / nueva huerta', 'Olla de agua o extracción de agua', 'Otro hecho ambiental'];
export const CAT_SUG = ['Reforestación y restauración', 'Vigilancia contra la tala', 'Agua y ollas', 'Apoyo a productores', 'Transparencia y esta plataforma', 'Otro tema'];
export const PRECISION = {
  gps: 'Ubicación del dispositivo (GPS)', mapa: 'Punto marcado en el mapa', foto: 'GPS de la fotografía',
  localidad: 'Localidad conocida (aproximada)', municipio: 'Centro del municipio (aproximada)',
};
export const PRECISA = k => ['gps', 'mapa', 'foto'].includes(k);
export const ESTADOS_P = {
  'Recibida': 'Recibida; en espera de revisión por el personal.',
  'En análisis': 'El personal la está analizando.',
  'Turnada a triaje': 'Se convirtió en una alerta y está en la cola de revisión técnica con imagen satelital.',
  'Turnada': 'Se envió al área o autoridad competente.',
  'Respondida': 'Ya tiene respuesta.',
  'Atendida': 'Fue atendida y cerrada.',
};

// ---------------- normalización y datos personales ----------------
export const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim();
const RX_MAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g, RX_TEL = /(?:\+?52[\s-]?)?(?:\d[\s-]?){10}\b/g, RX_CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi;
export function limpiarPII(t) { let n = 0; const out = String(t || '').replace(RX_MAIL, () => (n++, '[correo omitido]')).replace(RX_CURP, () => (n++, '[CURP omitida]')).replace(RX_TEL, () => (n++, '[teléfono omitido]')); return { txt: out, n }; }
export function validarContacto(t) { const s = String(t || '').trim(); const m = s.match(RX_MAIL); if (m) return { ok: true, tipo: 'correo', v: m[0] }; const d = s.replace(/\D/g, ''); if (d.length === 10 || (d.length === 12 && d.startsWith('52'))) return { ok: true, tipo: 'teléfono', v: d.slice(-10) }; return { ok: false }; }
export const enmascarar = c => !c ? '—' : c.tipo === 'correo' ? c.v.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : '••••••' + c.v.slice(-4);

// ---------------- geografía ----------------
const MUNS = G.municipios.features.map(f => ({ id: f.properties.id, name: f.properties.name, n: nrm(f.properties.name), cx: f.properties.cx, cy: f.properties.cy, franja: f.properties.franja }));
export const MUN_LIST = MUNS;
const ALIAS = { 'nuevo san juan': 'Nuevo Parangaricutiro', 'san juan nuevo': 'Nuevo Parangaricutiro', 'parangaricutiro': 'Nuevo Parangaricutiro', 'santa clara del cobre': 'Salvador Escalante', 'santa clara': 'Salvador Escalante', 'ciudad hidalgo': 'Hidalgo', 'cd hidalgo': 'Hidalgo', 'nueva italia': 'Múgica', 'ario de rosales': 'Ario', 'coalcoman': 'Coalcomán de Vázquez Pallares', 'lombardia': 'Gabriel Zamora', 'tiquicheo': 'Tiquicheo de Nicolás Romero', 'cojumatlan': 'Cojumatlán de Régules', 'jacona de plancarte': 'Jacona', 'zamora de hidalgo': 'Zamora', 'tacambaro de codallos': 'Tacámbaro', 'heroica zitacuaro': 'Zitácuaro', 'los reyes de salgado': 'Los Reyes', 'uruapan del progreso': 'Uruapan', 'periban de ramos': 'Peribán', 'cotija de la paz': 'Cotija', 'tangancicuaro de arista': 'Tangancícuaro', 'paracho de verduzco': 'Paracho', 'huetamo de nunez': 'Huetamo', 'apatzingan de la constitucion': 'Apatzingán', 'puerto lazaro cardenas': 'Lázaro Cárdenas', 'sahuayo de morelos': 'Sahuayo', 'nahuatzen': 'Nahuatzen', 'zinapecuaro de figueroa': 'Zinapécuaro', 'maravatio de ocampo': 'Maravatío', 'tlalpujahua de rayon': 'Tlalpujahua' };
const AMBIG = new Set(['hidalgo', 'juarez', 'morelos', 'madero', 'ocampo', 'jimenez', 'buenavista', 'vista hermosa', 'venustiano carranza', 'alvaro obregon', 'charo', 'aporo', 'ario', 'senguio']);
function lev(a, b) { if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m || n; let prev = [...Array(n + 1).keys()]; for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
const byName = Object.fromEntries(MUNS.map(m => [m.name, m]));
// strict=false: la respuesta ES un municipio (paso del formulario) → acepta nombres genéricos y errores de dedo
export function buscarMunicipios(text, strict = true) {
  const t = ' ' + nrm(text) + ' '; if (t.trim().length < 3) return [];
  const hits = [];
  for (const [k, v] of Object.entries(ALIAS)) if (t.includes(' ' + k + ' ')) hits.push({ m: byName[v], s: 3, len: k.length });
  for (const m of MUNS) if (t.includes(' ' + m.n + ' ')) { const amb = AMBIG.has(m.n); if (amb && strict && !new RegExp('(municipio|mpio|munic)\\s+(de\\s+)?' + m.n).test(t) && t.trim() !== m.n) continue; hits.push({ m, s: 2, len: m.n.length }); }
  if (!hits.length && !strict) { const w = t.trim().split(' ').filter(x => !['de', 'del', 'la', 'el', 'los', 'en', 'municipio', 'soy', 'es', 'mpio'].includes(x)); for (const m of MUNS) { const k = m.n.split(' ').length; for (let i = 0; i + k <= w.length; i++) { const seg = w.slice(i, i + k).join(' '); const L = m.n.length; const d = lev(seg, m.n); if (L >= 5 && d <= (L >= 8 ? 2 : 1)) hits.push({ m, s: 1 - d / 10, len: L }); } } }
  const best = new Map(); hits.sort((a, b) => b.s - a.s || b.len - a.len).forEach(h => { if (h.m && !best.has(h.m.id)) best.set(h.m.id, h.m); });
  // si un nombre está contenido en otro más largo (Zamora ⊂ Gabriel Zamora), quedarse con el largo
  const arr = [...best.values()]; return arr.filter(a => !arr.some(b => b !== a && b.n.includes(a.n) && t.includes(' ' + b.n + ' ')));
}
export const munById = id => MUNS.find(m => m.id === id);
const PLACES = G.places.features.map(f => ({ name: f.properties.name, n: nrm(f.properties.name), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
export function geocodificarLocalidad(text, munId) { const t = ' ' + nrm(text) + ' '; const p = PLACES.find(p => t.includes(' ' + p.n + ' ')); if (!p) return null; const m = municipioEn(p.lon, p.lat); if (munId && m && m.id !== munId) return null; return { lon: p.lon, lat: p.lat, nombre: p.name }; }
export function municipioEn(lon, lat) { const X = mx(lon), Y = my(lat); const o = P.mun.find(o => X >= o.bb[0] && X <= o.bb[2] && Y >= o.bb[1] && Y <= o.bb[3] && inPoly(X, Y, o.polys)); return o ? munById(o.p.id) : null; }
export const enMichoacan = (lon, lat) => { const X = mx(lon), Y = my(lat); return P.state.some(o => inPoly(X, Y, o.polys)); };
export function bboxMunicipio(id) { const f = G.municipios.features.find(f => f.properties.id === id); if (!f) return null; const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]); let a = [180, 90, -180, -90]; rings.flat().forEach(([x, y]) => { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; }); return a; }
export function huertaEn(lon, lat) { const X = mx(lon), Y = my(lat); const o = P.predios.find(o => X >= o.bb[0] && X <= o.bb[2] && Y >= o.bb[1] && Y <= o.bb[3] && inPoly(X, Y, o.polys)); return o ? hByPid[o.p.id] || null : null; }

// Cruce del punto con capas: municipio verificado, huerta inscrita, ANP, núcleo agrario, subcuenca, alertas cercanas
export function cruceGeografico(lon, lat) {
  if (lon == null || lat == null) return null;
  const m = municipioEn(lon, lat); const h = huertaEn(lon, lat); const d = .0025; const ev = evidence([[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d]]);
  const cerca = S.alertas.filter(a => !a.ciudadana && haversine([lon, lat], [a.lon, a.lat]) <= 1500).map(a => ({ id: a.id, d: Math.round(haversine([lon, lat], [a.lon, a.lat])), st: a.st, src: a.src })).sort((a, b) => a.d - b.d).slice(0, 5);
  const gfAl = ev.alertas.reduce((a, b) => a + b, 0);
  return { enEstado: enMichoacan(lon, lat), mun: m ? m.id : null, munN: m ? m.name : null, huerta: h ? { uid: h.uid, estado: h.estado, cul: h.cul } : null, anp: ev.anp ? `${ev.anp.name} (${ev.anp.cat || ev.anp.tipo || 'ANP'})` : null, ran: ev.ran ? `${ev.ran.name} (${ev.ran.tipo || 'núcleo agrario'})` : null, sub: ev.sub ? [ev.sub.name !== 'Sin nombre' ? ev.sub.name : ev.sub.id, ev.sub.cuenca].filter(Boolean).join(' · ') : null, gfAlertas: ev.muestra ? gfAl : null, muestra: ev.muestra, alertasCerca: cerca };
}

// ---------------- catalogación (reglas CAT-1.0) ----------------
const TEMAS = [
  ['tala', /\b(tala|talan|talando|tumba|tumban|motosierra|corta(n|ndo)? (de )?arboles|troz|madera|aserr|leñ)/],
  ['fuego', /\b(fuego|quema|quemando|humo|incendi|lumbre|ardiendo)/],
  ['huerta nueva', /\b(aguacat|huerta nueva|nueva huerta|plant(a|an|ando|acion|aron)|arbolitos|estacas|cambio de uso)/],
  ['agua', /\b(olla|hoya|agua|pozo|bomba|manguera|arroyo|manantial|rio|ojo de agua|presa|riego)/],
  ['maquinaria', /\b(maquina|tractor|excavadora|retro|bulldozer|trascabo|camion|camiones|brecha|motoconform)/],
  ['nocturno', /\b(noche|madrugada)/],
  ['riesgo personal', /\b(armad|amenaz|arma|balaz|disparo|peligro|violen)/],
  ['reforestación', /\b(reforest|sembrar|plantar arboles|vivero|restaur)/],
  ['vigilancia', /\b(vigilan|inspecc|patrull|guardabosque|brigada)/],
  ['transparencia', /\b(transparen|plataforma|pagina|informacion|datos|mapa|app)/],
  ['productores', /\b(productor|apoyo|credito|capacita|certific|exporta)/],
  ['educación', /\b(escuela|nin|jovenes|educa|taller|platica)/],
];
const POS = /\b(bien|bueno|buena|excelente|gracias|me gusta|felicit|util|genial|ayuda mucho)/, NEG = /\b(mal|malo|pesim|no sirve|corrup|nunca|no hacen|abandon|tarde|lento|no funciona|indign)/;
export function catalogar(r) {
  const t = nrm(r.descripcion || ''); const temas = TEMAS.filter(([, rx]) => rx.test(t)).map(([k]) => k); const x = r.cruce || {};
  const cat = r.categoria || (r.tipo === 'denuncia' ? (temas.includes('fuego') ? CAT_DEN[1] : temas.includes('agua') ? CAT_DEN[3] : temas.includes('huerta nueva') ? CAT_DEN[2] : temas.includes('tala') ? CAT_DEN[0] : CAT_DEN[4]) : (temas.includes('reforestación') ? CAT_SUG[0] : temas.includes('vigilancia') ? CAT_SUG[1] : temas.includes('agua') ? CAT_SUG[2] : temas.includes('productores') ? CAT_SUG[3] : temas.includes('transparencia') ? CAT_SUG[4] : CAT_SUG[5]));
  const aut = [], motivos = []; let pr = 'Baja';
  if (r.tipo === 'denuncia') {
    const fuego = /Incendio/.test(cat) || temas.includes('fuego'), agua = /Olla/.test(cat) || temas.includes('agua');
    if (fuego) aut.push('911 y Protección Civil (si hay fuego activo)', 'CONAFOR · combate de incendios forestales');
    if (/Tala|Cambio de uso|Otro/.test(cat) || temas.includes('tala') || temas.includes('huerta nueva')) aut.push('PROFEPA · cambio de uso de suelo en terreno forestal (federal)');
    if (agua) aut.push('CONAGUA · aprovechamiento de aguas nacionales');
    if (x.anp) aut.push('CONANP · área natural protegida');
    if (temas.includes('riesgo personal')) aut.push('911 / Fiscalía General del Estado');
    aut.push(x.huerta ? `Módulo de verificación · huerta inscrita ${x.huerta.uid}` : 'Módulo de verificación · investigación de oficio (fuera del padrón)');
    pr = 'Media';
    if (r.ahora === 'ahora') { pr = 'Alta'; motivos.push('ocurre en este momento'); }
    if (fuego && r.ahora !== 'antes') { pr = 'Alta'; motivos.push('posible incendio'); }
    if (x.anp) { pr = 'Alta'; motivos.push('dentro de ANP'); }
    if (temas.includes('maquinaria')) { pr = 'Alta'; motivos.push('maquinaria en el sitio'); }
    if (x.alertasCerca && x.alertasCerca.length) { if (pr !== 'Alta') pr = 'Alta'; motivos.push(`${x.alertasCerca.length} alerta(s) satelital(es) a menos de 1.5 km`); }
    if (r.ahora === 'antes' && pr === 'Media' && !(r.fotos || []).length) { pr = 'Baja'; motivos.push('hecho antiguo sin fotografía'); }
    if (!PRECISA(r.ubicacion && r.ubicacion.precision)) motivos.push('ubicación aproximada: precisar en campo');
  } else {
    aut.push('Coordinación de participación ciudadana');
    aut.push({ [CAT_SUG[0]]: 'Programa estatal de restauración', [CAT_SUG[1]]: 'Inspección y vigilancia forestal', [CAT_SUG[2]]: 'Comisión estatal del agua / CONAGUA', [CAT_SUG[3]]: 'Desarrollo rural y sanidad vegetal', [CAT_SUG[4]]: 'Equipo de la plataforma de verificación', [CAT_SUG[5]]: 'Área que corresponda según el tema' }[cat] || 'Área que corresponda según el tema');
    if (r.tipo === 'propuesta') { pr = 'Media'; motivos.push('propuesta con acción concreta'); }
  }
  const sent = r.tipo === 'opinion' ? (POS.test(t) && !NEG.test(t) ? 'Positiva' : NEG.test(t) && !POS.test(t) ? 'Negativa' : 'Mixta o neutral') : null;
  return { categoria: cat, temas, prioridad: pr, motivos, autoridad: [...new Set(aut)], sentimiento: sent, plazo: TIPOS[r.tipo].plazo, regla: REGLAS_CAT.id };
}

// ---------------- integración ----------------
S.participaciones = [];
const nowZ = () => new Date().toISOString().replace(/\.\d+Z/, 'Z');
export function nuevaAlertaCiudadana(rec) {
  const u = rec.ubicacion; if (!u || u.lon == null) return null; const x = rec.cruce || {};
  const h = x.huerta ? hByPid[Object.keys(hByPid).find(k => hByPid[k].uid === x.huerta.uid)] : null;
  const al = { id: rec.folio, d: todayIso(), lon: u.lon, lat: u.lat, mun: x.mun || rec.municipio, pid: null, src: rec.canal === 'Arbolín' ? 'Denuncia ciudadana (Arbolín)' : 'Denuncia ciudadana', conf: (rec.fotos || []).length ? 'media' : 'baja', ha: .5, st: 'Detectada', dias: 0, ciudadana: true, aprox: !PRECISA(u.precision) };
  let caso = null;
  if (h) { // dentro de una huerta inscrita: se abre (o se acumula a) un expediente en etapa de alerta
    const abierto = (S.cases || []).find(c => c.uid === h.uid && c.estado === 'Abierto');
    if (abierto) { caso = abierto.id; rec.acumulada = true; }
    else { al.pid = h.pid; caso = `EXP-2026-${String(700 + S.cases.length).padStart(5, '0')}`; S.cases.push({ id: caso, uid: h.uid, alerta: al.id, estado: 'Abierto', stage: 'alerta', steps: [{ k: 'alerta', actor: 'Denuncia ciudadana', ts: nowZ(), nota: `Denuncia ${rec.folio} · ${rec.cat.categoria} · ubicación: ${PRECISION[u.precision]}` }], alegatos: [], recurso: null, res: null, dic: null }); }
  }
  S.alertas.unshift(al); alertaById[al.id] = al; P.alertas.push(...prepPts([al])); refresh();
  ledgerAppend(S.ledger, 'Sistema', 'ALERTA_CREADA', al.id, sha256Str(JSON.stringify(al)));
  return { alerta: al.id, caso };
}
// rec: {tipo, categoria, descripcion, municipio, localidad, colonia, referencias, ubicacion:{lon,lat,precision,acc}, fecha, ahora, fotos:[{sha,n,exif}], anonimo, contacto, canal}
export function integrar(rec0) {
  const rec = { ...rec0, canal: rec0.canal || 'Arbolín', ts: nowZ() };
  rec.cruce = rec.ubicacion ? cruceGeografico(rec.ubicacion.lon, rec.ubicacion.lat) : null;
  rec.cat = catalogar(rec);
  const pub = { tipo: rec.tipo, categoria: rec.cat.categoria, descripcion: rec.descripcion, municipio: rec.municipio, localidad: rec.localidad || '', colonia: rec.colonia || '', referencias: rec.referencias || '', ubicacion: rec.ubicacion || null, fecha: rec.fecha || null, fotos: (rec.fotos || []).map(f => f.sha), anonimo: !!rec.anonimo, canal: rec.canal, ts: rec.ts };
  rec.hash = sha256Str(JSON.stringify(pub)); // el contacto NO entra a la huella ni a ningún dato público
  let folio = `${TIPOS[rec.tipo].pref}-2026-${rec.hash.slice(0, 5).toUpperCase()}`; while (S.participaciones.some(p => p.folio === folio) || alertaById[folio]) folio = folio.slice(0, -1) + Math.floor(Math.random() * 10);
  rec.folio = folio; rec.estado = 'Recibida'; rec.vence = addBusinessDays(todayIso(), rec.cat.plazo);
  ledgerAppend(S.ledger, rec.canal === 'Arbolín' ? 'Arbolín (canal ciudadano)' : 'Portal ciudadano', rec.tipo === 'denuncia' ? 'DENUNCIA_RECIBIDA' : 'PARTICIPACION_RECIBIDA', folio, rec.hash);
  if (rec.tipo === 'denuncia') { const r = nuevaAlertaCiudadana(rec); if (r) { rec.alerta = r.alerta; rec.expediente = r.caso; rec.estado = 'Turnada a triaje'; } }
  S.participaciones.unshift(rec); window.__refreshBadges && window.__refreshBadges();
  return rec;
}
export function turnarATriaje(rec, actor) { if (rec.alerta || rec.tipo !== 'denuncia') return { ok: false, why: rec.alerta ? 'Ya está en la cola de triaje' : 'Sólo las denuncias se turnan a triaje' }; const r = nuevaAlertaCiudadana(rec); if (!r) return { ok: false, why: 'Sin ubicación' }; rec.alerta = r.alerta; rec.expediente = r.caso; rec.estado = 'Turnada a triaje'; ledgerAppend(S.ledger, actor, 'PARTICIPACION_TURNADA', rec.folio); return { ok: true }; }
export function responder(rec, txt, actor) { rec.respuesta = { ts: nowZ(), txt, actor }; rec.estado = 'Respondida'; ledgerAppend(S.ledger, actor, 'PARTICIPACION_RESPONDIDA', rec.folio, sha256Str(txt)); }

// Estado de un folio en lenguaje ciudadano (sin datos personales)
const AL_TXT = { 'Detectada': 'Recibida; espera revisión con imagen satelital de alta resolución.', 'En validación': 'Personal técnico la está revisando con imágenes satelitales.', 'Confirmada': 'Se confirmó un cambio en el bosque; se programó visita de campo.', 'Notificada': 'Se abrió un procedimiento y se notificó a la persona responsable.', 'En audiencia': 'El procedimiento está en la etapa en que la persona responsable presenta sus pruebas.', 'Firme': 'El procedimiento concluyó con dictamen.', 'Descartada': 'Se revisó y no se encontró pérdida de bosque atribuible (la decisión está motivada).' };
export function estadoFolio(f) {
  const folio = String(f || '').toUpperCase().trim(); const p = S.participaciones.find(x => x.folio === folio); const a = alertaById[folio];
  if (!p && !a) return { encontrado: false, folio };
  const al = a || (p && p.alerta ? alertaById[p.alerta] : null); const c = (S.cases || []).find(k => k.alerta === folio) || (p && p.expediente ? (S.cases || []).find(k => k.id === p.expediente) : null);
  return { encontrado: true, folio, tipo: p ? TIPOS[p.tipo].n : 'Denuncia', recibida: p ? p.ts.slice(0, 10) : a.d, municipio: munName[(p && (p.cruce && p.cruce.mun || p.municipio)) || (a && a.mun)] || '—', categoria: p ? p.cat.categoria : null,
    estado: p ? p.estado : 'Turnada a triaje', explicacion: al ? AL_TXT[al.st] || al.st : ESTADOS_P[p.estado], etapa_alerta: al ? al.st : null, procedimiento: c ? ({ alerta: 'en revisión inicial', revision: 'revisado por analista', campo: 'con visita de campo', audiencia: 'en garantía de audiencia', firme: 'con dictamen firme', recurso: 'en apelación', resolucion: 'resuelto en segunda instancia' }[c.stage] || c.stage) : null,
    respuesta: p && p.respuesta ? p.respuesta.txt : null, plazo_respuesta: p ? p.vence : null };
}

// ---------------- semilla de demostración (participaciones previas, ficticias) ----------------
(function seed() {
  const r = rng('PARTICIPA');
  const rows = [
    ['denuncia', 'Tancítaro', 'Tala o desmonte', 'En el cerro arriba de la localidad están tumbando pinos desde hace dos semanas, se escucha motosierra en la madrugada y bajan camiones con troza.', 'Paraje La Cumbre', 'antes', 2],
    ['denuncia', 'Salvador Escalante', 'Cambio de uso de suelo / nueva huerta', 'Quemaron un pedazo de bosque y ya están plantando arbolitos de aguacate, se ve la brecha nueva desde la carretera.', 'Ejido Opopeo', 'dias', 1],
    ['denuncia', 'Peribán', 'Olla de agua o extracción de agua', 'Hicieron una olla muy grande y bajan mangueras al arroyo; el arroyo ya casi no trae agua para el pueblo.', 'Barrio de Arriba', 'dias', 1],
    ['denuncia', 'Uruapan', 'Incendio o quema', 'Hubo un incendio la semana pasada en la ladera y ahora ya están limpiando con maquinaria.', 'Colonia San Rafael', 'dias', 0],
    ['denuncia', 'Tacámbaro', 'Tala o desmonte', 'Están desmontando una parte del monte junto a la huerta de la orilla, ya van varias hectáreas.', 'Rancho El Encino', 'antes', 0],
    ['denuncia', 'Nuevo Parangaricutiro', 'Cambio de uso de suelo / nueva huerta', 'Abrieron un claro grande en el bosque comunal, ya hay estacas marcando líneas para plantar.', 'Predio comunal', 'dias', 2],
    ['sugerencia', 'Uruapan', 'Reforestación y restauración', 'Que los viveros entreguen planta nativa a las escuelas y se haga una jornada de reforestación cada temporada de lluvias.', 'Centro', null, 0],
    ['sugerencia', 'Morelia', 'Transparencia y esta plataforma', 'Que el mapa se pueda ver en el celular sin datos y que avise cuando hay una alerta nueva en mi municipio.', 'Chapultepec Norte', null, 0],
    ['propuesta', 'Pátzcuaro', 'Vigilancia contra la tala', 'Propongo brigadas comunitarias pagadas que recorran los cerros los fines de semana con apoyo de dron.', 'Ihuatzio', null, 0],
    ['propuesta', 'Ziracuaretiro', 'Agua y ollas', 'Un padrón público de ollas de agua con su permiso, para saber cuáles tienen autorización y cuáles no.', 'San Andrés Coru', null, 0],
    ['opinion', 'Los Reyes', 'Transparencia y esta plataforma', 'Me parece muy bien que se pueda consultar si una huerta está limpia antes de comprarle, así el que cumple no paga por el que no.', 'Centro', null, 0],
    ['opinion', 'Tingambato', 'Apoyo a productores', 'Los productores chicos no tienen cómo pagar un estudio con dron; si no hay apoyo esto va a ser solo para los grandes.', 'Pichátaro', null, 0],
    ['opinion', 'Zitácuaro', 'Vigilancia contra la tala', 'Siempre se denuncia y no pasa nada, ojalá esta vez sí se vea en qué quedó cada reporte.', 'Crescencio Morales', null, 0],
    ['sugerencia', 'Ario', 'Apoyo a productores', 'Capacitación en las tenencias para que los productores sepan cómo inscribir su huerta y qué documentos necesitan.', 'La Mora', null, 0],
  ];
  const ptIn = id => { const b = bboxMunicipio(id); for (let k = 0; k < 400; k++) { const lon = b[0] + (b[2] - b[0]) * r(), lat = b[1] + (b[3] - b[1]) * r(); const m = municipioEn(lon, lat); if (m && m.id === id) return [lon, lat]; } return [munById(id).cx, munById(id).cy]; };
  const back = n => { const d = new Date(TODAY.getTime() - n * 864e5); return d.toISOString().replace(/\.\d+Z/, 'Z'); };
  rows.forEach(([tipo, mn, cat, desc, col, ahora, nf], i) => {
    const m = byName[mn]; if (!m) return; const precisa = tipo === 'denuncia' || r() < .3; const [lon, lat] = precisa ? ptIn(m.id) : [m.cx, m.cy];
    const rec = { tipo, categoria: cat, descripcion: desc, municipio: m.id, localidad: mn === 'Ario' ? 'Ario de Rosales' : mn, colonia: col, referencias: '', ubicacion: { lon: +lon.toFixed(5), lat: +lat.toFixed(5), precision: precisa ? (r() < .5 ? 'gps' : 'mapa') : 'municipio' }, ahora, fotos: [...Array(nf)].map((_, k) => ({ n: `foto_${k + 1}.jpg`, sha: sha256Str('foto' + i + k) })), anonimo: r() < .7, canal: r() < .75 ? 'Arbolín' : 'Formulario web', demo: true, ts: back(2 + i * 2 + Math.floor(r() * 2)) };
    rec.contacto = rec.anonimo ? null : { tipo: 'correo', v: `ciudadano${i + 1}@ejemplo.mx` };
    rec.cruce = cruceGeografico(rec.ubicacion.lon, rec.ubicacion.lat); rec.cat = catalogar(rec);
    rec.hash = sha256Str(JSON.stringify({ ...rec, contacto: null })); rec.folio = `${TIPOS[tipo].pref}-2026-${rec.hash.slice(0, 5).toUpperCase()}`; rec.vence = addBusinessDays(rec.ts.slice(0, 10), rec.cat.plazo);
    rec.estado = tipo === 'denuncia' ? (i % 3 === 0 ? 'Turnada' : 'En análisis') : ['Recibida', 'Respondida', 'Turnada', 'Atendida'][i % 4];
    if (rec.estado === 'Respondida') rec.respuesta = { ts: back(1), txt: 'Gracias. Tu propuesta se incorporó a la agenda de la mesa de participación de este trimestre.', actor: 'Coordinación de participación' };
    S.participaciones.push(rec);
  });
  S.participaciones.sort((a, b) => b.ts.localeCompare(a.ts));
})();
export const GF_MUN = GF.mun;
