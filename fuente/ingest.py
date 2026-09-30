from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); pg = b.new_page(viewport={'width':1440,'height':900}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/platform/dist/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("window.__go('admin','ingesta')"); pg.wait_for_timeout(500)
    for f,t in [('/tmp/padron_hist.geojson','predios'),('/tmp/alertas_hist.csv','alertas')]:
        pg.evaluate("window.__go('admin','ingesta')"); pg.wait_for_timeout(300)
        pg.click(f'[data-t={t}]'); pg.click('#nx'); pg.wait_for_timeout(200)
        pg.fill('#m-nombre', 'Padron historico '+t); pg.fill('#m-fuente','SENASICA'); pg.click('#nx'); pg.wait_for_timeout(200)
        pg.set_input_files('#fi', f); pg.wait_for_timeout(300); pg.click('#nx'); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'shots/ing_{t}_val.png')
        print(t, pg.inner_text('#vr')[:400].replace('\n',' | '))
        pg.click('#nx'); pg.wait_for_timeout(300); pg.click('#pub'); pg.wait_for_timeout(600)
    pg.screenshot(path='shots/ing_done.png')
    pg.evaluate("window.__go('admin','gis')"); pg.wait_for_timeout(1000); pg.screenshot(path='shots/ing_gis.png')
    print(errs)
    b.close()
