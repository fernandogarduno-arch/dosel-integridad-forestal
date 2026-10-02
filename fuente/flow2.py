import zipfile, subprocess, os, json, re, shutil
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/flow2'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
res = []
def ok(name, cond, extra=''): res.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name, extra)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); pg = b.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/platform/dist/index.html'); pg.wait_for_timeout(700)
    toast = lambda: pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent).slice(-1)[0]||''")
    def role(u): pg.select_option('#role', u); pg.wait_for_timeout(250)
    def go(portal, v): pg.evaluate(f"window.__go('{portal}','{v}')"); pg.wait_for_timeout(500)
    # 1. Triaje: dictaminador no puede validar; analista sí
    go('admin', 'triaje'); role('DIC-01'); go('admin', 'triaje')
    rows = pg.query_selector_all('#tb tbody tr.cl')
    # buscar una fila con huerta (no fuera del padrón)
    target = None
    for r in rows:
        if 'fuera del padrón' not in r.inner_text(): target = r.get_attribute('data-id'); break
    pg.click(f'tr.cl[data-id="{target}"]'); pg.wait_for_timeout(300)
    blocked = pg.inner_text('#pn')
    ok('Dictaminador bloqueado para validar alerta', 'reservada al rol' in blocked)
    huerta = re.search(r'HUE-\d+-\d+', blocked).group(0)
    # encontrar analista con cartera
    for u in ['DET-03', 'DET-07']:
        role(u); go('admin', 'triaje'); pg.click(f'tr.cl[data-id="{target}"]'); pg.wait_for_timeout(300)
        if 'Usted puede resolver' in pg.inner_text('#pn'): det = u; break
    pg.click('[data-a="validar"]'); pg.wait_for_timeout(300); ok('Analista valida alerta', 'validada' in toast(), toast())
    # 2. Expediente: campo → proyecto (SoD) → firme bloqueado por plazo
    go('admin', 'expedientes'); pg.click('#ft button[data-f="revision"]'); pg.wait_for_timeout(200)
    row = [r for r in pg.query_selector_all('#tb tbody tr.cl') if huerta in r.inner_text()][0]; case = row.get_attribute('data-id'); row.click(); pg.wait_for_timeout(200)
    role('CAM-02'); go('admin', 'expedientes'); pg.click('#ft button[data-f="todos"]'); pg.click(f'tr.cl[data-id="{case}"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="campo"]'); pg.wait_for_timeout(200); pg.click('#ok'); pg.wait_for_timeout(300); ok('Brigada registra visita de campo', 'Visita registrada' in toast())
    role(det); go('admin', 'expedientes'); pg.click('#ft button[data-f="todos"]'); pg.click(f'tr.cl[data-id="{case}"]'); pg.wait_for_timeout(200)
    ok('Analista no puede emitir proyecto de dictamen', 'reservada al rol' in pg.inner_text('#nx'))
    for u in ['DIC-01', 'DIC-04']:
        role(u); go('admin', 'expedientes'); pg.click('#ft button[data-f="todos"]'); pg.click(f'tr.cl[data-id="{case}"]'); pg.wait_for_timeout(200)
        if not pg.get_attribute('[data-act="proyecto"]', 'disabled') is not None: dic = u; break
    pg.click('[data-act="proyecto"]'); pg.wait_for_timeout(300); ok('Dictaminador notifica proyecto', 'registrada' in toast())
    pg.click(f'tr.cl[data-id="{case}"]'); pg.wait_for_timeout(200)
    ok('Dictamen firme bloqueado mientras corre el plazo', 'plazo de audiencia corre' in pg.inner_text('#nx'), pg.inner_text('#nx')[:120])
    # 3. Productor: alegatos
    go('productor', 'procedimientos'); pg.click('#lg'); pg.wait_for_timeout(400)
    btn = pg.query_selector('[data-al]'); ok('Productor tiene expediente en audiencia', btn is not None)
    pcase = btn.get_attribute('data-al'); btn.click(); pg.wait_for_timeout(200)
    open(f'{OUT}/factura.pdf', 'wb').write(b'%PDF-1.4 factura de planta 2016')
    pg.fill('#tx', 'La huerta se plantó en 2016; anexo factura.'); pg.set_input_files('#fi', f'{OUT}/factura.pdf'); pg.click('#ok'); pg.wait_for_timeout(500)
    ok('Productor presenta alegatos con prueba sellada', 'acuse' in toast(), toast())
    # 4. Dictamen firme con valoración obligatoria
    go('admin', 'expedientes'); pg.click('#ft button[data-f="audiencia"]'); pg.wait_for_timeout(200)
    for u in ['DIC-04', 'DIC-01']:
        role(u); go('admin', 'expedientes'); pg.click('#ft button[data-f="todos"]'); pg.click(f'tr.cl[data-id="{pcase}"]'); pg.wait_for_timeout(200)
        if pg.get_attribute('[data-act="firme"]', 'disabled') is None: break
    pg.click('[data-act="firme"]'); pg.wait_for_timeout(200); pg.click('#ok'); pg.wait_for_timeout(200)
    ok('No se firma sin valorar alegatos', 'motivar' in toast(), toast())
    pg.fill('#cn', 'La factura no acredita la fecha de plantación del polígono; la serie muestra bosque hasta 2024.'); pg.click('#ok'); pg.wait_for_timeout(500)
    folio = re.search(r'DIC-2026-\d+', toast()); ok('Dictamen firme emitido', folio, toast()); folio = folio.group(0)
    # 5. Descargar expediente y reproducir
    go('admin', 'dictamenes'); pg.click(f'tr.cl[data-id="{folio}"]'); pg.wait_for_timeout(300)
    ok('Dictamen íntegro', 'Íntegro' in pg.inner_text('#pn'))
    with pg.expect_download() as d: pg.click('#zip')
    z = f'{OUT}/exp.zip'; d.value.save_as(z); zipfile.ZipFile(z).extractall(f'{OUT}/exp')
    r = subprocess.run(['python3', 'reproducir.py'], cwd=f'{OUT}/exp', capture_output=True, text=True)
    ok('Expediente reproducible: script coincide', r.returncode == 0 and 'COINCIDE con' in r.stdout, r.stdout.strip().splitlines()[-1])
    import hashlib
    ok('Huella del texto canónico = huella del dictamen', hashlib.sha256(open(f'{OUT}/exp/dictamen_canonico.json', 'rb').read()).hexdigest() == json.load(open(f'{OUT}/exp/dictamen.json'))['sha256'])
    # alterar un archivo → el script lo detecta
    with open(f'{OUT}/exp/serie_cobertura.csv', 'a') as f: f.write('2027,1.0,x,y\n')
    r2 = subprocess.run(['python3', 'reproducir.py'], cwd=f'{OUT}/exp', capture_output=True, text=True)
    ok('Alterar la serie rompe la reproducción', r2.returncode == 1 and 'ALTERADOS' in r2.stdout)
    pg.click('#tp'); pg.wait_for_timeout(200); ok('Alteración del dictamen detectada', 'ALTERADO' in pg.inner_text('#pn'))
    # reproducir TODOS los dictámenes sembrados
    n = pg.evaluate("document.querySelectorAll('#tb tbody tr.cl').length"); fails = 0; checked = 0
    for i in range(min(n, 25)):
        fid = pg.query_selector_all('#tb tbody tr.cl')[i].get_attribute('data-id'); pg.click(f'tr.cl[data-id="{fid}"]'); pg.wait_for_timeout(120)
        with pg.expect_download() as d: pg.click('#zip')
        zp = f'{OUT}/z{i}.zip'; d.value.save_as(zp); dd = f'{OUT}/z{i}'; zipfile.ZipFile(zp).extractall(dd)
        rr = subprocess.run(['python3', 'reproducir.py'], cwd=dd, capture_output=True, text=True); checked += 1; fails += rr.returncode != 0
        if rr.returncode: print(rr.stdout)
    ok(f'Reproducción de {checked} dictámenes', fails == 0, f'{fails} fallas')
    # 6. Segunda instancia
    go('admin', 'segunda'); role('DIC-01'); go('admin', 'segunda')
    pend = [r.get_attribute('data-id') for r in pg.query_selector_all('#tb tbody tr.cl') if 'Pendiente' in r.inner_text()]
    blocked_any = False
    for cid in pend:
        pg.click(f'tr.cl[data-id="{cid}"]'); pg.wait_for_timeout(150)
        if 'reservada al rol' in pg.inner_text('#pn') or 'Quien dictaminó' in pg.inner_text('#pn'): blocked_any = True; break
    ok('Dictaminador no resuelve apelación', blocked_any)
    role('REV-01'); go('admin', 'segunda'); pg.click(f'tr.cl[data-id="{pend[0]}"]'); pg.wait_for_timeout(200); pg.select_option('#se', 'revoca'); pg.fill('#mo', 'La ventana se superpone al corte.'); pg.click('#ok'); pg.wait_for_timeout(300)
    ok('Revisor de 2a instancia resuelve', 'resuelto' in toast(), toast())
    # 7. Compensación doble uso
    role('DIC-01'); go('admin', 'compensaciones'); pg.click('#nw'); pg.wait_for_timeout(200)
    opts = pg.eval_on_selector_all('#po option', 'o=>o.map(x=>x.value)'); pg.select_option('#po', opts[1]); pg.click('#ok'); pg.wait_for_timeout(300)
    ok('Doble uso de compensación rechazado', 'no puede usarse dos veces' in toast(), toast()[:90])
    pg.select_option('#po', 'new')
    if pg.is_enabled('#pex'): pg.select_option('#pau', 'PROFEPA'); pg.fill('#pex', 'PFPA/23.2/2C.27.2/0099-26')
    pg.click('#ok'); pg.wait_for_timeout(300); t = toast()
    ok('Compensación nueva registrada', 'registrada' in t, t[:90])
    # 8. Empacadora
    go('empacadora', 'recepcion'); links = pg.query_selector_all('[data-u]'); links[0].click(); pg.fill('#tn', '9'); pg.click('#ok'); pg.wait_for_timeout(300)
    ok('Empacadora: huerta bloqueada rechazada', 'rechazada' in pg.inner_text('#out'))
    pg.evaluate("window.__go('empacadora','recepcion')"); pg.wait_for_timeout(300); links = pg.query_selector_all('[data-u]'); links[1].click(); pg.fill('#tn', '9'); pg.click('#ok'); pg.wait_for_timeout(300)
    ok('Empacadora: exceso de capacidad rechazado', 'capacidad' in pg.inner_text('#out'))
    pg.evaluate("window.__go('empacadora','recepcion')"); pg.wait_for_timeout(300); pg.click('#ok'); pg.wait_for_timeout(300)
    ok('Empacadora: huerta elegible aceptada', 'autorizada' in pg.inner_text('#out'), pg.inner_text('#out')[:60])
    # 9. Gobernanza
    go('admin', 'gobernanza'); import re as _re; _m = _re.search(r'(\d+)/(\d+) correctas', pg.inner_text('#bd')); ok('Pruebas automáticas de reglas', bool(_m) and _m.group(1) == _m.group(2) and int(_m.group(1)) >= 20, _m.group(0) if _m else [x.inner_text().replace('\n', ' | ')[:200] for x in pg.query_selector_all('#bd .chk') if 'bad' in (x.get_attribute('class') or '') or '✕' in x.inner_text()][:5] or pg.inner_text('#bd')[:300])
    # 10. Bitácora
    go('admin', 'bitacora'); pg.click('#vf'); pg.wait_for_timeout(200); ok('Bitácora íntegra tras las acciones', 'Cadena íntegra' in pg.inner_text('#main'))
    # 11. Público bilingüe
    pg.click('#lang button[data-l="en"]'); go('ciudadano', 'elegibilidad'); pg.click('[data-q]'); pg.wait_for_timeout(300)
    t = pg.inner_text('#main'); ok('Consulta pública en inglés', 'Eligible' in t and 'identity withheld' in t)
    ok('Sin nombres de dictaminador en vista pública', not re.search(r'DIC-\d', t))
    pg.click('#lang button[data-l="es"]')
    ok('Sin errores de página', not errs, errs[:3])
    b.close()
print('\n', sum(r[1] for r in res), '/', len(res), 'pruebas correctas')
