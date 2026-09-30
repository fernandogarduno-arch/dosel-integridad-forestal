// Generador de un paquete de levantamiento de PRUEBA (nube LAS, trayectoria, control, foto con EXIF, log) y simuladores de alteración
import { makeLas } from './integrity.js';

function buildTiff(o) {
  const enc = s => [...new TextEncoder().encode(s), 0]; const le = true; const parts = {};
  const make = enc(o.make), model = enc(o.model), dt = enc(o.dt), dto = enc(o.dt), ser = enc(o.serial);
  const HD = 8, I0 = HD, I0n = 5, IE = I0 + 2 + I0n * 12 + 4, IEn = 2, IG = IE + 2 + IEn * 12 + 4, IGn = 4, D0 = IG + 2 + IGn * 12 + 4;
  let off = D0; const offs = {}; const alloc = (k, n) => { offs[k] = off; off += n; };
  alloc('make', make.length); alloc('model', model.length); alloc('dt', dt.length); alloc('dto', dto.length); alloc('ser', ser.length); alloc('lat', 24); alloc('lon', 24);
  const buf = new ArrayBuffer(off), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint16(0, 0x4949, false); dv.setUint16(2, 42, le); dv.setUint32(4, 8, le);
  const entry = (p, i, tag, type, cnt, val) => { const e = p + 2 + i * 12; dv.setUint16(e, tag, le); dv.setUint16(e + 2, type, le); dv.setUint32(e + 4, cnt, le); dv.setUint32(e + 8, val, le); };
  const put = (k, arr) => arr.forEach((b, i) => u8[offs[k] + i] = b);
  dv.setUint16(I0, I0n, le); entry(I0, 0, 0x010F, 2, make.length, offs.make); entry(I0, 1, 0x0110, 2, model.length, offs.model); entry(I0, 2, 0x0132, 2, dt.length, offs.dt); entry(I0, 3, 0x8769, 4, 1, IE); entry(I0, 4, 0x8825, 4, 1, IG); dv.setUint32(I0 + 2 + I0n * 12, 0, le);
  dv.setUint16(IE, IEn, le); entry(IE, 0, 0x9003, 2, dto.length, offs.dto); entry(IE, 1, 0xA431, 2, ser.length, offs.ser);
  dv.setUint16(IG, IGn, le); entry(IG, 0, 1, 2, 2, 0); u8[IG + 2 + 8] = o.lat < 0 ? 83 : 78; entry(IG, 1, 2, 5, 3, offs.lat); entry(IG, 2, 3, 2, 2, 0); u8[IG + 2 + 2 * 12 + 8] = o.lon < 0 ? 87 : 69; entry(IG, 3, 4, 5, 3, offs.lon);
  put('make', make); put('model', model); put('dt', dt); put('dto', dto); put('ser', ser);
  const rat = (k, v) => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60; [[d, 1], [m, 1], [Math.round(s * 10000), 10000]].forEach(([n, dn], i) => { dv.setUint32(offs[k] + i * 8, n, le); dv.setUint32(offs[k] + i * 8 + 4, dn, le); }); };
  rat('lat', o.lat); rat('lon', o.lon); return u8;
}
export async function makeExifJpeg(o) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; const c = cv.getContext('2d'); c.fillStyle = '#2b5a34'; c.fillRect(0, 0, 320, 240); for (let i = 0; i < 400; i++) { c.fillStyle = ['#376b3f', '#1f4a2c', '#4a8a52'][i % 3]; c.beginPath(); c.arc(Math.random() * 320, Math.random() * 240, 4 + Math.random() * 8, 0, 6.3); c.fill(); }
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .8)); const src = new Uint8Array(await blob.arrayBuffer()); const tiff = buildTiff(o); const hdr = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]); const len = 2 + hdr.length + tiff.length;
  const out = new Uint8Array(2 + 2 + 2 + hdr.length + tiff.length + src.length - 2); out.set(src.subarray(0, 2), 0); out[2] = 0xFF; out[3] = 0xE1; out[4] = len >> 8; out[5] = len & 255; out.set(hdr, 6); out.set(tiff, 6 + hdr.length); out.set(src.subarray(2), 6 + hdr.length + tiff.length); return out;
}
// Devuelve File[] y metadatos declarados coherentes
export async function makeSamplePackage(feature, id, fecha = '2026-09-12') {
  const ring = feature.geometry.coordinates[0]; const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]); const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; const cy = (b[1] + b[3]) / 2, cx = (b[0] + b[2]) / 2;
  const zone = cx < -102 ? 13 : 14; const flight = new Date(fecha + 'T17:30:00Z'); const created = new Date(fecha + 'T00:00:00Z'); created.setUTCDate(created.getUTCDate() + 1);
  const las = makeLas(ring, { created, flightDate: flight, zone }); const files = [new File([las.blob], id + '_nube.las')];
  const rows = ['time,lat,lon,alt,fix']; const N = 8; let t = 0; for (let k = 0; k < N; k++) { const lon = b[0] + (b[2] - b[0]) * k / (N - 1); for (let j = 0; j <= 40; j++) { const lat = k % 2 ? b[3] - (b[3] - b[1]) * j / 40 : b[1] + (b[3] - b[1]) * j / 40; rows.push([1.2e9 + t++ * 1, lat.toFixed(7), lon.toFixed(7), (2080 + Math.sin(j / 5)).toFixed(2), j % 41 === 20 ? 'FLOAT' : 'RTK'].join(',')); } }
  files.push(new File([rows.join('\n')], id + '_trayectoria.csv'));
  const cr = ['id,x,y,z,dz_cm']; for (let i = 0; i < 34; i++) cr.push([`GCP${i + 1}`, (500000 + i * 13).toFixed(2), (2148000 + i * 9).toFixed(2), (1990 + i * .3).toFixed(3), ((Math.sin(i * 2.1)) * 3.4).toFixed(1)].join(',')); files.push(new File([cr.join('\n')], id + '_control.csv'));
  files.push(new File([`Registro de vuelo (muestra)\nfecha=${fecha}\ninicio=17:30:12Z\nfin=18:41:50Z\naeronave=DJI Matrice 350 RTK\nbase=RTK red estatal\n`], id + '_log_vuelo.txt'));
  const jpg = await makeExifJpeg({ make: 'DJI', model: 'Zenmuse L2', dt: fecha.replace(/-/g, ':') + ' 11:42:07', serial: 'SNDEMO0001', lat: cy, lon: cx }); files.push(new File([jpg], id + '_IMG_0001.jpg', { type: 'image/jpeg' }));
  return { files, meta: { fecha, autoriz: 'INEGI/DGG/2026/4471', aeroModelo: 'DJI Matrice 350 RTK', aeroSerie: '1ZNDEMO000001', sensorModelo: 'Zenmuse L2', sensorSerie: 'SNDEMO0001' } };
}
// Alteraciones para demostrar detección
export async function tamper(files, what) {
  const out = [];
  for (const f of files) {
    if (what === 'nube' && /\.las$/i.test(f.name)) { const u = new Uint8Array(await f.arrayBuffer()); u[40000] ^= 0x01; out.push(new File([u], f.name)); }
    else if (what === 'foto' && /\.jpe?g$/i.test(f.name)) { const u = new Uint8Array(await f.arrayBuffer()); const s = new TextDecoder('latin1').decode(u); const i = s.indexOf(' 11:42:07'); const from = ' 11:42:07', to = ' 03:10:07'; const idx = []; let k = -1; while ((k = s.indexOf(from, k + 1)) >= 0) idx.push(k); idx.forEach(p => { for (let j = 0; j < to.length; j++) u[p + j] = to.charCodeAt(j); }); out.push(new File([u], f.name, { type: 'image/jpeg' })); }
    else if (what === 'traj' && /trayectoria/i.test(f.name)) { const L = (await f.text()).split('\n'); const m = Math.floor(L.length / 2); const c = L[m].split(','); c[1] = (parseFloat(c[1]) + 0.004).toFixed(7); L[m] = c.join(','); out.push(new File([L.join('\n')], f.name)); }
    else out.push(f);
  }
  return out;
}
