// Debido proceso: cola de triaje → revisión de analista → visita de campo → proyecto de dictamen y notificación →
// garantía de audiencia → dictamen firme → recurso de revisión → resolución de segunda instancia (área distinta).
// Separación de funciones aplicada en el sistema, no sólo en el organigrama.
import { rng } from '../util.js';
import { S, alertaById, munName } from '../state.js';
import { sha256Str, ledgerAppend } from '../integrity.js';
import { H, hByPid, hById, PARAMS, ROLES, userById, addBusinessDays, todayIso, coiCheck, transit, spiAt, fires, sequia, cortes } from './core.js';
import { emitir } from './dictamen.js';

export const STAGES = [
  { k: 'alerta', n: 'Alerta en cola', rol: 'sistema' },
  { k: 'revision', n: 'Revisión de analista', rol: 'deteccion' },
  { k: 'campo', n: 'Visita de campo', rol: 'campo' },
  { k: 'proyecto', n: 'Proyecto de dictamen y notificación', rol: 'dictamen' },
  { k: 'audiencia', n: 'Garantía de audiencia', rol: 'productor' },
  { k: 'firme', n: 'Dictamen firme', rol: 'dictamen' },
  { k: 'recurso', n: 'Recurso de revisión', rol: 'productor' },
  { k: 'resolucion', n: 'Resolución de segunda instancia', rol: 'revision' },
];
const nowZ = () => new Date().toISOString().replace(/\.\d+Z/, 'Z');
const ev = (n, seed) => ({ n, sha: sha256Str(seed + n) });
S.cases = [];
// ---------- siembra de expedientes a partir de alertas ligadas a huertas ----------
(function seed() {
  let n = 300; const dets = ['DET-03', 'DET-07'];
  for (const a of S.alertas.filter(a => a.pid).sort((x, y) => x.d.localeCompare(y.d))) {
    const h = hByPid[a.pid]; if (!h || S.cases.some(c => c.uid === h.uid && c.estado === 'Abierto')) continue; const r = rng('C' + a.id);
    const c = { id: `EXP-2026-${String(++n).padStart(5, '0')}`, uid: h.uid, alerta: a.id, estado: 'Abierto', stage: 'alerta', steps: [{ k: 'alerta', actor: a.src, ts: a.d + 'T06:00:00Z', nota: `Detección ${a.src} · ${a.ha} ha · confianza ${a.conf}` }], alegatos: [], recurso: null, res: null, dic: null };
    const det = h.mun && userById['DET-03'].cartera.includes(h.mun) ? 'DET-03' : 'DET-07', dic = userById['DIC-01'].cartera.includes(h.mun) ? 'DIC-01' : 'DIC-04';
    const d0 = new Date(a.d + 'T12:00:00Z'); const dd = k => new Date(d0.getTime() + k * 864e5).toISOString().slice(0, 10);
    if (a.st === 'Descartada') { c.steps.push({ k: 'revision', actor: det, ts: dd(3) + 'T15:00:00Z', nota: 'Descartada: ' + (r() < .5 ? 'estrés hídrico (SPI bajo, dosel estable)' : 'autorización de cambio de uso vigente / cosecha'), evid: [ev('comparativo_vhr.png', a.id)] }); c.estado = 'Descartado'; c.stage = 'revision'; S.cases.push(c); continue; }
    if (['Detectada', 'En validación'].includes(a.st)) { S.cases.push(c); continue; }
    c.steps.push({ k: 'revision', actor: det, ts: dd(3) + 'T15:00:00Z', nota: 'Pérdida validada con imagen de alta resolución', evid: [ev('comparativo_vhr.png', a.id), ev('serie_ndvi.csv', a.id)] }); c.stage = 'revision';
    if (a.st === 'Confirmada' && r() < .5) { S.cases.push(c); continue; }
    c.steps.push({ k: 'campo', actor: 'CAM-02', ts: dd(9) + 'T11:30:00Z', nota: 'Visita realizada; fotografías georreferenciadas y fechadas', evid: [ev('fotos_campo.zip', a.id), ev('acta_visita.pdf', a.id)] }); c.stage = 'campo';
    if (a.st === 'Confirmada') { S.cases.push(c); continue; }
    const tn = dd(14); c.steps.push({ k: 'proyecto', actor: dic, ts: tn + 'T10:00:00Z', nota: 'Proyecto de dictamen notificado electrónicamente al productor', evid: [ev('proyecto_dictamen.pdf', a.id), ev('acuse_notificacion.xml', a.id)] }); c.stage = 'audiencia'; c.notif = tn; c.vence = addBusinessDays(tn, PARAMS.plazoAudienciaDH);
    if (a.st === 'En audiencia' || (a.st === 'Firme' && r() < .6)) c.alegatos.push({ ts: addBusinessDays(tn, 4) + 'T18:00:00Z', txt: r() < .5 ? 'La plantación se estableció antes de 2018; se anexan facturas de planta y fotografías fechadas.' : 'El claro corresponde a daño por incendio; solicito se valore la regeneración natural.', files: [ev('factura_planta_2016.pdf', a.id), ev('foto_fechada.jpg', a.id)] });
    let fav = false;
    if (a.st === 'Firme') { const tf = addBusinessDays(c.vence, 3); fav = cortes(h).aplica === 'cumple'; if (!fav && h.estado !== 'Bloqueado' && !['En restauración', 'Rehabilitado'].includes(h.estado)) { h.hist.push({ ts: tf + 'T12:00:00Z', de: h.estado, a: 'Bloqueado', rol: 'dictamen', actor: dic, mot: 'Dictamen firme no elegible · ' + c.id, evid: [] }); h.estado = 'Bloqueado'; } if (fav && h.estado !== 'Libre' && !['En restauración', 'Rehabilitado'].includes(h.estado)) { h.hist.push({ ts: tf + 'T12:00:00Z', de: h.estado, a: 'Libre', rol: 'dictamen', actor: dic, mot: 'Dictamen favorable tras audiencia · ' + c.id, evid: [] }); h.estado = 'Libre'; }
      const e = emitir(h, userById[dic], fav ? 'Dictamen de elegibilidad' : 'Dictamen de conversión', { ts: tf + 'T12:00:00Z', corte: addBusinessDays(tf, -0), seed: true });
      c.steps.push({ k: 'firme', actor: dic, ts: tf + 'T12:00:00Z', nota: fav ? 'Dictamen favorable: la conversión es anterior a los cortes' : 'Dictamen firme: conversión posterior al corte aplicable', evid: e.ok ? [{ n: e.dic.folio + '.json', sha: e.dic.hash }] : [] }); c.stage = 'firme'; c.recVence = addBusinessDays(tf, PARAMS.plazoRecursoDH); c.dicFolio = e.ok ? e.dic.folio : null; if (fav) c.estado = 'Cerrado';
      if (!fav && r() < .35) { c.recurso = { ts: addBusinessDays(tf, 6) + 'T17:00:00Z', txt: 'Se impugna el fechado: la ventana de conversión se superpone al corte.', files: [ev('recurso.pdf', a.id)] }; c.stage = 'recurso'; } }
    // alinear estado legal de la huerta con el expediente
    const want = a.st === 'Firme' ? null : { revision: 'En revisión', campo: 'En revisión', audiencia: 'Con alerta', firme: 'Bloqueado', recurso: 'Bloqueado' }[c.stage];
    if (want && !['En restauración', 'Rehabilitado'].includes(h.estado) && h.estado !== want) { h.hist.push({ ts: c.steps.at(-1).ts, de: h.estado, a: want, rol: c.steps.at(-1).k === 'revision' || c.steps.at(-1).k === 'campo' ? 'deteccion' : 'dictamen', actor: c.steps.at(-1).actor, mot: 'Expediente ' + c.id, evid: (c.steps.at(-1).evid || []).map(e => e.n) }); h.estado = want; }
    S.cases.push(c);
  }
})();
export const caseById = id => S.cases.find(c => c.id === id);
export const casesOf = uid => S.cases.filter(c => c.uid === uid);
export const stageIdx = k => STAGES.findIndex(s => s.k === k);

// ---------- señales de triaje ----------
export function triage(a) {
  const h = a.pid ? hByPid[a.pid] : null; const y = +a.d.slice(0, 4); const r = rng('T' + a.id);
  const spi = spiAt(a.mun, y); const sq = h ? sequia(h, y) : { spi, dh: null, probable: spi <= PARAMS.spiSequia, txt: '' };
  const custf = r() < .05, anp = r() < .07, fuego = h ? fires(h).some(f => +f.fecha.slice(0, 4) >= y - 1) : r() < .06;
  const radar = /RADD/.test(a.src); const score = (a.conf === 'alta' ? 3 : a.conf === 'media' ? 2 : 1) + (anp ? 2 : 0) + (a.ha > 1 ? 1 : 0) + (radar ? 1 : 0) - (sq.probable ? 2 : 0) - (custf ? 3 : 0);
  const sug = custf ? 'Verificar autorización CUSTF de SEMARNAT antes de continuar' : sq.probable ? 'Probable estrés hídrico: revisar dosel antes de validar' : !h ? 'Fuera del padrón: investigación de oficio / vista a PROFEPA' : anp ? 'Dentro de ANP: prioridad alta, dar vista a CONANP' : score >= 4 ? 'Prioridad alta: validar y programar campo' : 'Validar con imagen VHR';
  return { h, spi, sq, custf, anp, fuego, radar, score, sug };
}

// ---------- acciones con reglas de separación de funciones ----------
export function allowed(c, act, user) {
  const need = { validar: 'deteccion', descartar: 'deteccion', campo: 'campo', proyecto: 'dictamen', firme: 'dictamen', resolver: 'revision' }[act];
  if (user.rol !== need) return { ok: false, why: `Acción reservada al rol «${ROLES[need].n}» (usted actúa como ${ROLES[user.rol].n})` };
  const h = hById[c.uid]; const k = coiCheck(user, h); if (!k.ok) return k;
  const who = kk => (c.steps.find(s => s.k === kk) || {}).actor;
  const st = c.stage;
  if (act === 'validar' || act === 'descartar') { if (st !== 'alerta') return { ok: false, why: 'El expediente ya pasó la revisión de analista' }; }
  if (act === 'campo' && st !== 'revision') return { ok: false, why: 'La visita de campo sigue a la revisión de analista' };
  if (act === 'proyecto') { if (st !== 'campo') return { ok: false, why: 'Se requiere la visita de campo antes del proyecto de dictamen' }; if (who('revision') === user.id) return { ok: false, why: 'Quien detectó no puede dictaminar' }; }
  if (act === 'firme') { if (st !== 'audiencia') return { ok: false, why: 'Sólo procede después de la garantía de audiencia' }; if (!c.alegatos.length && todayIso() <= c.vence) return { ok: false, why: `El plazo de audiencia corre hasta el ${c.vence}; no se puede resolver antes sin alegatos del productor` }; }
  if (act === 'resolver') { if (st !== 'recurso') return { ok: false, why: 'No hay recurso de revisión pendiente' }; const d = who('firme') || who('proyecto'); if (d === user.id) return { ok: false, why: 'Quien dictaminó no puede resolver la apelación' }; if (ROLES[userById[d]?.rol]?.area === ROLES[user.rol].area) return { ok: false, why: 'La revisión debe hacerla un área distinta' }; }
  return { ok: true };
}
export function act(c, a, user, o = {}) {
  const ok = allowed(c, a, user); if (!ok.ok) return ok; const h = hById[c.uid]; const ts = nowZ();
  const step = (k, nota, evid = []) => { const s = { k, actor: user.id, ts, nota, evid }; c.steps.push(s); ledgerAppend(S.ledger, user.id, 'EXP_' + k.toUpperCase(), c.id, sha256Str(JSON.stringify(s))); };
  const al = alertaById[c.alerta];
  if (a === 'descartar') { step('revision', 'Descartada: ' + (o.motivo || 'falso positivo'), o.evid || []); c.estado = 'Descartado'; c.stage = 'revision'; if (al) al.st = 'Descartada'; if (h.estado === 'En revisión' && !S.cases.some(x => x !== c && x.uid === h.uid && x.estado === 'Abierto')) transit(h, 'Libre', user, 'Alerta descartada con evidencia', [c.id], ledgerAppend); return { ok: true }; }
  if (a === 'validar') { step('revision', 'Pérdida validada con imagen de alta resolución', [{ n: 'comparativo_vhr.png', sha: sha256Str(c.id + ts) }]); c.stage = 'revision'; if (al) al.st = 'Confirmada'; if (h.estado === 'Libre') transit(h, 'En revisión', user, 'Alerta validada por analista', [c.id, c.alerta], ledgerAppend); return { ok: true }; }
  if (a === 'campo') { step('campo', o.nota || 'Visita realizada; evidencia fotográfica sellada', o.evid || [{ n: 'fotos_campo.zip', sha: sha256Str('F' + c.id + ts) }]); c.stage = 'campo'; return { ok: true }; }
  if (a === 'proyecto') { step('proyecto', 'Proyecto de dictamen notificado electrónicamente al productor', [{ n: 'proyecto_dictamen.pdf', sha: sha256Str('P' + c.id + ts) }]); c.stage = 'audiencia'; c.notif = todayIso(); c.vence = addBusinessDays(c.notif, PARAMS.plazoAudienciaDH); if (al) al.st = 'Notificada'; if (h.estado === 'En revisión') transit(h, 'Con alerta', user, 'Proyecto de dictamen notificado', [c.id], ledgerAppend); return { ok: true }; }
  if (a === 'firme') {
    const fav = o.resultado === 'favorable'; if (c.alegatos.length && !(o.consideracion || '').trim()) return { ok: false, why: 'Debe motivar la valoración de los alegatos y pruebas del productor' };
    const to = fav ? 'Libre' : 'Bloqueado'; if (h.estado === 'Con alerta') { const t = transit(h, to, user, fav ? 'Dictamen favorable tras audiencia' : 'Dictamen firme no elegible', [c.id], ledgerAppend); if (!t.ok) return t; }
    const e = emitir(h, user, fav ? 'Dictamen de elegibilidad' : 'Dictamen de conversión'); if (!e.ok) return e;
    step('firme', (fav ? 'Dictamen favorable' : 'Dictamen firme no elegible') + (o.consideracion ? '. Valoración de alegatos: ' + o.consideracion : ''), [{ n: e.dic.folio + '.json', sha: e.dic.hash }]); c.dicFolio = e.dic.folio; c.stage = 'firme'; c.recVence = addBusinessDays(todayIso(), PARAMS.plazoRecursoDH); if (al) al.st = fav ? 'Descartada' : 'Firme'; if (fav) c.estado = 'Cerrado'; return { ok: true, dic: e.dic };
  }
  if (a === 'resolver') {
    const sent = o.sentido || 'confirma'; step('resolucion', { confirma: 'Se confirma el dictamen', revoca: 'Se revoca el dictamen', reponer: 'Se ordena reponer el procedimiento' }[sent] + (o.motivo ? ': ' + o.motivo : ''), []);
    if (sent === 'revoca' && h.estado === 'Bloqueado') transit(h, 'Libre', user, 'Resolución de segunda instancia revoca', [c.id], ledgerAppend);
    if (sent === 'reponer' && ['Bloqueado', 'Con alerta'].includes(h.estado)) transit(h, 'En revisión', user, 'Resolución ordena reponer el procedimiento', [c.id], ledgerAppend);
    c.stage = 'resolucion'; c.estado = 'Cerrado'; c.res = sent; return { ok: true };
  }
  return { ok: false, why: 'Acción desconocida' };
}
// acciones del productor (portal)
export function presentarAlegatos(c, txt, files, prd) { if (c.stage !== 'audiencia') return { ok: false, why: 'El expediente no está en garantía de audiencia' }; if (todayIso() > c.vence) return { ok: false, why: 'El plazo venció el ' + c.vence }; const a = { ts: nowZ(), txt, files }; c.alegatos.push(a); ledgerAppend(S.ledger, prd, 'ALEGATOS_PRESENTADOS', c.id, sha256Str(JSON.stringify(a))); return { ok: true }; }
export function interponerRecurso(c, txt, files, prd) { if (c.stage !== 'firme' || c.estado !== 'Abierto') return { ok: false, why: 'Sólo procede contra un dictamen firme no favorable' }; if (todayIso() > c.recVence) return { ok: false, why: 'El plazo para recurrir venció el ' + c.recVence }; c.recurso = { ts: nowZ(), txt, files }; c.stage = 'recurso'; ledgerAppend(S.ledger, prd, 'RECURSO_INTERPUESTO', c.id, sha256Str(JSON.stringify(c.recurso))); return { ok: true }; }

// Garantiza que la cuenta de demostración del productor tenga un procedimiento en audiencia y uno recurrible.
let _demo = false;
export function ensureDemo(prd) {
  if (_demo) return; _demo = true; const mine = H.filter(h => h.prd === prd && !S.cases.some(c => c.uid === h.uid && c.estado === 'Abierto' && c.stage !== 'alerta'));
  const pick = mine.sort((a, b) => (cortes(b).aplica === 'incumple') - (cortes(a).aplica === 'incumple')); const [h1, h2] = pick; if (!h1) return;
  const back = n => { let d = new Date(todayIso() + 'T12:00:00Z'); let k = 0; while (k < n) { d = new Date(d.getTime() - 864e5); const w = d.getUTCDay(); if (w && w !== 6) k++; } return d.toISOString().slice(0, 10); };
  const mk = (h, stage) => { const c = { id: `EXP-2026-${String(900 + S.cases.length).padStart(5, '0')}`, uid: h.uid, alerta: '—', estado: 'Abierto', stage, alegatos: [], recurso: null, res: null, steps: [{ k: 'alerta', actor: 'GLAD-S2', ts: back(20) + 'T06:00:00Z', nota: 'Detección GLAD-S2' }, { k: 'revision', actor: 'DET-03', ts: back(17) + 'T15:00:00Z', nota: 'Pérdida validada con imagen de alta resolución', evid: [ev('comparativo_vhr.png', h.uid)] }, { k: 'campo', actor: 'CAM-02', ts: back(12) + 'T11:00:00Z', nota: 'Visita realizada', evid: [ev('fotos_campo.zip', h.uid)] }] }; S.cases.push(c); return c; };
  const c1 = mk(h1, 'audiencia'); c1.notif = back(3); c1.vence = addBusinessDays(c1.notif, PARAMS.plazoAudienciaDH); c1.steps.push({ k: 'proyecto', actor: 'DIC-04', ts: c1.notif + 'T10:00:00Z', nota: 'Proyecto de dictamen notificado electrónicamente', evid: [ev('proyecto_dictamen.pdf', h1.uid)] });
  if (h1.estado !== 'Con alerta' && !['En restauración', 'Rehabilitado'].includes(h1.estado)) { h1.hist.push({ ts: c1.notif + 'T10:00:00Z', de: h1.estado, a: 'Con alerta', rol: 'dictamen', actor: 'DIC-04', mot: 'Proyecto de dictamen notificado · ' + c1.id, evid: [] }); h1.estado = 'Con alerta'; }
  if (!h2) return; const c2 = mk(h2, 'firme'); const tn = back(16), tf = back(4); c2.notif = tn; c2.vence = addBusinessDays(tn, PARAMS.plazoAudienciaDH); c2.steps.push({ k: 'proyecto', actor: 'DIC-01', ts: tn + 'T10:00:00Z', nota: 'Proyecto de dictamen notificado', evid: [] });
  if (h2.estado !== 'Bloqueado') { h2.hist.push({ ts: tf + 'T12:00:00Z', de: h2.estado, a: 'Bloqueado', rol: 'dictamen', actor: 'DIC-01', mot: 'Dictamen firme no elegible · ' + c2.id, evid: [] }); h2.estado = 'Bloqueado'; }
  const e = emitir(h2, userById['DIC-01'].cartera.includes(h2.mun) ? userById['DIC-01'] : userById['DIC-04'], 'Dictamen de conversión', { ts: tf + 'T12:00:00Z', seed: true });
  c2.steps.push({ k: 'firme', actor: e.ok ? e.dic.actor : 'DIC-01', ts: tf + 'T12:00:00Z', nota: 'Dictamen firme no elegible', evid: e.ok ? [{ n: e.dic.folio + '.json', sha: e.dic.hash }] : [] }); c2.dicFolio = e.ok ? e.dic.folio : null; c2.recVence = addBusinessDays(tf, PARAMS.plazoRecursoDH);
}
