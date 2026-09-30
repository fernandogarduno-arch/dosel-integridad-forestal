from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1440,'height':900})
    errs=[]
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    pg.on('console', lambda m: errs.append(('console',m.text)) if m.type=='error' and 'ERR_' not in m.text else None)
    pg.goto('file:///home/claude/platform/dist/index.html'); pg.wait_for_timeout(600)
    # productor
    pg.evaluate("window.__go('productor','panel')"); pg.wait_for_timeout(400)
    pg.click('#lg'); pg.wait_for_timeout(800)
    pg.screenshot(path='shots/prod_panel.png')
    for v in ['predios','tramites','restauracion','avisos']:
        pg.evaluate(f"window.__go('productor','{v}')"); pg.wait_for_timeout(700); pg.screenshot(path=f'shots/prod_{v}.png'); print(v,'ok',errs[-1:] )
    pg.evaluate("window.__go('productor','levantamiento')"); pg.wait_for_timeout(700)
    pg.click('#smp'); pg.wait_for_timeout(1500)
    pg.click('#ver'); pg.wait_for_timeout(2500)
    pg.screenshot(path='shots/lev_verified.png', full_page=False)
    print('after verify:', pg.inner_text('#out')[:300].replace('\n',' | ') if pg.query_selector('#out') else 'no #out')
    if pg.query_selector('#seal'):
        pg.click('#seal'); pg.wait_for_timeout(1500)
    pg.click('[data-tp=nube]'); pg.wait_for_timeout(3000)
    pg.screenshot(path='shots/lev_tamper.png')
    pg.evaluate("document.querySelector('#main').scrollTo(0, 99999)"); pg.wait_for_timeout(300)
    pg.screenshot(path='shots/lev_tamper2.png')
    print('after tamper:', pg.inner_text('#main')[-900:].replace('\n',' | '))
    print('ERRS', errs)
    b.close()
