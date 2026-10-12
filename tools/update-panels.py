#!/usr/bin/env python3
"""Rebuild js/panels.js: green (diagnostic-grade) genes on each test's PanelApp panel, from the PanelApp API.
Usage: python3 tools/update-panels.py"""
import json, os, subprocess, sys, datetime, urllib.request
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
tests = json.loads(subprocess.check_output(['node', '-e',
    "const d=require(process.argv[1])(process.argv[2]);console.log(JSON.stringify(Object.values(d.TESTS).map(t=>[t.code,t.panel||null])))",
    os.path.join(ROOT, 'tests/load.js'), os.path.join(ROOT, 'js/data.js')]))
today = datetime.date.today().strftime('%-d %B %Y')
cache, out = {}, {}
for code, pid in tests:
    if not pid: continue
    if pid not in cache:
        req = urllib.request.Request(f'https://panelapp.genomicsengland.co.uk/api/v1/panels/{pid}/', headers={'User-Agent': 'cancer-predisposition-differential (update-panels)', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=120) as r: cache[pid] = json.load(r)
    d = cache[pid]
    green = lambda key, name: sorted({name(x) for x in d.get(key, []) if str(x.get('confidence_level')) == '3'})
    g = green('genes', lambda x: x['gene_data']['gene_symbol'])
    e = {'panel': pid, 'name': d['name'], 'version': str(d['version']), 'n': len(g)}
    if len(g) <= 120: e['genes'] = g
    s, r = green('strs', lambda x: x['entity_name']), green('regions', lambda x: x['entity_name'])
    if s: e['strs'] = len(s)
    if r: e['regions'] = r if len(r) <= 5 else len(r)
    out[code] = e
js = ("/* Green (diagnostic-grade) genes on each test's Genomics England PanelApp panel, from the PanelApp API\n"
      f" * on {today}. Panels over 120 genes keep only the count (see PanelApp for the list). */\n"
      f"const PANEL_DATE = '{today}';\nconst TEST_GENES = {{\n" +
      ',\n'.join(f'  {c}: {json.dumps(e, ensure_ascii=False)}' for c, e in out.items()) + '\n};\n')
open(os.path.join(ROOT, 'js/panels.js'), 'w').write(js)
print(f'js/panels.js: {len(out)} tests. Update the PanelApp date in SOURCE_DATES (js/data.js), then run tools/bump-version.sh.')
