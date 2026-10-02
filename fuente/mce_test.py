"""Pruebas del MCE (guía de integración): reglas de corte, tres semáforos, roles restringidos con 2FA,
verificador público por folio/QR, paquete UE, OWP, CAE, SLA de balance, dictamen de dos condiciones y portal público."""
import os, re, shutil, zipfile, hashlib, json
from playwright.sync_api import sync_playwright
OUT = '/home/claude/platform/shots/mce'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
URL = 'file:///home/claude/platform/dist/index.html'
res = []
def ok(n, c, x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, str(x)[:180])
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); pg = b.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(1000)
    go = lambda po, v: (pg.evaluate(f"window.__go('{po}','{v}')"), pg.wait_for_timeout(600))
    toast = lambda: pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent).slice(-1)[0]||''")
    main = lambda: pg.text_content('#main')  # textContent: sin text-transform
    close = lambda: pg.evaluate("document.querySelectorAll('.overlay').forEach(o=>o.remove())")
    def role(uid):
        pg.select_option('#role', uid); pg.wait_for_timeout(350)

    # ---- M2 · tres reglas de corte, sin conciliación ----
    go('admin', 'cortes'); t = main()
    ok('Tres reglas de corte visibles', all(k in t for k in ['Pro-Forest', 'xportación', 'restauración']), '')
    ok('Matriz Pro-Forest × exportación', 'Regla Pro-Forest' in t and 'Regla de exportación' in t)
    ok('Tabla «exportables, no Pro-Forest»', 'Exportables, no Pro-Forest' in t)
    ok('Registro de parámetros y bloqueos externos', 'Bloqueos externos' in t or 'bloqueos externos' in t.lower())
    ok('Sin «se aplica el más estricto»', 'más estricto' not in t and 'más restrictivo' not in t)
    pg.screenshot(path=f'{OUT}/01_cortes.png')

    # ---- M1 · expediente de tres semáforos y cambio con evidencia ----
    role('DIC-01'); go('admin', 'huertas')
    ok('Registro con columna F·A·L', 'Semáforos F · A · L' in main())
    pg.click('#tb tbody tr.cl'); pg.wait_for_timeout(500); d = pg.text_content('.drawer')
    ok('Ficha: expediente de tres semáforos', 'Expediente de tres semáforos' in d)
    ok('Ficha: detección (GF) separada de dictamen (autoridad)', 'GUARDIÁN FORESTAL' in d.upper() and 'AUTORIDAD ESTATAL' in d.upper())
    ok('Ficha: prueba de dos condiciones', 'CUSTF' in d)
    pg.click('#semx'); pg.wait_for_timeout(300); pg.select_option('.modal #sk', 'fito'); pg.select_option('.modal #sc', 'verde'); pg.click('.modal #ok'); pg.wait_for_timeout(250)
    ok('Cambio de semáforo sin evidencia rechazado', 'evidencia_id' in toast(), toast())
    pg.select_option('.modal #sk', 'amb'); pg.fill('.modal #se', 'EV-1'); pg.click('.modal #ok'); pg.wait_for_timeout(250)
    ok('Semáforo ambiental no cambia a mano', 'procedimiento' in toast(), toast())
    pg.select_option('.modal #sk', 'fito'); pg.fill('.modal #se', 'SICOA-2026-000123'); pg.click('.modal #ok'); pg.wait_for_timeout(400)
    ok('Cambio con evidencia registrado', 'bitácora' in toast(), toast())
    close(); pg.evaluate("document.querySelectorAll('.drawer').forEach(o=>o.remove())")
    pg.screenshot(path=f'{OUT}/02_huertas.png')

    # ---- A3 · modos de dictamen y entrega a SEMARNAT ----
    go('admin', 'huertas'); pg.click('#tb tbody tr.cl'); pg.wait_for_timeout(400); pg.click('#emit'); pg.wait_for_timeout(300)
    opts = pg.eval_on_selector_all('.modal #dm option', 'os=>os.map(o=>o.textContent)')
    ok('Dictamen con dos modos', len(opts) == 2 and 'SEMARNAT' in opts[1], opts)
    pg.select_option('.modal #dm', index=1); pg.fill('.modal #dj', 'Prueba de modo insumo técnico'); pg.click('.modal #ok'); pg.wait_for_timeout(500)
    tt = toast(); folio = (re.findall(r'DIC-\d{4}-\d+', tt) or [''])[0]
    ok('Dictamen en modo insumo técnico emitido', bool(folio), tt)
    close(); go('admin', 'dictamenes')
    ok('Columna Modo en dictámenes', 'Modo' in main())
    if folio:
        pg.click(f'tr.cl[data-id="{folio}"]'); pg.wait_for_timeout(300)
        btn = pg.query_selector('#sem'); ok('Botón «Entregar a SEMARNAT»', btn is not None)
        if btn: btn.click(); pg.wait_for_timeout(300); ok('Entrega a SEMARNAT registrada', 'SEMARNAT' in toast(), toast())
        with pg.expect_download() as dz: pg.click('#zip')
        zp = f'{OUT}/dic.zip'; dz.value.save_as(zp); zipfile.ZipFile(zp).extractall(f'{OUT}/dic')
        dj = json.load(open(f'{OUT}/dic/dictamen.json'))
        pay = dj.get('payload', dj)
        ok('Dictamen lleva reglas y condición forestal', 'reglas' in json.dumps(dj) and 'condicion_forestal' in json.dumps(dj))
        import subprocess
        r = subprocess.run(['python3', 'reproducir.py'], cwd=f'{OUT}/dic', capture_output=True, text=True)
        ok('Reproducción del dictamen (reglas y condición)', r.returncode == 0 and 'COINCIDE' in r.stdout, r.stdout.strip().splitlines()[-1] if r.stdout else r.stderr[-200:])

    # ---- M4 · procedimiento de autoridad obligatorio para «En restauración» ----
    go('admin', 'compensaciones'); pg.click('#nw'); pg.wait_for_timeout(250)
    ok('Compensación pide procedimiento de autoridad', pg.query_selector('.modal #pex') is not None)
    if pg.is_enabled('.modal #pex'):
        pg.select_option('.modal #po', 'new'); pg.click('.modal #ok'); pg.wait_for_timeout(350)
        msgs = pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent).join(' | ')")
        ok('Sin procedimiento no pasa a «En restauración»', 'procedimiento de autoridad' in msgs, msgs[-160:])
    close()
    go('admin', 'compensaciones'); ok('Toda huerta en restauración con procedimiento', 'Toda huerta en restauración tiene procedimiento' in main(), '')

    # ---- M9 · roles restringidos con segundo factor ----
    go('admin', 'seguridad'); ok('Dictaminador no ve Seguridad', 'Seguridad de brigadas' not in main() or 'restringid' in main().lower(), main()[:80])
    pg.select_option('#role', 'SEG-01'); pg.wait_for_timeout(300)
    ok('Rol Seguridad pide segundo factor', pg.query_selector('.modal #otp') is not None)
    pg.fill('.modal #otp', '000000'); pg.click('.modal #otpok'); pg.wait_for_timeout(250)
    ok('Código incorrecto rechazado', 'incorrecto' in toast().lower(), toast())
    code = pg.evaluate("[...document.querySelectorAll('.modal .mono')].map(e=>e.textContent.trim()).find(x=>/^\\d{6}$/.test(x))")
    pg.fill('.modal #otp', code); pg.click('.modal #otpok'); pg.wait_for_timeout(500)
    go('admin', 'seguridad'); t = main()
    ok('Seguridad: capa visible con 2FA', 'Seguridad de brigadas' in t and 'Protocolo de brigada' in t)
    ok('Seguridad: datos marcados como ficticios', 'ficticios' in t)
    pg.click('#ro'); pg.wait_for_timeout(400); ok('Registro de ruta abierto', 'abierto' in toast(), toast())
    pg.screenshot(path=f'{OUT}/03_seguridad.png')
    pg.select_option('#role', 'FIN-01'); pg.wait_for_timeout(300)
    code = pg.evaluate("[...document.querySelectorAll('.modal .mono')].map(e=>e.textContent.trim()).find(x=>/^\\d{6}$/.test(x))"); pg.fill('.modal #otp', code); pg.click('.modal #otpok'); pg.wait_for_timeout(500)
    go('admin', 'expedientes'); ok('Finanzas no ve expedientes', 'restringid' in main().lower() or 'no tiene acceso' in main().lower(), main()[:100])
    go('admin', 'recaudacion'); ok('Finanzas ve «Finanzas (interno)»', 'Finanzas (interno)' in main())
    nav = pg.inner_text('nav') if pg.query_selector('nav') else pg.inner_text('#side')
    ok('Menú filtrado por rol', 'Seguridad de brigadas' not in nav, '')
    role('DIC-01')

    # ---- Verificador público por folio / QR ----
    go('admin', 'origen'); cao = (re.findall(r'CAO-2627-[0-9A-F]{6}', main()) or [''])[0]
    ok('Folio CAO disponible', bool(cao), cao)
    pg.goto(URL + '#/verificar/' + cao); pg.wait_for_timeout(1300); t = main()
    ok('Ruta pública #/verificar/{folio}', 'Verificar folio' in t and cao in pg.input_value('#vf'), t[:80])
    ms = re.search(r'Verificado en ([\d.]+) ms', t); ok('Respuesta del verificador < 10 s', ms and float(ms.group(1)) < 10000, ms.group(0) if ms else '')
    ok('Verificador con QR', pg.query_selector('#main svg[aria-label="Código QR"]') is not None)
    ok('Folio CAO reconocido', 'Constancia ambiental de origen' in t and 'no encontrado' not in t.lower(), '')
    pg.fill('#vf', 'CAO-2627-999999'); pg.click('#vgo'); pg.wait_for_timeout(300)
    ok('Folio inexistente: no encontrado', 'no encontrado' in main().lower())
    pg.screenshot(path=f'{OUT}/04_verificar.png')

    # ---- M10 · paquete UE por lote ----
    pg.goto(URL); pg.wait_for_timeout(900); role('DIC-01'); go('admin', 'paquete-ue'); pg.click('#pg'); pg.wait_for_timeout(500); t = main()
    m = re.search(r'Paquete generado en (\d+) ms', t); ok('Paquete UE en menos de un minuto', m and int(m.group(1)) < 60000, m.group(0) if m else t[:100])
    with pg.expect_download() as dz: pg.click('#dz')
    zp = f'{OUT}/ue.zip'; dz.value.save_as(zp); zf = zipfile.ZipFile(zp); names = set(zf.namelist())
    ok('Paquete con GeoJSON, JSON, PDF y manifiesto', {'paquete.geojson', 'dictamen_condicion_forestal.json', 'cadena.json', 'paquete.pdf', 'MANIFEST.sha256'} <= names, sorted(names))
    man = dict((l.split('  ')[1], l.split('  ')[0]) for l in zf.read('MANIFEST.sha256').decode().strip().splitlines())
    ok('Manifiesto SHA-256 coincide', all(hashlib.sha256(zf.read(n)).hexdigest() == h for n, h in man.items()))
    ok('PDF válido', zf.read('paquete.pdf')[:5] == b'%PDF-')
    gj = json.loads(zf.read('paquete.geojson')); ok('GeoJSON con polígono y fecha de corte', gj['features'][0]['geometry']['type'] in ('Polygon', 'MultiPolygon') and '2019' in json.dumps(gj['features'][0]['properties']))
    pg.screenshot(path=f'{OUT}/05_paquete.png')

    # ---- Trazabilidad: OWP y constancia de exportador ----
    go('admin', 'trazabilidad'); pg.locator('[data-t]').first.click(); pg.wait_for_timeout(500); t = main()
    ok('OWP vacío por defecto (parámetro, no supuesto)', 'Geocerca' in t and ('Vacío' in t or 'vacío' in t or 'pendiente' in t.lower()))
    if pg.query_selector('#owpl'):
        pg.click('#owpl'); pg.wait_for_timeout(400); ok('Catálogo OWP demo cargado con aviso', 'demostración' in pg.inner_text('#owp').lower())
        pg.click('#owpx'); pg.wait_for_timeout(300)
    cae = pg.query_selector('[data-cae]'); ok('Constancia de exportador disponible', cae is not None)
    if cae:
        cae.click(); pg.wait_for_timeout(400); mt = pg.inner_text('.modal'); ok('CAE con pedimento o huertas amparadas', 'CAE-' in mt and ('amparad' in mt.lower() or 'pedimento' in mt.lower()), mt[:120])
        close()

    # ---- SLA de balance y CLA ----
    go('admin', 'balance'); t = main(); ok('Balance: SLA 72 h y umbral 1.30', '72' in t and ('1.3' in t or '130' in t))
    ok('Factor técnico pendiente de DOF', pg.query_selector('input[placeholder*="pendiente de DOF"]') is not None)
    go('admin', 'laboral'); t = main(); ok('Laboral: fases del CLA', 'CLA' in t and 'REPSE' in t)

    # ---- NFR ----
    go('admin', 'gobernanza'); pg.click('#tb button[data-t="nfr"]'); pg.wait_for_timeout(300)
    pg.click('#ld'); pg.wait_for_timeout(2500); ok('Prueba de carga 59 mil', '59' in pg.inner_text('#ldo'), pg.inner_text('#ldo')[:100])
    pg.click('#vt'); pg.wait_for_timeout(1500); ok('Medición del verificador', 'ms' in pg.inner_text('#vto'), pg.inner_text('#vto')[:100])

    # ---- Portal público ----
    go('ciudadano', 'elegibilidad'); pg.locator('[data-q]').first.click(); pg.wait_for_timeout(400); t = main(); ok('Elegibilidad pública: tres reglas y separación detección/dictamen', 'Pro-Forest' in t and ('dictamen' in t.lower()))
    go('ciudadano', 'inicio'); t = main(); ok('Panorama: definiciones y semáforo de exportación', 'reversibilidad' in t.lower())
    go('ciudadano', 'municipios'); ok('Resultado del dictamen por municipio', 'Resultado del dictamen por municipio' in main())
    go('ciudadano', 'cuentas'); ok('Informe de auditoría externa', 'auditoría externa' in main().lower())
    go('ciudadano', 'datos'); t = main(); ok('Diccionario bilingüe en datos abiertos', 'regla_exportacion' in t and 'Diccionario de datos' in t)
    pg.click('#lng button[data-l="en"]'); pg.wait_for_timeout(200); ok('Diccionario en inglés', 'Export rule' in pg.inner_text('#dict'))
    ok('Diccionario: RFC reservado', 'Reserved' in pg.inner_text('#dict'))
    go('ciudadano', 'metodologia'); t = main(); ok('Metodología: dos semáforos y tres reglas', 'Dos semáforos distintos' in t and 'Regla de exportación' in t)
    pub = ''.join(pg.inner_text('#main') for _ in [0])
    ok('Sin RFC ni NUC en vistas públicas', not re.search(r'\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b', pub) and 'NUC' not in pub)

    # ---- Productor ----
    go('productor', 'predios')
    if pg.query_selector('#lg'): pg.click('#lg'); pg.wait_for_timeout(500)
    t = main(); ok('Productor: semáforos de exportación F·A·L', 'Exportación F·A·L' in t and 'Expediente de exportación' in t)
    pg.screenshot(path=f'{OUT}/06_productor.png')

    # ---- Arbolín: tres reglas ----
    go('ciudadano', 'inicio'); pg.click('#arb-fab'); pg.wait_for_timeout(500)
    pg.fill('#arb-q', '¿Qué fecha de corte se aplica?'); pg.press('#arb-q', 'Enter'); pg.wait_for_timeout(900)
    txt = pg.text_content('#arb-log').lower()
    ok('Arbolín explica tres reglas separadas', 'tres reglas' in txt and 'pro-forest' in txt, txt[-200:])
    # ---- Folio de constancia estable (el QR impreso no se rompe con nuevas entregas) ----
    if pg.is_visible('#arb-x'): pg.click('#arb-x'); pg.wait_for_timeout(300)
    go('ciudadano', 'elegibilidad'); pg.fill('#q', 'HUE-16044-00037'); pg.click('#go'); pg.wait_for_timeout(400); f1 = re.findall(r'CAO-2627-[0-9A-F]{6}', main())
    go('empacadora', 'recepcion'); pg.fill('#uid', 'HUE-16044-00037'); pg.fill('#tn', '1'); pg.click('#ok'); pg.wait_for_timeout(500); f2 = set(re.findall(r'CAO-2627-[0-9A-F]{6}', main()))
    ok('Folio de constancia estable tras una entrega', bool(f1) and f2 == {f1[0]}, (f1[:1], f2))
    ok('Sin errores de página', not errs, errs[:3])
    b.close()
print('\n', sum(res), '/', len(res), 'pruebas correctas')
