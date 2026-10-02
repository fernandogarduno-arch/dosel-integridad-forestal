// Núcleo de dominio del Módulo de Verificación y Dictamen.
// Unidad de análisis: la HUERTA (polígono con identificador único ligado a SENASICA, catastro, RAN y RFC/CURP).
// Todo lo marcado demo:true es sintético y determinista (mismo resultado en cada carga).
import { rng, TODAY } from '../util.js';
import { S, prediosById, munName } from '../state.js';
import { forestSeries } from '../ui.js';
import { sha256Str } from '../integrity.js';

// ---------------- Parámetros normativos (configurables, versionados) ----------------
export const MET = { id: 'MET-VD', ver: '1.0.0', fecha: '2026-09-15', estado: 'Borrador para validación académica' };
export const PARAMS = {
  // Tres reglas de corte con efectos distintos (no se concilian): Pro-Forest, exportación y ruta de restauración
  corteEstatal: { fecha: '2018-01-01', nombre: 'Pro-Forest 2018', base: 'Programa Pro-Forest (decreto estatal): deforestación desde el 1-ene-2018, incendio desde 2012, fuera de ANP' },
  corteFederal: { fecha: '2019-01-01', nombre: 'Exportación 2019', base: 'Acuerdo DOF 24 oct 2025: 2019' },
  corteFuego: { fecha: '2012-01-01', nombre: 'Criterio de incendio 2012', base: 'Regla Pro-Forest: incendio seguido de cambio de uso' },
  rutaRestauracion: { ini: '2019-01-01', fin: '2025-12-31', base: 'Afectación 2019–2025: ruta de restauración y compensación' },
  umbralForestal: 30, // % de cobertura arbórea a la fecha de corte para considerar terreno forestal (a homologar con INEGI USV serie VII / INF)
  custf: { conectado: false, fuente: 'Autorizaciones de cambio de uso de suelo en terreno forestal (CUSTF) · SEMARNAT', estado: 'Sin conexión por convenio' },
  ventanaFuegoAnios: 5,
  umbralRuptura: 20, // puntos de cobertura arbórea (%) entre medias antes/después
  spiSequia: -1.5,
  plazoAudienciaDH: 10, plazoRecursoDH: 15,
  umbralPublicacion: { ua: .85, pa: .80, semiIC: .25 },
  balanceTolerancia: 1.15, balanceFraude: 1.30, // editables (MET-VD); la especificación propone 1.3 para posible lavado
  trabajadoresTonelada: null, // pendiente de DOF (Factor Técnico)
  slaBalanceHoras: 72,
  rendimiento: { Aguacate: 10, Berries: 18, Durazno: 12, 'Limón': 14, Agave: 0, 'Maíz': 0, Otro: 0 }, // t/ha/año, calibrar con SIAP y aforo
  compensacion: { min: 3, max: 6 }, // ha de bosque por ha convertida
  cuotaLote: 185, // MXN por lote verificado (ilustrativa, a costo de recuperación)
  sicoa: { conectado: false, simulado: false, fuente: 'SICOA · SENASICA (registro y certificación de huertas por temporada)', estado: 'Sin conexión: convenio pendiente' },
};
export const CULTIVOS = [ // diseño multicultivo: agregar un cultivo = agregar una fila
  { k: 'Aguacate', exporta: true, ciclo: 'Perenne', regla: 'Corte forestal + balance de masa' },
  { k: 'Berries', exporta: true, ciclo: 'Anual / macrotúnel', regla: 'Corte forestal + balance de masa' },
  { k: 'Limón', exporta: true, ciclo: 'Perenne', regla: 'Corte forestal + balance de masa' },
  { k: 'Durazno', exporta: false, ciclo: 'Perenne', regla: 'Corte forestal' },
  { k: 'Agave', exporta: false, ciclo: 'Plurianual', regla: 'Corte forestal' },
  { k: 'Maíz', exporta: false, ciclo: 'Anual', regla: 'Sólo monitoreo' },
  { k: 'Otro', exporta: false, ciclo: '—', regla: 'Sólo monitoreo' },
];

// ---------------- Estados legales del predio ----------------
export const ESTADOS = {
  'Libre': { c: '#2E7D32', d: 'Sin conversión posterior a los cortes; elegible.', eleg: true },
  'En revisión': { c: '#BC955C', d: 'Alerta validada o información insuficiente; sin efectos hasta dictamen.', eleg: false },
  'Con alerta': { c: '#A8720F', d: 'Proyecto de dictamen notificado; en garantía de audiencia.', eleg: false },
  'Bloqueado': { c: '#B3261E', d: 'Dictamen firme de conversión posterior al corte; no elegible.', eleg: false },
  'En restauración': { c: '#235B4E', d: 'Proyecto de restauración y compensación registrados; no elegible hasta verificar.', eleg: false },
  'Rehabilitado': { c: '#235B4E', d: 'Restauración y compensación verificadas; elegible con vigilancia reforzada.', eleg: true },
};
// Transiciones permitidas y rol que puede ejecutarlas
export const TRANS = [
  ['Libre', 'En revisión', 'deteccion', 'Alerta validada por analista'],
  ['En revisión', 'Libre', 'deteccion', 'Alerta descartada con evidencia'],
  ['En revisión', 'Con alerta', 'dictamen', 'Proyecto de dictamen notificado'],
  ['Con alerta', 'Libre', 'dictamen', 'Dictamen favorable tras audiencia'],
  ['Con alerta', 'Bloqueado', 'dictamen', 'Dictamen firme no elegible'],
  ['Bloqueado', 'En restauración', 'dictamen', 'Proyecto aprobado y compensación registrada'],
  ['En restauración', 'Rehabilitado', 'dictamen', 'Verificación LiDAR/campo de cumplimiento'],
  ['Bloqueado', 'Libre', 'revision', 'Resolución de segunda instancia revoca'],
  ['Bloqueado', 'En revisión', 'revision', 'Resolución ordena reponer el procedimiento'],
  ['Con alerta', 'En revisión', 'revision', 'Resolución ordena reponer el procedimiento'],
];

// ---------------- Roles y personas (sólo alias: protección del personal) ----------------
export const ROLES = {
  deteccion: { n: 'Analista de detección', area: 'Unidad de Monitoreo', puede: 'Validar o descartar alertas; solicitar visita de campo' },
  campo: { n: 'Brigada de verificación', area: 'Brigadas de Campo', puede: 'Registrar visitas y evidencia de campo' },
  dictamen: { n: 'Dictaminador', area: 'Dirección de Dictaminación', puede: 'Emitir proyecto de dictamen y dictamen firme; cambiar estado legal' },
  revision: { n: 'Revisor de segunda instancia', area: 'Unidad de Revisión (área distinta)', puede: 'Resolver recursos de revisión' },
  juridico: { n: 'Jurídico', area: 'Dirección Jurídica', puede: 'Notificar, dar vista a PROFEPA/FGE' },
  auditor: { n: 'Auditor externo', area: 'Institución independiente', puede: 'Sólo lectura, bitácora y expedientes' },
};
const MUNS = [...new Set(S.predios.features.map(f => f.properties.mun))].sort();
const slice = (a, b) => MUNS.filter((_, i) => i % b === a);
export const USERS = [
  { id: 'DET-03', rol: 'deteccion', cartera: slice(0, 2), coi: 'Firmada', coiF: '2026-01-12', conflictos: [], rot: '2026-12-31', mfa: 'Llave FIDO2' },
  { id: 'DET-07', rol: 'deteccion', cartera: slice(1, 2), coi: 'Firmada', coiF: '2026-01-12', conflictos: [], rot: '2026-12-31', mfa: 'Llave FIDO2' },
  { id: 'CAM-02', rol: 'campo', cartera: MUNS, coi: 'Firmada', coiF: '2026-02-03', conflictos: [], rot: '2026-10-31', mfa: 'App TOTP' },
  { id: 'DIC-01', rol: 'dictamen', cartera: slice(0, 2), coi: 'Firmada', coiF: '2026-01-15', conflictos: [], rot: '2027-01-31', mfa: 'Llave FIDO2' },
  { id: 'DIC-04', rol: 'dictamen', cartera: slice(1, 2), coi: 'Firmada', coiF: '2026-01-15', conflictos: [], rot: '2027-01-31', mfa: 'Llave FIDO2' },
  { id: 'DIC-09', rol: 'dictamen', cartera: MUNS.slice(0, 6), coi: 'Pendiente', coiF: null, conflictos: [], rot: '2027-01-31', mfa: 'Llave FIDO2' },
  { id: 'REV-01', rol: 'revision', cartera: MUNS, coi: 'Firmada', coiF: '2026-01-20', conflictos: [], rot: '2027-06-30', mfa: 'Llave FIDO2' },
  { id: 'JUR-02', rol: 'juridico', cartera: MUNS, coi: 'Firmada', coiF: '2026-01-20', conflictos: [], rot: '2027-06-30', mfa: 'App TOTP' },
  { id: 'AUD-EXT', rol: 'auditor', cartera: MUNS, coi: 'Firmada', coiF: '2026-03-01', conflictos: [], rot: '—', mfa: 'Llave FIDO2' },
];
export const userById = Object.fromEntries(USERS.map(u => [u.id, u]));
S.user = S.user || 'DIC-01';
export const me = () => userById[S.user];

// ---------------- Días hábiles (México) ----------------
const nthMon = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)); const off = (8 - d.getUTCDay()) % 7; return new Date(Date.UTC(y, m, 1 + off + 7 * (n - 1))).toISOString().slice(0, 10); };
const HOL = y => new Set([`${y}-01-01`, nthMon(y, 1, 1), nthMon(y, 2, 3), `${y}-05-01`, `${y}-09-16`, nthMon(y, 10, 3), `${y}-12-25`]);
export function addBusinessDays(iso, n) { let d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); let k = 0; while (k < n) { d = new Date(d.getTime() + 864e5); const s = d.toISOString().slice(0, 10), w = d.getUTCDay(); if (w && w !== 6 && !HOL(d.getUTCFullYear()).has(s)) k++; } return d.toISOString().slice(0, 10); }
export function businessDaysBetween(a, b) { let n = 0, d = new Date(a.slice(0, 10) + 'T12:00:00Z'); const e = new Date(b.slice(0, 10) + 'T12:00:00Z'); while (d < e) { d = new Date(d.getTime() + 864e5); const s = d.toISOString().slice(0, 10), w = d.getUTCDay(); if (w && w !== 6 && !HOL(d.getUTCFullYear()).has(s)) n++; } return n; }
export const todayIso = () => TODAY.toISOString().slice(0, 10);

// ---------------- Registro de huertas ----------------
const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function fakeRfc(r) { const l = () => L[Math.floor(r() * 26)]; const d = () => Math.floor(r() * 10); return `${l()}${l()}${l()}${l()}${d()}${d()}${d()}${d()}${d()}${d()}${l()}${l()}${d()}`; }
export const maskRfc = s => s.slice(0, 2) + '••••••••' + s.slice(-3);
export const H = []; export const hById = {}; export const hByPid = {};
(function build() {
  const cnt = {};
  for (const f of S.predios.features) {
    const p = f.properties, r = rng('H' + p.id), mn = p.mun.slice(1); cnt[mn] = (cnt[mn] || 0) + 1;
    const uid = `HUE-16${mn}-${String(cnt[mn]).padStart(5, '0')}`;
    const ejidal = /ejid|comun/i.test(p.ten);
    const proj = S.proyectos.find(x => x.pid === p.id);
    let estado = { verde: 'Libre', amarillo: 'En revisión', gris: 'En revisión', naranja: 'Con alerta', rojo: 'Bloqueado' }[p.cls];
    if (p.cls === 'naranja' && proj) estado = proj.st === 'Cerrado' ? 'Rehabilitado' : 'En restauración';
    if (p.cls === 'rojo' && proj && proj.st !== 'En evaluación') estado = 'En restauración';
    const h = {
      uid, pid: p.id, mun: p.mun, ha: p.ha, cul: p.cul, prd: p.prd, demo: true,
      senasica: CULTIVOS.find(c => c.k === p.cul)?.exporta ? `SV16-${mn}-${String(Math.floor(r() * 99999)).padStart(5, '0')}` : null,
      catastral: `16-${mn}-${String(Math.floor(r() * 900) + 100)}-${String(Math.floor(r() * 99999)).padStart(5, '0')}`,
      ran: ejidal ? `NA-16${mn}-${String(Math.floor(r() * 40) + 1).padStart(3, '0')}` : null,
      rfc: fakeRfc(r), persona: r() < .82 ? 'Física' : 'Moral',
      estado, hist: [], ten: p.ten,
      canopy: null, spi: null,
    };
    // historial inicial plausible
    const t0 = `202${3 + Math.floor(r() * 3)}-0${1 + Math.floor(r() * 8)}-1${Math.floor(r() * 9)}`;
    h.hist.push({ ts: t0 + 'T10:00:00Z', de: null, a: 'Libre', rol: 'sistema', actor: 'Carga de padrón', mot: 'Inscripción en el padrón', evid: ['Padrón SENASICA (convenio)'] });
    if (estado !== 'Libre') h.hist.push({ ts: '2026-0' + (3 + Math.floor(r() * 5)) + '-1' + Math.floor(r() * 9) + 'T16:20:00Z', de: 'Libre', a: estado === 'Rehabilitado' || estado === 'En restauración' ? 'Bloqueado' : estado === 'Bloqueado' ? 'Con alerta' : 'En revisión', rol: 'deteccion', actor: r() < .5 ? 'DET-03' : 'DET-07', mot: 'Alerta validada por analista', evid: ['Serie Landsat/Sentinel-2', 'Imagen VHR'] });
    if (estado === 'Bloqueado') h.hist.push({ ts: '2026-08-2' + Math.floor(r() * 8) + 'T12:00:00Z', de: 'Con alerta', a: 'Bloqueado', rol: 'dictamen', actor: 'DIC-01', mot: 'Dictamen firme no elegible', evid: ['Dictamen', 'Constancia NOM-151'] });
    if (estado === 'En restauración' || estado === 'Rehabilitado') h.hist.push({ ts: '2026-06-1' + Math.floor(r() * 9) + 'T12:00:00Z', de: 'Bloqueado', a: 'En restauración', rol: 'dictamen', actor: 'DIC-04', mot: 'Proyecto aprobado y compensación registrada', evid: [proj ? proj.id : 'Proyecto', 'Registro de compensación'] });
    if (estado === 'Rehabilitado') h.hist.push({ ts: '2026-09-0' + (1 + Math.floor(r() * 8)) + 'T12:00:00Z', de: 'En restauración', a: 'Rehabilitado', rol: 'dictamen', actor: 'DIC-04', mot: 'Verificación LiDAR/campo de cumplimiento', evid: ['Levantamiento LiDAR íntegro'] });
    // estructura del dosel (GEDI + mapa global de altura) y lluvia
    const forest = p.cls === 'verde' && r() < .25;
    h.canopy = { base: +(16 + r() * 10).toFixed(1), actual: +(forest ? 15 + r() * 9 : 4 + r() * 5).toFixed(1), gedi: Math.floor(r() * 14) };
    H.push(h); hById[uid] = h; hByPid[p.id] = h;
  }
})();
export const pOf = h => prediosById[h.pid].properties;
export const ringOf = h => prediosById[h.pid].geometry.coordinates[0];
export const centroid = h => { const r = ringOf(h); return [r.reduce((a, c) => a + c[0], 0) / r.length, r.reduce((a, c) => a + c[1], 0) / r.length]; };

// ---------------- Lluvia (CHIRPS → SPI) por municipio ----------------
const spiCache = {};
export function spiSeries(mun) { if (spiCache[mun]) return spiCache[mun]; const r = rng('SPI' + mun); const out = []; for (let y = 2012; y <= 2026; y++) { let v = (r() + r() + r() - 1.5) * 1.3; if (y === 2021 || y === 2024) v -= 1.1 + r() * .5; out.push([y, +v.toFixed(2)]); } return (spiCache[mun] = out); }
export const spiAt = (mun, y) => (spiSeries(mun).find(x => x[0] === y) || [0, 0])[1];

// ---------------- Incendios (FIRMS + NBR) ----------------
const fireCache = {};
export function fires(h) {
  const fk = h.uid + '|' + PARAMS.umbralRuptura; if (fireCache[fk]) return fireCache[fk]; const r = rng('F' + h.uid); const out = []; const d = dating(h, true);
  const pc = pOf(h).cls; if (d.brk && d.brk.y >= 2013 && d.brk.y <= 2017 && (pc === 'naranja' || pc === 'rojo')) out.push(mkFire(r, Math.max(2012, d.brk.y - 1 - Math.floor(r() * 2)), true));
  else if (d.brk && d.brk.y >= 2013 && r() < .32) { const y = d.brk.y - 1 - Math.floor(r() * 2); if (y >= 2012) out.push(mkFire(r, y, true)); }
  if (r() < .07) out.push(mkFire(r, 2012 + Math.floor(r() * 14), false));
  return (fireCache[fk] = out.sort((a, b) => a.fecha.localeCompare(b.fecha)));
}
function mkFire(r, y, sev) { const m = 2 + Math.floor(r() * 4); return { fecha: `${y}-${String(m).padStart(2, '0')}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`, sensor: y >= 2012 ? (r() < .7 ? 'VIIRS S-NPP 375 m' : 'MODIS Aqua/Terra 1 km') : 'MODIS', frp: +(8 + r() * 60).toFixed(1), conf: r() < .7 ? 'alta' : 'nominal', dnbr: +(sev ? .35 + r() * .45 : .08 + r() * .2).toFixed(2) }; }
export const nbrClase = d => d >= .66 ? 'Severidad alta' : d >= .44 ? 'Moderada-alta' : d >= .27 ? 'Moderada-baja' : d >= .1 ? 'Baja' : 'Sin quema';

// ---------------- Serie de cobertura, escenas y fechado de conversión ----------------
// Algoritmo MET-VD-BRK v1 (idéntico en reproducir.py):
//   serie anual de cobertura arbórea (compuesto de estación seca, ene-may) → para cada corte k con ≥2 obs a cada lado,
//   d = media(antes) − media(después); se elige el máximo; si d ≥ umbral → ruptura en el año y[k].
//   Ventana anual: [1-ene de y[k-1], 31-may de y[k]]. Con observaciones densas (Sentinel-2/Landsat, 2017+) la ventana se
//   acota a [última observación con bosque, primera observación sin bosque].
export function sensorFor(y) { return y <= 1999 ? 'Landsat 5 TM' : y <= 2012 ? (y % 2 ? 'Landsat 7 ETM+' : 'Landsat 5 TM') : y <= 2016 ? 'Landsat 8 OLI' : y <= 2021 ? 'Sentinel-2 MSI + Landsat 8' : 'Sentinel-2 MSI + Landsat 9'; }
const PR = ['028046', '028047', '029046', '029047'], TL = ['13QFB', '13QGB', '14QKG', '13QGA'];
export function sceneId(h, y, m = 3, d = 15, dense = false) {
  const r = rng('SC' + h.uid + y + m + d); const pr = PR[Math.floor(r() * 4)], tl = TL[Math.floor(r() * 4)]; const ds = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  if (y >= 2017 && (dense || r() < .6)) return `S2${r() < .5 ? 'A' : 'B'}_MSIL2A_${ds}T170${Math.floor(r() * 9)}${Math.floor(r() * 9)}1_N0500_R069_T${tl}`;
  const sat = y <= 1999 ? 'LT05' : y <= 2012 ? (y % 2 ? 'LE07' : 'LT05') : y <= 2021 ? 'LC08' : 'LC09';
  return `${sat}_L2SP_${pr}_${ds}_${y + 1}0101_02_T1`;
}
const datCache = {};
export function dating(h, quiet) {
  const p = pOf(h); const key = h.uid + p.cls + (p.ly || '') + (p.aff || '') + '|' + PARAMS.umbralRuptura; if (datCache[key]) return datCache[key];
  const s = forestSeries(p); const pts = s.pts.map(([y, v]) => [y, +v.toFixed(1)]);
  { const r0 = rng('X' + h.uid); const last = pts.at(-1); if (last && last[0] === 2025) pts.push([2026, +Math.max(2, Math.min(99, (s.drop && 2026 >= s.drop.y ? s.base * (1 - s.drop.f) : s.base) + (r0() - .5) * 3)).toFixed(1)]); }
  const out = { pts, brk: null, win: null, dense: [], scenes: pts.map(([y]) => ({ y, id: sceneId(h, y), sensor: sensorFor(y) })) };
  const b = detectBreak(pts, PARAMS.umbralRuptura);
  if (b) {
    out.brk = b; out.win = { ini: `${b.yPrev}-01-01`, fin: `${b.y}-05-31`, fuente: 'Serie anual (Landsat)' };
    if (b.y >= 2017) { // observaciones densas → acotar
      const r = rng('D' + h.uid); const t0 = Date.UTC(b.yPrev, 0, 1), t1 = Date.UTC(b.y, 4, 31); const conv = t0 + (t1 - t0) * (.15 + r() * .7);
      let t = t0 + 864e5 * (3 + Math.floor(r() * 5)); while (t <= t1) { const dt = new Date(t); const iso = dt.toISOString().slice(0, 10); const cloudy = r() < .35 && dt.getUTCMonth() >= 5 && dt.getUTCMonth() <= 9; if (!cloudy) out.dense.push({ fecha: iso, bosque: t < conv ? 1 : 0, id: sceneId(h, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), true) }); t += 864e5 * (5 + Math.floor(r() * 6)); }
      const w = refineWindow(out.dense); if (w) out.win = { ini: w.ini, fin: w.fin, fuente: 'Observaciones densas (Sentinel-2/Landsat)' };
    }
  }
  return (datCache[key] = out);
}
export function detectBreak(pts, thr) {
  let best = null; for (let k = 2; k <= pts.length - 1; k++) { const a = pts.slice(0, k), b = pts.slice(k); const ma = a.reduce((s, x) => s + x[1], 0) / a.length, mb = b.reduce((s, x) => s + x[1], 0) / b.length; const d = ma - mb; if (!best || d > best.d) best = { k, d, ma, mb }; }
  if (!best || best.d < thr) return null; return { y: pts[best.k][0], yPrev: pts[best.k - 1][0], mag: +best.d.toFixed(1), antes: +best.ma.toFixed(1), despues: +best.mb.toFixed(1) };
}
export function refineWindow(dense) { const i = dense.findIndex(o => o.bosque === 0); if (i <= 0) return null; return { ini: dense[i - 1].fecha, fin: dense[i].fecha }; }
export function evalCorte(win, fecha) { if (!win) return 'cumple'; if (win.ini >= fecha) return 'incumple'; if (win.fin < fecha) return 'cumple'; return 'indeterminado'; }
const RANK = { cumple: 0, indeterminado: 1, incumple: 2 };
const anpCache = new Map(); export const setAnpFn = fn => { anpFn = fn; anpCache.clear(); }; let anpFn = null;
export const anpDe = h => { if (!anpFn) return null; if (!anpCache.has(h.uid)) anpCache.set(h.uid, anpFn(h) || null); return anpCache.get(h.uid); };
export function cortes(h) {
  const d = dating(h); const e = evalCorte(d.win, PARAMS.corteEstatal.fecha), f = evalCorte(d.win, PARAMS.corteFederal.fecha);
  const fs = fires(h); const fireConv = d.brk ? fs.find(x => x.fecha >= PARAMS.corteFuego.fecha && x.dnbr >= .27 && +x.fecha.slice(0, 4) <= d.brk.y && d.brk.y - +x.fecha.slice(0, 4) <= PARAMS.ventanaFuegoAnios) : null;
  const anp = anpDe(h);
  const proforest = fireConv || anp ? 'incumple' : e; const exportacion = f;
  const R = PARAMS.rutaRestauracion; const ruta = !!(d.win && d.brk && d.win.fin >= R.ini && d.win.ini <= R.fin);
  const c = { estatal: e, federal: f, proforest, exportacion, ruta, anp, aplica: exportacion, disc: proforest !== exportacion, fuego: fireConv || null, regla: 'Exportación: ' + PARAMS.corteFederal.base, win: d.win, brk: d.brk };
  c.condicion = condicionForestal(h, c, d); return c;
}
// Prueba de dos condiciones (minuta LGDFS): 1) ¿fuera de terreno forestal a la fecha de corte? 2) si no, ¿CUSTF vigente que cubra la superficie?
export function condicionForestal(h, c, d = dating(h)) {
  const y = +PARAMS.corteFederal.fecha.slice(0, 4); const pt = d.pts.find(p => p[0] === y) || d.pts.filter(p => p[0] <= y).pop() || null;
  const c1 = c.exportacion === 'cumple' ? 'si' : c.exportacion === 'incumple' ? 'no' : 'indeterminado';
  const custf = PARAMS.custf.conectado ? null : { consulta: false, estado: PARAMS.custf.estado };
  const res = c1 === 'si' ? 'acreditada' : 'no acreditada';
  return { pregunta1: `¿Fuera de terreno forestal al ${PARAMS.corteFederal.fecha}?`, c1, cobertura_corte: pt ? pt[1] : null, umbral: PARAMS.umbralForestal, pregunta2: '¿CUSTF vigente que cubra la superficie?', custf, resultado: res,
    motivo: c1 === 'si' ? (d.brk ? `La conversión ocurrió antes de la fecha de corte (${d.win.ini} → ${d.win.fin})` : 'Sin conversión de bosque en la serie 1993–2026') : c1 === 'no' ? 'Era terreno forestal a la fecha de corte; no se pudo acreditar CUSTF (capa sin conexión)' : 'La ventana de conversión cruza la fecha de corte; requiere verificación de campo o evidencia documental' };
}
// Sequía vs pérdida real: caída espectral + SPI ≤ umbral + altura de dosel estable → estrés hídrico probable
export function sequia(h, year) { const spi = spiAt(h.mun, year); const dh = h.canopy.actual - h.canopy.base; return { spi, dh: +dh.toFixed(1), probable: spi <= PARAMS.spiSequia && dh > -4, txt: spi <= PARAMS.spiSequia ? (dh > -4 ? 'Año seco y dosel estable: probable estrés hídrico, no pérdida' : 'Año seco, pero la altura del dosel cayó: pérdida estructural') : 'Lluvia normal: la caída no se explica por sequía' }; }

// ---------------- Elegibilidad y lista de elegibles ----------------
export function elegibilidad(uid, quien = 'consulta') {
  const h = hById[uid]; if (!h) return { uid, encontrado: false, elegible: false, motivo: 'Identificador no inscrito en el padrón' };
  const e = ESTADOS[h.estado]; const exporta = CULTIVOS.find(c => c.k === h.cul)?.exporta;
  return { uid, encontrado: true, cultivo: h.cul, municipio: munName[h.mun], estado_legal: h.estado, elegible: !!(e.eleg && exporta), motivo: !exporta ? 'Cultivo no sujeto a certificación de exportación' : e.eleg ? 'Sin conversión posterior al corte aplicable' : e.d, version_lista: listaVersion(), consultado: new Date().toISOString().replace(/\.\d+Z/, 'Z') };
}
let _lv = null; export function listaVersion(force) { if (_lv && !force) return _lv; const el = H.filter(h => ESTADOS[h.estado].eleg && CULTIVOS.find(c => c.k === h.cul)?.exporta).map(h => h.uid).sort(); _lv = { id: 'LE-' + todayIso() + '.' + (S.listaRev = (S.listaRev || 0) + (force ? 1 : S.listaRev ? 0 : 1)), n: el.length, sha: sha256Str(el.join('\n')), gen: new Date().toISOString().replace(/\.\d+Z/, 'Z') }; return _lv; }
export const elegibles = () => H.filter(h => ESTADOS[h.estado].eleg && CULTIVOS.find(c => c.k === h.cul)?.exporta);

// ---------------- Cambio de estado legal (con rol, evidencia y bitácora) ----------------
let _guard = null; export const setTransitGuard = f => { _guard = f; }; // reglas de negocio de otros módulos (p. ej., procedimiento de autoridad obligatorio)
export function canTransit(h, to, user) { const t = TRANS.find(x => x[0] === h.estado && x[1] === to); if (!t) return { ok: false, why: `Transición no permitida: ${h.estado} → ${to}` }; if (user.rol !== t[2]) return { ok: false, why: `Sólo el rol «${ROLES[t[2]].n}» puede ejecutar esta transición` }; const c = coiCheck(user, h); if (!c.ok) return c; if (_guard) { const g = _guard(h, to); if (g && !g.ok) return g; } return { ok: true, t }; }
export function coiCheck(user, h) { if (user.rol === 'auditor') return { ok: false, why: 'El auditor externo tiene acceso de sólo lectura' }; if (user.coi !== 'Firmada') return { ok: false, why: `${user.id} no tiene declaración de conflicto de interés vigente` }; if (h && !user.cartera.includes(h.mun)) return { ok: false, why: `${munName[h.mun]} no está en la cartera territorial asignada a ${user.id}` }; if (h && user.conflictos.includes(h.prd)) return { ok: false, why: `${user.id} declaró conflicto de interés con el titular de esta huerta` }; return { ok: true }; }
export function transit(h, to, user, mot, evid, ledgerAppend) { const c = canTransit(h, to, user); if (!c.ok) return c; const ev = { ts: new Date().toISOString().replace(/\.\d+Z/, 'Z'), de: h.estado, a: to, rol: user.rol, actor: user.id, mot: mot || c.t[3], evid: evid || [] }; h.hist.push(ev); h.estado = to; ledgerAppend(S.ledger, user.id, 'ESTADO_' + to.toUpperCase().replace(/\s/g, '_'), h.uid, sha256Str(JSON.stringify(ev))); listaVersion(true); return { ok: true, ev }; }
