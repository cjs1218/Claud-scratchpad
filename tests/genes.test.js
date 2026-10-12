// Run: node tests/genes.test.js [URL]  (with no URL a local server is started)
const { playwright, ROOT } = require('./env.js');
const { chromium } = playwright();
let BASE = process.argv[2];
(async () => {
  if (!BASE) BASE = (await require('./static-server.js')(ROOT)).url;
  const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(BASE);
  const genes = await p.evaluate(() => [...new Set(CONDITIONS.flatMap(c => c.genes))]);
  const bad = []; let links = 0;
  for (const g of genes) {
    await p.evaluate(x => { location.hash = 'gene=' + x; }, g);
    await p.waitForFunction(x => document.querySelector('#syn-detail h2')?.textContent === x, g);
    const h = await p.locator('#syn-detail a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    links += h.length;
    if (h.some(x => !(/^https:\/\//.test(x) || /^#syndrome=\w+$/.test(x) || x === "#sources") || /undefined|null/.test(x))) bad.push(g);
  }
  console.log(`${genes.length} gene pages, ${links} links, bad: ${bad.join(',') || 'none'}, errors: ${errs.length || 'none'}`);
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
