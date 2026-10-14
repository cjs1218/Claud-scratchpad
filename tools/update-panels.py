#!/usr/bin/env python3
"""Rebuild js/panels.js: green (diagnostic-grade) genes on each test's PanelApp panel, from the PanelApp API.

Labs test against the SIGNED-OFF panel version, which can lag behind the current PanelApp version. So the gene
lists come from the signed-off version (api/v1/panels/signedoff/), and any green genes added or removed in the
current version since sign-off are recorded separately as 'pending' (shown as not yet signed off).
Usage: python3 tools/update-panels.py"""
import json, os, subprocess, datetime, urllib.request
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
API = 'https://panelapp.genomicsengland.co.uk/api/v1/panels/'
HEAD = {'User-Agent': 'cancer-family-history-navigator (update-panels)', 'Accept': 'application/json'}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEAD), timeout=120) as r: return json.load(r)
tests = json.loads(subprocess.check_output(['node', '-e',
    "const d=require(process.argv[1])(process.argv[2]);console.log(JSON.stringify(Object.values(d.TESTS).map(t=>[t.code,t.panel||null])))",
    os.path.join(ROOT, 'tests/load.js'), os.path.join(ROOT, 'js/data.js')]))
today = datetime.date.today().strftime('%-d %B %Y')
# Signed-off version and date of every signed-off panel.
signed, url = {}, API + 'signedoff/'
while url:
    page = get(url)
    for p in page['results']: signed[p['id']] = (str(p['version']), p.get('signed_off'))
    url = page['next']
green = lambda d, key, name: sorted({name(x) for x in d.get(key, []) if str(x.get('confidence_level')) == '3'})
genes = lambda d: green(d, 'genes', lambda x: x['gene_data']['gene_symbol'])
cache, out = {}, {}
for code, pid in tests:
    if not pid: continue
    if pid not in cache:
        cur = get(f'{API}{pid}/')
        so = signed.get(pid)
        d = get(f'{API}{pid}/?version={so[0]}') if so and so[0] != str(cur['version']) else cur
        cache[pid] = (d, cur, so)
    d, cur, so = cache[pid]
    g = genes(d)
    e = {'panel': pid, 'name': d['name'], 'version': str(d['version']), 'n': len(g)}
    if so: e['signedOff'] = so[1]
    else: e['notSignedOff'] = True
    if str(cur['version']) != e['version']:
        e['current'] = str(cur['version'])
        now = set(genes(cur))
        added, removed = sorted(now - set(g)), sorted(set(g) - now)
        if added or removed: e['pending'] = {'added': added, 'removed': removed}
    if len(g) <= 120: e['genes'] = g
    s, r = green(d, 'strs', lambda x: x['entity_name']), green(d, 'regions', lambda x: x['entity_name'])
    if s: e['strs'] = len(s)
    if r: e['regions'] = r if len(r) <= 5 else len(r)
    out[code] = e
js = ("/* Green (diagnostic-grade) genes on each test's Genomics England PanelApp panel, from the PanelApp API\n"
      f" * on {today}: the SIGNED-OFF version labs test against (version, signedOff); 'current' is the newer PanelApp\n"
      " * version when there is one, and 'pending' the green genes it adds or removes that are not yet signed off.\n"
      " * Panels over 120 genes keep only the count (see PanelApp for the list). */\n"
      f"const PANEL_DATE = '{today}';\nconst TEST_GENES = {{\n" +
      ',\n'.join(f'  {c}: {json.dumps(e, ensure_ascii=False)}' for c, e in out.items()) + '\n};\n')
open(os.path.join(ROOT, 'js/panels.js'), 'w').write(js)
pend = [c for c, e in out.items() if e.get('pending')]
print(f'js/panels.js: {len(out)} tests; {sum(1 for e in out.values() if "current" in e)} newer than signed off; gene changes pending sign-off: {", ".join(pend) or "none"}.')
print('Update the PanelApp date in SOURCE_DATES (js/data.js), then run tools/bump-version.sh.')
