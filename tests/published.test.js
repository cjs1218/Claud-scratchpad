// Published-case accuracy check: real families from open-access case reports (tests/published-cases.json), each with a
// confirmed germline variant. For each family: the rank of the first syndrome caused by that gene (full ranking, i.e.
// the "wide" search), and whether anyone in the family meets one of that syndrome's Test Directory tests.
// Run: node tests/published.test.js [URL]   (with no URL a local server is started)
// Exits non-zero for invalid cases, or if the top-5 rate falls below the recorded floor (a scoring regression).
const { playwright, ROOT, NAV_PATH } = require('./env.js');
const load = require('./load.js');
const path = require('path');
const fs = require('fs');
const { chromium } = playwright();

const D = load(path.join(ROOT, NAV_PATH, 'js/data.js'));
// Four sets, each with its own floor: the first 50 (worldwide), then 54, 50 and 49 UK/European families. PUBLISHED_FILE runs one file.
const FILES = process.env.PUBLISHED_FILE ? [process.env.PUBLISHED_FILE] : ['published-cases.json', 'published-cases-eu.json', 'published-cases-eu2.json', 'published-cases-eu3.json'].map(f => path.join(__dirname, f));
const SETS = FILES.map(f => ({ name: path.basename(f), ...JSON.parse(fs.readFileSync(f, 'utf8')) }));
const REL = new Set(D.RELATIONS.map(r => r[0]));

// Validate every case before running it.
const bad = [];
const seen = new Map();
for (const c of SETS.flatMap(s => s.cases)) {
  for (const k of ['id', 'pmid']) if (c[k]) { if (seen.has(k + c[k])) bad.push(`${c.id}: ${k} ${c[k]} is already used by ${seen.get(k + c[k])}`); seen.set(k + c[k], c.id); }
  if (!c.id || !c.gene || !c.citation || !(c.pmid || c.pmcid || c.doi)) bad.push(`${c.id}: needs id, gene, citation and a PMID, PMCID or DOI`);
  if (!D.CONDITIONS.some(k => k.genes.includes(c.gene))) bad.push(`${c.id}: no condition in data.js has gene ${c.gene}`);
  if (!c.people.some(p => p[0] === 'proband')) bad.push(`${c.id}: no proband`);
  for (const [rel, sex, dx] of c.people) {
    if (!REL.has(rel)) bad.push(`${c.id}: unknown relationship ${rel}`);
    if (!['F', 'M'].includes(sex)) bad.push(`${c.id}: sex must be F or M (${rel})`);
    for (const d of dx || []) {
      const site = D.SITES[d.site];
      if (!site) bad.push(`${c.id}: unknown site ${d.site}`);
      else if (!site.hist.some(h => h[0] === d.hist)) bad.push(`${c.id}: unknown histology ${d.site}/${d.hist}`);
      const lat = D.LATERALITY[d.site], sides = lat && (lat[0] === '*' || lat[0].split('|').includes(d.hist)) ? lat[1] : [];
      if (d.side && !sides.includes(d.side)) bad.push(`${c.id}: side ${d.side} is not offered for ${d.site}/${d.hist}`);
      for (const [m, mo] of Object.entries(D.MARKER_OPTIONS)) if (d[m] && !mo.opts.some(o => o[0] === String(d[m]))) bad.push(`${c.id}: ${m} "${d[m]}" is not an option`);
    }
  }
}
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }

let BASE = process.argv.slice(2).find(a => !a.startsWith('--'));
(async () => {
  const server = BASE ? null : await require('./static-server.js')(ROOT);
  if (!BASE) BASE = server.url + NAV_PATH;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE);
  for (const set of SETS) set.rows = [];
  for (const set of SETS) for (const c of set.cases) {
    const fam = { people: c.people.map(([rel, sex, dx, extra], i) => ({ id: i + 1, rel, sex, dx: (dx || []).map((d, j) => ({ id: j + 1, ...d })), ...(extra || {}) })) };
    await page.setInputFiles('#open-family', { name: `${c.id}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fam)) });
    // The "Opened <file>" message is unique to this family and shows after it has rendered (a person count can match
    // the previous family); a family the page cannot open is reported. Then use the full ranking.
    await page.waitForFunction(id => new RegExp(`Opened ${id}\\.json|could not be opened`).test(document.getElementById('toast').textContent), c.id);
    if (/could not be opened/.test(await page.textContent('#toast'))) { console.log(`${c.id}: the page could not open this family`); process.exit(1); }
    if (await page.locator('[data-mode=wide]').first().isVisible()) await page.locator('[data-mode=wide]').first().click();
    await page.waitForTimeout(60);
    const ids = await page.$$eval('#results .result', a => a.map(x => x.dataset.cond));
    const target = D.CONDITIONS.filter(k => k.genes.includes(c.gene)).map(k => k.id);
    const rank = ids.findIndex(id => target.includes(id)) + 1; // 0 = not ranked at all
    const tests = [...new Set(D.CONDITIONS.filter(k => target.includes(k.id)).flatMap(k => k.tests))];
    const met = await page.evaluate(() => [...document.querySelectorAll('#results .elig [data-test]')].map(b => b.dataset.test));
    set.rows.push({ c, rank, top: ids.slice(0, 3), testMet: tests.some(t => met.includes(t)), tests });
  }
  await browser.close();
  if (server) server.server.close();

  let failed = false;
  for (const { name, rows, cases, floor } of SETS) {
    const n = rows.length, pct = k => Math.round(100 * rows.filter(r => r.rank && r.rank <= k).length / n);
    const testRate = Math.round(100 * rows.filter(r => r.testMet).length / n);
    console.log(`Published cases (${name}): ${n} families, ${new Set(cases.map(c => c.gene)).size} genes`);
    for (const r of rows) console.log(`  ${r.rank && r.rank <= 5 ? 'ok  ' : 'MISS'} ${r.c.id.padEnd(10)} ${r.c.gene.padEnd(7)} rank ${r.rank || '–'}${r.testMet ? '' : ' (no route test met)'}  top: ${r.top.join(', ')}  [${r.c.pmid ? 'PMID ' + r.c.pmid : r.c.pmcid || r.c.doi}]`);
    console.log(`Top 1: ${pct(1)}%  Top 3: ${pct(3)}%  Top 5: ${pct(5)}%  Test Directory route met: ${testRate}%`);
    if (floor && pct(5) < floor.top5) { console.log(`FAIL ${name}: top-5 rate ${pct(5)}% is below the recorded floor of ${floor.top5}%`); failed = true; }
  }
  if (process.argv.includes('--json')) fs.writeFileSync(path.join(__dirname, '..', 'published-results.json'), JSON.stringify(SETS.flatMap(s => s.rows).map(r => ({ id: r.c.id, gene: r.c.gene, rank: r.rank, top: r.top, testMet: r.testMet })), null, 1));
  if (failed) process.exit(1);
})();
