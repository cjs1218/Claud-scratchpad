# Extract the verbatim testing criteria for every test in js/data.js TESTS from the Test Directory PDF text.
# Usage: python3 tools/extract_criteria.py <td.txt from `pdftotext -layout`> <out.json>
import re, json, subprocess, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
raw = open(sys.argv[1]).read()
pages = raw.split('\f')
codes = json.loads(subprocess.check_output(['node', '-e', "const d=require(process.argv[1])(process.argv[2]);console.log(JSON.stringify(Object.keys(d.TESTS)))", os.path.join(ROOT, 'tests/load.js'), os.path.join(ROOT, 'js/data.js')]))
# flatten with pdf page numbers (1-based)
L = []
for pi, pg in enumerate(pages):
    for l in pg.split('\n'): L.append((pi + 1, l.rstrip()))
STOP = re.compile(r'^\s*(Overlapping indications|Referrals for testing will|Where in Pathway|Associated Tests|Requesting Specialties|Genetic testing may occasionally be appropriate)')
MARK = re.compile(r'^(\d{1,2}\.|\d{1,2}\)|[a-z]\.|[a-z]\)|\((?:[ivx]+|[a-z]|\d+)\)|[ivx]+\.|•|-)\s*(.*)$')
out = {}
for c in codes:
    found = None
    for i, (pn, l) in enumerate(L):
        if re.match(rf'^\s*{c}\s+[A-Z]', l) and '....' not in l:
            for j in range(i + 1, min(i + 6, len(L))):
                if L[j][1].strip() == 'Testing Criteria': found = (i, j); break
            if found: break
    if not found: print('MISSING', c, file=sys.stderr); continue
    i, j = found
    items = []; k = j + 1; pendingBullet = None
    while k < len(L) and not STOP.match(L[k][1]):
        pn, l = L[k]; k += 1
        s = l.strip()
        if not s or re.fullmatch(r'\d{1,3}', s) or 'May 2026 v9.1' in s: continue
        ind = len(l) - len(l.lstrip())
        m = MARK.match(s)
        if m and (m.group(1) != '-' ):
            mk, rest = m.group(1), m.group(2)
            if not rest: pendingBullet = (mk, ind); continue
            items.append({'m': mk, 'ind': ind, 't': rest}); pendingBullet = None; continue
        if pendingBullet:
            items.append({'m': pendingBullet[0], 'ind': pendingBullet[1], 't': s}); pendingBullet = None; continue
        prev = items[-1] if items else None
        newStart = re.match(r'^(Deceased|NOTE|Note|NOTES|\*)', s)
        if prev and not newStart and prev['m'] and ind == prev['ind'] and not re.search(r'([.:;,]|\bOR|\bAND)$', prev['t']) and s not in ('OR', 'AND'):
            prev['t'] += ' ' + s; continue
        if prev and not newStart and not re.search(r'[:]$', prev['t']) and (ind > prev['ind'] or (not prev['m'] and ind == prev['ind'] and not re.search(r'[.]$', prev['t']))) and s not in ('OR', 'AND'):
            prev['t'] += ' ' + s
        else:
            items.append({'m': '', 'ind': ind, 't': s})
    inds = sorted({it['ind'] for it in items})
    lv = {v: min(n, 3) for n, v in enumerate(inds)}
    out[c] = {'page': L[i][0], 'items': [[lv[it['ind']], it['m'], re.sub(r'\s+', ' ', it['t'])] for it in items]}
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(len(out), 'of', len(codes))
