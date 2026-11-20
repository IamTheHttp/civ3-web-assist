from playwright.sync_api import sync_playwright
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
BIQ = str(ROOT / 'local-data' / 'conquests.biq')
SAV = str(ROOT / 'local-data' / 'maya.SAV')
def setup(p, w=1600, h=900):
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':w,'height':h}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.reload()
    pg.set_input_files('#rulesfile',BIQ); pg.set_input_files('#file',SAV); pg.wait_for_selector('#rows tr')
    return b,pg,errs
def consistency(pg):
    return pg.evaluate("""(() => {
      const heads=[...document.querySelectorAll('#headrow th')].map(t=>t.textContent.replace(/ [▲▼]$/,''));
      const rows=[...document.querySelectorAll('#rows tr')];
      const bad=rows.filter(r=>r.children.length!==heads.length).length;
      const foot=document.querySelectorAll('#totals td').length;
      return {columns:heads.length, heads, rows:rows.length, rowsWithWrongCellCount:bad, totalsCells:foot};
    })()""")
