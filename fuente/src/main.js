import { $, $$, on, ftime, TODAY } from './util.js';
import { icon, modal } from './ui.js';
import { BRAND } from './brand.js';
import { S, ST } from './state.js';
import * as ciud from './views/ciudadano.js';
import * as prod from './views/productor.js';
import * as adm from './views/admin.js';
import * as adm2 from './views/admin2.js';
import './domain/process.js';
import './domain/trace.js';
import './domain/participa.js';
import './domain/origen.js';
import './domain/mce.js';
import * as verif from './views/verif.js';
import * as rigor from './views/rigor.js';
import * as cadena from './views/cadena.js';
import * as gob from './views/gob.js';
import * as gfint from './views/gfint.js';
import * as lidarviz from './views/lidarviz.js';
import { empViews, pubViews } from './views/portales.js';
import * as partV from './views/participa.js';
import * as origenV from './views/origen.js';
import { montarArbolin } from './assistant/ui.js';
import * as mceV from './views/mce.js';
import { puedeVer } from './domain/mce.js';
import { USERS, ROLES, me } from './domain/core.js';
import { ledgerAppend } from './integrity.js';
import { esc } from './util.js';

const NAV = {
  ciudadano: [
    { g: ['Transparencia', 'Transparency'], items: [['inicio', 'Panorama', 'dash', 'Overview'], ['mapa', 'Mapa forestal', 'map', 'Forest map'], ['elegibilidad', 'Consulta de elegibilidad', 'search', 'Eligibility lookup'], ['municipios', 'Municipios', 'layers', 'Municipalities'], ['indicadores', 'Indicadores', 'chart', 'Indicators'], ['restauracion', 'Restauración', 'leaf', 'Restoration']] },
    { g: ['Información', 'Information'], items: [['metodo', 'Metodología de verificación', 'book', 'Verification methodology'], ['datos', 'Datos abiertos', 'db', 'Open data'], ['metodologia', 'Semáforo forestal', 'shield', 'Forest traffic light'], ['cuentas', 'Rendición de cuentas', 'scale', 'Accountability'], ['participa', 'Participa con Arbolín', 'chat', 'Have your say'], ['verificar', 'Verificar folio', 'check', 'Verify a reference'], ['denuncia', 'Denuncia ciudadana', 'flag', 'Report a case']] }],
  productor: [{ g: ['Mi cuenta', 'My account'], items: [['panel', 'Mi panel', 'dash'], ['constancia', 'Constancia ambiental', 'shield'], ['procedimientos', 'Procedimientos y audiencia', 'scale'], ['predios', 'Mis predios', 'map'], ['tramites', 'Trámites', 'file'], ['levantamiento', 'Cargar levantamiento', 'drone'], ['restauracion', 'Proyectos de restauración', 'leaf'], ['avisos', 'Notificaciones', 'alert']] }],
  empacadora: [{ g: ['Empacadora', 'Packer'], items: [['recepcion', 'Recepción de fruta', 'check'], ['lotes', 'Lotes y embarques', 'layers'], ['integracion', 'Integración por API', 'key']] }],
  admin: [
    { g: ['Operación', 'Operations'], items: [['centro', 'Centro de mando', 'dash'], ['origen', 'Certificación de origen', 'shield', 'Origin certification'], ['gis', 'Mapa GIS', 'map'], ['huertas', 'Registro de huertas', 'users'], ['triaje', 'Cola de triaje', 'alert'], ['participacion', 'Participación ciudadana', 'chat', 'Citizen input'], ['seguridad', 'Seguridad de brigadas', 'shield', 'Field-team security']] },
    { g: ['Debido proceso', 'Due process'], items: [['expedientes', 'Expedientes', 'file'], ['dictamenes', 'Dictámenes', 'shield'], ['segunda', 'Segunda instancia', 'scale']] },
    { g: ['Rigor técnico', 'Technical rigor'], items: [['cortes', 'Cortes y fechado', 'clock'], ['exactitud', 'Exactitud medida', 'chart'], ['semaforo', 'Semáforo forestal', 'shield'], ['lidar', 'Levantamientos LiDAR / dron', 'drone'], ['visor', 'Visor y análisis LiDAR', 'layers'], ['fuentes', 'Fuentes y monitoreo', 'db'], ['guardian', 'Guardián Forestal', 'layers']] },
    { g: ['Cadena y fiscal', 'Supply chain & revenue'], items: [['trazabilidad', 'Trazabilidad de exportación', 'layers', 'Export traceability'], ['paquete-ue', 'Paquete UE por lote', 'download', 'EU evidence package'], ['balance', 'Trazabilidad y balance', 'layers'], ['compensaciones', 'Compensaciones y procedimientos', 'leaf'], ['laboral', 'Laboral (CLA) y agua', 'users']] },
    { g: ['Integridad', 'Integrity'], items: [['bitacora', 'Bitácora de auditoría', 'hash'], ['gobernanza', 'Gobernanza y continuidad', 'key'], ['api', 'API y diccionario', 'db'], ['ingesta', 'Ingesta de datos históricos', 'upload'], ['restauracion', 'Evaluación de restauración', 'leaf'], ['indicadores', 'Indicadores y reportes', 'chart']] },
    { g: ['Interno', 'Internal'], items: [['recaudacion', 'Finanzas (interno)', 'chart', 'Finance (internal)']] }],
};
const VIEWS = { ciudadano: { ...ciud.views, ...pubViews, ...partV.pubViews }, productor: prod.views, empacadora: empViews, admin: { ...adm.views, ...adm2.views, ...verif.views, ...rigor.views, ...cadena.views, ...gob.views, ...gfint.views, ...lidarviz.views, ...partV.views, ...origenV.views, ...mceV.adminViews } };
const TITLES = { ciudadano: 'Portal Ciudadano', productor: 'Portal del Productor', empacadora: 'Portal de Empacadora', admin: 'Portal de Administración' };
const EN = () => S.lang === 'en';
let cleanup = null;

function badgeFor(portal, id) {
  if (portal !== 'admin') return '';
  if (id === 'triaje') return `<span class="n warn">${S.cases.filter(c => c.stage === 'alerta' && c.estado === 'Abierto').length + S.alertas.filter(a => !a.pid && ['Detectada', 'En validación'].includes(a.st)).length}</span>`;
  if (id === 'segunda') { const n = S.cases.filter(c => c.stage === 'recurso').length; return n ? `<span class="n bad">${n}</span>` : ''; }
  if (id === 'expedientes') return `<span class="n">${S.cases.filter(c => c.stage === 'audiencia').length}</span>`;
  if (id === 'lidar') return `<span class="n bad">${S.estudios.filter(e => e.ver === 'Rechazado').length}</span>`;
  if (id === 'participacion') { const n = partV.pendientes(); return n ? `<span class="n warn">${n}</span>` : ''; }
  if (id === 'ingesta' && S.ingestLog.length) return `<span class="n">${S.ingestLog.length}</span>`;
  return '';
}
function shell() {
  $('#app').innerHTML = `
  <div class="gobbar">${BRAND.franja}</div>
  <header class="top">
    <button class="menu-btn" id="menu">☰</button>
    <div class="brand"><svg width="30" height="30" viewBox="0 0 32 32"><defs><linearGradient id="lgB" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#BC955C"/><stop offset="1" stop-color="#BC955C"/></linearGradient></defs><path d="M16 2 4 8v9c0 6.5 5 11 12 13 7-2 12-6.500 12-13V8L16 2Z" fill="none" stroke="url(#lgB)" stroke-width="2"/><path d="M16 22v-9m0 0c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 3c3 0 5-2 5-5-3 0-5 2-5 5Z" fill="none" stroke="url(#lgB)" stroke-width="1.8" stroke-linecap="round"/></svg><div><b>${BRAND.nombre}</b><small>${BRAND.entidad} · ${BRAND.sub}</small></div></div>
    <nav class="ptabs" id="ptabs">${Object.keys(NAV).map(k => `<button data-p="${k}">${icon({ ciudadano: 'eye', productor: 'leaf', empacadora: 'layers', admin: 'shield' }[k], 15)}<span>${{ ciudadano: 'Ciudadano', productor: 'Productor', empacadora: 'Empacadora', admin: 'Administración' }[k]}</span></button>`).join('')}</nav>
    <div class="sys"><span class="lang" id="lang"><button data-l="es">ES</button><button data-l="en">EN</button></span><span><span class="pulse"></span><span class="ok">Operativo</span></span><span class="hide-sm">Última sincronización satelital: <b class="mono" style="color:#1B2A26">hace 4 h</b></span><span class="hide-sm mono">${TODAY.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
  </header>
  <div class="body"><aside class="nav" id="nav"></aside><main class="main" id="main"></main></div>
  <footer class="foot"><span><b>${BRAND.entidad}</b> · ${BRAND.domicilio} · Tel. ${BRAND.tel} · ${BRAND.contacto}</span><span class="fl"><a id="f-priv">Aviso de privacidad</a><a id="f-open">Datos abiertos</a><a id="f-met">Metodología</a><a id="f-dem">Sobre esta demostración</a></span></footer>`;
  $('#f-open').onclick = () => go('ciudadano', 'datos'); $('#f-met').onclick = () => go('ciudadano', 'metodologia');
  $('#f-priv').onclick = () => { const AV = { ciudadano: ['Personas usuarias del portal ciudadano', 'Sólo se tratan los datos que usted aporte al presentar una denuncia o participación (descripción, ubicación, fotografías y, si lo decide, un contacto). El contacto nunca se publica; la denuncia puede ser anónima. El portal no publica nombres de titulares ni de servidores públicos: sólo folios y clasificaciones firmes.'], productor: ['Personas productoras', 'Se tratan su RFC/CURP, documentos de tenencia, polígonos, registro patronal y comunicaciones del procedimiento, para verificar la legalidad forestal y emitir constancias. Usted decide qué comparte con compradores y puede ejercer derechos ARCO desde este portal.'], empacadora: ['Empacadoras y exportadores', 'Se tratan los datos de la empresa, consultas de elegibilidad, lotes y embarques (incluido el pedimento). La empacadora sólo ve el resultado de la consulta de sus proveedores, no la evidencia completa de terceros.'], admin: ['Personas servidoras públicas', 'Se tratan su identificador, rol, declaración de conflicto de interés, segundo factor y cada acción en la bitácora. Su identidad no aparece en documentos públicos.'] }[S.portal] || ['', ''];
    modal(`<div class="ch"><h2>Aviso de privacidad · ${AV[0]}</h2><div class="sp"><button class="btn sm ghost" data-close>✕</button></div></div><p style="margin:10px 0">${AV[1]}</p><p class="tiny dim">Derechos ARCO ante la unidad de transparencia. Texto ilustrativo para la demostración; no constituye un aviso vigente.</p>`, { w: '560px' }); };
  $('#f-dem').onclick = () => { modal(`<div class="ch"><h2>Sobre esta demostración</h2><div class="sp"><button class="btn sm ghost" data-close>✕</button></div></div><p style="margin:10px 0">Este sitio es un prototipo funcional. Los límites municipales, ríos y lagos son reales; los predios, alertas, levantamientos, proyectos y bitácora son <b>datos ficticios</b> generados para mostrar el funcionamiento. No representa información de ninguna dependencia.</p>`, { w: '520px' }); };
  on($('#ptabs'), 'click', 'button', (e, b) => go(b.dataset.p));
  on($('#lang'), 'click', 'button', (e, b) => { S.lang = b.dataset.l; render(S.portal, S.view); });
  $('#menu').onclick = () => $('#nav').classList.toggle('open');
  on($('#nav'), 'click', 'a', (e, a) => { go(a.dataset.p, a.dataset.v); $('#nav').classList.remove('open'); });
}
export function go(portal, view, params) {
  const v = view || NAV[portal][0].items[0][0]; const h = `#/${portal}/${v}`; if (location.hash !== h) { history.replaceState(null, '', h); } lastHash = location.hash; render(portal, v, params);
}
window.__go = go;
export function render(portal, view, params) {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  S.portal = portal; S.view = view;
  $$('#ptabs button').forEach(b => b.classList.toggle('on', b.dataset.p === portal));
  $$('#lang button').forEach(b => b.classList.toggle('on', b.dataset.l === (S.lang || 'es')));
  const u = me();
  $('#nav').innerHTML = (portal === 'admin' ? `<div class="role"><div class="tiny dim">Actuando como</div><select id="role">${USERS.map(x => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${x.id} · ${ROLES[x.rol].n}</option>`).join('')}</select><div class="tiny dim" style="margin-top:4px">${ROLES[u.rol].area}</div></div>` : '') +
    NAV[portal].map(g => ({ ...g, items: g.items.filter(([id]) => portal !== 'admin' || puedeVer(u, id)) })).filter(g => g.items.length).map(g => `<h4>${EN() ? g.g[1] : g.g[0]}</h4>` + g.items.map(([id, name, ic, en]) => `<a data-p="${portal}" data-v="${id}" class="${id === view ? 'on' : ''}">${icon(ic)}<span>${EN() && en ? en : name}</span>${badgeFor(portal, id)}</a>`).join('')).join('') +
    `<h4>${TITLES[portal]}</h4><div class="tiny dim" style="padding:0 10px;line-height:1.5">${{ ciudadano: EN() ? 'Public information, no sign-in. Status published by orchard ID; owners and officials are never named.' : 'Información pública, sin registro. Se publica el estado por identificador de huerta; nunca el nombre del propietario ni de quien dictaminó.', productor: 'Acceso con Llave MX (simulado). Sus datos sólo son visibles para usted y para personal autorizado.', empacadora: 'Acceso con certificado de cliente (simulado). Cada consulta de elegibilidad queda en la bitácora.', admin: 'Cuentas institucionales con doble factor. Las reglas de separación de funciones se aplican en cada acción.' }[portal]}</div>`;
  const rs = $('#role'); if (rs) rs.onchange = () => { const nu = USERS.find(x => x.id === rs.value); const ok = () => { S.user = rs.value; render(S.portal, puedeVer(nu, S.view) ? S.view : 'centro'); };
    if (['seguridad', 'finanzas', 'federal'].includes(nu.rol)) { const code = String(100000 + Math.floor(Math.random() * 899999)); const m = modal(`<h2>Segundo factor · ${nu.id}</h2><p class="tiny dim">Los roles ${ROLES[nu.rol].n} requieren cuenta institucional y segundo factor (${esc(nu.mfa)}). En la demostración el código se muestra aquí.</p><div class="mono" style="font-size:26px;letter-spacing:.2em;margin:8px 0">${code}</div><input id="otp" class="mono" placeholder="Código de 6 dígitos" maxlength="6" style="width:100%"><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="otpok">Verificar</button></div>`, { w: '420px', onClose: () => { rs.value = S.user; } }); m.q('#otpok').onclick = () => { if (m.q('#otp').value.trim() !== code) return window.__toast('Código incorrecto', 'warn'); ledgerAppend(S.ledger, nu.id, 'SESION_2FA', nu.rol); S.user = rs.value; m.el.remove(); render(S.portal, puedeVer(nu, S.view) ? S.view : 'centro'); }; return; }
    ok(); };
  const old = $('#main'); if (old._pv) { try { old._pv(); } catch (e) {} old._pv = null; } const main = old.cloneNode(false); old.replaceWith(main); main.className = 'main';
  const fn = portal === 'admin' && !puedeVer(u, view) ? (m2 => { m2.innerHTML = `<div class="card" style="max-width:560px;margin:40px auto;text-align:center">${icon('key', 30)}<h2 style="margin-top:8px">Acceso restringido</h2><p class="dim">La vista «${esc(view)}» no está disponible para el rol ${esc(ROLES[u.rol].n)}. ${view === 'seguridad' ? 'La capa de seguridad sólo responde al rol Seguridad.' : view === 'recaudacion' ? 'Finanzas (interno) sólo está disponible para el rol Finanzas (SATMICH).' : 'Las reglas de acceso están en Gobernanza.'}</p></div>`; }) : (VIEWS[portal] || {})[view] || (() => { main.innerHTML = '<div class="card">Vista no encontrada</div>'; });
  const ret = fn(main, params || {}); if (typeof ret === 'function') cleanup = ret; refreshNavBadges();
}
export function refreshNavBadges() { $$('#nav a').forEach(a => { const n = badgeFor(a.dataset.p, a.dataset.v); const cur = $('.n', a); if (cur) cur.remove(); if (n) a.insertAdjacentHTML('beforeend', n); }); }
window.__refreshBadges = refreshNavBadges;

shell();
montarArbolin();
// Rutas: #/<perfil>/<vista>[/<id>] y #/verificar/<folio> (pública, sin cuenta). Enlaces profundos probados en pestaña nueva.
function ruta(h) {
  const v = decodeURIComponent(h || '').match(/^#\/verificar\/?(.*)$/); if (v) return { portal: 'ciudadano', view: 'verificar', params: { folio: v[1] || '' } };
  const m = (h || '').match(/^#\/([\w-]+)\/([\w-]+)(?:\/([^?#]+))?/); if (!m || !NAV[m[1]] || !VIEWS[m[1]] || !VIEWS[m[1]][m[2]]) return null;
  return { portal: m[1], view: m[2], params: m[3] ? { id: decodeURIComponent(m[3]), q: decodeURIComponent(m[3]) } : {} };
}
let lastHash = null;
function porHash() { const r = ruta(location.hash); lastHash = location.hash; if (r) render(r.portal, r.view, r.params); else go('admin', 'centro'); }
porHash();
window.addEventListener('hashchange', () => { if (location.hash === lastHash) return; const r = ruta(location.hash); lastHash = location.hash; if (r) render(r.portal, r.view, r.params); });
