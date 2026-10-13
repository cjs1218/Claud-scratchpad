// Run: node tests/browser.test.js [URL]  (with no URL a local server is started)
const { playwright, ROOT } = require('./env.js');
const { chromium } = playwright();
let BASE = process.argv[2];
let failures = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { failures++; console.log('  FAIL', msg); } };

// Fill the person at index `pi` with diagnoses [{site, hist, age, ...markers}].
async function setPerson(page, pi, sex, dxs) {
  const person = () => page.locator('#family .person').nth(pi);
  await person().locator('select[data-f=sex]').selectOption(sex);
  for (let i = 0; i < dxs.length; i++) {
    if (i > 0) await person().locator('[data-act=add-dx]').click();
    const dx = () => person().locator('.dx').nth(i);
    const { site, hist, age, ...markers } = dxs[i];
    await dx().locator('select[data-f=site]').selectOption(site);
    await dx().locator('select[data-f=hist]').selectOption(hist);
    if (age) await dx().locator('input[data-f=age]').fill(String(age));
    for (const [k, v] of Object.entries(markers)) {
      const el = dx().locator(`[data-f=${k}]`);
      if (k === 'count') await el.fill(String(v)); else await el.selectOption(v);
    }
  }
}
// The form picks a relationship in two steps (relationship, then side); choose both for an internal id.
async function chooseRel(person, rel) {
  const [k, side] = await person.page().evaluate(r => relParts(r), rel);
  await person.locator('select[data-f=relKind]').selectOption(k);
  if (side) await person.locator('select[data-f=relSide]').selectOption(side);
}
// "Load example" opens a menu of example families; the BRCA family is the default.
async function loadEx(page, id = 'brca') { await page.click('#example'); await page.click(`#example-menu [data-load-example=${id}]`); }
async function addRelative(page, rel, sex, dxs) {
  await page.click('#add-person');
  const n = await page.locator('#family .person').count();
  await chooseRel(page.locator('#family .person').nth(n - 1), rel);
  await setPerson(page, n - 1, sex, dxs);
}
// Loaded families start folded; open every relative's form before editing it.
const openAll = async page => { await page.waitForTimeout(30); while (await page.locator('#family .person-open').count()) { await page.locator('#family .person-open').first().click(); } };
const topNames = page => page.locator('#results .result h3').allTextContents();

(async () => {
  if (!BASE) BASE = (await require('./static-server.js')(ROOT)).url;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE);

  console.log('Page load');
  check(await page.textContent('#cond-count') === '103', 'condition count shows 103');
  check(+(await page.textContent('#gene-count')) > 100, 'NICPR gene count rendered');

  console.log('Tabs');
  const shown = () => page.evaluate(() => ['tab-assess', 'tab-browse', 'tab-sources'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none'));
  check(JSON.stringify(await shown()) === '["tab-assess"]', 'only Family assessment visible on load');
  await loadEx(page); await openAll(page);
  await page.click('.tabs [data-tab=browse]');
  check(JSON.stringify(await shown()) === '["tab-browse"]', 'Syndromes tab replaces (not below) Family assessment');
  check(/^#syndromes?/.test(new URL(page.url()).hash), `address holds the Syndromes tab (${new URL(page.url()).hash})`);
  await page.click('.tabs [data-tab=assess]');
  check(JSON.stringify(await shown()) === '["tab-assess"]' && new URL(page.url()).hash === '', 'back to Family assessment clears the hash');
  check(await page.locator('#family .person').count() === 4, 'entered family kept after switching tabs');
  await page.goBack();
  check(JSON.stringify(await shown()) === '["tab-browse"]', 'browser Back returns to Syndromes');
  await page.goForward();
  check(JSON.stringify(await shown()) === '["tab-assess"]', 'browser Forward returns to Family assessment');
  await page.goto(BASE + '#syndromes'); await page.reload();
  check(JSON.stringify(await shown()) === '["tab-browse"]', 'refresh on #syndromes stays on Syndromes');
  await page.evaluate(() => window.scrollTo(0, 2000));
  const barTop = await page.evaluate(() => document.querySelector('.tabbar').getBoundingClientRect().top);
  check(barTop === 0 && await page.isVisible('.tabs [data-tab=assess]'), `tab bar stays pinned when scrolling (top ${barTop})`);
  await page.goto(BASE);

  console.log('Example family (TNBC 38, mother HGSC 52)');
  await loadEx(page); await openAll(page);
  let names = await topNames(page);
  check(/BRCA1/.test(names[0]), `top result is BRCA1 (got "${names[0]}")`);
  const first = page.locator('#results .result').first();
  await first.locator('summary', { hasText: 'Leaflets' }).click();
  const hrefs = await first.locator('.sources a').evaluateAll(as => as.map(a => a.href));
  check(hrefs.includes('https://www.ncbi.nlm.nih.gov/books/NBK1247/'), 'GeneReviews links to NBK1247 chapter');
  check(hrefs.includes('https://www.omim.org/entry/604370') && hrefs.includes('https://www.omim.org/entry/113705'), 'OMIM phenotype #604370 and gene *113705 linked');
  check(hrefs.includes('https://www.eastgenomics.nhs.uk/for-patients-and-carers/patient-information/brca1/'), 'East Genomics BRCA1 leaflet is a direct link');
  check(hrefs.some(h => h.includes('ukcgg_brca1_guideline')), 'UKCGG BRCA1 guideline linked');
  check(!hrefs.some(h => h.includes('?term=') || h.includes('omim.org/search')), 'no search links for BRCA1');
  const body = await page.textContent('body');
  check(!body.includes('Other chapter') && !body.includes('listed on A-Z index'), 'no "Other chapter" or A-Z placeholders');

  console.log('Lynch: endometrial cancer 45 with MSH2/MSH6 loss');
  await page.click('#clear');
  await setPerson(page, 0, 'F', [{ site: 'uterus', hist: 'endometrioid', age: 45, mmr: 'msh2' }]);
  names = await topNames(page);
  check(/MSH2/.test(names[0]), `top result is Lynch MSH2 (got "${names[0]}")`);

  console.log('MEN1: parathyroid adenoma 28 + GH adenoma 32');
  await page.click('#clear');
  await setPerson(page, 0, 'M', [{ site: 'parathyroid', hist: 'adenoma', age: 28 }, { site: 'pituitary', hist: 'gh', age: 32 }]);
  names = await topNames(page);
  check(/MEN1/.test(names[0]), `top result is MEN1 (got "${names[0]}")`);
  const testCards = await page.locator('#results .test-rows li').allTextContents();
  check(testCards.some(t => /R217/.test(t) && /Part IV/.test(t)), 'R217 Endocrine neoplasia shown with Part IV');
  check(testCards.some(t => /R151/.test(t)), 'R151 familial hyperparathyroidism suggested');

  console.log('HLRCC: FH-deficient RCC 35');
  await page.click('#clear');
  await setPerson(page, 0, 'F', [{ site: 'kidney', hist: 'fhrcc', age: 35 }]);
  names = await topNames(page);
  check(/FH/.test(names[0]), `top result is HLRCC (got "${names[0]}")`);
  const h2 = page.locator('#results .result').first();
  await h2.locator('summary', { hasText: 'Leaflets' }).click();
  const h2refs = await h2.locator('.sources a').evaluateAll(as => as.map(a => a.href));
  check(h2refs.some(h => h.endsWith('kidney-hereditary-leiomyomatosis-and-renal-cell-cancer-hlrcc/')), 'HLRCC leaflet linked directly');
  check(h2refs.includes('https://www.omim.org/entry/150800'), 'OMIM #150800 linked');

  console.log('European guidance: PJS');
  await page.click('#clear');
  await setPerson(page, 0, 'F', [{ site: 'polyps', hist: 'pj', age: 20 }]);
  const pj = page.locator('#results .result').first();
  await pj.locator('summary', { hasText: 'Leaflets' }).click();
  const pjText = await pj.locator('.sources').textContent();
  const pjRefs = await pj.locator('.sources a').evaluateAll(as => as.map(a => a.href));
  check(/European guidance/.test(pjText) && pjRefs.includes('https://doi.org/10.3390/jcm10030473'), 'PJS shows EHTG European guideline');
  const euCount = await page.evaluate(() => Object.values(SOURCES).filter(s => s.eu).length);
  check(euCount === 55, `55 conditions have European guidance (got ${euCount})`);

  console.log('US guidance: MEN2');
  await page.click('#clear');
  await setPerson(page, 0, 'F', [{ site: 'thyroid', hist: 'medullary', age: 30 }]);
  const mtc = page.locator('#results .result').first();
  check(/MEN|RET/.test(await mtc.locator('h3').textContent()), 'MTC ranks MEN2 first');
  await mtc.locator('summary', { hasText: 'Leaflets' }).click();
  const mtcText = await mtc.locator('.sources').textContent();
  const mtcRefs = await mtc.locator('.sources a').evaluateAll(as => as.map(a => a.href));
  check(/US and international guidance/.test(mtcText) && mtcRefs.includes('https://doi.org/10.1089/thy.2014.0335'), 'MEN2 shows ATA MTC guideline');
  const usCount = await page.evaluate(() => Object.values(SOURCES).filter(s => s.us).length);
  check(usCount === 90, `90 conditions have US/international guidance (got ${usCount})`);

  console.log('Testing pointers (AACR 2024 CNS update)');
  await page.click('#clear');
  await setPerson(page, 0, 'F', [{ site: 'cns', hist: 'medullo_shh', age: 2 }]);
  let ptr = await page.locator('#results .pointers').textContent().catch(() => '');
  check(/up to 40%/.test(ptr) && /R456/.test(ptr) && /NHS route/.test(ptr), 'SHH medulloblastoma shows AACR pointer with NHS route');
  const shh = await topNames(page);
  check(/SUFU/.test(shh[0]), `infant SHH-MB ranks SUFU first (got "${shh[0]}")`);
  await page.click('#clear');
  await setPerson(page, 0, 'M', [{ site: 'cns', hist: 'meningioma', age: 15 }]);
  ptr = await page.locator('#results .pointers').textContent().catch(() => '');
  check(/evaluate for a predisposition syndrome/.test(ptr) && /R221/.test(ptr), 'child meningioma shows CPS evaluation pointer');
  await page.locator('#family input[data-f=age]').fill('45');
  check(await page.locator('#results .pointers').count() === 0, 'pointer age limit respected (meningioma at 45: none)');
  await page.click('#clear');
  await setPerson(page, 0, 'F', [{ site: 'sarcoma', hist: 'chordoma', age: 12 }]);
  const ch = await topNames(page);
  check(/TBXT/.test(ch[0]) && /TBXT/.test(await page.locator('#results .pointers').textContent()), `chordoma ranks familial chordoma (TBXT) first with pointer (got "${ch[0]}")`);
  await page.click('#clear');
  await setPerson(page, 0, 'M', [{ site: 'feature', hist: 'enchondromas' }, { site: 'cns', hist: 'lgg', age: 30 }]);
  check(/Ollier/.test((await topNames(page))[0]), 'enchondromas + glioma ranks Ollier/Maffucci first');
  await page.goto(BASE + '#syndrome=ollier'); await page.waitForSelector('#syn-detail h2');
  const ol = await page.locator('#syn-detail').textContent();
  check(/%166000/.test(ol) && /Not on the NICPR gene list/.test(ol) && /AACR 2023 workshop update: predisposition and surveillance for childhood brain tumours/.test(ol), 'Ollier page: % OMIM entry, NICPR flag and AACR citation');
  await page.goto(BASE + '#syndromes');
  await page.selectOption('#browse-mode', 'cancer'); await page.selectOption('#browse-site', 'cns'); await page.selectOption('#browse-hist', 'atrt');
  check(/SMARCB1/.test(await page.locator('#browse-results .pointers').textContent()), 'By-cancer view shows pointer for AT/RT');
  await page.goto(BASE);

  console.log('Haematology: AML with relative AML');
  await page.click('#clear');
  await setPerson(page, 0, 'M', [{ site: 'heme', hist: 'aml', age: 30 }]);
  await addRelative(page, 'father', 'M', [{ site: 'heme', hist: 'aml', age: 50 }]);
  const haemTests = await page.locator('#results .test-rows li').allTextContents();
  check(haemTests.some(t => /R347/.test(t) && /Part VIII/.test(t)), 'R347 inherited AML test with Part VIII');

  console.log('Syndromes tab');
  await page.click('[data-tab=browse]');
  check(await page.locator('.tabs [data-tab=browse]').textContent() === 'Syndromes', 'tab is named Syndromes');
  check(await page.locator('#syn-list li a').count() === 103, 'list shows all 103 syndromes');
  check(await page.locator('#syn-list h2.list-group').count() === 12, 'list grouped into 12 categories');
  await page.fill('#browse-search', 'GATA2');
  const gText = await page.locator('#syn-detail').textContent();
  check(/GATA2 deficiency/.test(gText) && /no chapter/i.test(gText), 'GATA2: detail opens, GeneReviews fallback shown');
  check(/UKCGG GATA2 management guideline/.test(gText) && /Cancer – diagnostic genetic testing/.test(gText), 'GATA2: UKCGG guideline and general leaflet shown');
  await page.fill('#browse-search', '');
  await page.selectOption('#browse-test', 'R217');
  const r217 = await page.locator('#syn-list li a').allTextContents();
  check(r217.length === 5 && r217.some(t => /MEN1/.test(t)) && r217.some(t => /AIP/.test(t)), `R217 filter lists 5 syndromes incl. MEN1, AIP (got ${r217.length})`);
  await page.selectOption('#browse-test', '');
  await page.check('#browse-ukcgg');
  const uk = await page.locator('#syn-list li a').count();
  check(uk === 44, `UK guideline filter lists 44 syndromes (got ${uk})`);
  await page.uncheck('#browse-ukcgg');

  console.log('Syndrome page (via shareable link)');
  await page.goto(BASE + '#syndrome=lynch_msh2');
  await page.waitForSelector('#syn-detail h2');
  check(/Lynch syndrome \(MSH2/.test(await page.textContent('#syn-detail h2')), '#syndrome=lynch_msh2 opens the Lynch MSH2 page');
  check((await page.locator('#syn-list a[aria-current]').textContent()).trim() === 'Lynch syndrome (MSH2 / EPCAM)', 'list highlights the open syndrome');
  const rows = await page.locator('#syn-detail .syn-table:not(.dates):not(.surv-table) tbody tr').count();
  check(rows === 13, `cancers table has one row per association (got ${rows})`);
  const head = await page.locator('#syn-detail .syn-table:not(.dates):not(.surv-table) thead').textContent();
  check(/Strength/.test(head) && /Age \/ condition/.test(head) && !/Early onset/.test(head), 'table shows strength and one Age / condition column');
  const d = await page.locator('#syn-detail').textContent();
  check(/R210/.test(d) && /Inherited MMR deficiency/.test(d) && /dMMR tumour/.test(d), 'tests with criteria shown');
  check(!/NICPR notes/.test(d) && !/biallelic only/.test(d) && !/not on NICPR/i.test(d), 'no NICPR scope warnings on Lynch MSH2/EPCAM');
  const lw = await page.evaluate(() => ['lynch_mlh1', 'lynch_msh6', 'lynch_pms2', 'rad51c'].map(id => CONDITIONS.find(c => c.id === id)).filter(c => c.note && /NICPR/.test(c.note) || c.notOnNicpr).length);
  check(lw === 0, 'no NICPR warnings on the other Lynch genes or RAD51C');
  const dRefs = await page.locator('#syn-detail a').evaluateAll(as => as.map(a => a.href));
  for (const [u, what] of [['https://www.ncbi.nlm.nih.gov/books/NBK1211/', 'GeneReviews'], ['https://www.omim.org/entry/120435', 'OMIM phenotype'], ['https://www.omim.org/entry/609309', 'OMIM gene'], ['msh2-guidelines-v5', 'UKCGG'], ['10.1002/bjs.11902', 'EHTG Lynch'], ['10.1053/j.gastro.2014.04.001', 'USMSTF Lynch'], ['endometrial-cancer-lynch-syndrome', 'East Genomics leaflet']])
    check(dRefs.some(h => h.includes(u)), `${what} linked`);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('[data-syn-act=copy]');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(/^LYNCH SYNDROME \(MSH2/.test(clip) && /CANCERS AND HISTOLOGY/.test(clip) && /EUROPEAN GUIDANCE/.test(clip) && /#syndrome=lynch_msh2/.test(clip), 'Copy summary produces a full text summary');
  check(/Information sources and dates →/.test(d) && /Information checked 12 October 2026/.test(d) && !(await page.locator('#syn-detail table.dates').count()), 'syndrome page shows a sources button, not the table');
  const order = await page.locator('#syn-detail h3').allTextContents();
  check(order.indexOf('Suggested surveillance') === order.length - 1 && order.indexOf('Guidance, leaflets and references') < order.indexOf('Suggested surveillance'), 'surveillance is the last section, after references');
  await page.click('#syn-detail a[href="#sources"]');
  await page.waitForFunction(() => location.hash === '#sources');
  check(JSON.stringify(await shown()) === '["tab-sources"]' && await page.locator('[data-tab=sources].active').count() === 1, 'sources button opens the Sources tab');
  const srcTxt = await page.locator('#sources-page').textContent();
  check(/Information sources and dates/.test(srcTxt) && /v9\.1, 20 May 2026/.test(srcTxt) && /12 October 2026/.test(srcTxt), 'Sources tab lists sources with dates');
  await page.goBack(); await page.waitForFunction(() => location.hash === '#syndrome=lynch_msh2');
  check(JSON.stringify(await shown()) === '["tab-browse"]', 'Back returns to the syndrome page');
  await page.goto(BASE + '#sources'); await page.waitForSelector('#sources-page table');
  check(JSON.stringify(await shown()) === '["tab-sources"]', '#sources opens directly');

  console.log('Suggested surveillance');
  const survOf = async (hash) => { await page.goto(BASE + hash); await page.waitForSelector('#syn-detail h2'); return page.locator('#syn-detail').textContent(); };
  let sv = await survOf('#syndrome=lynch_msh2');
  check(/Suggested surveillance/.test(sv) && /UK guidance/.test(sv) && /Colonoscopy every 2 years from 25 to 75/.test(sv) && /Aspirin 75 mg daily from 20/.test(sv), 'Lynch MSH2: UK (UKCGG) surveillance shown');
  sv = await survOf('#syndrome=men2');
  check(/International guidance/.test(sv) && /calcitonin/.test(sv) && /American Thyroid Association/.test(sv), 'MEN2: international surveillance citing ATA');
  sv = await survOf('#syndrome=nf1');
  check(/UK guidance/.test(sv) && /Women 40–50/.test(sv), 'NF1: UK (Manchester) surveillance');
  sv = await survOf('#syndrome=fap');
  check(/Other guidance that differs/.test(sv) && /Thyroid ultrasound at baseline/.test(sv) && /Hepatoblastoma: abdominal ultrasound and AFP/.test(sv), 'FAP: UK first with EHTG and AACR differences');
  sv = await survOf('#syndrome=tylosis');
  check(/Suggested surveillance/.test(sv) && /No guideline linked/.test(sv), 'Tylosis: states no guideline');
  sv = await survOf('#gene=ATM');
  check(/Suggested surveillance\s*ATM-related/.test(sv) && /UKCGG ATM/.test(sv) && /Ataxia/.test(sv), 'ATM gene page shows surveillance for both syndromes');
  await page.goto(BASE + '#syndrome=pjs'); await page.waitForSelector('#syn-detail h2');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('[data-syn-act=copy]');
  const clip2 = await page.evaluate(() => navigator.clipboard.readText());
  check(/SUGGESTED SURVEILLANCE \(UK guidance\)/.test(clip2) && /Differs – EHTG/.test(clip2), 'Copy summary includes surveillance and differences');
  check(/Last reviewed: 11 October 2026/.test(clip2) && !/due for review/.test(clip2), 'Copy summary includes last reviewed date');

  for (const id of ['chek2', 'atm', 'bard1', 'rad51c', 'rad51d']) {
    const t = await survOf('#syndrome=' + id);
    check(/bilateral mastectomy only if lifetime breast cancer risk [≥>]30%/.test(t), `${id}: mastectomy discussed only if lifetime risk ≥/>30% (UKCGG)`);
  }
  check(/no lifetime-risk threshold in UKCGG BRCA1/.test(await survOf('#syndrome=brca1')), 'BRCA1: mastectomy not tied to a risk threshold');
  { const t = await survOf('#syndrome=nf1');
    check(/UK guidance/.test(t) && /Manchester Centre for Genomic Medicine NF1 review/.test(t) && /annual mammography/.test(t) && /ERN GENTURIS 2023: breast MRI/.test(t), 'NF1: Manchester NF1 checklist surveillance, ERN difference noted');
    check(await page.locator('#syn-detail a[href*="NF1_review_checklist_.pdf"]').count() >= 2, 'NF1: Manchester checklist linked');
  }
  console.log('Last reviewed dates');
  await page.goto(BASE + '#syndrome=men2'); await page.waitForSelector('#syn-detail h2');
  const facts = await page.locator('#syn-detail .syn-facts').textContent();
  check(/Last reviewed\s*11 October 2026/.test(facts) && !(await page.locator('#syn-detail .stale-flag').count()), 'MEN2 page shows Last reviewed 11 October 2026, not flagged');
  await page.evaluate(() => { LAST_REVIEWED.vhl = '2025-01-01'; location.hash = '#syndrome=vhl'; });
  await page.waitForFunction(() => /von Hippel/i.test(document.querySelector('#syn-detail h2').textContent));
  check(/1 January 2025/.test(await page.locator('#syn-detail .syn-facts').textContent()) && await page.locator('#syn-detail .reviewed.stale .stale-flag').count() === 1, 'date over 12 months old is flagged as due for review');
  await page.reload(); await page.waitForSelector('#syn-detail h2');

  console.log('Gene pages');
  await page.goto(BASE + '#gene=ATM');
  await page.waitForSelector('#syn-detail h2');
  check(await page.textContent('#syn-detail h2') === 'ATM' && await page.inputValue('#browse-mode') === 'gene', '#gene=ATM opens the ATM gene page in By gene view');
  const atm = await page.locator('#syn-detail').textContent();
  check(/ATM-related cancer predisposition/.test(atm) && /Ataxia–telangiectasia/.test(atm), 'gene page lists both ATM syndromes');
  check(/R208/.test(atm) && /R294/.test(atm) && /UKCGG ATM management guideline/.test(atm) && /\*607585/.test(atm), 'gene page merges tests, guidance and OMIM');
  check(/Information sources and dates →/.test(atm) && (await page.locator('#syn-detail h3').allTextContents()).pop() === 'Suggested surveillance', 'gene page: surveillance last, sources button');
  const atmHead = await page.locator('#syn-detail .syn-table:not(.dates):not(.surv-table) thead').textContent();
  const atmRows = await page.locator('#syn-detail .syn-table:not(.dates):not(.surv-table) tbody tr').allTextContents();
  check(/Last reviewed/.test(atmHead) && atmRows.length === 2 && atmRows.every(r => /11 October 2026/.test(r)), 'gene page shows last reviewed date per syndrome');
  const geneCount = await page.locator('#syn-list li a').count();
  check(geneCount === 137, `By gene lists all 137 genes (got ${geneCount})`);
  await page.locator('#syn-detail a[href="#syndrome=at"]').click();
  await page.waitForFunction(() => location.hash === '#syndrome=at');
  check(/Ataxia/.test(await page.textContent('#syn-detail h2')), 'gene page links to its syndrome pages');
  await page.locator('#syn-detail .syn-facts a[href="#gene=ATM"]').click();
  await page.waitForFunction(() => location.hash === '#gene=ATM');
  check(await page.textContent('#syn-detail h2') === 'ATM', 'syndrome page links back to gene page');

  console.log('Printing');
  await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await page.goto(BASE + '#syndrome=men2'); await page.waitForSelector('#syn-detail h2');
  await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await page.click('[data-syn-act=print]');
  await page.emulateMedia({ media: 'print' });
  const pa = await page.locator('#print-area').innerText();
  check(await page.evaluate(() => window.__printed) === 1 && /Multiple endocrine neoplasia type 2/.test(pa), 'Print renders the syndrome into the print area');
  check(!(await page.isVisible('#syn-list')) && !(await page.isVisible('.tabbar')) && await page.isVisible('#print-area'), 'printout shows only the print area');
  check(/information checked 12 October 2026/.test(pa) && /Clinical decision support only/.test(pa), 'printout has date and disclaimer footer');
  check(/Suggested surveillance/.test(pa) && /calcitonin/.test(pa), 'printout includes suggested surveillance');
  check(await page.isVisible('#print-area .print-legal') && /clinical decision support for healthcare professionals/.test(pa) && /To the extent permitted by law/.test(pa) && /authors' employers or of NHS England/.test(pa), 'syndrome printout ends with the full disclaimer');
  check(/Information sources and dates/.test(pa) && /v9\.1, 20 May 2026/.test(pa) && /#sources/.test(pa) && !/Information sources and dates →/.test(pa), 'printout keeps the dated sources table and the list address');
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('#print-area a[href^="https://doi.org/10.1089"]'), '::after').content);
  check(/doi\.org\/10\.1089\/thy\.2014\.0335/.test(after), 'printout shows URLs after links');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  check(await page.locator('#print-area').innerHTML() === '' && !(await page.evaluate(() => document.body.classList.contains('printing'))), 'print area cleared after printing');
  check(await page.locator('#syn-list [data-sel]').count() === 0, 'no print checkboxes until "Select to print"');
  await page.click('[data-print=select]');
  check(await page.locator('#syn-list [data-sel]').count() === 103, '"Select to print" shows checkboxes');
  await page.check('[data-sel="syn:men2"]'); await page.check('[data-sel="syn:men1"]');
  await page.selectOption('#browse-mode', 'gene'); await page.check('[data-sel="gene:RET"]');
  check(/Print selected \(3\)/.test(await page.textContent('[data-print=selected]')), 'selection count shown (3)');
  await page.click('[data-print=selected]');
  const pages = await page.locator('#print-area .print-page').count();
  const contents = await page.locator('#print-area .print-contents li').allTextContents();
  check(pages === 4 && contents.join('|') === 'Multiple endocrine neoplasia type 1 (MEN1)|Multiple endocrine neoplasia type 2 (RET)|RET (gene)', `Print selected: contents + 3 pages in order (${contents.join('|')})`);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.click('[data-print=done]');
  check(await page.locator('#syn-list [data-sel]').count() === 0 && await page.locator('[data-print=select]').count() === 1, 'Clear selection empties it and hides checkboxes');
  await page.selectOption('#browse-mode', 'syndrome');
  await page.fill('#browse-search', 'Lynch');
  await page.click('[data-print=shown]');
  check(await page.locator('#print-area .print-page').count() === 4 + 1, 'Print all shown prints the filtered list (4 Lynch syndromes) plus contents');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.fill('#browse-search', '');

  console.log('Browse by cancer');
  await page.selectOption('#browse-mode', 'cancer');
  check(!(await page.isVisible('#syn-layout')), 'list/detail hidden in cancer mode');
  await page.selectOption('#browse-site', 'ovary');
  const ovary = await page.locator('#browse-results .result h3').allTextContents();
  check(!ovary.some(t => /PMS2/.test(t)) && !ovary.some(t => /BARD1/.test(t)), 'PMS2 and BARD1 not listed for ovarian cancer');
  const firstName = await page.locator('#browse-results .result h3 a').first().textContent();
  await page.locator('#browse-results .result h3 a').first().click();
  await page.waitForSelector('#syn-detail h2', { state: 'visible', timeout: 5000 }).catch(() => {});
  check(await page.isVisible('#syn-detail h2') && (await page.textContent('#syn-detail h2')) === firstName, `syndrome name in cancer view opens its page (${firstName})`);
  await page.selectOption('#browse-mode', 'cancer');
  await page.locator('#browse-results .result h3 a').first().click();
  await page.waitForSelector('#syn-detail h2', { state: 'visible', timeout: 5000 }).catch(() => {});
  check(await page.isVisible('#syn-detail h2'), 'clicking the already-open syndrome again still opens it');

  console.log('All syndrome pages render');
  const ids = await page.evaluate(() => CONDITIONS.map(c => c.id));
  let bad = [], links = 0;
  for (const id of ids) {
    await page.evaluate(i => { location.hash = 'syndrome=' + i; }, id);
    await page.waitForFunction(i => document.querySelector('#syn-list a[aria-current]')?.getAttribute('href') === '#syndrome=' + i, id);
    const hrefs = await page.locator('#syn-detail a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    links += hrefs.length;
    if (!hrefs.length || hrefs.some(h => !(/^https:\/\//.test(h) || /^#gene=[A-Z0-9]+$/.test(h) || h === "#sources") || /undefined|null/.test(h))) bad.push(id);
    if (await page.locator('#syn-detail .syn-table:not(.dates):not(.surv-table) tbody tr').count() === 0) bad.push(id + ':table');
  }
  check(bad.length === 0, `all ${ids.length} syndrome pages render with valid links (${links} links)${bad.length ? ': ' + bad.join(', ') : ''}`);

  console.log('Assessment links to syndrome page');
  await page.goto(BASE);
  await loadEx(page); await openAll(page);
  await page.locator('#results .syn-open').first().click();
  check(/BRCA1/.test(await page.textContent('#syn-detail h2')), '"Open syndrome page" opens BRCA1');

  console.log('Family tree');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#ped svg');
  check(await page.evaluate(() => document.getElementById('ped').open) && await page.locator('#ped').evaluate(el => el.compareDocumentPosition(document.querySelector('#results .result')) & Node.DOCUMENT_POSITION_FOLLOWING), 'family tree shown, open, above the results');
  check(await page.locator('#ped [data-person]').count() === 4 && await page.locator('#ped .ped-person.implied').count() === 2, 'tree: 4 entered people plus 2 implied grandparents');
  check(await page.locator('#ped .ped-arrow').count() === 1 && await page.locator('#ped circle').count() >= 4 && await page.locator('#ped rect.ped-sym').count() >= 2, 'tree: pedigree symbols and proband arrow');
  const hitIds = () => page.locator('#ped-wrap .ped-hitfill').evaluateAll(els => els.map(e => e.closest('[data-person]')?.querySelector('.ped-rel')?.textContent));
  check(JSON.stringify((await hitIds()).sort()) === JSON.stringify(['Mat. aunt', 'Mother', 'Proband']) && await page.locator('#ped-wrap .ped-aff').count() === 1, 'BRCA1 highlight: proband, mother, aunt blue; father grey');
  check(/Mother.*Ovary/.test(await page.locator('#ped [data-person] title').allTextContents().then(t => t.join('|'))), 'tree: hover text gives full details');
  await page.click('[data-mode=wide]');
  const lynch = await page.locator('#ped-syn option').evaluateAll(os => os.find(o => /Lynch/.test(o.textContent))?.value);
  await page.selectOption('#ped-syn', lynch);
  check((await hitIds()).includes('Father') && await page.locator(`#results .result.in-tree[data-cond="${lynch}"]`).count() === 1, 'switching highlight to Lynch fills the father and marks the card');
  await page.locator('#results .result').nth(1).locator('h3').click();
  const second = await page.locator('#results .result').nth(1).getAttribute('data-cond');
  check(await page.inputValue('#ped-syn') === second && /Highlighted in the family tree/.test(await page.locator('#results .result').nth(1).textContent()), 'clicking a result title highlights it in the tree');
  await page.click('#ped > summary');
  await page.click('[data-mode=wide]');
  check(!(await page.evaluate(() => document.getElementById('ped').open)), 'collapsed tree stays collapsed after re-render');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  check(await page.evaluate(() => document.getElementById('ped').open), 'printing opens the tree');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check(!(await page.evaluate(() => document.getElementById('ped').open)), 'tree returns to collapsed after printing');
  await page.click('#ped > summary'); await page.click('[data-mode=balanced]');
  for (const kind of ['png', 'svg']) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-ped-dl=${kind}]`)]);
    const path = await dl.path(); const size = require('fs').statSync(path).size;
    const head = require('fs').readFileSync(path).slice(0, 8).toString('latin1');
    check(dl.suggestedFilename() === `family-tree.${kind}` && size > 2000 && (kind === 'png' ? head.includes('PNG') : head.startsWith('<svg')), `Download ${kind.toUpperCase()} saves family-tree.${kind} (${size} bytes)`);
  }
  check((await page.evaluate(() => document.querySelector('#ped-wrap svg').getBoundingClientRect().width)) <= (await page.evaluate(() => document.getElementById('ped-wrap').clientWidth)) + 1, 'tree fits its panel (desktop)');

  console.log('Proband arrow and abbreviations');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#ped svg');
  const arr = await page.evaluate(() => {
    const nums = d => d.match(/-?[\d.]+/g).map(Number);
    const shaft = nums(document.querySelector('#ped .ped-arrow').getAttribute('d'));
    const head = nums(document.querySelector('#ped .ped-arrowhead').getAttribute('d'));
    const sym = document.querySelector('#ped [data-person] circle, #ped [data-person] rect');
    return { shaft, head };
  });
  const [sx, sy, bx, by] = arr.shaft, [tx, ty, h1x, h1y, h2x, h2y] = arr.head;
  const baseMid = [(h1x + h2x) / 2, (h1y + h2y) / 2];
  check(ty > sy && tx > sx && ty > baseMid[1] && tx > baseMid[0], 'proband arrow points down towards the proband, head along the shaft');
  await page.click('[data-mode=wide]');
  await page.goto(BASE + '#syndrome=hlrcc'); await page.waitForSelector('#syn-detail h2');
  const ab = page.locator('#syn-detail abbr.abbr', { hasText: /^RCC$/ }).first();
  check(await ab.count() === 1 && await ab.getAttribute('data-full') === 'renal cell carcinoma', 'abbreviations in the cancers table are marked');
  await ab.hover(); await page.waitForTimeout(50);
  check(await page.isVisible('#abbr-tip') && (await page.textContent('#abbr-tip')) === 'renal cell carcinoma', 'hovering an abbreviation shows its meaning at once');
  await page.mouse.move(2, 2); await page.waitForTimeout(50);
  check(!(await page.isVisible('#abbr-tip')), 'tooltip hides when the pointer moves away');
  await page.goto(BASE + '#syndrome=brca1'); await page.waitForSelector('#syn-detail h2'); await page.waitForTimeout(100);
  check(await page.locator('#syn-detail abbr.abbr', { hasText: /^MRI$/ }).count() > 0 && await page.locator('#syn-detail abbr.abbr', { hasText: /^UKCGG$/ }).count() > 0, 'surveillance and sources text marks abbreviations (MRI, UKCGG)');
  await page.goto(BASE + '#syndrome=lynch_msh2'); await page.waitForSelector('#syn-detail h2'); await page.waitForTimeout(100);
  const ihc = page.locator('#syn-detail abbr.abbr', { hasText: /^IHC$/ }).first();
  check(await ihc.count() === 1, 'IHC marked on the Lynch page');
  if (await ihc.count()) { await ihc.scrollIntoViewIfNeeded(); await ihc.hover(); await page.waitForTimeout(50); check(/immunohistochemistry/.test(await page.textContent('#abbr-tip')), 'IHC tooltip says immunohistochemistry'); }
  check(await page.locator('.site-foot abbr.abbr', { hasText: 'NICPR' }).count() > 0, 'footer abbreviations marked');
  await page.goto(BASE + '#syndrome=brca2'); await page.waitForSelector('#syn-detail h2'); await page.waitForTimeout(100);
  check(await page.locator('#syn-detail abbr.abbr[data-full="lobular carcinoma in situ"]', { hasText: /^LCIS$/ }).count() > 0 || await page.evaluate(() => !/\bLCIS\b/.test(document.getElementById('syn-detail').textContent)), 'LCIS marked where it appears');
  check(await page.evaluate(() => ABBREVIATIONS.LCIS === 'lobular carcinoma in situ'), 'LCIS in the abbreviation list');
  await page.click('[data-tab=assess]'); await page.click('#clear');
  const d0 = page.locator('#family .dx').first();
  await d0.locator('select[data-f=site]').selectOption('sarcoma'); await d0.locator('select[data-f=hist]').selectOption({ label: 'Gastrointestinal stromal tumour (GIST)' });
  check(/GIST = gastrointestinal stromal tumour/.test(await page.locator('#family .abbr-hint').first().textContent()), 'form spells out the abbreviation in the chosen histology');
  await d0.locator('select[data-f=site]').selectOption('breast');
  check(await page.locator('#family .dx-markers abbr.abbr', { hasText: 'HER2' }).count() === 1, 'ER / PR / HER2 labels are expandable');
  await page.locator('#family .dx').first().locator('select[data-f=site]').selectOption('breast');
  await page.locator('#family .dx').first().locator('select[data-f=hist]').selectOption('dcis');
  await page.locator('#family .dx').first().locator('input[data-f=age]').fill('45');
  await page.waitForTimeout(150);
  const dcis = page.locator('#results abbr.abbr:visible', { hasText: /^DCIS$/ }).first();
  check(await dcis.count() === 1, 'DCIS marked in the results');
  await dcis.scrollIntoViewIfNeeded(); await dcis.hover(); await page.waitForTimeout(50);
  check((await page.textContent('#abbr-tip')) === 'ductal carcinoma in situ', 'DCIS tooltip says ductal carcinoma in situ');
  await page.evaluate(() => { document.getElementById('ped').open = true; });
  await page.waitForTimeout(100);
  check(await page.locator('#ped-wrap svg text[data-tip*="DCIS = ductal carcinoma in situ"]').count() > 0, 'family tree labels carry abbreviation tooltips');

  console.log('Association evidence');
  await page.goto(BASE + '#syndrome=lynch_msh2'); await page.waitForSelector('#syn-detail h2');
  const evHead = await page.locator('#syn-detail table.cancers thead').textContent();
  const evCells = await page.locator('#syn-detail table.cancers td.ev').allTextContents();
  check(/Risk and evidence/.test(evHead) && evCells.length > 5 && evCells.every(t => t.trim().length > 0), 'every association shows a risk figure and/or sources');
  check(await page.locator('#syn-detail td.ev a[href*="ukcgg.org"]').count() > 0 && await page.locator('#syn-detail td.ev a[href*="doi.org"]').count() > 0, 'evidence links to UKCGG and peer-reviewed papers');
  check(await page.locator('#syn-detail #jump-variants').count() === 1 && await page.locator('#syn-detail .variant-notes li').count() >= 3, 'variant-level notes section on syndrome page');
  await page.goto(BASE + '#gene=RET'); await page.waitForSelector('#syn-detail h2');
  check(await page.locator('#syn-detail a[href="https://canvaruk.org/RET/genespecview"]').count() === 1 && await page.locator('#syn-detail a[href^="https://search.clinicalgenome.org/kb/genes/HGNC:"]').count() === 1, 'gene page links CanVar-UK and ClinGen');
  check(/Met918Thr/.test(await page.locator('#syn-detail').textContent()), 'RET gene page shows codon-level notes');
  await page.click('[data-tab=sources]');
  check(await page.locator('#sources-page .evidence-refs li').count() >= 50, 'Sources tab lists the evidence references');

  console.log('Review decisions');
  const r = await page.evaluate(() => {
    const br = id => CONDITIONS.find(c => c.id === id).rules.find(x => x[0] === 'breast' && x[1] === '*' && !x[4]);
    return { rad51c: br('rad51c')[2], rad51d: br('rad51d')[2], bard1: br('bard1')[2],
      brca2Mel: CONDITIONS.find(c => c.id === 'brca2').rules.some(x => x[0] === 'skin' && x[1] === 'melanoma'), brca2Uveal: CONDITIONS.find(c => c.id === 'brca2').rules.some(x => x[0] === 'eye'),
      faHasFancm: CONDITIONS.find(c => c.id === 'fanconi').genes.includes('FANCM'),
      fancm: CONDITIONS.filter(c => c.genes.includes('FANCM')).map(c => c.id) };
  });
  check(r.rad51c === 'M' && r.rad51d === 'M' && r.bard1 === 'M', 'RAD51C, RAD51D and BARD1 breast cancer are moderate');
  check(!r.brca2Mel && !r.brca2Uveal, 'BRCA2 no longer lists cutaneous or uveal melanoma');
  check(!r.faHasFancm && JSON.stringify(r.fancm) === '["fancm"]', 'FANCM removed from Fanconi anaemia and has its own recessive FANCM condition');
  await page.goto(BASE + '#syndrome=fancm'); await page.waitForSelector('#syn-detail h2');
  check(/Recessive FANCM cancer syndrome/.test(await page.textContent('#syn-detail h2')) && /Nynäs 2025/.test(await page.locator('#syn-detail').textContent()), 'FANCM syndrome page renders with its source');

  console.log('Usability batch');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .result');
  const cards = page.locator('#results .result');
  const nCards = await cards.count();
  check(nCards >= 4 && await cards.nth(0).locator('.evidence').count() === 1 && await cards.nth(2).locator('.evidence').count() === 1 && await cards.nth(3).evaluate(el => el.classList.contains('compact')) && await cards.nth(3).locator('.evidence').count() === 0, 'top three results in full, the rest compact');
  await cards.nth(3).locator('[data-expand]').click();
  check(await page.locator('#results .result').nth(3).locator('.evidence').count() === 1, 'Show details expands a compact result');
  await page.locator('#results .result').nth(3).locator('[data-collapse]').click();
  check(await page.locator('#results .result').nth(3).evaluate(el => el.classList.contains('compact')), 'Show less collapses it again');
  const firstTxt = await cards.nth(0).textContent();
  check(/54\.0 points/.test(firstTxt) && /top match/.test(firstTxt) && /Why here:.*hallmark.*match/i.test(firstTxt), 'score bar labelled, with a why-ranked line');
  check(/\d+% of top/.test(await cards.nth(1).locator('.bar-label').textContent()), 'second result shows % of top');
  check(await cards.nth(0).locator('.tests-line .code-sm').count() >= 2 && await cards.nth(0).locator('.tests').count() === 0, 'tests shown as one compact line');
  check(await page.locator('#results .tier-legend .tier').count() === 4, 'strength legend shown with pills');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#results .evidence .tier')).borderRadius) !== '0px', 'strength labels are pills');
  check(JSON.stringify(await page.locator('#family select[data-f=er]').first().locator('option').allTextContents()) === '["Unknown","Pos","Neg"]', 'ER/PR/HER2 options read Unknown / Pos / Neg');
  check(await page.evaluate(() => document.body.classList.contains('compact-head')) && !(await page.isVisible('.lede-long')) && await page.isVisible('.disc-short'), 'header slims once a family is entered');
  check(await page.isVisible('#compare-top'), 'Compare top two button shown');
  await page.click('#compare-top');
  await page.waitForFunction(() => location.hash.startsWith('#compare='));
  await page.waitForSelector('#syn-detail table.compare');
  const cmpTxt = await page.locator('#syn-detail').textContent();
  check(/Compare syndromes/.test(cmpTxt) && /BRCA1/.test(cmpTxt) && /BRCA2/.test(cmpTxt) && await page.locator('#syn-detail table.compare tbody tr').count() >= 5 && !/surveillance/i.test(cmpTxt), 'compare view shows the cancers of the top two, no screening');
  await page.selectOption('#cmp-b', 'palb2');
  await page.waitForFunction(() => location.hash === '#compare=brca1,palb2');
  check(/PALB2/.test(await page.locator('#syn-detail table.compare thead').textContent()), 'compare pickers switch syndromes');
  await page.goto(BASE + '#syndrome=men2'); await page.waitForSelector('#syn-detail h2');
  await page.selectOption('#syn-detail .compare-pick', 'men1');
  await page.waitForFunction(() => location.hash === '#compare=men2,men1');
  check(await page.locator('#syn-detail table.compare').count() === 1, '"Compare with…" on a syndrome page opens the comparison');
  await page.goto(BASE + '#syndrome=lynch_msh2'); await page.waitForSelector('#syn-detail h2');
  const cg = await page.locator('#syn-detail td.ev').nth(1).locator('a').allTextContents();
  check(cg.includes('ClinGen MSH2') && cg.includes('ClinGen EPCAM') && new Set(cg).size === cg.length, 'ClinGen links name the gene, no duplicates');

  // Find a cancer type, undo, person details, ancestry, save / open / remember
  await page.goto(BASE); await page.click('#clear');
  await page.locator('#family .dx-find').first().fill(await page.evaluate(() => [...document.querySelectorAll('#cancer-finder option')].map(o => o.value).find(v => v.startsWith('Gastrointestinal stromal tumour'))));
  check(await page.inputValue('#family select[data-f=site]') === 'sarcoma' && await page.inputValue('#family select[data-f=hist]') === 'gist', 'typing in the find box sets site and histology');
  check(await page.evaluate(() => [...document.querySelectorAll('#cancer-finder option')].some(o => /RCC = renal cell carcinoma/.test(o.value))), 'find list includes spelled-out abbreviations');
  await page.click('#add-person');
  await page.locator('#family .person').nth(1).locator('[data-act=rm-person]').click();
  check(await page.locator('#family .person').count() === 1 && /removed/.test(await page.textContent('#toast')), 'removing a relative offers Undo');
  await page.click('#undo');
  check(await page.locator('#family .person').count() === 2, 'Undo restores the relative');
  const p1 = page.locator('#family .person').nth(1);
  await chooseRel(p1, 'mother');
  await p1.locator('input[data-f=deceased]').check();
  await p1.locator('input[data-f=ageDeath]').fill('67');
  await p1.locator('select[data-f=site]').selectOption('ovary'); await p1.locator('select[data-f=hist]').selectOption('hgsc'); await p1.locator('input[data-f=age]').fill('60');
  await page.selectOption('#ancestry', 'ashkenazi');
  await page.waitForSelector('#ped svg');
  check(await page.locator('#ped .ped-dead').count() === 1 && /d\. 67/.test(await page.locator('#ped-wrap svg').textContent()), 'tree marks the deceased relative with a slash and age at death');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#copy');
  const sum = await page.evaluate(() => navigator.clipboard.readText());
  check(/Ancestry: Ashkenazi Jewish/.test(sum) && /Mother \(deceased at 67\)/.test(sum), 'summary includes ancestry and deceased status');
  await page.click('[data-mode=wide]');
  const brcaCard = page.locator('#results .result[data-cond=brca1]');
  if (await brcaCard.evaluate(el => el.classList.contains('compact'))) await brcaCard.locator('[data-expand]').click();
  check(/Ashkenazi Jewish ancestry:/.test(await page.locator('#results .result[data-cond=brca1]').textContent()), 'Ashkenazi ancestry adds the founder-variant note to BRCA1');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save-family')]);
  const saved = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  check(/^family-history-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && saved.people.length === 2 && saved.ancestry === 'ashkenazi', 'Save family to file downloads the family');
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'fam.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await page.waitForFunction(() => document.querySelectorAll('#family .person').length === 2);
  check(await page.locator('#family .person.collapsed').count() === 2 && /deceased at 67/.test(await page.locator('#family .person').nth(1).textContent()), 'opened family starts folded into one-line cards');
  await openAll(page);
  check(await page.inputValue('#ancestry') === 'ashkenazi' && await page.locator('#family .person').nth(1).locator('input[data-f=ageDeath]').inputValue() === '67', 'Open family file restores it');
  await page.setInputFiles('#open-family', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nonsense') });
  await page.waitForFunction(() => /could not be opened/.test(document.getElementById('toast').textContent));
  check(await page.locator('#family .person').count() === 2, 'a bad file is rejected with a message and changes nothing');
  await page.check('#remember');
  await page.reload(); await page.waitForSelector('#family .person');
  check(await page.locator('#family .person').count() === 2 && await page.isChecked('#remember'), 'Remember on this device restores the family after a reload');
  await page.uncheck('#remember');
  await page.reload(); await page.waitForSelector('#family .person');
  check(await page.locator('#family .person').count() === 1, 'unticking forgets it');

  console.log('Printed assessment');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .result.compact');
  await page.click('#ped > summary');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  check(await page.locator('#results .result.compact').count() === 0 && await page.locator('#results .result .evidence').count() === await page.locator('#results .result').count(), 'printing shows every result in full');
  check(await page.isVisible('.fam-table') && /Mother/.test(await page.locator('.fam-table').textContent()) && /Ovary/.test(await page.locator('.fam-table').textContent()), 'printout starts with a family history table');
  check(await page.evaluate(() => document.getElementById('ped').open) && await page.isVisible('#ped-wrap svg'), 'printout includes the family tree');
  check(!(await page.isVisible('#family')), 'the input form is not printed');
  check(await page.isVisible('#disclaimer') && /Always check results against the primary sources/.test(await page.textContent('#disclaimer')), 'printed assessment includes the full disclaimer');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  check(await page.locator('#results .result.compact').count() > 0 && !(await page.isVisible('.fam-table')) && !(await page.evaluate(() => document.getElementById('ped').open)), 'after printing the screen view is restored');

  console.log('US guidance');
  await page.goto(BASE + '#syndrome=chek2'); await page.waitForSelector('#syn-detail h2');
  const chekEv = await page.locator('#syn-detail table.cancers').textContent();
  check(/US differs:.*NCCN/.test(chekEv) && await page.locator('#syn-detail .ev-diff').count() === 1, 'CHEK2 shows the NCCN colorectal difference');
  check(await page.evaluate(() => CONDITIONS.find(c => c.id === 'chek2').rules.some(r => r[0] === 'prostate' && r[2] === 'M')), 'CHEK2 prostate is moderate');
  check(await page.locator('#syn-detail td.ev a', { hasText: 'ACMG CHEK2 2023' }).count() > 0, 'peer-reviewed US guidance cited on associations');
  await page.goto(BASE + '#syndrome=tsc'); await page.waitForSelector('#syn-detail h2');
  check(/Chordoma/.test(await page.locator('#syn-detail table.cancers').textContent()), 'TSC chordoma restored on AACR 2024 evidence');

  console.log('GeNotes');
  await page.goto(BASE + '#syndrome=lynch_msh2'); await page.waitForSelector('#syn-detail h2');
  check(await page.locator('#syn-detail a[href="https://www.genomicseducation.hee.nhs.uk/genotes/knowledge-hub/lynch-syndrome/"]').count() === 1 && await page.locator('#syn-detail a[href*="genotes/in-the-clinic/presentation-patient-with-suspected-lynch-syndrome/"]').count() === 1, 'Lynch page links GeNotes Knowledge Hub and In the Clinic');
  await page.goto(BASE + '#gene=RET'); await page.waitForSelector('#syn-detail h2');
  check(await page.locator('#syn-detail a[href*="genotes/knowledge-hub/multiple-endocrine-neoplasia-type-2/"]').count() === 1, 'gene page links GeNotes');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .result');
  await page.locator('#results .result').first().locator('summary', { hasText: 'Leaflets' }).click();
  check(await page.locator('#results .result').first().locator('a[href*="genotes/knowledge-hub/brca1-and-brca2/"]').count() === 1, 'result card sources include GeNotes');

  console.log('Test eligibility');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .elig');
  const el = await page.locator('#results .elig').textContent();
  check(/Meets Test Directory criteria now/.test(el) && /Proband/.test(el) && /R208/.test(el) && /breast cancer under 40/.test(el) && /triple-negative breast cancer under 60/.test(el) && /Manchester score 31/.test(el), 'proband flagged for R208 (under 40, TNBC, Manchester 31)');
  check(/Mother/.test(el) && /R207/.test(el), 'mother flagged for R207 (high-grade serous ovarian)');
  check(await page.evaluate(() => document.querySelector('#results .elig').compareDocumentPosition(document.getElementById('ped')) & Node.DOCUMENT_POSITION_FOLLOWING), 'eligibility box sits above the family tree');
  await page.click('#copy');
  const sumE = await page.evaluate(() => navigator.clipboard.readText());
  check(/MEETS TEST DIRECTORY CRITERIA NOW/.test(sumE) && /Proband( \(F\))?: R208/.test(sumE), 'summary lists who meets criteria');
  await page.click('#clear');
  const fam = { app: 'cancer-predisposition-differential', version: 1, ancestry: '', people: [
    { rel: 'proband', sex: 'F', dx: [{}] },
    { rel: 'mother', sex: 'F', deceased: true, ageDeath: '47', dx: [{ site: 'ovary', hist: 'hgsc', age: '45' }] },
    { rel: 'm_aunt', sex: 'F', deceased: true, dx: [{ site: 'breast', hist: 'idc', age: '38' }] }] };
  await page.setInputFiles('#open-family', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fam)) });
  await page.waitForSelector('#results .elig');
  const el2 = await page.locator('#results .elig').textContent();
  check(/deceased – needs stored DNA or tissue/.test(el2) && /via Clinical Genetics/.test(el2) && /unaffected first-degree relative/.test(el2), 'deceased relatives flagged for stored DNA; unaffected proband via Clinical Genetics');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  check(await page.isVisible('#results .elig'), 'eligibility box is printed');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await page.click('#clear');
  await page.locator('#family select[data-f=site]').first().selectOption('breast'); await page.locator('#family select[data-f=hist]').first().selectOption('idc');
  await page.locator('#family input[data-f=age]').first().fill('55');
  await page.waitForTimeout(100);
  check(/No one in the family as entered meets/.test(await page.locator('#results .elig').textContent()), 'says when no checked criteria are met');

  console.log('Eligibility tags in tree and form');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .elig');
  await page.evaluate(() => { document.getElementById('ped').open = true; });
  await page.waitForTimeout(200);
  check(await page.locator('#ped-wrap .ped-elig-ring').count() >= 2 && /Meets R208/.test(await page.locator('#ped-wrap svg').textContent()), 'family tree badges people who meet criteria');
  check(/Meets criteria:.*R208/.test(await page.locator('#family .person').first().locator('.person-elig').textContent()) && /R207/.test(await page.locator('#family .person-elig').allTextContents().then(a => a.join(' '))), 'family form tags people who meet criteria');
  const ms = await page.evaluate(() => [['', ''], ['both', ''], ['both', '55'], ['multi', '']].map(([side, age2]) => { const p = { id: 1, rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '45', side, age2 }] }; return manchesterScore(p, [p]).b1; }));
  check(ms.join() === '3,6,5,3', `Manchester: both breasts count twice (second at its own age: 45+55 = 3+2), multifocal once (${JSON.stringify(ms)})`);
  const dec = await page.evaluate(() => { const c = id => CONDITIONS.find(x => x.id === id); return {
    lfs: c('lfs').rules.filter(r => /chordoma|nb|hepatoblastoma/.test(r[1]) || r[0] === 'chordoma').length,
    lms: c('lfs').rules.find(r => r[1] === 'lms')?.[2], mva: c('mva').rules.find(r => r[0] === 'kidney' || /wilms/.test(r[1]))?.[2],
    tbd: c('tbd').genes.join(), samd: c('samd9l').genes.join() }; });
  check(dec.lfs === 0 && dec.lms === 'W' && dec.mva === 'S' && /DKC1/.test(dec.tbd) && /TINF2/.test(dec.tbd) && /SAMD9\b/.test(dec.samd.replace('SAMD9L', '')), `decision changes applied (${JSON.stringify(dec)})`);

  console.log('Smaller usability items');
  await page.goto(BASE); await loadEx(page);
  check(/Balanced: up to 15 syndromes/.test(await page.textContent('#mode-hint')) && await page.getAttribute('[data-mode=balanced]', 'aria-pressed') === 'true', 'search breadth explained, current mode pressed');
  await page.click('.segmented [data-mode=narrow]');
  check(/Narrow: only the strongest matches/.test(await page.textContent('#mode-hint')), 'hint changes with the mode');
  await page.click('.segmented [data-mode=balanced]');
  check(/\d+ syndromes shown.*updated/.test(await page.textContent('#results-status')) && await page.getAttribute('#results-status', 'role') === 'status', 'results status line (announced to screen readers)');
  const r208b = page.locator('#results .elig button.test-link[data-test=R208]').first();
  await r208b.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('#crit-dialog[open]');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.activeElement && document.activeElement.dataset.test === 'R208'), 'closing the pop-up returns focus to the code that opened it');
  const pt2 = await page.locator('#ped-text').textContent();
  check(await page.getAttribute('#ped-wrap svg', 'aria-describedby') === 'ped-text' && /Proband \(F\): Breast/.test(pt2) && /Meets R208/.test(pt2) && /Father: Colorectal/.test(pt2), 'family tree has a text version for screen readers');
  await page.locator('#family .person').first().locator('.person-open').click();
  await page.waitForFunction(() => document.querySelector('#family abbr.abbr[tabindex="0"]'));
  const habbr = page.locator('#family abbr.abbr[tabindex="0"]').first();
  check(await habbr.count() === 1, 'form abbreviations can be reached with Tab');
  await habbr.focus(); await page.waitForTimeout(50);
  check(await page.isVisible('#abbr-tip'), 'keyboard focus on an abbreviation shows its meaning');
  await page.goto(BASE + '?today=2027-06-01#syndrome=brca1'); await page.waitForSelector('#syn-detail h2');
  check(await page.isVisible('#stale-note') && /over 6 months ago/.test(await page.textContent('#stale-note')) && /Test Directory version used \(20 May 2026\) is over a year old/.test(await page.textContent('#stale-note')), 'out-of-date note when information is old');
  await page.goto(BASE + '#syndrome=brca1'); await page.waitForSelector('#syn-detail h2');
  check(!(await page.isVisible('#stale-note')), 'no out-of-date note today');

  console.log('Numbered relatives and new relationships');
  await page.goto(BASE); await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'n.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'F', dx: [{}] }, { rel: 'sister', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '38' }] }, { rel: 'sister', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '62' }] },
    { rel: 'm_ggp', sex: 'F', dx: [{ site: 'ovary', hist: 'hgsc', age: '60' }] }, { rel: 'gniece', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '30' }] },
    { rel: 'm_cousin_child', sex: 'M', dx: [{ site: 'colorectal', hist: 'adeno', age: '35' }] }] })) });
  await page.waitForSelector('#results .elig');
  const relCards = await page.locator('#family .person').allTextContents();
  check(relCards.some(t => /Sister 1/.test(t) && /age 38/.test(t)) && relCards.some(t => /Sister 2/.test(t) && /age 62/.test(t)), 'two sisters are numbered Sister 1 and Sister 2');
  check(/Sister 1/.test(await page.locator('#results .elig').textContent()), 'eligibility box names the numbered sister');
  const tree = await page.locator('#ped-wrap svg').textContent();
  check(/Sister 1/.test(tree) && /Sister 2/.test(tree) && /Mat. great-grandparent/.test(tree) && /Great-niece\/nephew/.test(tree) && /Mat. cousin's child/.test(tree) && !/Other relatives \(position/.test(tree), 'family tree places great-grandparent, great-niece and cousin\'s child (not in the unplaced row)');
  check((await page.locator('#family .person').first().locator('select[data-f=relKind]').count()) === 0 && await page.evaluate(() => RELATIONS.some(r => r[0] === 'm_ggp') && RELATIONS.some(r => r[0] === 'gniece')), 'new relationships are in the list');
  check(await page.evaluate(() => relDegree({ rel: 'proband' }, { rel: 'm_ggp' }) === 3 && relDegree({ rel: 'proband' }, { rel: 'gniece' }) === 3 && relDegree({ rel: 'proband' }, { rel: 'm_cousin_child' }) === 4), 'degrees of relationship for the new relatives');

  console.log('Print summary');
  await page.goto(BASE); await loadEx(page);
  check(await page.isVisible('#print-brief') && /Print summary/.test(await page.textContent('#print-brief')), 'Print summary button next to Print');
  await page.evaluate(() => { document.body.classList.add('print-brief'); window.dispatchEvent(new Event('beforeprint')); });
  await page.emulateMedia({ media: 'print' });
  const vis = async sel => page.locator(sel).first().isVisible();
  check(await vis('.fam-table') && await vis('#results .elig') && await vis('#ped-wrap svg') && await page.locator('#results .result:visible').count() === 3, 'summary keeps the family table, eligibility, tree and the top three syndromes');
  check(await vis('#disclaimer') && !(await vis('.foot-list')), 'summary keeps the full disclaimer but drops the rest of the footer');
  check(!(await vis('#results .result .evidence')) && await page.locator('.tests-compact li:visible').count() === await page.locator('.tests-compact li.tr-family').count(), 'summary drops evidence lists, footer and tests nobody meets');
  await page.evaluate(() => { document.body.classList.remove('print-brief'); window.dispatchEvent(new Event('afterprint')); });
  await page.emulateMedia({ media: 'screen' });

  console.log('Review batch: relationship default, large trees, search, quick start');
  await page.goto(BASE); await page.click('#clear');
  check(/How to use/.test(await page.textContent('#results')) && await page.locator('#results [data-load-example]').count() === await page.evaluate(() => EXAMPLES.length), 'empty results show a quick-start guide with the example families');
  await page.click('#results [data-load-example=brca]'); await page.waitForSelector('#results .elig');
  check(await page.locator('#family .person').count() === 4, 'quick-start example link loads the example');
  await page.click('#add-person');
  const newRel = page.locator('#family .person').last().locator('select[data-f=relKind]');
  check(await newRel.inputValue() === '' && /Choose relationship/.test(await newRel.locator('option:checked').textContent()), 'a new relative starts as "Choose relationship…", not Mother');
  check(/Choose the relationship/.test(await page.locator('#family .person').last().locator('.person-warn').textContent()), 'reminder to choose the relationship');
  check(await newRel.locator('option').count() < 25, 'the relationship list is short (sides chosen separately)');
  await newRel.selectOption('sister');
  check(!(await page.locator('#family .person').last().locator('select[data-f=relKind] option[value=""]').count()) && !(await page.locator('#family .person').last().locator('select[data-f=relSide]').count()), 'placeholder disappears once a relationship is chosen; no side box for a sister');
  // Two-step: Grandmother, then mother's or father's mother
  await newRel.selectOption('gm');
  const sideSel = page.locator('#family .person').last().locator('select[data-f=relSide]');
  check(await sideSel.count() === 1 && /Which side/.test(await sideSel.locator('option:checked').textContent()) && /Mother's mother/.test(await sideSel.textContent()) && /Father's mother/.test(await sideSel.textContent()), 'Grandmother asks mother\'s mother or father\'s mother');
  check(/Choose which side/.test(await page.locator('#family .person').last().locator('.person-warn').textContent()), 'until the side is chosen the relative is not counted, with a reminder');
  await sideSel.selectOption('p');
  check(await page.locator('#family .person').last().locator('select[data-f=relSide]').inputValue() === 'p' && await page.locator('#family .person').last().locator('select[data-f=sex]').inputValue() === 'F' && !/Choose/.test(await page.locator('#family .person').last().locator('.person-warn').textContent()), 'father\'s mother is stored as paternal grandmother');
  await page.locator('#family .person').last().locator('select[data-f=relKind]').selectOption('uncle');
  check(await page.locator('#family .person').last().locator('select[data-f=relSide]').inputValue() === 'p' && /Father's brother/.test(await page.locator('#family .person').last().locator('select[data-f=relSide] option:checked').textContent()), 'changing the relationship keeps the side (paternal grandmother → paternal uncle)');
  await page.locator('#family .person').last().locator('select[data-f=relKind]').selectOption('other');
  await page.locator('#family .person').last().locator('select[data-f=relSide]').selectOption('u');
  check(await page.locator('#family .person').last().locator('select[data-f=relSide]').inputValue() === 'u' && !/Choose/.test(await page.locator('#family .person').last().locator('.person-warn').textContent()), 'other relative can have side not known');
  await page.locator('#family .person').last().locator('select[data-f=relKind]').selectOption('sister');
  // Large family
  const rels = ['mother', 'father', 'sister', 'sister', 'brother', 'm_aunt', 'm_aunt', 'm_uncle', 'p_aunt', 'p_uncle', 'm_gm', 'm_gf', 'p_gm', 'p_gf', 'm_cousin', 'm_cousin', 'p_cousin', 'niece', 'daughter', 'son', 'm_great', 'p_great', 'm_ggp', 'grandchild'];
  const bigSites = [['breast', 'idc'], ['ovary', 'hgsc'], ['colorectal', 'adeno'], ['prostate', 'adeno'], ['pancreas', 'pdac'], ['uterus', 'endometrioid'], ['skin', 'melanoma'], ['kidney', 'ccrcc']];
  const big = [{ rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '41' }] }, ...rels.map((r, i) => ({ rel: r, sex: i % 2 ? 'M' : 'F', dx: [{ site: bigSites[i % 8][0], hist: bigSites[i % 8][1], age: String(35 + i) }] }))];
  await page.setInputFiles('#open-family', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: big })) });
  await page.waitForSelector('#ped-wrap svg');
  await page.evaluate(() => { document.getElementById('ped').open = true; }); await page.waitForTimeout(100);
  check(await page.isVisible('#ped-wide') && await page.locator('#ped-wrap .ped-more').count() > 0, 'large tree: note that it is wider than the panel; long code lists shortened with +N');
  await page.click('[data-ped-fit]'); await page.waitForTimeout(100);
  check(await page.evaluate(() => document.querySelector('#ped-wrap svg').getBoundingClientRect().width <= document.getElementById('ped-wrap').clientWidth + 2) && !(await page.isVisible('#ped-wide')), 'Fit to width shrinks the tree to the panel');
  await page.click('[data-ped-fit]');
  await page.click('[data-ped-full]'); await page.waitForSelector('#crit-dialog[open]');
  check(await page.locator('#crit-dialog.wide .tree-full svg').count() === 1 && /Family tree/.test(await page.locator('#crit-dialog h2').textContent()), 'Full screen opens the tree in a wide panel');
  await page.keyboard.press('Escape');
  // Search
  await page.click('[data-tab=browse]'); await page.waitForSelector('#syn-detail h2');
  const hits = async q => { await page.fill('#browse-search', q); await page.waitForTimeout(80); return page.locator('#syn-list li').allTextContents(); };
  check((await hits('pheochromocytoma')).length > 3 && (await hits('phaeochromocytoma')).length === (await hits('pheochromocytoma')).length, 'search treats UK and US spellings alike (phaeo/pheo)');
  check((await hits('li fraumeni')).some(t => /Li–Fraumeni/.test(t)), 'search ignores hyphens (li fraumeni)');
  check((await hits('hnpcc')).some(t => /Lynch/.test(t)) && (await hits('lfs')).some(t => /Li–Fraumeni/.test(t)), 'syndrome abbreviations find the syndrome (HNPCC, LFS)');
  check((await hits('lobular breast')).length >= 1 && (await hits('breast lobular')).length === (await hits('lobular breast')).length, 'search words match in any order');
  await page.fill('#browse-search', '');

  console.log('Child of (which aunt/uncle, sibling or child is the parent)');
  await page.goto(BASE); await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'co.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { id: 1, rel: 'proband', sex: 'F', dx: [{ site: 'colorectal', hist: 'adeno', age: '44' }] }, { id: 3, rel: 'm_aunt', sex: 'F', dx: [{ site: 'uterus', hist: 'endometrioid', age: '52' }] },
    { id: 4, rel: 'm_uncle', sex: 'M', dx: [{}] }, { id: 5, rel: 'm_cousin', sex: 'M', parentId: 3, dx: [{ site: 'colorectal', hist: 'adeno', age: '38' }] },
    { id: 7, rel: 'm_cousin', sex: 'F', dx: [{ site: 'ovary', hist: 'hgsc', age: '50' }] }] })) });
  await page.waitForSelector('#ped-wrap svg');
  const coCards = await page.locator('#family .person').allTextContents();
  check(coCards.some(t => /Maternal first cousin 1/.test(t) && /child of Maternal aunt/.test(t)), 'saved "Child of" link is kept when the file is opened and shown on the card');
  check(/Not specified whose child this is/.test(coCards.find(t => /Maternal first cousin 2/.test(t)) || ''), 'warning when a cousin\'s parent is not specified');
  const tr = await page.locator('#ped-wrap svg').textContent();
  check(/Mat. aunt\/uncle \(not specified\)/.test(tr), 'tree puts a cousin with no named parent under an unspecified aunt/uncle, not under an entered one');
  const c2 = page.locator('#family .person').nth(4);
  await c2.locator('.person-open').click();
  const sel = page.locator('#family .person').nth(4).locator('select[data-f=parentId]');
  check((await sel.locator('option').allTextContents()).join('|') === 'Not specified – choose the maternal aunt or uncle|Maternal aunt|Maternal uncle', '"Child of" lists the maternal aunts and uncles entered');
  await sel.selectOption({ label: 'Maternal uncle' }); await page.waitForTimeout(100);
  check(!/not specified/.test(await page.locator('#ped-wrap svg').textContent()), 'choosing the parent moves the cousin under that uncle in the tree');
  await page.click('#copy');
  check(/Maternal first cousin 2 \(F\) \[child of Maternal uncle\]/.test(await page.evaluate(() => navigator.clipboard.readText())), 'summary says whose child the cousin is');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#save-family')]);
  const saved2 = JSON.parse(require('fs').readFileSync(await dl2.path(), 'utf8'));
  const uncle = saved2.people.find(p => p.rel === 'm_uncle'), cz = saved2.people.filter(p => p.rel === 'm_cousin');
  check(cz.some(c => c.parentId === uncle.id), 'the link is saved in the family file');
  // Adding a maternal cousin to the example family: the maternal aunt can be chosen as the parent
  await loadEx(page);
  await page.click('#add-person');
  await chooseRel(page.locator('#family .person').last(), 'm_cousin');
  await page.locator('#family .person').last().locator('select[data-f=parentId]').selectOption({ label: 'Maternal aunt' });
  await page.locator('#family .person').last().locator('select[data-f=site]').selectOption('colorectal');
  await page.locator('#family .person').last().locator('select[data-f=hist]').selectOption('adeno');
  await page.locator('#family .person').last().locator('input[data-f=age]').fill('39');
  await page.locator('#family .person').last().locator('[data-act=done-person]').click();
  check(/child of Maternal aunt/.test(await page.locator('#family .person').last().textContent()), 'example family: a new maternal cousin can be made the maternal aunt\'s child');

  console.log('Entry checks');
  await page.goto(BASE); await loadEx(page);
  check(await page.locator('#family .person-warn li').count() === 0, 'no warnings for the example family');
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'M', ageNow: '40', dx: [{ site: 'ovary', hist: 'hgsc', age: '45' }, { site: 'polyps', hist: 'adenoma', age: '30' }] },
    { rel: 'mother', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '50', side: 'both', age2: '44' }, { site: 'colorectal', hist: 'adeno' }] },
    { rel: 'mother', sex: 'F', dx: [{ site: 'breast', hist: '' }] }] })) });
  await page.waitForSelector('#family .person-warn li');
  const wt = await page.locator('#family .person-warn').allTextContents();
  check(/older than age now \(40\)/.test(wt[0]) && /for a male relative/.test(wt[0]) && /number of polyps not entered/.test(wt[0]), 'warns: diagnosis after age now, ovarian cancer in a male, polyp count missing');
  check(/second cancer \(44\) is younger than the first \(50\)/.test(wt[1]) && /no age at diagnosis/.test(wt[1]) && /More than one mother entered/.test(wt[1]), 'warns: second age younger, missing age, two mothers');
  check(/choose the histology/.test(wt[2]), 'warns when a cancer has no histology (not counted)');
  check(await page.locator('#family .person.collapsed .person-warn li').count() > 0, 'warnings show on folded cards too');

  console.log('Ancestry criteria');
  await page.goto(BASE); await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'w.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, ancestry: 'whalsay', people: [
    { rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '66', er: 'pos' }] }, { rel: 'father', sex: 'M', dx: [{ site: 'prostate', hist: 'adeno', age: '72' }] }] })) });
  await page.waitForSelector('#results .elig');
  check(await page.inputValue('#ancestry') === 'whalsay' && (await page.locator('#ancestry option').allTextContents()).join('|') === 'Not known / not relevant|Ashkenazi Jewish|Grandparent from Westray (Orkney)|Grandparent from Whalsay (Shetland)|Māori|Other founder population', 'ancestry list includes Westray, Whalsay and Māori (saved files keep it)');
  const ea = await page.locator('#results .elig').textContent();
  check(/grandparent from Whalsay \(Shetland\) and breast cancer/.test(ea.split('May meet')[0]) && /R430/.test(ea.split('May meet')[1] || '') && /qualifies if this relative has a grandparent from Whalsay/.test(ea), 'Whalsay: proband meets R208; father may meet R430 (his grandparents differ)');
  await page.locator('#results .elig button.test-link[data-test=R208]').first().click(); await page.waitForSelector('#crit-dialog[open]');
  check(await page.locator('#crit-dialog .crit-list li.hit-met', { hasText: 'Westray (Orkney) or Whalsay' }).count() === 1, 'R208 panel highlights the island criterion');
  await page.keyboard.press('Escape');

  console.log('Folded relatives');
  await page.goto(BASE); await loadEx(page);
  check(await page.locator('#family .person.collapsed').count() === 4 && await page.locator('#family select[data-f=site]').count() === 0, 'example family loads as four one-line cards');
  const card = page.locator('#family .person').nth(1);
  check(/Mother/.test(await card.textContent()) && /High-grade serous/.test(await card.textContent()) && /age 52/.test(await card.textContent()) && /R207/.test(await card.locator('.person-elig').textContent()) && await card.locator('.person-mss button').count() === 1, 'card shows the cancers, criteria tags and Manchester score');
  await card.locator('.person-open').click();
  check(await page.locator('#family .person').nth(1).locator('select[data-f=site]').count() === 1 && await page.locator('#family .person.collapsed').count() === 3, 'clicking a card opens that relative only');
  check(await page.evaluate(() => document.activeElement && document.activeElement.closest('[data-pid]') === document.querySelectorAll('#family .person')[1]), 'focus moves into the opened relative');
  await page.locator('#family .person').nth(1).locator('input[data-f=age]').fill('50');
  await page.waitForTimeout(100);
  check(await page.locator('#family .person').nth(1).locator('input[data-f=age]').count() === 1, 'a relative stays open while being edited');
  await page.locator('#family .person').nth(1).locator('[data-act=done-person]').click();
  check(await page.locator('#family .person.collapsed').count() === 4 && /age 50/.test(await page.locator('#family .person').nth(1).textContent()), 'Done folds it again with the change shown');
  await page.locator('#family .person').nth(0).locator('.person-open').click();
  await page.click('#add-person');
  check(await page.locator('#family .person.collapsed').count() === 4 && await page.locator('#family .person').last().locator('select[data-f=relKind]').count() === 1, 'adding a relative folds the others and opens the new one');
  await page.locator('#family .person').last().locator('select[data-f=site]').selectOption('breast');
  await page.locator('#family .person').last().locator('select[data-f=hist]').selectOption('idc');
  check(await page.locator('#family .person').last().locator('input[data-f=age]').count() === 1, 'choosing a cancer does not fold the relative mid-edit');
  await page.locator('#family .person').nth(2).locator('[data-act=rm-person]').click();
  check(await page.locator('#family .person').count() === 4, 'relatives can be removed from the folded card');

  console.log('Shorter results');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .elig');
  check(await page.locator('#results article.test').count() === 0 && await page.locator('#results .test-rows li').count() >= 3, 'tests shown as a compact list, not full criteria cards');
  const r208row = await page.locator('#results .test-rows li', { has: page.locator('button[data-test=R208]') }).textContent();
  check(/Meets now: Proband \(F\), Mother, Maternal aunt/.test(r208row) && /For Hereditary breast and ovarian cancer/.test(r208row), 'test row says who meets it now and which syndromes it covers');
  const h = await page.evaluate(() => document.getElementById('results').scrollHeight);
  check(h < 6500, `results are much shorter (${h}px)`);
  const why = await page.locator('#results .elig .elig-why').first().textContent();
  const whyShort = await page.locator('#results .elig .why-short').first().textContent();
  check(/breast cancer under 40 · triple-negative breast cancer under 60 · Manchester score 31/.test(whyShort) && !/Invasive ductal/.test(whyShort), `eligibility reasons shortened on screen ("${whyShort}")`);
  await page.emulateMedia({ media: 'print' });
  check(await page.locator('#results .elig .why-full').first().isVisible() && /Invasive ductal/.test(await page.locator('#results .elig .why-full').first().textContent()), 'full reasons printed');
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#results .elig .why-short button.mss-link').first().click(); await page.waitForSelector('#crit-dialog[open]');
  check(/Manchester score – Proband/.test(await page.locator('#crit-dialog h2').textContent()), 'short Manchester reason still opens the breakdown');
  await page.keyboard.press('Escape');

  console.log('Criteria panel');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .elig');
  await page.locator('#results .elig button.test-link[data-test=R208]').first().click();
  await page.waitForSelector('#crit-dialog[open]');
  const cd = await page.locator('#crit-dialog').textContent();
  check(/R208/.test(cd) && /Triple negative breast cancer \(age < 60 years\), OR/.test(cd) && /page 185/.test(cd) && await page.locator('#crit-dialog a[href$="#page=185"]').count() === 1, 'R208 opens the exact Test Directory wording with a link to its PDF page');
  const hitTxt = await page.locator('#crit-dialog .crit-list li.hit-met').allTextContents();
  check(hitTxt.some(t => /^a\. Breast cancer \(age <40/.test(t) && /Proband/.test(t)) && hitTxt.some(t => /Triple negative/.test(t)) && hitTxt.some(t => /Manchester/.test(t) && /Mother/.test(t)), 'criteria the family meets are highlighted with who and why');
  check(/This family/.test(cd) && /Meets now/.test(cd), 'panel summarises the family');
  const dab = page.locator('#crit-dialog abbr.abbr', { hasText: /^DCIS$/ }).first();
  await dab.scrollIntoViewIfNeeded(); await dab.hover(); await page.waitForTimeout(50);
  check(await page.isVisible('#abbr-tip') && (await page.textContent('#abbr-tip')) === 'ductal carcinoma in situ' && await page.evaluate(() => document.getElementById('abbr-tip').parentNode.id === 'crit-dialog'), 'abbreviation tooltip shows on top inside the criteria panel');
  check((await page.locator('#crit-dialog .crit-genes .gene').allTextContents()).join(',') === 'ATM,BARD1,BRCA1,BRCA2,CHEK2,PALB2,RAD51C,RAD51D' && /Genes tested \(8\)/.test(cd) && await page.locator('#crit-dialog .crit-genes a[href*="panels/635"]').count() === 1, 'panel lists the genes tested (PanelApp 635) at the bottom');
  check(/Genes: ATM, BARD1, BRCA1/.test(await page.locator('#results .elig button.test-link[data-test=R208]').first().getAttribute('title')), 'hovering a test code shows its genes');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#crit-dialog')), 'Escape closes the panel');
  { const ra = page.locator('#results .elig abbr.abbr:visible').first(); await ra.scrollIntoViewIfNeeded(); await ra.hover(); await page.waitForTimeout(50); }
  check(await page.evaluate(() => document.getElementById('abbr-tip').parentNode === document.body) && await page.isVisible('#abbr-tip'), 'tooltip returns to the page after the panel closes');
  await page.locator('#family .person-elig button.test-link[data-test=R207]').first().click();
  await page.waitForSelector('#crit-dialog[open]');
  check(/R207/.test(await page.locator('#crit-dialog h2').textContent()) && await page.locator('#crit-dialog li.hit-met').count() >= 1, 'form tag opens R207 criteria');
  await page.click('#crit-dialog [data-close]');
  await page.evaluate(() => { document.getElementById('ped').open = true; });
  await page.locator('#ped-wrap tspan.ped-test[data-test=R208]').first().click();
  await page.waitForSelector('#crit-dialog[open]');
  check(/R208/.test(await page.locator('#crit-dialog h2').textContent()), 'tree code opens the criteria');
  await page.click('#crit-dialog [data-close]');
  await page.locator('#results .result button.test-link').first().click();
  await page.waitForSelector('#crit-dialog[open]');
  check(await page.isVisible('#crit-dialog'), 'result card test code opens the criteria');
  await page.click('#crit-dialog [data-close]');
  // Near miss and may meet
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'n.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '42', er: 'pos', pr: 'pos', her2: 'neg' }] }] })) });
  await openAll(page);
  await page.waitForSelector('#results .result');
  await page.evaluate(() => document.querySelector('#results .result button.test-link[data-test=R208], #results button.test-link[data-test=R208]').click());
  await page.waitForSelector('#crit-dialog[open]');
  check(await page.locator('#crit-dialog .crit-list li.hit-near').filter({ hasText: 'Breast cancer (age <40' }).count() === 1 && /Near miss/.test(await page.locator('#crit-dialog').textContent()), 'near miss (breast cancer at 42) shown in grey against the under-40 criterion');
  await page.click('#crit-dialog [data-close]');
  await page.goto(BASE + '#syndrome=bap1'); await page.waitForSelector('#syn-detail h2');
  await page.locator('#syn-detail button.test-link[data-test=R422]').first().click();
  await page.waitForSelector('#crit-dialog[open]');
  check(/mesothelioma \(less than 60 years\) in the absence of asbestos/.test(await page.locator('#crit-dialog').textContent()), 'syndrome page test opens its criteria');
  await page.click('#crit-dialog [data-close]');

  console.log('Manchester score breakdown');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .elig');
  await page.locator('#results .elig button.mss-link').first().click();
  await page.waitForSelector('#crit-dialog[open]');
  let mt = await page.locator('#crit-dialog').textContent();
  check(/Manchester score – Proband/.test(mt) && /Combined 31 \(BRCA1 19, BRCA2 12\)/.test(mt) && /meets the R208 threshold/.test(mt), 'eligibility box Manchester link opens the proband breakdown (31)');
  const rowsT = await page.locator('#crit-dialog .mss-table tbody tr').allTextContents();
  check(rowsT.some(r => /Proband/.test(r) && /Female breast cancer 30–39/.test(r) && /44/.test(r)) && rowsT.some(r => /Mother/.test(r) && /Ovarian cancer <60/.test(r)) && rowsT.some(r => /Triple negative/i.test(r) && /\+4/.test(r)), 'breakdown lists each cancer with points and the TNBC adjustment');
  check(/maternal side/.test(mt) && /paternal side scores/.test(mt), 'proband: higher side shown, other side total given');
  check(await page.locator('#crit-dialog .mss-ref tr.used').count() >= 3 && await page.locator('#crit-dialog a[href*="manchester-evans-score"]').count() === 1 && await page.locator('#crit-dialog a[href="https://doi.org/10.1136/jmg.2003.017996"]').count() === 1, 'scoring table with rows used highlighted and sources linked');
  await page.keyboard.press('Escape');
  await page.locator('#family .person').nth(1).locator('.person-mss button.mss-link').click();
  await page.waitForSelector('#crit-dialog[open]');
  check(/Manchester score – Mother/.test(await page.locator('#crit-dialog h2').textContent()), 'family form has a Manchester score button for each person with breast/ovarian cancer');
  await page.keyboard.press('Escape');
  check(/Manchester score 31 \(BRCA1 19, BRCA2 12\)/.test(await page.locator('#family .person').first().locator('.person-mss').textContent()), 'form shows the live score');
  await page.locator('#results .elig button.test-link[data-test=R208]').first().click(); await page.waitForSelector('#crit-dialog[open]');
  await page.locator('#crit-dialog .crit-list button.mss-link').first().click();
  await page.waitForFunction(() => document.getElementById('crit-dialog').dataset.view === 'mss');
  check(await page.locator('#crit-dialog [data-back=R208]').count() === 1, 'opened from the R208 panel with a Back to R208 link');
  await page.click('#crit-dialog [data-back=R208]');
  await page.waitForFunction(() => document.getElementById('crit-dialog').dataset.view === 'R208');
  check(/Inherited breast cancer and ovarian cancer/.test(await page.locator('#crit-dialog h2').textContent()), 'Back returns to the R208 criteria');
  await page.keyboard.press('Escape');
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '52', er: 'pos' }] }, { rel: 'father', sex: 'M', dx: [{ site: 'prostate', hist: 'adeno', age: '70' }] },
    { rel: 'p_aunt', sex: 'F', dx: [{ site: 'ovary', hist: 'mucinous', age: '50' }] }, { rel: 'p_gm', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '' }] }] })) });
  await openAll(page);
  await page.waitForSelector('#family .person-mss button');
  await page.locator('#family .person').first().locator('.person-mss button').click(); await page.waitForSelector('#crit-dialog[open]');
  mt = await page.locator('#crit-dialog').textContent();
  check(/below the R208 threshold/.test(mt) && /non-epithelial or mucinous ovarian/.test(mt) && /no age at diagnosis entered/.test(mt) && /ER positive/.test(mt), 'below-threshold breakdown explains what was not counted and the ER+ adjustment');
  await page.keyboard.press('Escape');

  console.log('Tumour grade');
  await page.goto(BASE); await loadEx(page); await openAll(page); await page.waitForSelector('#results .elig');
  check(await page.locator('#family .person').first().locator('select[data-f=grade] option').allTextContents().then(o => o.join('|')) === 'Unknown|1 (low)|2 (intermediate)|3 (high)', 'breast cancers have a grade box');
  check(await page.locator('#family .person').nth(1).locator('select[data-f=ovgrade]').count() === 0, 'no ovarian grade box for high-grade serous (grade is in the type)');
  await page.locator('#family .person').nth(1).locator('select[data-f=hist]').selectOption('endometrioid');
  await page.waitForTimeout(100);
  check(await page.locator('#family .person').nth(1).locator('select[data-f=ovgrade] option').allTextContents().then(o => o.join('|')) === 'Unknown|Low grade|High grade', 'grade box appears for endometrioid ovarian cancer');
  await page.locator('#family .person').nth(1).locator('select[data-f=hist]').selectOption('hgsc');
  await page.waitForTimeout(100);
  await page.locator('#family .person').first().locator('select[data-f=grade]').selectOption('3');
  await page.waitForFunction(() => /Manchester score 33 \(BRCA1 21/.test(document.querySelector('#family .person .person-mss')?.textContent || ''));
  await page.locator('#family .person').first().locator('.person-mss button').click(); await page.waitForSelector('#crit-dialog[open]');
  check((await page.locator('#crit-dialog .mss-table tbody tr').allTextContents()).some(r => /grade 3/.test(r) && /\+2/.test(r)) && await page.locator('#crit-dialog .mss-ref tr.used', { hasText: 'grade 3' }).count() === 1, 'grade 3 adds 2 to the BRCA1 score and shows in the breakdown');
  await page.keyboard.press('Escape');
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'g.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'F', dx: [{ site: 'ovary', hist: 'endometrioid', age: '50' }] }] })) });
  await openAll(page);
  await page.waitForSelector('#results .elig-maybe');
  check(/R207/.test(await page.locator('#results .elig-maybe').textContent()), 'endometrioid ovarian cancer of unknown grade: may meet R207');
  await page.locator('#family select[data-f=ovgrade]').selectOption('high');
  await page.waitForFunction(() => !document.querySelector('#results .elig-maybe') && /R207/.test(document.querySelector('#results .elig')?.textContent || ''));
  check(/high grade/.test(await page.locator('#results .elig').textContent()), 'graded high: meets R207 now');

  console.log('Side and number');
  await page.goto(BASE); await page.click('#clear');
  const d0s = page.locator('#family .dx').first();
  await d0s.locator('select[data-f=site]').selectOption('breast'); await d0s.locator('select[data-f=hist]').selectOption('idc');
  await d0s.locator('input[data-f=age]').fill('50');
  check(await page.locator('#family input[data-f=bilat]').count() === 0, 'old combined tick is gone');
  check((await d0s.locator('select[data-f=side] option').allTextContents()).join('|') === 'Unknown|One side|Both sides|Multifocal (one side)', 'breast has a Side choice');
  check(await d0s.locator('input[data-f=age2]').count() === 0, 'no second age until both sides chosen');
  await d0s.locator('select[data-f=side]').selectOption('multi');
  await page.waitForTimeout(100);
  check(!/bilateral breast cancer under 60/.test(await page.locator('#results .elig').textContent()), 'multifocal (one side) does not count as bilateral for R208');
  await page.locator('#family .dx').first().locator('select[data-f=side]').selectOption('both');
  await page.locator('#family .dx').first().locator('input[data-f=age2]').fill('58');
  await page.waitForTimeout(150);
  check(/bilateral breast cancer under 60/.test(await page.locator('#results .elig').textContent()) && /both sides, second at 58/.test(await page.locator('#results .elig').textContent()), 'both sides with second age: meets R208 bilateral criterion and shows the second age');
  await page.locator('#family .person-mss button').first().click(); await page.waitForSelector('#crit-dialog[open]');
  const bt = await page.locator('#crit-dialog .mss-table tbody tr').allTextContents();
  check(bt.some(r => /second breast cancer/.test(r) && /age 58/.test(r) && /50–59/.test(r)), 'Manchester breakdown scores the second breast cancer at its own age');
  await page.keyboard.press('Escape');
  await page.locator('#family .dx').first().locator('select[data-f=site]').selectOption('skin');
  await page.locator('#family .dx').first().locator('select[data-f=hist]').selectOption('melanoma');
  await page.waitForTimeout(100);
  check(await page.locator('#family .dx').first().locator('select[data-f=side]').count() === 0 && await page.locator('#family .dx').first().locator('input[data-f=count]').count() === 1, 'melanoma has a Number box and no Side');
  await page.locator('#family .dx').first().locator('input[data-f=count]').fill('3');
  await page.waitForTimeout(150);
  check(/≥3 melanomas/.test(await page.locator('#results .elig').textContent()), 'number of melanomas counts towards R254');
  await page.locator('#family .dx').first().locator('select[data-f=site]').selectOption('pancreas');
  check(await page.locator('#family .dx').first().locator('select[data-f=side], input[data-f=count]').count() === 0, 'pancreas has neither box');
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'sp.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '50', side: 'both', age2: '58' }, { site: 'skin', hist: 'melanoma', age: '40', count: '3' }] },
    { rel: 'mother', sex: 'F', dx: [{ site: 'kidney', hist: 'ccrcc', age: '60', side: 'multi' }, { site: 'breast', hist: 'idc', age: '70', side: 'one' }] }] })) });
  await openAll(page);
  await page.waitForSelector('#results .result');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' });
  const pt = await page.locator('.fam-table').textContent();
  check(/both sides, second at 58/.test(pt) && /3 tumours/.test(pt) && /multifocal \(one side\)/.test(pt) && /one side/.test(pt), 'printout shows side (incl. second age) and number');
  const tl = await page.locator('#ped-wrap svg').textContent();
  check(/Both sides, 2nd 58/.test(tl) && /3 tumours/.test(tl) && /Multifocal/.test(tl) && /One side/.test(tl), 'family tree labels show side (with second age) and number');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await page.emulateMedia({ media: 'screen' });
  await page.click('#copy');
  const sm = await page.evaluate(() => navigator.clipboard.readText());
  check(/Breast: Invasive ductal[^\n]*both sides, second at 58[^\n]*age 50/.test(sm) && /Cutaneous melanoma[^\n]*3 tumours/.test(sm) && /multifocal \(one side\)/.test(sm) && /one side\), age 70/.test(sm), 'copied summary shows side (with second age) and number');
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '50', bilat: true }, { site: 'skin', hist: 'melanoma', age: '40', bilat: true }] }] })) });
  await openAll(page);
  await page.waitForSelector('#family .dx select[data-f=side]');
  check(await page.locator('#family .dx').nth(0).locator('select[data-f=side]').inputValue() === 'both' && await page.locator('#family .dx').nth(1).locator('input[data-f=count]').inputValue() === '2', 'older files: ticked breast becomes both sides, ticked melanoma becomes 2');

  console.log('Adopted');
  await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'F', dx: [{ site: 'breast', hist: 'idc', age: '42', er: 'neg', pr: 'pos', her2: 'neg', grade: '3' }] }] })) });
  await openAll(page);
  await page.waitForSelector('#family .person-mss button');
  check(/Manchester score 9 \(BRCA1 6, BRCA2 3\)/.test(await page.locator('#family .person-mss').first().textContent()), 'starting score 9');
  await page.locator('#family .person-mss button').first().click(); await page.waitForSelector('#crit-dialog[open]');
  check(await page.locator('#crit-dialog input[data-mss-adopted]').count() === 1 && !(await page.locator('#crit-dialog input[data-mss-adopted]').isChecked()), 'proband breakdown offers an Adopted tick');
  await page.locator('#crit-dialog input[data-mss-adopted]').check();
  await page.waitForFunction(() => /Combined 13 \(BRCA1 8, BRCA2 5\)/.test(document.getElementById('crit-dialog').textContent));
  check((await page.locator('#crit-dialog .mss-table tbody tr').allTextContents()).some(r => /Adopted/.test(r) && /\+2.*\+2/.test(r)) && await page.locator('#crit-dialog .mss-ref tr.used', { hasText: 'Adopted' }).count() === 1, 'ticking adopted adds +2/+2 with its own row');
  await page.keyboard.press('Escape');
  check(await page.locator('#family .person').first().locator('input[data-f=adopted]').isChecked() && /Manchester score 13/.test(await page.locator('#family .person-mss').first().textContent()), 'the tick is saved on the proband and shown in the form');
  check(await page.locator('#family .person').nth(0).locator('input[data-f=adopted]').count() === 1, 'form has the adopted tick for the proband');
  await page.locator('#family .dx').first().locator('select[data-f=grade]').selectOption('3');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' });
  const ft = await page.locator('.fam-table').textContent();
  check(/adopted, no known family history/.test(ft) && /grade 3/.test(ft), 'printout family table shows adopted and grade');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await page.emulateMedia({ media: 'screen' });
  await page.click('#copy');
  check(/adopted, no known family history/.test(await page.evaluate(() => navigator.clipboard.readText())), 'summary shows adopted');
  await page.locator('#family .person').first().locator('input[data-f=adopted]').uncheck();
  await page.waitForFunction(() => /Manchester score 9 /.test(document.querySelector('#family .person-mss').textContent));
  check(true, 'unticking in the form restores the score');
  await page.click('#add-person');
  check(await page.locator('#family .person').nth(1).locator('input[data-f=adopted]').count() === 0, 'relatives have no adopted tick');

  console.log('Further tests and "may meet"');
  await page.goto(BASE); await page.click('#clear');
  await page.setInputFiles('#open-family', { name: 'm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people: [
    { rel: 'proband', sex: 'M', dx: [{ site: 'meso', hist: 'pleural', age: '50' }] }, { rel: 'm_aunt', sex: 'F', dx: [{ site: 'skin', hist: 'melanoma', age: '16' }] }] })) });
  await openAll(page);
  await page.waitForSelector('#results .elig-maybe');
  const mm = await page.locator('#results .elig').textContent();
  check(/R254/.test(mm.split('May meet')[0]) && /Maternal aunt/.test(mm.split('May meet')[0]) && /May meet – check an unrecorded detail/.test(mm) && /R422/.test(mm.split('May meet')[1]) && /no asbestos exposure/.test(mm), 'new tests: aunt meets R254, proband may meet R422 (asbestos)');
  await page.locator('#results .elig-maybe button.test-link[data-test=R422]').click(); await page.waitForSelector('#crit-dialog[open]');
  check(await page.locator('#crit-dialog .crit-list li.hit-maybe').filter({ hasText: 'mesothelioma' }).count() === 1, '"may meet" highlighted in amber in the criteria panel');
  await page.click('#crit-dialog [data-close]');
  check(/May meet:.*R422/.test(await page.locator('#family .person').first().locator('.person-elig').textContent()) && await page.locator('#family .person').first().locator('.maybe-code').count() === 1, 'form shows "May meet" tag');
  await page.evaluate(() => { document.getElementById('ped').open = true; });
  check(/May meet R422/.test(await page.locator('#ped-wrap svg').textContent()) && /Meets R254/.test(await page.locator('#ped-wrap svg').textContent()) && await page.locator('#ped-wrap .ped-elig-ring').count() === 1, 'tree labels "May meet" without a ring');
  await page.click('#copy');
  check(/MAY MEET TEST DIRECTORY CRITERIA – CHECK[\s\S]*R422/.test(await page.evaluate(() => navigator.clipboard.readText())), 'summary lists "may meet" separately');

  console.log('Modified Amsterdam');
  await page.goto(BASE); await page.click('#clear');
  const amsFam = (people) => page.setInputFiles('#open-family', { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'cancer-predisposition-differential', version: 1, people })) });
  await openAll(page);
  await amsFam([{ rel: 'proband', sex: 'F', dx: [{ site: 'colorectal', hist: 'adeno', age: '45' }] }, { rel: 'mother', sex: 'F', dx: [{ site: 'uterus', hist: 'endometrioid', age: '55' }] }, { rel: 'm_aunt', sex: 'F', dx: [{ site: 'colorectal', hist: 'adeno', age: '60' }] }]);
  await page.waitForSelector('#results .ams');
  const amsT = await page.locator('#results .ams').textContent();
  check(await page.locator('#results .ams.met').count() === 1 && /Family history meets the modified Amsterdam criteria/.test(amsT) && /Proband.*Mother.*Maternal aunt/.test(amsT) && (amsT.match(/✓/g) || []).length === 4, 'Amsterdam-positive family highlighted with the relatives involved and a full checklist');
  await page.click('#copy');
  check(/FAMILY HISTORY MEETS MODIFIED AMSTERDAM CRITERIA/.test(await page.evaluate(() => navigator.clipboard.readText())), 'summary states the family meets modified Amsterdam');
  await amsFam([{ rel: 'proband', sex: 'F', dx: [{ site: 'colorectal', hist: 'adeno', age: '55' }] }, { rel: 'mother', sex: 'F', dx: [{ site: 'uterus', hist: 'endometrioid', age: '58' }] }, { rel: 'm_aunt', sex: 'F', dx: [{ site: 'colorectal', hist: 'adeno', age: '60' }] }]);
  await page.waitForFunction(() => /not met/.test(document.querySelector('#results .ams')?.textContent || ''));
  const amsN = await page.locator('#results .ams').textContent();
  check(/Modified Amsterdam criteria not met \(3 of 4\)/.test(amsN) && /✗ at least one diagnosed under 50/.test(amsN), 'near miss shows which criterion is missing');

  console.log('How syndromes are ranked');
  await page.goto(BASE + '#syndrome=vhl'); await page.waitForSelector('#syn-detail h2');
  check(/yield:/i.test(await page.getAttribute('#syn-detail .tier', 'title') || ''), 'strength labels explain the definition on hover');
  await page.locator('#syn-detail [data-goto-ranking]').first().click(); await page.waitForTimeout(400);
  const rk = await page.textContent('#ranking');
  check(await page.evaluate(() => location.hash) === '#sources' && /How syndromes are ranked/.test(rk) && /About 10–50% have the syndrome/.test(rk) && /second-degree ×0\.6/.test(rk), '"How strength is defined" opens the ranking definitions on the Sources tab');
  check(await page.evaluate(() => { const r = document.querySelector('#ranking h2').getBoundingClientRect(), bar = document.querySelector('.tabbar').getBoundingClientRect(); return r.top >= bar.bottom - 1 && r.top < innerHeight; }), 'the ranking heading is not hidden under the tab bar');

  console.log('Disclaimer');
  await page.goto(BASE);
  const discTxt = await page.textContent('#disclaimer');
  check(/is clinical decision support for healthcare professionals/.test(discTxt) && /To the extent permitted\s+by law/.test(discTxt) && /authors' employers or of NHS England/.test(discTxt) && /"as is"/.test(discTxt), 'full disclaimer is in the footer');
  await page.locator('.disc-link:visible').first().click(); await page.waitForTimeout(800);
  check(await page.evaluate(() => { const r = document.querySelector('#disclaimer').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }) && await page.evaluate(() => location.hash) === '', 'the Disclaimer link in the notice strip scrolls to it without changing the page');

  console.log('Example families');
  await page.goto(BASE);
  await page.click('#example');
  check(await page.getAttribute('#example', 'aria-expanded') === 'true' && await page.locator('#example-menu .ex-item').count() >= 9, 'Load example opens a menu of example families');
  check(await page.evaluate(() => document.activeElement.classList.contains('ex-item')), 'focus moves into the menu');
  await page.keyboard.press('ArrowDown');
  check(await page.evaluate(() => document.activeElement.dataset.loadExample) === 'lynch_msh2', 'arrow keys move through the menu');
  await page.keyboard.press('Escape');
  check(await page.isHidden('#example-menu') && await page.evaluate(() => document.activeElement.id) === 'example', 'Escape closes the menu and returns focus');
  await page.click('#example'); await page.mouse.click(5, 300);
  check(await page.isHidden('#example-menu'), 'clicking elsewhere closes the menu');
  for (const ex of await page.evaluate(() => EXAMPLES.map(e => ({ id: e.id, top: e.top, test: e.test, label: e.label })))) {
    await loadEx(page, ex.id); await page.waitForSelector('#results .result');
    check(await page.locator('#results .result').first().getAttribute('data-cond') === ex.top, `example ${ex.id}: ${ex.top} ranks first`);
    const met = await page.evaluate(t => [...document.querySelectorAll('#results .elig > .elig-people > li')].some(li => /^Proband/.test(li.querySelector('.elig-who').textContent) && li.textContent.includes(t)), ex.test);
    check(met, `example ${ex.id}: the proband meets ${ex.test}`);
    check(await page.isVisible('#example-note') && (await page.textContent('#example-note')).includes(ex.label), `example ${ex.id}: caption shown`);
  }
  await page.click('[data-act=close-example-note]');
  check(await page.isHidden('#example-note'), 'the example note can be closed');
  await loadEx(page, 'pten'); await page.click('#clear');
  check(await page.isHidden('#example-note'), 'clearing the family removes the example note');

  console.log('Appearance');
  await page.goto(BASE);
  check(/^Cancer Family History Navigator/.test(await page.title()) && /^Cancer Family History Navigator/.test(await page.textContent('h1')), 'site is named Cancer Family History Navigator (tab title and banner)');
  await page.goto(BASE + '#syndrome=lynch_msh2'); await page.waitForSelector('#syn-detail h2');
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.locator('#syn-list a[href="#syndrome=men2"]').click();
  await page.waitForFunction(() => /Multiple endocrine neoplasia type 2/.test(document.querySelector('#syn-detail h2').textContent));
  await page.waitForTimeout(100);
  const gap = await page.evaluate(() => document.querySelector('#syn-detail h2').getBoundingClientRect().top - document.querySelector('.tabbar').getBoundingClientRect().bottom);
  check(gap >= 0, `syndrome title is not hidden under the tab bar (gap ${Math.round(gap)}px)`);
  const jumps = await page.locator('#syn-detail .jump button').allTextContents();
  check(jumps.join('|') === 'Cancers|Variants|Tests|Guidance|Surveillance|Sources', 'jump links on syndrome page (with Variants)');
  await page.click('#syn-detail .jump [data-jump=surveillance]');
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => document.getElementById('jump-surveillance').getBoundingClientRect().top);
  check(st >= 40 && st < 200 && new URL(page.url()).hash === '#syndrome=men2', `Surveillance jump scrolls to the section below the tab bar (${Math.round(st)}px), hash unchanged`);
  check(await page.getAttribute('link[rel=icon]', 'href') === 'assets/favicon.svg', 'favicon linked');
  check(await page.getAttribute('.site-head .gh-link', 'href') === 'https://github.com/cjs1218/Claud-scratchpad' && await page.locator('.site-head .gh-link svg path').count() === 1 && await page.isVisible('.site-head .gh-link'), 'GitHub link with logo in header');
  const foot = await page.locator('.site-foot').textContent();
  check(/128 genes from the NICPR gene list/.test(foot) && /103 conditions/.test(foot) && /Information checked 12 October 2026/.test(foot) && /ClinGen/.test(foot) && await page.locator('.site-foot a[href="#sources"]').count() === 1, 'footer describes current sources with live counts and date');
  check(await page.locator('.site-foot a[href="https://github.com/cjs1218/Claud-scratchpad"] svg').count() === 1, 'GitHub link with logo in footer');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.site-head')).backgroundColor) === 'rgb(0, 94, 184)', 'NHS blue header');
  await page.click('[data-tab=assess]'); await loadEx(page); await openAll(page);
  const hs = page.locator('#family select[data-f=hist]').first();
  check(await hs.evaluate(el => el.scrollWidth <= el.clientWidth + 2 || el.clientWidth > 380), 'histology select wide enough for long names');

  console.log('Mobile layout');
  await page.setViewportSize({ width: 375, height: 800 });
  const synOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(synOverflow <= 0, `no horizontal scroll on syndrome page at 375px (overflow ${synOverflow}px)`);
  await page.click('[data-tab=browse]'); await page.waitForSelector('#syn-detail h2');
  await page.click('[data-tab=assess]'); await page.evaluate(() => window.scrollTo(0, 0)); await page.click('#example');
  const menuBox = await page.locator('#example-menu').boundingBox();
  check(menuBox.x >= 0 && menuBox.x + menuBox.width <= 375, `phone: the example menu fits on screen (left ${Math.round(menuBox.x)}, right ${Math.round(menuBox.x + menuBox.width)})`);
  await page.keyboard.press('Escape');
  await loadEx(page); await openAll(page); await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#family input[data-f=age]').first().focus(); await page.waitForTimeout(100);
  check(!(await page.isVisible('#to-results')), 'phone: See results button hides while typing in the form');
  await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(100);
  check(await page.isVisible('#to-results') && /See results \(\d+\)/.test(await page.textContent('#to-results')), 'phone: floating See results button');
  await page.click('#to-results'); await page.waitForTimeout(900);
  check(!(await page.isVisible('#to-results')), 'phone: button hides once results are on screen');
  await page.goto(BASE + '#syndrome=brca1'); await page.waitForSelector('#syn-detail h2');
  check(await page.locator('#syn-detail details.syn-fold').count() >= 3 && !(await page.locator('#syn-detail details.syn-fold#jump-surveillance').evaluate(d => d.open)), 'phone: long syndrome-page sections start folded');
  await page.locator('#syn-detail .jump [data-jump=surveillance]').click(); await page.waitForTimeout(300);
  check(await page.locator('#syn-detail details.syn-fold#jump-surveillance').evaluate(d => d.open), 'phone: jump link opens the folded section');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#syn-detail table.cancers thead')).display === 'none' && getComputedStyle(document.querySelector('#syn-detail table.cancers td')).display === 'grid'), 'phone: cancers table shown as stacked cards');
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(ovf <= 0, `phone: syndrome page has no sideways scroll (${ovf}px)`);
  await page.click('[data-tab=browse]'); await page.waitForSelector('#syn-detail h2');
  check(!(await page.isVisible('#syn-list')) && /Browse 103 syndromes/.test(await page.textContent('#syn-list-toggle')), 'phone: list collapsed behind a toggle');
  await page.click('#syn-list-toggle');
  check(await page.isVisible('#syn-list') && await page.evaluate(() => getComputedStyle(document.getElementById('syn-list')).overflowY) === 'visible', 'phone: list opens with no inner scroll');
  await page.locator('#syn-list a[href="#syndrome=vhl"]').click();
  await page.waitForFunction(() => /von Hippel/i.test(document.querySelector('#syn-detail h2').textContent));
  check(!(await page.isVisible('#syn-list')), 'phone: choosing a syndrome closes the list');
  check(await page.isVisible('.site-head .gh-link svg') && (await page.locator('.site-head .gh-link').boundingBox()).width < 50, 'phone: GitHub link shows as a compact logo button');
  check(!(await page.isVisible('.lede-long')) && await page.isVisible('.disc-short'), 'phone: slim header with short disclaimer once a family is entered');
  check(await page.evaluate(() => [...document.querySelectorAll('.tabs button')].every(b => b.getBoundingClientRect().height < 50)), 'phone: tab labels stay on one line');
  await page.click('[data-tab=assess]');
  await loadEx(page); await openAll(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no horizontal scroll at 375px (overflow ${overflow}px)`);

  check(errors.length === 0, `no console/page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
