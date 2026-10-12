const d = require("./load.js")(process.argv[2] || require("path").join(__dirname, "../js/data.js"));
const errs = [];
const e = m => errs.push(m);
const ids = new Set();
for (const c of d.CONDITIONS) {
  if (ids.has(c.id)) e(`duplicate id ${c.id}`); ids.add(c.id);
  for (const [i, r] of c.rules.entries()) {
    const [site, hist, tier, early, pred, maxAge] = r;
    const S = d.SITES[site];
    if (!S) { e(`${c.id} rule ${i}: unknown site ${site}`); continue; }
    if (hist !== '*') for (const h of hist.split('|')) if (!S.hist.some(([k]) => k === h)) e(`${c.id} rule ${i}: unknown histology ${site}/${h}`);
    if (!(tier in d.TIER)) e(`${c.id} rule ${i}: bad tier ${tier}`);
    if (pred && !d.PRED[pred]) e(`${c.id} rule ${i}: unknown predicate ${pred}`);
    if (early != null && typeof early !== 'number') e(`${c.id} rule ${i}: earlyAge not number`);
    if (maxAge != null && typeof maxAge !== 'number') e(`${c.id} rule ${i}: maxAge not number`);
    if (r.length > 9) e(`${c.id} rule ${i}: too many fields`);
  }
  for (const [site, pred] of c.mods || []) {
    if (site !== '*' && !d.SITES[site]) e(`${c.id} mod: unknown site ${site}`);
    if (!d.PRED[pred]) e(`${c.id} mod: unknown predicate ${pred}`);
  }
  for (const t of c.tests) if (!d.TESTS[t]) e(`${c.id}: unknown test ${t}`);
  for (const g of c.genes) if (!d.GENE_MIM[g]) e(`${c.id}: no GENE_MIM for ${g}`);
  const ref = d.REFS[c.id];
  if (!ref) e(`${c.id}: no REFS entry`);
  else {
    for (const n of ref.gr) if (!d.GR_TITLES[n]) e(`${c.id}: GR ${n} has no title`);
    for (const m of ref.omim) if (!d.OMIM_TITLES[m]) e(`${c.id}: OMIM ${m} has no title`);
  }
  const src = d.SOURCES[c.id] || {};
  for (const k of src.eg || []) if (!d.EG[k]) e(`${c.id}: unknown leaflet ${k}`);
  for (const k of src.guide || []) if (!d.GUIDES[k]) e(`${c.id}: unknown guide ${k}`);
  for (const k of src.eu || []) if (!d.EU_GUIDES[k]) e(`${c.id}: unknown European guide ${k}`);
  for (const k of src.us || []) if (!d.US_GUIDES[k]) e(`${c.id}: unknown US guide ${k}`);
}
for (const [i, t] of d.TEST_POINTERS.entries()) {
  if (!d.SITES[t.site]) e(`pointer ${i}: unknown site ${t.site}`);
  else for (const h of t.hist.split('|')) if (!d.SITES[t.site].hist.some(([k]) => k === h)) e(`pointer ${i}: unknown histology ${t.site}/${h}`);
  if (!t.aacr || !t.nhs) e(`pointer ${i}: needs aacr and nhs text`);
}
const srcOk = k => k.startsWith('gr:') ? !!d.GR_TITLES[k.slice(3)] : !!(d.GUIDES[k] || d.EU_GUIDES[k] || d.US_GUIDES[k]);
for (const c of d.CONDITIONS) {
  const sv = d.SURVEILLANCE[c.id];
  if (!sv) { e(`${c.id}: no SURVEILLANCE entry`); continue; }
  if (!['uk', 'eu', 'intl', 'none'].includes(sv.lvl)) e(`${c.id}: bad surveillance level ${sv.lvl}`);
  if (sv.lvl !== 'none' && (!sv.src.length || !sv.items.length)) e(`${c.id}: surveillance needs src and items`);
  for (const k of sv.src) if (!srcOk(k)) e(`${c.id}: unknown surveillance source ${k}`);
  for (const [k] of sv.diff || []) if (!srcOk(k)) e(`${c.id}: unknown surveillance diff source ${k}`);
  if (sv.lvl === 'uk' && !sv.src.some(k => d.GUIDES[k])) e(`${c.id}: uk level needs a UK guide`);
  if (sv.lvl === 'eu' && !sv.src.some(k => d.EU_GUIDES[k])) e(`${c.id}: eu level needs a European guide`);
  if (sv.lvl !== 'uk' && ((d.SOURCES[c.id] || {}).guide || []).some(k => !['bsg', 'cg164', 'dg27', 'dg42', 'hanson'].includes(k))) e(`${c.id}: has a UKCGG guide but surveillance is not UK-led`);
}
for (const c of d.CONDITIONS) {
  const r = d.LAST_REVIEWED[c.id];
  if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r) || isNaN(Date.parse(r))) e(`${c.id}: missing or invalid LAST_REVIEWED date`);
}
for (const k of Object.keys(d.LAST_REVIEWED)) if (!ids.has(k)) e(`LAST_REVIEWED key ${k} is not a condition`);
for (const [id, pages] of Object.entries(d.GENOTES)) {
  if (!ids.has(id)) e(`GENOTES key ${id} is not a condition`);
  for (const [t, path] of pages) if (!t || !/^(knowledge-hub|in-the-clinic)\/[a-z0-9-]+\/$/.test(path)) e(`GENOTES ${id}: bad entry ${t} ${path}`);
}
// Evidence: every source key on a rule or variant note must resolve; every EVIDENCE entry needs a DOI/PubMed URL.
const evSrcOk = k => {
  const [t, v] = k.includes(':') ? k.split(/:(.*)/) : ['', k];
  if (t === 'gr') return !!d.GR_TITLES[v];
  if (t === 'ukcgg') return !!d.GUIDES[v];
  if (t === 'eu') return !!d.EU_GUIDES[v];
  if (t === 'us') return !!d.US_GUIDES[v];
  if (t === 'clingen') return !!d.CLINGEN_HGNC[v];
  if (t === 'canvar') return d.CANVAR_GENES.includes(v);
  return !t && !!d.EVIDENCE[k];
};
for (const c of d.CONDITIONS) for (const r of c.rules) {
  if (r[6] !== undefined && !Array.isArray(r[6])) e(`${c.id}: rule ${r[0]}/${r[1]} src is not an array`);
  for (const k of r[6] || []) if (!evSrcOk(k)) e(`${c.id}: rule ${r[0]}/${r[1]} unknown source ${k}`);
  for (const k of r[6] || []) if (k.startsWith('us:') && d.US_GUIDES[k.slice(3)] && !/doi\.org\//.test(d.US_GUIDES[k.slice(3)][1]) && !k.startsWith('us:nccn')) e(`${c.id}: rule ${r[0]}/${r[1]} cites US guidance ${k} that is not a peer-reviewed journal article (no DOI)`);
  if (r[8] !== undefined && typeof r[8] !== 'string') e(`${c.id}: rule ${r[0]}/${r[1]} US difference is not text`);
  if (r[7] !== undefined && r[7] !== null && typeof r[7] !== 'string') e(`${c.id}: rule ${r[0]}/${r[1]} risk is not text`);
}
for (const [id, notes] of Object.entries(d.VARIANT_NOTES)) {
  if (!ids.has(id)) e(`VARIANT_NOTES key ${id} is not a condition`);
  for (const [t, s] of notes) { if (!t) e(`${id}: empty variant note`); for (const k of s) if (!evSrcOk(k)) e(`${id}: variant note unknown source ${k}`); }
}
for (const [k, v] of Object.entries(d.EVIDENCE)) if (v.length !== 3 || !/^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|www\.ncbi\.nlm\.nih\.gov|europepmc\.org|jnccn\.org)\//.test(v[2])) e(`EVIDENCE ${k} needs [short, title, DOI/PubMed URL]`);
const catIds = d.CATEGORIES.flatMap(([, ids]) => ids);
for (const c of d.CONDITIONS) if (catIds.filter(x => x === c.id).length !== 1) e(`${c.id} must be in exactly one category`);
for (const id of catIds) if (!ids.has(id)) e(`category lists unknown condition ${id}`);
for (const k of Object.keys(d.SOURCES)) if (!ids.has(k)) e(`SOURCES key ${k} is not a condition`);
for (const k of Object.keys(d.REFS)) if (!ids.has(k)) e(`REFS key ${k} is not a condition`);
for (const k of d.EG_GENERAL) if (!d.EG[k]) e(`EG_GENERAL ${k} missing`);
for (const [k, t] of Object.entries(d.TESTS)) {
  if (t.code !== k) e(`TESTS ${k}: code ${t.code} does not match key`);
  if (!t.name || !t.genes || !t.criteria?.length) e(`TESTS ${k}: missing fields`);
}
const covered = new Set(d.CONDITIONS.flatMap(c => c.genes));
for (const g of d.NICPR.genes) if (!covered.has(g)) e(`NICPR gene ${g} not covered by any condition`);
for (const g of [...d.NICPR.biallelic, ...d.NICPR.susceptibilityOnly, ...d.NICPR.nonTruncatingAgreed, ...d.NICPR.addedSince2025])
  if (!d.NICPR.genes.includes(g)) e(`NICPR annotation gene ${g} not on list`);
const used = new Set(d.CONDITIONS.flatMap(c => c.tests));
const unused = Object.keys(d.TESTS).filter(k => !used.has(k) && k !== 'R404');
console.log(`${d.CONDITIONS.length} conditions, ${d.CONDITIONS.reduce((n, c) => n + c.rules.length, 0)} rules, ${Object.keys(d.TESTS).length} tests, ${Object.keys(d.EG).length} leaflets, ${Object.keys(d.GUIDES).length} guides`);
if (unused.length) console.log('tests not used by any condition:', unused.join(', '));
console.log(errs.length ? errs.join('\n') : 'All data checks passed');
process.exit(errs.length ? 1 : 0);
