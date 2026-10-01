import sys, json
from playwright.sync_api import sync_playwright
views = {
 'ciudadano':['inicio','mapa','elegibilidad','municipios','indicadores','restauracion','metodo','datos','metodologia','cuentas','denuncia'],
 'productor':['panel','procedimientos','predios','tramites','levantamiento','restauracion','avisos'],
 'empacadora':['recepcion','lotes','integracion'],
 'admin':['centro','gis','huertas','triaje','expedientes','dictamenes','segunda','cortes','exactitud','semaforo','lidar','fuentes','balance','compensaciones','recaudacion','laboral','bitacora','gobernanza','guardian','visor','api','ingesta','padron','alertas','restauracion','indicadores'],
}
only = sys.argv[1:]  # optional filter portal/view
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1440,'height':900})
    errs=[]
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    pg.on('console', lambda m: errs.append(('console',m.text)) if m.type=='error' and 'fonts' not in m.text and 'ERR_' not in m.text else None)
    pg.goto('file:///home/claude/platform/dist/index.html')
    pg.wait_for_timeout(800)
    pg.evaluate("document.querySelector('#lg') && 0")
    for portal, vs in views.items():
        for v in vs:
            if only and f'{portal}/{v}' not in only: continue
            n=len(errs)
            pg.evaluate(f"window.__go('{portal}','{v}')")
            pg.wait_for_timeout(900)
            txt = pg.inner_text('#main')[:60].replace('\n',' | ')
            pg.screenshot(path=f'shots/{portal}_{v}.png')
            print(portal, v, 'ERR' if len(errs)>n else 'ok', '::', txt)
            for e in errs[n:]: print('   ', e)
    b.close()
