// Integración de capas de Guardián Forestal (consulta pública 30-sep-2026).
// Datos REALES: estadísticas municipales (113) y de subcuencas (64) completas; capas espaciales como MUESTRA de una tesela
// de visualización (z8/55/114, sur de la franja aguacatera). Sin números de expediente ni NUC.
import gf from '../data/gf.json';
import { mx, my, prepPolys, prepPts } from '../map.js';
import { pip } from '../util.js';
export const GF = gf;
export const GFP = {
  ev2026: prepPolys(gf.ev2026), fires: prepPolys(gf.fires), anp: prepPolys(gf.anp), ran: prepPolys(gf.ran), sub: prepPolys(gf.subcuencas), cuenca: prepPolys(gf.cuenca),
  hulls: prepPts(gf.hulls.map(([lon, lat, o, ha]) => ({ lon, lat, o, ha }))), ollas: prepPts(gf.ollas.map(([lon, lat]) => ({ lon, lat }))),
  profepa: prepPts(gf.profepa.map(([lon, lat, t, a]) => ({ lon, lat, t, a }))), est: prepPts(gf.estaciones.map(([lon, lat, n, e, act]) => ({ lon, lat, n, e, act }))),
  den: prepPts(gf.denuncias.map(([lon, lat, ha, au]) => ({ lon, lat, ha, au }))), calor: prepPts(gf.calor.map(([lon, lat, f, s, frp]) => ({ lon, lat, f, s, frp }))),
};
const SZ = gf.alertCells.size; export const CELLS = gf.alertCells.cells.map(c => ({ i: c[0], j: c[1], ys: c.slice(2, 9), hi: c[9], n: c.slice(2, 9).reduce((a, b) => a + b, 0) }));
const cellIdx = new Map(CELLS.map(c => [c.i + ',' + c.j, c]));
export const SAMPLE = gf.meta.tesela_muestra.bbox;
export const inSample = (lon, lat) => lon >= SAMPLE[0] && lon <= SAMPLE[2] && lat >= SAMPLE[1] && lat <= SAMPLE[3];
export const GF_TOT = Object.values(gf.mun).reduce((a, m) => { for (const k of ['orch', 'orchHa', 'exp', 'expHa', 'forest', 'ollas', 'ollasHa', 'rep']) a[k] = (a[k] || 0) + m[k]; return a; }, {});
export const HULL_COL = { 'Deforestación': '#EF4444', 'Incendio': '#F97316', 'Aprovechamiento': '#EAB308', 'Sanidad': '#A78BFA', 'Combinado': '#F472B6' };
export const CHORO = { orchHa: ['Superficie de huertas (ha)', '#F59E0B'], expHa: ['Huertas de exportación (ha)', '#FB923C'], forest: ['Bosque remanente (ha)', '#22C55E'], ollas: ['Ollas de agua detectadas', '#38BDF8'], rep: ['Superficie denunciada (ha)', '#EF4444'], presion: ['Huerta / bosque remanente', '#F43F5E'] };
export const munVal = (id, k) => { const m = gf.mun[id]; if (!m) return 0; return k === 'presion' ? (m.forest ? m.orchHa / m.forest : 0) : m[k]; };

// Imagen bosque detectado (overlay)
let _img = null; export function bosqueImg() { if (!_img) { _img = new Image(); _img.src = gf.bosque.png; } return _img; }

// ---------- Evidencia Guardián Forestal para un polígono ----------
export function evidence(ring) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]); const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; const out = { muestra: inSample(c[0], c[1]), alertas: [0, 0, 0, 0, 0, 0, 0], alertasHi: 0, ev: [], fires: [], anp: null, ran: null, sub: null, imgs: [] };
  if (out.muestra) {
    for (let i = Math.floor(bb[0] / SZ) - 1; i <= Math.floor(bb[2] / SZ) + 1; i++) for (let j = Math.floor(bb[1] / SZ) - 1; j <= Math.floor(bb[3] / SZ) + 1; j++) { const k = cellIdx.get(i + ',' + j); if (k) { k.ys.forEach((v, t) => out.alertas[t] += v); out.alertasHi += k.hi; } }
    const pad = .004; const near = (o) => o.bb[0] <= mx(bb[2] + pad) && o.bb[2] >= mx(bb[0] - pad) && o.bb[1] <= my(bb[1] - pad) && o.bb[3] >= my(bb[3] + pad);
    out.ev = GFP.ev2026.filter(near).map(o => o.p); out.fires = GFP.fires.filter(near).map(o => o.p);
    const inside = list => list.find(o => o.polys.some(poly => { const r = poly[0]; const pts = []; for (let k = 0; k < r.length; k += 2) pts.push([r[k], r[k + 1]]); return pip([mx(c[0]), my(c[1])], pts); }));
    out.anp = (inside(GFP.anp) || {}).p || null; out.ran = (inside(GFP.ran) || {}).p || null; out.sub = (inside(GFP.sub) || {}).p || null;
  }
  out.imgs = gf.wmts.entries.filter(e => e[0] >= 0 && c[0] >= e[2][0] && c[0] <= e[2][2] && c[1] >= e[2][1] && c[1] <= e[2][3]).map(e => ({ svc: gf.wmts.services[e[0]], d: `${e[1].slice(0, 4)}-${e[1].slice(4, 6)}-${e[1].slice(6, 8)}` }));
  return out;
}
export const imgsAround = (imgs, win, svc = 'Color verdadero') => { if (!win) return { antes: null, despues: null, n: imgs.length }; const v = imgs.filter(i => i.svc === svc).map(i => i.d).sort(); return { antes: v.filter(d => d <= win.ini).pop() || null, despues: v.find(d => d >= win.fin) || null, n: imgs.length, nsvc: v.length }; };
