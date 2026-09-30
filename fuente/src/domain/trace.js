// Trazabilidad de la fruta (balance de masa y cadena huerta → lote → empacadora → embarque),
// compensaciones, recaudación, cruce laboral (IMSS) y agua (CONAGUA vs ollas). Datos sintéticos deterministas.
import { rng, haversine, pip, polyAreaHa } from '../util.js';
import { S, munName } from '../state.js';
import { sha256Str, ledgerAppend } from '../integrity.js';
import { H, hById, PARAMS, CULTIVOS, ESTADOS, pOf, centroid, ringOf, elegibilidad, dating, todayIso } from './core.js';

const exporta = h => CULTIVOS.find(c => c.k === h.cul)?.exporta;
export const capacidad = h => +(pOf(h).ha * (PARAMS.rendimiento[h.cul] || 0)).toFixed(1); // t/temporada
// ---------- Empacadoras ----------
export const EMP = Array.from({ length: 80 }, (_, i) => { const r = rng('E' + i); const hs = H.filter(h => exporta(h)); const c = centroid(hs[Math.floor(r() * hs.length)]); return { id: 'EMP-' + String(i + 1).padStart(2, '0'), nombre: 'Empacadora de demostración ' + String(i + 1).padStart(2, '0'), mun: hs[0].mun, lon: c[0] + (r() - .5) * .05, lat: c[1] + (r() - .5) * .05, cert: r() < .92 ? 'Vigente' : 'En renovación' }; });
// ---------- Lotes de la temporada 2025-2026 ----------
S.lotes = []; S.embarques = []; S.consultas = [];
(function seed() {
  const blocked = H.filter(h => exporta(h) && !ESTADOS[h.estado].eleg); const fraud = new Set();
  const libres = H.filter(h => exporta(h) && ESTADOS[h.estado].eleg && h.cul === 'Aguacate');
  // lavado: huertas elegibles cercanas a huertas bloqueadas que declaran más fruta de la que pueden producir
  blocked.slice(0, 40).forEach(b => { const cb = centroid(b); const near = libres.filter(l => !fraud.has(l.uid)).map(l => [l, haversine(cb, centroid(l))]).sort((a, c) => a[1] - c[1])[0]; if (near && near[1] < 6000 && fraud.size < 14) fraud.add(near[0].uid); });
  let n = 0; const t0 = Date.UTC(2025, 6, 1), t1 = Date.UTC(2026, 8, 25);
  for (const h of H.filter(x => exporta(x) && capacidad(x) > 0)) {
    const r = rng('L' + h.uid); const eleg = ESTADOS[h.estado].eleg; if (!eleg) continue;
    const u = r(); const ratio = fraud.has(h.uid) ? 1.4 + r() * .9 : u < .05 ? 1.17 + r() * .15 : .55 + r() * .5; let tot = capacidad(h) * ratio; const e = EMP[Math.floor(r() * EMP.length)];
    while (tot > .5) { const t = Math.min(tot, 6 + r() * 8); tot -= t; const ts = new Date(t0 + r() * (t1 - t0)).toISOString().slice(0, 10); S.lotes.push({ id: 'LOT-' + String(++n).padStart(6, '0'), uid: h.uid, emp: (r() < .85 ? e : EMP[Math.floor(r() * 80)]).id, fecha: ts, t: +t.toFixed(2), verif: 'Elegible al recibir', lista: 'LE-' + ts + '.1' }); }
  }
  S.lotes.sort((a, b) => a.fecha.localeCompare(b.fecha));
  // embarques: por empacadora y semana
  const g = {}; S.lotes.forEach(l => { const d = new Date(l.fecha + 'T00:00:00Z'); const wk = l.fecha.slice(0, 4) + '-S' + String(Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0'); const k = l.emp + '|' + wk; (g[k] ||= []).push(l); });
  let m = 0; Object.entries(g).forEach(([k, ls]) => { const [emp, wk] = k.split('|'); const id = 'EMB-' + String(++m).padStart(5, '0'); ls.forEach(l => l.emb = id); S.embarques.push({ id, emp, semana: wk, fecha: ls.at(-1).fecha, t: +ls.reduce((s, l) => s + l.t, 0).toFixed(1), lotes: ls.length, destino: 'Estados Unidos', cfi: 'CFI-DEMO-' + String(m).padStart(6, '0') }); });
  // intentos de entrega rechazados por huertas no elegibles
  blocked.slice(0, 30).forEach((b, i) => { const r = rng('R' + b.uid); S.consultas.push({ ts: new Date(Date.UTC(2026, 6, 1) + r() * 85 * 864e5).toISOString().replace(/\.\d+Z/, 'Z'), emp: EMP[Math.floor(r() * 80)].id, uid: b.uid, t: +(5 + r() * 8).toFixed(1), elegible: false, motivo: ESTADOS[b.estado].d, via: 'API' }); });
  S.consultas.sort((a, b) => b.ts.localeCompare(a.ts));
})();
export function balance() { const by = {}; S.lotes.forEach(l => { by[l.uid] = (by[l.uid] || 0) + l.t; }); return H.filter(h => exporta(h) && capacidad(h) > 0).map(h => { const ent = +(by[h.uid] || 0).toFixed(1), cap = capacidad(h); const ratio = cap ? ent / cap : 0; return { h, ent, cap, ratio, flag: ratio > PARAMS.balanceFraude ? 'Posible lavado' : ratio > PARAMS.balanceTolerancia ? 'Revisar' : 'Normal' }; }); }
// recepción en empacadora: consulta de elegibilidad + capacidad remanente
export function recibir(empId, uid, t) {
  const e = elegibilidad(uid); const bal = balance().find(b => b.h.uid === uid); const rem = bal ? bal.cap * PARAMS.balanceTolerancia - bal.ent : 0;
  const q = { ts: new Date().toISOString().replace(/\.\d+Z/, 'Z'), emp: empId, uid, t, via: 'Portal', elegible: e.elegible, motivo: e.motivo };
  if (e.elegible && t > rem) { q.elegible = false; q.motivo = `Excede la capacidad productiva remanente (${Math.max(0, rem).toFixed(1)} t de ${bal.cap} t × ${PARAMS.balanceTolerancia})`; }
  S.consultas.unshift(q); ledgerAppend(S.ledger, empId, q.elegible ? 'RECEPCION_ACEPTADA' : 'RECEPCION_RECHAZADA', uid, sha256Str(JSON.stringify(q)));
  let lote = null; if (q.elegible) { lote = { id: 'LOT-' + String(S.lotes.length + 1).padStart(6, '0'), uid, emp: empId, fecha: todayIso(), t: +(+t).toFixed(2), verif: 'Elegible al recibir', lista: e.version_lista.id }; S.lotes.push(lote); }
  return { q, lote, resp: e };
}
// ---------- Compensaciones (3-6 ha de bosque por ha convertida; polígono bloqueado contra doble uso) ----------
export const ratioComp = h => { const p = pOf(h); const v8 = p.v ? p.v[7] : 2; return +(PARAMS.compensacion.max - (v8 / 5) * (PARAMS.compensacion.max - PARAMS.compensacion.min)).toFixed(1); };
const square = (c, ha, r) => { const side = Math.sqrt(ha * 1e4); const dlat = side / 110574, dlon = side / (111320 * Math.cos(c[1] * Math.PI / 180)); const rot = (r() - .5) * .6; const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [c[0] + (x * Math.cos(rot) - y * Math.sin(rot)) * dlon / 2, c[1] + (x * Math.sin(rot) + y * Math.cos(rot)) * dlat / 2]); pts.push(pts[0]); return pts; };
S.comp = [];
(function seed() { let n = 0; H.filter(h => ['En restauración', 'Rehabilitado'].includes(h.estado)).forEach(h => { const r = rng('CP' + h.uid); const aff = pOf(h).aff || pOf(h).ha * .4; const req = +(aff * ratioComp(h)).toFixed(2); const c = centroid(h); const cc = [c[0] + (r() - .5) * .08, c[1] + (r() - .5) * .06]; S.comp.push({ id: 'CMP-2026-' + String(++n).padStart(4, '0'), uid: h.uid, req, ha: +(req * (1 + r() * .08)).toFixed(2), ring: square(cc, req, r), receptor: `16-${h.mun.slice(1)}-${100 + Math.floor(r() * 800)}-${String(Math.floor(r() * 99999)).padStart(5, '0')}`, estado: h.estado === 'Rehabilitado' ? 'Cumplida' : 'Asignada y bloqueada', ts: '2026-0' + (4 + Math.floor(r() * 5)) + '-1' + Math.floor(r() * 9) }); }); })();
export function overlap(a, b) { return a.some(p => pip(p, b)) || b.some(p => pip(p, a)); }
export function registrarComp(h, ring, user, receptor) {
  const ha = polyAreaHa(ring); const hit = S.comp.find(c => overlap(c.ring, ring)); if (hit) return { ok: false, why: `El polígono se traslapa con ${hit.id}, ya asignado a la huerta ${hit.uid}. Una hectárea de compensación no puede usarse dos veces.` };
  const req = +((pOf(h).aff || pOf(h).ha * .4) * ratioComp(h)).toFixed(2); if (ha < req * .98) return { ok: false, why: `Superficie insuficiente: ${ha.toFixed(2)} ha de ${req} ha requeridas (${ratioComp(h)}:1)` };
  const c = { id: 'CMP-2026-' + String(S.comp.length + 1).padStart(4, '0'), uid: h.uid, req, ha: +ha.toFixed(2), ring, receptor, estado: 'Asignada y bloqueada', ts: todayIso() }; S.comp.push(c); ledgerAppend(S.ledger, user.id, 'COMPENSACION_REGISTRADA', c.id, sha256Str(JSON.stringify(ring))); return { ok: true, c };
}
export const newCompRing = (h, ha, seed) => { const r = rng(seed); const c = centroid(h); return square([c[0] + (r() - .5) * .1, c[1] + (r() - .5) * .08], ha, r); };
// ---------- Recaudación ----------
export function lineaCaptura(concepto, monto, rfc) { const base = 'LC' + todayIso().replace(/-/g, '') + String(Math.floor(monto * 100)).padStart(9, '0') + sha256Str(concepto + rfc + Date.now()).replace(/\D/g, '').slice(0, 6); const dv = String(98 - Number(BigInt(base.replace(/\D/g, '') + '00') % 97n)).padStart(2, '0'); return base + dv; }
export function recaudacion() { const m = {}; S.lotes.forEach(l => { const k = l.fecha.slice(0, 7); m[k] = (m[k] || 0) + PARAMS.cuotaLote; }); return Object.keys(m).sort().map(k => [k, m[k]]); }
// ---------- Laboral (IMSS) y ISN ----------
const labCache = {}; export function laboral(h) { if (labCache[h.uid]) return labCache[h.uid]; const r = rng('IM' + h.uid); const esp = Math.max(1, Math.round(pOf(h).ha * PARAMS.trabajadoresHa)); const reg = r() < .78; const aseg = reg ? Math.max(0, Math.round(esp * (.4 + r() * .9))) : 0; return (labCache[h.uid] = { registro: reg ? 'RP-' + String(Math.floor(r() * 1e9)).padStart(10, '0') : null, esperados: esp, asegurados: aseg, isn: reg && r() < .7, brecha: aseg < esp * .6 }); }
// ---------- Agua: concesiones CONAGUA vs ollas detectadas ----------
S.pozos = []; S.ollas = [];
(function seed() { const hs = H.filter(h => pOf(h).ha > 2); hs.forEach((h, i) => { const r = rng('W' + h.uid); const c = centroid(h); if (r() < .22) S.pozos.push({ id: 'REPDA-DEMO-' + String(i).padStart(5, '0'), lon: c[0] + (r() - .5) * .006, lat: c[1] + (r() - .5) * .006, uso: r() < .8 ? 'Agrícola' : 'Múltiple', vol: Math.round(20000 + r() * 180000) }); if (r() < .3) S.ollas.push({ id: 'OLL-' + String(i).padStart(5, '0'), uid: h.uid, lon: c[0] + (r() - .5) * .004, lat: c[1] + (r() - .5) * .004, m2: Math.round(400 + r() * 6000), det: (2017 + Math.floor(r() * 9)) + '' }); }); S.ollas.forEach(o => { const near = S.pozos.reduce((b, p) => { const d = haversine([o.lon, o.lat], [p.lon, p.lat]); return d < b.d ? { d, p } : b; }, { d: 1e9, p: null }); o.pozo = near.d < 500 ? near.p.id : null; o.dist = Math.round(near.d); o.vol = Math.round(o.m2 * 3.2); o.conv = dating(hById[o.uid]).brk?.y || null; }); })();
