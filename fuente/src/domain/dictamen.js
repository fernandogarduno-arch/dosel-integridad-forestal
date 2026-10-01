// Dictamen como acto formal y expediente descargable reproducible.
import { S, munName } from '../state.js';
import { esc, fmt } from '../util.js';
import { sha256Str, sha256Bytes, ledgerAppend } from '../integrity.js';
import { MET, PARAMS, ESTADOS, hById, dating, cortes, fires, spiSeries, sequia, coiCheck, pOf, ringOf, todayIso, maskRfc } from './core.js';
import { zip } from './zip.js';
import { evidence, imgsAround } from './gf.js';

export const lang = () => S.lang || 'es';
export const t = (es, en) => (lang() === 'en' ? en : es);
const EV = { cumple: ['Cumple', 'Compliant'], incumple: ['No cumple', 'Non-compliant'], indeterminado: ['Indeterminado', 'Undetermined'] };
export const evTxt = (k, l = lang()) => EV[k][l === 'en' ? 1 : 0];
export const EST_EN = { 'Libre': 'Clear', 'En revisión': 'Under review', 'Con alerta': 'Flagged', 'Bloqueado': 'Blocked', 'En restauración': 'Under restoration', 'Rehabilitado': 'Rehabilitated' };

S.dictamenes = S.dictamenes || [];
let seq = 1200;
const nowZ = () => new Date().toISOString().replace(/\.\d+Z/, 'Z');
export function cert(uid) { return { serie: '00001000000' + sha256Str('CERT' + uid).replace(/\D/g, '').slice(0, 9), emisor: 'SAT (e.firma) — simulada en la demostración' }; }

export function payloadFor(h, tipo, actor, corteDatos, ts) {
  const p = pOf(h), d = dating(h), c = cortes(h); const fs = fires(h);
  const y = d.brk ? d.brk.y : 2026; const sq = sequia(h, Math.min(2026, y));
  return {
    folio: null, tipo, metodologia: `${MET.id} v${MET.ver}`, fecha_corte_datos: corteDatos, emitido: ts,
    huerta: { uid: h.uid, clave_senasica: h.senasica, clave_catastral: h.catastral, nucleo_agrario: h.ran, titular_rfc_enmascarado: maskRfc(h.rfc), municipio: munName[h.mun], cultivo: h.cul, superficie_ha: p.ha },
    resultado: {
      ruptura: d.brk ? { anio: d.brk.y, magnitud_pp: d.brk.mag, cobertura_antes: d.brk.antes, cobertura_despues: d.brk.despues } : null,
      ventana_conversion: d.win, corte_estatal: { fecha: PARAMS.corteEstatal.fecha, evaluacion: c.estatal }, corte_federal: { fecha: PARAMS.corteFederal.fecha, evaluacion: c.federal },
      criterio_incendio: c.fuego ? { fecha: c.fuego.fecha, dnbr: c.fuego.dnbr } : null, regla_conciliacion: c.regla, evaluacion_aplicable: c.aplica,
      sequia: { spi: sq.spi, delta_altura_dosel_m: sq.dh, lectura: sq.txt }, estado_legal_resultante: h.estado,
    },
    evidencias: { guardian_forestal: (() => { const e = evidence(ringOf(h)); const im = imgsAround(e.imgs, d.win); return { consulta: '2026-09-30', en_muestra: e.muestra, alertas_2018_2024: e.alertas.reduce((a, b) => a + b, 0), alertas_2026: e.ev.length, incendios_conafor: e.fires.length, anp: e.anp ? e.anp.name : null, nucleo_agrario: e.ran ? e.ran.name : null, imagen_antes: im.antes, imagen_despues: im.despues }; })(), escenas_anuales: d.scenes.length, observaciones_densas: d.dense.length, focos_incendio: fs.length, script: 'reproducir.py (MET-VD-BRK v1)' },
    dictaminador: actor, demo: true,
  };
}
export function emitir(h, user, tipo = 'Dictamen de elegibilidad', o = {}) {
  if (user.rol !== 'dictamen') return { ok: false, why: 'Sólo un Dictaminador puede emitir dictámenes' };
  const c = coiCheck(user, h); if (!c.ok) return c;
  const det = S.cases && S.cases.find(k => k.uid === h.uid && k.steps.some(s => s.k === 'revision'));
  if (det && det.steps.find(s => s.k === 'revision').actor === user.id) return { ok: false, why: 'Quien detectó no puede dictaminar' };
  const ts = o.ts || nowZ(); const pay = payloadFor(h, tipo, user.id, o.corte || todayIso(), ts); pay.folio = `DIC-2026-${String(++seq).padStart(6, '0')}`;
  const js = JSON.stringify(pay); const hash = sha256Str(js); const ce = cert(user.id);
  const dic = { folio: pay.folio, uid: h.uid, tipo, ts, actor: user.id, pay, js, hash, firma: { cert: ce.serie, emisor: ce.emisor, valor: sha256Str('FIRMA-SIMULADA|' + ce.serie + '|' + hash), simulada: true }, nom151: { psc: 'PSC acreditado (simulado)', ts, constancia: sha256Str('NOM151-SIMULADA|' + ts + '|' + hash), simulada: true } };
  const d0 = dating(h); dic.snap = { pts: d0.pts, scenes: d0.scenes, dense: d0.dense, fires: fires(h), spi: spiSeries(h.mun), params: { metodologia: MET.id + ' v' + MET.ver, umbral_ruptura: PARAMS.umbralRuptura, corte_estatal: PARAMS.corteEstatal.fecha, corte_federal: PARAMS.corteFederal.fecha, corte_fuego: PARAMS.corteFuego.fecha, ventana_fuego_anios: PARAMS.ventanaFuegoAnios, conciliacion: PARAMS.conciliacion }, ring: ringOf(h) };
  S.dictamenes.unshift(dic); if (!o.seed) ledgerAppend(S.ledger, user.id, 'DICTAMEN_EMITIDO', dic.folio, hash); return { ok: true, dic };
}
export function verificarDictamen(dic) { const h = sha256Str(dic.js); return { hash: h === dic.hash, firma: dic.firma.valor === sha256Str('FIRMA-SIMULADA|' + dic.firma.cert + '|' + h), sello: dic.nom151.constancia === sha256Str('NOM151-SIMULADA|' + dic.nom151.ts + '|' + h) }; }

// ---------- Documento (HTML imprimible; público = sin identidad del dictaminador) ----------
export function docHTML(dic, { publico = false, bil = true } = {}) {
  const P = dic.pay, R = P.resultado; const b = (es, en) => bil ? `${es}<span class="en"> · ${en}</span>` : es;
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${dic.folio}</title><style>body{font:13px/1.5 Georgia,serif;color:#111;max-width:780px;margin:30px auto;padding:0 24px}h1{font-size:19px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 7px;text-align:left;vertical-align:top}th{width:38%;background:#f3f3f3;font-weight:600}.en{color:#555;font-style:italic}.m{font-family:ui-monospace,Menlo,monospace;font-size:11px;word-break:break-all}.demo{border:2px solid #b45309;color:#b45309;padding:6px 10px;margin:10px 0;font-weight:700}</style></head><body>
  <div class="demo">DOCUMENTO DE DEMOSTRACIÓN — datos, firma y sello simulados; sin validez jurídica · DEMO DOCUMENT — simulated data, signature and timestamp</div>
  <p>Gobierno del Estado · Módulo de Verificación y Dictamen Forestal</p><h1>${b(esc(dic.tipo), dic.tipo === 'Dictamen de elegibilidad' ? 'Eligibility determination' : 'Land-use conversion determination')}</h1>
  <table style="margin-top:10px">${row(b('Folio', 'Reference'), `<span class="m">${dic.folio}</span>`)}${row(b('Fecha de emisión', 'Issued'), dic.ts)}${row(b('Fecha de corte de datos', 'Data cut-off'), P.fecha_corte_datos)}${row(b('Metodología', 'Methodology'), P.metodologia)}</table>
  <h2>${b('Huerta', 'Orchard')}</h2><table>${row('UID', `<span class="m">${P.huerta.uid}</span>`)}${row(b('Clave SENASICA', 'SENASICA ID'), P.huerta.clave_senasica || '—')}${row(b('Clave catastral', 'Cadastral ID'), P.huerta.clave_catastral)}${row(b('Núcleo agrario (RAN)', 'Agrarian unit (RAN)'), P.huerta.nucleo_agrario || '—')}${publico ? '' : row(b('Titular (RFC enmascarado)', 'Holder (masked tax ID)'), P.huerta.titular_rfc_enmascarado)}${row(b('Municipio', 'Municipality'), esc(P.huerta.municipio))}${row(b('Cultivo · superficie', 'Crop · area'), `${esc(P.huerta.cultivo)} · ${fmt(P.huerta.superficie_ha, 2)} ha`)}</table>
  <h2>${b('Resultado técnico', 'Technical finding')}</h2><table>
  ${row(b('Ruptura de cobertura arbórea', 'Tree-cover break'), R.ruptura ? `${R.ruptura.anio} · −${R.ruptura.magnitud_pp} pp (${R.ruptura.cobertura_antes} % → ${R.ruptura.cobertura_despues} %)` : b('No detectada 1993–2026', 'None detected 1993–2026'))}
  ${row(b('Ventana de conversión', 'Conversion window'), R.ventana_conversion ? `${R.ventana_conversion.ini} → ${R.ventana_conversion.fin} (${esc(R.ventana_conversion.fuente)})` : '—')}
  ${row(b(`Corte estatal (${R.corte_estatal.fecha})`, `State cut-off (${R.corte_estatal.fecha})`), b(evTxt(R.corte_estatal.evaluacion, 'es'), evTxt(R.corte_estatal.evaluacion, 'en')))}
  ${row(b(`Corte federal (${R.corte_federal.fecha})`, `Federal cut-off (${R.corte_federal.fecha})`), b(evTxt(R.corte_federal.evaluacion, 'es'), evTxt(R.corte_federal.evaluacion, 'en')))}
  ${row(b('Criterio de incendio (2012)', 'Fire criterion (2012)'), R.criterio_incendio ? `${R.criterio_incendio.fecha} · dNBR ${R.criterio_incendio.dnbr}` : b('Sin incendio seguido de conversión', 'No fire followed by conversion'))}
  ${row(b('Regla de conciliación', 'Reconciliation rule'), esc(R.regla_conciliacion))}
  ${row(b('Evaluación aplicable', 'Applicable finding'), `<b>${b(evTxt(R.evaluacion_aplicable, 'es'), evTxt(R.evaluacion_aplicable, 'en'))}</b>`)}
  ${row(b('Sequía (CHIRPS/SPI) y dosel', 'Drought (CHIRPS/SPI) and canopy'), `SPI ${R.sequia.spi} · Δ altura ${R.sequia.delta_altura_dosel_m} m — ${esc(R.sequia.lectura)}`)}
  ${row(b('Estado legal resultante', 'Resulting legal status'), b(esc(R.estado_legal_resultante), EST_EN[R.estado_legal_resultante]))}</table>
  <h2>${b('Evidencia y reproducibilidad', 'Evidence and reproducibility')}</h2><p>${b(`Escenas anuales: ${P.evidencias.escenas_anuales}; observaciones densas: ${P.evidencias.observaciones_densas}; focos de incendio: ${P.evidencias.focos_incendio}. El expediente incluye los identificadores de escena, la huella SHA-256 de cada archivo y el script que reproduce el resultado.`, `The case file lists scene IDs, SHA-256 of each file and the script that reproduces this finding.`)}</p>
  <h2>${b('Evidencia de Guardián Forestal', 'Guardián Forestal evidence')}</h2><table>${(() => { const g = P.evidencias.guardian_forestal || {}; return row(b('Alertas 2018-2024 en el entorno', 'Alerts 2018-2024 nearby'), g.en_muestra ? fmt(g.alertas_2018_2024) : b('Fuera de la muestra', 'Outside sample')) + row(b('Incendios CONAFOR', 'CONAFOR fires'), g.en_muestra ? fmt(g.incendios_conafor) : '—') + row(b('Área natural protegida', 'Protected area'), g.anp ? esc(g.anp) : '—') + row(b('Núcleo agrario', 'Agrarian unit'), g.nucleo_agrario ? esc(g.nucleo_agrario) : '—') + row(b('Imagen anterior / posterior', 'Image before / after'), `${g.imagen_antes || '—'} / ${g.imagen_despues || '—'}`); })()}</table>
  <h2>${b('Fundamento y garantías', 'Legal basis and due process')}</h2><p>${b('Fundamento jurídico: conforme al instrumento aplicable (a definir por la Dirección Jurídica). Contra este dictamen procede recurso de revisión ante un área distinta de la que dictaminó, dentro de ' + PARAMS.plazoRecursoDH + ' días hábiles.', 'An appeal may be lodged with a separate review unit within ' + PARAMS.plazoRecursoDH + ' business days.')}</p>
  <h2>${b('Firma y sello de tiempo', 'Signature and timestamp')}</h2><table>
  ${row(b('Huella del dictamen (SHA-256)', 'Determination hash (SHA-256)'), `<span class="m">${dic.hash}</span>`)}
  ${row(b('Firmante', 'Signed by'), publico ? b('Servidor público facultado (identidad resguardada; verificable por autoridad con convenio)', 'Authorized official (identity withheld; verifiable by authorities under agreement)') : `${esc(dic.actor)} · cert. ${dic.firma.cert}`)}
  ${row(b('Firma electrónica (simulada)', 'e-signature (simulated)'), `<span class="m">${dic.firma.valor}</span>`)}
  ${row(b('Constancia NOM-151 (simulada)', 'NOM-151 timestamp (simulated)'), `<span class="m">${dic.nom151.constancia}</span> · ${dic.nom151.ts}`)}</table></body></html>`;
}

// ---------- Expediente reproducible ----------
export const REPRO = `#!/usr/bin/env python3
# reproducir.py — MET-VD-BRK v1. Reproduce el fechado de conversión y la evaluación de cortes
# a partir de los archivos del expediente. Uso: python3 reproducir.py  (Python 3.8+, sin dependencias)
import csv, json, hashlib, sys, os
D = os.path.dirname(os.path.abspath(__file__))
def rd(n):
    with open(os.path.join(D, n), newline='', encoding='utf-8') as f: return list(csv.DictReader(f))
P = json.load(open(os.path.join(D, 'parametros.json'), encoding='utf-8'))
# 1) integridad de los archivos
bad = []
for line in open(os.path.join(D, 'MANIFEST.sha256'), encoding='utf-8'):
    h, n = line.strip().split('  ', 1)
    if hashlib.sha256(open(os.path.join(D, n), 'rb').read()).hexdigest() != h: bad.append(n)
print('Integridad de archivos:', 'OK' if not bad else 'ALTERADOS: ' + ', '.join(bad))
# 2) ruptura en la serie anual
pts = [(int(r['anio']), float(r['cobertura_pct'])) for r in rd('serie_cobertura.csv')]
best = None
for k in range(2, len(pts)):
    a, b = pts[:k], pts[k:]
    d = sum(v for _, v in a) / len(a) - sum(v for _, v in b) / len(b)
    if best is None or d > best[1]: best = (k, d)
brk = None
if best and best[1] >= P['umbral_ruptura']:
    k = best[0]; brk = {'anio': pts[k][0], 'anio_previo': pts[k - 1][0], 'magnitud_pp': float(f"{best[1]:.1f}")}
win = None
if brk:
    win = {'ini': f"{brk['anio_previo']}-01-01", 'fin': f"{brk['anio']}-05-31"}
    dense = rd('observaciones_densas.csv') if brk['anio'] >= 2017 else []
    i = next((j for j, r in enumerate(dense) if r['bosque'] == '0'), -1)
    if i > 0: win = {'ini': dense[i - 1]['fecha'], 'fin': dense[i]['fecha']}
def corte(f):
    if not win: return 'cumple'
    if win['ini'] >= f: return 'incumple'
    if win['fin'] < f: return 'cumple'
    return 'indeterminado'
e, fe = corte(P['corte_estatal']), corte(P['corte_federal'])
R = {'cumple': 0, 'indeterminado': 1, 'incumple': 2}
ap = e if P['conciliacion'] == 'estatal' else fe if P['conciliacion'] == 'federal' else (e if R[e] >= R[fe] else fe)
fuego = None
if brk:
    for r in rd('incendios.csv'):
        y = int(r['fecha'][:4])
        if r['fecha'] >= P['corte_fuego'] and float(r['dnbr']) >= 0.27 and y <= brk['anio'] and brk['anio'] - y <= P['ventana_fuego_anios']: fuego = r['fecha']; break
if fuego: ap = 'incumple'
out = {'ruptura': brk, 'ventana': win, 'corte_estatal': e, 'corte_federal': fe, 'incendio': fuego, 'aplicable': ap}
print(json.dumps(out, ensure_ascii=False, indent=1))
# 3) comparación con el dictamen
dic = json.load(open(os.path.join(D, 'dictamen.json'), encoding='utf-8'))['payload']['resultado']
same = (dic['evaluacion_aplicable'] == ap and dic['corte_estatal']['evaluacion'] == e and dic['corte_federal']['evaluacion'] == fe
        and (dic['ruptura'] or {}).get('anio') == (brk or {}).get('anio') and (dic['ventana_conversion'] or {}).get('ini') == (win or {}).get('ini'))
print('Resultado reproducido:', 'COINCIDE con el dictamen' if same and not bad else 'NO COINCIDE')
sys.exit(0 if same and not bad else 1)
`;
const csvOf = (rows) => { const k = Object.keys(rows[0] || { vacio: '' }); return k.join(',') + '\n' + rows.map(r => k.map(x => { const v = r[x] ?? ''; return /[,"\n]/.test(String(v)) ? JSON.stringify(String(v)) : v; }).join(',')).join('\n') + '\n'; };
export function expedienteFiles(dic, { publico = false } = {}) {
  const h = hById[dic.uid], d = dic.snap, fs = d.fires;
  const enc = new TextEncoder();
  const files = [
    { name: 'LEEME.txt', data: `Expediente ${dic.folio} · huerta ${h.uid}\nDEMOSTRACIÓN: datos, identificadores de escena, firma y sello son sintéticos.\n\nContenido:\n- dictamen_canonico.json: texto exacto firmado (su SHA-256 es la huella del dictamen)
- dictamen.json / dictamen.html: acto técnico con huella SHA-256, firma y constancia NOM-151 (simuladas)\n- huerta.geojson: polígono\n- serie_cobertura.csv: serie anual de cobertura arbórea con identificador de escena\n- observaciones_densas.csv: observaciones Sentinel-2/Landsat alrededor de la conversión\n- incendios.csv: focos FIRMS y severidad dNBR\n- lluvia_spi.csv: índice de precipitación estandarizado (CHIRPS)\n- parametros.json: parámetros de la metodología ${MET.id} v${MET.ver}\n- reproducir.py: recalcula el resultado y lo compara con el dictamen\n- MANIFEST.sha256: huella de cada archivo\n\nVerificación: python3 reproducir.py\n\nCase file (EN): run python3 reproducir.py to recompute the finding and verify file integrity.\n` },
    { name: 'dictamen.json', data: JSON.stringify({ payload: dic.pay, sha256: dic.hash, firma: publico ? { valor: dic.firma.valor, simulada: true } : dic.firma, nom151: dic.nom151 }, null, 1) },
    { name: 'dictamen_canonico.json', data: dic.js },
    { name: 'dictamen.html', data: docHTML(dic, { publico }) },
    { name: 'huerta.geojson', data: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { uid: h.uid, municipio: munName[h.mun], cultivo: h.cul, estado_legal: h.estado }, geometry: { type: 'Polygon', coordinates: [d.ring] } }] }) },
    { name: 'serie_cobertura.csv', data: csvOf(d.pts.map(([y, v], i) => ({ anio: y, cobertura_pct: v.toFixed(1), sensor: d.scenes[i] ? d.scenes[i].sensor : '', escena: d.scenes[i] ? d.scenes[i].id : '' }))) },
    { name: 'observaciones_densas.csv', data: 'fecha,bosque,escena\n' + d.dense.map(o => `${o.fecha},${o.bosque},${o.id}`).join('\n') + (d.dense.length ? '\n' : '') },
    { name: 'incendios.csv', data: 'fecha,sensor,frp_mw,confianza,dnbr\n' + fs.map(f => `${f.fecha},${f.sensor},${f.frp},${f.conf},${f.dnbr}`).join('\n') + (fs.length ? '\n' : '') },
    { name: 'lluvia_spi.csv', data: 'anio,spi\n' + d.spi.map(x => x.join(',')).join('\n') + '\n' },
    { name: 'parametros.json', data: JSON.stringify(d.params, null, 1) },
    { name: 'reproducir.py', data: REPRO },
  ];
  const man = files.map(f => `${sha256Bytes(enc.encode(f.data))}  ${f.name}`).join('\n') + '\n';
  files.push({ name: 'MANIFEST.sha256', data: man });
  return files;
}
export const expedienteZip = (dic, o) => zip(expedienteFiles(dic, o));
