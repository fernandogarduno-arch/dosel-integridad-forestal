from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); pg = b.new_page(viewport={'width':390,'height':800}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/platform/dist/index.html'); pg.wait_for_timeout(800); pg.screenshot(path='shots/m_inicio.png')
    pg.evaluate("window.__go('ciudadano','mapa')"); pg.wait_for_timeout(800); pg.screenshot(path='shots/m_mapa.png')
    print(pg.evaluate("document.documentElement.scrollWidth"), errs); b.close()
