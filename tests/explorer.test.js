// Test Directory Explorer: data checks (Node) and the page in Chromium. Run: node tests/explorer.test.js [--no-browser] [URL]
const path = require('path');
const load = require('./load.js');
const { TDX } = load(path.join(__dirname, '../test-directory-explorer/data/directory.js'));
const { TDX_PANELS } = load(path.join(__dirname, '../test-directory-explorer/data/panels.js'));
const { TDX_ABBR, TDX_ABBR_BY_CODE, TDX_ABBR_IGNORE } = load(path.join(__dirname, '../test-directory-explorer/abbreviations.js'));
const { TDX_FORMAT } = load(path.join(__dirname, '../test-directory-explorer/criteria-format.js'));
const { TDX_CORRECTIONS } = load(path.join(__dirname, '../test-directory-explorer/corrections.js'));
let failures = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { failures++; console.log('  FAIL', msg); } };

// Data.
const I = TDX.indications, tests = I.flatMap(e => e.tests), codes = new Set(I.map(e => e.code));
check(I.length >= 370 && tests.length >= 450, `whole directory present (${I.length} indications, ${tests.length} tests)`);
check(codes.size === I.length, 'indication codes are unique');
check(new Set(tests.map(t => t.id)).size === tests.length, 'test IDs are unique');
check(I.every(e => /^R\d+$/.test(e.code) && e.name && e.part && e.tests.length), 'every indication has a code, name, clinical area and a test');
check(tests.every(t => t.target && t.method), 'every test has a target and method');
check(tests.filter(t => !t.commissioning).length <= 2, 'commissioning category blank only where the spreadsheet leaves it blank (2 tests)');
check(I.every(e => e.tests.every(t => t.id.startsWith(e.code + '.'))), 'every test ID belongs to its indication');
const noCrit = I.filter(e => !e.criteria || !e.criteria.length).map(e => e.code);
check(!noCrit.length, `every indication has verbatim testing criteria${noCrit.length ? ' – missing: ' + noCrit.join(' ') : ''}`);
check(I.every(e => !e.criteria || (e.page > 0 && e.criteria.every(c => [0, 1, 2, 3].includes(c[0]) && typeof c[2] === 'string' && c[2]))), 'criteria have a PDF page and well-formed lines');
const noSpec = I.filter(e => !e.specialties || !e.specialties.length).map(e => e.code);
check(!noSpec.length, `every indication has requesting specialties${noSpec.length ? ' – missing: ' + noSpec.join(' ') : ''}`);
check(!I.some(e => (e.criteria || []).some(c => /Change Log for|20th May 2026 v9\.1/.test(c[2]))), 'no page footers or change log in the criteria');
check(tests.filter(t => t.family).length / tests.length > 0.95, `optimal family structure found for most tests (${tests.filter(t => t.family).length}/${tests.length})`);
check(!tests.some(t => t.scope && /\b(loci|genes?|panel)\b/i.test(t.scope)), 'no Target Type words in the scope column');
const R135 = I.find(e => e.code === 'R135');
check(R135 && R135.variants && R135.variants['Semi-Rapid Testing'] && R135.criteria.some(c => c[2] === 'Testing Criteria for Semi-Rapid Testing'), 'R135 semi-rapid testing kept separate');
const R133 = I.find(e => e.code === 'R133');
check(R133 && R133.tests[0].panels[0] === 134 && R133.specialties.join() === 'Cardiology,Clinical Genetics' && R133.pathway === 'At presentation', 'R133 parsed as in the PDF');
const ids = new Set(tests.flatMap(t => t.panels)), missing = [...ids].filter(id => !TDX_PANELS.panels[id]);
check(missing.length <= 5, `PanelApp panels present (${ids.size - missing.length}/${ids.size}; missing ${missing.join(', ') || 'none'})`);
check(Object.values(TDX_PANELS.panels).every(p => p.name && p.version && Array.isArray(p.genes)), 'panels have a name, version and gene list');
check(Object.values(TDX_PANELS.panels).every(p => p.version && (p.signedOff === null || /^\d{4}-\d\d-\d\d$/.test(p.signedOff))), 'every panel records its signed-off version and date (or that it is not signed off)');
check(Object.values(TDX_PANELS.panels).every(p => !p.current || (p.current.version && Array.isArray(p.current.added) && Array.isArray(p.current.removed))
  && (!p.current || p.current.added.every(g => !p.genes.includes(g)))), 'genes added on a newer version are not in the signed-off list');
check(TDX_PANELS.panels[635] && ['BRCA1', 'BRCA2', 'PALB2'].every(g => TDX_PANELS.panels[635].genes.includes(g)), 'R208 panel (635) has BRCA1, BRCA2 and PALB2');
// Abbreviations: every abbreviation-like word in the text (two or more capitals, e.g. NIPD, mtDNA) is defined or deliberately ignored.
{
  const genes = new Set(Object.values(TDX_PANELS.panels).flatMap(p => [...p.genes, ...(p.strs || [])]).map(g => g.toUpperCase()));
  const ignore = new Set(TDX_ABBR_IGNORE);
  const reFor = keys => new RegExp(`(^|[^A-Za-z0-9])(${keys.sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})(?![A-Za-z0-9])`, 'g');
  const missing = {};
  for (const e of I) {
    const dict = { ...TDX_ABBR, ...(TDX_ABBR_BY_CODE[e.code] || {}) }, re = reFor(Object.keys(dict));
    const texts = [e.name, e.pathway, e.change, ...(e.criteria || []).map(c => c[2]), ...(e.overlapping || []), ...(e.specialties || []),
      ...(e.specialtyNotes || []), ...(e.serviceGroup || []), ...e.tests.flatMap(t => [t.target, t.method, t.scope, t.family, t.change])];
    for (const t of texts.filter(Boolean)) for (const w of t.replace(re, '$1 ').split(/[^A-Za-z0-9]+/)) {
      if ((w.match(/[A-Z]/g) || []).length < 2 || ignore.has(w) || genes.has(w.toUpperCase()) || /^R\d+([A-Z][a-z]+)?$/.test(w)) continue; // R codes (one runs into the next word in the PDF text)
      if (/\d/.test(w) && /^[A-Z0-9]+$/.test(w)) continue; // gene-like (e.g. SMN2, CYP2C19) when not on a panel
      if (/^[A-Z][a-z]{2}\d+[A-Z][a-z]{2}$/.test(w)) continue; // protein change, e.g. Gly551Asp
      (missing[w] = missing[w] || new Set()).add(e.code);
    }
  }
  const list = Object.entries(missing).map(([w, c]) => `${w} (${[...c].slice(0, 3).join(' ')})`);
  check(!list.length, `every abbreviation in the text has a meaning in abbreviations.js${list.length ? ' – add or ignore: ' + list.join(', ') : ''}`);
  const genesDefined = Object.keys(TDX_ABBR).filter(k => genes.has(k.toUpperCase()) && !['PAH', 'AIP', 'ADA', 'WAS', 'TAT', 'NHS', 'HR'].includes(k));
  check(!genesDefined.length, `no gene symbols expanded as abbreviations, except where the text uses them as one${genesDefined.length ? ': ' + genesDefined.join(', ') : ''}`);
  check(Object.values(TDX_ABBR).every(v => typeof v === 'string' && v.length > 1), 'every abbreviation has a meaning');
}
// Criteria formatting changes the layout only: the text of every formatted line is exactly the criteria text.
{
  const text = html => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const lines = I.flatMap(e => (e.criteria || []).map(c => [e.code, c[2]]));
  const html = lines.map(([, t]) => TDX_FORMAT.line(t, (c, m) => `<a href="#${c}">${m}</a>`));
  const changed = lines.filter(([, t], i) => text(html[i]) !== t).map(([c]) => c);
  check(!changed.length, `formatting keeps every criteria line word for word (${lines.length} lines)${changed.length ? ' – changed in ' + [...new Set(changed)].join(' ') : ''}`);
  const n = cls => html.reduce((a, h) => a + (h.match(new RegExp(`class="${cls}`, 'g')) || []).length, 0);
  check(n('join') > 250 && n('thr') > 250 && n('split') >= 8 && n('logic') > 100, `formatting finds connectors (${n('join')}), thresholds (${n('thr')}), run-together lists (${n('split')}) and logic words (${n('logic')})`);
  const f = t => TDX_FORMAT.line(t);
  check(/<span class="thr">&lt;35 years<\/span>/.test(f('Parathyroid disease (<35 years), OR')) && /class="join join-or">OR</.test(f('Parathyroid disease (<35 years), OR')), 'thresholds and a trailing OR are marked');
  check(/thr">below age 50</.test(f('onset below age 50')) && /thr">under the age of 35</.test(f('under the age of 35, with')) && /thr">&lt;3rd percentile</.test(f('all measurements <3rd percentile')), 'age phrases and centiles are marked');
  check((f('Features such as: o Retinal angioma o Mesothelioma').match(/class="item"/g) || []).length === 2, 'a run-together “o … o …” list becomes a list');
  check(!/class="split"/.test(f('Hypotonia - with feeding difficulties')), 'a single dash in a sentence is not a list');
  check(TDX_FORMAT.isNote('NOTE: This indication is for urgent testing') && !TDX_FORMAT.isNote('Nothing noted'), 'NOTE lines are recognised');
}
// Corrections (formatted layout only): each one is found once in its indication and changes only what its kind allows.
{
  const byCode = Object.fromEntries(I.map(e => [e.code, e]));
  const texts = e => [...(e.criteria || []).map(c => c[2]), ...(e.overlapping || []), e.pathway || ''];
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  const letters = x => x.replace(/[^A-Za-z0-9]/g, '');
  const stale = [], wrong = [];
  for (const [code, find, fix, kind] of TDX_CORRECTIONS) {
    const n = byCode[code] ? texts(byCode[code]).reduce((a, t) => a + t.split(find).length - 1, 0) : 0;
    if (n !== 1) stale.push(`${code} “${find}” (${n}×)`);
    const ok = kind === 'spelling' ? lev(find, fix) <= 3 && lev(find, fix) > 0 : kind === 'heading' ? find.endsWith(' ' + fix) && fix.length > 2
      : ['punctuation', 'break'].includes(kind) && letters(find) === letters(fix) && find !== fix;
    if (!ok) wrong.push(`${code} “${find}”`);
  }
  check(!stale.length, `every correction matches its indication's text exactly once (${TDX_CORRECTIONS.length})${stale.length ? ' – update or remove: ' + stale.join('; ') : ''}`);
  check(!wrong.length, `corrections stay within their kind: spelling ≤3 letters, punctuation and breaks change no letters${wrong.length ? ' – ' + wrong.join('; ') : ''}`);
  // With its corrections, a line's formatted text equals the corrected text, and every correction is marked once.
  const plain = html => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  let bad = 0, marked = 0;
  for (const [code, find, fix, kind] of TDX_CORRECTIONS) {
    const e = byCode[code]; if (!e) continue;
    if (kind === 'heading') {
      const t = (e.criteria || []).map(c => c[2]).find(x => x.includes(find)); if (!t) continue;
      const html = TDX_FORMAT.line(t, null, [[find, fix, kind]]);
      if (plain(html) !== t.replace(find, find.slice(0, -fix.length - 1) + '\n' + fix) || !html.includes(`<br class="fix-br">\n<strong class="inline-head">${fix}</strong>`)) bad++;
      marked++; continue;
    }
    const t = texts(e).find(x => x.includes(find)); if (!t) continue;
    const isCrit = (e.criteria || []).some(c => c[2] === t);
    const html = (isCrit ? TDX_FORMAT.line : TDX_FORMAT.text)(t, (c, m) => `<a href="#${c}">${m}</a>`, [[find, fix, kind]]);
    if (plain(html) !== t.replace(find, fix)) bad++;
    marked += /<ins class="fix"/.test(html) || fix.replace(/\n/g, ' ') === find; // a pure line break shows, unmarked
  }
  check(!bad && marked === TDX_CORRECTIONS.length, `corrected lines show exactly the corrected text, each correction marked (${marked})`);
  const v = TDX_FORMAT.line('parents carry different varints OR', null, [['different varints', 'different variants']]);
  check(/<ins class="fix" data-pdf="varints"[^>]*>variants<\/ins>/.test(v) && /join-or/.test(v), 'a corrected word is marked with the PDF wording');
  const br = TDX_FORMAT.line('not been excluded Order of testing', null, [['excluded Order of testing', 'excluded.\nOrder of testing']]);
  check(/excluded\.<\/ins><br class="fix-br">/.test(br), 'a run-in heading starts a new line after a full stop');
}
{
  const { TDX_SYNONYMS, TDX_SPELLING } = load(path.join(__dirname, '../test-directory-explorer/search-terms.js'));
  check(TDX_SYNONYMS.every(g => g.length >= 2 && g.every(x => typeof x === 'string' && x.trim() === x && x)) && TDX_SPELLING.every(([us, uk]) => us && uk && us !== uk),
    `search synonyms (${TDX_SYNONYMS.length} groups) and US→UK spellings (${TDX_SPELLING.length}) are well formed`);
  const flat = TDX_SYNONYMS.flat().map(x => x.toLowerCase());
  check(new Set(flat).size === flat.length, 'no word or phrase is in two synonym groups');
}
// Requesting-specialty filter groups: every wording in the data is mapped (so new wording cannot add a stray option).
{
  const { TDX_SPECIALTIES, TDX_SPECIALTY_ANY } = load(path.join(__dirname, '../test-directory-explorer/specialties.js'));
  const wording = I.flatMap(e => [...(e.specialties || []), ...Object.values(e.variants || {}).flatMap(v => v['Requesting Specialties'] || [])]);
  const unmapped = [...new Set(wording.filter(w => !TDX_SPECIALTIES[w.toLowerCase()]))];
  check(!unmapped.length, `every requesting specialty is mapped to a filter group${unmapped.length ? ' – add to specialties.js: ' + unmapped.join('; ') : ''}`);
  const groups = new Set(Object.values(TDX_SPECIALTIES).flat());
  check(groups.size >= 35 && groups.size <= 50 && groups.has(TDX_SPECIALTY_ANY), `${new Set(wording.map(w => w.toLowerCase())).size} PDF wordings become ${groups.size} filter groups`);
  const unused = Object.keys(TDX_SPECIALTIES).filter(k => !wording.some(w => w.toLowerCase() === k));
  check(!unused.length, `no stale entries in specialties.js${unused.length ? ' – remove: ' + unused.join('; ') : ''}`);
}
check(/^v\d/.test(TDX.meta.directory) && /^v\d/.test(TDX.meta.criteria), `versions recorded (${TDX.meta.directory}, criteria ${TDX.meta.criteria})`);

// Page.
(async () => {
  if (process.argv.includes('--no-browser')) return;
  const { playwright, ROOT } = require('./env.js');
  let BASE = process.argv.slice(2).find(a => /^https?:/.test(a));
  const server = BASE ? null : await require('./static-server.js')(ROOT);
  BASE = (BASE || server.url) + (BASE ? '' : 'test-directory-explorer/');
  const b = await playwright().chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  const rows = () => page.locator('#results a.row').count();
  check(await rows() === I.length, `home lists all ${I.length} indications`);
  const icon = await page.getAttribute('link[rel=icon]', 'href');
  check(/^favicon\.svg/.test(icon) && (await page.request.get(new URL(icon, page.url()).href)).ok(), 'own tab icon (DNA helix in a magnifying glass) linked and served');
  await page.fill('#q', 'cardiomyopathy'); await page.waitForTimeout(300);
  const n = await rows();
  check(n > 3 && n < 40, `search narrows the list (${n} for “cardiomyopathy”)`);
  check(/#q=cardiomyopathy$/.test(page.url()), 'search is kept in the address');
  await page.fill('#q', 'BRCA1'); await page.waitForTimeout(300);
  const top = (await page.locator('#results').innerText()).split('\n').filter(l => /^R\d/.test(l)).slice(0, 5).join(' ');
  check(/R207/.test(top) && /R208/.test(top) && !/R27 /.test(top), 'gene search ranks the small inherited cancer panels above genome-wide tests');
  check(await page.locator('#gene-hint').isVisible(), 'gene search offers the gene page');
  await page.fill('#q', ''); await page.waitForTimeout(300);
  await page.selectOption('#f-part', 'II Cardiology'); await page.waitForTimeout(100);
  const card = await rows();
  check(card > 5 && card < 40 && (await page.locator('#results').innerText()).includes('R133'), `clinical area filter (${card} cardiology indications)`);
  check(/[#&]part=II\+Cardiology/.test(page.url()), 'filters are kept in the address');
  check(/^Cardiology \(\d+\)$/.test(await page.locator('#f-part option:checked').innerText()), 'filter options show how many indications each gives');
  await page.reload(); await page.waitForTimeout(200);
  check(await rows() === card && await page.inputValue('#f-part') === 'II Cardiology', 'a filtered list survives a reload (bookmarkable)');
  check(await page.locator('#active [data-remove=part]').isVisible(), 'the active filter shows as a removable chip');
  await page.click('#active [data-remove=part]'); await page.waitForTimeout(100);
  check(await rows() === I.length && !/part=/.test(page.url()), 'removing the chip removes the filter');
  await page.selectOption('#f-part', 'II Cardiology'); await page.waitForTimeout(100);
  await page.click('#clear');
  // Requesting-specialty groups.
  const specCodes = async v => { await page.selectOption('#f-specialty', v); await page.waitForTimeout(100);
    const c = (await page.locator('#results a.row').allInnerTexts()).map(r => r.split(/\s/)[0]); await page.selectOption('#f-specialty', ''); await page.waitForTimeout(50); return c; };
  const optTexts = await page.locator('#f-specialty option').allInnerTexts();
  check(optTexts.length - 1 <= 50 && !optTexts.some(o => /\*|Surgery\*|Clinical genetics \(|CF service,/.test(o)), `the specialty filter offers ${optTexts.length - 1} grouped options, without footnote marks or case variants`);
  check(/^Any appropriate specialist/.test(optTexts[optTexts.length - 1]), '“Any appropriate specialist” is last');
  const surg = await specCodes('Surgery');
  check(['R210', 'R151', 'R208'].every(c => surg.includes(c)), 'Surgery includes Surgery*, Surgery (head/neck/endocrine) and Surgery');
  const neuro = await specCodes('Neurology'), paeds = await specCodes('Paediatrics');
  check(neuro.includes('R27') && paeds.includes('R364') && paeds.includes('R27'), 'paediatric sub-specialties are under the parent specialty and Paediatrics');
  const neo = await specCodes('Neonatology');
  check(neo.includes('R135'), 'semi-rapid routes count (Neonatology can request R135 semi-rapid testing)');
  const gyn = await specCodes('Gynaecology'), uro = await specCodes('Urology');
  check(gyn.includes('R411') && uro.includes('R411'), '“Urology / gynaecology” is under both');
  const path_ = await specCodes('Pathology and histopathology'), any = await specCodes('Any appropriate specialist');
  check(path_.includes('R210') && path_.includes('R22') && any.includes('R65') && any.includes('R412') && !any.includes('R27'), 'merged groups (pathology, any appropriate specialist) work');
  await page.goto(BASE + '#R210'); await page.waitForSelector('#detail .s-who');
  check(/Surgery\*/.test(await page.locator('#detail .s-who').innerText()), 'the indication page keeps the PDF wording (Surgery*)');
  await page.goto(BASE); await page.waitForSelector('#results a.row');
  check(await rows() === I.length, 'clear resets the list');
  check(await page.locator('#results .group-head').count() >= 15, 'with no search the list is grouped by clinical area');
  await page.fill('#q', 'hearing loss'); await page.waitForTimeout(300);
  check((await page.locator('#results a.row').first().innerText()).startsWith('R67'), 'a phrase ranks the indication named with it first (R67 Monogenic hearing loss)');
  check(await page.locator('#results a.row').first().locator('mark').count() > 0, 'search words are highlighted in the results');
  // Smarter search: abbreviations, synonyms, UK spelling, ranking of exclusions, suggestions, long lists.
  const firstRows = async (q, n = 3) => { await page.fill('#q', q); await page.waitForTimeout(300);
    return (await page.locator('#results a.row').allInnerTexts()).slice(0, n).map(r => r.split(/\s/)[0]); };
  const hcm = await firstRows('HCM', 5);
  check(hcm.includes('R131') && hcm.includes('R454'), `an abbreviation finds its meaning (HCM → ${hcm.join(', ')})`);
  check((await firstRows('deafness'))[0] === 'R67', 'a synonym finds the Directory wording (deafness → R67 Monogenic hearing loss)');
  check((await firstRows('learning disability', 5)).includes('R27'), 'learning disability finds intellectual disability (R27)');
  check((await firstRows('NF1'))[0] === 'R222', 'NF1 lists R222 Neurofibromatosis type 1 first, not “…excluding NF1”');
  check((await firstRows('breast cancer'))[0] === 'R208', 'breast cancer lists R208 first, not “…without breast cancer”');
  await firstRows('tumor');
  check(await page.locator('#results a.row').count() > 5 && (await page.locator('#results mark').allInnerTexts()).some(m => /^tumour/i.test(m)), 'US spelling finds UK spelling (tumor → tumour)');
  await page.fill('#q', 'cardiomyopthy'); await page.waitForTimeout(300);
  const dym = page.locator('#results [data-dym]');
  check(await dym.count() === 1 && (await dym.innerText()) === 'cardiomyopathy', 'a misspelling offers “Did you mean cardiomyopathy?”');
  await dym.click(); await page.waitForTimeout(300);
  check(await page.inputValue('#q') === 'cardiomyopathy' && await rows() > 3, 'the suggestion runs the corrected search');
  await page.fill('#q', 'syndrome'); await page.waitForTimeout(300);
  const many = await page.locator('#results [data-show-all]').innerText().catch(() => '');
  check(await rows() === 50 && /Show all \d+ results/.test(many), 'a long result list shows the best 50 first');
  await page.click('#results [data-show-all]'); await page.waitForTimeout(200);
  check(await rows() === +many.match(/\d+/)[0], '“Show all” shows the rest');
  await page.fill('#q', 'Dravet'); await page.waitForTimeout(300);
  check(await page.locator('#results .row-snip mark').count() > 0, 'a criteria match shows the matching text');
  await page.locator('#results a.row', { hasText: 'R27' }).click(); await page.waitForSelector('#detail h2');
  check(await page.locator('#detail .search-note').isVisible() && await page.locator('#detail .cols mark').count() > 0, 'the search words are highlighted on the indication page');
  check(/Back to your results/.test(await page.locator('#detail .back').innerText()), 'the back link returns to the search');
  await page.click('#detail .back a'); await page.waitForTimeout(200);
  check(await page.inputValue('#q') === 'Dravet' && await rows() > 0, 'back to the results keeps the search');
  await page.click('#clear'); await page.waitForTimeout(100);
  // Going back to the list returns to the same place in it.
  await page.evaluate(() => window.scrollTo(0, 4000)); await page.waitForTimeout(100);
  const y0 = await page.evaluate(() => scrollY);
  const visible = await page.evaluate(() => [...document.querySelectorAll('#results a.row')].find(a => a.getBoundingClientRect().top > 100).getAttribute('href'));
  await page.click(`#results a.row[href="${visible}"]`); await page.waitForSelector('#detail h2');
  await page.goBack(); await page.waitForTimeout(200);
  check(Math.abs(await page.evaluate(() => scrollY) - y0) < 5, 'Back returns to the same place in the list');
  await page.goto(BASE + '#R133'); await page.waitForSelector('#detail .pager');
  check(await page.locator('#detail .pager a.next').getAttribute('href') === '#' + I[I.findIndex(e => e.code === 'R133') + 1].code, 'next/previous step through the indications');
  await page.goto(BASE + '#R28'); await page.waitForSelector('#detail h2');
  check(/Mentioned by:.*R27/.test(await page.locator('#detail .s-overlap').innerText()), 'an indication shows which others mention it (R28 ← R27)');
  await page.goto(BASE + '#R27'); await page.waitForSelector('#detail h2');
  await page.locator('#detail .panel details summary').first().click();
  await page.locator('#detail [data-gene-find]').first().fill('BRCA');
  const shownGenes = await page.locator('#detail .genes a:visible').allInnerTexts();
  check(shownGenes.length >= 2 && shownGenes.every(g => g.startsWith('BRCA')), `find a gene in a large panel (${shownGenes.join(', ')})`);
  check(await page.locator('#detail .crit-list .crit-sub', { hasText: 'Exclusion criteria' }).count() === 1, 'criteria sub-headings stand out');
  await page.goto(BASE + '#R208'); await page.waitForSelector('#detail h2');
  check(await page.locator('#detail .crit-list .crit-join').count() > 0, '“OR” between criteria shows as a separator');
  // Formatted criteria and the switch to the PDF layout.
  await page.goto(BASE + '#R224'); await page.waitForSelector('#detail .s-crit');
  check(await page.locator('#detail .crit-list .split .item').count() === 10, 'R224: the run-together list of features shows as 10 bullet points');
  check(await page.locator('#detail .crit-list .join').count() >= 5 && await page.locator('#detail .crit-list .thr').count() >= 3, 'R224: connectors and age thresholds are marked');
  check(await page.locator('#detail .crit-list .crit-note').count() === 1, 'R224: the NOTE shows as a note');
  const words = () => page.locator('#detail .crit-list').evaluate(ul => ul.textContent.replace(/\s+/g, ' ').trim());
  const formatted = await words();
  await page.click('#detail [data-layout]'); await page.waitForTimeout(100);
  check(await page.locator('#detail .crit-list.plain').count() === 1 && await page.locator('#detail .crit-list .join, #detail .crit-list .thr').count() === 0, '“Show as in the PDF” switches to the plain layout');
  check(await words() === formatted, 'both layouts show exactly the same words');
  await page.reload(); await page.waitForSelector('#detail .s-crit');
  check(await page.locator('#detail .crit-list.plain').count() === 1, 'the chosen layout is remembered');
  await page.click('#detail [data-layout]'); await page.waitForTimeout(100);
  check(await page.locator('#detail .crit-list.plain').count() === 0 && (await page.locator('#detail [data-layout]').innerText()) === 'Show as in the PDF', 'and can be switched back');
  await page.goto(BASE + '#R133'); await page.waitForSelector('#detail .s-crit');
  check(await page.locator('#detail .crit-list a[href="https://pubmed.ncbi.nlm.nih.gov/20172912/"]').count() === 1, 'PMIDs link to PubMed');
  // Corrections: marked in the formatted layout, original wording in the PDF layout.
  await page.goto(BASE + '#R249'); await page.waitForSelector('#detail .s-crit');
  const fix = page.locator('#detail .crit-list ins.fix', { hasText: 'variants' });
  check(await fix.count() === 1 && await fix.getAttribute('data-pdf') === 'varints', 'R249: “varints” shows corrected to “variants”, marked');
  await fix.hover();
  check(/the PDF has “varints”/.test(await page.locator('#abbr-tip').innerText()), 'hovering a correction shows the PDF wording');
  check(/obvious typo or punctuation error on this page is corrected/.test(await page.locator('#detail .crit-help').innerText()), 'the page says how many corrections it has');
  await page.click('#detail [data-layout]'); await page.waitForTimeout(100);
  check(await page.locator('#detail ins.fix').count() === 0 && /different varints/.test(await page.locator('#detail .crit-list').innerText()), 'the PDF layout shows the original wording');
  await page.click('#detail [data-layout]'); await page.waitForTimeout(100);
  await page.goto(BASE + '#R33'); await page.waitForSelector('#detail .s-crit');
  check(await page.locator('#detail .crit-list br.fix-br').count() === 1 && /excluded\.\s*\nOrder of testing/.test(await page.locator('#detail .crit-list').innerText()), 'R33: “Order of testing” starts its own line');
  await page.goto(BASE + '#R62'); await page.waitForSelector('#detail .s-who');
  check(/our-services\/find-service/.test(await page.locator('#detail .s-who').innerText()), 'R62: the web address broken by a line wrap is joined');
  await page.goto(BASE + '#R457'); await page.waitForSelector('#detail .s-crit');
  check(await page.locator('#detail .crit-list strong.inline-head', { hasText: /^Chordoma$/ }).count() === 1
    && /<25\s*\nChordoma/.test(await page.locator('#detail .crit-list').innerText()), 'R457: the Chordoma heading starts its own line in bold');
  check(await page.locator('#detail .crit-list li.crit-sub', { hasText: /^Sarcoma$/ }).count() === 1, 'R457: the Sarcoma heading is bold');
  check(!/corrected/.test(await page.locator('#detail .crit-help').innerText()), 'a moved heading is not counted as a correction');
  await page.goto(BASE + '#R151'); await page.waitForSelector('#detail .s-crit');
  check(await page.locator('#detail .crit-list li.crit-sub', { hasText: 'Familial Primary Hyperparathyroidism' }).count() === 1, 'a short line before a list is shown as its heading');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#detail [data-copy]'); await page.waitForTimeout(100);
  check(await page.evaluate(() => navigator.clipboard.readText()) === page.url(), 'Copy link copies the page address');
  await page.keyboard.press('/'); await page.waitForTimeout(150);
  check(await page.evaluate(() => document.activeElement.id) === 'q' && await page.locator('#home').isVisible(), '“/” goes to the search box');
  await page.fill('#q', 'R133'); await page.press('#q', 'Enter'); await page.waitForSelector('#detail h2'); await page.waitForTimeout(300);
  check(await page.locator('#detail').isVisible(), 'the R code stays open after the search box settles');
  check((await page.locator('#detail h2').innerText()).includes('Arrhythmogenic right ventricular cardiomyopathy'), 'Enter on an R code opens it');
  const detail = await page.locator('#detail').innerText();
  check(detail.includes('Modified Task Force Criteria') && detail.includes('R133.1') && detail.includes('Singleton') && detail.includes('Clinical Genetics'), 'indication page shows criteria, tests, family structure and specialties');
  const pdf = await page.locator('#detail a[href$="#page=25"]').evaluateAll(as => as.map(a => a.href));
  check(pdf.length >= 2 && pdf.every(h => h === TDX.meta.pdfUrl + '#page=25'), 'indication page links to its page of the criteria PDF');
  check(await page.locator('.sources a[href="https://panelapp.genomicsengland.co.uk/panels/134/"]').count() === 1, 'sources box links to the PanelApp panel');
  check(await page.locator('.test .panel-name a[href="https://panelapp.genomicsengland.co.uk/panels/134/"]').isVisible(), 'PanelApp link is visible on the test without expanding anything');
  check(await page.locator('.sources a[href="' + TDX.meta.xlsxUrl + '"]').count() === 1, 'sources box links to the directory spreadsheet');
  await page.click('#detail a[href="#R132"]'); await page.waitForFunction(() => /^R132/.test(document.querySelector('#detail h2').textContent), null, { timeout: 5000 }).catch(() => {});
  check((await page.locator('#detail h2').innerText()).startsWith('R132'), 'overlapping indications link to each other');
  await page.goBack(); await page.waitForFunction(() => /^R133/.test(document.querySelector('#detail h2').textContent), null, { timeout: 5000 }).catch(() => {});
  check((await page.locator('#detail h2').innerText()).startsWith('R133'), 'back button returns to the previous indication');
  await page.goto(BASE + '#gene=BRCA2'); await page.waitForSelector('#detail h2');
  const gene = await page.locator('#detail').innerText();
  check(gene.includes('R208.1') && gene.includes('R207.1'), 'gene page lists the tests for a gene');
  check(await page.locator('#detail a[href="https://panelapp.genomicsengland.co.uk/panels/635/"]').count() >= 1, 'gene page links to the PanelApp panel of each test');
  await page.goto(BASE + '#R9999'); await page.waitForSelector('#detail h2');
  check((await page.locator('#detail h2').innerText()) === 'Not found', 'unknown code shows not found');
  // Signed-off panels: the version laboratories test against, and any change on PanelApp's newer version.
  await page.goto(BASE + '#R133'); await page.waitForSelector('#detail .panel');
  check(new RegExp(`signed-off version ${TDX_PANELS.panels[134].version.replace('.', '\\.')} \\(.*\\) – what laboratories test against`).test(await page.locator('#detail .panel-name').first().innerText()), 'the panel shows its signed-off version and date');
  {
    // Simulate a newer PanelApp version that adds and removes a gene.
    const p2 = await b.newPage();
    await p2.route('**/data/panels.js*', async route => { const r = await route.fetch();
      route.fulfill({ response: r, body: (await r.text()) + "\nTDX_PANELS.panels[134].current = { version: '9.9', added: ['TESTGENE1'], removed: ['PLN'] };" }); });
    await p2.goto(BASE + '#R133'); await p2.waitForSelector('#detail .panel');
    const note = await p2.locator('#detail .panel-change').innerText();
    check(/newer version 9\.9 changes the green genes/.test(note) && /added TESTGENE1/.test(note) && /removed PLN/.test(note), 'a newer version that changes the genes is flagged on the test');
    await p2.goto(BASE + '#gene=TESTGENE1'); await p2.waitForSelector('#detail h2');
    check(/not yet signed-off/.test(await p2.locator('#detail .panel-change').innerText()), 'a gene only on the newer version says laboratories do not test it yet');
    await p2.close();
  }
  // Abbreviations: hover shows the meaning; tap works too; keyboard focus too; the page lists them.
  await page.goto(BASE + '#R21'); await page.waitForSelector('#detail h2');
  const anyAbbr = await page.locator('#detail abbr.abbr').count();
  check(anyAbbr > 3, `indication page marks abbreviations (${anyAbbr} on R21)`);
  const firstAbbr = page.locator('#detail .crit-list abbr.abbr').first();
  await firstAbbr.hover();
  const full = await firstAbbr.getAttribute('data-full');
  check(await page.locator('#abbr-tip').isVisible() && (await page.locator('#abbr-tip').innerText()) === full, `hovering an abbreviation shows its meaning (“${full}”)`);
  await page.mouse.move(2, 2); await page.waitForTimeout(50);
  check(await page.locator('#abbr-tip').isHidden(), 'moving away hides it');
  await firstAbbr.focus();
  check(await page.locator('#abbr-tip').isVisible(), 'keyboard focus shows the meaning');
  await page.keyboard.press('Escape');
  check(await page.locator('#abbr-tip').isHidden(), 'Escape hides it');
  check((await page.locator('#detail .glossary').innerText()).includes('Abbreviations on this page'), 'indication page lists its abbreviations');
  await page.goto(BASE + '#R134'); await page.waitForSelector('#detail h2');
  check((await page.locator('#detail abbr.abbr', { hasText: /^FH$/ }).first().getAttribute('data-full')) === 'familial hypercholesterolaemia', 'FH means familial hypercholesterolaemia on R134');
  await page.goto(BASE + '#R224'); await page.waitForSelector('#detail h2');
  check((await page.locator('#detail abbr.abbr', { hasText: /^FH$/ }).first().getAttribute('data-full')) === 'fumarate hydratase', '… and fumarate hydratase on R224');
  await page.goto(BASE + '#R188'); await page.waitForSelector('#detail h2');
  check(await page.locator('#detail .crit-list abbr.abbr', { hasText: /^PAH$/ }).count() > 0, 'PAH expanded in R188 criteria (pulmonary arterial hypertension)');
  await page.goto(BASE + '#gene=PAH'); await page.waitForSelector('#detail h2');
  check(await page.locator('#detail .target abbr.abbr', { hasText: /^PAH$/ }).count() === 0, 'gene symbol PAH is not expanded in test targets');
  await page.goto(BASE + '#q=NIPD'); await page.waitForTimeout(300);
  check(await page.locator('#results abbr.abbr').count() > 0, 'the list marks abbreviations too');
  for (const w of [390]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 }, hasTouch: true, isMobile: true });
    await p.goto(BASE); await p.waitForSelector('#results a.row');
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scrolling on the list at ${w}px`);
    check(!(await p.locator('#filter-panel').getAttribute('open') !== null), 'filters start folded away on a phone');
    check((await p.locator('.site-head').boundingBox()).height < 70, 'compact header on a phone');
    check((await p.locator('#results a.row').first().boundingBox()).y < 500, 'first result shows without scrolling on a phone');
    await p.goto(BASE + '#R208'); await p.waitForSelector('#detail h2');
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scrolling at ${w}px`);
    check((await p.locator('#detail .s-tests').boundingBox()).y < (await p.locator('#detail .s-crit').boundingBox()).y, 'on a phone the tests come before the long criteria');
    const a = p.locator('#detail .crit-list abbr.abbr').first();
    await a.tap(); await p.waitForTimeout(50);
    check(await p.locator('#abbr-tip').isVisible(), `tapping an abbreviation shows its meaning on a touch screen (${w}px)`);
    await a.tap(); await p.waitForTimeout(50);
    check(await p.locator('#abbr-tip').isHidden(), 'tapping it again hides it');
    await p.close();
  }
  check(!errors.length, `no console/page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await b.close(); if (server) server.server.close();
})().catch(e => { console.error(e); failures++; }).finally(() => {
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
});
