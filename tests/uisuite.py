exec(open(__import__('pathlib').Path(__file__).with_name('uitest.py')).read())
results=[]
def check(name, ok, detail=''):
    results.append((ok, name, detail)); print(('PASS ' if ok else 'FAIL ')+name+(f'  [{detail}]' if detail else ''))
geom="""(() => { const w=document.getElementById('tablewrap').getBoundingClientRect(); const t=document.querySelector('#tablewrap table').getBoundingClientRect();
  return {wrapBottom:w.bottom, wrapRight:w.right, wrapWidth:w.width, tableWidth:t.width, vh:innerHeight, vw:innerWidth,
          hScroll: document.getElementById('tablewrap').scrollWidth > document.getElementById('tablewrap').clientWidth,
          vScroll: document.getElementById('tablewrap').scrollHeight > document.getElementById('tablewrap').clientHeight,
          pageScrollsSideways: document.documentElement.scrollWidth > innerWidth}; })()"""
with sync_playwright() as p:
    b,pg,errs=setup(p, 1600, 800)
    views=[o.inner_text() for o in pg.query_selector_all('#viewsel option')]
    # 1. every view: consistent cells, sensible width
    for i,v in enumerate(views):
        pg.select_option('#viewsel', str(i)); c=consistency(pg); g=pg.evaluate(geom)
        check(f'view "{v}": every row has {c["columns"]} cells, totals too', c['rowsWithWrongCellCount']==0 and c['totalsCells']==c['columns'] and c['rows']==42)
        check(f'view "{v}": table area inside the window (scrollbars reachable)', g['wrapBottom']<=g['vh'] and g['wrapRight']<=g['vw']+1 and not g['pageScrollsSideways'], f"bottom {g['wrapBottom']:.0f}/{g['vh']}")
        if v!='All columns': check(f'view "{v}": table no wider than its content', g['tableWidth']<=g['wrapWidth']+1 and g['wrapWidth']<g['vw']-40 or g['hScroll'], f"table {g['tableWidth']:.0f}px")
    # 2. sticky header and first column while scrolling inside the box
    pg.select_option('#viewsel', str(views.index('All columns')))
    pg.evaluate("document.getElementById('tablewrap').scrollTop=400; document.getElementById('tablewrap').scrollLeft=600")
    st=pg.evaluate("""(() => { const w=document.getElementById('tablewrap').getBoundingClientRect(); const th=document.querySelector('#headrow th:nth-child(3)').getBoundingClientRect();
        const first=document.querySelector('#rows tr td:first-child').getBoundingClientRect(); return {wTop:w.top, thTop:th.top, wLeft:w.left, firstLeft:first.left}; })()""")
    check('header row stays pinned when scrolling down', abs(st['thTop']-st['wTop'])<3, f"{st['thTop']:.0f} vs {st['wTop']:.0f}")
    check('City column stays pinned when scrolling sideways', abs(st['firstLeft']-st['wLeft'])<3, f"{st['firstLeft']:.0f} vs {st['wLeft']:.0f}")
    pg.evaluate("document.getElementById('tablewrap').scrollTop=0; document.getElementById('tablewrap').scrollLeft=0")
    # 3. sorting by every column: exactly one marker, values ordered, no errors
    heads=consistency(pg)['heads']; bad=[]
    for h in heads:
        th=pg.query_selector_all('#headrow th')[heads.index(h)]
        if h in ('CH','PS','Lib','Univ','Lab','Mkt','Bank','SE'): continue
        th.click(); marks=pg.evaluate("[...document.querySelectorAll('#headrow th')].filter(t=>t.getAttribute('aria-sort')!=='none').length")
        if marks!=1: bad.append(h)
    check('sorting by each column gives exactly one sort marker', not bad, ','.join(bad))
    # 4. removing the sorted column moves the marker to the fallback
    pg.select_option('#viewsel','0'); pg.click('th:has-text("Grow")'); pg.click('#editview')
    next(l for l in pg.query_selector_all('#viewcols label') if l.inner_text().strip()=='Grow').query_selector('input').click()
    marked=pg.evaluate("[...document.querySelectorAll('#headrow th')].filter(t=>t.getAttribute('aria-sort')!=='none').map(t=>t.textContent)")
    check('removing the sorted column moves the marker to Size', marked==['Size'], str(marked))
    next(l for l in pg.query_selector_all('#viewcols label') if l.inner_text().strip()=='Grow').query_selector('input').click()
    check('re-adding the column restores it in its place', consistency(pg)['heads'].index('Grow')==consistency(pg)['heads'].index('Unhappy')+1)
    groups=[h.inner_text() for h in pg.query_selector_all('#viewcols .vegroup h3')]
    check('column editor is grouped by topic', len(groups)>=8, ', '.join(groups))
    # editor ticks always match the table, in every view
    mism=[]
    for i,v in enumerate(views):
        pg.select_option('#viewsel', str(i))
        ticked=sorted(l.inner_text().strip(' *') for l in pg.query_selector_all('#viewcols label') if l.query_selector('input').is_checked())
        shown=sorted(h for h in consistency(pg)['heads'] if h!='City')
        if ticked!=shown: mism.append(v)
    check('editor ticks match the table in every view', not mism, ','.join(mism))
    pg.click('#viewdone')
    # 5. Problems only, twice, with count and message
    lbl=pg.inner_text('#problemslabel'); pg.check('#problems'); empty=pg.inner_text('#rows'); n_on=len(pg.query_selector_all('#rows tr'))
    pg.uncheck('#problems'); n_off=len(pg.query_selector_all('#rows tr')); pg.check('#problems'); pg.uncheck('#problems'); n_off2=len(pg.query_selector_all('#rows tr'))
    check('"Problems only" shows its count', lbl=='Problems only (0)', lbl)
    check('"Problems only" with no problem cities explains why', n_on==1 and 'No cities with problems' in empty)
    check('"Problems only" toggled off (twice) restores all cities', n_off==42 and n_off2==42, f'{n_off}, {n_off2}')
    # 6. search follows the view
    pg.fill('#search','was'); n=len(pg.query_selector_all('#rows tr')); pg.fill('#search','')
    check('search filters (Washington)', n==1)
    # 7. ticks survive switching views, reset clears
    pg.select_option('#viewsel', str(views.index('Corruption management'))); h=consistency(pg)['heads']
    row=lambda n: next(r for r in pg.query_selector_all('#rows tr') if r.query_selector('td').inner_text()==n)
    row('Rome').query_selector_all('td')[h.index('CH')].query_selector('input').click()
    pg.select_option('#viewsel','0'); pg.select_option('#viewsel', str(views.index('Corruption management'))); h=consistency(pg)['heads']
    check('ticks survive switching views', row('Rome').query_selector_all('td')[h.index('CH')].query_selector('input').is_checked())
    pg.click('#resetwhatif'); h=consistency(pg)['heads']
    check('Reset what-ifs clears ticks', not row('Rome').query_selector_all('td')[h.index('CH')].query_selector('input').is_checked())
    # 8. resize refits the box
    pg.set_viewport_size({'width':1300,'height':600}); pg.wait_for_timeout(100); g=pg.evaluate(geom)
    check('after resizing to 1300x600 the scrollbars stay in view', g['wrapBottom']<=g['vh'] and not g['pageScrollsSideways'], f"bottom {g['wrapBottom']:.0f}/{g['vh']}")
    check('no script errors (light mode)', not errs, '; '.join(errs[:3]))
    b.close()
    # 9. editing before the rules load keeps the building columns; dark mode renders
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1600,'height':800}, color_scheme='dark'); pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.reload()
    vs=[o.inner_text() for o in pg.query_selector_all('#viewsel option')]; pg.select_option('#viewsel', str(vs.index('Science & gold buildings'))); pg.click('#editview')
    next(l for l in pg.query_selector_all('#viewcols label') if l.inner_text().strip(' *')=='Size').query_selector('input').click()
    pg.click('#viewdone')
    pg.set_input_files('#rulesfile',BIQ); pg.set_input_files('#file',SAV); pg.wait_for_selector('#rows tr')
    h=consistency(pg)['heads']
    check('editing a view before loading keeps its building columns, in order', all(x in h for x in ('Lib','Univ','Lib Effect','Univ Effect')) and 'Size' not in h and h.index('Upkeep')==len(h)-1, ', '.join(h))
    bg=pg.evaluate("getComputedStyle(document.body).backgroundColor"); check('dark mode renders', bg in ('rgb(20, 24, 27)',) , bg)
    pg.screenshot(path=str(ROOT / 'tests' / 'ui_dark.png'))
    check('no script errors (dark mode)', not errs, '; '.join(errs[:3]))
    b.close()
print(f"\n{sum(r[0] for r in results)} of {len(results)} checks passed")
