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
import * as verif from './views/verif.js';
import * as rigor from './views/rigor.js';
import * as cadena from './views/cadena.js';
import * as gob from './views/gob.js';
import * as gfint from './views/gfint.js';
import { empViews, pubViews } from './views/portales.js';
import { USERS, ROLES, me } from './domain/core.js';

const NAV = {
  ciudadano: [
    { g: ['Transparencia', 'Transparency'], items: [['inicio', 'Panorama', 'dash', 'Overview'], ['mapa', 'Mapa forestal', 'map', 'Forest map'], ['elegibilidad', 'Consulta de elegibilidad', 'search', 'Eligibility lookup'], ['municipios', 'Municipios', 'layers', 'Municipalities'], ['indicadores', 'Indicadores', 'chart', 'Indicators'], ['restauracion', 'Restauración', 'leaf', 'Restoration']] },
    { g: ['Información', 'Information'], items: [['metodo', 'Metodología de verificación', 'book', 'Verification methodology'], ['datos', 'Datos abiertos', 'db', 'Open data'], ['metodologia', 'Semáforo forestal', 'shield', 'Forest traffic light'], ['cuentas', 'Rendición de cuentas', 'scale', 'Accountability'], ['denuncia', 'Denuncia ciudadana', 'flag', 'Report a case']] }],
  productor: [{ g: ['Mi cuenta', 'My account'], items: [['panel', 'Mi panel', 'dash'], ['procedimientos', 'Procedimientos y audiencia', 'scale'], ['predios', 'Mis predios', 'map'], ['tramites', 'Trámites', 'file'], ['levantamiento', 'Cargar levantamiento', 'drone'], ['restauracion', 'Proyectos de restauración', 'leaf'], ['avisos', 'Notificaciones', 'alert']] }],
  empacadora: [{ g: ['Empacadora', 'Packer'], items: [['recepcion', 'Recepción de fruta', 'check'], ['lotes', 'Lotes y embarques', 'layers'], ['integracion', 'Integración por API', 'key']] }],
  admin: [
    { g: ['Operación', 'Operations'], items: [['centro', 'Centro de mando', 'dash'], ['gis', 'Mapa GIS', 'map'], ['huertas', 'Registro de huertas', 'users'], ['triaje', 'Cola de triaje', 'alert']] },
    { g: ['Debido proceso', 'Due process'], items: [['expedientes', 'Expedientes', 'file'], ['dictamenes', 'Dictámenes', 'shield'], ['segunda', 'Segunda instancia', 'scale']] },
    { g: ['Rigor técnico', 'Technical rigor'], items: [['cortes', 'Cortes y fechado', 'clock'], ['exactitud', 'Exactitud medida', 'chart'], ['semaforo', 'Semáforo forestal', 'shield'], ['lidar', 'Levantamientos LiDAR / dron', 'drone'], ['fuentes', 'Fuentes y monitoreo', 'db'], ['guardian', 'Guardián Forestal', 'layers']] },
    { g: ['Cadena y fiscal', 'Supply chain & revenue'], items: [['balance', 'Trazabilidad y balance', 'layers'], ['compensaciones', 'Compensaciones', 'leaf'], ['recaudacion', 'Recaudación', 'chart'], ['laboral', 'Laboral y agua', 'users']] },
    { g: ['Integridad', 'Integrity'], items: [['bitacora', 'Bitácora de auditoría', 'hash'], ['gobernanza', 'Gobernanza y continuidad', 'key'], ['api', 'API y diccionario', 'db'], ['ingesta', 'Ingesta de datos históricos', 'upload'], ['restauracion', 'Evaluación de restauración', 'leaf'], ['indicadores', 'Indicadores y reportes', 'chart']] }],
};
const VIEWS = { ciudadano: { ...ciud.views, ...pubViews }, productor: prod.views, empacadora: empViews, admin: { ...adm.views, ...adm2.views, ...verif.views, ...rigor.views, ...cadena.views, ...gob.views, ...gfint.views } };
const TITLES = { ciudadano: 'Portal Ciudadano', productor: 'Portal del Productor', empacadora: 'Portal de Empacadora', admin: 'Portal de Administración' };
const EN = () => S.lang === 'en';
let cleanup = null;

function badgeFor(portal, id) {
  if (portal !== 'admin') return '';
  if (id === 'triaje') return `<span class="n warn">${S.cases.filter(c => c.stage === 'alerta' && c.estado === 'Abierto').length + S.alertas.filter(a => !a.pid && ['Detectada', 'En validación'].includes(a.st)).length}</span>`;
  if (id === 'segunda') { const n = S.cases.filter(c => c.stage === 'recurso').length; return n ? `<span class="n bad">${n}</span>` : ''; }
  if (id === 'expedientes') return `<span class="n">${S.cases.filter(c => c.stage === 'audiencia').length}</span>`;
  if (id === 'lidar') return `<span class="n bad">${S.estudios.filter(e => e.ver === 'Rechazado').length}</span>`;
  if (id === 'ingesta' && S.ingestLog.length) return `<span class="n">${S.ingestLog.length}</span>`;
  return '';
}
function shell() {
  $('#app').innerHTML = `
  <div class="gobbar">${BRAND.franja}</div>
  <header class="top">
    <button class="menu-btn" id="menu">☰</button>
    <div class="brand"><svg width="30" height="30" viewBox="0 0 32 32"><defs><linearGradient id="lgB" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#34D399"/><stop offset="1" stop-color="#22C55E"/></linearGradient></defs><path d="M16 2 4 8v9c0 6.5 5 11 12 13 7-2 12-6.500 12-13V8L16 2Z" fill="none" stroke="url(#lgB)" stroke-width="2"/><path d="M16 22v-9m0 0c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 3c3 0 5-2 5-5-3 0-5 2-5 5Z" fill="none" stroke="url(#lgB)" stroke-width="1.8" stroke-linecap="round"/></svg><div><b>${BRAND.nombre}</b><small>${BRAND.entidad} · ${BRAND.sub}</small></div></div>
    <nav class="ptabs" id="ptabs">${Object.keys(NAV).map(k => `<button data-p="${k}">${icon({ ciudadano: 'eye', productor: 'leaf', empacadora: 'layers', admin: 'shield' }[k], 15)}<span>${{ ciudadano: 'Ciudadano', productor: 'Productor', empacadora: 'Empacadora', admin: 'Administración' }[k]}</span></button>`).join('')}</nav>
    <div class="sys"><span class="lang" id="lang"><button data-l="es">ES</button><button data-l="en">EN</button></span><span><span class="pulse"></span><span class="ok">Operativo</span></span><span class="hide-sm">Última sincronización satelital: <b class="mono" style="color:#ECF5EF">hace 4 h</b></span><span class="hide-sm mono">${TODAY.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
  </header>
  <div class="body"><aside class="nav" id="nav"></aside><main class="main" id="main"></main></div>
  <footer class="foot"><span><b>${BRAND.entidad}</b> · ${BRAND.domicilio} · Tel. ${BRAND.tel} · ${BRAND.contacto}</span><span class="fl"><a id="f-priv">Aviso de privacidad</a><a id="f-open">Datos abiertos</a><a id="f-met">Metodología</a><a id="f-dem">Sobre esta demostración</a></span></footer>`;
  $('#f-open').onclick = () => go('ciudadano', 'datos'); $('#f-met').onclick = () => go('ciudadano', 'metodologia');
  $('#f-priv').onclick = () => { const m = modal(`<div class="ch"><h2>Aviso de privacidad integral (resumen)</h2><div class="sp"><button class="btn sm ghost" data-close>✕</button></div></div><p style="margin:10px 0">Los datos personales de las personas productoras se tratan para verificar la legalidad forestal y la trazabilidad de los predios inscritos. El portal ciudadano no publica nombres ni datos personales: sólo folios seudonimizados y clasificaciones firmes.</p><p class="dim tiny">Las personas titulares pueden ejercer sus derechos de acceso, rectificación, cancelación y oposición (ARCO) desde el portal del productor. Texto ilustrativo para la demostración; no constituye un aviso vigente.</p>`, { w: '560px' }); };
  $('#f-dem').onclick = () => { modal(`<div class="ch"><h2>Sobre esta demostración</h2><div class="sp"><button class="btn sm ghost" data-close>✕</button></div></div><p style="margin:10px 0">Este sitio es un prototipo funcional. Los límites municipales, ríos y lagos son reales; los predios, alertas, levantamientos, proyectos y bitácora son <b>datos ficticios</b> generados para mostrar el funcionamiento. No representa información de ninguna dependencia.</p>`, { w: '520px' }); };
  on($('#ptabs'), 'click', 'button', (e, b) => go(b.dataset.p));
  on($('#lang'), 'click', 'button', (e, b) => { S.lang = b.dataset.l; render(S.portal, S.view); });
  $('#menu').onclick = () => $('#nav').classList.toggle('open');
  on($('#nav'), 'click', 'a', (e, a) => { go(a.dataset.p, a.dataset.v); $('#nav').classList.remove('open'); });
}
export function go(portal, view, params) {
  const v = view || NAV[portal][0].items[0][0]; const h = `#/${portal}/${v}`; if (location.hash !== h) { history.replaceState(null, '', h); } render(portal, v, params);
}
window.__go = go;
export function render(portal, view, params) {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  S.portal = portal; S.view = view;
  $$('#ptabs button').forEach(b => b.classList.toggle('on', b.dataset.p === portal));
  $$('#lang button').forEach(b => b.classList.toggle('on', b.dataset.l === (S.lang || 'es')));
  const u = me();
  $('#nav').innerHTML = (portal === 'admin' ? `<div class="role"><div class="tiny dim">Actuando como</div><select id="role">${USERS.map(x => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${x.id} · ${ROLES[x.rol].n}</option>`).join('')}</select><div class="tiny dim" style="margin-top:4px">${ROLES[u.rol].area}</div></div>` : '') +
    NAV[portal].map(g => `<h4>${EN() ? g.g[1] : g.g[0]}</h4>` + g.items.map(([id, name, ic, en]) => `<a data-p="${portal}" data-v="${id}" class="${id === view ? 'on' : ''}">${icon(ic)}<span>${EN() && en ? en : name}</span>${badgeFor(portal, id)}</a>`).join('')).join('') +
    `<h4>${TITLES[portal]}</h4><div class="tiny dim" style="padding:0 10px;line-height:1.5">${{ ciudadano: EN() ? 'Public information, no sign-in. Status published by orchard ID; owners and officials are never named.' : 'Información pública, sin registro. Se publica el estado por identificador de huerta; nunca el nombre del propietario ni de quien dictaminó.', productor: 'Acceso con Llave MX (simulado). Sus datos sólo son visibles para usted y para personal autorizado.', empacadora: 'Acceso con certificado de cliente (simulado). Cada consulta de elegibilidad queda en la bitácora.', admin: 'Cuentas institucionales con doble factor. Las reglas de separación de funciones se aplican en cada acción.' }[portal]}</div>`;
  const rs = $('#role'); if (rs) rs.onchange = () => { S.user = rs.value; render(S.portal, S.view); };
  const old = $('#main'); if (old._pv) { try { old._pv(); } catch (e) {} old._pv = null; } const main = old.cloneNode(false); old.replaceWith(main); main.className = 'main';
  const fn = (VIEWS[portal] || {})[view] || (() => { main.innerHTML = '<div class="card">Vista no encontrada</div>'; });
  const ret = fn(main, params || {}); if (typeof ret === 'function') cleanup = ret; refreshNavBadges();
}
export function refreshNavBadges() { $$('#nav a').forEach(a => { const n = badgeFor(a.dataset.p, a.dataset.v); const cur = $('.n', a); if (cur) cur.remove(); if (n) a.insertAdjacentHTML('beforeend', n); }); }
window.__refreshBadges = refreshNavBadges;

shell();
const m = location.hash.match(/^#\/(\w+)\/(\w+)/);
if (m && NAV[m[1]] && VIEWS[m[1]] && VIEWS[m[1]][m[2]]) render(m[1], m[2]); else go('ciudadano', 'inicio');
window.addEventListener('hashchange', () => { const m = location.hash.match(/^#\/(\w+)\/(\w+)/); if (m && NAV[m[1]] && (S.portal !== m[1] || S.view !== m[2])) render(m[1], m[2]); });
