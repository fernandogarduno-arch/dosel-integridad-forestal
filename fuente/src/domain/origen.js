// Origen certificado (acuerdo Presidencia–APEAM, oct-2026): "sólo aguacate con origen certificado ingresará a EE. UU."
// Medida 1 · Trazabilidad reforzada: huerta de origen → corte → empacadora → inspección → cargamento → cruce; sin mezcla
//            con fruta de estados no autorizados (sólo Michoacán y Jalisco).
// Medida 2 · Constancia ambiental: la huerta no se estableció mediante tala; agua; recuperación de zonas afectadas; laboral.
// Las reglas que definirán documentos, inspecciones y mecanismos aún no se publican: todo umbral es un parámetro.
import { rng, TODAY } from '../util.js';
import { S, munName } from '../state.js';
import { sha256Str, ledgerAppend } from '../integrity.js';
import { H, hById, PARAMS, ESTADOS, CULTIVOS, ROLES, pOf, cortes, todayIso, addBusinessDays, businessDaysBetween } from './core.js';
import './process.js'; // conserva el orden de siembra: expedientes antes que lotes
import { EMP, balance, capacidad, laboral, ratioComp } from './trace.js';

export const ACUERDO = {
  titulo: 'Sólo aguacate con origen certificado ingresará a EE. UU.',
  fuente: 'Milenio, 2 de octubre de 2026 · entrevista al director general de la Asociación de Productores y Empacadores Exportadores de Aguacate de México (APEAM)',
  fuenteCorta: 'Milenio, 2-oct-2026 (APEAM)',
  medidas: [
    { k: 'trazabilidad', n: 'Trazabilidad reforzada', d: 'Identificar la huerta de origen, la empacadora que recibió la fruta, las inspecciones que superó y el cargamento en que se incorporó antes de cruzar la frontera, para impedir que aguacate de huertas no inspeccionadas o de estados no autorizados se mezcle con el certificado.' },
    { k: 'constancia', n: 'Constancia ambiental', d: 'Demostrar que las huertas no se establecieron mediante la tala de bosques; además, proteger los recursos hídricos, recuperar zonas afectadas y cumplir con las obligaciones laborales.' },
  ],
  temporada: { id: '2026-2027', ini: '2026-10-15', fin: '2027-04-30', nota: 'La temporada de mayor exportación inicia el 15 de octubre y termina en abril.' },
  estadosAut: { '16': 'Michoacán', '14': 'Jalisco' },
  cifras: [['Exportación a EE. UU. (último año)', '≈ 1,250,000 t'], ['Mercado nacional y otros países', 'hasta 2,300,000 t'], ['Empleos directos', '≈ 120,000'], ['Empleos indirectos', '90,000 – 100,000']],
  pendiente: 'APEAM ya recibió los lineamientos de cero deforestación, pero aún espera las reglas que definirán los documentos, inspecciones y mecanismos para acreditar su cumplimiento.',
  laboral: 'Los acuerdos contemplan que productores, empacadores y exportadores operen en la legalidad, registren formalmente a sus trabajadores y mejoren sus condiciones salariales, en todas las etapas: huerta, corte, selección, empaque, transporte y comercialización.',
};
export const EDOS = { '01': 'Aguascalientes', '02': 'Baja California', '03': 'Baja California Sur', '04': 'Campeche', '05': 'Coahuila', '06': 'Colima', '07': 'Chiapas', '08': 'Chihuahua', '09': 'Ciudad de México', '10': 'Durango', '11': 'Guanajuato', '12': 'Guerrero', '13': 'Hidalgo', '14': 'Jalisco', '15': 'Estado de México', '16': 'Michoacán', '17': 'Morelos', '18': 'Nayarit', '19': 'Nuevo León', '20': 'Oaxaca', '21': 'Puebla', '22': 'Querétaro', '23': 'Quintana Roo', '24': 'San Luis Potosí', '25': 'Sinaloa', '26': 'Sonora', '27': 'Tabasco', '28': 'Tamaulipas', '29': 'Tlaxcala', '30': 'Veracruz', '31': 'Yucatán', '32': 'Zacatecas' };
// Parámetros de la constancia (a ajustar cuando se publiquen las reglas de operación)
PARAMS.constancia = { bloqueantes: ['origen', 'deforestacion', 'trazabilidad'], subsanacionDH: 30, umbralLaboral: .6, version: 'CAO-0.9 (propuesta)' };
export const COMP = [
  { k: 'origen', n: 'Origen autorizado y registro', med: 'trazabilidad', doc: 'Identificador único de huerta (UID) ligado a su registro de huerta para exportación', ins: 'Consulta automática en cada recepción de fruta', mec: 'Padrón con UID + API de elegibilidad + control de origen', par: 'Estados autorizados: Michoacán y Jalisco' },
  { k: 'deforestacion', n: 'Cero deforestación (no establecida mediante tala)', med: 'constancia', doc: 'Dictamen técnico con fecha de corte y serie histórica de imágenes', ins: 'Revisión satelital continua; visita de campo cuando hay alerta', mec: 'Algoritmo MET-VD-BRK + debido proceso (audiencia y recurso)', par: 'Fecha de corte (hoy 2018 estatal / 2019 federal) y criterio de incendio' },
  { k: 'agua', n: 'Protección de recursos hídricos', med: 'constancia', doc: 'Título de concesión o registro de las ollas y pozos de la huerta', ins: 'Cruce de ollas detectadas en imagen contra concesiones; visita si no hay título', mec: 'Módulo de agua (ollas vs. registro público de derechos de agua)', par: 'Distancia máxima a concesión: 500 m' },
  { k: 'restauracion', n: 'Recuperación de zonas afectadas', med: 'constancia', doc: 'Proyecto de restauración + registro de compensación', ins: 'Verificación con LiDAR o dron y campo', mec: 'Proyectos de restauración + registro de compensación con bloqueo de doble uso', par: `Compensación ${PARAMS.compensacion.min} a ${PARAMS.compensacion.max} ha por ha convertida` },
  { k: 'laboral', n: 'Obligaciones laborales', med: 'constancia', doc: 'Registro patronal y trabajadores asegurados', ins: 'Cruce con el registro de asegurados (convenio)', mec: 'Módulo laboral (cruce por RFC, sin exponer datos personales)', par: `Mínimo ${Math.round(PARAMS.trabajadoresHa * 100) / 100} trabajadores asegurados/ha al 60 %` },
  { k: 'trazabilidad', n: 'Trazabilidad y balance de masa', med: 'trazabilidad', doc: 'Lotes ligados a la huerta y a la versión de la lista de elegibles', ins: 'Auditoría de balance: lo entregado contra la capacidad productiva', mec: 'Cadena huerta → lote → empacadora → embarque + balance de masa', par: `Tolerancia ${PARAMS.balanceTolerancia}× · alerta de lavado ${PARAMS.balanceFraude}×` },
];
export const EST_C = { 'Vigente': { c: '#2E7D32', k: 'ok', d: 'Cumple todos los componentes; puede exportar en la temporada.' }, 'Condicionada': { c: '#A8720F', k: 'warn', d: 'Cumple lo indispensable (origen, cero deforestación y trazabilidad); debe subsanar observaciones en plazo.' }, 'En trámite': { c: '#235B4E', k: 'info', d: 'Hay una revisión o procedimiento abierto; se resuelve antes de emitir.' }, 'No procede': { c: '#B3261E', k: 'bad', d: 'No cumple un componente indispensable.' }, 'No aplica': { c: '#6F7C77', k: '', d: 'Cultivo no sujeto a exportación.' } };
export const ST_COMP = { cumple: ['Cumple', 'ok'], observacion: ['Observación', 'warn'], no_cumple: ['No cumple', 'bad'], en_proceso: ['En proceso', 'info'], no_aplica: ['No aplica', ''] };
const exporta = h => CULTIVOS.find(c => c.k === h.cul)?.exporta;
let _bal = null, _balN = -1; const balOf = uid => { if (!_bal || _balN !== S.lotes.length) { _bal = new Map(balance().map(b => [b.h.uid, b])); _balN = S.lotes.length; } return _bal.get(uid); };
export const edoDe = uid => { const m = String(uid || '').match(/^HUE-?(\d{2})/i); return m ? m[1] : null; };

// ---------------- Constancia ambiental de origen (evaluación por huerta) ----------------
const cache = new Map();
export function constancia(h) {
  const key = h.uid + '|' + h.estado + '|' + S.lotes.length + '|' + S.comp.length + '|' + PARAMS.constancia.bloqueantes.join(',') + PARAMS.balanceFraude;
  const hit = cache.get(h.uid); if (hit && hit.key === key) return hit.v;
  const p = pOf(h), avo = h.cul === 'Aguacate', ex = exporta(h); const c = (k, estado, det, accion = null) => ({ k, n: COMP.find(x => x.k === k).n, estado, det, accion });
  const comps = [];
  const edo = edoDe(h.uid), aut = ACUERDO.estadosAut[edo];
  comps.push(!ex ? c('origen', 'no_aplica', 'Cultivo no sujeto a exportación') : !h.senasica ? c('origen', 'no_cumple', 'Sin registro de huerta para exportación', 'Registrar la huerta ante la autoridad fitosanitaria') : avo && !aut ? c('origen', 'no_cumple', `${EDOS[edo] || 'Estado'} no está autorizado para exportar aguacate a EE. UU.`) : c('origen', 'cumple', `${aut || EDOS[edo]} · registro ${h.senasica}`));
  const ct = cortes(h);
  const def = { 'Libre': ['cumple', `Sin conversión de bosque posterior al corte (${ct.regla.toLowerCase()})`], 'Rehabilitado': ['cumple', 'Restauración y compensación verificadas; vigilancia reforzada'], 'En revisión': ['en_proceso', 'Alerta en revisión; sin efectos hasta que haya dictamen'], 'Con alerta': ['en_proceso', 'Procedimiento en garantía de audiencia'], 'Bloqueado': ['no_cumple', 'Dictamen firme: conversión de bosque posterior al corte'], 'En restauración': ['no_cumple', 'Restauración en curso; se acredita al verificarse'] }[h.estado];
  comps.push(c('deforestacion', def[0], def[1], def[0] === 'no_cumple' ? (h.estado === 'Bloqueado' ? 'Presentar proyecto de restauración y compensación' : 'Concluir la restauración y solicitar verificación') : null));
  const ollas = S.ollas.filter(o => o.uid === h.uid), sin = ollas.filter(o => !o.pozo);
  comps.push(!ollas.length ? c('agua', 'cumple', 'Sin ollas de agua detectadas en la huerta') : !sin.length ? c('agua', 'cumple', `${ollas.length} olla(s) con concesión registrada a menos de 500 m`) : c('agua', 'observacion', `${sin.length} olla(s) sin concesión a menos de 500 m (${sin.map(o => o.id).join(', ')})`, 'Acreditar título de concesión o registro ante CONAGUA'));
  const afect = ['naranja', 'rojo'].includes(p.cls) || ['Bloqueado', 'En restauración', 'Rehabilitado'].includes(h.estado); const cmp = S.comp.find(x => x.uid === h.uid);
  comps.push(!afect ? c('restauracion', 'no_aplica', 'Sin zonas afectadas que recuperar') : h.estado === 'Rehabilitado' ? c('restauracion', 'cumple', `Restauración verificada${cmp ? ' · compensación ' + cmp.id : ''}`) : h.estado === 'En restauración' ? c('restauracion', 'en_proceso', `Proyecto en ejecución${cmp ? ' · compensación ' + cmp.id + ' (' + cmp.ha + ' ha)' : ' · compensación por registrar'}`) : ['Con alerta', 'En revisión'].includes(h.estado) ? c('restauracion', 'en_proceso', 'Se determina al resolver el procedimiento') : c('restauracion', 'no_cumple', `Sin proyecto de restauración; compensación requerida ${ratioComp(h)}:1`, 'Presentar proyecto y registrar compensación'));
  if (ex) { const l = laboral(h); comps.push(!l.registro ? c('laboral', 'no_cumple', 'Sin registro patronal', 'Registrar a los trabajadores ante el IMSS') : l.asegurados < l.esperados * PARAMS.constancia.umbralLaboral ? c('laboral', 'observacion', `${l.asegurados} trabajadores asegurados de ${l.esperados} esperados`, 'Formalizar a los trabajadores faltantes') : c('laboral', 'cumple', `${l.asegurados} trabajadores asegurados (esperados ${l.esperados})${l.isn ? ' · ISN al corriente' : ''}`)); }
  else comps.push(c('laboral', 'no_aplica', 'Cultivo no sujeto a exportación'));
  const b = ex ? balOf(h.uid) : null;
  comps.push(!b ? c('trazabilidad', ex ? 'cumple' : 'no_aplica', ex ? 'Sin entregas registradas esta temporada' : 'Cultivo no sujeto a exportación') : b.flag === 'Posible lavado' ? c('trazabilidad', 'no_cumple', `Entregó ${b.ent} t con capacidad de ${b.cap} t (${b.ratio.toFixed(2)}×): posible lavado de fruta`, 'Auditoría de balance de masa') : b.flag === 'Revisar' ? c('trazabilidad', 'observacion', `Entregó ${b.ent} t con capacidad de ${b.cap} t (${b.ratio.toFixed(2)}×)`, 'Aclarar rendimiento con aforo de campo') : c('trazabilidad', 'cumple', `Entregó ${b.ent} t de ${b.cap} t de capacidad (${b.ratio.toFixed(2)}×)`));
  const blo = comps.filter(x => PARAMS.constancia.bloqueantes.includes(x.k));
  const estado = !ex ? 'No aplica' : blo.some(x => x.estado === 'no_cumple') ? 'No procede' : blo.some(x => x.estado === 'en_proceso') ? 'En trámite' : comps.some(x => ['no_cumple', 'observacion'].includes(x.estado) || (x.estado === 'en_proceso')) ? 'Condicionada' : 'Vigente';
  const pend = comps.filter(x => x.accion && x.estado !== 'cumple');
  const sha = sha256Str(JSON.stringify({ uid: h.uid, t: ACUERDO.temporada.id, v: PARAMS.constancia.version, estado, comps: comps.map(x => [x.k, x.estado, x.det]) }));
  const v = { uid: h.uid, folio: 'CAO-2627-' + sha.slice(0, 6).toUpperCase(), estado, comps, pend, sha, cultivo: h.cul, municipio: munName[h.mun], ha: p.ha, cap: ex ? capacidad(h) : 0, vigencia: ACUERDO.temporada, plazo: estado === 'Condicionada' ? addBusinessDays(todayIso(), PARAMS.constancia.subsanacionDH) : null, emitida: (S.constancias || {})[h.uid] || null };
  cache.set(h.uid, { key, v }); return v;
}
export const constanciaPorFolio = f => { f = String(f || '').toUpperCase().trim(); const e = Object.values(S.constancias).find(x => x.folio === f); if (e) return constancia(hById[e.uid]); return H.map(constancia).find(c => c.folio === f) || null; };
export const universo = () => H.filter(h => h.cul === 'Aguacate' && exporta(h));
export function preparacion() {
  const U = universo().map(constancia); const by = k => U.filter(c => c.estado === k);
  const per = {}; U.forEach(c => { const h = hById[c.uid]; const m = per[h.mun] ||= { mun: h.mun, n: 0, Vigente: 0, Condicionada: 0, 'En trámite': 0, 'No procede': 0, cap: 0, capOk: 0 }; m.n++; m[c.estado]++; m.cap += c.cap; if (['Vigente', 'Condicionada'].includes(c.estado)) m.capOk += c.cap; });
  const pend = {}; U.forEach(c => c.comps.forEach(x => { if (['no_cumple', 'observacion'].includes(x.estado)) pend[x.k] = (pend[x.k] || 0) + 1; }));
  const dias = businessDaysBetween(todayIso(), ACUERDO.temporada.ini), nat = Math.round((new Date(ACUERDO.temporada.ini + 'T12:00:00') - TODAY) / 864e5);
  return { U, n: U.length, vig: by('Vigente'), cond: by('Condicionada'), tram: by('En trámite'), np: by('No procede'), cap: U.reduce((s, c) => s + c.cap, 0), capOk: U.filter(c => ['Vigente', 'Condicionada'].includes(c.estado)).reduce((s, c) => s + c.cap, 0), per: Object.values(per).sort((a, b) => b.n - a.n), pend, dias, nat, emitidas: Object.keys(S.constancias).length };
}
// ---------------- Emisión (firma simulada; separación de funciones) ----------------
S.constancias = {};
export function emitirConstancias(user, uids) {
  if (ROLES[user.rol] && user.rol !== 'dictamen') return { ok: false, why: `La emisión de constancias corresponde al rol «${ROLES.dictamen.n}» (usted actúa como ${ROLES[user.rol].n})` };
  if (user.coi !== 'Firmada') return { ok: false, why: `${user.id} no tiene declaración de conflicto de interés vigente` };
  const list = (uids ? uids.map(u => hById[u]) : universo()).map(constancia).filter(c => ['Vigente', 'Condicionada'].includes(c.estado) && !S.constancias[c.uid]);
  if (!list.length) return { ok: false, why: 'No hay constancias pendientes de emitir' };
  const ts = new Date().toISOString().replace(/\.\d+Z/, 'Z'); list.forEach(c => { S.constancias[c.uid] = { uid: c.uid, folio: c.folio, sha: c.sha, estado: c.estado, ts, firma: user.id, sello: 'NOM-151 (simulado) ' + sha256Str(c.sha + ts).slice(0, 16) }; });
  const raiz = sha256Str(list.map(c => c.sha).sort().join('')); ledgerAppend(S.ledger, user.id, 'CONSTANCIAS_EMITIDAS', `${list.length} constancias · temporada ${ACUERDO.temporada.id}`, raiz); cache.clear();
  return { ok: true, n: list.length, vig: list.filter(c => c.estado === 'Vigente').length, cond: list.filter(c => c.estado === 'Condicionada').length, raiz };
}

// ---------------- Trazabilidad reforzada: corte → recepción → inspección → cargamento → cruce ----------------
const PUERTOS = ['Nuevo Laredo, Tamps. → Laredo, TX', 'Reynosa, Tamps. → Pharr, TX', 'Nogales, Son. → Nogales, AZ'];
const ESTADOS_DESTINO = ['Texas', 'California', 'Illinois', 'Nueva York', 'Florida', 'Georgia'];
const plus = (iso, d) => new Date(new Date(iso + 'T12:00:00Z').getTime() + d * 864e5).toISOString().slice(0, 10);
export function detalleLote(l) { const r = rng('TZ' + l.id); const h = hById[l.uid]; const lab = laboral(h); return { corte: plus(l.fecha, -Math.floor(r() * 2)), cuadrilla: `CUA-${h.mun.slice(1)}-${String(Math.floor(r() * 400)).padStart(3, '0')}`, cortadores: 8 + Math.floor(r() * 9), asegurados: lab.registro ? 'Cuadrilla con registro patronal' : 'Sin registro patronal (observación laboral)', transporte: `TRL-${String(Math.floor(r() * 9000) + 1000)}`, temp: (5 + r() * 2).toFixed(1) }; }
export function detalleEmbarque(e) { const r = rng('EB' + e.id); return { inspeccion: { id: 'INS-' + e.id.slice(4), fecha: e.fecha, res: 'Aprobada', por: 'Inspección fitosanitaria del programa de exportación (SENASICA–USDA)' }, sello: 'SEL-' + String(Math.floor(r() * 1e7)).padStart(7, '0'), puerto: PUERTOS[Math.floor(r() * PUERTOS.length)], cruce: plus(e.fecha, 1 + Math.floor(r() * 2)), destino: ESTADOS_DESTINO[Math.floor(r() * ESTADOS_DESTINO.length)] }; }
export function trazar(q) {
  q = String(q || '').trim().toUpperCase(); let lotes = [];
  if (q.startsWith('CAO-')) { const c = constanciaPorFolio(q); if (c) q = c.uid; }
  if (q.startsWith('EMB-')) lotes = S.lotes.filter(l => l.emb === q); else if (q.startsWith('LOT-')) lotes = S.lotes.filter(l => l.id === q); else if (q.startsWith('HUE-')) lotes = S.lotes.filter(l => l.uid === q);
  if (!lotes.length) return null;
  const embs = [...new Set(lotes.map(l => l.emb).filter(Boolean))].map(id => S.embarques.find(e => e.id === id)).filter(Boolean);
  const hs = [...new Set(lotes.map(l => l.uid))].map(u => hById[u]); const cs = hs.map(constancia);
  const sello = sha256Str(lotes.map(l => l.id + l.uid + l.t).join('|') + embs.map(e => e.id).join('|'));
  return { q, lotes, embs, hs, cs, sello, t: lotes.reduce((s, l) => s + l.t, 0), ok: cs.every(c => ['Vigente', 'Condicionada'].includes(c.estado)) };
}
// Intentos de mezcla con fruta de origen no autorizado (bloqueados en recepción) — semilla de demostración
(function seed() {
  const r = rng('MEZCLA'); const edos = ['12', '15', '17', '18', '21', '12', '15', '20'];
  edos.forEach((e, i) => { const uid = `HUE-${e}${String(1 + Math.floor(r() * 80)).padStart(3, '0')}-${String(1 + Math.floor(r() * 900)).padStart(5, '0')}`; S.consultas.push({ ts: new Date(Date.UTC(2026, 7, 4) + r() * 55 * 864e5).toISOString().replace(/\.\d+Z/, 'Z'), emp: EMP[Math.floor(r() * EMP.length)].id, uid, t: +(4 + r() * 9).toFixed(1), elegible: false, origen: true, motivo: `Origen no autorizado: ${EDOS[e]} no está autorizado para exportar aguacate a EE. UU.`, via: r() < .6 ? 'API' : 'Portal' }); });
  S.consultas.sort((a, b) => b.ts.localeCompare(a.ts));
})();
export function controlOrigen(uid) {
  const e = edoDe(uid); if (!e || e === '16') return null;
  if (ACUERDO.estadosAut[e]) return { ok: false, motivo: `Huerta de ${EDOS[e]} (estado autorizado): su constancia la emite ${EDOS[e]}. La consulta interestatal requiere convenio y no está configurada en esta demostración.` };
  return { ok: false, origen: true, motivo: `Origen no autorizado: ${EDOS[e] || 'estado desconocido'} no está autorizado para exportar aguacate a EE. UU. (sólo Michoacán y Jalisco). Se bloquea para evitar la mezcla con fruta certificada.` };
}
export const CHECK_RECEPCION = {
  pre: uid => controlOrigen(uid),
  post: uid => { const h = hById[uid]; if (!h) return { ok: true }; const c = constancia(h); if (['Vigente', 'Condicionada'].includes(c.estado)) return { ok: true, folio: c.folio, nota: c.estado === 'Condicionada' ? `Constancia condicionada (${c.folio}): subsanar ${c.pend.map(x => x.n.toLowerCase()).join(', ')} antes del ${c.plazo}` : `Constancia ambiental vigente ${c.folio}` }; return { ok: false, folio: c.folio, motivo: `Constancia ambiental de origen: ${c.estado.toLowerCase()} — ${(c.comps.find(x => PARAMS.constancia.bloqueantes.includes(x.k) && x.estado !== 'cumple') || {}).det || EST_C[c.estado].d}` }; },
};
