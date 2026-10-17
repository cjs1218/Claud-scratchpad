/*
 * Test Directory eligibility (Rare and Inherited Disease eligibility criteria v9.1, 20 May 2026).
 * checkEligibility(people, ancestry) returns the criteria met by each person in the family as entered.
 * Decision support only: it covers the inherited cancer tests and criteria that can be judged from the
 * information entered. Entries marked `possible` fit except for a detail not recorded here ("may meet – check"); the full criteria in the Test Directory always take precedence.
 *
 * Manchester score (BRCA1/BRCA2): points table and pathology adjustments as published by GeNotes
 * (Evans et al. J Med Genet 2004;41:474 and 2017;54:674).
 */
(function () {
  const REL = Object.fromEntries(RELATIONS.map(r => [r[0], { id: r[0], label: r[1], degree: r[2], side: r[3], sex: r[4] }]));

  /* ---- Relationships between any two relatives (relative to the proband's family structure) ---- */
  // Each relation: the unit (couple) it descends from, and the units it is a member of.
  const PARENT = {
    proband: 'P0', sister: 'P0', brother: 'P0', mother: 'GM', father: 'GP',
    m_aunt: 'GM', m_uncle: 'GM', p_aunt: 'GP', p_uncle: 'GP', m_gm: 'GGM', m_gf: 'GGM', p_gm: 'GGP', p_gf: 'GGP',
    m_great: 'GGM', p_great: 'GGP', daughter: 'PC', son: 'PC', grandchild: 'CC', niece: 'SC',
    m_cousin: 'AM', p_cousin: 'AP', m_halfsib: 'MOM', p_halfsib: 'DAD',
    gniece: 'NC', m_cousin_child: 'CM', p_cousin_child: 'CP'
  };
  const MEMBER = {
    mother: ['P0', 'MOM'], father: ['P0', 'DAD'], m_gm: ['GM'], m_gf: ['GM'], p_gm: ['GP'], p_gf: ['GP'],
    proband: ['PC'], sister: ['SC'], brother: ['SC'], daughter: ['CC'], son: ['CC'],
    m_aunt: ['AM'], m_uncle: ['AM'], p_aunt: ['AP'], p_uncle: ['AP'],
    niece: ['NC'], m_cousin: ['CM'], p_cousin: ['CP'], m_ggp: ['GGM'], p_ggp: ['GGP']
  };
  const SINGLE = new Set(['MOM', 'DAD']); // units with one parent (half-siblings)
  const UNIT_MEMBERS = {};
  for (const [rel, units] of Object.entries(MEMBER)) for (const u of units) (UNIT_MEMBERS[u] = UNIT_MEMBERS[u] || []).push(rel);
  // Ancestral units of a relation with their distance in generations.
  function ancestors(rel) {
    const out = {};
    const walk = (unit, d) => {
      if (!unit || (out[unit] !== undefined && out[unit] <= d)) return;
      out[unit] = d;
      for (const m of UNIT_MEMBERS[unit] || []) walk(PARENT[m], d + 1);
      if (unit === 'P0') { walk('MOM', d); walk('DAD', d); }
    };
    walk(PARENT[rel], 1);
    for (const u of MEMBER[rel] || []) if (out[u] === undefined) out[u] = 0;
    return out;
  }
  const ANC = Object.fromEntries([...new Set([...Object.keys(PARENT), ...Object.keys(MEMBER)])].map(r => [r, ancestors(r)]));
  /* Relatives whose parent can be named ("Child of"): which relations can be their parent. Known parent: relationships run
   * through that person. Not named: links to the possible parents (and to others of the same kind) are unknown, so no
   * aunt is assumed to be every cousin's mother. */
  const PARENT_OF = { m_cousin: ['m_aunt', 'm_uncle'], p_cousin: ['p_aunt', 'p_uncle'], niece: ['sister', 'brother', 'm_halfsib', 'p_halfsib'],
    grandchild: ['daughter', 'son'], gniece: ['niece'], m_cousin_child: ['m_cousin'], p_cousin_child: ['p_cousin'] };
  let byId = new Map();
  const setPeople = people => { byId = new Map((people || []).map(p => [p.id, p])); };
  const parentOf = x => {
    if (!PARENT_OF[x.rel] || x.parentId == null) return null;
    const par = byId.get(x.parentId);
    return par && par !== x && PARENT_OF[x.rel].includes(par.rel) ? par : null;
  };
  function degree(a, b, depth = 0) {
    if (a === b) return 0;
    if (depth > 6) return null;
    const pa = parentOf(a), pb = parentOf(b);
    if (pa || pb) {
      if (pa === b || pb === a) return 1;
      if (pa && pb && pa === pb) return 1; // children of the same parent
      const [child, par, other] = pa ? [a, pa, b] : [b, pb, a];
      const d = degree(par, other, depth + 1);
      return d == null ? null : d + 1;
    }
    for (const [x, y] of [[a, b], [b, a]]) if (PARENT_OF[x.rel] && (PARENT_OF[x.rel].includes(y.rel) || y.rel === x.rel)) return null;
    return unitDegree(a, b);
  }
  // Degree of relationship (1 = first-degree) from the family structure alone, or null if unknown / not blood relatives.
  function unitDegree(a, b) {
    if (a === b) return 0;
    const A = ANC[a.rel], B = ANC[b.rel];
    if (!A || !B) return null;
    if (a.rel === b.rel) return PARENT[a.rel] ? 1 : null; // e.g. two maternal aunts are siblings
    let best = null;
    for (const u of Object.keys(A)) {
      if (B[u] === undefined) continue;
      const da = A[u], db = B[u];
      if (da === 0 && db === 0) continue; // partners
      const d = da === 0 || db === 0 ? da + db : SINGLE.has(u) ? da + db : da + db - 1;
      if (best === null || d < best) best = d;
    }
    return best;
  }
  const GEN = { proband: 0, sister: 0, brother: 0, m_halfsib: 0, p_halfsib: 0, m_cousin: 0, p_cousin: 0,
    mother: -1, father: -1, m_aunt: -1, m_uncle: -1, p_aunt: -1, p_uncle: -1,
    m_gm: -2, m_gf: -2, p_gm: -2, p_gf: -2, m_great: -2, p_great: -2, daughter: 1, son: 1, niece: 1, grandchild: 2,
    m_ggp: -3, p_ggp: -3, gniece: 2, m_cousin_child: 1, p_cousin_child: 1 };
  // The app numbers relatives sharing a relationship (window.personLabel); fall back to the plain label.
  const labelOf = p => (window.personLabel ? window.personLabel(p) : REL[p.rel].label);
  const sideOf = p => { const s = REL[p.rel].side; return ['core', 'core2', 'child'].includes(s) ? 'core' : s; };

  /* ---- Cancer helpers ---- */
  const age = d => (d.age === '' || d.age == null ? null : +d.age);
  const lt = (d, n) => age(d) !== null && age(d) < n;
  const le = (d, n) => age(d) !== null && age(d) <= n;
  const anyAge = () => true;
  const is = (d, site, hists) => d.site === site && (!hists || hists.split('|').includes(d.hist));
  const isBreast = d => d.site === 'breast';
  const isMale = p => p.sex === 'M';
  const dxs = p => p.dx.filter(d => d.site && d.hist);
  // Island founder criteria name the tested person's grandparent: certain for the proband and full siblings,
  // "may meet" for other relatives (their grandparents may differ).
  const ISLAND = { westray: 'Westray (Orkney)', whalsay: 'Whalsay (Shetland)' };
  const sharesGrandparents = p => ['proband', 'sister', 'brother'].includes(p.rel);
  const both = d => d.side === 'both';                       // both sides (bilateral)
  const bothOrMulti = d => d.side === 'both' || d.side === 'multi';
  const nTumours = d => (+d.count > 1 ? +d.count : both(d) ? 2 : 1);
  const histText = d => `${SITES[d.site].label}: ${(SITES[d.site].hist.find(h => h[0] === d.hist) || [, d.hist])[1]}${d.site === 'breast' && d.grade ? `, grade ${d.grade}` : ''}${d.site === 'ovary' && d.ovgrade ? `, ${d.ovgrade} grade` : ''}${age(d) !== null ? `, age ${age(d)}` : ''}${d.side === 'both' ? `; both sides${d.age2 !== '' && d.age2 != null ? `, second at ${d.age2}` : ''}` : d.side === 'multi' ? '; multifocal' : ''}${+d.count > 1 && d.site !== 'polyps' ? `; ${d.count} tumours` : ''}`;

  /* ---- Manchester score (combined, BRCA1, BRCA2) for a person being considered for testing ----
   * manchesterDetail records every step (rows counted, pathology adjustments, what was not counted) for the
   * breakdown panel; manchester() returns the totals for the best lineage. */
  const OV_NOT_SCORED = ['mucinous', 'germ', 'fibroma', 'granulosa_a', 'granulosa_j', 'sertoli', 'sctat', 'sccoht'];
  // Points table (Evans 2004/2017, as published by GeNotes): [row id, label, BRCA1, BRCA2].
  const MSS_TABLE = [
    ['fbc30', 'Female breast cancer <30', 6, 5], ['fbc40', 'Female breast cancer 30–39', 4, 4], ['fbc50', 'Female breast cancer 40–49', 3, 3],
    ['fbc60', 'Female breast cancer 50–59', 2, 2], ['fbc99', 'Female breast cancer ≥60', 1, 1],
    ['mbc60', 'Male breast cancer <60', 5, 8], ['mbc99', 'Male breast cancer ≥60', 5, 5],
    ['ov60', 'Ovarian cancer <60', 8, 5], ['ov99', 'Ovarian cancer ≥60', 5, 5],
    ['panc', 'Pancreatic cancer', 0, 1], ['pr60', 'Prostate cancer <60', 0, 2], ['pr99', 'Prostate cancer ≥60', 0, 1]
  ];
  const MSS_ADJ = [
    ['tnbc', 'Breast cancer triple negative', 4], ['her2', 'Breast cancer HER2 positive (not triple negative)', -6],
    ['erpos', 'Breast cancer ER positive (not triple negative)', -1], ['erneg', 'Breast cancer ER negative (not triple negative)', 1],
    ['g1', 'Breast cancer grade 1', -2], ['g3', 'Breast cancer grade 3', 2],
    ['ilc', 'Breast cancer lobular', -2], ['dcis', 'Breast DCIS only', -1], ['hgsc', 'High-grade serous ovarian cancer <60 (no breast cancer)', 2],
    ['adopted', 'Adopted, no known cancer history in blood relatives', 2, 2]
  ];
  const MSS_ROW = Object.fromEntries(MSS_TABLE.map(r => [r[0], r])), MSS_ADJ_ROW = Object.fromEntries(MSS_ADJ.map(r => [r[0], r]));
  function mssRow(p, d) {
    const a = age(d);
    if (isBreast(d) && !isMale(p)) return a < 30 ? 'fbc30' : a < 40 ? 'fbc40' : a < 50 ? 'fbc50' : a < 60 ? 'fbc60' : 'fbc99';
    if (isBreast(d)) return a < 60 ? 'mbc60' : 'mbc99';
    if (d.site === 'ovary' && !OV_NOT_SCORED.includes(d.hist)) return a < 60 ? 'ov60' : 'ov99';
    if (d.site === 'pancreas' && d.hist !== 'pnet') return 'panc';
    if (d.site === 'prostate') return a < 60 ? 'pr60' : 'pr99';
    return null;
  }
  function mssLineage(person, people, s) {
    const rows = [], excluded = [], adj = [];
    let b1 = 0, b2 = 0;
    for (const p of people) {
      const ps = sideOf(p), onSide = ps === 'core' || ps === s;
      for (const d of dxs(p)) {
        const relevant = isBreast(d) || ['ovary', 'pancreas', 'prostate'].includes(d.site);
        if (!onSide) { if (relevant) excluded.push({ p, d, why: ps === 'unknown' ? 'side of the family not known' : 'other side of the family' }); continue; }
        if (!relevant) continue;
        if (age(d) === null) { excluded.push({ p, d, why: 'no age at diagnosis entered' }); continue; }
        const id = mssRow(p, d);
        if (!id) { excluded.push({ p, d, why: d.site === 'ovary' ? 'non-epithelial or mucinous ovarian tumours are not scored' : 'pancreatic neuroendocrine tumours are not scored' }); continue; }
        // Breast cancer in both breasts scores as two primaries, the second at its own age (or the first age if not given).
        const tumours = [{ d, id, second: false }];
        if (isBreast(d) && !isMale(p) && both(d)) {
          const d2 = { ...d, age: d.age2 !== '' && d.age2 != null ? d.age2 : d.age };
          tumours.push({ d: d2, id: mssRow(p, d2), second: true, ageGiven: d.age2 !== '' && d.age2 != null });
        }
        for (const t of tumours) {
          const [, , p1, p2] = MSS_ROW[t.id];
          rows.push({ p, d: t.d, id: t.id, second: t.second, ageGiven: t.ageGiven, b1: p1, b2: p2 });
          b1 += p1; b2 += p2;
        }
      }
    }
    // Pathology adjustment for the tested person's own tumour (BRCA1 score).
    const own = dxs(person);
    const br = own.find(isBreast), ov = own.find(d => d.site === 'ovary');
    if (br) {
      if (PRED.tnbc(br)) adj.push('tnbc');
      else {
        if (br.her2 === 'pos') adj.push('her2');
        if (br.er === 'pos') adj.push('erpos'); else if (br.er === 'neg') adj.push('erneg');
      }
      if (br.hist !== 'dcis' && br.grade === '1') adj.push('g1');
      if (br.hist !== 'dcis' && br.grade === '3') adj.push('g3');
      if (br.hist === 'ilc') adj.push('ilc');
      if (br.hist === 'dcis') adj.push('dcis');
    } else if (ov && ov.hist === 'hgsc' && lt(ov, 60)) adj.push('hgsc');
    if (person.adopted && person.rel === 'proband') adj.push('adopted');
    const adjRows = adj.map(id => ({ id, label: MSS_ADJ_ROW[id][1], b1: MSS_ADJ_ROW[id][2], b2: MSS_ADJ_ROW[id][3] || 0, d: id === 'hgsc' ? ov : id === 'adopted' ? null : br }));
    b1 += adjRows.reduce((t, r) => t + r.b1, 0);
    b2 += adjRows.reduce((t, r) => t + r.b2, 0);
    return { side: s, b1, b2, combined: b1 + b2, rows, adj: adjRows, excluded };
  }
  function manchesterDetail(person, people) {
    const side = sideOf(person);
    const sides = side === 'core' ? ['M', 'P'] : [side];
    const all = sides.map(s => mssLineage(person, people, s));
    const best = all.reduce((a, b) => (b.combined > a.combined ? b : a));
    return { ...best, person, sides: all };
  }
  function manchester(person, people) {
    const d = manchesterDetail(person, people);
    return d.combined > 0 ? { combined: d.combined, b1: d.b1, b2: d.b2 } : { combined: 0, b1: 0, b2: 0 };
  }

  /* ---- Modified Amsterdam criteria (Amsterdam II) ----
   * ≥3 relatives with a Lynch-associated cancer (colorectal, endometrial, small bowel, ureter / renal pelvis);
   * one is a first-degree relative of the other two; ≥2 successive generations; ≥1 diagnosed under 50.
   * Returns the best-matching group and a checklist, for display even when not all criteria are met. */
  const AMS_CANCER = d => is(d, 'colorectal') || is(d, 'uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos') || is(d, 'smallbowel') || is(d, 'urothelial', 'upper');
  function amsterdam(people) {
    setPeople(people);
    const aff = people.filter(p => dxs(p).some(AMS_CANCER));
    const score = g => {
      const gens = [...new Set(g.map(b => GEN[b.rel]).filter(x => x !== undefined))];
      const checks = [
        { label: 'at least three relatives with a Lynch-associated cancer (colorectal, endometrial, small bowel, ureter / renal pelvis)', ok: g.length >= 3 },
        { label: 'one is a first-degree relative of the other two (all on one side of the family)', ok: g.some(a => g.filter(b => b !== a && degree(a, b) === 1).length >= 2) && g.every(a => g.every(b => a === b || degree(a, b) !== null)) },
        { label: 'at least two successive generations affected', ok: gens.some(x => gens.includes(x + 1)) },
        { label: 'at least one diagnosed under 50', ok: g.some(b => dxs(b).some(d => AMS_CANCER(d) && lt(d, 50))) }
      ];
      return { checks, n: checks.filter(c => c.ok).length };
    };
    let best = { members: aff, ...score(aff) };
    // Try each relative as the link person, with their first-degree relatives and anyone else related within two degrees.
    for (const a of aff) {
      const fdr = aff.filter(b => b !== a && degree(a, b) === 1);
      const g = [a, ...fdr, ...aff.filter(b => b !== a && !fdr.includes(b) && fdr.some(f => degree(f, b) === 1))];
      // Keep one lineage: for the link person, try each side separately.
      const lineages = ['M', 'P'].map(sd => g.filter(b => sideOf(b) === 'core' || sideOf(b) === sd));
      for (const lg of [g, ...lineages]) { const sc = score(lg); if (sc.n > best.n || (sc.n === best.n && sc.n === 4 && lg.length < best.members.length)) best = { members: lg, ...sc }; }
    }
    return { met: best.n === 4, affectedCount: aff.length, ...best };
  }
  window.amsterdamCriteria = amsterdam;

  /* ---- Criteria ---- */
  const LYNCH_SITES = d => is(d, 'colorectal') || is(d, 'uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos') ||
    (is(d, 'ovary') && !['mucinous', 'germ', 'fibroma', 'granulosa_a', 'granulosa_j', 'sertoli', 'sctat', 'sccoht'].includes(d.hist)) ||
    is(d, 'urothelial') || is(d, 'biliary', 'cholangio') || is(d, 'smallbowel') || is(d, 'stomach') || is(d, 'oesophagus') ||
    is(d, 'cns', 'hgg') || is(d, 'cervix', 'adeno|gastric') || is(d, 'skin', 'sebaceous') || is(d, 'prostate') || is(d, 'pancreas');
  const CRC_EC = d => is(d, 'colorectal') || is(d, 'uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos');
  const LFS = d => is(d, 'sarcoma', 'rms|osteo|sts|lms|angiosarcoma|mpnst|chondrosarcoma') || is(d, 'adrenal', 'acc') || is(d, 'cns') || isBreast(d);
  const POT1 = d => is(d, 'skin', 'melanoma') || is(d, 'heme', 'cll') || is(d, 'sarcoma', 'angiosarcoma') || is(d, 'cns', 'hgg|lgg');
  const MEN1E = d => is(d, 'parathyroid') || is(d, 'pituitary') || is(d, 'pancreas', 'pnet') || is(d, 'net') || is(d, 'adrenal', 'acc');
  const MEN2 = d => is(d, 'thyroid', 'medullary') || is(d, 'adrenal', 'phaeo') || is(d, 'ppgl') || is(d, 'parathyroid', 'adenoma') || is(d, 'feature', 'cchs');
  const PPGL = d => is(d, 'adrenal', 'phaeo') || is(d, 'ppgl');
  const VHL = d => is(d, 'cns', 'hb') || is(d, 'adrenal', 'phaeo') || is(d, 'ppgl') || is(d, 'kidney', 'ccrcc') || is(d, 'feature', 'renal_cysts|elst|epididymal') || is(d, 'pancreas', 'pnet');
  const RENAL = d => is(d, 'kidney', 'ccrcc|papillary1|fhrcc|chromophobe|sdhrcc|nos');
  const RENAL_SYN = d => is(d, 'cns', 'hb') || PPGL(d) || is(d, 'feature', 'lungcysts|fibrofolliculoma|cutleio') || (is(d, 'feature', 'fibroids') && lt(d, 40)) || is(d, 'meso') || is(d, 'eye', 'uveal');
  const NF1F = d => is(d, 'feature', 'cal|neurofibromas') || is(d, 'cns', 'optic') || is(d, 'sarcoma', 'mpnst');
  const PJS = d => is(d, 'polyps', 'pj') || is(d, 'feature', 'pigment_pj');
  const HAM = d => is(d, 'polyps', 'pj|juvenile|mixed|ganglioneuroma');

  function check(people, ancestry) {
    setPeople(people);
    const out = [];
    const add = (p, test, text, extra = {}) => out.push({ person: p, test, text, ...extra });
    const affected = people.filter(p => dxs(p).length);
    const rel = (a, pred, maxDeg) => people.filter(b => b !== a && degree(a, b) !== null && degree(a, b) <= maxDeg && dxs(b).some(pred));
    const relDx = (a, pred, maxDeg) => people.flatMap(b => b !== a && degree(a, b) !== null && degree(a, b) <= maxDeg ? dxs(b).filter(pred).map(d => ({ p: b, d })) : []);

    for (const p of affected) {
      const D = dxs(p);
      const has = pred => D.some(pred);
      const ms = () => manchester(p, people);

      /* R208 – breast or high-grade ovarian cancer */
      // Breast cancer for R208 includes high-grade DCIS only; high-grade ovarian includes endometrioid / unknown type graded high.
      const brd = D.filter(d => isBreast(d) && !(d.hist === 'dcis' && ['1', '2'].includes(d.grade)));
      const hgOv = D.filter(d => is(d, 'ovary', 'hgsc|clearcell') || (is(d, 'ovary', 'endometrioid|nos') && d.ovgrade === 'high'));
      if (brd.length || hgOv.length) {
        const r = [];
        brd.forEach(d => {
          if (lt(d, 40)) r.push(`breast cancer under 40 (${histText(d)})`);
          if (both(d) && lt(d, 60)) r.push(`bilateral breast cancer under 60 (${histText(d)})`);
          if (PRED.tnbc(d) && lt(d, 60)) r.push(`triple-negative breast cancer under 60 (${histText(d)})`);
          if (isMale(p)) r.push(`male breast cancer (${histText(d)})`);
          if (lt(d, 45) && relDx(p, x => isBreast(x) && lt(x, 45), 1).length) r.push('breast cancer under 45 with a first-degree relative with breast cancer under 45');
        });
        const m = ms();
        if (m.combined >= 15 || m.b1 >= 10 || m.b2 >= 10) r.push(`Manchester score ${m.combined} (BRCA1 ${m.b1}, BRCA2 ${m.b2}; threshold 15 combined or 10 single gene)`);
        if (ancestry === 'ashkenazi') r.push('Ashkenazi Jewish ancestry');
        if (ISLAND[ancestry] && brd.length && sharesGrandparents(p)) r.push(`grandparent from ${ISLAND[ancestry]} and breast cancer`);
        if (brd.some(d => d.hist === 'dcis' && !d.grade) && r.length) r.push('note: DCIS counts only if high grade');
        if (r.length) add(p, 'R208', r, { manchester: m });
        else if (ISLAND[ancestry] && brd.length) add(p, 'R208', [`breast cancer – qualifies if this relative has a grandparent from ${ISLAND[ancestry]}`], { possible: true });
      }
      /* R207 – high-grade non-mucinous epithelial ovarian cancer at any age */
      // High grade: HGSC and clear cell always; endometrioid / unknown type when graded high ("may meet" if grade not known).
      const ovHi = D.filter(d => is(d, 'ovary', 'hgsc|clearcell') || (is(d, 'ovary', 'endometrioid|nos') && d.ovgrade === 'high'));
      const ovUnk = D.filter(d => is(d, 'ovary', 'endometrioid|nos') && !d.ovgrade);
      const ov = [...ovHi, ...ovUnk];
      if (ovHi.length) add(p, 'R207', ovHi.map(d => `high-grade non-mucinous epithelial ovarian cancer (${histText(d)})`));
      else if (ovUnk.length) add(p, 'R207', ovUnk.map(d => `epithelial ovarian cancer – qualifies if high grade (${histText(d)})`), { possible: true });
      const eoc = d => is(d, 'ovary', 'hgsc|lgsc|endometrioid|clearcell|nos');
      if (has(eoc) && !ovHi.length && (rel(p, eoc, 1).length || rel(p, eoc, 3).filter(b => degree(p, b) >= 2).length >= 2))
        add(p, 'R207', ['epithelial ovarian cancer with a first-degree relative (or ≥2 second/third-degree relatives) with epithelial ovarian cancer']);
      else if (has(eoc) && !ovHi.length && rel(p, eoc, 2).some(b => degree(p, b) === 2))
        add(p, 'R207', ['epithelial ovarian cancer with a second-degree relative with epithelial ovarian cancer – qualifies if the intervening relative has no ovaries or is deceased'], { possible: true });

      /* R210 – Lynch syndrome */
      const r210g = [], r210t = [];
      D.filter(LYNCH_SITES).forEach(d => {
        if (['msh2', 'msh6', 'pms2'].includes(d.mmr)) r210g.push(`MMR-deficient tumour (${histText(d)}; ${d.mmr.toUpperCase()} loss)`);
        else if (d.mmr === 'mlh1' && d.meth === 'no' && (d.site !== 'colorectal' || d.braf === 'no')) r210g.push(`MLH1-deficient tumour without MLH1 promoter methylation${d.site === 'colorectal' ? ' or BRAF V600E' : ''} (${histText(d)})`);
        else if (d.mmr === 'mlh1') r210t.push(`MLH1 loss – complete ${d.site === 'colorectal' ? 'BRAF / ' : ''}MLH1 methylation testing (${histText(d)})`);
        else if (d.mmr === 'msi') r210t.push(`MSI-high – needs IHC (${histText(d)})`);
        else if (!d.mmr && lt(d, 50) && !['pancreas', 'prostate', 'stomach'].includes(d.site)) r210t.push(`Lynch-related cancer under 50 – tumour MMR/MSI testing (${histText(d)})`);
      });
      if (D.filter(LYNCH_SITES).length >= 2 && D.some(CRC_EC) && !D.some(d => d.mmr)) r210t.push('two Lynch-related cancers (one colorectal or endometrial) – tumour MMR/MSI testing');
      if (D.some(LYNCH_SITES)) {
        const fam1 = relDx(p, LYNCH_SITES, 1);
        const lyn = D.filter(LYNCH_SITES);
        const anyCrcEc = [...lyn, ...fam1.map(x => x.d)].some(CRC_EC);
        if (anyCrcEc && lyn.some(d => le(d, 60)) && fam1.some(x => le(x.d, 60)) && !D.some(d => d.mmr)) r210t.push('Lynch-related cancer with a first-degree relative, both 60 or under – tumour MMR/MSI testing');
      }
      if (D.some(LYNCH_SITES) && !D.some(d => d.mmr)) {
        const r3 = relDx(p, LYNCH_SITES, 3), all = [...D.filter(LYNCH_SITES), ...r3.map(x => x.d)];
        if (all.some(CRC_EC)) {
          if (new Set(r3.filter(x => le(x.d, 75)).map(x => x.p)).size >= 2 && D.some(d => LYNCH_SITES(d) && le(d, 75))) r210t.push('Lynch-related cancer with ≥2 relatives (up to third-degree) with Lynch-related cancer, all 75 or under – tumour MMR/MSI testing');
          if (new Set(r3.map(x => x.p)).size >= 3) r210t.push('Lynch-related cancer with ≥3 relatives (up to third-degree) with Lynch-related cancer – tumour MMR/MSI testing');
        }
      }
      if (r210g.length) add(p, 'R210', r210g);
      if (r210t.length && !r210g.length) add(p, 'R210', r210t, { tumourFirst: true });

      /* R211 – polyposis and early-onset colorectal cancer */
      const r211 = [], r211maybe = [];
      D.forEach(d => {
        if ((CRC_EC(d) || is(d, 'smallbowel')) && lt(d, 40)) r211.push(`${SITES[d.site].label.split(' ')[0].toLowerCase()} cancer under 40 (${histText(d)})`);
        if (is(d, 'polyps', 'adenoma')) {
          const n = +d.count || 0, a = age(d);
          if (n >= 5 && has(x => is(x, 'colorectal'))) r211.push(`≥5 adenomas with colorectal cancer (${n})`);
          if (n >= 5 && a !== null && a < 40) r211.push(`≥5 adenomas under 40 (${n} at ${a})`);
          if (n >= 10 && a !== null && a < 60) r211.push(`≥10 adenomas under 60 (${n} at ${a})`);
          if (n >= 20 && a !== null && a >= 60) r211.push(`≥20 adenomas at 60 or over (${n} at ${a})`);
          if (n >= 5 && a !== null && a < 60 && (relDx(p, x => is(x, 'polyps', 'adenoma') && +x.count >= 5, 1).length || relDx(p, x => is(x, 'colorectal') && lt(x, 60), 1).length)) r211.push('≥5 adenomas under 60 with a first-degree relative with ≥5 adenomas or colorectal cancer under 60');
        }
        // Serrated polyposis syndrome (WHO clinical criteria) – qualifies if under 50, an FDR has SPS, or dysplasia in any polyp.
        if (is(d, 'polyps', 'sps')) {
          const a = age(d);
          if (a !== null && a < 50) r211.push(`serrated polyposis syndrome under 50 (age ${a})`);
          else if (relDx(p, x => is(x, 'polyps', 'sps'), 1).length) r211.push('serrated polyposis syndrome with a first-degree relative with serrated polyposis syndrome');
          else r211maybe.push(`serrated polyposis syndrome${a !== null ? ` at ${a}` : ''} – qualifies if there is dysplasia in any polyp`);
        }
        if (is(d, 'polyps', 'serrated') && +d.count >= 5 && !has(x => is(x, 'polyps', 'sps'))) {
          const a = age(d), why = a !== null && a < 50 ? 'under 50' : relDx(p, x => is(x, 'polyps', 'sps'), 1).length ? 'with a first-degree relative with serrated polyposis syndrome' : 'with dysplasia in any polyp';
          r211maybe.push(`${d.count} serrated polyps${a !== null ? ` at ${a}` : ''} – qualifies if they meet the WHO criteria for serrated polyposis syndrome (≥5 proximal to the rectum all ≥5 mm with ≥2 ≥10 mm, or >20 throughout with ≥5 proximal), ${why}`);
        }
        if (HAM(d)) {
          const n = +d.count || 0;
          if (n >= 2) r211.push(`≥2 hamartomatous polyps (${n})`);
          else if (relDx(p, HAM, 2).length) r211.push('hamartomatous polyp with a first- or second-degree relative with a hamartomatous polyp');
        }
      });
      if (has(CRC_EC)) {
        const sibs = relDx(p, CRC_EC, 1).filter(x => GEN[x.p.rel] === GEN[p.rel] && x.p.rel !== 'daughter' && x.p.rel !== 'son');
        if (new Set(sibs.map(x => x.p)).size >= 2 && sibs.some(x => lt(x.d, 50))) r211.push('colorectal/endometrial cancer with ≥2 siblings with colorectal/endometrial cancer (one under 50)');
      }
      if (r211.length) add(p, 'R211', [...new Set(r211)]);
      else if (r211maybe.length) add(p, 'R211', [...new Set(r211maybe)], { possible: true });

      /* R430 – prostate */
      D.filter(d => is(d, 'prostate')).forEach(d => {
        const r = [];
        if (lt(d, 50)) r.push(`prostate cancer under 50 (${histText(d)})`);
        if (d.hist === 'highrisk' && lt(d, 60)) r.push(`metastatic prostate cancer under 60 – qualifies if metastatic (${histText(d)})`);
        if (ancestry === 'ashkenazi') r.push('Ashkenazi Jewish ancestry');
        if (ancestry === 'whalsay' && sharesGrandparents(p)) r.push('grandparent from Whalsay (Shetland) and prostate cancer');
        if (r.length) add(p, 'R430', r);
        else if (ancestry === 'whalsay') add(p, 'R430', ['prostate cancer – qualifies if this relative has a grandparent from Whalsay (Shetland)'], { possible: true });
        const famBOP = relDx(p, x => isBreast(x) || is(x, 'ovary') || is(x, 'pancreas'), 3).length;
        const m = ms();
        if (famBOP && m.combined >= 15) add(p, 'R208', [`prostate cancer with a family history of breast/ovarian/pancreatic cancer and Manchester score ${m.combined}`], { manchester: m });
      });

      /* R367 – pancreatic */
      D.filter(d => is(d, 'pancreas', 'pdac|acinar|nos')).forEach(d => {
        const r = [];
        if (lt(d, 60)) r.push(`pancreatic cancer under 60 (${histText(d)})`);
        if (lt(d, 70)) {
          if (D.some(x => (isBreast(x) && lt(x, 60)) || (is(x, 'skin', 'melanoma') && lt(x, 60)) || is(x, 'ovary'))) r.push('pancreatic cancer under 70 with own breast/melanoma under 60 or ovarian cancer');
          if (relDx(p, x => is(x, 'pancreas') && lt(x, 60), 2).length) r.push('pancreatic cancer under 70 with a first/second-degree relative with pancreatic cancer under 60');
          const fam = relDx(p, x => (isBreast(x) && lt(x, 60)) || (is(x, 'skin', 'melanoma') && lt(x, 60)) || is(x, 'ovary'), 2);
          if (new Set(fam.map(x => x.p)).size >= 2) r.push('pancreatic cancer under 70 with ≥2 first/second-degree relatives with breast/melanoma under 60 or ovarian cancer');
          if (new Set(relDx(p, x => is(x, 'pancreas'), 2).map(x => x.p)).size >= 2) r.push('pancreatic cancer under 70 with ≥2 first/second-degree relatives with pancreatic cancer');
        }
        if (r.length) add(p, 'R367', r);
        const m = ms();
        if (relDx(p, x => isBreast(x) || is(x, 'ovary', 'hgsc') || is(x, 'prostate'), 3).length && m.combined >= 15) add(p, 'R208', [`pancreatic cancer with a family history of breast/ovarian/prostate cancer and Manchester score ${m.combined}`], { manchester: m });
      });

      /* R216 – Li–Fraumeni (TP53) and POT1 */
      const r216 = [];
      D.forEach(d => {
        if (is(d, 'sarcoma', 'rms') && le(d, 5)) r216.push(`rhabdomyosarcoma at 5 or under (${histText(d)})`);
        if (is(d, 'adrenal', 'acc')) r216.push(`adrenocortical carcinoma (${histText(d)})`);
        if (is(d, 'cns', 'cpc')) r216.push(`choroid plexus carcinoma (${histText(d)})`);
        if (isBreast(d) && le(d, 30)) r216.push(`breast cancer at 30 or under (${histText(d)})`);
        if (isBreast(d) && d.her2 === 'pos' && le(d, 35)) r216.push(`HER2-positive breast cancer at 35 or under (${histText(d)})`);
        if (is(d, 'heme', 'all_hypo') && lt(d, 18)) r216.push(`hypodiploid ALL under 18 (${histText(d)})`);
        if (is(d, 'cns', 'medullo_shh') && lt(d, 18)) r216.push(`SHH medulloblastoma under 18 (${histText(d)})`);
      });
      const lfsOwn = D.filter(LFS);
      if (lfsOwn.filter(d => le(d, 46)).length >= 2 && !lfsOwn.every(isBreast)) r216.push('two LFS-related cancers, both at 46 or under');
      for (const d of lfsOwn) for (const x of relDx(p, LFS, 2))
        if (!(isBreast(d) && isBreast(x.d)) && ((le(d, 46) && le(x.d, 56)) || (le(x.d, 46) && le(d, 56)))) { r216.push(`LFS-related cancer with a first/second-degree relative with an LFS-related cancer (${labelOf(x.p)})`); break; }
      if (D.some(d => is(d, 'sarcoma') && le(d, 45))) {
        const f1 = relDx(p, d => le(d, 45), 1);
        if (f1.length && relDx(p, d => le(d, 45) || is(d, 'sarcoma'), 2).filter(x => x.p !== f1[0].p).length) r216.push('classic LFS pattern: sarcoma at 45 or under, a first-degree relative with cancer at 45 or under, and another relative with cancer at 45 or under or sarcoma');
      }
      const pot = D.filter(POT1);
      if (pot.length >= 2 && !pot.every(d => is(d, 'skin', 'melanoma'))) r216.push('two POT1-associated cancers (POT1)');
      else if (pot.length && relDx(p, POT1, 2).some(x => !(is(x.d, 'skin', 'melanoma') && pot.every(d => is(d, 'skin', 'melanoma'))))) r216.push('POT1-associated cancer with a first/second-degree relative with one (POT1)');
      if (r216.length) add(p, 'R216', [...new Set(r216)]);
      else {
        const q = [];
        D.forEach(d => {
          if (is(d, 'sarcoma', 'osteo') && lt(d, 18)) q.push(`osteosarcoma under 18 – qualifies if jaw osteosarcoma (${histText(d)})`);
          if ((is(d, 'sarcoma', 'rms') || is(d, 'cervix', 'erms')) && !le(d, 5)) q.push(`rhabdomyosarcoma – qualifies if embryonal anaplastic subtype (${histText(d)})`);
        });
        if (q.length) add(p, 'R216', q, { possible: true });
      }

      /* R217 – endocrine neoplasia (MEN1, FIPA) and R218 – MEN2 */
      const r217 = [], men1 = D.filter(MEN1E);
      D.forEach(d => {
        if (is(d, 'pituitary') && lt(d, 20)) r217.push(`pituitary adenoma under 20 (${histText(d)})`);
        else if (is(d, 'pituitary') && lt(d, 30)) r217.push(`pituitary adenoma under 30 – qualifies if macroadenoma (${histText(d)})`);
        if (is(d, 'parathyroid', 'adenoma') && lt(d, 35) && d.side === 'multi') r217.push(`multiglandular parathyroid disease under 35 (${histText(d)})`);
      });
      if (new Set(men1.map(d => d.site)).size >= 2) r217.push('two or more MEN1-related endocrine abnormalities');
      if (men1.length && (D.some(d => is(d, 'cns', 'meningioma')) || D.some(d => is(d, 'feature', 'tsc_skin')))) r217.push('MEN1-related endocrine abnormality with a non-endocrine MEN1 tumour');
      if (men1.length && relDx(p, MEN1E, 1).length) r217.push('MEN1-related endocrine abnormality with a first-degree relative with one');
      if (D.some(d => is(d, 'pituitary') && lt(d, 35)) && relDx(p, x => is(x, 'pituitary'), 1).length) r217.push('isolated pituitary adenoma under 35 with a first-degree relative with a pituitary adenoma (FIPA)');
      if (r217.length) add(p, 'R217', [...new Set(r217)]);
      const r218 = [], m2 = D.filter(MEN2);
      if (D.some(d => is(d, 'thyroid', 'medullary'))) r218.push('medullary thyroid carcinoma');
      if (new Set(m2.map(d => d.site + d.hist)).size >= 2) r218.push('two or more MEN2-related abnormalities');
      if (m2.length && relDx(p, MEN2, 1).length) r218.push('MEN2-related abnormality with a first-degree relative with one');
      if (r218.length) add(p, 'R218', r218);

      /* R223 – PPGL, R224 – renal, R225 – VHL */
      const r223 = [];
      D.forEach(d => {
        if (is(d, 'adrenal', 'phaeo') && lt(d, 60)) r223.push(`phaeochromocytoma under 60 (${histText(d)})`);
        if (is(d, 'ppgl')) r223.push(`paraganglioma (${histText(d)})`);
        if (is(d, 'adrenal', 'phaeo') && both(d)) r223.push('bilateral phaeochromocytoma');
      });
      if (D.some(d => is(d, 'adrenal', 'phaeo')) && D.some(RENAL)) r223.push('phaeochromocytoma and renal cell cancer');
      if (D.some(PPGL) && relDx(p, x => PPGL(x) || is(x, 'sarcoma', 'gist'), 3).length) r223.push('PPGL with a relative with PPGL or GIST');
      if (r223.length) add(p, 'R223', [...new Set(r223)]);
      const r224 = [];
      D.filter(RENAL).forEach(d => {
        if (le(d, 46)) r224.push(`renal cancer at 46 or under (${histText(d)})`);
        if (['fhrcc', 'sdhrcc'].includes(d.hist)) r224.push(`FH- or SDH-deficient renal cancer (${histText(d)})`);
        if (bothOrMulti(d)) r224.push(`${both(d) ? 'bilateral' : 'multifocal'} renal cancer`);
        if (relDx(p, x => RENAL(x) && lt(x, 60) && lt(d, 60), 1).length || relDx(p, x => RENAL(x) && lt(x, 50) && lt(d, 50), 2).filter(x => degree(p, x.p) === 2).length) r224.push('renal cancer with a first-degree relative (both under 60) or second-degree relative (both under 50) with renal cancer');
        if (D.some(RENAL_SYN)) r224.push('renal cancer with a syndromic feature');
      });
      if (r224.length) add(p, 'R224', [...new Set(r224)]);
      const r225 = [];
      D.forEach(d => {
        if ((is(d, 'cns', 'hb') && lt(d, 60)) || (is(d, 'feature', 'elst') && lt(d, 40))) r225.push(`${is(d, 'cns', 'hb') ? 'haemangioblastoma under 60' : 'endolymphatic sac tumour under 40'} (${histText(d)})`);
      });
      if (D.filter(VHL).length >= 2 && new Set(D.filter(VHL).map(d => d.site + d.hist)).size >= 2) r225.push('two or more VHL-related tumours');
      if (D.some(VHL) && relDx(p, VHL, 1).length && [...D, ...relDx(p, VHL, 1).map(x => x.d)].some(d => is(d, 'cns', 'hb'))) r225.push('VHL-related tumour with a first-degree relative with one (one a haemangioblastoma)');
      if (r225.length) add(p, 'R225', [...new Set(r225)]);

      /* R212 PJS, R213 PTEN, R214 Gorlin, R215 HDGC, R219 RB, R221 NF2/schwannomatosis, R222 NF1 */
      const r212 = [];
      D.forEach(d => { if (is(d, 'polyps', 'pj') && +d.count >= 2) r212.push(`≥2 Peutz–Jeghers polyps (${d.count})`); if (is(d, 'ovary', 'sctat') || is(d, 'cervix', 'gastric')) r212.push(`SCTAT or adenoma malignum (${histText(d)})`); });
      if (D.some(d => is(d, 'polyps', 'pj')) && D.some(d => is(d, 'feature', 'pigment_pj'))) r212.push('Peutz–Jeghers polyp with characteristic pigmentation');
      if (D.some(d => is(d, 'feature', 'pigment_pj') && lt(d, 10))) r212.push('characteristic pigmentation under 10');
      if (D.some(PJS) && relDx(p, PJS, 2).length) r212.push('PJS polyp or pigmentation with a first/second-degree relative with a PJS feature');
      if (r212.length) add(p, 'R212', [...new Set(r212)]);
      const r213 = [];
      if (D.some(d => is(d, 'feature', 'lld') && (age(d) === null || age(d) >= 18))) r213.push('adult Lhermitte–Duclos disease');
      if (D.some(d => is(d, 'feature', 'macrocephaly')) && D.some(d => isBreast(d) || is(d, 'thyroid', 'papillary|follicular|cmv') || is(d, 'uterus', 'endometrioid|serous|clearcell|nos'))) r213.push('macrocephaly with a major criterion (breast, non-medullary thyroid or endometrial cancer)');
      if (D.some(d => is(d, 'feature', 'macrocephaly')) && D.some(d => is(d, 'feature', 'trichilemmoma'))) r213.push('macrocephaly with mucocutaneous lesions – check the full criteria');
      if (r213.length) add(p, 'R213', r213);
      const gor = D.filter(d => is(d, 'feature', 'falx|okc|palmarpits') || is(d, 'cns', 'medullo_shh'));
      if (gor.length) add(p, 'R214', gor.map(d => `major Gorlin criterion: ${histText(d)}`));
      const r215 = [], dgc = D.filter(d => is(d, 'stomach', 'diffuse')), ilc = D.filter(d => is(d, 'breast', 'ilc'));
      dgc.forEach(d => { if (lt(d, 50)) r215.push(`diffuse gastric cancer under 50 (${histText(d)})`); });
      if (dgc.length && ancestry === 'maori') r215.push('diffuse gastric cancer – Māori ethnicity');
      if (dgc.length && D.some(d => is(d, 'feature', 'cleft'))) r215.push('diffuse gastric cancer with cleft lip/palate');
      if (dgc.some(d => lt(d, 70)) && ilc.some(d => lt(d, 70))) r215.push('diffuse gastric cancer and lobular breast cancer, both under 70');
      // Name the relative and both ages, so it is clear which cancer the "under 70" applies to.
      const who = x => `${labelOf(x.p)}, ${age(x.d) === null ? 'age not given' : 'age ' + age(x.d)}`;
      const own = dgc.length ? `diffuse gastric cancer ${age(dgc[0]) === null ? '(age not given)' : 'at ' + age(dgc[0])} – any age counts –` : '';
      const relDgc = relDx(p, x => is(x, 'stomach', 'diffuse'), 2), relIlc = relDx(p, x => is(x, 'breast', 'ilc') && lt(x, 70), 2);
      if (dgc.length && relDgc.length) r215.push(`${own} with a first/second-degree relative with diffuse gastric cancer at any age (${relDgc.map(who).join('; ')})`);
      if (dgc.length && relIlc.length) r215.push(`${own} with a first/second-degree relative with lobular breast cancer under 70 (${relIlc.map(who).join('; ')})`);
      const relDgc70 = relDx(p, x => is(x, 'stomach', 'diffuse') && lt(x, 70), 2);
      if (ilc.length && relDgc70.length) r215.push(`lobular breast cancer with a first/second-degree relative with diffuse gastric cancer under 70 (${relDgc70.map(who).join('; ')})`);
      if (ilc.some(d => both(d) && lt(d, 70))) r215.push('bilateral lobular breast cancer under 70');
      if (ilc.some(d => lt(d, 50)) && relDx(p, x => is(x, 'breast', 'ilc') && lt(x, 50), 2).length) r215.push('two lobular breast cancers under 50 in the family');
      if (r215.length) add(p, 'R215', [...new Set(r215)]);
      if (D.some(d => is(d, 'eye', 'rb'))) add(p, 'R219', ['retinoblastoma']);
      const r221 = [];
      D.forEach(d => {
        if (is(d, 'cns', 'vs') && both(d)) r221.push('bilateral vestibular schwannoma');
        if (is(d, 'cns', 'schwannoma') && lt(d, 30)) r221.push(`schwannoma under 30 (${histText(d)})`);
        if (is(d, 'cns', 'meningioma') && lt(d, 20)) r221.push(`meningioma under 20 (${histText(d)})`);
        if (is(d, 'cns', 'meningioma_cc')) r221.push('clear cell meningioma');
      });
      if (D.some(d => is(d, 'cns', 'vs')) && D.some(d => is(d, 'cns', 'schwannoma'))) r221.push('vestibular schwannoma with a non-vestibular schwannoma');
      if (D.some(d => is(d, 'cns', 'meningioma|meningioma_cc')) && D.some(d => is(d, 'cns', 'vs|schwannoma'))) r221.push('meningioma with a schwannoma');
      if (r221.length) add(p, 'R221', [...new Set(r221)]);
      const nf = new Set(D.filter(NF1F).map(d => d.site + d.hist));
      if (nf.size >= 2 || (nf.size === 1 && relDx(p, NF1F, 1).length)) add(p, 'R222', ['clinical NF1 criteria likely met – testing if a molecular diagnosis is needed for management or reproduction']);

      /* Further solid tumour, childhood and haematological tests. Each collects criteria met now (`met`) and
       * criteria that fit but depend on something not recorded here (`maybe`, shown as "may meet – check …"). */
      const crit = (test, met, maybe) => {
        if (met.length) add(p, test, [...new Set(met)]);
        else if (maybe.length) add(p, test, [...new Set(maybe)], { possible: true });
      };
      const count = (pred) => D.filter(pred).reduce((n, d) => n + nTumours(d), 0);
      const people1 = (pred, maxDeg) => new Set(relDx(p, pred, maxDeg).map(x => x.p));

      /* R414 – APC-associated polyposis (children / young adults before colonoscopy; GAPPS at any age) */
      {
        const met = [], maybe = [];
        const apcF = d => is(d, 'feature', 'chrpe|osteomas|gapps') || is(d, 'sarcoma', 'desmoid') || is(d, 'thyroid', 'cmv') || is(d, 'liver', 'hepatoblastoma') || is(d, 'cns', 'medullo_wnt');
        D.forEach(d => {
          if (is(d, 'feature', 'chrpe')) (bothOrMulti(d) ? met : maybe).push(bothOrMulti(d) ? 'multifocal or bilateral CHRPE' : 'CHRPE – check multifocal or bilateral, assessed by an experienced ophthalmologist');
          if (is(d, 'sarcoma', 'desmoid')) met.push(`desmoid tumour (CTNNB1 wild-type where tested) (${histText(d)})`);
          if (is(d, 'thyroid', 'cmv')) met.push(`cribriform-morular variant papillary thyroid cancer (${histText(d)})`);
          if (is(d, 'liver', 'hepatoblastoma')) met.push(`hepatoblastoma (${histText(d)})`);
          if (is(d, 'feature', 'osteomas')) met.push('multiple osteomas of the skull and mandible or dental abnormalities');
          if (is(d, 'feature', 'gapps')) met.push('gastric polyposis – qualifies if GAPPS criteria met (any age)');
          if (is(d, 'cns', 'medullo_wnt|medullo_nos')) maybe.push(`medulloblastoma – qualifies if classic type (${histText(d)})`);
        });
        const pilo = D.filter(d => is(d, 'feature', 'pilomatrixoma'));
        if (pilo.length) {
          const n = count(d => is(d, 'feature', 'pilomatrixoma'));
          if (n >= 6) met.push(`≥6 pilomatrixomas (${n})`);
          else if (n >= 2 && pilo.some(d => lt(d, 20))) met.push('≥2 pilomatrixomas under 20');
          else if (D.some(apcF)) met.push('pilomatrixoma with another APC-associated feature');
          else maybe.push('pilomatrixoma – qualifies if it has features of an epidermoid cyst (and no syndromic alternative)');
        }
        crit('R414', met, maybe);
      }

      /* R254 – familial melanoma */
      {
        const met = [], maybe = [];
        const mel = d => is(d, 'skin', 'melanoma');
        const M = D.filter(mel);
        if (M.length) {
          const n = count(mel), nU30 = count(d => mel(d) && lt(d, 30));
          if (M.some(d => lt(d, 18))) met.push('melanoma under 18');
          if (nU30 >= 2) met.push('≥2 melanomas (or in situ) under 30');
          if (M.some(d => lt(d, 30)) && relDx(p, d => mel(d) && lt(d, 30), 2).length) met.push('melanoma under 30 with a first/second-degree relative with melanoma under 30');
          if (n >= 3) met.push(`≥3 melanomas (or in situ) (${n})`);
          const fam = relDx(p, mel, 2).reduce((k, x) => k + nTumours(x.d), 0);
          if (n < 3 && n + fam >= 3) met.push(`${n + fam} melanomas across the patient and first/second-degree relatives`);
          const panc1 = relDx(p, d => is(d, 'pancreas', 'pdac|acinar|nos') && lt(d, 60), 1).length;
          if (n >= 2 && panc1) met.push('≥2 melanomas with a first-degree relative with pancreatic cancer under 60');
          else if (panc1) maybe.push('melanoma with a first-degree relative with pancreatic cancer under 60 – qualifies if atypical moles');
        }
        crit('R254', met, maybe);
      }

      /* R422 – BAP1 tumour predisposition */
      {
        const met = [], maybe = [];
        const core = d => is(d, 'eye', 'uveal') || is(d, 'skin', 'melanoma') || RENAL(d) || is(d, 'meso') || is(d, 'feature', 'bimt');
        const assoc = d => core(d) || is(d, 'skin', 'bcc') || is(d, 'cns', 'meningioma|meningioma_cc') || is(d, 'biliary', 'cholangio') || is(d, 'liver', 'hcc');
        const cm = d => is(d, 'skin', 'melanoma');
        const C = D.filter(core);
        if (C.length >= 2 && !C.every(cm)) met.push('two or more core BAP1 tumours (not two melanomas)');
        if (count(d => is(d, 'feature', 'bimt')) >= 2) met.push('two or more BAP1-inactivated melanocytic tumours');
        const A = D.filter(assoc);
        if (A.length && relDx(p, core, 1).some(x => !A.every(d => (cm(d) && cm(x.d)) || (RENAL(d) && RENAL(x.d))))) met.push('BAP1-associated tumour with a first-degree relative with a core BAP1 tumour');
        D.forEach(d => {
          if (is(d, 'meso') && lt(d, 60)) maybe.push(`mesothelioma under 60 – qualifies if no asbestos exposure (${histText(d)})`);
          if (is(d, 'eye', 'uveal') && lt(d, 40)) met.push(`uveal melanoma under 40 (${histText(d)})`);
        });
        crit('R422', met, maybe);
      }

      /* R363 – GIST */
      {
        const met = [];
        D.filter(d => is(d, 'sarcoma', 'gist')).forEach(d => {
          if (lt(d, 50)) met.push(`GIST under 50 (${histText(d)})`);
          if (relDx(p, x => is(x, 'sarcoma', 'gist') || PPGL(x), 3).length) met.push('GIST with a relative (up to third-degree) with GIST or phaeochromocytoma/paraganglioma');
        });
        crit('R363', met, []);
      }

      /* R364 – DICER1 */
      {
        const met = [], maybe = [];
        D.forEach(d => {
          if (is(d, 'lung', 'ppb') || is(d, 'cervix', 'erms') || is(d, 'kidney', 'cystic_nephroma') || is(d, 'ovary', 'sertoli') ||
            is(d, 'cns', 'pineoblastoma') || is(d, 'pituitary', 'blastoma') || is(d, 'feature', 'dicer1_rare') ||
            (is(d, 'feature', 'lungcysts') && lt(d, 18)) || (is(d, 'thyroid', 'mng|papillary|follicular') && lt(d, 18))) met.push(`DICER1-associated diagnosis (${histText(d)})`);
          if (is(d, 'sarcoma', 'rms')) maybe.push(`rhabdomyosarcoma – qualifies if embryonal and thoracic, uterine, cervical or ovarian (${histText(d)})`);
        });
        // Two of the minor diagnoses, in one person or across two affected first-degree relatives.
        const minor = [['lung cysts (adult)', d => is(d, 'feature', 'lungcysts') && !lt(d, 18)], ['Wilms tumour', d => is(d, 'kidney', 'wilms')],
          ['multinodular goitre or differentiated thyroid cancer', d => is(d, 'thyroid', 'mng|papillary|follicular')], ['rhabdomyosarcoma', d => is(d, 'sarcoma', 'rms')],
          ['macrocephaly', d => is(d, 'feature', 'macrocephaly')]];
        const own = minor.filter(([, f]) => D.some(f));
        if (own.length >= 2) met.push(`two DICER1-associated diagnoses: ${own.map(m => m[0]).join(' and ')}`);
        else if (own.length === 1) {
          const other = minor.find(([lab, f]) => lab !== own[0][0] && relDx(p, f, 1).length);
          if (other) met.push(`${own[0][0]} with a first-degree relative with ${other[0]}`);
        }
        crit('R364', met, maybe);
      }

      /* R365 – fumarate hydratase (HLRCC) */
      {
        const met = [], maybe = [];
        const cut = d => is(d, 'feature', 'cutleio'), fib = d => is(d, 'feature', 'fibroids'), ren = d => d.site === 'kidney' && d.hist !== 'wilms';
        if (D.some(d => is(d, 'kidney', 'fhrcc'))) met.push('type 2 papillary / HLRCC-associated or tubulo-papillary renal cancer');
        if (D.some(cut) && D.some(ren)) met.push('cutaneous leiomyomata and a renal tumour');
        else if (D.some(fib) && (D.some(cut) || D.some(ren))) maybe.push('uterine leiomyomata with cutaneous leiomyomata or a renal tumour – qualifies if classic histological features or FH deficiency');
        if (D.some(cut)) {
          if (relDx(p, ren, 3).length) met.push('cutaneous leiomyomata with a relative (up to third-degree) with a renal tumour');
          if (people1(cut, 3).size >= 2) met.push('cutaneous leiomyomata with two relatives with cutaneous leiomyomata');
          else if (people1(d => cut(d) || (fib(d) && lt(d, 40)), 3).size >= 2) maybe.push('cutaneous leiomyomata with two relatives with leiomyomata – qualifies if the uterine ones have classic features');
          if (count(cut) >= 2) met.push('multiple cutaneous leiomyomata');
          else maybe.push('cutaneous leiomyoma – qualifies if multiple (histologically confirmed)');
        }
        if (D.some(d => fib(d) && lt(d, 40))) maybe.push('uterine leiomyomata under 40 – qualifies if classic histological features');
        crit('R365', met, maybe);
      }

      /* R226 – parathyroid carcinoma */
      if (D.some(d => is(d, 'parathyroid', 'carcinoma'))) add(p, 'R226', ['parathyroid carcinoma']);

      /* R456 – embryonal tumour and R457 – sarcoma of possible germline origin (living individuals) */
      if (!p.deceased) {
        const met = [], maybe = [];
        D.filter(d => is(d, 'kidney', 'wilms')).forEach(d => {
          const r = [];
          if (lt(d, 2)) r.push('under 2');
          if (bothOrMulti(d)) r.push(both(d) ? 'bilateral' : 'multifocal');
          if (relDx(p, x => is(x, 'kidney', 'wilms'), 9).length) r.push('family history of Wilms tumour');
          if (D.some(x => is(x, 'feature', 'gu_anom'))) r.push('genital anomaly or gonadoblastoma');
          if (r.length) met.push(`Wilms tumour – ${r.join(', ')}`);
          else maybe.push('Wilms tumour – qualifies with unexplained proteinuria or renal failure, nephrogenic rests or another listed feature');
        });
        D.filter(d => is(d, 'nb')).forEach(d => {
          if (bothOrMulti(d)) met.push('bilateral or multiple neuroblastoma');
          else if (relDx(p, x => is(x, 'nb'), 3).length) met.push('neuroblastoma with a relative (up to third-degree) with neuroblastoma');
          else if (D.some(x => is(x, 'feature', 'cchs')) || relDx(p, x => is(x, 'feature', 'cchs'), 3).length) met.push('neuroblastoma with Hirschsprung disease or congenital hypoventilation in the patient or family');
          else maybe.push('neuroblastoma – qualifies with Hirschsprung disease or congenital hypoventilation in the patient or family');
        });
        D.forEach(d => {
          if (is(d, 'cns', 'medullo_shh') && lt(d, 25)) met.push(`SHH medulloblastoma under 25 (${histText(d)})`);
          if (is(d, 'cns', 'atrt') || is(d, 'ovary', 'sccoht')) met.push(`${is(d, 'cns', 'atrt') ? 'atypical teratoid/rhabdoid tumour' : 'small cell carcinoma of the ovary, hypercalcaemic type'} (${histText(d)})`);
        });
        crit('R456', met, maybe);

        const m7 = [], q7 = [];
        const sarc = d => is(d, 'sarcoma', 'rms|osteo|sts|lms|mpnst|chondrosarcoma|angiosarcoma|mrt') || is(d, 'uterus', 'lms') || is(d, 'cervix', 'erms');
        const chord = d => is(d, 'sarcoma', 'chordoma');
        D.forEach(d => {
          if (is(d, 'sarcoma', 'osteo|lms|chondrosarcoma|angiosarcoma') && lt(d, 25)) m7.push(`translocation-negative sarcoma under 25 (${histText(d)})`);
          else if (sarc(d) && !is(d, 'sarcoma', 'mpnst') && lt(d, 25)) q7.push(`sarcoma under 25 – qualifies if translocation-negative (${histText(d)})`);
          if (is(d, 'sarcoma', 'mpnst') && lt(d, 25)) m7.push(`MPNST under 25 (${histText(d)})`);
          if (chord(d) && lt(d, 25)) m7.push(`chordoma under 25 (${histText(d)})`);
        });
        if (count(sarc) >= 2) m7.push('multiple primary sarcomas');
        if (D.some(sarc) && relDx(p, sarc, 2).length) m7.push('sarcoma with a first/second-degree relative with sarcoma');
        if (count(chord) >= 2) m7.push('multiple chordomas');
        if (D.some(chord) && relDx(p, chord, 2).length) m7.push('chordoma with a first/second-degree relative with chordoma');
        crit('R457', m7, q7);
      }

      /* R347 – inherited AML and R366 – inherited ALL */
      {
        const myel = d => is(d, 'heme', 'aml|mds');
        if (D.some(myel)) {
          const met = [];
          if (D.some(d => is(d, 'feature', 'thrombocytopenia'))) met.push('AML/MDS with a pre-existing platelet disorder');
          if (relDx(p, x => myel(x) || is(x, 'feature', 'bmf'), 3).length) met.push('AML/MDS with a relative (up to third-degree) with AML/MDS, unexplained cytopenia or aplastic anaemia');
          crit('R347', met, ['AML/MDS – qualifies with a pre-existing platelet function disorder']);
        }
        if (D.some(d => is(d, 'heme', 'all|all_hypo'))) {
          const met = [];
          if (relDx(p, x => is(x, 'heme', 'all|all_hypo'), 3).length) met.push('ALL with a relative (up to third-degree) with ALL');
          if (people1(x => is(x, 'heme') || is(x, 'feature', 'thrombocytopenia|bmf'), 3).size >= 2) met.push('ALL with two relatives (up to third-degree) with a myeloid, lymphoid or platelet disorder');
          crit('R366', met, []);
        }
      }
    }

    /* Family-level: modified Amsterdam (R210 germline for the affected relatives involved) */
    const ams = amsterdam(people);
    if (ams.met) for (const p of ams.members)
      if (!out.some(o => o.person === p && o.test === 'R210' && !o.tumourFirst)) add(p, 'R210', ['family meets modified Amsterdam criteria']);

    /* Unaffected relatives (R208 / R210 via Clinical Genetics) when no affected relative is alive */
    const livingAffected = affected.filter(p => !p.deceased);
    const unaffected = people.filter(p => !dxs(p).length);
    if (!livingAffected.length && affected.length) {
      for (const u of unaffected) {
        const fdr = affected.filter(a => degree(u, a) === 1 && dxs(a).some(d => isBreast(d) || is(d, 'ovary', 'hgsc|lgsc|nos')));
        for (const a of fdr) {
          const m = manchester(a, people);
          if (m.combined >= 20) add(u, 'R208', [`unaffected first-degree relative of ${labelOf(a).replace(/^[A-Z]/, c => c.toLowerCase())} (deceased) with Manchester score ${m.combined} (≥20) – via Clinical Genetics`], { unaffected: true, manchester: m, mssFor: a });
        }
        if (out.some(o => o.test === 'R210' && /Amsterdam/.test(o.text.join(' ')))) add(u, 'R210', ['unaffected relative in a family meeting modified Amsterdam criteria with no living affected relative – via Clinical Genetics (R404 route)'], { unaffected: true });
      }
    }

    // Deceased affected people need stored DNA or tissue.
    for (const o of out) if (o.person.deceased && !o.unaffected) o.deceased = true;
    // Germline R210 supersedes "tumour testing first" for the same person.
    const res = out.filter(o => !(o.test === 'R210' && o.tumourFirst && out.some(x => x.person === o.person && x.test === 'R210' && !x.tumourFirst)))
      // "May meet" is dropped where the same person already meets that test outright.
      .filter(o => !(o.possible && out.some(x => x.person === o.person && x.test === o.test && !x.possible)));
    for (const o of res) o.crit = o.text.map(t => critFor(o.test, t));
    return res;
  }


  /* ---- Which line of the Test Directory criteria (TD_CRITERIA, verbatim) each reason relates to ----
   * [pattern on the reason text, start of the criterion's wording]; the first match wins. */
  const CRIT_REF = {
    R207: [[/^epithelial ovarian cancer with a second/, 'second degree relative with EOC'], [/^epithelial ovarian cancer with/, 'Epithelial ovarian cancer (EOC) OR serous tubal intraepithelial carcinoma (STIC) AND'], [/ovarian cancer/, 'High grade non mucinous']],
    R208: [[/grandparent from/, '≥ 1 grandparent from Westray'], [/^unaffected/, 'Living unaffected individual with'], [/^prostate cancer with/, 'Living affected individual with prostate cancer'], [/^pancreatic cancer with/, 'Living affected individual with pancreatic cancer'],
      [/^breast cancer under 40/, 'Breast cancer (age <40'], [/^bilateral breast/, 'Bilateral breast cancer'], [/^triple-negative/, 'Triple negative breast cancer'], [/^male breast/, 'Assigned male at birth'],
      [/^breast cancer under 45/, 'Breast cancer (age <45'], [/Manchester score/, 'Combined pathology-adjusted Manchester score'], [/^Ashkenazi/, 'Ashkenazi Jewish ancestry and breast'], [/DCIS/, '*Breast cancer definition']],
    R210: [[/^unaffected/, 'Clinical Criteria for germline testing in an unaffected'], [/Amsterdam/, 'modified Amsterdam criteria positive family'], [/^MMR-deficient|^MLH1-deficient|^MLH1 loss/, 'The proband has a dMMR tumour'],
      [/^MSI-high/, 'Clinical criteria for MSI /IHC testing'], [/under 50/, 'Any lynch-related cancer'], [/^two Lynch/, 'Two Lynch-related cancers'], [/first-degree relative, both 60/, 'Lynch-related cancer and ≥ 1 first degree relative'],
      [/≥2 relatives/, 'Lynch-related cancer and ≥ 2 relatives'], [/≥3 relatives/, 'Lynch-related cancer and ≥ 3 relatives']],
    R211: [[/^small/, 'Any small bowel cancer'], [/cancer under 40/, 'Any colorectal cancer OR endometrial'], [/siblings/, 'with ≥2 siblings'], [/^≥5 adenomas with colorectal/, '≥5 adenomatous polyps and colorectal'],
      [/^≥5 adenomas under 40/, '≥5 adenomatous polyps (age <40'], [/^≥10 adenomas/, '≥10 adenomatous polyps'], [/^≥20 adenomas/, '≥20 adenomatous polyps'], [/^≥5 adenomas under 60/, '≥5 adenomatous polyps (age <60'],
      [/^serrated polyposis syndrome under 50/, 'patient aged < 50 OR'], [/^serrated polyposis syndrome with a first-degree/, 'family history of ≥1 affected FDR with SPS'], [/^serrated polyposis syndrome.* dysplasia/, 'evidence of dysplasia within any polyp'], [/serrated polyps.*WHO criteria/, 'A clinical diagnosis of serrated polyposis syndrome'],
      [/^≥2 hamartomatous/, '≥ 2 hamartomatous polyps'], [/^hamartomatous polyp with/, '≥ 1 hamartomatous polyp and']],
    R212: [[/^≥2 Peutz/, '≥2 PJS-type hamartomatous'], [/^SCTAT or adenoma malignum \(Cervix/, 'Adenoma malignum of the cervix'], [/^SCTAT/, 'Sex cord tumours with annular tubules'], [/with characteristic pigmentation/, '≥1 PJS-type hamartomatous polyp and characteristic'],
      [/pigmentation under 10/, 'Characteristic mucocutaneous pigmentation age <10'], [/relative with a PJS/, '≥1 PJS-type hamartomatous polyp, AND']],
    R213: [[/Lhermitte/, 'Cerebellar dysplastic gangliocytoma'], [/major criterion/, 'Macrocephaly AND ≥1 major'], [/mucocutaneous/, 'Macrocephaly AND Mucocutaneous']],
    R214: [[/./, '≥ 1 major OR']],
    R215: [[/Māori/, 'diffuse gastric cancer in any individual of Maori'], [/^diffuse gastric cancer under 50/, 'Diffuse gastric cancer (<50'], [/cleft/, 'cleft lip or cleft palate'], [/both under 70/, 'double primary diffuse gastric'], [/relative with diffuse gastric cancer at any age/, 'diffuse gastric cancer at any age and ≥ 1 FDR/SDR with diffuse'], [/^diffuse gastric cancer.*relative with lobular breast cancer under 70/, 'diffuse gastric cancer at any age and ≥1 FDR/SDR with lobular'],
      [/^lobular breast cancer with/, 'Lobular breast cancer and ≥1 FDR/SDR'], [/^bilateral lobular/, 'Bilateral lobular breast cancer'], [/two lobular/, 'Two or more cases of lobular']],
    R216: [[/jaw osteosarcoma/, 'Jaw osteosarcoma'], [/anaplastic/, 'Rhabdomyosarcoma of embryonal anaplastic'], [/^rhabdomyosarcoma at 5/, 'Rhabdomyosarcoma (≤ 5'], [/^adrenocortical/, 'Adrenocortical cancer'], [/^choroid/, 'Choroid plexus cancer'],
      [/^breast cancer at 30/, 'Breast cancer (≤ 30'], [/^HER2/, 'HER2 positive breast cancer'], [/^hypodiploid/, 'Hypodiploid acute'], [/^SHH/, 'SHH medulloblastoma'], [/^two LFS/, '≥2 LFS-related cancers'],
      [/^LFS-related cancer with/, '≥1 LFS-related cancer with'], [/classic LFS/, 'Cancer with ≥2 first / second degree relatives'], [/^two POT1/, 'Proband with personal history of 2 or more POT1'], [/^POT1/, 'Proband with POT1 associated cancer']],
    R217: [[/under 20/, 'Any pituitary adenoma or insulinoma'], [/macroadenoma/, 'Pituitary macroadenoma'], [/multiglandular/, 'Parathyroid multiglandular disease'], [/two or more/, '≥2 MEN1-related endocrine'],
      [/non-endocrine/, 'MEN1-related non-endocrine tumours (any age)'], [/FIPA/, 'Isolated pituitary adenoma developing'], [/first-degree relative/, '≥1 MEN1-related endocrine abnormality and a first degree']],
    R218: [[/^medullary/, 'MTC (any age)'], [/two or more/, '≥2 MEN2-related'], [/first-degree/, '≥1 MEN2-related endocrine abnormality and a first']],
    R219: [[/./, 'Testing of phenotypically affected individual where the proband has Retinoblastoma']],
    R221: [[/^bilateral vestibular/, 'Bilateral vestibular schwannomas'], [/^schwannoma under 30/, 'Schwannoma diagnosed <30'], [/^meningioma under 20/, 'Meningioma diagnosed < 20'], [/clear cell/, 'Any clear Cell Meningioma'],
      [/^vestibular schwannoma with/, 'Unilateral vestibular schwannoma and non-intradermal'], [/^meningioma with/, 'Meningioma AND one or more']],
    R222: [[/./, 'Clinical diagnosis of NF1']],
    R223: [[/^phaeochromocytoma under 60/, 'Phaeochromocytoma <60'], [/^paraganglioma/, 'Any paraganglioma'], [/^bilateral/, 'Bilateral phaeochromocytoma'], [/renal cell/, 'Phaeochromocytoma and renal cell'], [/relative/, 'AND ≥1 relative']],
    R224: [[/at 46/, 'Renal cancer (≤ 46'], [/FH- or SDH/, 'FH deficient/HLRCC'], [/bilateral|multifocal/, 'Bilateral/multifocal renal'], [/relative/, 'A renal cancer AND first degree relative'], [/syndromic/, 'Renal tumour and features of inherited']],
    R225: [[/^haemangioblastoma/, 'Cerebellar OR spinal haemangioblastoma'], [/^endolymphatic/, 'Retinal angioma, spinal or endolymphatic'], [/two or more/, '≥2 VHL-related tumours'], [/first-degree/, '≥1 VHL-related tumour and a first']],
    R226: [[/./, 'Testing of individual (proband) affected with parathyroid carcinoma']],
    R254: [[/under 18/, '≥1 melanoma < 18'], [/^≥2 melanomas \(or in situ\) under 30/, '≥2 melanomas and/or melanomas in situ age <30'], [/^melanoma under 30 with/, 'One melanoma <30 years AND'], [/^≥3 melanomas/, '≥3 melanoma and/or'],
      [/across/, 'Total of ≥3 melanoma across'], [/^≥2 melanomas with/, '≥ 2 Melanoma and/or melanoma in situ AND'], [/atypical moles/, 'AND atypical moles']],
    R347: [[/relative/, 'AML/MDS AND ≥1 relative'], [/platelet/, 'AML/MDS AND a pre-existing']],
    R363: [[/under 50/, 'Diagnosed age before age 50'], [/relative/, 'With ≥1 relative']],
    R364: [[/^two DICER1|with a first-degree relative/, 'Testing of affected individual where there is a combination of two'], [/./, 'Testing of affected individual (proband) where the individual has one of the following diagnoses']],
    R365: [[/^type 2/, 'Type 2 papillary'], [/and a renal tumour|with cutaneous leiomyomata or a renal/, 'Two of: cutaneous leiomyomata'], [/relative \(up to third-degree\) with a renal/, 'Cutaneous leiomyomata AND one first'],
      [/two relatives/, 'Cutaneous leiomyomata AND two first'], [/multiple/, 'Multiple cutaneous leiomyomata'], [/under 40/, 'Uterine leiomyomata with classic histological features (age <40']],
    R366: [[/with ALL$/, 'One first / second / third degree relative with ALL'], [/two relatives/, 'Two first / second / third degree relatives']],
    R367: [[/^pancreatic cancer under 60/, 'Pancreatic cancer age <60'], [/own breast/, 'Breast cancer age <60, melanoma age <60, OR ovarian cancer, OR'], [/relative with pancreatic cancer under 60/, 'One first / second degree relative with pancreatic'], [/≥2/, 'Two or more first / second degree relatives']],
    R414: [[/CHRPE/, 'Multifocal or bilateral CHRPE'], [/desmoid/, 'Aggressive fibromatosis'], [/cribriform/, 'Cribriform-morular'], [/^hepatoblastoma/, 'Hepatoblastoma'], [/osteomas/, 'Multiple osteomas'], [/gastric polyposis/, 'Affected individual of any age with gastric polyposis'],
      [/medulloblastoma/, 'Classic type medulloblastoma'], [/^≥6/, '≥6 pilomatrixomas'], [/^≥2 pilomatrixomas/, '≥2 pilomatrixoma <20'], [/another APC/, 'Single pilomatrixoma in an individual'], [/epidermoid/, 'Pilomatrixoma with features of an epidermoid']],
    R422: [[/core BAP1 tumours/, 'Individual with a personal history of two or more core'], [/melanocytic/, 'Individual with a personal history of two or more inactivated'], [/first-degree/, 'Individual with a personal history of a BAP1 associated tumour and a first'],
      [/mesothelioma/, 'Individual with mesothelioma'], [/uveal/, 'Individual with uveal melanoma']],
    R430: [[/under 50/, 'Proband diagnosed with prostate cancer at <50'], [/metastatic/, 'Proband diagnosed with metastatic prostate'], [/Ashkenazi/, 'Ashkenazi Jewish ancestry and prostate'], [/Whalsay/, '≥1 grandparent from Whalsay']],
    R456: [[/^Wilms/, 'Wilms tumour, multiple nephrogenic'], [/^bilateral or multiple neuroblastoma/, 'Bilateral neuroblastoma'], [/relative \(up to third-degree\) with neuroblastoma/, 'One or more FDR/SDR/TDR with neuroblastoma'],
      [/^neuroblastoma with Hirschsprung/, "Hirschsprung's or FDR"], [/^neuroblastoma/, 'Neuroblastoma'], [/medulloblastoma/, 'Medulloblastoma <25'], [/teratoid|small cell/, 'Atypical teratoid/rhabdoid tumour']],
    R457: [[/sarcoma under 25/, 'Translocation negative sarcoma'], [/^MPNST/, 'Malignant peripheral nerve sheath'], [/^chordoma under 25/, 'Chordoma <25'], [/multiple primary/, 'Multiple primary sarcomas'], [/^sarcoma with/, 'Sarcoma and one or more FDR/SDR'],
      [/multiple chordomas/, 'Multiple chordomas'], [/^chordoma with/, 'Chordoma and one or more']]
  };
  const critFor = (test, text) => ((CRIT_REF[test] || []).find(([re]) => re.test(text)) || [])[1] || null;

  /* ---- Near misses: a threshold just missed (shown in the criteria panel only) ---- */
  function nearMisses(people, met) {
    const out = [];
    const has = (p, test) => met.some(o => o.person === p && o.test === test && !o.possible);
    const near = (p, test, text, crit) => { if (!has(p, test) && !out.some(o => o.person === p && o.test === test && o.text[0] === text)) out.push({ person: p, test, text: [text], crit: [crit], near: true }); };
    const by = (d, lo, hi) => age(d) !== null && age(d) >= lo && age(d) <= hi;
    for (const p of people) {
      for (const d of dxs(p)) {
        const at = `at ${age(d)}`;
        if (isBreast(d) && by(d, 40, 44)) near(p, 'R208', `breast cancer ${at} – the age criterion is under 40`, 'Breast cancer (age <40');
        if (isBreast(d) && PRED.tnbc(d) && by(d, 60, 64)) near(p, 'R208', `triple-negative breast cancer ${at} – the criterion is under 60`, 'Triple negative breast cancer');
        if (isBreast(d) && both(d) && by(d, 60, 64)) near(p, 'R208', `bilateral breast cancer ${at} – the criterion is under 60`, 'Bilateral breast cancer');
        if (isBreast(d) && by(d, 31, 35)) near(p, 'R216', `breast cancer ${at} – the LFS criterion is 30 or under`, 'Breast cancer (≤ 30');
        if ((CRC_EC(d) || is(d, 'smallbowel')) && by(d, 40, 44)) near(p, 'R211', `${SITES[d.site].label.split(' ')[0].toLowerCase()} cancer ${at} – the criterion is under 40`, is(d, 'smallbowel') ? 'Any small bowel cancer' : 'Any colorectal cancer OR endometrial');
        if (LYNCH_SITES(d) && !['pancreas', 'prostate', 'stomach'].includes(d.site) && by(d, 50, 54)) near(p, 'R210', `Lynch-related cancer ${at} – tumour testing criterion is under 50`, 'Any lynch-related cancer');
        if (is(d, 'pancreas', 'pdac|acinar|nos') && by(d, 60, 64)) near(p, 'R367', `pancreatic cancer ${at} – the criterion is under 60`, 'Pancreatic cancer age <60');
        if (is(d, 'prostate') && by(d, 50, 54)) near(p, 'R430', `prostate cancer ${at} – the criterion is under 50`, 'Proband diagnosed with prostate cancer at <50');
        if (RENAL(d) && by(d, 47, 51)) near(p, 'R224', `renal cancer ${at} – the criterion is 46 or under`, 'Renal cancer (≤ 46');
        if (is(d, 'adrenal', 'phaeo') && by(d, 60, 64)) near(p, 'R223', `phaeochromocytoma ${at} – the criterion is under 60`, 'Phaeochromocytoma <60');
        if (is(d, 'cns', 'hb') && by(d, 60, 64)) near(p, 'R225', `haemangioblastoma ${at} – the criterion is under 60`, 'Cerebellar OR spinal haemangioblastoma');
        if (is(d, 'stomach', 'diffuse') && by(d, 50, 54)) near(p, 'R215', `diffuse gastric cancer ${at} – the criterion is under 50`, 'Diffuse gastric cancer (<50');
        if (is(d, 'skin', 'melanoma') && by(d, 18, 21)) near(p, 'R254', `melanoma ${at} – the criterion is under 18`, '≥1 melanoma < 18');
        if (is(d, 'sarcoma', 'gist') && by(d, 50, 54)) near(p, 'R363', `GIST ${at} – the criterion is under 50`, 'Diagnosed age before age 50');
        if (is(d, 'eye', 'uveal') && by(d, 40, 44)) near(p, 'R422', `uveal melanoma ${at} – the criterion is under 40`, 'Individual with uveal melanoma');
        if (is(d, 'sarcoma', 'rms|osteo|sts|lms|mpnst|chondrosarcoma|angiosarcoma|chordoma') && by(d, 25, 29)) near(p, 'R457', `${SITES[d.site].hist.find(h => h[0] === d.hist)[1].toLowerCase()} ${at} – the criterion is under 25`, is(d, 'sarcoma', 'chordoma') ? 'Chordoma <25' : 'Translocation negative sarcoma');
        if (is(d, 'polyps', 'adenoma')) {
          const n = +d.count || 0, a = age(d);
          if (a !== null && a < 60 && n >= 7 && n < 10) near(p, 'R211', `${n} adenomas at ${a} – the criterion is ≥10 under 60`, '≥10 adenomatous polyps');
          if (a !== null && a >= 60 && n >= 15 && n < 20) near(p, 'R211', `${n} adenomas at ${a} – the criterion is ≥20 at 60 or over`, '≥20 adenomatous polyps');
        }
      }
      if (dxs(p).some(d => isBreast(d) || is(d, 'ovary', 'hgsc|clearcell'))) {
        const m = manchester(p, people);
        if ((m.combined >= 12 && m.combined < 15) || ((m.b1 === 8 || m.b1 === 9 || m.b2 === 8 || m.b2 === 9) && m.combined < 15)) near(p, 'R208', `Manchester score ${m.combined} (BRCA1 ${m.b1}, BRCA2 ${m.b2}) – needs 15 combined or 10 for one gene; consider CanRisk (≥10%)`, 'Combined pathology-adjusted Manchester score');
      }
    }
    return out;
  }

  /*
   * Family history of colorectal cancer (FHCC) risk category, BSG/ACPGBI/UKCGG 2019 (Monahan et al., Gut) Box 1 –
   * for when no hereditary CRC syndrome has been found. The person under assessment is the proband; only their
   * affected relatives count. "First degree kinship": affected relatives who are FDRs of each other.
   */
  function fhcc(people) {
    setPeople(people);
    const pro = people.find(p => p.rel === 'proband');
    const crcAge = p => { const a = (p.dx || []).filter(d => d.site === 'colorectal' && d.hist).map(d => (d.age === '' || d.age == null ? null : +d.age));
      return a.length ? (a.some(x => x != null) ? Math.min(...a.filter(x => x != null)) : 'unknown') : undefined; };
    const affected = people.filter(p => p !== pro && crcAge(p) !== undefined && GEN[p.rel] !== undefined);
    const fdr = (a, b) => degree(a, b) === 1;
    const lbl = p => `${labelOf(p)}${crcAge(p) === 'unknown' ? ' (age not given)' : ` (${crcAge(p)})`}`;
    const proAffected = !!pro && crcAge(pro) !== undefined;
    const unknownLinks = affected.some(a => affected.some(b => a !== b && degree(a, b) == null));
    // The proband's own premalignant polyps (adenomas or serrated): post-polypectomy surveillance applies as well.
    const pp = pro ? (pro.dx || []).filter(d => d.site === 'polyps' && ['adenoma', 'serrated', 'sps'].includes(d.hist)) : [];
    const cnt = h => Math.max(0, ...pp.filter(d => d.hist === h).map(d => +d.count || 0));
    // Possible polyposis: ≥10 adenomas, serrated polyposis (WHO criteria), or >20 serrated polyps – assess for a syndrome first.
    const proPolyps = pp.length ? { hist: [...new Set(pp.map(d => d.hist))], count: Math.max(0, ...pp.map(d => +d.count || 0)),
      polyposis: cnt('adenoma') >= 10 || pp.some(d => d.hist === 'sps') || cnt('serrated') > 20 } : null;
    // Polyposis without a known syndrome (BSG 2019): MCRA (≥10 adenomas) and SPS in the proband or a first-degree relative.
    const count = (p, h) => Math.max(0, ...(p.dx || []).filter(d => d.site === 'polyps' && d.hist === h).map(d => +d.count || 0));
    const fdrs = pro ? people.filter(p => p !== pro && fdr(pro, p)) : [];
    const spsAge = p => { const a = (p.dx || []).filter(d => d.site === 'polyps' && d.hist === 'sps' && d.age !== '' && d.age != null).map(d => +d.age); return a.length ? Math.min(...a) : null; };
    const polyposis = {
      proMcra: pro && count(pro, 'adenoma') >= 10 ? count(pro, 'adenoma') : 0,
      proSps: !!pro && (pro.dx || []).some(d => d.site === 'polyps' && d.hist === 'sps'),
      relMcra: fdrs.filter(p => count(p, 'adenoma') >= 10).map(p => ({ label: labelOf(p), count: count(p, 'adenoma') })),
      relSps: fdrs.filter(p => (p.dx || []).some(d => d.site === 'polyps' && d.hist === 'sps')).map(p => ({ label: labelOf(p), age: spsAge(p), from: spsAge(p) != null ? Math.min(40, spsAge(p) - 10) : 40 })),
      relMsp: fdrs.filter(p => !(p.dx || []).some(d => d.site === 'polyps' && d.hist === 'sps') && count(p, 'serrated') >= 10).map(p => ({ label: labelOf(p), count: count(p, 'serrated') }))
    };
    const relPolyposis = polyposis.relMcra.length + polyposis.relSps.length + polyposis.relMsp.length > 0;
    const out = { any: proAffected || affected.length > 0 || !!proPolyps || relPolyposis, proAffected, proPolyps, polyposis, unknownLinks, category: 'average', reasons: [] };
    if (!pro) return out;
    const proFdrs = affected.filter(a => fdr(pro, a));
    // High: a cluster (linked by first-degree kinship) of >= 3 affected, across >= 2 generations, proband FDR of one.
    const seen = new Set();
    for (const a of affected) {
      if (seen.has(a)) continue;
      const comp = [], stack = [a]; seen.add(a);
      while (stack.length) { const x = stack.pop(); comp.push(x); for (const y of affected) if (!seen.has(y) && fdr(x, y)) { seen.add(y); stack.push(y); } }
      if (comp.length >= 3 && new Set(comp.map(x => GEN[x.rel])).size >= 2 && comp.some(x => fdr(pro, x))) {
        out.category = 'high'; out.reasons.push(`${comp.length} affected relatives who are first-degree relatives of each other, across ${new Set(comp.map(x => GEN[x.rel])).size} generations: ${comp.map(lbl).join(', ')}`);
        return out;
      }
    }
    const young = proFdrs.filter(a => typeof crcAge(a) === 'number' && crcAge(a) < 50);
    if (young.length) { out.category = 'moderate'; out.reasons.push(`a first-degree relative with colorectal cancer under 50: ${young.map(lbl).join(', ')}`); return out; }
    for (const a of affected) for (const b of affected) {
      if (a !== b && fdr(a, b) && (fdr(pro, a) || fdr(pro, b))) {
        out.category = 'moderate'; out.reasons.push(`two affected relatives who are first-degree relatives of each other, at least one a first-degree relative of the proband: ${lbl(a)}, ${lbl(b)}`); return out;
      }
    }
    return out;
  }
  window.fhccCategory = fhcc;
  window.checkEligibility = check;
  window.CRIT_REF = CRIT_REF;
  window.nearMisses = (people, ancestry) => nearMisses(people, check(people, ancestry));
  window.manchesterScore = manchester;
  window.manchesterDetail = manchesterDetail;
  window.MSS_TABLE = MSS_TABLE;
  window.MSS_ADJ = MSS_ADJ;
  window.relDegree = (a, b, people) => { if (people) setPeople(people); return degree(a, b); };
  window.PARENT_OF = PARENT_OF;
})();
