import random
from playwright.sync_api import sync_playwright
views = {'ciudadano':['inicio','mapa','municipios','indicadores','restauracion','datos','metodologia','cuentas','denuncia'],
 'productor':['panel','predios','tramites','levantamiento','restauracion','avisos'],
 'admin':['centro','gis','padron','alertas','semaforo','restauracion','indicadores','lidar','ingesta','fuentes','bitacora']}
random.seed(3)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
    pg = ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' and 'ERR_' not in m.text else None)
    pg.goto('file:///home/claude/platform/dist/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("window.__go('productor','panel')"); pg.wait_for_timeout(200); pg.click('button#lg'); pg.wait_for_timeout(500)
    for portal, vs in views.items():
        for v in vs:
            pg.evaluate(f"window.__go('{portal}','{v}')"); pg.wait_for_timeout(600)
            for rnd in range(14):
                els = pg.query_selector_all('#main button:visible, #main .tabs button:visible, #main [data-open]:visible, #main a.btn:visible, #main tr[data-id]:visible, #main .pill-tabs button:visible')
                els = [e for e in els if e.is_enabled()]
                if not els: break
                e = random.choice(els)
                n=len(errs)
                try:
                    txt = (e.inner_text() or '')[:30].replace('\n',' ')
                    e.click(timeout=1500, no_wait_after=True)
                except Exception as ex:
                    continue
                pg.wait_for_timeout(250)
                if len(errs)>n: print(portal,v,'CLICK',repr(txt),'=>',errs[n:])
                # close modals
                pg.keyboard.press('Escape')
                pg.evaluate("document.querySelectorAll('.modal-bg,.modal').forEach(m=>m.remove())")
                if pg.evaluate("location.hash").split('/')[2] != v:
                    pg.evaluate(f"window.__go('{portal}','{v}')"); pg.wait_for_timeout(300)
    print('DONE', len(errs), 'errors'); 
    for e in errs[:20]: print(e)
    b.close()
