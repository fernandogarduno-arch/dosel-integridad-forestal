// Verificación de integridad y coherencia de levantamientos con dron/LiDAR (se ejecuta en el navegador; ningún archivo sale del equipo hasta el envío)
import { Sha256, sha256File, parseLasHeader, parseExif, sunElevation, toUTM, ledgerVerify } from './integrity.js';
import { S, prediosById, estudioById } from './state.js';
import { esc, fmt, haversine } from './util.js';

export const CHECK_DEFS = [
  ['hash', 'Huella SHA-256 de cada archivo coincide con el manifiesto sellado'],
  ['cadena', 'Cadena de custodia (bitácora encadenada) íntegra'],
  ['firma', 'Firma electrónica del operador y sello de tiempo (NOM-151)'],
  ['autoriz', 'Autorización de vuelo (INEGI) y NOM-107-SCT3 declaradas'],
  ['equipo', 'Aeronave y sensor identificados; series consistentes con los metadatos'],
  ['tiempo', 'Coherencia temporal entre vuelo declarado, EXIF y encabezado LAS'],
  ['solar', 'Posición solar de las fotografías coherente con fecha, hora y lugar'],
  ['gnss', 'Trayectoria GNSS/INS sin saltos ni velocidades imposibles'],
  ['cobertura', 'La nube cubre el polígono del predio'],
  ['densidad', 'Densidad de puntos cumple el mínimo del nivel'],
  ['las', 'Encabezado LAS 1.4 completo: CRS, conteo, GUID, fechas'],
  ['control', 'Puntos de control (≥ 30) y RMSE vertical ≤ 5 cm'],
  ['dup', 'Sin reutilización de nubes ya recibidas'],
];
const kindOf = n => { n = n.toLowerCase(); if (/\.(las|laz)$/.test(n)) return 'nube'; if (/\.(jpe?g|dng)$/.test(n)) return 'foto'; if (/(traj|sbet|ppk|gnss).*\.(csv|txt)$/.test(n) || /trayectoria/.test(n)) return 'trayectoria'; if (/(control|gcp|check).*\.(csv|txt)$/.test(n)) return 'control'; if (/(log|vuelo|flight)/.test(n)) return 'log'; if (/\.pdf$/.test(n)) return 'informe'; return 'otro'; };

export async function analyzeFiles(files, onProg) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; const info = { name: f.name, size: f.size, kind: kindOf(f.name), file: f };
    info.sha = await sha256File(f, p => onProg && onProg(i, p));
    try {
      if (info.kind === 'nube' && /\.las$/i.test(f.name)) info.las = parseLasHeader(await f.slice(0, 1200).arrayBuffer());
      else if (info.kind === 'nube') { const b = await f.slice(0, 1200).arrayBuffer(); info.las = parseLasHeader(b); info.laz = true; }
      if (info.kind === 'foto') info.exif = parseExif(await f.slice(0, 262144).arrayBuffer());
      if (info.kind === 'trayectoria' || info.kind === 'control') info.text = await f.slice(0, 4000000).text();
    } catch (e) { info.err = String(e); }
    out.push(info);
  }
  return out;
}
const parseCsv = t => { const L = t.split(/\r?\n/).filter(x => x.trim()); if (!L.length) return []; const d = L[0].includes(';') ? ';' : ','; const h = L[0].split(d).map(x => x.trim().toLowerCase()); return L.slice(1).map(l => { const c = l.split(d); const o = {}; h.forEach((k, i) => o[k] = c[i]); return o; }); };
const ck = (k, s, det) => ({ k, s, det, lab: CHECK_DEFS.find(c => c[0] === k)[1] });

// meta: {pid, fecha, autoriz, aeroSerie, sensorSerie, aeroModelo, sensorModelo, dens}; infos: analyzeFiles(); manifest: [{name,sha}] opcional (sellado previo)
export function runChecks(meta, infos, manifest, opts = {}) {
  const C = []; const pred = prediosById[meta.pid]; const nubes = infos.filter(i => i.kind === 'nube'), fotos = infos.filter(i => i.kind === 'foto');
  // hash
  if (manifest) { const bad = infos.filter(i => { const m = manifest.find(x => x.name === i.name); return m && m.sha !== i.sha; }); const miss = manifest.filter(m => !infos.find(i => i.name === m.name)); C.push(bad.length ? ck('hash', 'fail', `${bad.length} archivo(s) NO coinciden con el manifiesto sellado: ${bad.map(b => b.name).join(', ')}. El contenido fue modificado después del sellado.`) : miss.length ? ck('hash', 'warn', `Coinciden ${infos.length} archivos; faltan ${miss.length} del manifiesto.`) : ck('hash', 'ok', `${infos.length} de ${infos.length} archivos con huella idéntica al manifiesto sellado.`)); }
  else C.push(ck('hash', infos.length ? 'ok' : 'idle', infos.length ? `Huellas calculadas para ${infos.length} archivo(s); se sellarán al enviar.` : 'Sin archivos.'));
  const lv = ledgerVerify(S.ledger); C.push(ck('cadena', lv.ok ? 'ok' : 'fail', lv.ok ? `Bitácora íntegra (${lv.n} registros).` : `Cadena rota en el registro ${lv.seq}: ${lv.why}.`));
  C.push(ck('firma', opts.signed ? 'ok' : 'idle', opts.signed ? 'e.firma válida y constancia de conservación adjunta.' : 'Se solicita al enviar (e.firma del operador y sello de tiempo NOM-151). Pendiente en la demostración.'));
  C.push(/^INEGI\/DGG\/\d{4}\/\d{3,6}$/.test((meta.autoriz || '').trim()) ? ck('autoriz', 'ok', `Folio ${meta.autoriz} con formato válido; se consulta vigencia contra el registro de INEGI al enviar.`) : ck('autoriz', 'fail', meta.autoriz ? `El folio "${meta.autoriz}" no tiene el formato esperado (INEGI/DGG/AAAA/NNNN).` : 'No se declaró folio de autorización de vuelo.'));
  // equipo
  const serEx = fotos.map(f => f.exif && f.exif.tags && f.exif.tags.BodySerialNumber).filter(Boolean);
  if (!meta.aeroSerie || !meta.sensorSerie) C.push(ck('equipo', 'fail', 'Falta la serie de la aeronave o del sensor.'));
  else if (serEx.length && meta.aeroSerie && !serEx.includes(meta.aeroSerie) && !serEx.includes(meta.sensorSerie)) C.push(ck('equipo', 'fail', `La serie en EXIF (${serEx[0]}) no coincide con la declarada (${meta.aeroSerie} / ${meta.sensorSerie}).`));
  else C.push(ck('equipo', 'ok', `Aeronave ${esc(meta.aeroModelo || '')} (${meta.aeroSerie}) y sensor ${esc(meta.sensorModelo || '')} (${meta.sensorSerie}) declarados${serEx.length ? '; serie EXIF consistente' : ''}. Se cotejan con el padrón de equipos.`));
  // tiempo
  const tiempos = []; let tstat = 'ok', tdet = [];
  nubes.forEach(n => { if (n.las && n.las.created) { const d = (new Date(n.las.created) - new Date(meta.fecha)) / 864e5; tiempos.push(['LAS', d]); if (d < -1) { tstat = 'fail'; tdet.push(`El LAS (${n.las.created}) fue creado ANTES del vuelo declarado (${meta.fecha}).`); } else if (d > 30) { tstat = 'fail'; tdet.push(`El LAS se creó ${Math.round(d)} días después del vuelo declarado.`); } else if (d > 7) { if (tstat !== 'fail') tstat = 'warn'; tdet.push(`El LAS se creó ${Math.round(d)} días después del vuelo.`); } } });
  fotos.forEach(f => { const t = f.exif && f.exif.tags && f.exif.tags.DateTimeOriginal; if (t) { const d = t.slice(0, 10).replace(/:/g, '-'); if (d !== meta.fecha) { tstat = 'fail'; tdet.push(`EXIF de ${f.name}: ${d} ≠ fecha del vuelo ${meta.fecha}.`); } } });
  C.push(ck('tiempo', (nubes.length || fotos.length) ? tstat : 'idle', tdet.length ? tdet.join(' ') : (nubes.length || fotos.length) ? 'Fechas de LAS y EXIF compatibles con el vuelo declarado.' : 'Sin nube ni fotografías para contrastar.'));
  // solar
  const fx = fotos.find(f => f.exif && f.exif.lat != null && f.exif.tags.DateTimeOriginal);
  if (fx) { const t = fx.exif.tags.DateTimeOriginal.replace(/^(\d+):(\d+):(\d+) /, '$1-$2-$3T'); const d = new Date(t + '-06:00'); const el = sunElevation(d.getTime(), fx.exif.lat, fx.exif.lon); C.push(ck('solar', el > 5 ? 'ok' : el > 0 ? 'warn' : 'fail', `Elevación solar calculada ${el.toFixed(1)}° para ${fx.exif.tags.DateTimeOriginal} en (${fx.exif.lat.toFixed(4)}, ${fx.exif.lon.toFixed(4)}). ${el <= 0 ? 'El sol estaba bajo el horizonte: la hora o la fecha declaradas son imposibles.' : ''}`)); }
  else C.push(ck('solar', 'idle', 'Sin fotografías con EXIF/GPS para contrastar.'));
  // gnss
  const tr = infos.find(i => i.kind === 'trayectoria' && i.text);
  if (tr) { const rows = parseCsv(tr.text).map(r => ({ t: parseFloat(r.time ?? r.t ?? r.gpstime), lat: parseFloat(r.lat ?? r.latitude), lon: parseFloat(r.lon ?? r.longitude ?? r.lng), fix: r.fix ?? r.quality })).filter(r => !isNaN(r.lat) && !isNaN(r.lon)); let maxV = 0, jumps = 0; for (let i = 1; i < rows.length; i++) { const dt = (rows[i].t - rows[i - 1].t) || 1; const v = haversine([rows[i - 1].lon, rows[i - 1].lat], [rows[i].lon, rows[i].lat]) / Math.abs(dt); if (v > maxV) maxV = v; if (v > 40) jumps++; } const fixed = rows.filter(r => String(r.fix) === '1' || /fix|rtk|ppk/i.test(String(r.fix))).length; const fp = rows.length ? fixed / rows.length * 100 : 0; C.push(ck('gnss', jumps ? 'fail' : (rows.length && fp && fp < 95) ? 'warn' : rows.length ? 'ok' : 'warn', rows.length ? `${rows.length} épocas · velocidad máx. ${maxV.toFixed(1)} m/s · saltos > 40 m/s: ${jumps}${fp ? ` · solución fija ${fp.toFixed(1)} %` : ''}.` : 'No se pudo leer la trayectoria (se esperan columnas time, lat, lon).')); }
  else C.push(ck('gnss', 'idle', 'Sin archivo de trayectoria (CSV con time, lat, lon, fix).'));
  // cobertura / densidad / las
  const nb = nubes.find(n => n.las);
  if (nb && pred) {
    const L = nb.las, zone = pred.geometry.coordinates[0][0][0] < -102 ? 13 : 14; const ring = pred.geometry.coordinates[0].map(c => toUTM(c[0], c[1], zone)); const px = ring.map(p => p[0]), py = ring.map(p => p[1]); const pb = [Math.min(...px), Math.min(...py), Math.max(...px), Math.max(...py)]; const lb = [L.min[0], L.min[1], L.max[0], L.max[1]];
    const ix = Math.max(0, Math.min(pb[2], lb[2]) - Math.max(pb[0], lb[0])), iy = Math.max(0, Math.min(pb[3], lb[3]) - Math.max(pb[1], lb[1])); const cov = ix * iy / ((pb[2] - pb[0]) * (pb[3] - pb[1]) || 1); const cd = Math.hypot((pb[0] + pb[2]) / 2 - (lb[0] + lb[2]) / 2, (pb[1] + pb[3]) / 2 - (lb[1] + lb[3]) / 2);
    const sample = /SAMPLE/i.test(L.system);
    C.push(ck('cobertura', cd > 2000 ? 'fail' : cov >= .98 || sample ? 'ok' : cov >= .8 ? 'warn' : 'fail', `Cobertura del polígono ≈ ${(cov * 100).toFixed(1)} % (por caja envolvente); centroide de la nube a ${fmt(cd, 0)} m del predio.${sample ? ' Archivo de muestra recortada (40 × 40 m): la cobertura completa se evalúa con nubes reales.' : ''}${cd > 2000 ? ' La nube no corresponde a este predio.' : ''}`));
    const area = (lb[2] - lb[0]) * (lb[3] - lb[1]); const dens = L.count / (area || 1); const need = meta.densMin || 100; C.push(ck('densidad', dens >= need ? 'ok' : dens >= need * .6 ? 'warn' : 'fail', `Densidad media derivada del encabezado ≈ ${dens.toFixed(1)} pts/m² (mínimo ${need} para nivel B).`));
    const issues = []; if (!L.version.startsWith('1.')) issues.push('versión inusual'); if (!L.count) issues.push('conteo de puntos en cero'); if (!L.nVlr && !L.wkt) issues.push('sin CRS (VLR/WKT)'); if (L.nVlr === 0) issues.push('sin VLR de proyección'); if (L.version === '1.4' && L.pdrf < 6 && !nb.laz) issues.push('PDRF < 6 en LAS 1.4'); if (!L.created) issues.push('fecha de creación ausente');
    C.push(ck('las', issues.length ? 'warn' : 'ok', `LAS ${L.version} · PDRF ${L.pdrf} · ${fmt(L.count)} puntos · GUID ${L.guid} · software "${L.software}" · sistema "${L.system}"${issues.length ? '. Observaciones: ' + issues.join(', ') : ''}.`));
  } else { C.push(ck('cobertura', 'idle', 'Sin nube LAS/LAZ legible.')); C.push(ck('densidad', 'idle', 'Sin nube LAS/LAZ legible.')); C.push(ck('las', 'idle', 'Sin nube LAS/LAZ legible.')); }
  // control
  const cp = infos.find(i => i.kind === 'control' && i.text);
  if (cp) { const rows = parseCsv(cp.text); const dz = rows.map(r => parseFloat(r.dz ?? r.error_z ?? r.dz_cm)).filter(v => !isNaN(v)); const cm = rows.length && (cp.text.toLowerCase().includes('dz_cm')); const rmse = dz.length ? Math.sqrt(dz.reduce((a, v) => a + (cm ? v * v : (v * 100) ** 2), 0) / dz.length) : null; C.push(ck('control', rows.length < 30 ? 'warn' : rmse != null && rmse > 5 ? 'warn' : 'ok', `${rows.length} puntos de control${rmse != null ? ` · RMSE vertical ${rmse.toFixed(1)} cm` : ' (sin columna dz)'}${rows.length < 30 ? ' · se requieren al menos 30' : ''}.`)); }
  else C.push(ck('control', 'idle', 'Sin archivo de puntos de control (CSV con dz o dz_cm).'));
  // dup
  const known = []; S.estudios.forEach(e => e.files.forEach(f => known.push({ sha: f.sha, id: e.id, name: f.n }))); S.uploads.forEach(u => known.push({ sha: u.sha, id: u.study, name: u.name }));
  const dups = infos.filter(i => i.kind === 'nube' && known.find(k => k.sha === i.sha && k.id !== opts.selfId));
  const guids = nubes.filter(n => n.las).map(n => n.las.guid); const gd = S.uploads.find(u => u.guid && guids.includes(u.guid) && u.study !== opts.selfId);
  C.push(ck('dup', dups.length || gd ? 'fail' : nubes.length ? 'ok' : 'idle', dups.length ? `La nube ${dups[0].name} ya fue recibida en ${known.find(k => k.sha === dups[0].sha).id}.` : gd ? `El GUID de la nube ya existe en ${gd.study}.` : nubes.length ? 'Huella y GUID no coinciden con ninguna nube previa.' : 'Sin nube para comparar.'));
  return C;
}
export function verdict(checks) { const f = checks.filter(c => c.s === 'fail').length, w = checks.filter(c => c.s === 'warn').length, i = checks.filter(c => c.s === 'idle' && c.k !== 'firma').length; const ver = f ? 'Rechazado' : w ? 'Con observaciones' : i ? 'Pendiente' : 'Íntegro'; return { ver, f, w, i, ok: checks.filter(c => c.s === 'ok').length }; }
export const ICON = { ok: '✓', warn: '!', fail: '✕', idle: '·', run: '…' };
export function renderChecks(checks) { return checks.map(c => `<div class="chk"><span class="ic ${c.s}">${ICON[c.s]}</span><div><b>${esc(c.lab)}</b><small>${c.det}</small></div></div>`).join(''); }
export function verdictBox(v, id) { const k = { 'Íntegro': 'ok', 'Con observaciones': 'warn', 'Rechazado': 'fail', 'Pendiente': 'warn' }[v.ver]; const txt = { 'Íntegro': 'Levantamiento íntegro: aceptable para dictamen.', 'Con observaciones': 'Con observaciones: requiere aclaración del operador.', 'Rechazado': 'Rechazado: evidencia de alteración o incoherencia.', 'Pendiente': 'Verificación parcial: faltan archivos por cargar.' }[v.ver]; return `<div class="verdict ${k}"><div style="font-size:30px">${{ ok: '🛡', warn: '⚠', fail: '⛔' }[k]}</div><div><div class="big">${v.ver}</div><div class="tiny dim">${txt} ${v.ok} correctas · ${v.w} observaciones · ${v.f} fallas · ${v.i} pendientes</div></div></div>`; }
