# Extract the verbatim testing criteria for every test in js/data.js TESTS from the Test Directory PDF text.
# Usage: python3 tools/extract_criteria.py <td.txt from `pdftotext -layout`> <out.json>
# Also imported by tools/update-explorer.py (extract() for any list of R codes).
import re, json, subprocess, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STOP = re.compile(r'^\s*(Overlapping indications|Referrals for testing will|Where in Pathway|Associated Tests|Requesting Specialties|Genetic testing may occasionally be appropriate)')
MARK = re.compile(r'^(\d{1,2}\.|\d{1,2}\)|[a-z]\.|[a-z]\)|\((?:[ivx]+|[a-z]|\d+)\)|[ivx]+\.|•|-)\s*(.*)$')
FOOTER = re.compile(r'\b\d{1,2}(st|nd|rd|th)? [A-Z][a-z]+ 20\d\d v\d+(\.\d+)?$')


def lines(raw):
    """Flatten pdftotext output to (pdf page number, line) pairs."""
    L = []
    for pi, pg in enumerate(raw.split('\f')):
        for l in pg.split('\n'): L.append((pi + 1, l.rstrip()))
    return L


def heading(L, c):
    """(heading line, 'Testing Criteria' line) for code c, or None."""
    for i, (pn, l) in enumerate(L):
        if re.match(rf'^\s*{c}\s+[A-Za-z(]', l) and '....' not in l:
            for j in range(i + 1, min(i + 6, len(L))):
                if L[j][1].strip() == 'Testing Criteria': return (i, j)
    return None


def extract(L, codes, log=sys.stderr):
    out = {}
    for c in codes:
        found = heading(L, c)
        if not found: print('MISSING', c, file=log); continue
        i, j = found
        items = []; k = j + 1; pendingBullet = None
        while k < len(L) and not STOP.match(L[k][1]):
            pn, l = L[k]; k += 1
            s = l.strip()
            if not s or re.fullmatch(r'\d{1,3}', s) or FOOTER.search(s): continue
            ind = len(l) - len(l.lstrip())
            m = MARK.match(s)
            if m and (m.group(1) != '-' ):
                mk, rest = m.group(1), m.group(2)
                if not rest: pendingBullet = (mk, ind); continue
                items.append({'m': mk, 'ind': ind, 't': rest}); pendingBullet = None; continue
            if pendingBullet:
                items.append({'m': pendingBullet[0], 'ind': pendingBullet[1], 't': s}); pendingBullet = None; continue
            prev = items[-1] if items else None
            # A capitalised line ending in a colon is a sub-heading (e.g. "Major criteria:"), never a continuation; so is
            # 'Testing Criteria for Semi-Rapid Testing'.
            is_head = bool(re.match(r'^[A-Z][^:]{0,80}:$', s) or re.fullmatch(r'Testing Criteria for [\w -]+', s)) and not (prev and re.search(r'\b(OR|AND|WITH|WITHOUT|IF|THE|OF|TO)$', prev['t']))
            if is_head:
                items.append({'m': '', 'ind': ind, 't': s, 'head': True}); continue
            newStart = re.match(r'^(Deceased|NOTE|Note|NOTES|\*)', s)
            if prev and not newStart and prev['m'] and ind == prev['ind'] and not re.search(r'([.:;,]|\bOR|\bAND)$', prev['t']) and s not in ('OR', 'AND'):
                prev['t'] += ' ' + s; continue
            if prev and not newStart and not prev.get('head') and not re.search(r'[:]$', prev['t']) and (ind > prev['ind'] or (not prev['m'] and ind == prev['ind'] and not re.search(r'[.]$', prev['t']))) and s not in ('OR', 'AND'):
                prev['t'] += ' ' + s
            else:
                items.append({'m': '', 'ind': ind, 't': s})
        inds = sorted({it['ind'] for it in items})
        lv = {v: min(n, 3) for n, v in enumerate(inds)}
        rows, under = [], None
        for it in items:
            level = lv[it['ind']]
            if it.get('head'): under = level
            elif under is not None and it['m'] == '•' and level <= under: level = under + 1
            elif not it['m'] or it['m'] != '•': under = None if not it.get('head') else under
            rows.append([min(level, 3), it['m'], re.sub(r'\s+', ' ', it['t'])])
        out[c] = {'page': L[i][0], 'items': rows}
    return out


if __name__ == '__main__':
    codes = json.loads(subprocess.check_output(['node', '-e', "const d=require(process.argv[1])(process.argv[2]);console.log(JSON.stringify(Object.keys(d.TESTS)))", os.path.join(ROOT, 'tests/load.js'), os.path.join(ROOT, 'cancer-family-history-navigator/js/data.js')]))
    out = extract(lines(open(sys.argv[1]).read()), codes)
    json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
    print(len(out), 'of', len(codes))
