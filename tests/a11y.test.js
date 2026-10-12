// Accessibility check with axe-core on the main views, in light and dark mode. Run: node tests/a11y.test.js [URL]
// Uses node_modules/axe-core when installed (npm install), otherwise downloads the same version from cdnjs.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { playwright, ROOT } = require('./env.js');
const { chromium } = playwright();
const AXE_VERSION = '4.10.2';
const getAxe = () => new Promise((resolve, reject) => {
  try { return resolve(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')); } catch (e) { /* not installed */ }
  https.get(`https://cdnjs.cloudflare.com/ajax/libs/axe-core/${AXE_VERSION}/axe.min.js`, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d)); }).on('error', reject);
});
let BASE = process.argv[2];
(async () => {
  if (!BASE) BASE = (await require('./static-server.js')(ROOT)).url;
  const axe = await getAxe();
  const b = await chromium.launch();
  let fails = 0;
  for (const scheme of ['light', 'dark']) {
    const page = await b.newPage({ colorScheme: scheme, viewport: { width: 1366, height: 900 } });
    const run = async label => {
      await page.addScriptTag({ content: axe });
      const v = await page.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations
        .filter(x => ['serious', 'critical'].includes(x.impact) || x.id === 'heading-order')
        .map(x => `${x.impact} ${x.id} (${x.nodes.length}): ${x.help} – ${x.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`));
      if (v.length) { fails += v.length; console.log(`FAIL ${scheme} ${label}\n  ${v.join('\n  ')}`); } else console.log(`  ok   ${scheme} ${label}`);
    };
    await page.goto(BASE); await run('empty form');
    await page.click('#example'); await page.waitForSelector('#results .elig'); await run('example results');
    await page.locator('#family .person-open').first().click(); await run('relative open for editing');
    await page.locator('#results button.test-link[data-test=R208]').first().click(); await page.waitForSelector('#crit-dialog[open]'); await run('criteria pop-up');
    await page.keyboard.press('Escape');
    await page.locator('#results .elig button.mss-link').first().click(); await page.waitForSelector('#crit-dialog[open]'); await run('Manchester pop-up');
    await page.keyboard.press('Escape');
    await page.goto(BASE + '#syndrome=lynch_msh2'); await page.waitForSelector('#syn-detail h2'); await run('syndrome page');
    await page.goto(BASE + '#gene=BRCA1'); await page.waitForSelector('#syn-detail h2'); await run('gene page');
    await page.goto(BASE + '#sources'); await page.waitForTimeout(200); await run('sources');
    await page.close();
  }
  await b.close();
  console.log(fails ? `${fails} accessibility problems` : 'No serious accessibility problems found');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
