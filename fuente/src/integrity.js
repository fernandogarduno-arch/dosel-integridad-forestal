// Integridad de levantamientos: SHA-256 incremental, lectores de encabezado LAS 1.x y EXIF/XMP, bitácora encadenada, posición solar.
import { fmt } from './util.js';

// ---------- SHA-256 incremental en JS puro (funciona con archivos grandes por fragmentos) ----------
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export class Sha256 {
  constructor() { this.h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]); this.buf = new Uint8Array(64); this.n = 0; this.len = 0; this.w = new Uint32Array(64); }
  block(b, o) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) { const a = w[i - 15], c = w[i - 2]; const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3), s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let a = h[0], b_ = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) { const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0, S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b_) ^ (a & c) ^ (b_ & c), t2 = (S0 + mj) | 0; hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b_; b_ = a; a = (t1 + t2) | 0; }
    h[0] += a; h[1] += b_; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  update(data) {
    let i = 0; const L = data.length; this.len += L;
    if (this.n) { while (i < L && this.n < 64) this.buf[this.n++] = data[i++]; if (this.n === 64) { this.block(this.buf, 0); this.n = 0; } }
    for (; i + 64 <= L; i += 64) this.block(data, i);
    while (i < L) this.buf[this.n++] = data[i++];
    return this;
  }
  hex() {
    const bits = this.len * 8, pad = new Uint8Array(((this.n < 56 ? 56 : 120) - this.n) + 8); pad[0] = 0x80; const hi = Math.floor(bits / 4294967296), lo = bits >>> 0; const p = pad.length;
    pad[p - 8] = hi >>> 24; pad[p - 7] = hi >>> 16; pad[p - 6] = hi >>> 8; pad[p - 5] = hi; pad[p - 4] = lo >>> 24; pad[p - 3] = lo >>> 16; pad[p - 2] = lo >>> 8; pad[p - 1] = lo;
    const keep = this.len; this.update(pad); this.len = keep; return [...this.h].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
}
export const sha256Str = s => new Sha256().update(new TextEncoder().encode(s)).hex();
export async function sha256File(file, onProgress) {
  const sh = new Sha256(), CH = 4 * 1024 * 1024; let off = 0;
  while (off < file.size) { const buf = new Uint8Array(await file.slice(off, off + CH).arrayBuffer()); sh.update(buf); off += CH; if (onProgress) onProgress(Math.min(1, off / file.size)); await new Promise(r => setTimeout(r)); }
  return sh.hex();
}
export const sha256Bytes = u8 => new Sha256().update(u8).hex();

// ---------- LAS 1.x ----------
export function parseLasHeader(buf) {
  const dv = new DataView(buf); if (buf.byteLength < 227 || dv.getUint32(0, false) !== 0x4C415346) return null;
  const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = dv.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const maj = dv.getUint8(24), min = dv.getUint8(25); const h = { version: maj + '.' + min, headerSize: dv.getUint16(94, true) };
  h.fileSourceId = dv.getUint16(4, true); h.globalEncoding = dv.getUint16(6, true);
  h.guid = [dv.getUint32(8, true).toString(16).padStart(8, '0'), dv.getUint16(12, true).toString(16).padStart(4, '0'), dv.getUint16(14, true).toString(16).padStart(4, '0'), [...new Uint8Array(buf, 16, 2)].map(x => x.toString(16).padStart(2, '0')).join(''), [...new Uint8Array(buf, 18, 6)].map(x => x.toString(16).padStart(2, '0')).join('')].join('-');
  h.system = str(26, 32); h.software = str(58, 32); const doy = dv.getUint16(90, true), yr = dv.getUint16(92, true); h.doy = doy; h.year = yr;
  if (yr > 1990 && doy > 0) { const d = new Date(Date.UTC(yr, 0, 1)); d.setUTCDate(doy); h.created = d.toISOString().slice(0, 10); }
  h.offsetPoints = dv.getUint32(96, true); h.nVlr = dv.getUint32(100, true); h.pdrf = dv.getUint8(104) & 0x3f; h.recLen = dv.getUint16(105, true); h.legacyCount = dv.getUint32(107, true);
  h.scale = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)]; h.offset = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)];
  h.max = [dv.getFloat64(179, true), dv.getFloat64(195, true), dv.getFloat64(211, true)]; h.min = [dv.getFloat64(187, true), dv.getFloat64(203, true), dv.getFloat64(219, true)];
  h.count = h.legacyCount; if (maj === 1 && min >= 4 && buf.byteLength >= 375) { h.count = Number(dv.getBigUint64(247, true)); h.nEvlr = dv.getUint32(243, true); }
  h.wkt = !!(h.globalEncoding & 16); h.gpsTimeType = (h.globalEncoding & 1) ? 'GPS Adjusted Standard' : 'GPS Week Time';
  return h;
}
// UTM directo (WGS84/ITRF08 equivalentes a este nivel)
export function toUTM(lon, lat, zone) {
  const a = 6378137, f = 1 / 298.257222101, k0 = .9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), r = Math.PI / 180; const lon0 = ((zone - 1) * 6 - 180 + 3) * r; const phi = lat * r, lam = lon * r;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720)); return [x, y];
}
// Genera un LAS 1.4 (PDRF 6) sintético de muestra: recorte de ~40x40 m en el centro del polígono, con VLR de CRS (WKT)
export function makeLas(ring, { n = 160000, created = new Date(), system = 'DEMO SAMPLE UAV', software = 'sample generator 0.1', flightDate = null, zone = 13 } = {}) {
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length; const kx = 111320 * Math.cos(cy * Math.PI / 180), ky = 110574, hw = 20;
  let seed = (Math.random() * 4294967295) >>> 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const [ux, uy] = toUTM(cx, cy, zone); const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n), R = new Uint8Array(n), I = new Uint8Array(n);
  let x0 = 1e12, y0 = 1e12, z0 = 1e12, x1 = -1e12, y1 = -1e12, z1 = -1e12;
  for (let i = 0; i < n; i++) { const x = ux + (rnd() - .5) * 2 * hw, y = uy + (rnd() - .5) * 2 * hw; const ground = 1980 + 3 * Math.sin(x * .15) + 2 * Math.cos(y * .12); const cano = rnd() < .72 ? rnd() * 18 : 0; const z = ground + cano; X[i] = x; Y[i] = y; Z[i] = z; R[i] = cano > 8 ? 5 : cano > 1 ? 4 : 2; I[i] = rnd() * 255; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const wkt = 'PROJCS["ITRF2008 / UTM zone ' + zone + 'N (muestra)",GEOGCS["ITRF2008"],PROJECTION["Transverse_Mercator"],UNIT["metre",1]]'; const vlrLen = 54 + wkt.length + 1;
  const HS = 375, OFF = HS + vlrLen, RL = 30, buf = new ArrayBuffer(OFF + n * RL), dv = new DataView(buf), u8 = new Uint8Array(buf);
  'LASF'.split('').forEach((c, i) => u8[i] = c.charCodeAt(0)); dv.setUint16(6, 1 | 16, true);
  for (let i = 0; i < 16; i++) u8[8 + i] = Math.floor(rnd() * 256); u8[24] = 1; u8[25] = 4;
  [...system].slice(0, 31).forEach((c, i) => u8[26 + i] = c.charCodeAt(0)); [...software].slice(0, 31).forEach((c, i) => u8[58 + i] = c.charCodeAt(0));
  const cd = created, ys = Date.UTC(cd.getUTCFullYear(), 0, 0); dv.setUint16(90, Math.floor((cd.getTime() - ys) / 86400000), true); dv.setUint16(92, cd.getUTCFullYear(), true);
  dv.setUint16(94, HS, true); dv.setUint32(96, OFF, true); dv.setUint32(100, 1, true); u8[104] = 6; dv.setUint16(105, RL, true);
  const sc = .01; [sc, sc, sc, x0, y0, z0].forEach((v, i) => dv.setFloat64(131 + 8 * i, v, true)); [x1, x0, y1, y0, z1, z0].forEach((v, i) => dv.setFloat64(179 + 8 * i, v, true)); dv.setBigUint64(247, BigInt(n), true);
  'LASF_Projection'.split('').forEach((c, i) => u8[HS + 2 + i] = c.charCodeAt(0)); dv.setUint16(HS + 18, 2112, true); dv.setUint16(HS + 20, wkt.length + 1, true); [...wkt].forEach((c, i) => u8[HS + 54 + i] = c.charCodeAt(0));
  const t0 = flightDate ? flightDate.getTime() / 1000 - 315964800 : 1.2e9;
  for (let i = 0; i < n; i++) { const o = OFF + i * RL; dv.setInt32(o, Math.round((X[i] - x0) / sc), true); dv.setInt32(o + 4, Math.round((Y[i] - y0) / sc), true); dv.setInt32(o + 8, Math.round((Z[i] - z0) / sc), true); dv.setUint16(o + 12, I[i] * 200, true); dv.setUint8(o + 14, 0x11); dv.setUint8(o + 16, R[i]); dv.setFloat64(o + 22, t0 + i * 0.0002, true); }
  return { blob: new Blob([buf], { type: 'application/octet-stream' }), bytes: u8 };
}

// ---------- EXIF / XMP (JPEG) ----------
export function parseExif(buf) {
  const dv = new DataView(buf); if (dv.getUint16(0) !== 0xFFD8) return null; let o = 2; const out = { tags: {}, gps: {}, xmp: {} }; let exifStart = -1, xmpStr = '';
  while (o < dv.byteLength - 4) { if (dv.getUint8(o) !== 0xFF) break; const mk = dv.getUint8(o + 1), len = dv.getUint16(o + 2); if (mk === 0xE1) { const hdr = String.fromCharCode(...new Uint8Array(buf, o + 4, 6)); if (hdr.startsWith('Exif')) exifStart = o + 10; else { const s = new TextDecoder().decode(new Uint8Array(buf, o + 4, Math.min(len - 2, 60000))); if (s.includes('xpacket') || s.includes('xmpmeta')) xmpStr = s; } } if (mk === 0xDA) break; o += 2 + len; }
  if (exifStart > 0) {
    const le = dv.getUint16(exifStart) === 0x4949; const g16 = p => dv.getUint16(p, le), g32 = p => dv.getUint32(p, le);
    const sz = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const val = (p, type, cnt) => { const bytes = (sz[type] || 1) * cnt; const vp = bytes > 4 ? exifStart + g32(p + 8) : p + 8;
      if (type === 2) { let s = ''; for (let i = 0; i < cnt - 1; i++) s += String.fromCharCode(dv.getUint8(vp + i)); return s.trim(); }
      if (type === 3) return cnt === 1 ? g16(vp) : [...Array(cnt)].map((_, i) => g16(vp + 2 * i));
      if (type === 4) return cnt === 1 ? g32(vp) : [...Array(cnt)].map((_, i) => g32(vp + 4 * i));
      if (type === 5) { const r = [...Array(cnt)].map((_, i) => g32(vp + 8 * i) / (g32(vp + 8 * i + 4) || 1)); return cnt === 1 ? r[0] : r; }
      return null; };
    const ifd = (p, target, names) => { const n = g16(p); for (let i = 0; i < n; i++) { const e = p + 2 + 12 * i, tag = g16(e), type = g16(e + 2), cnt = g32(e + 4); if (names[tag]) { try { target[names[tag]] = val(e, type, cnt); } catch (_) { } } if (tag === 0x8769) out._exifPtr = g32(e + 8); if (tag === 0x8825) out._gpsPtr = g32(e + 8); } };
    const N0 = { 0x010F: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x0132: 'DateTime' };
    const NE = { 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0xA431: 'BodySerialNumber', 0xA434: 'LensModel', 0x829A: 'ExposureTime', 0x920A: 'FocalLength' };
    const NG = { 1: 'LatRef', 2: 'Lat', 3: 'LonRef', 4: 'Lon', 5: 'AltRef', 6: 'Alt', 7: 'Time', 0x1D: 'Date' };
    try { const i0 = exifStart + g32(exifStart + 4); ifd(i0, out.tags, N0); if (out._exifPtr) ifd(exifStart + out._exifPtr, out.tags, NE); if (out._gpsPtr) ifd(exifStart + out._gpsPtr, out.gps, NG); } catch (e) { out.err = String(e); }
    const g = out.gps; const dms = a => Array.isArray(a) ? a[0] + a[1] / 60 + a[2] / 3600 : a; if (g.Lat && g.Lon) { out.lat = dms(g.Lat) * (g.LatRef === 'S' ? -1 : 1); out.lon = dms(g.Lon) * (g.LonRef === 'W' ? -1 : 1); }
  }
  if (xmpStr) { const m = k => { const r = new RegExp(k + '\\s*=\\s*"([^"]+)"', 'i').exec(xmpStr) || new RegExp('<[^>]*' + k + '[^>]*>([^<]+)<', 'i').exec(xmpStr); return r ? r[1] : null; }; ['AbsoluteAltitude', 'RelativeAltitude', 'GpsLatitude', 'GpsLongitude', 'FlightYawDegree', 'GimbalPitchDegree', 'CamReverse', 'DroneModel', 'SerialNumber', 'CreateDate'].forEach(k => { const v = m(k); if (v) out.xmp[k] = v; }); out.xmpDji = /drone-dji|dji\.com/i.test(xmpStr); }
  delete out._exifPtr; delete out._gpsPtr; return out;
}
// Elevación solar (NOAA simplificada), fecha UTC
export function sunElevation(dateUtc, lat, lon) {
  const rad = Math.PI / 180, d = dateUtc, jd = d / 86400000 + 2440587.5, n = jd - 2451545.0; const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad; const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; const eps = 23.439 * rad - 0.0000004 * n * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)); const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)); let gmst = (18.697374558 + 24.06570982441908 * n) % 24; if (gmst < 0) gmst += 24; const lst = (gmst * 15 + lon) * rad; const H = lst - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(H)) / rad;
}

// ---------- Bitácora encadenada ----------
const pl = (actor, acc, obj, ts, det) => `{"accion": ${JSON.stringify(acc)}, "actor": ${JSON.stringify(actor)}, ${det ? `"evidencia": ${JSON.stringify(det)}, ` : ''}"objeto": ${JSON.stringify(obj)}, "ts": ${JSON.stringify(ts)}}`;
export function ledgerHash(prev, e) { return sha256Str(prev + pl(e.actor, e.acc, e.obj, e.ts, e.det)); }
export function ledgerVerify(ledger) {
  let prev = '0'.repeat(64); for (const e of ledger) { if (e.prev !== prev) return { ok: false, seq: e.seq, why: 'El hash previo no coincide con el registro anterior' }; if (ledgerHash(prev, e) !== e.hash) return { ok: false, seq: e.seq, why: 'El contenido del registro no coincide con su huella' }; prev = e.hash; } return { ok: true, n: ledger.length, head: prev };
}
export function ledgerAppend(ledger, actor, acc, obj, det) {
  const prev = ledger.length ? ledger.at(-1).hash : '0'.repeat(64); const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z'); const e = { seq: ledger.length + 1, ts, actor, acc, obj, prev }; if (det) e.det = det; e.hash = ledgerHash(prev, e); ledger.push(e); return e;
}
export const shortHash = h => h ? h.slice(0, 10) + '…' + h.slice(-6) : '—';
