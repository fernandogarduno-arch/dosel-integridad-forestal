// Evaluación de exactitud y estimación de superficie con muestreo estratificado
// (estimadores de Olofsson et al., 2014, Remote Sensing of Environment 148:42-57; Card, 1982).
import { rng } from '../util.js';

export const CLASES = ['Pérdida', 'Bosque estable', 'No bosque estable'];
export const ESTRATOS = [ // estrato del mapa → clase del mapa
  { k: 'Pérdida', clase: 'Pérdida', area: 6840 },
  { k: 'Amortiguamiento de pérdida', clase: 'Bosque estable', area: 21500 }, // estrato de 1-2 píxeles alrededor de la pérdida: captura omisión
  { k: 'Bosque estable', clase: 'Bosque estable', area: 402300 },
  { k: 'No bosque estable', clase: 'No bosque estable', area: 289600 },
];
// Muestra de demostración: sustituir por los puntos verificados en campo o con imagen VHR (plantilla descargable)
export function demoSample() {
  const r = rng('ACC-2026'); const plan = [['Pérdida', 150, [.88, .08, .04]], ['Amortiguamiento de pérdida', 100, [.06, .90, .04]], ['Bosque estable', 150, [0, .97, .03]], ['No bosque estable', 150, [0, .04, .96]]];
  const out = []; let id = 1;
  for (const [st, n, pr] of plan) for (let i = 0; i < n; i++) { const u = r(); const ref = u < pr[0] ? 'Pérdida' : u < pr[0] + pr[1] ? 'Bosque estable' : 'No bosque estable'; out.push({ id: 'PV-' + String(id++).padStart(4, '0'), estrato: st, ref, metodo: r() < .35 ? 'Visita de campo' : 'Imagen VHR + serie temporal', brigada: r() < .35 ? 'CAM-02' : 'Intérprete doble ciego' }); }
  return out;
}
// Estratos como unidades de muestreo; filas = estratos, columnas = clase de referencia.
export function olofsson(sample, estratos = ESTRATOS) {
  const A = estratos.reduce((s, e) => s + e.area, 0); const K = CLASES.length;
  const rows = estratos.map(e => { const pts = sample.filter(p => p.estrato === e.k); const n = pts.length; const c = CLASES.map(k => pts.filter(p => p.ref === k).length); return { ...e, n, c, W: e.area / A }; }).filter(r => r.n > 1);
  // proporciones de área estimadas por clase de referencia (con estratos que no coinciden 1:1 con clases del mapa)
  const pj = CLASES.map((_, j) => rows.reduce((s, r) => s + r.W * r.c[j] / r.n, 0));
  const se = CLASES.map((_, j) => Math.sqrt(rows.reduce((s, r) => { const pp = r.c[j] / r.n; return s + r.W * r.W * pp * (1 - pp) / (r.n - 1); }, 0)));
  // matriz de error en proporción de área, colapsando estratos a su clase de mapa
  const M = CLASES.map(() => CLASES.map(() => 0)); rows.forEach(r => { const i = CLASES.indexOf(r.clase); r.c.forEach((v, j) => { M[i][j] += r.W * v / r.n; }); });
  const pi = M.map(row => row.reduce((a, b) => a + b, 0));
  const ua = CLASES.map((_, i) => pi[i] ? M[i][i] / pi[i] : null);
  const pa = CLASES.map((_, j) => pj[j] ? M[j][j] / pj[j] : null);
  const oa = CLASES.reduce((s, _, i) => s + M[i][i], 0);
  // EE de exactitud del usuario (por clase de mapa, combinando sus estratos como razón)
  const uaSe = CLASES.map((k, i) => { const rs = rows.filter(r => r.clase === k); const Wk = rs.reduce((s, r) => s + r.W, 0); if (!Wk) return null; return Math.sqrt(rs.reduce((s, r) => { const y = r.c[i] / r.n; return s + (r.W / Wk) ** 2 * y * (1 - y) / (r.n - 1); }, 0)); });
  // EE de exactitud del productor (linealización de la razón y/x, estimador de razón combinado)
  const paSe = CLASES.map((k, j) => { const X = pj[j]; if (!X) return null; const R = pa[j]; return Math.sqrt(rows.reduce((s, r) => { const pts = sample.filter(p => p.estrato === r.k); const vals = pts.map(p => { const y = (p.ref === k && r.clase === k) ? 1 : 0, x = p.ref === k ? 1 : 0; return y - R * x; }); const m = vals.reduce((a, b) => a + b, 0) / vals.length; const s2 = vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1); return s + r.W * r.W * s2 / r.n; }, 0)) / X; });
  const oaSe = Math.sqrt(rows.reduce((s, r) => { const i = CLASES.indexOf(r.clase); const pts = sample.filter(p => p.estrato === r.k); const y = pts.map(p => p.ref === r.clase ? 1 : 0); const m = y.reduce((a, b) => a + b, 0) / y.length; const s2 = y.reduce((a, b) => a + (b - m) ** 2, 0) / (y.length - 1); return s + r.W * r.W * s2 / r.n; }, 0));
  const areaMap = CLASES.map(k => estratos.filter(e => e.clase === k).reduce((s, e) => s + e.area, 0));
  return { A, rows, M, pi, pj, ua, pa, oa, uaSe, paSe, oaSe, areaMap, area: pj.map(p => p * A), areaCI: se.map(s => 1.96 * s * A), n: sample.length,
    omision: pa.map(x => x == null ? null : 1 - x), comision: ua.map(x => x == null ? null : 1 - x) };
}
export function publicable(R, thr) { const i = 0; const semi = R.areaCI[i] / R.area[i]; return { ua: R.ua[i] >= thr.ua, pa: R.pa[i] >= thr.pa, ic: semi <= thr.semiIC, semi, ok: R.ua[i] >= thr.ua && R.pa[i] >= thr.pa && semi <= thr.semiIC }; }
export function parseSample(text) {
  const L = text.replace(/^﻿/, '').split(/\r?\n/).filter(x => x.trim()); const h = L[0].split(',').map(x => x.trim().toLowerCase());
  const ie = h.indexOf('estrato_mapa'), ir = h.indexOf('clase_referencia'), ii = h.indexOf('punto_id'); if (ie < 0 || ir < 0) throw new Error('Faltan columnas estrato_mapa y clase_referencia');
  const out = [], bad = []; L.slice(1).forEach((l, k) => { const c = l.split(',').map(x => x.trim()); const e = c[ie], r = c[ir]; if (!ESTRATOS.find(s => s.k === e) || !CLASES.includes(r)) bad.push(k + 2); else out.push({ id: ii >= 0 ? c[ii] : 'P' + (k + 1), estrato: e, ref: r, metodo: 'Carga del usuario' }); });
  return { out, bad };
}
