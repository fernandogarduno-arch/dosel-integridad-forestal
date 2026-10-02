// MCE: integración de los módulos M1–M11, ajustes A1–A3, roles y requisitos no funcionales.
// Todo dato que depende de un convenio externo aún no firmado queda como PARÁMETRO VACÍO y etiquetado, no como supuesto.
import { rng, TODAY, haversine } from '../util.js';
import { S, munName } from '../state.js';
import { sha256Str, ledgerAppend } from '../integrity.js';
import { H, hById, PARAMS, ESTADOS, CULTIVOS, ROLES, USERS, userById, MET, pOf, centroid, ringOf, cortes, dating, todayIso, addBusinessDays, businessDaysBetween, maskRfc, me, setTransitGuard } from './core.js';
import './process.js';
import { EMP, balance, capacidad, laboral, rendimiento, altitud, bandaDe, BANDAS, SIAP, recaudacion } from './trace.js';
import { constancia, universo, ACUERDO, EDOS, edoDe, PROC, setHooks } from './origen.js';
import { MODOS, entregarSemarnat } from './dictamen.js';
import { olofsson, demoSample } from './accuracy.js';

const nowZ = () => new Date().toISOString().replace(/\.\d+Z/, 'Z');
export const bump = () => { S.rev = (S.rev || 0) + 1; };
const exporta = h => CULTIVOS.find(c => c.k === h.cul)?.exporta;

// =============== Defecto 1 · un solo universo con filtro explícito ===============
export const UNIVERSOS = {
  inscritas: { n: 'Huertas inscritas', d: 'Todas las huertas del padrón, cualquier cultivo', f: () => H },
  exportadoras: { n: 'Huertas exportadoras', d: 'Cultivo sujeto a exportación (aguacate, berries, limón) con registro de huerta', f: () => H.filter(exporta) },
  programa: { n: 'En programa de certificación', d: 'Aguacate de exportación: universo de la Certificación de Origen (PEC-CAO-01)', f: () => universo() },
};
export const universoChip = k => `<span class="chip info" title="${UNIVERSOS[k].d}">Universo: ${UNIVERSOS[k].n} · ${UNIVERSOS[k].f().length.toLocaleString('es-MX')}</span>`;

// =============== Roles nuevos (Seguridad, Finanzas, Autoridad federal) y perfiles como roles ===============
Object.assign(ROLES, {
  seguridad: { n: 'Seguridad', area: 'Unidad de Seguridad de Brigadas', puede: 'Ver la capa de riesgo y los protocolos de brigada (M9)', noPuede: 'Ver datos fiscales' },
  finanzas: { n: 'Finanzas (SATMICH)', area: 'Servicio de Administración Tributaria de Michoacán', puede: 'Ver el tablero fiscal agregado y por RFC', noPuede: 'Ver dictámenes en trámite' },
  federal: { n: 'Autoridad federal', area: 'Autoridad federal con convenio', puede: 'Consultar y descargar expedientes por convenio', noPuede: 'Editar' },
});
const MUNS = [...new Set(H.map(h => h.mun))].sort();
[['SEG-01', 'seguridad', 'App TOTP'], ['FIN-01', 'finanzas', 'Llave FIDO2'], ['FED-01', 'federal', 'Llave FIDO2']].forEach(([id, rol, mfa]) => { if (!userById[id]) { const u = { id, rol, cartera: MUNS, coi: 'Firmada', coiF: '2026-09-01', conflictos: [], rot: '2027-09-30', mfa }; USERS.push(u); userById[id] = u; } });
export const PERFILES = [
  { rol: 'Productor', puede: 'Ver su expediente, aportar pruebas, apelar', noPuede: 'Ver otras huertas', portal: 'productor' },
  { rol: 'Empacadora', puede: 'Consultar elegibilidad de proveedores', noPuede: 'Ver evidencia completa de terceros', portal: 'empacadora' },
  { rol: 'Público', puede: 'Vista pública bilingüe (M11)', noPuede: 'Ver nombres de titulares', portal: 'ciudadano' },
];
// Control de acceso por vista (Administración)
export const VISTA_ROLES = { seguridad: ['seguridad'], recaudacion: ['finanzas'] };
export const VISTA_DENEGADA = { finanzas: ['expedientes', 'triaje', 'segunda', 'dictamenes'], seguridad: ['recaudacion'] };
export function puedeVer(user, vista) { const req = VISTA_ROLES[vista]; if (req && !req.includes(user.rol)) return false; if ((VISTA_DENEGADA[user.rol] || []).includes(vista)) return false; return true; }
export const soloLectura = user => ['auditor', 'federal'].includes(user.rol);

// =============== M8 · CLA (VELAGRO) y empresas de la cadena ===============
export const CLA = {
  fuente: 'VELAGRO · Certificado Laboral Agrícola (CLA)', conexion: 'Sin conexión: convenio pendiente', umbralHa: 5,
  fases: [
    { n: 1, desde: '2026-09-15', exige: 0, factor: false, d: 'Registro de las empresas de la cadena (productor, corte, empaque, exportación)' },
    { n: 2, desde: '2026-12-15', exige: 25, factor: false, d: '25 % de las empresas de la cadena con registro patronal IMSS' },
    { n: 3, desde: '2027-05-15', exige: 50, factor: true, d: '50 % con registro patronal; inicia el Factor Técnico' },
    { n: 4, desde: '2027-09-15', exige: 75, factor: true, d: '75 % con registro patronal' },
    { n: 5, desde: '2028-02-15', exige: 100, factor: true, d: '100 % · régimen permanente' },
  ],
  notaFechas: 'Inicio (15-sep-2026) y cierre (feb-2028) según la especificación; las fechas intermedias son parámetros a confirmar con el CLA vigente.',
};
export const faseVigente = (d = todayIso()) => CLA.fases.filter(f => f.desde <= d).pop() || null;
const rfcFake = seed => { const r = rng(seed); const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const l = () => L[Math.floor(r() * 26)]; const d = () => Math.floor(r() * 10); return `${l()}${l()}${l()}${d()}${d()}${d()}${d()}${d()}${d()}${l()}${l()}${d()}`; };
export const EXPORTADORES = Array.from({ length: 12 }, (_, i) => ({ id: 'EXP-' + String(i + 1).padStart(2, '0'), nombre: 'Exportadora de demostración ' + String(i + 1).padStart(2, '0'), rfc: maskRfc(rfcFake('EXR' + i)), registro: rng('EXREG' + i)() < .95, cla: 'CLA-2026-' + sha256Str('CLA' + i).slice(0, 6).toUpperCase() }));
export const exportadorDeEmp = empId => EXPORTADORES[(parseInt(empId.slice(4), 10) - 1) % EXPORTADORES.length];
export const CORTE = Array.from({ length: 40 }, (_, i) => { const r = rng('CORTE' + i); return { id: 'COR-' + String(i + 1).padStart(2, '0'), nombre: 'Servicios de corte de demostración ' + String(i + 1).padStart(2, '0'), rfc: maskRfc(rfcFake('COR' + i)), registro: r() < .9, repse: r() < .78 }; });
const supTit = {}; H.forEach(h => { supTit[h.prd] = (supTit[h.prd] || 0) + pOf(h).ha; });
export const superficieTitular = h => +supTit[h.prd].toFixed(2);
const empFreq = {}; S.lotes.forEach(l => { const m = empFreq[l.uid] ||= {}; m[l.emp] = (m[l.emp] || 0) + 1; });
export function cadenaDe(h) {
  const lab = laboral(h); const r = rng('CAD' + h.uid); const cor = CORTE[Math.floor(r() * CORTE.length)];
  const f = empFreq[h.uid]; const empId = f ? Object.entries(f).sort((a, b) => b[1] - a[1])[0][0] : EMP[Math.floor(r() * EMP.length)].id; const emp = EMP.find(e => e.id === empId); const ex = exportadorDeEmp(empId);
  return [{ rol: 'Productor', id: h.prd, rfc: maskRfc(h.rfc), registro: !!lab.registro, repse: null }, { rol: 'Corte', id: cor.id, rfc: cor.rfc, registro: cor.registro, repse: cor.repse }, { rol: 'Empacador', id: emp.id, rfc: maskRfc(rfcFake('EMPR' + emp.id)), registro: rng('EMR' + emp.id)() < .97, repse: null }, { rol: 'Exportador', id: ex.id, rfc: ex.rfc, registro: ex.registro, repse: null }];
}
export function semLaboral(h) {
  const sup = superficieTitular(h); const f = faseVigente();
  if (!exporta(h)) return { color: 'gris', txt: 'Cultivo no sujeto a exportación', sujeto: false, sup };
  if (sup < CLA.umbralHa) return { color: 'fuera', txt: `Fuera del umbral CLA (superficie agrupada del titular ${sup} ha < ${CLA.umbralHa} ha); no bloquea`, sujeto: false, sup };
  const cad = cadenaDe(h); const pct = Math.round(100 * cad.filter(x => x.registro).length / cad.length); const cor = cad.find(x => x.rol === 'Corte');
  const base = { sujeto: true, sup, cad, pct, fase: f };
  if (f && pct < f.exige) return { ...base, color: 'rojo', txt: `${pct} % de la cadena con registro patronal; la fase ${f.n} exige ${f.exige} %` };
  if (!cor.repse) return { ...base, color: 'ambar', txt: `Empresa de corte ${cor.id} sin REPSE` };
  if (!cad[0].registro) return { ...base, color: 'ambar', txt: 'Productor sin registro patronal (exigible conforme avancen las fases del CLA)' };
  return { ...base, color: 'verde', txt: `Cadena con registro patronal (${pct} %) y corte con REPSE · fase ${f ? f.n : '—'}` };
}
export function conciliacionVelagro() { const r = rng('VEL'); const m = universo().slice().sort((a, b) => a.uid.localeCompare(b.uid)).filter((_, i) => i % 8 === 0).slice(0, 100); const ok = m.filter(() => r() < .94).length; return { n: m.length, coinciden: ok, pct: Math.round(100 * ok / m.length), simulado: true }; }

// =============== M1 · expediente de tres semáforos ===============
export const SEM = { verde: ['Verde', '#2E7D32', 'ok'], ambar: ['Ámbar', '#A8720F', 'warn'], rojo: ['Rojo', '#B3261E', 'bad'], azul: ['Restauración', '#235B4E', 'info'], gris: ['Sin dato', '#6F7C77', ''], fuera: ['Fuera del umbral', '#6F7C77', ''] };
export const semChip = (s, extra = '') => `<span class="chip ${SEM[s.color][2]}" title="${(s.txt || '').replace(/"/g, '&quot;')}"><i class="dot" style="background:${SEM[s.color][1]};margin-right:4px"></i>${extra}${SEM[s.color][0]}</span>`;
export function semAmb(h) { const m = { 'Libre': ['verde', 'Elegible: sin deforestación posterior al corte de exportación'], 'Rehabilitado': ['verde', 'Restauración verificada; vigilancia reforzada'], 'En revisión': ['ambar', 'Alerta en revisión; sin efectos hasta dictamen'], 'Con alerta': ['ambar', 'Proyecto de dictamen notificado; en audiencia'], 'Bloqueado': ['rojo', 'Dictamen firme: deforestación posterior al corte'], 'En restauración': ['azul', 'En ruta de restauración y compensación'] }[h.estado]; return { color: m[0], txt: m[1] }; }
export function semFito(h) {
  if (!exporta(h)) return { color: 'gris', txt: 'Cultivo no sujeto a certificación fitosanitaria de exportación', temporada: null };
  if (!PARAMS.sicoa.conectado && !PARAMS.sicoa.simulado) return { color: 'gris', txt: 'Sin dato SENASICA (convenio SICOA pendiente)', temporada: null };
  const r = rng('FITO' + h.uid)(); const t = ACUERDO.temporada.id;
  return r < .88 ? { color: 'verde', txt: `Registro y certificación SENASICA de la temporada ${t}${PARAMS.sicoa.simulado ? ' (simulación SICOA)' : ''}`, temporada: t } : r < .96 ? { color: 'ambar', txt: 'Registro vigente; certificación de temporada en trámite', temporada: null } : { color: 'rojo', txt: 'Sin certificación SENASICA de la temporada', temporada: null };
}
S.semOverrides = S.semOverrides || {};
export function expediente(h) {
  const o = S.semOverrides[h.uid] || {}; const fito = o.fito || semFito(h), amb = semAmb(h), lab = o.lab || semLaboral(h);
  return { uid: h.uid, semaforo_fito: fito, semaforo_amb: amb, semaforo_lab: lab, sujeto_cla: lab.sujeto, superficie_titular: superficieTitular(h), temporada_senasica: fito.temporada || null };
}
export function cambiarSemaforo(h, k, color, evidenciaId, user, motivo = '') {
  if (!user) return { ok: false, why: 'Se requiere usuario_id' };
  if (!(evidenciaId || '').trim()) return { ok: false, why: 'Todo cambio de semáforo exige evidencia_id' };
  if (k === 'amb') return { ok: false, why: 'El semáforo ambiental sólo cambia con el procedimiento (estado legal con dictamen y evidencia)' };
  if (soloLectura(user)) return { ok: false, why: 'Rol de sólo lectura' };
  if (!SEM[color]) return { ok: false, why: 'Color no válido' };
  const ev = { color, txt: `${motivo || 'Cambio manual'} · evidencia ${evidenciaId}`, evidencia_id: evidenciaId, usuario_id: user.id, ts: nowZ(), temporada: color === 'verde' && k === 'fito' ? ACUERDO.temporada.id : null };
  (S.semOverrides[h.uid] ||= {})[k] = ev; ledgerAppend(S.ledger, user.id, 'SEMAFORO_' + k.toUpperCase(), h.uid, sha256Str(JSON.stringify(ev))); bump(); return { ok: true, ev };
}
setHooks(h => semLaboral(h), h => dentroGeocerca(h));
// Semáforo forestal (reversibilidad, 5 colores) ≠ semáforo ambiental de exportación (elegibilidad)
export const NOTA_SEMAFOROS = 'El semáforo forestal (verde, amarillo, naranja, rojo, gris) mide la reversibilidad del daño y decide la ruta de remediación; el semáforo ambiental de exportación (verde, ámbar, rojo, restauración) mide la elegibilidad.';

// =============== M4 · procedimientos de autoridad, cohortes y constancia de cumplimiento ===============
export const AUTORIDADES = ['PROFEPA', 'PROAM', 'FGE'];
export const ETAPAS_PROC = ['Inspección', 'Emplazamiento', 'Resolución', 'Cumplimiento'];
S.procedimientos = [];
(function seed() { H.filter(h => ['En restauración', 'Rehabilitado'].includes(h.estado)).forEach((h, i) => { const r = rng('PRC' + h.uid); const aut = AUTORIDADES[Math.floor(r() * (r() < .8 ? 2 : 3))]; const et = h.estado === 'Rehabilitado' ? 'Cumplimiento' : ETAPAS_PROC[1 + Math.floor(r() * 2)]; const p = { id: 'PROC-' + String(i + 1).padStart(4, '0'), uid: h.uid, autoridad: aut, externo: `${aut === 'PROFEPA' ? 'PFPA/23.2/2C.27.2' : aut === 'PROAM' ? 'PROAM/IA/MICH' : 'FGE/UECA'}/${String(100 + Math.floor(r() * 899))}-${2025 + (r() < .5 ? 0 : 1)}`, etapa: et, resolucion: et === 'Cumplimiento' ? 'Cumplimiento de medidas de restauración y compensación' : null, ts: '2026-0' + (4 + Math.floor(r() * 5)) + '-1' + Math.floor(r() * 9), constancia: null }; if (et === 'Cumplimiento') p.constancia = 'CCU-2026-' + sha256Str(p.id).slice(0, 6).toUpperCase(); S.procedimientos.push(p); }); })();
export const procDe = uid => S.procedimientos.find(p => p.uid === uid);
export const azulesSinProcedimiento = () => H.filter(h => semAmb(h).color === 'azul' && !procDe(h.uid));
// Regla M4: toda huerta en azul (En restauración) debe tener un procedimiento de autoridad asociado; se exige en la transición
setTransitGuard((h, to) => to === 'En restauración' && !procDe(h.uid) ? { ok: false, why: 'Toda huerta en restauración debe tener un procedimiento de autoridad (PROFEPA, PROAM o FGE) con número de expediente externo' } : { ok: true });
export function registrarProcedimiento(h, { autoridad, externo, etapa }, user) {
  if (soloLectura(user)) return { ok: false, why: 'Rol de sólo lectura' }; if (!['juridico', 'dictamen'].includes(user.rol)) return { ok: false, why: 'Registrar procedimientos de autoridad corresponde a Jurídico o Dictaminación' };
  if (!AUTORIDADES.includes(autoridad) || !(externo || '').trim()) return { ok: false, why: 'Indique autoridad y número de expediente externo' };
  const p = { id: 'PROC-' + String(S.procedimientos.length + 1).padStart(4, '0'), uid: h.uid, autoridad, externo: externo.trim(), etapa: etapa || 'Inspección', resolucion: null, ts: todayIso(), constancia: null };
  S.procedimientos.push(p); ledgerAppend(S.ledger, user.id, 'PROCEDIMIENTO_REGISTRADO', p.id, sha256Str(JSON.stringify(p))); return { ok: true, p };
}
export function resolverProcedimiento(p, resolucion, user) {
  if (soloLectura(user)) return { ok: false, why: 'Rol de sólo lectura' };
  p.etapa = 'Cumplimiento'; p.resolucion = resolucion || 'Cumplimiento de medidas'; p.constancia = 'CCU-2026-' + sha256Str(p.id + p.resolucion + nowZ()).slice(0, 6).toUpperCase();
  ledgerAppend(S.ledger, user.id, 'CONSTANCIA_CUMPLIMIENTO', p.constancia, sha256Str(JSON.stringify(p))); return { ok: true, p };
}
export function cohortes() {
  const by = {}; S.proyectos.forEach(p => { const y = +(String(p.ini || p.fecha || p.inicio || '2023').slice(0, 4)) || 2023; const r = rng('COH' + p.id); const c = by[y] ||= { anio: y, n: 0, ha: 0, plant: 0, satSum: 0, campoSum: 0 }; c.n++; c.ha += p.ha; c.plant += p.plant; c.satSum += 62 + r() * 30; c.campoSum += 58 + r() * 32; });
  return Object.values(by).sort((a, b) => a.anio - b.anio).map(c => ({ ...c, sat: +(c.satSum / c.n).toFixed(1), campo: +(c.campoSum / c.n).toFixed(1) }));
}

// =============== M5 · alertas de balance con SLA de 72 h ===============
S.balanceRevisiones = S.balanceRevisiones || {};
export function alertasBalance() {
  return balance().filter(b => b.flag !== 'Normal').map(b => {
    const ls = S.lotes.filter(l => l.uid === b.h.uid).sort((x, y) => x.fecha.localeCompare(y.fecha)); let acc = 0, det = ls.length ? ls.at(-1).fecha : todayIso();
    for (const l of ls) { acc += l.t; if (acc > b.cap * PARAMS.balanceTolerancia) { det = l.fecha; break; } }
    const rv = S.balanceRevisiones[b.h.uid]; const horas = Math.max(0, Math.round((TODAY - new Date(det + 'T12:00:00')) / 36e5));
    return { ...b, detectada: det, horas, revisada: rv || null, vencida: !rv && horas > PARAMS.slaBalanceHoras };
  }).sort((a, b) => b.horas - a.horas);
}
// Siembra de demostración: las alertas de temporadas anteriores (más de 30 días) ya fueron revisadas dentro del SLA;
// quedan pendientes sólo las recientes, como ocurriría en operación normal.
(function seedRevisiones() { const dic = ['DIC-01', 'DIC-02', 'DIC-04']; alertasBalance().forEach((a, i) => { if (a.horas > 24 * 30 && !S.balanceRevisiones[a.h.uid]) { const d = new Date(a.detectada + 'T12:00:00Z'); d.setUTCHours(d.getUTCHours() + 20 + (i % 40)); S.balanceRevisiones[a.h.uid] = { ts: d.toISOString().replace(/\.\d+Z/, 'Z'), user: dic[i % 3], nota: a.flag === 'Posible lavado' ? 'Revisión de balance: turnado a auditoría de campo (demostración)' : 'Revisión de balance: rendimiento aclarado con aforo (demostración)', demo: true }; } }); })();
export function revisarBalance(uid, user, nota) { if (soloLectura(user)) return { ok: false, why: 'Rol de sólo lectura' }; S.balanceRevisiones[uid] = { ts: nowZ(), user: user.id, nota: nota || 'Revisión de balance de masa' }; ledgerAppend(S.ledger, user.id, 'BALANCE_REVISADO', uid); return { ok: true }; }

// =============== M6 · geocerca de la zona autorizada (municipios del OWP) ===============
PARAMS.owp = PARAMS.owp || { municipios: [], fuente: 'Municipios aprobados del plan de trabajo operativo (OWP) · SENASICA', estado: 'Vacío: pendiente de obtener la lista oficial', demo: false };
export function cargarOWPDemo(user) {
  const cnt = {}; universo().forEach(h => { cnt[h.mun] = (cnt[h.mun] || 0) + 1; }); const ms = Object.keys(cnt).sort((a, b) => cnt[a] - cnt[b]);
  PARAMS.owp.municipios = ms.slice(2); PARAMS.owp.demo = true; PARAMS.owp.estado = `Catálogo de DEMOSTRACIÓN (no es la lista oficial): ${PARAMS.owp.municipios.length} municipios; excluidos ${ms.slice(0, 2).map(m => munName[m]).join(' y ')}`;
  ledgerAppend(S.ledger, user ? user.id : 'Sistema', 'CATALOGO_OWP_CARGADO', 'municipio_aprobado_owp', sha256Str(PARAMS.owp.municipios.join(','))); bump(); return { ok: true, n: PARAMS.owp.municipios.length };
}
export function vaciarOWP(user) { PARAMS.owp.municipios = []; PARAMS.owp.demo = false; PARAMS.owp.estado = 'Vacío: pendiente de obtener la lista oficial'; ledgerAppend(S.ledger, user ? user.id : 'Sistema', 'CATALOGO_OWP_VACIADO', 'municipio_aprobado_owp'); bump(); }
export const dentroGeocerca = h => PARAMS.owp.municipios.length ? PARAMS.owp.municipios.includes(h.mun) : null;
export function alertasGeocerca() { if (!PARAMS.owp.municipios.length) return []; return S.lotes.filter(l => { const h = hById[l.uid]; return h && h.cul === 'Aguacate' && !PARAMS.owp.municipios.includes(h.mun); }).map(l => ({ id: 'GEO-' + l.id.slice(4), lote: l.id, uid: l.uid, mun: hById[l.uid].mun, emb: l.emb || null, fecha: l.fecha, motivo: `Huerta de origen en ${munName[hById[l.uid].mun]}, fuera de los municipios aprobados del OWP` })); }
export const lotesFueraSinAlerta = () => { if (!PARAMS.owp.municipios.length) return 0; const al = new Set(alertasGeocerca().map(a => a.lote)); return S.lotes.filter(l => { const h = hById[l.uid]; return h && h.cul === 'Aguacate' && !PARAMS.owp.municipios.includes(h.mun) && !al.has(l.id); }).length; };

// =============== M7 · constancia por exportador, pedimento y verificación pública ===============
S.embarques.forEach(e => { const r = rng('PED' + e.id); const ex = exportadorDeEmp(e.emp); e.exportador = ex.id; e.cla = ex.cla; e.pedimento = `${e.fecha.slice(2, 4)} ${String(10 + Math.floor(r() * 80))} ${String(1000 + Math.floor(r() * 8999))} ${String(Math.floor(r() * 9999999)).padStart(7, '0')}`; });
export const foliosDeEmbarque = e => [...new Set(S.lotes.filter(l => l.emb === e.id).map(l => constancia(hById[l.uid]).folio))];
export function constanciaExportador(expId) {
  const ex = EXPORTADORES.find(x => x.id === expId); if (!ex) return null; const embs = S.embarques.filter(e => e.exportador === expId);
  const uids = [...new Set(S.lotes.filter(l => embs.some(e => e.id === l.emb)).map(l => l.uid))].sort(); const cs = uids.map(u => constancia(hById[u]));
  const amp = cs.filter(c => ['Vigente', 'Condicionada'].includes(c.estado)); const sha = sha256Str(JSON.stringify({ ex: ex.id, t: ACUERDO.temporada.id, h: amp.map(c => c.folio) }));
  return { folio: 'CAE-2627-' + sha.slice(0, 6).toUpperCase(), tipo: 'Constancia de exportador', exportador: ex, vigencia: ACUERDO.temporada, amparadas: amp.map(c => ({ uid: c.uid, folio: c.folio, estado: c.estado, municipio: c.municipio })), excluidas: cs.filter(c => !amp.includes(c)).map(c => ({ uid: c.uid, estado: c.estado })), sha, embarques: embs.length, emitida: (S.constExp || []).find(x => x.exp === expId) || null };
}
S.constExp = S.constExp || [];
export function emitirConstanciaExportador(expId, user) { if (user.rol !== 'dictamen') return { ok: false, why: 'La emisión corresponde al rol «Dictaminador»' }; const c = constanciaExportador(expId); if (!c) return { ok: false, why: 'Exportador no encontrado' }; if (S.constExp.some(x => x.folio === c.folio)) return { ok: false, why: 'Ya emitida' }; const e = { folio: c.folio, exp: expId, ts: nowZ(), firma: user.id, n: c.amparadas.length, sha: c.sha }; S.constExp.push(e); ledgerAppend(S.ledger, user.id, 'CONSTANCIA_EXPORTADOR', c.folio, c.sha); return { ok: true, c, e }; }
export function verificarFolio(folio) {
  const t0 = performance.now(); const f = String(folio || '').trim().toUpperCase(); let r = { folio: f, valido: false };
  if (/^CAO-/.test(f)) { const c = H.map(constancia).find(x => x.folio === f); if (c) r = { folio: f, valido: ['Vigente', 'Condicionada'].includes(c.estado), tipo: 'Constancia ambiental de origen (huerta)', estado: c.estado, vigencia: c.vigencia, amparadas: [{ uid: c.uid, municipio: c.municipio, estado: c.estado }], emitida: !!S.constancias[c.uid], sha: c.sha }; }
  else if (/^CAE-/.test(f)) { const c = EXPORTADORES.map(x => constanciaExportador(x.id)).find(x => x.folio === f); if (c) r = { folio: f, valido: c.amparadas.length > 0, tipo: 'Constancia de exportador', estado: 'Vigente', vigencia: c.vigencia, exportador: c.exportador.nombre, amparadas: c.amparadas, emitida: !!c.emitida, sha: c.sha }; }
  else if (/^DIC-/.test(f)) { const d = S.dictamenes.find(x => x.folio === f); if (d) r = { folio: f, valido: true, tipo: d.tipo, estado: 'Firmado', modo: d.pay.modo || MODOS[0], amparadas: [{ uid: d.uid, municipio: d.pay.huerta.municipio }], emitida: true, sha: d.hash, fecha: d.ts }; }
  r.ms = +(performance.now() - t0).toFixed(1); return r;
}

// =============== M9 · capa de riesgo de seguridad (sólo rol Seguridad) ===============
export function datosSeguridad(user) {
  if (!user || user.rol !== 'seguridad') throw new Error('Acceso denegado: la capa de seguridad (M9) sólo responde al rol Seguridad');
  const NIV = ['Bajo', 'Medio', 'Alto'];
  const emp = EMP.map(e => { const r = rng('RSK' + e.id); const n = r() < .55 ? 0 : r() < .7 ? 1 : 2; return { id: e.id, lon: e.lon, lat: e.lat, nivel: NIV[n], k: n, ventana: n === 2 ? '08:00–13:00' : '07:00–16:00', escolta: n === 2 }; });
  const rutas = EMP.slice(0, 40).map((e, i) => { const h = H[(i * 23) % H.length]; const c = centroid(h); const r = rng('RTA' + i); const n = r() < .5 ? 0 : r() < .75 ? 1 : 2; return { id: 'RTA-' + String(i + 1).padStart(3, '0'), de: e.id, a: h.uid, coords: [[e.lon, e.lat], c], km: +(haversine([e.lon, e.lat], c) / 1000).toFixed(1), nivel: NIV[n], k: n }; });
  return { emp, rutas, fuente: 'SESNSP y mesa de seguridad (sin conexión; datos ficticios de demostración)', protocolo: ['Ventana horaria autorizada por nivel de riesgo (alto: 08:00–13:00)', 'Ruta registrada antes de salir; desvíos se reportan', 'Contacto con la base de enlace (dato reservado) antes y después de la visita', 'Registro de entrada y salida con hora y coordenadas', 'Suspensión de la visita si el nivel cambia a alto durante el trayecto'] };
}
S.rutasBrigada = S.rutasBrigada || [];
export function abrirRuta(caso, user, rutaId) { const r = { id: 'RB-' + String(S.rutasBrigada.length + 1).padStart(4, '0'), caso: caso.id, uid: caso.uid, brigada: user.id, ruta: rutaId || 'RTA-' + String(1 + (S.rutasBrigada.length % 40)).padStart(3, '0'), salida: nowZ(), regreso: null, estado: 'Abierta' }; S.rutasBrigada.unshift(r); ledgerAppend(S.ledger, user.id, 'RUTA_BRIGADA_ABIERTA', r.id); return r; }
export function cerrarRuta(r, user) { r.regreso = nowZ(); r.estado = 'Cerrada'; ledgerAppend(S.ledger, user.id, 'RUTA_BRIGADA_CERRADA', r.id); return r; }
S.hooks = S.hooks || {}; S.hooks.campo = (c, user) => { const r = S.rutasBrigada.find(x => x.caso === c.id && x.estado === 'Abierta') || abrirRuta(c, user); cerrarRuta(r, user); };

// =============== M10 · paquete de evidencia para la Unión Europea (por lote) ===============
export function paqueteUE(loteId) {
  const t0 = performance.now(); const l = S.lotes.find(x => x.id === loteId); if (!l) return null; const h = hById[l.uid]; const c = cortes(h); const cs = constancia(h); const e = l.emb ? S.embarques.find(x => x.id === l.emb) : null; const d = dating(h);
  const geo = { type: 'FeatureCollection', properties: { lote: l.id, generado: nowZ(), fuente: 'Plataforma de Verificación y Dictamen Forestal (demostración)' }, features: [{ type: 'Feature', properties: { uid: h.uid, municipio: munName[h.mun], cultivo: h.cul, superficie_ha: pOf(h).ha, fecha_corte: PARAMS.corteFederal.fecha, condicion_forestal: c.condicion.resultado, constancia: cs.folio, resultado_constancia: cs.estado }, geometry: { type: 'Polygon', coordinates: [ringOf(h)] } }] };
  const dic = { uid: h.uid, prueba_dos_condiciones: c.condicion, reglas: { proforest: c.proforest, exportacion: c.exportacion, ruta_restauracion: c.ruta }, ventana_conversion: d.win, metodologia: `${MET.id} v${MET.ver}`, exactitud_global: +olofsson(S.accSample || demoSample()).oa.toFixed(3) };
  const cadena = { huerta: h.uid, lote: l.id, fecha_recepcion: l.fecha, empacadora: l.emp, embarque: e ? e.id : null, pedimento: e ? e.pedimento : null, exportador: e ? e.exportador : null, cla: e ? e.cla : null, certificado_fitosanitario: e ? e.cfi : null };
  return { l, h, geo, dic, cadena, cs, e, ms: +(performance.now() - t0).toFixed(1) };
}

// =============== A3 · entregas a SEMARNAT ===============
export const entregasSemarnat = () => S.entregasSemarnat || [];
export { entregarSemarnat };

// =============== Defectos 3, 4 y 10 · estados procesales, plazos y escalamiento ===============
export function actualizarEstadosProcesales() { let n = 0; (S.cases || []).forEach(c => { if (c.stage === 'firme' && c.estado === 'Abierto' && !c.recurso && c.recVence && c.recVence < todayIso()) { c.estado = 'Cerrado'; c.causoEstado = c.recVence; n++; } }); return n; }
actualizarEstadosProcesales();
export const audienciasVencidas = () => (S.cases || []).filter(c => c.stage === 'audiencia' && c.estado === 'Abierto' && c.vence && c.vence < todayIso()).map(c => ({ c, dias: businessDaysBetween(c.vence, todayIso()) })).sort((a, b) => b.dias - a.dias);
export function escalamiento(dias) { return dias > 90 ? { nivel: 2, txt: 'Escalada a la Dirección', k: 'bad' } : dias > 30 ? { nivel: 1, txt: 'Escalada a supervisión', k: 'warn' } : null; }

// =============== Parámetros de la metodología y bloqueos externos ===============
export function registroParametros() {
  const f = faseVigente();
  return [
    ['Regla Pro-Forest', `Deforestación desde ${PARAMS.corteEstatal.fecha}; incendio desde ${PARAMS.corteFuego.fecha}; fuera de ANP`, 'Editable', 'cortes'],
    ['Regla de exportación', `${PARAMS.corteFederal.fecha} · ${PARAMS.corteFederal.base}`, 'Editable', 'cortes'],
    ['Ruta de restauración', `Afectación ${PARAMS.rutaRestauracion.ini.slice(0, 4)}–${PARAMS.rutaRestauracion.fin.slice(0, 4)}`, 'Editable', 'cortes'],
    ['Umbral de ruptura', `${PARAMS.umbralRuptura} pp de cobertura arbórea`, 'Editable', 'cortes'],
    ['Umbral de terreno forestal al corte', `${PARAMS.umbralForestal} % de cobertura (a homologar con USV serie VII / INF)`, 'Editable', 'cortes'],
    ['Tolerancia «revisar» del balance', `${PARAMS.balanceTolerancia}×`, 'Editable', 'balance'],
    ['Umbral «posible lavado»', `${PARAMS.balanceFraude}× (la especificación propone 1.3)`, 'Editable', 'balance'],
    ['Rendimiento por municipio y altitud', SIAP.fuente, 'Editable', 'balance'],
    ['SLA de revisión de alertas de balance', `${PARAMS.slaBalanceHoras} h`, 'Editable', 'balance'],
    ['Plazo de subsanación de constancia', `${PARAMS.constancia.subsanacionDH} días hábiles`, 'Editable', 'origen'],
    ['Compensación', `${PARAMS.compensacion.min} a ${PARAMS.compensacion.max} ha por ha convertida`, 'Editable', 'compensaciones'],
    ['Plazos de audiencia y recurso', `${PARAMS.plazoAudienciaDH} y ${PARAMS.plazoRecursoDH} días hábiles (confirmar con la Ley de Procedimiento Administrativo estatal)`, 'Editable', 'expedientes'],
    ['Fase CLA vigente', f ? `Fase ${f.n} desde ${f.desde}: ${f.d}` : '—', 'Editable', 'laboral'],
    ['Umbral CLA', `${CLA.umbralHa} ha de superficie agrupada del titular`, 'Editable', 'laboral'],
  ];
}
export function bloqueosExternos() {
  return [
    ['Municipios aprobados del OWP', 'M6', PARAMS.owp.municipios.length ? (PARAMS.owp.demo ? 'Catálogo de demostración cargado' : 'Cargado') : 'Vacío', 'SENASICA / APHIS'],
    ['Acceso a SICOA', 'M1, M5, M6', PARAMS.sicoa.conectado ? 'Conectado' : PARAMS.sicoa.simulado ? 'Simulación activa' : 'Sin conexión', 'SENASICA'],
    ['Capa CUSTF', 'M2', PARAMS.custf.conectado ? 'Conectada' : 'Sin conexión por convenio', 'SEMARNAT'],
    ['Factor Técnico', 'M5, M8', PARAMS.trabajadoresTonelada == null ? 'Vacío: pendiente de DOF' : String(PARAMS.trabajadoresTonelada), 'DOF'],
    ['Mecánica de anexo en VUCEM', 'M7', 'Pendiente', 'SE / ANAM'],
    ['Cuota del derecho estatal', 'A2', 'Pendiente de estudio de costo', 'SATMICH / Congreso'],
    ['Conexión VELAGRO (CLA)', 'M8', 'Sin conexión', 'STPS'],
    ['SESNSP y mesa de seguridad', 'M9', 'Sin conexión', 'SESNSP'],
  ];
}

// =============== Requisitos no funcionales ===============
export function pruebaCarga(n = 59000) {
  const t0 = performance.now(); const idx = new Map(); for (let i = 0; i < n; i++) { const uid = `HUE-16${String(1 + (i % 113)).padStart(3, '0')}-${String(i).padStart(5, '0')}`; idx.set(uid, { e: i % 7 === 0 ? 'En revisión' : 'Libre', f: 'CAO-2627-' + (i * 2654435761 >>> 0).toString(16).slice(0, 6).toUpperCase() }); }
  const t1 = performance.now(); const r = rng('LOAD'); let hits = 0; const q0 = performance.now(); for (let i = 0; i < 20000; i++) { const k = `HUE-16${String(1 + Math.floor(r() * 113)).padStart(3, '0')}-${String(Math.floor(r() * n)).padStart(5, '0')}`; if (idx.get(k)) hits++; } const q1 = performance.now();
  return { n, indexMs: +(t1 - t0).toFixed(0), consultas: 20000, hits, consultasMs: +(q1 - q0).toFixed(1), porSegundo: Math.round(20000 / ((q1 - q0) / 1000)) };
}
export const NFR = () => [
  ['Bitácora inmutable', 'Cadena de hashes; incluye semáforos (M1), constancias y entregas a SEMARNAT', 'Operando'],
  ['NOM-151 y e.firma', 'Simulados; punto de integración con PSC certificado y FIEL del servidor público', 'Pendiente (contratación de PSC)'],
  ['Debido proceso', `Audiencia ${PARAMS.plazoAudienciaDH} DH y recurso ${PARAMS.plazoRecursoDH} DH; confirmar con la Ley de Procedimiento Administrativo estatal`, 'Operando (confirmar plazos)'],
  ['Doble factor y cuentas institucionales', 'Roles sensibles (Seguridad, Finanzas, Autoridad federal) piden segundo factor (simulado); producción: Llave MX + FIDO2/TOTP', 'Simulado'],
  ['Datos personales', 'Titular enmascarado; RFC reservado; aviso de privacidad por perfil', 'Operando'],
  ['Disponibilidad 99.5 % del verificador de folios', 'Monitoreo en temporada (15-oct a abril); verificación medida en milisegundos', 'Monitoreo por configurar'],
  ['Escala 59 mil huertas', 'Prueba de carga sintética en el navegador (índice y 20 mil consultas)', 'Probar antes de la fase 0 en servidor'],
  ['Propiedad estatal del código y datos', 'Cláusula contractual y repositorio institucional del Estado', 'Por formalizar en contrato'],
];

// =============== Perfiles como roles (Productor, Empacadora, Público) ===============
export const accesoProductor = (prd, uid) => { const h = hById[uid]; return h && h.prd === prd ? { ok: true } : { ok: false, why: 'Un productor sólo ve su propio expediente' }; };
export function respuestaEmpacadora(uid) { const h = hById[uid]; if (!h) return { encontrado: false }; const c = constancia(h); return { uid, elegible: ESTADOS[h.estado].eleg, constancia: c.folio, resultado: c.estado }; } // sin evidencia de terceros
export const respuestaPublica = uid => { const h = hById[uid]; if (!h) return { encontrado: false }; return { uid, municipio: munName[h.mun], cultivo: h.cul, estado_legal: h.estado }; }; // sin titular ni RFC
