// Visor y analizador LiDAR (WebGL, sin dependencias). Lee LAS 1.0–1.4 (PDRF 0–10).
import { $, $$, on, esc, fmt, chip, toast } from '../util.js';
import * as ch from '../charts.js';
import { kpi, tag, icon } from '../ui.js';
import { parseLasHeader, sha256Bytes, ledgerAppend } from '../integrity.js';
import { S, munName } from '../state.js';
import SAMPLES from '../data/lidar_samples.json';
import { hdr, who } from './verif.js';
import { me } from '../domain/core.js';

const HEX = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const ramp = (stops) => v => { if (v <= stops[0][0]) return HEX(stops[0][1]); for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const t = (v - a) / (b - a), A = HEX(ca), B = HEX(cb); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; } return HEX(stops.at(-1)[1]); };
const HAG = ramp([[0, '#BC955C'], [1.5, '#8A6A35'], [4, '#2E7D32'], [14, '#235B4E'], [30, '#0F2A24']]);
const ELEV = ramp([[0, '#0F2A24'], [.3, '#235B4E'], [.55, '#2E7D32'], [.8, '#BC955C'], [1, '#9F2241']]);
const GREY = ramp([[0, '#1B2A26'], [.5, '#6F7C77'], [1, '#F2F4F0']]);
const CLSC = { 2: '#BC955C', 3: '#2E7D32', 4: '#2E7D32', 5: '#235B4E', 6: '#9F2241', 9: '#45544F' };
const CLSN = { 1: 'Sin clasificar', 2: 'Suelo', 3: 'Vegetación baja', 4: 'Vegetación media', 5: 'Vegetación alta', 6: 'Edificación', 7: 'Ruido', 9: 'Agua' };

// ---------- Lectura de puntos ----------
export function readPoints(buf) {
  const h = parseLasHeader(buf); if (!h) throw new Error('No es un archivo LAS válido');
  if (h.pdrf > 10) throw new Error('Formato de punto no soportado: ' + h.pdrf);
  const dv = new DataView(buf); const n = Math.min(h.count, Math.floor((buf.byteLength - h.offsetPoints) / h.recLen)); const ext = h.pdrf >= 6;
  const step = Math.max(1, Math.ceil(n / 400000)); const m = Math.ceil(n / step);
  const x = new Float64Array(m), y = new Float64Array(m), z = new Float64Array(m), c = new Uint8Array(m), it = new Uint16Array(m), rn = new Uint8Array(m);
  for (let i = 0, k = 0; i < n; i += step, k++) { const o = h.offsetPoints + i * h.recLen;
    x[k] = dv.getInt32(o, true) * h.scale[0] + h.offset[0]; y[k] = dv.getInt32(o + 4, true) * h.scale[1] + h.offset[1]; z[k] = dv.getInt32(o + 8, true) * h.scale[2] + h.offset[2];
    it[k] = dv.getUint16(o + 12, true); const rb = dv.getUint8(o + 14); rn[k] = ext ? rb & 15 : rb & 7; c[k] = ext ? dv.getUint8(o + 16) : dv.getUint8(o + 15) & 31; }
  return { h, n: m, total: n, step, x, y, z, c, it, rn };
}

// ---------- Análisis: MDT, MDS, modelo de altura de dosel, copas ----------
export function analyze(P, cell = 1) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < P.n; i++) { if (P.x[i] < x0) x0 = P.x[i]; if (P.x[i] > x1) x1 = P.x[i]; if (P.y[i] < y0) y0 = P.y[i]; if (P.y[i] > y1) y1 = P.y[i]; }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), ny = Math.max(1, Math.ceil((y1 - y0) / cell)), N = nx * ny;
  const dtm = new Float64Array(N).fill(NaN), dsm = new Float64Array(N).fill(NaN), cnt = new Uint32Array(N), gcnt = new Uint32Array(N);
  const idx = new Int32Array(P.n);
  for (let i = 0; i < P.n; i++) { const ix = Math.min(nx - 1, Math.floor((P.x[i] - x0) / cell)), iy = Math.min(ny - 1, Math.floor((P.y[i] - y0) / cell)), k = iy * nx + ix; idx[i] = k; if (P.c[i] === 7 || P.c[i] === 18) continue; cnt[k]++;
    if (!(dsm[k] >= P.z[i])) dsm[k] = P.z[i]; if (P.c[i] === 2 || P.c[i] === 9) { gcnt[k]++; if (!(dtm[k] <= P.z[i])) dtm[k] = P.z[i]; } }
  // rellenar huecos del MDT por promedio de vecinos
  for (let pass = 0; pass < 40; pass++) { let miss = 0; const nd = dtm.slice(); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!isNaN(dtm[k])) continue; let s = 0, w = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const v = dtm[b * nx + a]; if (!isNaN(v)) { s += v; w++; } } if (w) nd[k] = s / w; else miss++; } dtm.set(nd); if (!miss) break; }
  const chm = new Float32Array(N); for (let k = 0; k < N; k++) chm[k] = isNaN(dsm[k]) || isNaN(dtm[k]) ? 0 : Math.max(0, dsm[k] - dtm[k]);
  const hag = new Float32Array(P.n); for (let i = 0; i < P.n; i++) { const g = dtm[idx[i]]; hag[i] = isNaN(g) ? 0 : Math.max(0, P.z[i] - g); }
  // cimas: máximos locales del MDA suavizado
  const sm = new Float32Array(N); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0, w = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; s += chm[b * nx + a]; w++; } sm[j * nx + i] = s / w; }
  const tops = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = sm[j * nx + i]; if (v < 0.8) continue; const r = v > 12 ? 3 : v > 4 ? 2 : 1; let isMax = true; for (let dj = -r; dj <= r && isMax; dj++) for (let di = -r; di <= r; di++) { if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; if (sm[b * nx + a] > v) { isMax = false; break; } } if (isMax) tops.push({ x: i * cell + cell / 2, y: j * cell + cell / 2, h: chm[j * nx + i] }); }
  // espaciamiento entre cimas
  const nn = tops.map((t, a) => { let best = Infinity; tops.forEach((u, b) => { if (a !== b) { const d = Math.hypot(t.x - u.x, t.y - u.y); if (d < best) best = d; } }); return best; }).filter(isFinite);
  const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1); const pct = (a, p) => { const s = [...a].sort((u, v) => u - v); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  const area = (x1 - x0) * (y1 - y0), ha = area / 1e4; const canopy = [...chm].filter(v => v > 2);
  const cov = t => [...chm].filter(v => v > t).length / N; const low = [...chm].filter(v => v < 1).length / N;
  const nnMean = mean(nn), nnCv = nn.length > 3 ? Math.sqrt(mean(nn.map(v => (v - nnMean) ** 2))) / nnMean : null;
  // pendiente media del MDT (plano por mínimos cuadrados)
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, m = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = dtm[j * nx + i]; if (isNaN(v)) continue; const X = i * cell, Y = j * cell; sx += X; sy += Y; sz += v; sxx += X * X; syy += Y * Y; sxy += X * Y; sxz += X * v; syz += Y * v; m++; }
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, m]], B = [sxz, syz, sz]; const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A); const rep = (c) => A.map((r, i) => r.map((v, j) => j === c ? B[i] : v)); const a1 = det(rep(0)) / D, b1 = det(rep(1)) / D; const slope = Math.atan(Math.hypot(a1, b1)) * 180 / Math.PI;
  const water = [...Array(P.n).keys()].reduce((s, i) => s + (P.c[i] === 9 ? 1 : 0), 0); const waterCells = new Set(); for (let i = 0; i < P.n; i++) if (P.c[i] === 9) waterCells.add(idx[i]);
  const tall = tops.filter(t => t.h >= 12), mid = tops.filter(t => t.h >= 3 && t.h < 12), young = tops.filter(t => t.h >= .8 && t.h < 3);
  const R = { x0, y0, nx, ny, cell, dtm, chm, hag, tops, area, ha, dens: P.total / area, gdens: P.c.reduce((s, v) => s + (v === 2 ? 1 : 0), 0) * P.step / area, cover5: cov(5), cover2: cov(2), low, hMean: mean(canopy), hP95: pct(canopy, .95), nTall: tall.length, nMid: mid.length, nYoung: young.length, treesHa: tops.filter(t => t.h >= 2).length / ha, nnMean, nnCv, slope, waterM2: waterCells.size * cell * cell };
  R.verdict = interpret(R); return R;
}
function interpret(R) {
  const out = [];
  if (R.cover5 >= .5 && R.hP95 >= 14) out.push(['Bosque', 'ok', `Dosel continuo (cobertura > 5 m: ${fmt(R.cover5 * 100)} %, altura P95 ${fmt(R.hP95, 1)} m). Estructura compatible con bosque natural sin conversión.`]);
  else if (R.nMid >= 8 && R.nnCv != null && R.nnCv < .35 && R.hP95 < 11) out.push(['Huerta establecida', 'warn', `Árboles de ${fmt(R.hMean, 1)} m de altura media en arreglo regular (variación del espaciamiento ${fmt(R.nnCv * 100)} %, ~${fmt(R.nnMean, 1)} m entre árboles). Plantación consolidada.`]);
  else if (R.nTall >= 5 && R.low >= .3) out.push(['Mosaico con desmonte', 'bad', `Bosque remanente (${R.nTall} árboles ≥ 12 m) junto a ${fmt(R.low * 100)} % del área sin vegetación alta.`]);
  else out.push(['Cobertura mixta', 'warn', 'Estructura sin patrón dominante; requiere revisión del analista.']);
  if (R.nYoung >= 10) out.push(['Plantación joven', 'bad', `${R.nYoung} plantas de 0.8–3 m: indicio de establecimiento reciente (pocos años), a contrastar con la serie satelital.`]);
  if (R.waterM2 > 20) out.push(['Olla o cuerpo de agua', 'bad', `≈ ${fmt(R.waterM2)} m² de agua: infraestructura permanente, causal de cambio de uso irreversible.`]);
  if (R.slope > 12) out.push(['Terreno en pendiente', 'warn', `Pendiente media ${fmt(R.slope, 1)}°: revisar terrazas y movimiento de tierra en el MDT.`]);
  return out;
}

// ---------- WebGL ----------
const VS = `attribute vec3 p;attribute vec3 c;uniform mat4 M;uniform float s;varying vec3 vc;void main(){gl_Position=M*vec4(p,1.0);gl_PointSize=s;vc=c;}`;
const FS = `precision mediump float;varying vec3 vc;void main(){vec2 d=gl_PointCoord-.5;if(dot(d,d)>.25)discard;gl_FragColor=vec4(vc,1.0);}`;
function mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (fa + n) / (n - fa); o[11] = -1; o[14] = 2 * fa * n / (n - fa); return o; }
function look(e, c, u) { const z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function viewer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }); if (!gl) throw new Error('El navegador no soporta WebGL');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  const bp = gl.createBuffer(), bc = gl.createBuffer(); const lp = gl.getAttribLocation(pr, 'p'), lc = gl.getAttribLocation(pr, 'c'), uM = gl.getUniformLocation(pr, 'M'), uS = gl.getUniformLocation(pr, 's');
  const st = { yaw: -.7, pitch: .55, dist: 90, tx: 0, ty: 0, tz: 0, n: 0, size: 2.2, dead: false };
  const draw = () => { if (st.dead) return; const dpr = devicePixelRatio || 1; const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(.949, .957, .941, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    const e = [st.tx + st.dist * Math.cos(st.pitch) * Math.cos(st.yaw), st.ty + st.dist * Math.cos(st.pitch) * Math.sin(st.yaw), st.tz + st.dist * Math.sin(st.pitch)];
    const M = mul(persp(.8, w / h, .5, 2000), look(e, [st.tx, st.ty, st.tz], [0, 0, 1])); gl.uniformMatrix4fv(uM, false, M); gl.uniform1f(uS, st.size * dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, bc); gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 3, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.POINTS, 0, st.n); };
  let raf = 0; const req = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  let drag = null; canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.pan) { const k = st.dist / 600; st.tx += dx * Math.sin(st.yaw) * k; st.ty -= dx * Math.cos(st.yaw) * k; st.tz += dy * k; } else { st.yaw -= dx * .008; st.pitch = Math.max(.05, Math.min(1.5, st.pitch + dy * .008)); } req(); });
  canvas.addEventListener('pointerup', () => drag = null);
  canvas.addEventListener('wheel', e => { e.preventDefault(); st.dist = Math.max(5, Math.min(600, st.dist * (1 + Math.sign(e.deltaY) * .1))); req(); }, { passive: false });
  return { st, req, set(pos, col) { gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, bc); gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW); st.n = pos.length / 3; req(); }, color(col) { gl.bindBuffer(gl.ARRAY_BUFFER, bc); gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW); req(); }, destroy() { st.dead = true; cancelAnimationFrame(raf); } };
}
function colors(P, R, mode) {
  const col = new Float32Array(P.n * 3); let zmin = Infinity, zmax = -Infinity, imax = 1; for (let i = 0; i < P.n; i++) { if (P.z[i] < zmin) zmin = P.z[i]; if (P.z[i] > zmax) zmax = P.z[i]; if (P.it[i] > imax) imax = P.it[i]; }
  for (let i = 0; i < P.n; i++) { const c = mode === 'hag' ? HAG(R.hag[i]) : mode === 'cls' ? HEX(CLSC[P.c[i]] || '#6F7C77') : mode === 'int' ? GREY(Math.sqrt(P.it[i] / imax)) : ELEV((P.z[i] - zmin) / (zmax - zmin || 1)); col.set(c, i * 3); }
  return col;
}

// ---------- Vista ----------
let cache = {};
function visor(main, params) {
  let cur = null, view = null, mode = 'hag';
  main.innerHTML = hdr('Visor y análisis LiDAR', 'Nube de puntos en 3D, modelo digital del terreno, modelo de altura del dosel y conteo de árboles. Interpreta la estructura de la vegetación como evidencia para el dictamen.', `${who()} <label class="btn" style="cursor:pointer">${icon('upload', 14)} Abrir archivo LAS<input type="file" id="lf" accept=".las" hidden></label>`) +
    `<div class="note tiny" style="margin-bottom:12px"><b>Archivos de ejemplo sintéticos.</b> Las tres nubes se generaron con estructura física realista (terreno, copas, sotobosque, retornos y clasificación ASPRS) y están georreferenciadas en predios de demostración de Tancítaro y Uruapan; su encabezado lo declara («SINTETICO DEMO UAV»). El visor abre cualquier LAS real, por ejemplo las nubes de puntos de INEGI o un levantamiento con dron.</div>
    <div class="grid g3" id="sm" style="margin-bottom:14px">${SAMPLES.map(s => `<div class="card" data-s="${s.id}" style="cursor:pointer;border-top:3px solid ${s.id === 'bosque' ? '#2E7D32' : s.id === 'huerta' ? '#A8720F' : '#B3261E'}"><div class="ch"><h3>${esc(s.name)}</h3><div class="sp">${tag('demo')}</div></div><p class="tiny dim" style="margin:4px 0 8px">${esc(s.desc)}</p><div class="tiny mono dim">${fmt(s.n)} puntos · ${fmt(s.bytes / 1e6, 1)} MB · ${s.lado_m}×${s.lado_m} m · ${esc(munName[s.mun] || '')} · predio ${s.pid}</div></div>`).join('')}</div>
    <div class="grid g21"><div class="card pad0" style="position:relative;height:560px"><canvas id="gl" style="width:100%;height:100%;display:block;cursor:grab;touch-action:none"></canvas>
      <div style="position:absolute;left:12px;top:12px;display:flex;gap:6px;flex-wrap:wrap" id="cm"><div class="pill-tabs" style="background:rgba(255,255,255,.95)">${[['hag', 'Altura sobre terreno'], ['cls', 'Clasificación'], ['elev', 'Elevación'], ['int', 'Intensidad']].map(([k, n]) => `<button data-m="${k}" class="${k === mode ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div style="position:absolute;right:12px;top:12px" class="card" id="lgd"></div>
      <div class="tiny" style="position:absolute;left:12px;bottom:10px;background:rgba(255,255,255,.92);padding:4px 8px;border-radius:6px;color:var(--mut)">Arrastrar: girar · Shift/clic derecho: desplazar · Rueda: acercar · <label>Tamaño <input type="range" id="ps" min="1" max="5" step=".2" value="2.2" style="width:90px;vertical-align:middle"></label></div>
      <div id="ld" class="dim" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px">Seleccione una nube de ejemplo o abra un archivo LAS.</div></div>
      <div class="card" id="res" style="max-height:560px;overflow:auto"><div class="dim">Sin nube cargada.</div></div></div>
    <div class="grid g3" style="margin-top:14px"><div class="card"><div class="ch"><h3>Modelo de altura del dosel (1 m)</h3></div><canvas id="chm" style="width:100%;aspect-ratio:1;border-radius:8px;border:1px solid var(--line);background:#F2F4F0;image-rendering:pixelated"></canvas><div class="tiny dim" style="margin-top:4px">Vista cenital. Puntos guinda: cimas de árboles detectadas.</div></div>
      <div class="card"><div class="ch"><h3>Perfil transversal (franja de 3 m)</h3></div><canvas id="pf" style="width:100%;height:300px;border-radius:8px;border:1px solid var(--line);background:#FFFFFF"></canvas><div class="tiny dim" style="margin-top:4px">Corte de oeste a este por el centro del recorte.</div></div>
      <div class="card"><div class="ch"><h3>Distribución de alturas</h3></div><div id="hist"></div><div class="tiny dim">Retornos sobre el terreno por clase de altura (m).</div></div></div>`;
  const canvas = $('#gl', main); try { view = viewer(canvas); } catch (e) { $('#ld', main).textContent = e.message; }
  const legend = () => { const L = mode === 'hag' ? [['#BC955C', 'Suelo 0 m'], ['#8A6A35', '1.5 m'], ['#2E7D32', '4 m'], ['#235B4E', '14 m'], ['#0F2A24', '≥ 30 m']] : mode === 'cls' ? [['#BC955C', 'Suelo (2)'], ['#2E7D32', 'Vegetación baja/media (3-4)'], ['#235B4E', 'Vegetación alta (5)'], ['#45544F', 'Agua (9)']] : mode === 'elev' ? [['#0F2A24', 'Más bajo'], ['#2E7D32', ''], ['#BC955C', ''], ['#9F2241', 'Más alto']] : [['#1B2A26', 'Baja'], ['#6F7C77', ''], ['#F2F4F0', 'Alta']]; $('#lgd', main).innerHTML = L.map(([c, n]) => `<div class="tiny" style="display:flex;gap:6px;align-items:center"><i style="width:12px;height:12px;border-radius:3px;background:${c};box-shadow:inset 0 0 0 1px rgba(15,42,36,.3);display:inline-block"></i>${n}</div>`).join(''); $('#lgd', main).style.padding = '8px 10px'; };
  const show = async (buf, label, expected) => {
    $('#ld', main).style.display = 'flex'; $('#ld', main).textContent = 'Leyendo y analizando ' + label + '…'; await new Promise(r => setTimeout(r, 30));
    let P; try { P = readPoints(buf); } catch (e) { $('#ld', main).textContent = e.message; toast(e.message, 'warn'); return; }
    const R = analyze(P); const sha = sha256Bytes(new Uint8Array(buf)); cur = { P, R };
    let cx = 0, cy = 0, zmin = Infinity; for (let i = 0; i < P.n; i++) { cx += P.x[i]; cy += P.y[i]; if (P.z[i] < zmin) zmin = P.z[i]; } cx /= P.n; cy /= P.n;
    const pos = new Float32Array(P.n * 3); for (let i = 0; i < P.n; i++) { pos[i * 3] = P.x[i] - cx; pos[i * 3 + 1] = P.y[i] - cy; pos[i * 3 + 2] = P.z[i] - zmin; }
    if (view) { const ext = Math.max(R.nx, R.ny) * R.cell; Object.assign(view.st, { dist: ext * 1.5, tx: 0, ty: 0, tz: (R.hP95 || 5) * .4 }); view.set(pos, colors(P, R, mode)); }
    $('#ld', main).style.display = 'none'; legend(); panels(P, R); ledgerAppend(S.ledger, me().id, 'LIDAR_ANALIZADO', label, sha);
    const h = P.h; $('#res', main).innerHTML = `<div class="ch"><h3>${esc(label)}</h3></div>
      ${R.verdict.map(([t, k, d]) => `<div class="verdict ${k === 'ok' ? 'ok' : k === 'bad' ? 'fail' : 'warn'}" style="margin:8px 0;padding:10px 12px"><div><div class="big" style="font-size:17px">${esc(t)}</div><div class="tiny" style="color:var(--mut)">${esc(d)}</div></div></div>`).join('')}
      <dl class="kv" style="margin-top:10px"><dt>Cobertura de dosel &gt; 5 m</dt><dd class="mono">${fmt(R.cover5 * 100, 1)} %</dd><dt>Cobertura &gt; 2 m</dt><dd class="mono">${fmt(R.cover2 * 100, 1)} %</dd><dt>Altura media / P95 del dosel</dt><dd class="mono">${fmt(R.hMean, 1)} / ${fmt(R.hP95, 1)} m</dd><dt>Árboles detectados</dt><dd class="mono">${fmt(R.tops.filter(t => t.h >= 2).length)} · ${fmt(R.treesHa)} /ha</dd><dt>≥ 12 m · 3–12 m · jóvenes</dt><dd class="mono">${R.nTall} · ${R.nMid} · ${R.nYoung}</dd><dt>Espaciamiento entre cimas</dt><dd class="mono">${R.nnCv != null ? fmt(R.nnMean, 1) + ' m · variación ' + fmt(R.nnCv * 100) + ' %' : '—'}</dd><dt>Pendiente media del terreno</dt><dd class="mono">${fmt(R.slope, 1)}°</dd><dt>Densidad total / de suelo</dt><dd class="mono">${fmt(R.dens, 1)} / ${fmt(R.gdens, 1)} pts/m²</dd><dt>Superficie analizada</dt><dd class="mono">${fmt(R.area)} m²</dd></dl>
      <h3 style="margin-top:14px">Encabezado del archivo</h3><dl class="kv" style="margin-top:6px"><dt>Versión · formato de punto</dt><dd class="mono">LAS ${h.version} · PDRF ${h.pdrf}</dd><dt>Puntos</dt><dd class="mono">${fmt(P.total)}${P.step > 1 ? ' (se muestran ' + fmt(P.n) + ')' : ''}</dd><dt>Sistema</dt><dd class="mono">${esc(h.system)}</dd><dt>Software</dt><dd class="mono">${esc(h.software)}</dd><dt>Creación</dt><dd class="mono">${h.created || '—'}</dd><dt>CRS (WKT)</dt><dd>${h.wkt ? 'Declarado' : 'No declarado'}</dd><dt>SHA-256</dt><dd class="hash">${sha}</dd>${expected ? `<dt>Contra manifiesto</dt><dd>${expected === sha ? chip('Coincide', 'ok') : chip('No coincide', 'bad')}</dd>` : ''}</dl>
      <div class="note info tiny" style="margin-top:10px">Indicadores de apoyo al analista; el dictamen los contrasta con la serie satelital y la visita de campo.</div>`;
  };
  const panels = (P, R) => {
    const cv = $('#chm', main), c2 = cv.getContext('2d'); cv.width = R.nx; cv.height = R.ny; const im = c2.createImageData(R.nx, R.ny);
    for (let j = 0; j < R.ny; j++) for (let i = 0; i < R.nx; i++) { const v = R.chm[j * R.nx + i], [r, g, b] = HAG(v); const o = ((R.ny - 1 - j) * R.nx + i) * 4; im.data[o] = r * 255; im.data[o + 1] = g * 255; im.data[o + 2] = b * 255; im.data[o + 3] = 255; }
    c2.putImageData(im, 0, 0); c2.fillStyle = '#9F2241'; R.tops.filter(t => t.h >= 2).forEach(t => c2.fillRect(t.x / R.cell - .5, R.ny - t.y / R.cell - .5, 1.2, 1.2));
    const pf = $('#pf', main), p2 = pf.getContext('2d'); const W = pf.width = pf.clientWidth * 2, H = pf.height = pf.clientHeight * 2; p2.clearRect(0, 0, W, H);
    const yc = R.y0 + R.ny * R.cell / 2; let zmin = Infinity, zmax = -Infinity; const sel = []; for (let i = 0; i < P.n; i++) if (Math.abs(P.y[i] - yc) < 1.5) { sel.push(i); if (P.z[i] < zmin) zmin = P.z[i]; if (P.z[i] > zmax) zmax = P.z[i]; }
    const sx = (W - 40) / (R.nx * R.cell), sz = Math.min(sx, (H - 30) / (zmax - zmin || 1));
    p2.strokeStyle = 'rgba(111,124,119,.25)'; p2.fillStyle = '#6F7C77'; p2.font = '20px IBM Plex Mono, monospace'; for (let z = 0; z <= zmax - zmin; z += 5) { const yy = H - 20 - z * sz; p2.beginPath(); p2.moveTo(30, yy); p2.lineTo(W, yy); p2.stroke(); p2.fillText(z + ' m', 0, yy - 2); }
    sel.forEach(i => { p2.fillStyle = CLSC[P.c[i]] || '#6F7C77'; p2.fillRect(30 + (P.x[i] - R.x0) * sx, H - 20 - (P.z[i] - zmin) * sz, 2, 2); });
    const bins = [[0, .5, 'Suelo'], [.5, 2, '0.5–2'], [2, 5, '2–5'], [5, 10, '5–10'], [10, 15, '10–15'], [15, 20, '15–20'], [20, 25, '20–25'], [25, 60, '≥ 25']]; const cnt = bins.map(() => 0); for (let i = 0; i < P.n; i++) { const v = R.hag[i]; const k = bins.findIndex(b => v >= b[0] && v < b[1]); if (k >= 0) cnt[k]++; }
    $('#hist', main).innerHTML = ch.bars(bins.map((b, i) => ({ label: b[2], value: Math.round(cnt[i] * P.step), color: i === 0 ? '#BC955C' : b[0] >= 10 ? '#235B4E' : '#2E7D32' })), { h: 260 });
  };
  const load = async (s) => { $$('[data-s]', main).forEach(c => c.style.boxShadow = c.dataset.s === s.id ? '0 0 0 2px #235B4E' : ''); if (cache[s.id]) return show(cache[s.id], s.name, s.sha256);
    $('#ld', main).style.display = 'flex'; $('#ld', main).textContent = 'Descargando ' + s.file + '…';
    try { const r = await fetch(s.file); if (!r.ok) throw new Error('HTTP ' + r.status); cache[s.id] = await r.arrayBuffer(); show(cache[s.id], s.name, s.sha256); } catch (e) { $('#ld', main).textContent = 'No se pudo descargar la muestra (' + e.message + ').'; } };
  on(main, 'click', '[data-s]', (e, c) => load(SAMPLES.find(s => s.id === c.dataset.s)));
  on(main, 'click', '#cm button', (e, b) => { mode = b.dataset.m; $$('#cm button', main).forEach(x => x.classList.toggle('on', x === b)); if (cur && view) { view.color(colors(cur.P, cur.R, mode)); legend(); } });
  $('#ps', main).oninput = e => { if (view) { view.st.size = +e.target.value; view.req(); } };
  $('#lf', main).onchange = async e => { const f = e.target.files[0]; if (!f) return; if (/\.laz$/i.test(f.name)) return toast('Archivo LAZ comprimido: conviértalo a LAS (por ejemplo con PDAL o LAStools) para abrirlo en este visor.', 'warn'); show(await f.arrayBuffer(), f.name, null); };
  load(SAMPLES.find(s => s.id === (params && params.id) ) || SAMPLES[0]);
  return () => view && view.destroy();
}
export const views = { visor };
