// Every eligibility reason must point at a line of the verbatim Test Directory criteria (js/criteria.js),
// and every CRIT_REF snippet must resolve. Random families exercise the reasons. Run: node tests/criteria.test.js
const w = require('./env.js').load();
let fail = 0;
const find = (test, snip) => { const it = (w.TD_CRITERIA[test] || { items: [] }).items; let i = it.findIndex(x => x[2].startsWith(snip)); if (i < 0) i = it.findIndex(x => x[2].includes(snip)); return i; };
for (const [t, list] of Object.entries(w.CRIT_REF)) for (const [, snip] of list) if (find(t, snip) < 0) { fail++; console.log('FAIL unresolved snippet', t, snip); }
for (const k of Object.keys(w.TESTS)) if (!w.TD_CRITERIA[k]) { fail++; console.log('FAIL no criteria text for', k); }
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const sites = Object.keys(w.SITES), rels = w.RELATIONS.map(r => r[0]).filter(r => r !== 'proband');
const miss = new Map(); let n = 0;
for (let f = 0; f < 20000; f++) {
  const people = [{ id: 1, rel: 'proband', sex: rnd(2) ? 'F' : 'M', dx: [] }];
  for (let k = 0; k < 1 + rnd(4); k++) people.push({ id: k + 2, rel: rels[rnd(rels.length)], sex: rnd(2) ? 'F' : 'M', deceased: !rnd(5), dx: [] });
  for (const p of people) for (let j = 0; j < rnd(3); j++) {
    const s = sites[rnd(sites.length)], h = w.SITES[s].hist[rnd(w.SITES[s].hist.length)][0];
    p.dx.push({ site: s, hist: h, age: String(1 + rnd(85)), count: String(rnd(25)), side: ['', '', 'one', 'both', 'multi'][rnd(5)], age2: rnd(2) ? String(30 + rnd(50)) : '',
      er: ['', 'pos', 'neg'][rnd(3)], pr: ['', 'neg'][rnd(2)], her2: ['', 'neg', 'pos'][rnd(3)], grade: ['', '1', '2', '3'][rnd(4)], ovgrade: ['', 'low', 'high'][rnd(3)],
      mmr: ['', '', 'msh2', 'mlh1', 'msi'][rnd(5)], meth: ['', 'no'][rnd(2)], braf: '' });
  }
  for (const o of [...w.checkEligibility(people, ['', '', '', '', '', 'ashkenazi', 'westray', 'whalsay', 'maori', 'other_founder'][rnd(10)]), ...w.nearMisses(people, '')])
    o.text.forEach((t, i) => { n++; if (!o.crit || !o.crit[i]) { const k = o.test + ' | ' + t.replace(/\(.*?\)/g, '(…)').replace(/\d+/g, 'N'); miss.set(k, (miss.get(k) || 0) + 1); } });
}
for (const [k, c] of miss) { fail++; console.log('FAIL unlinked reason', c, k); }
console.log(`${n} reasons checked; ${fail ? fail + ' problems' : 'all linked to a criterion line'}`);
process.exit(fail ? 1 : 0);
