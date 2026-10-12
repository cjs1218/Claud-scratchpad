/*
 * Test Directory eligibility (Rare and Inherited Disease eligibility criteria v9.1, 20 May 2026).
 * checkEligibility(people, ancestry) returns the criteria met by each person in the family as entered.
 * Decision support only: it covers the main inherited cancer tests and criteria that can be judged from the
 * information entered; the full criteria in the Test Directory always take precedence.
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
    m_cousin: 'AM', p_cousin: 'AP', m_halfsib: 'MOM', p_halfsib: 'DAD'
  };
  const MEMBER = {
    mother: ['P0', 'MOM'], father: ['P0', 'DAD'], m_gm: ['GM'], m_gf: ['GM'], p_gm: ['GP'], p_gf: ['GP'],
    proband: ['PC'], sister: ['SC'], brother: ['SC'], daughter: ['CC'], son: ['CC'],
    m_aunt: ['AM'], m_uncle: ['AM'], p_aunt: ['AP'], p_uncle: ['AP']
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
  const ANC = Object.fromEntries(Object.keys(PARENT).map(r => [r, ancestors(r)]));
  // Degree of relationship (1 = first-degree) between two people, or null if unknown / not blood relatives.
  function degree(a, b) {
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
    m_gm: -2, m_gf: -2, p_gm: -2, p_gf: -2, m_great: -2, p_great: -2, daughter: 1, son: 1, niece: 1, grandchild: 2 };
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
  const histText = d => `${SITES[d.site].label}: ${(SITES[d.site].hist.find(h => h[0] === d.hist) || [, d.hist])[1]}${age(d) !== null ? `, age ${age(d)}` : ''}`;

  /* ---- Manchester score (combined, BRCA1, BRCA2) for a person being considered for testing ---- */
  function manchester(person, people) {
    const side = sideOf(person);
    const sides = side === 'core' ? ['M', 'P'] : [side];
    let best = { combined: 0, b1: 0, b2: 0 };
    for (const s of sides) {
      let b1 = 0, b2 = 0;
      for (const p of people) {
        const ps = sideOf(p);
        if (!(ps === 'core' || ps === s)) continue;
        for (const d of dxs(p)) {
          const a = age(d);
          if (a === null) continue;
          // Bilateral breast cancer scores as two primaries (local practice).
          if (isBreast(d) && !isMale(p)) { const pts = a < 30 ? [6, 5] : a < 40 ? [4, 4] : a < 50 ? [3, 3] : a < 60 ? [2, 2] : [1, 1]; const k = d.bilat ? 2 : 1; b1 += k * pts[0]; b2 += k * pts[1]; }
          else if (isBreast(d) && isMale(p)) { const pts = a < 60 ? [5, 8] : [5, 5]; b1 += pts[0]; b2 += pts[1]; }
          else if (d.site === 'ovary' && !['mucinous', 'germ', 'fibroma', 'granulosa_a', 'granulosa_j', 'sertoli', 'sctat', 'sccoht'].includes(d.hist)) { const pts = a < 60 ? [8, 5] : [5, 5]; b1 += pts[0]; b2 += pts[1]; }
          else if (d.site === 'prostate') b2 += a < 60 ? 2 : 1;
          else if (d.site === 'pancreas' && d.hist !== 'pnet') b2 += 1;
        }
      }
      // Pathology adjustment for the tested person's own tumour.
      const own = dxs(person);
      const br = own.find(isBreast), ov = own.find(d => d.site === 'ovary');
      if (br) {
        if (PRED.tnbc(br)) b1 += 4;
        else {
          if (br.her2 === 'pos') b1 -= 6;
          if (br.er === 'pos') b1 -= 1; else if (br.er === 'neg') b1 += 1;
        }
        if (br.hist === 'ilc') b1 -= 2;
        if (br.hist === 'dcis') b1 -= 1;
      } else if (ov && ov.hist === 'hgsc' && lt(ov, 60)) b1 += 2;
      if (b1 + b2 > best.combined) best = { combined: b1 + b2, b1, b2 };
    }
    return best;
  }

  /* ---- Modified Amsterdam criteria (Amsterdam II) ----
   * ≥3 relatives with a Lynch-associated cancer (colorectal, endometrial, small bowel, ureter / renal pelvis);
   * one is a first-degree relative of the other two; ≥2 successive generations; ≥1 diagnosed under 50.
   * Returns the best-matching group and a checklist, for display even when not all criteria are met. */
  const AMS_CANCER = d => is(d, 'colorectal') || is(d, 'uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos') || is(d, 'smallbowel') || is(d, 'urothelial', 'upper');
  function amsterdam(people) {
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
      const brd = D.filter(isBreast), hgOv = D.filter(d => is(d, 'ovary', 'hgsc|clearcell'));
      if (brd.length || hgOv.length) {
        const r = [];
        brd.forEach(d => {
          if (lt(d, 40)) r.push(`breast cancer under 40 (${histText(d)})`);
          if (d.bilat && lt(d, 60)) r.push(`bilateral breast cancer under 60 (${histText(d)})`);
          if (PRED.tnbc(d) && lt(d, 60)) r.push(`triple-negative breast cancer under 60 (${histText(d)})`);
          if (isMale(p)) r.push(`male breast cancer (${histText(d)})`);
          if (lt(d, 45) && relDx(p, x => isBreast(x) && lt(x, 45), 1).length) r.push('breast cancer under 45 with a first-degree relative with breast cancer under 45');
        });
        const m = ms();
        if (m.combined >= 15 || m.b1 >= 10 || m.b2 >= 10) r.push(`Manchester score ${m.combined} (BRCA1 ${m.b1}, BRCA2 ${m.b2}; threshold 15 combined or 10 single gene)`);
        if (ancestry === 'ashkenazi') r.push('Ashkenazi Jewish ancestry');
        if (brd.some(d => d.hist === 'dcis') && r.length) r.push('note: DCIS counts only if high grade');
        if (r.length) add(p, 'R208', r, { manchester: m });
      }
      /* R207 – high-grade non-mucinous epithelial ovarian cancer at any age */
      const ov = D.filter(d => is(d, 'ovary', 'hgsc|clearcell|endometrioid|nos'));
      if (ov.length) {
        const r = ov.map(d => `${d.hist === 'endometrioid' || d.hist === 'nos' ? 'epithelial ovarian cancer – qualifies if high grade' : 'high-grade non-mucinous epithelial ovarian cancer'} (${histText(d)})`);
        add(p, 'R207', r);
      }
      const eoc = d => is(d, 'ovary', 'hgsc|lgsc|endometrioid|clearcell|nos');
      if (has(eoc) && !ov.length && (rel(p, eoc, 1).length || rel(p, eoc, 3).filter(b => degree(p, b) >= 2).length >= 2))
        add(p, 'R207', ['epithelial ovarian cancer with a first-degree relative (or ≥2 second/third-degree relatives) with epithelial ovarian cancer']);

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
      if (r210g.length) add(p, 'R210', r210g);
      if (r210t.length && !r210g.length) add(p, 'R210', r210t, { tumourFirst: true });

      /* R211 – polyposis and early-onset colorectal cancer */
      const r211 = [];
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

      /* R430 – prostate */
      D.filter(d => is(d, 'prostate')).forEach(d => {
        const r = [];
        if (lt(d, 50)) r.push(`prostate cancer under 50 (${histText(d)})`);
        if (d.hist === 'highrisk' && lt(d, 60)) r.push(`metastatic prostate cancer under 60 – qualifies if metastatic (${histText(d)})`);
        if (ancestry === 'ashkenazi') r.push('Ashkenazi Jewish ancestry');
        if (r.length) add(p, 'R430', r);
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
        if (!(isBreast(d) && isBreast(x.d)) && ((le(d, 46) && le(x.d, 56)) || (le(x.d, 46) && le(d, 56)))) { r216.push(`LFS-related cancer with a first/second-degree relative with an LFS-related cancer (${REL[x.p.rel].label})`); break; }
      if (D.some(d => is(d, 'sarcoma') && le(d, 45))) {
        const f1 = relDx(p, d => le(d, 45), 1);
        if (f1.length && relDx(p, d => le(d, 45) || is(d, 'sarcoma'), 2).filter(x => x.p !== f1[0].p).length) r216.push('classic LFS pattern: sarcoma at 45 or under, a first-degree relative with cancer at 45 or under, and another relative with cancer at 45 or under or sarcoma');
      }
      const pot = D.filter(POT1);
      if (pot.length >= 2 && !pot.every(d => is(d, 'skin', 'melanoma'))) r216.push('two POT1-associated cancers (POT1)');
      else if (pot.length && relDx(p, POT1, 2).some(x => !(is(x.d, 'skin', 'melanoma') && pot.every(d => is(d, 'skin', 'melanoma'))))) r216.push('POT1-associated cancer with a first/second-degree relative with one (POT1)');
      if (r216.length) add(p, 'R216', [...new Set(r216)]);

      /* R217 – endocrine neoplasia (MEN1, FIPA) and R218 – MEN2 */
      const r217 = [], men1 = D.filter(MEN1E);
      D.forEach(d => {
        if (is(d, 'pituitary') && lt(d, 20)) r217.push(`pituitary adenoma under 20 (${histText(d)})`);
        else if (is(d, 'pituitary') && lt(d, 30)) r217.push(`pituitary adenoma under 30 – qualifies if macroadenoma (${histText(d)})`);
        if (is(d, 'parathyroid', 'adenoma') && lt(d, 35) && d.bilat) r217.push(`multiglandular parathyroid disease under 35 (${histText(d)})`);
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
        if (is(d, 'adrenal', 'phaeo') && d.bilat) r223.push('bilateral phaeochromocytoma');
      });
      if (D.some(d => is(d, 'adrenal', 'phaeo')) && D.some(RENAL)) r223.push('phaeochromocytoma and renal cell cancer');
      if (D.some(PPGL) && relDx(p, x => PPGL(x) || is(x, 'sarcoma', 'gist'), 3).length) r223.push('PPGL with a relative with PPGL or GIST');
      if (r223.length) add(p, 'R223', [...new Set(r223)]);
      const r224 = [];
      D.filter(RENAL).forEach(d => {
        if (le(d, 46)) r224.push(`renal cancer at 46 or under (${histText(d)})`);
        if (['fhrcc', 'sdhrcc'].includes(d.hist)) r224.push(`FH- or SDH-deficient renal cancer (${histText(d)})`);
        if (d.bilat) r224.push('bilateral or multifocal renal cancer');
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
      if (dgc.length && D.some(d => is(d, 'feature', 'cleft'))) r215.push('diffuse gastric cancer with cleft lip/palate');
      if (dgc.some(d => lt(d, 70)) && ilc.some(d => lt(d, 70))) r215.push('diffuse gastric cancer and lobular breast cancer, both under 70');
      if (dgc.length && (relDx(p, x => is(x, 'stomach', 'diffuse'), 2).length || relDx(p, x => is(x, 'breast', 'ilc') && lt(x, 70), 2).length)) r215.push('diffuse gastric cancer with a first/second-degree relative with diffuse gastric cancer or lobular breast cancer under 70');
      if (ilc.length && relDx(p, x => is(x, 'stomach', 'diffuse') && lt(x, 70), 2).length) r215.push('lobular breast cancer with a first/second-degree relative with diffuse gastric cancer under 70');
      if (ilc.some(d => d.bilat && lt(d, 70))) r215.push('bilateral lobular breast cancer under 70');
      if (ilc.some(d => lt(d, 50)) && relDx(p, x => is(x, 'breast', 'ilc') && lt(x, 50), 2).length) r215.push('two lobular breast cancers under 50 in the family');
      if (r215.length) add(p, 'R215', [...new Set(r215)]);
      if (D.some(d => is(d, 'eye', 'rb'))) add(p, 'R219', ['retinoblastoma']);
      const r221 = [];
      D.forEach(d => {
        if (is(d, 'cns', 'vs') && d.bilat) r221.push('bilateral vestibular schwannoma');
        if (is(d, 'cns', 'schwannoma') && lt(d, 30)) r221.push(`schwannoma under 30 (${histText(d)})`);
        if (is(d, 'cns', 'meningioma') && lt(d, 20)) r221.push(`meningioma under 20 (${histText(d)})`);
        if (is(d, 'cns', 'meningioma_cc')) r221.push('clear cell meningioma');
      });
      if (D.some(d => is(d, 'cns', 'vs')) && D.some(d => is(d, 'cns', 'schwannoma'))) r221.push('vestibular schwannoma with a non-vestibular schwannoma');
      if (D.some(d => is(d, 'cns', 'meningioma|meningioma_cc')) && D.some(d => is(d, 'cns', 'vs|schwannoma'))) r221.push('meningioma with a schwannoma');
      if (r221.length) add(p, 'R221', [...new Set(r221)]);
      const nf = new Set(D.filter(NF1F).map(d => d.site + d.hist));
      if (nf.size >= 2 || (nf.size === 1 && relDx(p, NF1F, 1).length)) add(p, 'R222', ['clinical NF1 criteria likely met – testing if a molecular diagnosis is needed for management or reproduction']);
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
          if (m.combined >= 20) add(u, 'R208', [`unaffected first-degree relative of ${REL[a.rel].label.toLowerCase()} (deceased) with Manchester score ${m.combined} (≥20) – via Clinical Genetics`], { unaffected: true, manchester: m });
        }
        if (out.some(o => o.test === 'R210' && /Amsterdam/.test(o.text.join(' ')))) add(u, 'R210', ['unaffected relative in a family meeting modified Amsterdam criteria with no living affected relative – via Clinical Genetics (R404 route)'], { unaffected: true });
      }
    }

    // Deceased affected people need stored DNA or tissue.
    for (const o of out) if (o.person.deceased && !o.unaffected) o.deceased = true;
    // Germline R210 supersedes "tumour testing first" for the same person.
    return out.filter(o => !(o.test === 'R210' && o.tumourFirst && out.some(x => x.person === o.person && x.test === 'R210' && !x.tumourFirst)));
  }

  window.checkEligibility = check;
  window.manchesterScore = manchester;
  window.relDegree = degree;
})();
