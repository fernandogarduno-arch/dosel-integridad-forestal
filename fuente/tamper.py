from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1440,'height':900})
    errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/platform/dist/index.html'); pg.wait_for_timeout(500)
    for tp in ['nube','foto','traj']:
        pg.evaluate("window.__go('productor','levantamiento')"); pg.wait_for_timeout(300)
        if pg.query_selector('button#lg'): pg.click('button#lg'); pg.wait_for_timeout(500); pg.evaluate("window.__go('productor','levantamiento')"); pg.wait_for_timeout(300)
        pg.click('#smp'); pg.wait_for_timeout(2500)
        pg.click('#seal'); pg.wait_for_timeout(600)
        pg.click(f'[data-tp={tp}]'); pg.wait_for_timeout(3000)
        v = pg.inner_text('#out .verdict').replace('\n',' | ')
        bad = pg.eval_on_selector_all('#out .chk', "els=>els.filter(e=>e.querySelector('.ic.fail,.ic.warn')).map(e=>e.innerText.replace(/\\n/g,' :: '))")
        print(tp,'=>',v[:140]); [print('    ',x[:230]) for x in bad]
        if tp=='nube': pg.evaluate("document.querySelector('#main').scrollTo(0,0)"); pg.screenshot(path='shots/tamper_nube.png')
    print(errs)
    b.close()
