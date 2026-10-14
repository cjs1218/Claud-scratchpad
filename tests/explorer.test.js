// Test Directory Explorer: data checks (Node) and the page in Chromium. Run: node tests/explorer.test.js [--no-browser] [URL]
const path = require('path');
const load = require('./load.js');
const { TDX } = load(path.join(__dirname, '../test-directory-explorer/data/directory.js'));
const { TDX_PANELS } = load(path.join(__dirname, '../test-directory-explorer/data/panels.js'));
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
check(TDX_PANELS.panels[635] && ['BRCA1', 'BRCA2', 'PALB2'].every(g => TDX_PANELS.panels[635].genes.includes(g)), 'R208 panel (635) has BRCA1, BRCA2 and PALB2');
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
  const rows = () => page.locator('#results > li > a').count();
  check(await rows() === I.length, `home lists all ${I.length} indications`);
  await page.fill('#q', 'cardiomyopathy'); await page.waitForTimeout(300);
  const n = await rows();
  check(n > 3 && n < 40, `search narrows the list (${n} for “cardiomyopathy”)`);
  check(/#q=cardiomyopathy$/.test(page.url()), 'search is kept in the address');
  await page.fill('#q', 'BRCA1'); await page.waitForTimeout(300);
  const top = (await page.locator('#results').innerText()).split('\n').filter(l => /^R\d/.test(l)).slice(0, 5).join(' ');
  check(/R207/.test(top) && /R208/.test(top) && !/R27 /.test(top), 'gene search ranks the small inherited cancer panels above genome-wide tests');
  check(await page.locator('#gene-hint').isVisible(), 'gene search offers the gene page');
  await page.fill('#q', ''); await page.waitForTimeout(300);
  await page.selectOption('#f-part', { label: 'Cardiology' }); await page.waitForTimeout(100);
  const card = await rows();
  check(card > 5 && card < 40 && (await page.locator('#results').innerText()).includes('R133'), `clinical area filter (${card} cardiology indications)`);
  await page.click('#clear');
  check(await rows() === I.length, 'clear resets the list');
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
  for (const w of [390]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.goto(BASE + '#R208'); await p.waitForSelector('#detail h2');
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scrolling at ${w}px`);
    await p.close();
  }
  check(!errors.length, `no console/page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await b.close(); if (server) server.server.close();
})().catch(e => { console.error(e); failures++; }).finally(() => {
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
});
