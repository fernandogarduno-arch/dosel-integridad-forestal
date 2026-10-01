import { fmt, esc } from './util.js';
const C = { cyan: '#235B4E', amber: '#A8720F', red: '#B3261E', green: '#2E7D32', mut: '#6F7C77', grid: 'rgba(111,124,119,.22)', txt: '#6F7C77', vio: '#9F2241', gold: '#BC955C' };
export { C };
const nice = (max, n = 4) => { const step0 = max / n; const p = Math.pow(10, Math.floor(Math.log10(step0 || 1))); const f = step0 / p; const s = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; return { step: s, max: Math.ceil(max / s) * s }; };
// series: [{name,color,pts:[[x,y]...],dashed,area,dots}]
export function line(series, o = {}) {
  const W = o.w || 560, H = o.h || 220, m = { l: 46, r: 14, t: 12, b: 26, ...(o.m || {}) };
  const xs = series.flatMap(s => s.pts.map(p => p[0])), ys = series.flatMap(s => s.pts.map(p => p[1]));
  const x0 = o.xmin ?? Math.min(...xs), x1 = o.xmax ?? Math.max(...xs), y0 = o.ymin ?? 0; const ny = nice(o.ymax ?? Math.max(...ys) * 1.05);
  const X = x => m.l + (x - x0) / (x1 - x0 || 1) * (W - m.l - m.r), Y = y => H - m.b - (y - y0) / (ny.max - y0 || 1) * (H - m.t - m.b);
  let g = '';
  for (let v = y0; v <= ny.max + 1e-9; v += ny.step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}"/><text x="${m.l - 6}" y="${Y(v) + 3}" text-anchor="end" fill="${C.txt}" font-size="10" font-family="var(--mono)">${fmt(v, o.yd || 0)}${o.yu || ''}</text>`;
  const xt = o.xticks || []; xt.forEach(t => g += `<text x="${X(t)}" y="${H - 8}" text-anchor="middle" fill="${C.txt}" font-size="10" font-family="var(--mono)">${t}</text>`);
  (o.vlines || []).forEach((v, vi) => g += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${m.t}" y2="${H - m.b}" stroke="${v.color || C.amber}" stroke-dasharray="4 3"/><text x="${X(v.x) + 4}" y="${m.t + 10 + (vi % 3) * 11}" fill="${v.color || C.amber}" font-size="9.5">${esc(v.label)}</text>`);
  series.forEach(s => {
    const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
    if (s.area) g += `<path d="${d}L${X(s.pts.at(-1)[0])} ${Y(y0)}L${X(s.pts[0][0])} ${Y(y0)}Z" fill="${s.color}" opacity=".14"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    if (s.dots) s.pts.forEach(p => g += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.4" fill="#FFFFFF" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} · ${p[0]}: ${fmt(p[1])}</title></circle>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}</svg>`;
}
// bars: [{label,value,color}] vertical
export function bars(items, o = {}) {
  const W = o.w || 560, H = o.h || 200, m = { l: 40, r: 8, t: 10, b: o.rot ? 54 : 30 }; const ny = nice(o.max ?? Math.max(...items.map(i => i.value)) * 1.08);
  const bw = (W - m.l - m.r) / items.length; let g = '';
  for (let v = 0; v <= ny.max + 1e-9; v += ny.step) { const y = H - m.b - v / ny.max * (H - m.t - m.b); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${C.grid}"/><text x="${m.l - 5}" y="${y + 3}" text-anchor="end" fill="${C.txt}" font-size="10" font-family="var(--mono)">${fmt(v)}</text>`; }
  items.forEach((it, i) => {
    const h = it.value / ny.max * (H - m.t - m.b), x = m.l + i * bw + bw * .16, y = H - m.b - h;
    g += `<rect x="${x}" y="${y}" width="${bw * .68}" height="${h}" rx="2" fill="${it.color || C.cyan}"><title>${esc(it.label)}: ${fmt(it.value, o.d || 0)}</title></rect>`;
    const lx = x + bw * .34;
    g += o.rot ? `<text transform="translate(${lx},${H - m.b + 8}) rotate(50)" fill="${C.txt}" font-size="9.5">${esc(it.label)}</text>` : `<text x="${lx}" y="${H - 12}" text-anchor="middle" fill="${C.txt}" font-size="10">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}
// stacked horizontal: rows [{label, parts:[{v,color,name}]}]
export function hstack(rows, o = {}) {
  const W = o.w || 560, rh = o.rh || 24, m = { l: o.ml || 130, r: 46, t: 4 }; const H = m.t + rows.length * rh + 6; const mx = Math.max(...rows.map(r => r.parts.reduce((a, p) => a + p.v, 0))) || 1; let g = '';
  rows.forEach((r, i) => { const y = m.t + i * rh; g += `<text x="${m.l - 8}" y="${y + rh * .62}" text-anchor="end" fill="#45544F" font-size="11">${esc(r.label)}</text>`; let x = m.l; const tot = r.parts.reduce((a, p) => a + p.v, 0); r.parts.forEach(p => { const w = p.v / mx * (W - m.l - m.r); g += `<rect x="${x}" y="${y + 3}" width="${Math.max(0, w)}" height="${rh - 8}" fill="${p.color}"><title>${esc(r.label)} · ${esc(p.name)}: ${fmt(p.v, o.d || 0)}</title></rect>`; x += w; }); g += `<text x="${x + 6}" y="${y + rh * .62}" fill="${C.txt}" font-size="10" font-family="var(--mono)">${fmt(tot, o.d || 0)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}
export function donut(parts, o = {}) {
  const S = o.s || 160, R = S / 2 - 6, r = R * .64, cx = S / 2, cy = S / 2; const tot = parts.reduce((a, p) => a + p.v, 0) || 1; let a0 = -Math.PI / 2, g = '';
  parts.forEach(p => { const a1 = a0 + p.v / tot * Math.PI * 2, la = a1 - a0 > Math.PI ? 1 : 0; if (p.v <= 0) return; const pt = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1 - .001, R), [x2, y2] = pt(a1 - .001, r), [x3, y3] = pt(a0, r);
    g += `<path d="M${x0} ${y0}A${R} ${R} 0 ${la} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${la} 0 ${x3} ${y3}Z" fill="${p.color}"><title>${esc(p.name)}: ${fmt(p.v)} (${fmt(p.v / tot * 100, 1)} %)</title></path>`; a0 = a1; });
  g += `<text x="${cx}" y="${cy - 1}" text-anchor="middle" fill="currentColor" font-size="${S / 6.2}" font-family="var(--mono)" font-weight="600">${o.center ?? fmt(tot)}</text><text x="${cx}" y="${cy + S / 10}" text-anchor="middle" fill="currentColor" opacity=".7" font-size="${S / 15}">${esc(o.sub || '')}</text>`;
  return `<svg viewBox="0 0 ${S} ${S}" class="donut" style="color:inherit">${g}</svg>`;
}
export function spark(vals, color = C.cyan, w = 90, h = 26) {
  const mn = Math.min(...vals), mx = Math.max(...vals); const X = i => 2 + i / (vals.length - 1) * (w - 4), Y = v => h - 3 - (v - mn) / (mx - mn || 1) * (h - 6);
  const d = vals.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}L${w - 2} ${h}L2 ${h}Z" fill="${color}" opacity=".15"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}
export function gauge(v, max, color, label) {
  const S = 120, R = 48, cx = 60, cy = 64; const a = Math.PI * (1 - Math.min(1, v / max)); const pt = (ang) => [cx + R * Math.cos(ang), cy - R * Math.sin(ang)]; const [x0, y0] = pt(Math.PI), [x1, y1] = pt(a);
  return `<svg viewBox="0 0 120 84" class="gauge"><path d="M${x0} ${y0}A${R} ${R} 0 0 1 ${cx + R} ${cy}" stroke="rgba(111,124,119,.2)" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round"/><text x="60" y="62" text-anchor="middle" fill="currentColor" font-size="22" font-family="var(--mono)" font-weight="600">${fmt(v)}</text><text x="60" y="78" text-anchor="middle" fill="${C.txt}" font-size="9">${esc(label || '')}</text></svg>`;
}
