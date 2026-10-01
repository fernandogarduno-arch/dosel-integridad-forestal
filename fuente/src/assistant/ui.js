// Interfaz de Arbolín: botón flotante, panel de conversación, selector de punto en mapa, fotos y acuse.
import { $, esc, download, toast } from '../util.js';
import { modal } from '../ui.js';
import { S, P, munName } from '../state.js';
import { createMap, attachControls } from '../mapkit.js';
import { mx, my, unx, uny } from '../map.js';
import { sha256Bytes, parseExif } from '../integrity.js';
import { arbolinSvg } from './icon.js';
import { saludo, responderLocal, Formulario, emergencia, tipoParticipacion, esPregunta, contextoLLM, datosTurno, marcadores, visible, VISTAS, infoFolio, INICIO_CHIPS } from './engine.js';
import { detectar, preguntar, proveedor } from './llm.js';
import { nrm, TIPOS, PRECISION, bboxMunicipio, municipioEn, enmascarar } from '../domain/participa.js';

const st = { open: false, flow: null, expect: null, hist: [], busy: false, ctl: null, last: null, mounted: false, hinted: false };
let el = {};

// ---------- markdown mínimo y seguro ----------
function md(s) {
  let h = esc(s || '');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_(.+?)_(?=[\s.,;:)!?]|$)/g, '$1<i>$2</i>').replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s.,;:)!?]|$)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  return h.split('\n').map(l => { const m = l.match(/^\s*(?:[•\-*]|(\d+)\.)\s+(.*)$/); if (m) return `<div class="arb-li"><span>${m[1] ? m[1] + '.' : '•'}</span><span>${m[2]}</span></div>`; const hd = l.match(/^#{1,4}\s+(.*)$/); if (hd) return `<b>${hd[1]}</b>`; return l ? `<p>${l}</p>` : '<p class="sp"></p>'; }).join('');
}
const time = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

// ---------- montaje ----------
export function montarArbolin() {
  if (st.mounted) return; st.mounted = true;
  const fab = document.createElement('button'); fab.id = 'arb-fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Abrir a Arbolín, asistente ciudadano'); fab.innerHTML = `${arbolinSvg(58, { cls: 'blink' })}<span class="arb-fab-l">Arbolín</span>`;
  const hint = document.createElement('div'); hint.id = 'arb-hint'; hint.setAttribute('role', 'status'); hint.innerHTML = `<b>¡Hola! Soy Arbolín.</b> ¿Dudas sobre el bosque de tu municipio, o algo que quieras reportar o proponer?<button aria-label="Cerrar aviso">✕</button>`;
  const pn = document.createElement('section'); pn.id = 'arb'; pn.className = 'arb'; pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-label', 'Arbolín, asistente ciudadano'); pn.hidden = true;
  pn.innerHTML = `<header class="arb-h">${arbolinSvg(40, { cls: 'blink' })}<div class="arb-t"><b>Arbolín</b><small>Asistente ciudadano · <span id="arb-mode" class="arb-mode" title="">…</span></small></div><button class="arb-ib" id="arb-new" title="Nueva conversación" aria-label="Nueva conversación">↺</button><button class="arb-ib" id="arb-x" title="Cerrar" aria-label="Cerrar">✕</button></header>
    <div class="arb-log" id="arb-log" aria-live="polite"></div>
    <form class="arb-in" id="arb-f"><button type="button" class="arb-ib arb-att" id="arb-att" title="Adjuntar foto (sólo al registrar una denuncia)" aria-label="Adjuntar foto">📎</button><textarea id="arb-q" rows="1" placeholder="Escribe tu pregunta…" aria-label="Mensaje para Arbolín" maxlength="1500"></textarea><button class="arb-send" id="arb-send" aria-label="Enviar">➤</button></form>
    <div class="arb-foot">Arbolín puede equivocarse. No compartas datos de otras personas. Emergencias: <b>911</b>.</div>
    <input type="file" id="arb-file" accept="image/jpeg,image/png,image/heic,image/webp" hidden>`;
  document.body.append(fab, hint, pn); document.body.classList.add('has-arb');
  el = { fab, hint, pn, log: $('#arb-log', pn), q: $('#arb-q', pn), f: $('#arb-f', pn), file: $('#arb-file', pn), mode: $('#arb-mode', pn), att: $('#arb-att', pn) };
  fab.onclick = () => abrir(); $('#arb-x', pn).onclick = cerrar; $('#arb-new', pn).onclick = reiniciar;
  hint.querySelector('button').onclick = e => { e.stopPropagation(); hint.classList.remove('on'); }; hint.onclick = () => abrir();
  el.f.addEventListener('submit', e => { e.preventDefault(); const v = el.q.value.trim(); if (!v || st.busy) return; el.q.value = ''; autoGrow(); enviar(v); });
  el.q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.f.requestSubmit(); } });
  el.q.addEventListener('input', autoGrow);
  pn.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
  el.att.onclick = () => { if (st.flow && st.flow.siguiente() === 'fotos') el.file.click(); else toast('Las fotos se adjuntan al registrar una denuncia', 'warn'); };
  el.file.onchange = () => { const f = el.file.files[0]; el.file.value = ''; if (f) foto(f); };
  pn.addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (b && !b.disabled) chip(JSON.parse(b.dataset.chip)); });
  detectar().then(modo);
  setTimeout(() => { if (!st.open && !st.hinted && S.portal === 'ciudadano') { st.hinted = true; hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 12000); } }, 2200);
  window.__arbolin = { abrir, enviar: (t) => { abrir(); enviar(t); }, participar: (tipo, extra = {}) => { abrir(); iniciarFlujo({ tipo, ...extra }, ''); }, estado: () => ({ modo: proveedor().kind, flujo: st.flow ? st.flow.siguiente() : null, hist: st.hist.length }) };
}
function modo() { const p = proveedor(); const ia = p.kind !== 'local'; el.mode.textContent = ia ? 'con IA' : 'modo básico'; el.mode.className = 'arb-mode ' + (ia ? 'ia' : ''); el.mode.title = ia ? (p.kind === 'sample' ? 'Responde Claude dentro de claude.ai, con tu consentimiento.' : 'Responde un modelo de lenguaje desde el servidor de la plataforma.') + ' Los datos vienen de la plataforma.' : 'Respuestas automáticas con los datos de la plataforma (sin modelo de lenguaje).'; }
function autoGrow() { el.q.style.height = 'auto'; el.q.style.height = Math.min(120, el.q.scrollHeight) + 'px'; }
export function abrir() { if (!st.mounted) montarArbolin(); el.hint.classList.remove('on'); st.open = true; el.pn.hidden = false; el.fab.classList.add('off'); document.body.classList.add('arb-open'); if (!el.log.children.length) bot(saludo()); setTimeout(() => el.q.focus(), 60); }
function cerrar() { st.open = false; el.pn.hidden = true; el.fab.classList.remove('off'); document.body.classList.remove('arb-open'); el.fab.focus(); }
function reiniciar() { if (st.ctl) st.ctl.abort(); st.flow = null; st.expect = null; st.hist = []; st.busy = false; el.log.innerHTML = ''; bot(saludo()); }

// ---------- render ----------
function scroll() { el.log.scrollTop = el.log.scrollHeight; }
function apagarChips() { el.log.querySelectorAll('.arb-chips').forEach(c => c.remove()); }
function usuario(txt, extra = '') { apagarChips(); const d = document.createElement('div'); d.className = 'arb-m u'; d.innerHTML = `<div class="arb-b">${esc(txt)}${extra}</div><time>${time()}</time>`; el.log.appendChild(d); scroll(); }
function bot(m) {
  if (!m) return; const d = document.createElement('div'); d.className = 'arb-m a';
  d.innerHTML = `${arbolinSvg(26, { bg: true })}<div class="arb-c"><div class="arb-b">${md(m.md)}${m.card ? tarjeta(m.card) : ''}</div>${m.chips && m.chips.length ? `<div class="arb-chips">${m.chips.map(c => `<button type="button" class="arb-chip ${c.a ? 'act' : ''}" data-chip='${esc(JSON.stringify(c))}'>${esc(c.t)}</button>`).join('')}</div>` : ''}</div>`;
  el.log.appendChild(d); scroll(); if (m.expect !== undefined) st.expect = m.expect; return d;
}
const bots = arr => arr.forEach(bot);
function tarjeta(c) {
  if (c.kind === 'resumen') { const pr = { Alta: 'bad', Media: 'warn', Baja: 'ok' }[c.cat.prioridad]; return `<div class="arb-card"><table>${c.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${md(String(v || '—'))}</td></tr>`).join('')}</table>
    <div class="arb-sec">Así se catalogará <span class="tiny dim">(reglas ${esc(c.cat.regla)})</span></div><div class="arb-tags"><span class="chip">${esc(c.cat.categoria)}</span><span class="chip ${pr}">Prioridad ${esc(c.cat.prioridad)}</span>${c.cat.temas.map(t => `<span class="chip">${esc(t)}</span>`).join('')}${c.cat.sentimiento ? `<span class="chip">${esc(c.cat.sentimiento)}</span>` : ''}</div>
    <div class="tiny" style="margin-top:4px"><b>Se turna a:</b> ${c.cat.autoridad.map(esc).join(' · ')}</div>${c.cat.motivos.length ? `<div class="tiny dim">${c.cat.motivos.map(esc).join(' · ')}</div>` : ''}
    <div class="arb-sec">Cruce con el mapa ${c.precisa ? '<span class="chip ok">punto preciso</span>' : '<span class="chip warn">aproximada</span>'}</div><ul>${c.cruce.map(x => `<li>${md(x)}</li>`).join('')}</ul></div>`; }
  if (c.kind === 'acuse') { const r = c.rec; return `<div class="arb-card acuse"><div class="tiny dim">Folio</div><div class="arb-folio mono">${esc(r.folio)}</div><table><tr><th>Tipo</th><td>${esc(TIPOS[r.tipo].n)} · ${esc(r.cat.categoria)}</td></tr><tr><th>Estado</th><td>${esc(r.estado)}</td></tr><tr><th>Municipio</th><td>${esc(munName[r.cruce && r.cruce.mun || r.municipio] || '—')}</td></tr>${r.alerta ? `<tr><th>Alerta en triaje</th><td class="mono">${esc(r.alerta)}</td></tr>` : ''}${r.expediente ? `<tr><th>Expediente</th><td class="mono">${esc(r.expediente)}</td></tr>` : ''}<tr><th>Respuesta a más tardar</th><td>${esc(r.vence)} <span class="dim">(ilustrativo)</span></td></tr><tr><th>Huella SHA-256</th><td class="mono hash">${esc(r.hash)}</td></tr></table><div class="tiny dim">Registro asentado en la bitácora encadenada. ${r.anonimo ? 'Anónimo.' : 'Contacto: ' + esc(enmascarar(r.contacto)) + ' (no se publica).'}</div></div>`; }
  return '';
}
function escribiendo() { const d = document.createElement('div'); d.className = 'arb-m a typing'; d.innerHTML = `${arbolinSvg(26)}<div class="arb-c"><div class="arb-b"><span class="dots"><i></i><i></i><i></i></span></div></div>`; el.log.appendChild(d); scroll(); return d; }

// ---------- conversación ----------
function iniciarFlujo(pre, fromText) {
  st.flow = new Formulario(pre, fromText); st.expect = null; const fm = st.flow; const e = fromText ? emergencia(nrm(fromText)) : null; if (e) bot(e);
  if (!fm.f.tipo) bot(fm.pregunta('tipo')); else { bots(fm.intro()); bot(fm.pregunta()); }
  el.q.placeholder = 'Escribe tu respuesta…';
}
function alFlujo(inp) {
  const fm = st.flow; const out = fm.recibir(inp); bots(out);
  if (fm.terminado || fm.cancelado) { const r = fm.terminado; st.hist.push({ role: 'assistant', content: r ? `(Se registró ${TIPOS[r.tipo].n.toLowerCase()} con folio ${r.folio}, ${r.cat.categoria}, en ${munName[r.cruce && r.cruce.mun || r.municipio] || 'Michoacán'}; estado: ${r.estado}.)` : '(La persona canceló el registro.)' }); if (r) st.last = r; st.flow = null; el.q.placeholder = 'Escribe tu pregunta…'; }
}
export async function enviar(text, shown) {
  usuario(shown || text);
  if (st.flow) { alFlujo({ text }); return; }
  st.hist.push({ role: 'user', content: text }); const t = nrm(text);
  // rutas locales deterministas en todos los modos: participación, folios y huertas (datos exactos al instante)
  const e = emergencia(t); if (e) bot(e);
  const tp = st.expect ? null : tipoParticipacion(t);
  if (tp && !esPregunta(text)) { iniciarFlujo(tp === '?' ? {} : { tipo: tp }, text); return; }
  if (tp && proveedor().kind === 'local') return local(responderLocal(text, {}), text);
  if (/\b(DEN|CIU)-2026-[A-Z0-9]{5}\b|\bHUE-?16\d{3}-?\d{5}\b|\bPF-[A-Z]{3}-\d{5}\b/i.test(text) || st.expect) { const r = responderLocal(text, { expect: st.expect }); st.expect = null; return local(r, text); }
  const p = await detectar(); modo();
  if (p.kind === 'local') return local(responderLocal(text, { expect: st.expect }), text);
  st.busy = true; const ty = escribiendo(); st.ctl = new AbortController(); let shownTxt = '';
  const turns = st.hist.slice(-14).map((m, i, a) => i === a.length - 1 && m.role === 'user' ? { role: 'user', content: m.content + (datosTurno(m.content) ? `\n\n[Datos consultados por el sistema para este mensaje]\n${datosTurno(m.content)}` : '') } : m);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  try {
    const full = await preguntar(contextoLLM(), turns, { signal: st.ctl.signal, onText: ({ text: tx }) => { const v = visible(tx); if (v && v !== shownTxt) { shownTxt = v; ty.classList.remove('typing'); ty.querySelector('.arb-b').innerHTML = md(v); scroll(); } } });
    ty.remove(); const mk = marcadores(full); const chips = [...mk.ir.map(v => ({ t: VISTAS[v][2], a: 'go', go: VISTAS[v].slice(0, 2) })), ...mk.opciones.map(t => ({ t }))];
    if (mk.clean) bot({ md: mk.clean, chips: mk.participar ? [] : chips }); st.hist.push({ role: 'assistant', content: mk.clean || '(inicia registro)' });
    if (mk.participar) iniciarFlujo(mk.participar, text);
  } catch (err) {
    ty.remove(); if (err && err.code === 'cancelled') return; modo();
    const r = responderLocal(text, { expect: st.expect }); if (err && err.text && err.code !== 'refused') { bot({ md: visible(err.text) + '\n\n_(respuesta interrumpida)_' }); } else local(r, text, err && err.code === 'rate_limited' ? 'Por ahora respondo en modo básico (límite de uso alcanzado).' : null);
  } finally { st.busy = false; st.ctl = null; }
}
function local(r, text, nota) {
  if (r.start) { iniciarFlujo(r.start, r.fromText || text); return; }
  if (nota) r = { ...r, md: r.md + `\n\n_${nota}_` };
  bot(r); st.hist.push({ role: 'assistant', content: r.md });
}
function chip(c) {
  if (c.a === 'go') { window.__go(c.go[0], c.go[1]); if (window.innerWidth < 760) cerrar(); return; }
  if (c.a === 'geo') return geo(); if (c.a === 'map') return mapa(); if (c.a === 'photo') return el.file.click();
  if (c.a === 'acuse') return acuse(st.last);
  enviar(c.v || c.t, c.t);
}

// ---------- ubicación ----------
function geo() {
  usuario('📍 Compartir mi ubicación');
  if (!navigator.geolocation) return sinPunto('Tu navegador no permite compartir la ubicación. Puedes marcar el punto en el mapa.');
  const ty = escribiendo();
  navigator.geolocation.getCurrentPosition(p => { ty.remove(); const u = { lon: +p.coords.longitude.toFixed(6), lat: +p.coords.latitude.toFixed(6), precision: 'gps', acc: p.coords.accuracy }; if (st.flow) alFlujo({ point: u }); }, e => { ty.remove(); sinPunto(e && e.code === 1 ? 'No tengo permiso para ver tu ubicación (el navegador o esta vista lo bloquearon). Puedes **marcar el punto en el mapa**.' : 'No pude obtener tu ubicación en este momento. Puedes **marcar el punto en el mapa**.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}
function sinPunto(msg) { if (st.flow && st.flow.siguiente() === 'ubicacion') return alFlujo({ pointErr: msg }); bot({ md: msg, chips: [{ t: '🗺️ Marcar en el mapa', a: 'map' }, ...(st.flow ? [] : [])] }); }
function mapa() {
  const f = st.flow ? st.flow.f : {}; const bb = (f.municipio && bboxMunicipio(f.municipio)) || [-103.4, 18.0, -100.3, 20.4];
  let map = null, pin = null;
  const m = modal(`<div class="ch"><h2>Marca el lugar en el mapa</h2><div class="sp"><button class="btn sm ghost" data-close>✕</button></div></div><p class="tiny dim" style="margin:4px 0 8px">Acerca con la rueda o con <b>＋</b> y haz clic justo donde ocurre. La imagen satelital (🛰) ayuda a reconocer caminos, huertas y claros.${f.municipio ? ` El contorno dorado es <b>${esc(munName[f.municipio])}</b>.` : ''}</p><div style="position:relative;height:min(58vh,500px);border-radius:8px;overflow:hidden;border:1px solid var(--line)"><div id="pk" style="height:100%"></div></div><div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><span id="pkc" class="tiny mono dim">Haz clic en el mapa</span><span style="flex:1"></span><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="pkok" disabled>Usar este punto</button></div>`, { w: '820px', onClose: () => { if (map) map.destroy(); } });
  const host = m.q('#pk'); map = createMap(host, { showAlerts: false, showLidar: false, showRest: false, ids: new Set() }); ['alertas', 'lidar', 'rest', 'predios', 'heat'].forEach(k => map.show(k, false));
  const sel = f.municipio ? P.mun.find(o => o.p.id === f.municipio) : null;
  map.addLayer('arbsel', { type: 'custom', order: 95, draw: (mm, ctx) => { if (sel) { ctx.strokeStyle = '#BC955C'; ctx.lineWidth = 3; sel.polys.forEach(poly => { const r = poly[0]; ctx.beginPath(); for (let k = 0; k < r.length; k += 2) { const [x, y] = mm.toScreen(r[k], r[k + 1]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.stroke(); }); }
    if (pin) { const [x, y] = mm.toScreen(mx(pin[0]), my(pin[1])); ctx.fillStyle = '#B3261E'; ctx.strokeStyle = '#F2F4F0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 12, 9, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x, y + 2); ctx.lineTo(x + 6, y - 6); ctx.fill(); ctx.fillStyle = '#F2F4F0'; ctx.beginPath(); ctx.arc(x, y - 12, 3, 0, 6.3); ctx.fill(); } } });
  requestAnimationFrame(() => { map.fitBounds(bb, 24, false); });
  attachControls(host.parentElement, map, { sat: true });
  map.on('click', ({ lonlat }) => { pin = [+lonlat[0].toFixed(6), +lonlat[1].toFixed(6)]; const mu = municipioEn(pin[0], pin[1]); m.q('#pkc').innerHTML = `${pin[1].toFixed(5)}, ${pin[0].toFixed(5)} · <b>${mu ? esc(mu.name) : 'fuera de Michoacán'}</b>`; m.q('#pkok').disabled = false; map.redraw(); });
  m.q('#pkok').onclick = () => { const u = { lon: pin[0], lat: pin[1], precision: 'mapa' }; m.close(); usuario(`🗺️ Punto marcado: ${u.lat.toFixed(5)}, ${u.lon.toFixed(5)}`); if (st.flow) alFlujo({ point: u }); };
}
window.__arbPick = (lon, lat) => { if (st.flow) { usuario(`🗺️ Punto marcado: ${lat.toFixed(5)}, ${lon.toFixed(5)}`); alFlujo({ point: { lon, lat, precision: 'mapa' } }); } };

// ---------- fotos ----------
async function foto(file) {
  if (!st.flow || st.flow.siguiente() !== 'fotos') return toast('Las fotos se adjuntan al registrar una denuncia', 'warn');
  if (file.size > 25e6) return bot({ md: 'Esa foto pesa más de 25 MB. ¿Tienes una más ligera?' });
  const buf = await file.arrayBuffer(); const sha = sha256Bytes(new Uint8Array(buf)); let ex = null; try { ex = parseExif(buf); } catch (e) { ex = null; }
  let thumb = null; try { const bmp = await createImageBitmap(file); const k = Math.min(1, 360 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); thumb = c.toDataURL('image/jpeg', .72); } catch (e) { thumb = null; }
  const dt = ex && (ex.tags.DateTimeOriginal || ex.tags.DateTime); const fecha = dt ? dt.slice(0, 10).replace(/:/g, '-') : null;
  usuario(`📎 ${file.name}`, thumb ? `<img class="arb-thumb" src="${thumb}" alt="Foto adjunta">` : '');
  alFlujo({ photo: { n: file.name.slice(0, 80), sha, lat: ex && ex.lat != null && isFinite(ex.lat) ? +ex.lat.toFixed(6) : null, lon: ex && ex.lon != null && isFinite(ex.lon) ? +ex.lon.toFixed(6) : null, fecha, exif: ex ? { equipo: [ex.tags.Make, ex.tags.Model].filter(Boolean).join(' ') || null, fecha: dt || null } : null, thumb } });
}

// ---------- acuse ----------
function acuse(r) {
  if (!r) return; const mn = munName[r.cruce && r.cruce.mun || r.municipio] || '—';
  const txt = [`ACUSE DE RECIBO · ${TIPOS[r.tipo].n.toUpperCase()}`, 'Secretaría Estatal de Medio Ambiente (demostración) · Canal: ' + r.canal, '', `Folio: ${r.folio}`, `Fecha y hora (UTC): ${r.ts}`, `Tipo / tema: ${TIPOS[r.tipo].n} / ${r.cat.categoria}`, `Municipio: ${mn}`, `Localidad: ${r.localidad || '—'}`, `Colonia / paraje: ${r.colonia || '—'}`, r.ubicacion ? `Ubicación: ${r.ubicacion.lat}, ${r.ubicacion.lon} (${PRECISION[r.ubicacion.precision]})` : 'Ubicación: no indicada', `Fotografías: ${(r.fotos || []).length}${(r.fotos || []).map(f => '\n  SHA-256 ' + f.sha).join('')}`, `Estado: ${r.estado}`, r.alerta ? `Alerta en cola de triaje: ${r.alerta}` : null, r.expediente ? `Expediente: ${r.expediente}` : null, `Respuesta a más tardar (ilustrativo): ${r.vence}`, '', 'Descripción:', r.descripcion, '', `Huella SHA-256 del registro: ${r.hash}`, r.anonimo ? 'Presentada de forma anónima.' : 'Contacto registrado (no se publica).', '', 'Documento de demostración: no tiene validez oficial.'].filter(x => x != null).join('\n');
  download(`acuse_${r.folio}.txt`, txt, 'text/plain'); toast('Acuse descargado');
}
export const _test = { st, infoFolio, INICIO_CHIPS, unx, uny };
