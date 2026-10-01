import { $, $$, on, esc, fmt, chip, toast, download } from '../util.js';
import { S, munName } from '../state.js';
import { kpi, tag, icon } from '../ui.js';
import { ledgerAppend, ledgerVerify, sha256Str } from '../integrity.js';
import { H, hById, USERS, ROLES, userById, me, PARAMS, MET, ESTADOS, TRANS, elegibilidad, elegibles, listaVersion, maskRfc, cortes, todayIso } from '../domain/core.js';
import { allowed, STAGES } from '../domain/process.js';
import { t, EST_EN } from '../domain/dictamen.js';
import { hdr, who } from './verif.js';

// ---------- Gobernanza, independencia y continuidad ----------
const RULES = [
  ['Quien detecta no dictamina', 'deteccion ≠ dictamen (persona y rol)'],
  ['Quien dictamina no resuelve la apelación', 'dictamen ≠ revisión; área distinta'],
  ['Declaración de conflicto de interés vigente', 'sin declaración no se puede actuar'],
  ['Cartera territorial asignada y rotada', 'sólo se actúa en municipios de la cartera'],
  ['Auditor externo de sólo lectura', 'no puede cambiar estados ni emitir'],
  ['Garantía de audiencia antes del dictamen firme', 'plazo en días hábiles o alegatos presentados'],
  ['Motivación obligatoria de alegatos', 'no se firma sin valorar pruebas del productor'],
  ['Todo cambio en la bitácora encadenada', 'polígonos, alertas, estados, parámetros, descargas'],
];
function probarReglas() {
  const mk = (stage, steps, extra = {}) => ({ id: 'TEST', uid: H.find(h => userById['DIC-01'].cartera.includes(h.mun)).uid, stage, estado: 'Abierto', steps, alegatos: [], ...extra });
  const tests = [
    ['Un analista de detección intenta emitir el proyecto de dictamen', allowed(mk('campo', [{ k: 'revision', actor: 'DET-03' }]), 'proyecto', userById['DET-03']), false],
    ['El dictaminador emite proyecto tras revisión y campo de otras personas', allowed(mk('campo', [{ k: 'revision', actor: 'DET-03' }, { k: 'campo', actor: 'CAM-02' }]), 'proyecto', userById['DIC-01']), true],
    ['Dictamen firme antes de vencer el plazo de audiencia y sin alegatos', allowed(mk('audiencia', [], { vence: '2099-01-01' }), 'firme', userById['DIC-01']), false],
    ['El mismo dictaminador intenta resolver el recurso', allowed(mk('recurso', [{ k: 'firme', actor: 'DIC-01' }]), 'resolver', { ...userById['DIC-01'], rol: 'revision' }), false],
    ['El revisor de segunda instancia resuelve el recurso', allowed(mk('recurso', [{ k: 'firme', actor: 'DIC-01' }]), 'resolver', userById['REV-01']), true],
    ['Dictaminador sin declaración de conflicto de interés', allowed(mk('campo', [{ k: 'revision', actor: 'DET-03' }]), 'proyecto', userById['DIC-09']), false],
    ['Auditor externo intenta validar una alerta', allowed(mk('alerta', []), 'validar', userById['AUD-EXT']), false],
  ];
  return tests.map(([n, r, exp]) => ({ n, ok: r.ok === exp, got: r.ok ? 'permitido' : 'bloqueado: ' + r.why, exp: exp ? 'permitido' : 'bloqueado' }));
}
const CYBER = [
  ['Cuentas institucionales con doble factor (FIDO2/TOTP)', 'Implementado en la plataforma', 'ok'], ['Sin acceso con cuentas personales ni de servicios de IA de consumo', 'Política + bloqueo de dominio', 'ok'],
  ['Registro de accesos y de consultas a datos personales', 'Implementado en la plataforma', 'ok'], ['Bitácora encadenada con anclaje externo diario (sello NOM-151)', 'Requiere PSC contratado', 'warn'],
  ['Pruebas de penetración semestrales por tercero', 'Requiere contrato', 'warn'], ['Cifrado en reposo y en tránsito; llaves en HSM', 'Requiere infraestructura', 'warn'],
  ['Respaldo inmutable fuera de sitio (WORM)', 'Requiere infraestructura', 'warn'], ['Plan de respuesta a incidentes y ejercicio anual', 'Requiere acto administrativo', 'warn'],
  ['Segmentación: vista pública sin acceso a datos reservados', 'Implementado en la plataforma', 'ok'], ['Clasificación ENS/ISO 27001 como infraestructura crítica', 'Requiere certificación', 'warn'],
];
const CONT = [
  ['Reconocimiento con la contraparte estadounidense nombra la función y la metodología, no al titular', 'Requiere acto jurídico', 'Convenio / memorándum'],
  ['Plataforma, dictamen y padrón en ley; órgano técnico con autonomía de gestión y presupuesto multianual', 'Requiere acto legislativo', 'Iniciativa de ley'],
  ['Código y datos propiedad del estado: repositorio institucional y documentación completa', 'Implementado en el diseño', 'Repositorio del estado'],
  ['Cláusula de entrega en todo contrato con proveedores (código, datos, documentación, transferencia)', 'Requiere contrato', 'Modelo de cláusula'],
  ['Datos abiertos por identificador de huerta sin nombre del propietario', 'Implementado en la plataforma', 'Vista pública y API'],
  ['Auditoría externa anual (institución académica o firma independiente) con informe público', 'Requiere convenio', 'Convenio académico'],
  ['Metodología versionada, bilingüe y publicada', 'Implementado en la plataforma', MET.id + ' v' + MET.ver],
  ['Protección del personal: la vista pública no muestra quién dictaminó; brigadas con protocolo', 'Implementado en la plataforma', 'Alias y protocolo'],
];
function gobernanza(main) {
  let tab = 'sod';
  const draw = () => { main.innerHTML = hdr('Gobernanza, independencia y continuidad', 'Lo que un auditor extranjero va a revisar: separación de funciones aplicada en el sistema, conflicto de interés, bitácora inmutable, ciberseguridad y continuidad institucional.', who()) +
    `<div class="tabs" id="tb">${[['sod', 'Separación de funciones'], ['per', 'Personal y conflicto de interés'], ['acc', 'Accesos'], ['cib', 'Ciberseguridad'], ['aud', 'Auditoría externa'], ['con', 'Continuidad']].map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div id="bd"></div>`;
    const bd = $('#bd', main);
    if (tab === 'sod') { const acts = [['Validar / descartar alerta', 'deteccion'], ['Registrar visita de campo', 'campo'], ['Proyecto de dictamen y notificación', 'dictamen'], ['Dictamen firme', 'dictamen'], ['Cambiar estado legal', 'dictamen'], ['Resolver recurso de revisión', 'revision'], ['Dar vista a PROFEPA / FGE', 'juridico'], ['Consultar bitácora y expedientes', 'auditor']]; const T = probarReglas();
      bd.innerHTML = `<div class="grid g2"><div class="card"><div class="ch"><h3>Matriz de funciones</h3></div><div class="tw"><table class="tbl"><thead><tr><th>Acción</th>${Object.keys(ROLES).map(r => `<th class="num tiny">${ROLES[r].n}</th>`).join('')}</tr></thead><tbody>${acts.map(([a, r]) => `<tr><td class="tiny">${a}</td>${Object.keys(ROLES).map(k => `<td class="num">${k === r || (r === 'auditor') ? (k === r ? '<b style="color:#2E7D32">●</b>' : '<span class="dim">○</span>') : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="tiny dim" style="margin-top:6px">● ejecuta · ○ consulta. Las reglas se validan en cada acción; no dependen del organigrama.</div></div>
      <div class="card"><div class="ch"><h3>Prueba automática de reglas</h3><div class="sp">${chip(T.every(x => x.ok) ? T.length + '/' + T.length + ' correctas' : 'Fallas', T.every(x => x.ok) ? 'ok' : 'bad')}</div></div>${T.map(x => `<div class="chk"><span class="ic ${x.ok ? 'ok' : 'fail'}">${x.ok ? '✓' : '✕'}</span><div><b>${esc(x.n)}</b><small>Esperado: ${x.exp} · Resultado: ${esc(x.got)}</small></div></div>`).join('')}</div></div>
      <div class="card" style="margin-top:14px"><div class="ch"><h3>Reglas aplicadas por el sistema</h3></div><div class="grid g2" style="margin-top:6px">${RULES.map(r => `<div class="tiny" style="padding:4px 0"><b>${r[0]}</b><div class="dim">${r[1]}</div></div>`).join('')}</div></div>`; }
    if (tab === 'per') bd.innerHTML = `<div class="note info tiny" style="margin-bottom:10px">El personal se identifica por alias en toda la plataforma. La identidad real sólo la conoce el área de recursos humanos y se entrega a autoridades con convenio cuando lo exige un procedimiento.</div><div class="card pad0"><div class="tw"><table class="tbl"><thead><tr><th>Alias</th><th>Rol</th><th>Área</th><th class="num">Municipios en cartera</th><th>Conflicto de interés</th><th>Rotación</th><th>Doble factor</th></tr></thead><tbody>${USERS.map(u => `<tr><td class="mono">${u.id}</td><td>${ROLES[u.rol].n}</td><td class="tiny">${ROLES[u.rol].area}</td><td class="num">${u.cartera.length}</td><td>${u.coi === 'Firmada' ? chip('Firmada ' + u.coiF, 'ok') : chip('Pendiente: no puede actuar', 'bad')}</td><td class="mono tiny">${u.rot}</td><td class="tiny">${u.mfa}</td></tr>`).join('')}</tbody></table></div></div><div style="margin-top:10px;display:flex;gap:8px"><button class="btn" id="rot">Rotar carteras de dictaminadores</button><button class="btn ghost" id="coi">Registrar declaración de DIC-09</button></div>`;
    if (tab === 'acc') { const ev = S.ledger.slice(-40).reverse(); bd.innerHTML = `<div class="card pad0"><div class="tw" style="max-height:520px"><table class="tbl"><thead><tr><th>Fecha</th><th>Usuario</th><th>Factor</th><th>Origen</th><th>Acción</th><th>Objeto</th></tr></thead><tbody>${ev.map(e => `<tr><td class="mono tiny">${e.ts.replace('T', ' ').slice(0, 16)}</td><td class="mono tiny">${esc(e.actor)}</td><td class="tiny">${userById[e.actor] ? userById[e.actor].mfa : e.actor.startsWith('EMP') ? 'Certificado de cliente (API)' : 'Llave MX'}</td><td class="mono tiny">10.12.${(sha256Str(e.actor).charCodeAt(3) % 200)}.xxx</td><td class="tiny"><b>${esc(e.acc)}</b></td><td class="mono tiny">${esc(e.obj)}</td></tr>`).join('')}</tbody></table></div></div>`; }
    if (tab === 'cib') bd.innerHTML = `<div class="card">${CYBER.map(c => `<div class="chk"><span class="ic ${c[2] === 'ok' ? 'ok' : 'warn'}">${c[2] === 'ok' ? '✓' : '!'}</span><div><b>${esc(c[0])}</b><small>${esc(c[1])}</small></div></div>`).join('')}</div>`;
    if (tab === 'aud') { const lv = ledgerVerify(S.ledger); bd.innerHTML = `<div class="grid g3">${kpi({ l: 'Cadena de la bitácora', v: lv.ok ? 'Íntegra' : 'Rota', s: fmt(S.ledger.length) + ' registros', c: lv.ok ? '#2E7D32' : '#B3261E' })}${kpi({ l: 'Dictámenes con expediente reproducible', v: fmt(S.dictamenes.length), s: 'script + huellas SHA-256' })}${kpi({ l: 'Próxima auditoría externa', v: '2027-T1', s: 'institución por convenir', c: '#A8720F' })}</div>
      <div class="card" style="margin-top:14px"><div class="ch"><h3>Ciclo anual de la «auditoría de la auditoría»</h3></div><ol class="tiny" style="line-height:1.9;margin:6px 0 0 18px"><li>El auditor recibe acceso de sólo lectura (rol AUD-EXT) a la bitácora, expedientes y código.</li><li>Selecciona una muestra de dictámenes y reproduce cada resultado con el script del expediente.</li><li>Repite la evaluación de exactitud con una submuestra de campo propia.</li><li>Revisa la separación de funciones, conflictos de interés y rotación de carteras.</li><li>Prueba de penetración y revisión de controles de ciberseguridad.</li><li>Informe público y plan de corrección con fechas.</li></ol><button class="btn" id="pk" style="margin-top:10px">${icon('download', 14)} Paquete para el auditor (JSON)</button></div>`; }
    if (tab === 'con') bd.innerHTML = `<div class="card pad0"><div class="tw"><table class="tbl"><thead><tr><th>Requisito</th><th>Situación</th><th>Instrumento</th></tr></thead><tbody>${CONT.map(c => `<tr><td class="tiny">${esc(c[0])}</td><td>${chip(c[1], c[1].startsWith('Implementado') ? 'ok' : 'warn')}</td><td class="tiny">${esc(c[2])}</td></tr>`).join('')}</tbody></table></div></div><div class="note tiny" style="margin-top:10px">Lo marcado «Requiere…» no lo resuelve el software: depende de actos jurídicos, convenios o contratos. La plataforma ya está diseñada para que esos instrumentos se apoyen en ella.</div>`;
    const rot = $('#rot', bd); if (rot) rot.onclick = () => { const d = USERS.filter(u => u.rol === 'dictamen' && u.coi === 'Firmada'); const c0 = d[0].cartera; d[0].cartera = d[1].cartera; d[1].cartera = c0; ledgerAppend(S.ledger, 'Sistema', 'ROTACION_CARTERA', d.map(u => u.id).join(',')); toast('Carteras rotadas entre ' + d.map(u => u.id).join(' y ')); draw(); };
    const coi = $('#coi', bd); if (coi) coi.onclick = () => { const u = userById['DIC-09']; u.coi = 'Firmada'; u.coiF = todayIso(); ledgerAppend(S.ledger, 'DIC-09', 'DECLARACION_COI', 'DIC-09', sha256Str('COI' + u.coiF)); toast('Declaración registrada; DIC-09 ya puede actuar'); draw(); };
    const pk = $('#pk', bd); if (pk) pk.onclick = () => { download('paquete_auditor.json', JSON.stringify({ generado: new Date().toISOString(), metodologia: MET, parametros: PARAMS, bitacora: S.ledger, dictamenes: S.dictamenes.map(d => ({ folio: d.folio, uid: d.uid, sha256: d.hash, tipo: d.tipo, ts: d.ts })), usuarios: USERS.map(u => ({ id: u.id, rol: u.rol, coi: u.coi, rotacion: u.rot })), reglas: probarReglas() }, null, 1), 'application/json'); ledgerAppend(S.ledger, me().id, 'PAQUETE_AUDITOR', 'auditoria'); };
  };
  draw(); on(main, 'click', '#tb button', (e, b) => { tab = b.dataset.t; draw(); });
}

// ---------- API y diccionario de datos (bilingüe) ----------
export const DICT = [
  ['uid', 'texto', 'Identificador único de huerta (HUE-16MMM-NNNNN)', 'Unique orchard identifier', 'Público'],
  ['clave_senasica', 'texto', 'Clave de huerta registrada ante SENASICA', 'SENASICA orchard registration ID', 'Interinstitucional'],
  ['clave_catastral', 'texto', 'Clave catastral estatal', 'State cadastral ID', 'Interinstitucional'],
  ['nucleo_agrario', 'texto', 'Núcleo agrario (RAN), si aplica', 'Agrarian unit (RAN), if any', 'Interinstitucional'],
  ['rfc_curp', 'texto', 'RFC o CURP del titular (nunca público)', 'Holder tax/ID number (never public)', 'Reservado'],
  ['municipio', 'texto', 'Municipio (catálogo INEGI de 113)', 'Municipality (INEGI catalog of 113)', 'Público'],
  ['cultivo', 'catálogo', 'Cultivo (diseño multicultivo)', 'Crop (multi-crop design)', 'Público'],
  ['estado_legal', 'catálogo', 'Libre · En revisión · Con alerta · Bloqueado · En restauración · Rehabilitado', 'Clear · Under review · Flagged · Blocked · Under restoration · Rehabilitated', 'Público'],
  ['elegible', 'booleano', 'Elegible para exportación a la fecha de la lista', 'Export-eligible as of list version', 'Público'],
  ['ruptura_anio', 'entero', 'Año de ruptura de cobertura arbórea detectado', 'Detected tree-cover break year', 'Público'],
  ['ventana_conversion', 'intervalo', 'Fechas entre las que ocurrió la conversión', 'Dates bracketing the conversion', 'Público'],
  ['corte_estatal / corte_federal', 'catálogo', 'cumple · indeterminado · incumple', 'compliant · undetermined · non-compliant', 'Público'],
  ['folio_dictamen', 'texto', 'Folio del dictamen vigente', 'Current determination reference', 'Público'],
  ['sha256', 'hex', 'Huella del dictamen o archivo', 'Hash of determination or file', 'Público'],
  ['lote / embarque', 'texto', 'Identificadores de la cadena huerta → lote → empacadora → embarque', 'Chain-of-custody identifiers', 'Interinstitucional'],
];
export const DEFS = [
  ['Deforestación', 'Deforestation', 'Pérdida de bosque natural por su conversión a agricultura u otro uso no forestal, o por degradación severa y sostenida.', 'Loss of natural forest due to conversion to agriculture or other non-forest use, or severe and sustained degradation.'],
  ['Conversión', 'Conversion', 'Cambio de un ecosistema natural a otro uso del suelo, o cambio profundo en su composición, estructura o función.', 'Change of a natural ecosystem to another land use, or a profound change in its composition, structure or function.'],
  ['Fecha de corte', 'Cut-off date', 'Fecha después de la cual una deforestación o conversión hace que el área no sea elegible.', 'Date after which deforestation or conversion renders an area non-compliant.'],
  ['Ventana de conversión', 'Conversion window', 'Última observación con bosque y primera sin bosque; acota cuándo ocurrió el cambio.', 'Last forested and first non-forested observation bracketing the change.'],
];
const API = [
  { m: 'GET', p: '/ogc/collections', d: 'Colecciones disponibles (OGC API – Features)', en: 'Available collections (OGC API – Features)', sc: 'público', run: () => ({ collections: [{ id: 'huertas', title: 'Huertas' }, { id: 'elegibles', title: 'Huertas elegibles' }, { id: 'municipios', title: 'Municipios (113)' }] }) },
  { m: 'GET', p: '/ogc/collections/elegibles/items?limit=3', d: 'Huertas elegibles (GeoJSON, sin datos personales)', en: 'Eligible orchards (GeoJSON, no personal data)', sc: 'público', run: () => ({ type: 'FeatureCollection', numberMatched: elegibles().length, lista: listaVersion(), features: elegibles().slice(0, 3).map(h => ({ type: 'Feature', id: h.uid, properties: { uid: h.uid, municipio: munName[h.mun], cultivo: h.cul, estado_legal: h.estado }, geometry: { type: 'Point', coordinates: [0, 0] } })) }) },
  { m: 'GET', p: '/v1/elegibilidad/{uid}', d: 'Consulta de elegibilidad en la recepción', en: 'Eligibility lookup at reception', sc: 'empacadoras · SENASICA · APHIS', arg: true, run: a => elegibilidad(a) },
  { m: 'GET', p: '/v1/dictamenes/{folio}', d: 'Dictamen con huella, firma y sello', en: 'Determination with hash, signature, timestamp', sc: 'SEMARNAT · SENASICA · APHIS · PROFEPA · FGE', arg: true, run: a => { const d = S.dictamenes.find(x => x.folio === a) || S.dictamenes[0]; return d ? { folio: d.folio, sha256: d.hash, payload: d.pay, firma: d.firma, nom151: d.nom151 } : { error: 'no encontrado' }; } },
  { m: 'GET', p: '/v1/lotes?huerta={uid}', d: 'Lotes y embarques de una huerta', en: 'Lots and shipments of an orchard', sc: 'SENASICA · APHIS', arg: true, run: a => ({ lotes: S.lotes.filter(l => l.uid === a).slice(0, 10) }) },
  { m: 'GET', p: '/v1/lista-elegibles/version', d: 'Versión vigente de la lista y su huella', en: 'Current list version and hash', sc: 'público', run: () => listaVersion() },
];
const CONSUMERS = [['SEMARNAT', 'Insumo técnico del certificado federal', 'Dictámenes, expedientes, lista de elegibles'], ['SENASICA', 'Certificado fitosanitario', 'Elegibilidad por huerta, lotes'], ['APHIS / USDA', 'Reconocimiento de la contraparte', 'Lista de elegibles, metodología, exactitud'], ['PROFEPA y FGE', 'Denuncias y vistas', 'Expedientes de conversión, evidencia'], ['Secretaría de finanzas', 'Líneas de captura, ISN', 'Lotes verificados, padrón patronal'], ['IMSS', 'Trabajo digno', 'Cruce huerta-registro patronal']];
function api(main) {
  const draw = () => { main.innerHTML = hdr(t('API e interoperabilidad', 'API and interoperability'), t('Formatos estándar de intercambio (OGC API – Features y GeoJSON), diccionario de datos publicado y definiciones alineadas con marcos internacionales de cadenas libres de deforestación.', 'Standard exchange formats (OGC API – Features, GeoJSON), published data dictionary and definitions aligned with deforestation-free supply chain frameworks.'), `<button class="btn" id="oa">${icon('download', 14)} OpenAPI</button> <button class="btn ghost" id="dd">${icon('download', 14)} ${t('Diccionario', 'Dictionary')} CSV</button>`) +
    `<div class="card"><div class="ch"><h3>${t('Servicios', 'Endpoints')}</h3></div><div class="tw"><table class="tbl"><thead><tr><th></th><th>${t('Ruta', 'Path')}</th><th>${t('Descripción', 'Description')}</th><th>${t('Alcance', 'Scope')}</th><th></th></tr></thead><tbody>${API.map((a, i) => `<tr><td class="mono tiny">${a.m}</td><td class="mono tiny">${a.p}</td><td class="tiny">${t(a.d, a.en)}</td><td class="tiny">${a.sc}</td><td><button class="btn sm" data-try="${i}">${t('Probar', 'Try')}</button></td></tr>`).join('')}</tbody></table></div><div id="tr" style="margin-top:10px"></div></div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><div class="ch"><h3>${t('Consumidores institucionales', 'Institutional consumers')}</h3></div><table class="tbl" style="margin-top:6px"><tbody>${CONSUMERS.map(c => `<tr><td><b>${c[0]}</b></td><td class="tiny">${c[1]}</td><td class="tiny dim">${c[2]}</td></tr>`).join('')}</tbody></table><div class="note info tiny" style="margin-top:8px">${t('Diseño para que el dictamen estatal sea el insumo técnico del certificado federal (a formalizar por convenio): una sola fuente, sin dos sistemas que se contradigan.', 'Designed so the state determination is the technical input to the federal certificate (to be formalized by agreement): a single source of truth.')}</div></div>
    <div class="card"><div class="ch"><h3>${t('Definiciones', 'Definitions')}</h3></div>${DEFS.map(d => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${t(d[0], d[1])}</b><div class="tiny dim">${t(d[2], d[3])}</div></div>`).join('')}<div class="tiny dim" style="margin-top:6px">${t('Alineadas con el Accountability Framework initiative (AFi).', 'Aligned with the Accountability Framework initiative (AFi).')}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="ch"><h3>${t('Diccionario de datos', 'Data dictionary')}</h3></div><div class="tw"><table class="tbl"><thead><tr><th>${t('Campo', 'Field')}</th><th>${t('Tipo', 'Type')}</th><th>${t('Descripción', 'Description')}</th><th>${t('Acceso', 'Access')}</th></tr></thead><tbody>${DICT.map(d => `<tr><td class="mono tiny">${d[0]}</td><td class="tiny">${d[1]}</td><td class="tiny">${t(d[2], d[3])}</td><td>${chip(d[4], d[4] === 'Público' ? 'ok' : d[4] === 'Reservado' ? 'bad' : 'info')}</td></tr>`).join('')}</tbody></table></div></div>`;
    on(main, 'click', '[data-try]', (e, b) => { const a = API[+b.dataset.try]; const ex = a.p.includes('folio') ? (S.dictamenes[0] || {}).folio : elegibles()[0].uid; const run = arg => { const r = a.run(arg); ledgerAppend(S.ledger, me().id, 'API_' + a.p.split('/')[2].toUpperCase().replace(/[^A-Z]/g, ''), arg || a.p); $('#tr', main).innerHTML = `${a.arg ? `<div style="display:flex;gap:6px;margin-bottom:6px"><input id="ar" value="${esc(arg)}" style="flex:1" class="mono"><button class="btn sm pri" id="go">GET</button></div>` : ''}<pre class="mono tiny" style="max-height:320px;overflow:auto;background:#F2F4F0;border:1px solid var(--line);border-radius:8px;padding:10px;white-space:pre-wrap">${esc(JSON.stringify(r, null, 1))}</pre>`; const g = $('#go', main); if (g) g.onclick = () => run($('#ar', main).value.trim()); }; run(a.arg ? ex : null); });
    $('#dd', main).onclick = () => download('diccionario_datos.csv', 'campo,tipo,descripcion_es,description_en,acceso\n' + DICT.map(d => d.map(x => JSON.stringify(x)).join(',')).join('\n'), 'text/csv');
    $('#oa', main).onclick = () => download('openapi.json', JSON.stringify({ openapi: '3.0.3', info: { title: 'Módulo de Verificación y Dictamen Forestal', version: MET.ver, description: 'Demostración' }, paths: Object.fromEntries(API.map(a => [a.p.split('?')[0], { get: { summary: a.d, description: a.en, 'x-scope': a.sc } }])) }, null, 1), 'application/json');
  };
  draw();
}
export const views = { gobernanza, api };
