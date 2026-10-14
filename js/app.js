/* Cancer Family History Navigator – scoring engine and UI. */
(function () {
  'use strict';

  const REL = Object.fromEntries(RELATIONS.map(r => [r[0], { id: r[0], label: r[1], degree: r[2], side: r[3], sex: r[4] }]));
  const REL_FACTOR = [1, 1, 0.6, 0.35, 0.2];
  const MODES = {
    narrow: { label: 'Narrow', minFrac: 0.35, max: 6, needStrong: true, hint: 'Narrow: only the strongest matches – up to 6 syndromes, each with a hallmark or strong cancer and at least 35% of the top score.' },
    balanced: { label: 'Balanced', minFrac: 0.15, max: 15, needStrong: false, hint: 'Balanced: up to 15 syndromes scoring at least 15% of the top score.' },
    wide: { label: 'Wide', minFrac: 0, max: Infinity, needStrong: false, hint: 'Wide: every syndrome with any matching cancer or finding.' }
  };

  let uid = 0;
  const nextId = () => ++uid;
  const newDx = () => ({ id: nextId(), site: '', hist: '', age: '', er: '', pr: '', her2: '', grade: '', ovgrade: '', mmr: '', meth: '', braf: '', count: '', side: '', age2: '' });
  const newPerson = (rel) => ({ id: nextId(), rel, sex: REL[rel].sex, ageNow: '', deceased: false, ageDeath: '', adopted: false, parentId: null, dx: [newDx()] });

  const state = { openPeople: new Set(), people: [newPerson('proband')], mode: 'balanced', tab: 'assess', treeOpen: true, treeSyn: null, ancestry: '', expanded: new Set(), compareView: null };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Escape text and mark known abbreviations (the meaning shows in a tooltip on hover or tap).
  const ABBR_RE = new RegExp(`(^|[^A-Za-z0-9])(${Object.keys(ABBREVIATIONS).sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z0-9])`, 'g');
  const abbrHtml = s => esc(s).replace(ABBR_RE, (m, pre, k) =>
    `${pre}<abbr class="abbr" title="${esc(ABBREVIATIONS[k])}" data-full="${esc(ABBREVIATIONS[k])}">${k}</abbr>`);
  const abbrList = texts => [...new Set(texts.flatMap(t => [...String(t).matchAll(ABBR_RE)].map(m => m[2])))];
  // Mark abbreviations in every text node under `root` (skipping form controls, code and existing marks);
  // SVG labels (the family tree) get one tooltip listing each abbreviation they contain.
  const ABBR_SKIP = 'script,style,textarea,select,option,input,abbr,code,pre,svg,.no-abbr,.sr-only';
  function markAbbr(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n; (n = walker.nextNode());) {
      if (!/[A-Z]{2}/.test(n.nodeValue) || !n.parentElement || n.parentElement.closest(ABBR_SKIP)) continue;
      ABBR_RE.lastIndex = 0;
      if (ABBR_RE.test(n.nodeValue)) hits.push(n);
    }
    for (const n of hits) { const t = document.createElement('template'); t.innerHTML = abbrHtml(n.nodeValue); n.replaceWith(t.content); }
    // Keyboard users can reach abbreviations in the form, eligibility box and pop-ups (not every page, to avoid hundreds of tab stops).
    root.querySelectorAll('#family abbr.abbr:not([tabindex]), .elig abbr.abbr:not([tabindex]), #crit-dialog abbr.abbr:not([tabindex])').forEach(a => { if (!a.closest('a, button')) a.tabIndex = 0; });
    root.querySelectorAll('svg text').forEach(t => {
      const ks = abbrList([t.textContent]);
      if (ks.length) t.dataset.tip = ks.map(k => `${k} = ${ABBREVIATIONS[k]}`).join('\n'); else delete t.dataset.tip;
    });
  }
  const sideLabel = (d, v) => (SIDE_LABELS[d.site] || SIDE_LABELS.default)[v] || SIDE_LABELS.default[v];
  const histLabel = (site, hist) => (SITES[site].hist.find(h => h[0] === hist) || [, hist])[1];

  /* ---------------- Scoring ---------------- */

  function matchRule(rule, dx, person) {
    const [site, hist, tier, early, pred, maxAge] = rule;
    if (site !== dx.site) return null;
    if (hist !== '*' && !hist.split('|').includes(dx.hist)) return null;
    if (pred && !PRED[pred](dx, person)) return null;
    const age = dx.age === '' ? null : +dx.age;
    let factor = 1;
    const notes = [];
    if (maxAge != null) {
      if (age == null) factor *= 0.6;
      else if (age > maxAge) return null;
    }
    if (early != null && age != null) {
      if (age <= early - 15) { factor *= 2; notes.push(`very early onset (≤${early - 15})`); }
      else if (age <= early) { factor *= 1.5; notes.push(`early onset (≤${early})`); }
    }
    return { value: TIER[tier] * factor, tier, pred, notes };
  }

  function scoreDx(cond, dx, person) {
    let best = null;
    // Where a syndrome has a male-specific rule for this site (e.g. male breast cancer), men use only that rule.
    const maleOnly = person.sex === 'M' && cond.rules.some(r => r[0] === dx.site && r[4] === 'male');
    for (const rule of cond.rules) {
      if (maleOnly && rule[0] === dx.site && rule[4] !== 'male') continue;
      const m = matchRule(rule, dx, person);
      if (m && (!best || m.value > best.value)) best = m;
    }
    if (!best) return null;
    let mult = 1;
    const modNotes = [];
    for (const [site, pred, f] of cond.mods || []) {
      if ((site === '*' || site === dx.site) && PRED[pred](dx, person)) {
        mult *= f;
        modNotes.push(`${PRED_LABEL[pred]} ×${f}`);
      }
    }
    if (dx.side === 'both') { mult *= 1.3; modNotes.push('both sides ×1.3'); }
    else if (dx.side === 'multi') { mult *= 1.15; modNotes.push(`${sideLabel(dx, 'multi').toLowerCase()} ×1.15`); }
    if (isCounted(dx) && +dx.count > 1) { mult *= 1.3; modNotes.push(`${dx.count} tumours ×1.3`); }
    return { ...best, value: best.value * mult, modNotes };
  }

  function scoreFamily() {
    const results = [];
    for (const cond of CONDITIONS) {
      // Recessive: only the proband and full brothers and sisters can share the genotype, so cancers in parents
      // or other relatives do not support it. Mosaic (not inherited): only the affected person counts.
      const recessive = cond.inh.startsWith('AR');
      const mosaic = /mosaic/i.test(cond.inh);
      const perPerson = new Map(), perStrong = new Map();
      const sides = { core: 0, M: 0, P: 0, unknown: 0 };
      const evidence = [];
      let strongCount = 0, hasStrong = false;
      for (const p of state.people) {
        const rel = REL[p.rel];
        for (const dx of p.dx) {
          if (!dx.site || !dx.hist) continue;
          const s = scoreDx(cond, dx, p);
          if (!s || s.value <= 0) continue;
          const sibship = rel.degree === 0 || rel.side === 'core';
          if (recessive && !sibship && !(cond.adSites || []).includes(dx.site)) continue;
          const rf = REL_FACTOR[rel.degree];
          const v = s.value * rf;
          perPerson.set(p, (perPerson.get(p) || 0) + v);
          const side = ['core', 'core2', 'child'].includes(rel.side) ? 'core' : rel.side;
          sides[side] += v;
          if (TIER[s.tier] >= TIER.M && s.value >= TIER.M * 0.5) { strongCount++; perStrong.set(p, (perStrong.get(p) || 0) + 1); }
          if ((s.tier === 'H' || s.tier === 'S') && s.value >= TIER.M) hasStrong = true;
          evidence.push({ person: p, dx, s, v });
        }
      }
      if (!evidence.length) continue;
      // Mosaic: the best-scoring person only, with the bonus from that person's own matches.
      const best = mosaic ? [...perPerson.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
      if (mosaic) strongCount = perStrong.get(best) || 0;
      let total = mosaic ? perPerson.get(best)
        : recessive ? sides.core + sides.M + sides.P + sides.unknown
        : sides.core + Math.max(sides.M, sides.P) + 0.3 * Math.min(sides.M, sides.P) + sides.unknown;
      total *= 1 + 0.2 * Math.min(Math.max(strongCount - 1, 0), 5);
      // Light weighting by how common the syndrome is (FREQ_WEIGHT).
      total *= FREQ_WEIGHT[FREQ_BAND[cond.id] || 4];
      evidence.sort((a, b) => b.v - a.v);
      results.push({ cond, score: total, evidence, hasStrong });
    }
    // Exact ties: the commoner syndrome first (FREQ_BAND), then data order.
    results.sort((a, b) => (Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : (FREQ_BAND[a.cond.id] || 4) - (FREQ_BAND[b.cond.id] || 4)));
    return results;
  }

  function filterByMode(results) {
    const mode = MODES[state.mode];
    const top = results.length ? results[0].score : 0;
    const shown = results.filter(r => r.score >= top * mode.minFrac && (!mode.needStrong || r.hasStrong)).slice(0, mode.max);
    return { shown, hidden: results.length - shown.length, top };
  }

  /* ---------------- Text helpers ---------------- */

  const has = v => v !== '' && v != null;
  const personStatus = p => [p.deceased ? `deceased${has(p.ageDeath) ? ` at ${p.ageDeath}` : ''}` : (has(p.ageNow) ? `age ${p.ageNow}` : ''),
    p.adopted ? 'adopted, no known family history (Manchester +2/+2)' : ''].filter(Boolean).join('; ');

  // Relatives sharing a relationship are numbered in the order entered ("Sister 1", "Sister 2").
  const relNumber = p => {
    const same = state.people.filter(x => x.rel === p.rel);
    return same.length > 1 && same.includes(p) ? same.indexOf(p) + 1 : 0;
  };
  function personLabel(p) {
    const r = REL[p.rel], n = relNumber(p);
    return r.label + (n ? ` ${n}` : '') + (p.sex && !r.sex ? ` (${p.sex})` : '');
  }
  window.personLabel = personLabel;
  // "Child of": which entered relatives could be this person's parent, and the one named (if still valid).
  const parentCandidates = p => PARENT_OF[p.rel] ? state.people.filter(x => x !== p && PARENT_OF[p.rel].includes(x.rel)) : [];
  const namedParent = p => { const c = parentCandidates(p); return c.find(x => x.id === p.parentId) || null; };

  function dxText(dx, person) {
    const site = SITES[dx.site];
    let t = `${site.label}: ${histLabel(dx.site, dx.hist)}`;
    const extra = [];
    if (dx.site === 'breast') {
      if (dx.er || dx.pr || dx.her2) {
        const sign = v => (v === 'pos' ? '+' : v === 'neg' ? '−' : '?');
        extra.push(PRED.tnbc(dx) ? 'triple negative' : `ER${sign(dx.er)} PR${sign(dx.pr)} HER2${sign(dx.her2)}`);
      }
      if (dx.grade) extra.push(`grade ${dx.grade}`);
    }
    if (dx.site === 'ovary' && dx.ovgrade) extra.push(`${dx.ovgrade} grade`);
    if (dx.mmr) extra.push(MARKER_OPTIONS.mmr.opts.find(o => o[0] === dx.mmr)[1]);
    if (dx.meth) extra.push(`MLH1 methylation ${dx.meth === 'yes' ? 'present' : 'absent'}`);
    if (dx.braf) extra.push(`BRAF V600E ${dx.braf === 'yes' ? 'present' : 'absent'}`);
    if (dx.site === 'polyps' && dx.count !== '') extra.push(`n=${dx.count}`);
    if (dx.side === 'both') extra.push(`${sideLabel(dx, 'both').toLowerCase()}${has(dx.age2) ? `, second at ${dx.age2}` : ''}`);
    else if (dx.side) extra.push(sideLabel(dx, dx.side).toLowerCase());
    if (isCounted(dx) && +dx.count > 1) extra.push(`${dx.count} tumours`);
    if (extra.length) t += ` (${extra.join(', ')})`;
    if (dx.age !== '') t += `, age ${dx.age}`;
    return t;
  }

  function ruleText(rule) {
    const [site, hist, tier, early, pred, maxAge] = rule;
    const s = SITES[site];
    const h = hist === '*' ? 'any type' : hist.split('|').map(x => histLabel(site, x)).join(' / ');
    let t = `${s.label} – ${h}`;
    const q = [];
    if (pred) q.push(PRED_LABEL[pred]);
    if (maxAge != null) q.push(`age ≤${maxAge}`);
    if (early != null) q.push(`early ≤${early}`);
    if (q.length) t += ` (${q.join(', ')})`;
    return { text: t, tier };
  }

  function geneFlags(g) {
    const f = [];
    if (NICPR_IN_SCOPE.includes(g)) return f;
    if (!NICPR.genes.includes(g)) f.push('not on NICPR list');
    if (NICPR.biallelic.includes(g)) f.push('NICPR: biallelic only');
    if (NICPR.susceptibilityOnly.includes(g)) f.push('NICPR: susceptibility variants only');
    if (NICPR.nonTruncatingAgreed.includes(g)) f.push('NICPR: non-truncating accepted with details');
    if (NICPR.addedSince2025.includes(g)) f.push('added to NICPR since June 2025');
    return f;
  }

  function geneChips(genes) {
    return genes.map(g => {
      const f = geneFlags(g);
      const cls = f.includes('not on NICPR list') ? 'gene gene-off' : 'gene';
      return `<span class="${cls}" title="${esc(f.join('; ') || 'On NICPR list')}">${esc(g)}${f.length ? '<sup>*</sup>' : ''}</span>`;
    }).join('');
  }

  function testChip(key) {
    const t = TESTS[key];
    const part = t.part ? `Part ${t.part}: ` : '';
    return `<button type="button" class="test-chip test-link" data-test="${esc(key)}" title="${esc(part + t.name)} – show the criteria">${esc(t.code)} · ${esc(t.name)}</button>`;
  }
  // Genes on a test's PanelApp panel (green), or the Test Directory description when there is no panel.
  const testGenes = key => (typeof TEST_GENES !== 'undefined' && TEST_GENES[key]) || null;
  function genesShort(key, max = 15) {
    const g = testGenes(key);
    if (!g) return TESTS[key].genes;
    if (!g.genes) return `${g.n} genes (PanelApp ${g.panel})`;
    return g.genes.length > max ? `${g.genes.slice(0, max).join(', ')} +${g.genes.length - max} more` : g.genes.join(', ');
  }
  // A test code that opens the criteria panel; hovering shows its name and genes.
  const testBtn = (key, cls = 'code-sm', label = key, note = '') =>
    `<button type="button" class="${cls} test-link" data-test="${esc(key)}" title="${esc(TESTS[key].name)}${note}&#10;Genes: ${esc(genesShort(key))}&#10;Click for the full criteria">${esc(label)}</button>`;

  const link = (label, url) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

  const leafletLi = k => `<li>${link(EG[k].label, EG[k].url)}</li>`;

  /* Leaflets and UK / European / US guidance for a source set {eg, guide, eu, us}. */
  function guidanceHtml(src) {
    const list = (keys, table) => (keys || []).map(k => `<li>${link(table[k][0], table[k][1])}</li>`).join('');
    const eu = list(src.eu, EU_GUIDES), us = list(src.us, US_GUIDES);
    return `<h4>East Genomics patient information</h4>
      <ul>${(src.eg || []).map(leafletLi).join('') || `<li class="muted">No condition-specific leaflet – general leaflets below, or see the ${link('A-Z index', EG_AZ)}</li>${EG_GENERAL.map(leafletLi).join('')}`}</ul>
      <h4>UKCGG patient information</h4>
      <ul>${[...(src.ukl || []), ...UKCGG_GENERAL].map(k => `<li>${link(UKCGG_LEAFLETS[k][0], UKCGG_LEAFLETS[k][1])}</li>`).join('')}</ul>
      <h4>UK guidance</h4>
      <ul>${list(src.guide, GUIDES) || `<li class="muted">No UKCGG gene-specific guideline – see ${link('UKCGG leaflets and guidelines', REF_LINKS.ukcgg)}</li>`}</ul>
      ${eu ? `<h4>European guidance</h4><ul>${eu}</ul>` : ''}
      ${us ? `<h4>US and international guidance</h4><ul>${us}</ul>` : ''}`;
  }

  function grLinks(c) {
    const ref = REFS[c.id];
    return ref.gr.length ? ref.gr.map(n => link(GR_TITLES[n], REF_LINKS.geneReviews(n))).join('; ')
      : `<span class="muted">no chapter – ${link('search GeneReviews', REF_LINKS.geneReviewsSearch(c.genes[0]))}</span>`;
  }
  const omimId = m => `${OMIM_PREFIX[m] || '#'}${m}`;
  const phenoLinks = c => REFS[c.id].omim.map(m => link(`${omimId(m)} ${OMIM_TITLES[m]}`, REF_LINKS.omim(m))).join('; ');
  const geneMimLink = g => link(`${g} *${GENE_MIM[g]}`, REF_LINKS.omim(GENE_MIM[g]));

  // GeNotes (NHS England Genomics Education Programme) pages for one or more conditions, without duplicates.
  function genotesHtml(ids) {
    const seen = new Set(), items = [];
    for (const id of ids) for (const [t, path] of GENOTES[id] || []) if (!seen.has(path)) { seen.add(path); items.push([t, path]); }
    if (!items.length) return '';
    const hub = items.filter(([, p]) => p.startsWith('knowledge-hub/')), clinic = items.filter(([, p]) => !p.startsWith('knowledge-hub/'));
    return `<h4>GeNotes (NHS England Genomics Education)</h4>
      <ul>${hub.map(([t, p]) => `<li>${link(t, GENOTES_BASE + p)} <span class="muted small">Knowledge Hub</span></li>`).join('')}
        ${clinic.map(([t, p]) => `<li>${link(t, GENOTES_BASE + p)} <span class="muted small">In the Clinic</span></li>`).join('')}</ul>`;
  }

  function sourcesHtml(c) {
    const pheno = phenoLinks(c);
    return `<div class="sources">${guidanceHtml(SOURCES[c.id] || {})}
      ${genotesHtml([c.id])}
      <h4>References</h4>
      <ul><li>GeneReviews: ${grLinks(c)}</li>
        ${pheno ? `<li>OMIM phenotype: ${pheno}</li>` : ''}
        <li>OMIM gene: ${c.genes.map(geneMimLink).join(', ')}</li></ul>
    </div>`;
  }

  /* ---------------- Family form ---------------- */

  function optionList(opts, selected, placeholder) {
    return (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '') +
      opts.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }

  // Under each cancer, spell out any abbreviation in the chosen site or histology.
  function abbrHint(dx) {
    const site = SITES[dx.site];
    if (!site) return '';
    const ks = abbrList([site.label, dx.hist ? histLabel(dx.site, dx.hist) : '']);
    return ks.length ? `<p class="abbr-hint">${ks.map(k => `<strong>${k}</strong> = ${esc(ABBREVIATIONS[k])}`).join(' · ')}</p>` : '';
  }

  // Side for paired organs (with the age of the second cancer when both sides), number for tumours that are counted.
  function sideCountHtml(dx) {
    let h = '';
    const opts = sideOptions(dx);
    if (opts) {
      h += `<label class="mk">Side<select data-f="side">${optionList(['', ...opts].map(v => [v, sideLabel(dx, v)]), dx.side)}</select></label>`;
      if (dx.side === 'both') h += `<label class="mk">Age at second${dx.site === 'breast' ? ' breast' : ''} cancer<input type="number" min="0" max="120" inputmode="numeric" data-f="age2" value="${esc(dx.age2)}" placeholder="Age"></label>`;
    }
    if (isCounted(dx)) h += `<label class="mk">Number<input type="number" min="1" inputmode="numeric" data-f="count" value="${esc(dx.count)}" placeholder="1"></label>`;
    return h;
  }
  function renderDx(p, dx) {
    const siteOpts = Object.entries(SITES).map(([k, s]) => [k, s.label]);
    const site = SITES[dx.site];
    let markers = '';
    if (site) {
      for (const m of site.markers || []) {
        if (m === 'count') {
          markers += `<label class="mk">Number<input type="number" min="0" inputmode="numeric" data-f="count" value="${esc(dx.count)}" placeholder="n"></label>`;
        } else if (showMarker(m, dx)) {
          const mo = MARKER_OPTIONS[m];
          markers += `<label class="mk">${abbrHtml(mo.label)}<select data-f="${m}">${optionList(mo.opts, dx[m])}</select></label>`;
        }
      }
    }
    return `<div class="dx" data-did="${dx.id}">
      <input type="search" class="dx-find" list="cancer-finder" data-f="find" placeholder="Type to find a cancer type (e.g. GIST, lobular)…" aria-label="Find a cancer type">
      <div class="dx-main">
        <select data-f="site" aria-label="Site">${optionList(siteOpts, dx.site, 'Cancer site / finding…')}</select>
        <select data-f="hist" aria-label="Histology"${site ? '' : ' disabled'}>${site ? optionList(site.hist, dx.hist, 'Histology / type…') : '<option>Histology…</option>'}</select>
        <input type="number" min="0" max="120" inputmode="numeric" data-f="age" value="${esc(dx.age)}" placeholder="Age" aria-label="Age at diagnosis">
        <button type="button" class="icon-btn" data-act="rm-dx" title="Remove">×</button>
      </div>
      ${abbrHint(dx)}
      ${site ? `<div class="dx-markers">${markers}${sideCountHtml(dx)}</div>` : ''}
    </div>`;
  }

  // A relative with at least one complete cancer folds into a one-line card unless it is being edited.
  const isComplete = p => p.dx.some(d => d.site && d.hist);
  const isOpen = p => !isComplete(p) || state.openPeople.has(p.id);
  function renderPersonCard(p) {
    const isProband = p.rel === 'proband';
    const dxs = p.dx.filter(d => d.site && d.hist);
    const status = personStatus(p);
    return `<section class="person collapsed" data-pid="${p.id}">
      <div class="person-card">
        <button type="button" class="person-open" data-act="edit-person" aria-expanded="false" title="Edit ${esc(personLabel(p))}">
          <span class="pc-who"><strong>${esc(personLabel(p))}</strong>${namedParent(p) ? ` <span class="pc-status">child of ${esc(personLabel(namedParent(p)))}</span>` : ''}${status ? ` <span class="pc-status">${esc(status)}</span>` : ''}</span>
          <span class="pc-dx">${dxs.map(d => `<span>${abbrHtml(dxText(d, p))}</span>`).join('')}</span>
          <span class="pc-edit" aria-hidden="true">✎ Edit</span>
        </button>
        ${isProband ? '' : '<button type="button" class="icon-btn" data-act="rm-person" title="Remove relative">×</button>'}
      </div>
      <div class="person-elig" data-elig-for="${p.id}"></div>
      <div class="person-mss" data-mss-for="${p.id}"></div>
      <div class="person-warn" data-warn-for="${p.id}"></div>
    </section>`;
  }
  // "Child of" row: which entered aunt/uncle, sibling, child, niece or cousin is this relative's parent.
  const PARENT_WORDS = { m_cousin: 'maternal aunt or uncle', p_cousin: 'paternal aunt or uncle', niece: 'brother or sister', grandchild: 'son or daughter',
    gniece: 'niece or nephew', m_cousin_child: 'maternal cousin', p_cousin_child: 'paternal cousin' };
  function childOfHtml(p) {
    const c = parentCandidates(p);
    return `<div class="child-of"><label class="mk">Child of
      <select data-f="parentId">${optionList([['', c.length ? `Not specified – choose the ${PARENT_WORDS[p.rel]}` : `Not specified (add the ${PARENT_WORDS[p.rel]} to choose)`], ...c.map(x => [String(x.id), personLabel(x)])], namedParent(p) ? String(p.parentId) : '')}</select></label></div>`;
  }
  function renderPerson(p) {
    if (!isOpen(p) && !state.printFull) return renderPersonCard(p);
    const isProband = p.rel === 'proband';
    // Two-step choice: relationship, then the side of the family where it matters.
    const [kind, side] = p.rel === 'unset' ? [p.relKind || '', ''] : relParts(p.rel);
    const sides = (REL_KINDS.find(k => k[0] === kind) || [])[2];
    const relSelect = `<select data-f="relKind" aria-label="Relationship">${optionList(REL_KINDS.map(k => [k[0], k[1]]), kind, kind ? null : 'Choose relationship…')}</select>` +
      (sides ? `<select data-f="relSide" aria-label="Side of the family">${optionList(Object.entries(sides).map(([s, v]) => [s, v[1]]), side, side ? null : 'Which side?')}</select>` : '');
    return `<section class="person" data-pid="${p.id}">
      <div class="person-head">
        ${isProband ? '<strong class="proband-label">Proband</strong>' : relSelect}
        <select data-f="sex" aria-label="Sex">${optionList([['F', 'Female'], ['M', 'Male']], p.sex, 'Sex')}</select>
        ${isComplete(p) ? '<button type="button" class="btn-done" data-act="done-person" title="Fold this relative into a one-line summary">Done</button>' : ''}
        ${isProband ? '' : '<button type="button" class="icon-btn" data-act="rm-person" title="Remove relative">×</button>'}
      </div>
      ${PARENT_OF[p.rel] ? childOfHtml(p) : ''}
      <div class="person-elig" data-elig-for="${p.id}"></div>
      <div class="person-mss" data-mss-for="${p.id}"></div>
      <div class="person-warn" data-warn-for="${p.id}"></div>
      <div class="person-extra">
        ${p.deceased
          ? `<label class="mk">Age at death<input type="number" min="0" max="120" inputmode="numeric" data-f="ageDeath" value="${esc(p.ageDeath ?? '')}" placeholder="Age"></label>`
          : `<label class="mk">Age now<input type="number" min="0" max="120" inputmode="numeric" data-f="ageNow" value="${esc(p.ageNow ?? '')}" placeholder="Age"></label>`}
        <label class="mk chk"><input type="checkbox" data-f="deceased"${p.deceased ? ' checked' : ''}>Deceased</label>
        ${isProband ? `<label class="mk chk" title="Manchester score +2 BRCA1, +2 BRCA2 when there is no known cancer history in blood relatives"><input type="checkbox" data-f="adopted"${p.adopted ? ' checked' : ''}>Adopted (no known family history)</label>` : ''}
      </div>
      ${p.dx.map(d => renderDx(p, d)).join('')}
      <button type="button" class="link-btn" data-act="add-dx">+ Add cancer or finding</button>
    </section>`;
  }

  // After opening or folding a card, keep keyboard focus on that person.
  function focusPerson(id) {
    const el = document.querySelector(`#family [data-pid="${id}"]`);
    if (!el) return;
    const target = el.querySelector('.person-open') || el.querySelector('select, input');
    if (target) target.focus({ preventScroll: true });
    if (el.getBoundingClientRect().top < 60) el.scrollIntoView({ block: 'start' });
  }
  function renderFamily() {
    $('#family').innerHTML = state.people.map(renderPerson).join('');
    if (typeof updateFormTags === 'function') setTimeout(updateFormTags);
  }

  function findTarget(el) {
    const pEl = el.closest('[data-pid]');
    const p = pEl && state.people.find(x => x.id === +pEl.dataset.pid);
    const dEl = el.closest('[data-did]');
    const dx = p && dEl && p.dx.find(x => x.id === +dEl.dataset.did);
    return { p, dx };
  }

  function onFamilyInput(e) {
    const el = e.target;
    const f = el.dataset.f;
    if (!f) return;
    const { p, dx } = findTarget(el);
    if (!p) return;
    state.openPeople.add(p.id); // stays open while being edited
    const val = el.type === 'checkbox' ? el.checked : el.value;
    if (f === 'find') {
      if (e.type === 'change') return;
      const hit = FINDER.get(val);
      if (hit) el.blur();
      if (hit && dx) { Object.assign(dx, { ...newDx(), id: dx.id, site: hit[0], hist: hit[1], age: dx.age }); renderFamily(); renderResults(); }
      return;
    }
    if (dx) {
      dx[f] = val;
      if (f === 'site') { Object.assign(dx, { ...newDx(), id: dx.id, site: val, age: dx.age }); renderFamily(); }
      if (f === 'side') { if (val !== 'both') dx.age2 = ''; renderFamily(); }
      if (f === 'hist') {
        if (!sideOptions(dx)) { dx.side = ''; dx.age2 = ''; }
        if (!isCounted(dx) && dx.site !== 'polyps') dx.count = '';
        if (!showMarker('ovgrade', dx)) dx.ovgrade = '';
        // Show or hide the Side / Number boxes when the histology changes which apply.
        const box = el.closest('.dx');
        if (!!box.querySelector('[data-f=side]') !== !!sideOptions(dx) || (!!box.querySelector('[data-f=ovgrade]') !== (dx.site === 'ovary' && showMarker('ovgrade', dx))) || (!!box.querySelector('[data-f=count]') !== (isCounted(dx) || dx.site === 'polyps'))) { renderFamily(); renderResults(); return; }
      }
      if (f === 'hist') {
        const box = el.closest('.dx'), old = box.querySelector('.abbr-hint');
        if (old) old.remove();
        box.querySelector('.dx-main').insertAdjacentHTML('afterend', abbrHint(dx));
      }
    } else {
      p[f] = val;
      if (f === 'parentId') p.parentId = val === '' ? null : +val;
      if (f === 'relKind' || f === 'relSide') {
        delete p[f];
        const k = REL_KINDS.find(x => x[0] === (f === 'relKind' ? val : (p.rel === 'unset' ? p.relKind : relParts(p.rel)[0])));
        // Keep the side already chosen when switching between relationships that have one.
        const s = f === 'relSide' ? val : relParts(p.rel)[1];
        const rel = !k ? 'unset' : !k[2] ? k[0] : k[2][s] ? k[2][s][0] : 'unset';
        if (rel === 'unset') p.relKind = k ? k[0] : ''; else delete p.relKind;
        p.rel = rel;
        if (REL[rel].sex) p.sex = REL[rel].sex;
        if (!namedParent(p)) p.parentId = null;
        renderFamily();
      }
      if (f === 'deceased') renderFamily();
    }
    // Offer "Done" as soon as the relative has a complete cancer (without redrawing the form being typed in).
    const pEl = el.closest('.person');
    if (pEl && isComplete(p) && !pEl.querySelector('[data-act=done-person]')) {
      const head = pEl.querySelector('.person-head'), rm = head && head.querySelector('[data-act=rm-person]');
      if (head) head.insertBefore(Object.assign(document.createElement('button'), { type: 'button', className: 'btn-done', textContent: 'Done', title: 'Fold this relative into a one-line summary' }), rm || null).dataset.act = 'done-person';
    }
    renderResults();
  }

  function onFamilyClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { p, dx } = findTarget(btn);
    const before = JSON.stringify(state.people);
    switch (btn.dataset.act) {
      case 'add-dx': p.dx.push(newDx()); break;
      case 'rm-dx': p.dx = p.dx.filter(x => x !== dx); if (!p.dx.length) p.dx.push(newDx());
        if (dx.site) offerUndo(`${dx.site ? SITES[dx.site].label : 'Cancer'} removed from ${personLabel(p)}.`, before); break;
      case 'rm-person': state.people = state.people.filter(x => x !== p); offerUndo(`${personLabel(p)} removed.`, before); break;
      case 'edit-person': state.openPeople.add(p.id); renderFamily(); focusPerson(p.id); return;
      case 'done-person': state.openPeople.delete(p.id); renderFamily(); focusPerson(p.id); return;
      default: return;
    }
    renderFamily();
    renderResults();
  }

  /* ---------------- Find a cancer type, undo, save / open ---------------- */
  // "Histology — Site" → [site, hist]; abbreviations are spelled out so typing either form finds it.
  const FINDER = new Map();
  for (const [sk, st] of Object.entries(SITES)) for (const [hk, hl] of st.hist) {
    const ab = abbrList([hl, st.label]).map(k => `${k} = ${ABBREVIATIONS[k]}`);
    FINDER.set(`${hl} — ${st.label}${ab.length ? ` (${ab.join('; ')})` : ''}`, [sk, hk]);
  }

  let toastTimer;
  function offerUndo(msg, snapshot) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span><button type="button" class="link-btn" id="undo">Undo</button>`;
    t.hidden = false;
    $('#undo').onclick = () => { state.people = JSON.parse(snapshot); t.hidden = true; renderFamily(); renderResults(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 8000);
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
  }

  // Family files stay on the user's own computer.
  const familyData = () => ({ app: 'cancer-predisposition-differential', version: 1, ancestry: state.ancestry, people: state.people });
  function loadFamily(data) {
    showExampleNote(null);
    if (!data || !Array.isArray(data.people)) throw new Error('not a family file');
    const src = data.people.filter(p => REL[p.rel]);
    const people = src.map(p => ({
      ...newPerson(p.rel), sex: ['F', 'M'].includes(p.sex) ? p.sex : '', oldParent: p.parentId ?? null,
      ageNow: p.ageNow ?? '', deceased: !!p.deceased, ageDeath: p.ageDeath ?? '', adopted: !!p.adopted && p.rel === 'proband',
      dx: (p.dx || []).map(d => {
        const site = SITES[d.site] ? d.site : '';
        const hist = site && SITES[site].hist.some(h => h[0] === d.hist) ? d.hist : '';
        const nd = { ...newDx(), ...Object.fromEntries(Object.entries(d).filter(([k]) => k in newDx() && k !== 'id')), site, hist };
        // Older files had one "bilateral / multifocal / multiple" tick: both sides for paired organs, 2 for counted tumours.
        if (d.bilat && !nd.side && !nd.count) {
          const opts = sideOptions(nd);
          if (opts) nd.side = opts.includes('both') ? 'both' : 'multi';
          else if (isCounted(nd)) nd.count = '2';
        }
        return nd;
      })
    }));
    // Saved ids are renumbered on loading; carry each "Child of" link across.
    const idMap = new Map(src.map((p, i) => [p.id, people[i].id]));
    people.forEach(p => { p.parentId = p.oldParent != null && idMap.has(p.oldParent) ? idMap.get(p.oldParent) : null; delete p.oldParent; });
    if (!people.some(p => p.rel === 'proband')) people.unshift(newPerson('proband'));
    people.forEach(p => { if (!p.dx.length) p.dx.push(newDx()); });
    state.people = people;
    state.openPeople.clear();
    state.ancestry = ['ashkenazi', 'westray', 'whalsay', 'maori', 'other_founder'].includes(data.ancestry) ? data.ancestry : '';
    $('#ancestry').value = state.ancestry;
    renderFamily(); renderResults();
  }
  function saveFamilyFile() {
    const blob = new Blob([JSON.stringify(familyData(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `family-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Family saved to your downloads.');
  }
  const REMEMBER_KEY = 'cpd-family-v1';
  function remember() {
    try { if (localStorage.getItem(REMEMBER_KEY + ':on') === '1') localStorage.setItem(REMEMBER_KEY, JSON.stringify(familyData())); } catch (e) { /* storage unavailable */ }
  }

  /* ---------------- Results ---------------- */

  function evidenceLine(ev) {
    const { person, dx, s } = ev;
    const bits = [`<span class="tier tier-${s.tier}" title="${esc(tierTitle(s.tier))}">${TIER_LABEL[s.tier]}</span>`];
    const notes = [...s.notes, ...s.modNotes];
    return `<li>${bits.join('')} <strong>${esc(personLabel(person))}</strong> — ${abbrHtml(dxText(dx, person))}${notes.length ? ` <span class="muted">· ${esc(notes.join('; '))}</span>` : ''}</li>`;
  }

  function associationsHtml(cond) {
    const order = { H: 0, S: 1, M: 2, W: 3 };
    return cond.rules.map(ruleText).sort((a, b) => order[a.tier] - order[b.tier])
      .map(r => `<li><span class="tier tier-${r.tier}" title="${esc(tierTitle(r.tier))}">${TIER_LABEL[r.tier]}</span> ${abbrHtml(r.text)}</li>`).join('');
  }

  // One plain-language line on why a syndrome scored where it did.
  function whyRanked(r) {
    const n = { H: 0, S: 0, M: 0, W: 0 };
    r.evidence.forEach(e => n[e.s.tier]++);
    const tiers = ['H', 'S', 'M', 'W'].filter(t => n[t]).map(t => `${n[t]} ${TIER_LABEL[t]}`);
    const people = new Set(r.evidence.map(e => e.person.id)).size;
    const sides = [...new Set(r.evidence.map(e => REL[e.person.rel].side))];
    const sideTxt = sides.includes('M') && sides.includes('P') ? 'both sides of the family' : sides.includes('M') ? 'maternal side' : sides.includes('P') ? 'paternal side' : 'proband and close relatives';
    const early = r.evidence.filter(e => e.s.notes.some(x => /early onset/.test(x))).length;
    const fw = FREQ_WEIGHT[FREQ_BAND[r.cond.id] || 4];
    return `${tiers.join(' + ')} match${r.evidence.length > 1 ? 'es' : ''} in ${people} ${people > 1 ? 'people' : 'person'}, ${sideTxt}${early ? `; early onset in ${early}` : ''}${fw < 1 ? `; rarer syndrome ×${fw}` : ''}.`;
  }
  const founderNote = c => state.ancestry === 'ashkenazi' ? (VARIANT_NOTES[c.id] || []).filter(([t]) => /Ashkenazi/.test(t)) : [];

  function resultCard(r, i, top) {
    const c = r.cond;
    const pct = Math.max(4, Math.round((r.score / top) * 100));
    const compact = i >= 3 && !state.expanded.has(c.id) && !state.printFull;
    const notes = [];
    if (c.note) notes.push(c.note);
    if (c.notOnNicpr) notes.push('Not on the NICPR gene list (June 2026) but included in Test Directory panels.');
    const inTree = c.id === state.treeSyn;
    const head = `<article class="result${inTree ? ' in-tree' : ''}${compact ? ' compact' : ''}" data-cond="${c.id}">
      <div class="result-head" title="Highlight in the family tree">
        <span class="rank">${i + 1}</span>
        <div class="result-title">
          <h3>${esc(c.name)}</h3>
          <div class="genes">${geneChips(c.genes)} <span class="inh">${esc(c.inh)}</span></div>
        </div>
        <span class="score" title="Relative score">${r.score.toFixed(1)}</span>
      </div>
      ${inTree ? '<p class="tree-tag small">Highlighted in the family tree</p>' : ''}
      <div class="bar" role="img" aria-label="${r.score.toFixed(1)} points, ${pct}% of the top score"><span style="width:${pct}%"></span></div>
      <div class="bar-label"><span>${r.score.toFixed(1)} points</span><span>${i === 0 ? 'top match' : `${pct}% of top`}</span></div>`;
    if (compact) return `${head}
      <p class="why small">${esc(whyRanked(r))}</p>
      <button type="button" class="link-btn small" data-expand="${c.id}">Show details ▾</button>
    </article>`;
    return `${head}
      <p class="why small"><strong>Why here:</strong> ${esc(whyRanked(r))}</p>
      <ul class="evidence">${r.evidence.map(evidenceLine).join('')}</ul>
      ${notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
      ${founderNote(c).map(([t, src]) => `<p class="note founder"><strong>Ashkenazi Jewish ancestry:</strong> ${esc(t)} <span class="ev-src">${evLinks(src)}</span></p>`).join('')}
      <p class="tests-line small">Tests: ${c.tests.map(k => testBtn(k)).join(' ') || 'none listed'}</p>
      <details><summary>All associations</summary><ul class="assoc">${associationsHtml(c)}</ul></details>
      <details><summary>Leaflets, guidance &amp; sources</summary>${sourcesHtml(c)}</details>
      <a class="small syn-open" href="#syndrome=${c.id}">Open syndrome page →</a>
      ${i >= 3 ? `<button type="button" class="link-btn small" data-collapse="${c.id}">Show less ▴</button>` : ''}
    </article>`;
  }
  const tierTitle = t => `${TIER_LABEL[t][0].toUpperCase() + TIER_LABEL[t].slice(1)} (${TIER[t]} points) – yield: ${TIER_DEFS[t].yield}; carrier risk: ${TIER_DEFS[t].risk}`;
  const TIER_LEGEND = `<p class="tier-legend small">Strength: ${['H', 'S', 'M', 'W'].map(t => `<span class="tier tier-${t}" title="${esc(tierTitle(t))}">${TIER_LABEL[t]}</span>`).join(' ')} <button type="button" class="link-btn" data-goto-ranking>How strength is defined</button></p>`;

  function testsSummary(shown) {
    const map = new Map();
    shown.forEach((r, i) => r.cond.tests.forEach(t => {
      if (!map.has(t)) map.set(t, { rank: i, conds: [] });
      map.get(t).conds.push(r.cond);
    }));
    return [...map.entries()].sort((a, b) => a[1].rank - b[1].rank);
  }

  // One line per test: who in the family meets it now (or may), and which suggested syndromes it covers.
  // The exact criteria open from the code (criteria panel).
  function renderTests(shown) {
    const list = testsSummary(shown);
    if (!list.length) return '';
    const elig = checkEligibility(state.people, state.ancestry);
    const who = (key, possible) => [...new Set(elig.filter(o => o.test === key && !!o.possible === possible).map(o => personLabel(o.person)))];
    return `<details class="tests-compact"${state.printFull || state.testsOpen ? ' open' : ''}>
      <summary><h2>All Test Directory tests for these syndromes (${list.length})</h2></summary>
      <p class="muted small">Click a code for the exact criteria, who in the family meets them and the genes tested.</p>
      <ul class="test-rows">${list.map(([key, info]) => {
        const t = TESTS[key], meets = who(key, false), maybe = who(key, true);
        const conds = info.conds.map(c => c.name);
        return `<li${meets.length || maybe.length ? ' class="tr-family"' : ''}>${testBtn(key)} <span class="tr-name">${esc(t.name)}</span>${t.part ? ` <span class="muted small">Part ${esc(t.part)}</span>` : ''}
          ${meets.length ? `<span class="tr-meets">Meets now: ${esc(meets.join(', '))}</span>` : ''}${maybe.length ? `<span class="tr-maybe">May meet: ${esc(maybe.join(', '))}</span>` : ''}
          <span class="tr-for small muted">For ${esc(conds.slice(0, 3).join('; '))}${conds.length > 3 ? ` and ${conds.length - 3} more` : ''}</span></li>`;
      }).join('')}</ul>
      <p class="muted small">Unaffected individuals with no living affected relative: ${testBtn('R404')} ${esc(TESTS.R404.name)}. For deceased probands, stored DNA or tissue is needed with no living affected relative, after cancer genetics MDT. ${link(TD_VERSION, TD_URL)}.</p>
    </details>`;
  }

  /* ---------------- Family tree (pedigree) ----------------
   * Built from the relations entered. Relatives who were not entered but are needed to connect the
   * family (parents, grandparents, a partner, an aunt for a cousin…) are drawn faintly as "implied".
   * People with a cancer that scores for the highlighted syndrome are filled blue; other cancers grey.
   */
  const PED_SHORT = {
    proband: 'Proband', mother: 'Mother', father: 'Father', sister: 'Sister', brother: 'Brother', daughter: 'Daughter', son: 'Son',
    m_gm: 'Mat. grandmother', m_gf: 'Mat. grandfather', m_aunt: 'Mat. aunt', m_uncle: 'Mat. uncle',
    p_gm: 'Pat. grandmother', p_gf: 'Pat. grandfather', p_aunt: 'Pat. aunt', p_uncle: 'Pat. uncle',
    m_halfsib: 'Mat. half-sibling', p_halfsib: 'Pat. half-sibling', niece: 'Niece / nephew', grandchild: 'Grandchild',
    m_cousin: 'Mat. cousin', p_cousin: 'Pat. cousin', m_great: 'Mat. great-aunt/uncle', p_great: 'Pat. great-aunt/uncle',
    m_other: 'Other (maternal)', p_other: 'Other (paternal)', other: 'Other relative',
    m_ggp: 'Mat. great-grandparent', p_ggp: 'Pat. great-grandparent', gniece: 'Great-niece/nephew',
    m_cousin_child: "Mat. cousin's child", p_cousin_child: "Pat. cousin's child", unset: 'Relative (relationship?)'
  };
  const PED = { SW: 124, S: 24, LINE: 13, TOP: 26, PAD: 16 };
  const shortText = (s, n) => { s = s.split(/ \/ | \(|;/)[0].trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function buildPedigree(people) {
    const by = rel => people.filter(p => p.rel === rel);
    const pedLabel = p => PED_SHORT[p.rel] + (relNumber(p) ? ` ${relNumber(p)}` : '');
    const node = (p, extra = {}) => ({ p, implied: !p, sex: p ? p.sex : '', label: p ? pedLabel(p) : '', kids: [], partner: null, dashed: false, ...extra });
    const implied = (label, sex = '') => node(null, { label, sex });
    const withKids = (n, kids) => { n.kids = kids; if (kids.length) n.partner = implied('Partner', n.sex === 'F' ? 'M' : n.sex === 'M' ? 'F' : ''); return n; };
    const proband = people.find(p => p.rel === 'proband');
    const anyOf = rels => rels.some(r => by(r).length);
    // Hang children under the parent named in "Child of"; children with no named parent go under one implied parent
    // (labelled "not specified") so no entered relative is shown as their parent.
    const hang = (parents, kids, impliedLabel) => {
      if (!kids.length) return parents;
      const byParent = new Map(parents.map(n => [n.p ? n.p.id : null, []]));
      const loose = [];
      for (const k of kids) { const pid = k.p && k.p.parentId; if (pid != null && byParent.has(pid) && pid !== null) byParent.get(pid).push(k); else loose.push(k); }
      for (const n of parents) { const ks = byParent.get(n.p ? n.p.id : null) || []; if (ks.length) withKids(n, [...n.kids, ...ks]); }
      if (loose.length) parents.push(withKids(implied(impliedLabel), loose));
      return parents;
    };

    // Proband's descendants: grandchildren hang from their named parent.
    const children = hang([...by('daughter'), ...by('son')].map(p => node(p)), by('grandchild').map(p => node(p)), 'Child (not specified)');
    const probandNode = withKids(node(proband), children);
    probandNode.proband = true;

    const needParents = people.some(p => !['proband', 'son', 'daughter', 'grandchild'].includes(p.rel));
    if (!needParents) return { core: probandNode };

    // Siblings; nieces / nephews hang from the first sibling (implied if none). Half-siblings get dashed links.
    const nieces = hang(by('niece').map(p => node(p)), by('gniece').map(p => node(p)), 'Niece/nephew (not specified)');
    const halfM = by('m_halfsib').map(p => node(p, { dashed: true })), halfP = by('p_halfsib').map(p => node(p, { dashed: true }));
    const sibs = hang([...by('sister'), ...by('brother')].map(p => node(p)), [], '');
    // Nieces / nephews under their named sibling (full or half); otherwise under an implied sibling.
    const sibPool = [...halfM, ...sibs, ...halfP];
    hang(sibPool, nieces, 'Sibling (not specified)');
    const extraSib = sibPool.slice(halfM.length + sibs.length + halfP.length);
    const coreKids = [...halfM, ...sibs, ...extraSib, probandNode, ...halfP];
    const mother = by('mother')[0], father = by('father')[0];
    const momNode = mother ? node(mother) : implied('Mother', 'F');
    const dadNode = father ? node(father) : implied('Father', 'M');
    momNode.kids = coreKids; momNode.partner = dadNode;
    // Extra people entered as a second mother/father are shown with the "other" relatives.
    const extra = [...by('mother').slice(1), ...by('father').slice(1)];

    const side = (s) => {
      const pre0 = s === 'm' ? 'Mat.' : 'Pat.';
      const cousins = hang(by(s + '_cousin').map(p => node(p)), by(s + '_cousin_child').map(p => node(p)), `${pre0} cousin (not specified)`);
      const aunts = hang([...by(s + '_aunt'), ...by(s + '_uncle')].map(p => node(p)), cousins, `${pre0} aunt/uncle (not specified)`);
      const need = anyOf([s + '_aunt', s + '_uncle', s + '_cousin', s + '_cousin_child', s + '_great', s + '_gm', s + '_gf', s + '_ggp']);
      const gm = by(s + '_gm')[0], gf = by(s + '_gf')[0];
      const pre = s === 'm' ? 'Mat.' : 'Pat.';
      return {
        aunts, need,
        gf: gf ? node(gf) : implied(`${pre} grandfather`, 'M'),
        gm: gm ? node(gm) : implied(`${pre} grandmother`, 'F'),
        great: by(s + '_great').map(p => node(p, { dashed: true })),
        ggp: (() => { const g = by(s + '_ggp').map(p => node(p)); if (g.length === 1) g.push(implied('Partner', g[0].sex === 'F' ? 'M' : g[0].sex === 'M' ? 'F' : '')); return g; })(),
        extraGp: [...by(s + '_gm').slice(1), ...by(s + '_gf').slice(1)]
      };
    };
    return { parents: momNode, mat: side('m'), pat: side('p'), extra };
  }

  // Width (in slots) of a person with their partner and descendants.
  const unitWidth = n => Math.max(n.partner ? 2 : 1, n.kids.reduce((a, k) => a + unitWidth(k), 0));

  // Place a unit with its left edge at l in generation g. Returns the person's centre.
  function placeUnit(n, l, g, out) {
    const w = unitWidth(n);
    const mid = l + w / 2;
    n.x = n.partner ? mid - 0.5 : mid; n.g = g; out.push(n);
    if (n.partner) { n.partner.x = mid + 0.5; n.partner.g = g; out.push(n.partner); out.couples.push([n, n.partner]); }
    let cur = l + (w - n.kids.reduce((a, k) => a + unitWidth(k), 0)) / 2;
    for (const k of n.kids) { placeUnit(k, cur, g + 1, out); cur += unitWidth(k); }
    if (n.kids.length) out.sibships.push({ from: mid, g, kids: n.kids });
    return n.x;
  }

  function layoutPedigree(people) {
    const t = buildPedigree(people);
    const out = []; out.couples = []; out.sibships = []; out.dashedBars = [];
    if (t.core) { placeUnit(t.core, 0, 2, out); }
    else {
      const W = unitWidth(t.parents);
      placeUnit(t.parents, 0, 1, out);
      const mom = t.parents, dad = t.parents.partner;
      // Aunts and uncles: maternal to the left of everything below the parents, paternal to the right.
      let r = 0;
      for (const a of [...t.mat.aunts].reverse()) { const w = unitWidth(a); placeUnit(a, r - w, 1, out); r -= w; }
      let l = W;
      for (const a of t.pat.aunts) { placeUnit(a, l, 1, out); l += unitWidth(a); }
      const sibsOf = (s, parent) => [...s.aunts, parent];
      const gp = (s, parent, isMat) => {
        if (!s.need) return null;
        const xs = sibsOf(s, parent).map(n => n.x);
        const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
        s.gf.x = mid - 0.5; s.gm.x = mid + 0.5; s.gf.g = s.gm.g = 0;
        return { s, parent, mid, isMat };
      };
      const m = gp(t.mat, mom, true), p = gp(t.pat, dad, false);
      if (m && p && m.s.gm.x + 1 > p.s.gf.x) {
        const d = (m.s.gm.x + 1 - p.s.gf.x) / 2;
        for (const n of [m.s.gf, m.s.gm]) n.x -= d;
        for (const n of [p.s.gf, p.s.gm]) n.x += d;
        m.mid -= d; p.mid += d;
      }
      for (const q of [m, p].filter(Boolean)) {
        out.push(q.s.gf, q.s.gm); out.couples.push([q.s.gf, q.s.gm]);
        out.sibships.push({ from: q.mid, g: 0, kids: sibsOf(q.s, q.parent) });
        // Great-aunts / uncles sit beside the grandparents, linked by a dashed sibship line (which grandparent is not recorded).
        const anchor = q.isMat ? q.s.gf : q.s.gm;
        q.s.great.forEach((n, i) => { n.x = anchor.x + (q.isMat ? -(i + 1) : i + 1); n.g = 0; out.push(n); });
        if (q.s.great.length) out.dashedBars.push([anchor, ...q.s.great]);
        // Great-grandparents sit above the grandparents, linked by a dashed line (which grandparent's parents is not recorded).
        if (q.s.ggp.length) {
          const gpMid = (q.s.gf.x + q.s.gm.x) / 2, w = q.s.ggp.length;
          q.s.ggp.forEach((n, i) => { n.x = gpMid - (w - 1) / 2 + i; n.g = -1; out.push(n); });
          if (w >= 2) out.couples.push([q.s.ggp[0], q.s.ggp[1]]);
          out.sibships.push({ from: w >= 2 ? (q.s.ggp[0].x + q.s.ggp[1].x) / 2 : q.s.ggp[0].x, g: -1, kids: [anchor], dashed: true });
        }
      }
      t.otherExtra = [...t.extra, ...t.mat.extraGp, ...t.pat.extraGp];
    }
    // Relatives without a fixed position go on a separate row.
    const others = [...people.filter(p => ['m_other', 'p_other', 'other', 'unset'].includes(p.rel)), ...(t.otherExtra || [])];
    const minX = Math.min(...out.map(n => n.x));
    others.forEach((p, i) => { const n = { p, implied: false, sex: p.sex, label: PED_SHORT[p.rel], kids: [], x: minX + i, g: 5, loose: true }; out.push(n); });
    return out;
  }

  // Proband arrow from (x1, y1) to the tip (x2, y2); the head is built along the shaft so it points at the symbol.
  function pedArrow(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, L = 9, W = 4.5;
    const bx = x2 - ux * L, by = y2 - uy * L;
    const f = v => v.toFixed(1);
    return `<path class="ped-arrow" d="M${f(x1)} ${f(y1)}L${f(bx)} ${f(by)}"/>` +
      `<path class="ped-arrowhead" d="M${f(x2)} ${f(y2)}L${f(bx - uy * W)} ${f(by + ux * W)}L${f(bx + uy * W)} ${f(by - ux * W)}Z"/>`;
  }

  function pedigreeSvg(people, result) {
    const nodes = layoutPedigree(people);
    const elig = eligByPerson();
    const hitDx = new Set(result ? result.evidence.map(e => e.dx.id) : []);
    const { SW, S, LINE, TOP, PAD } = PED;
    // Label lines for each person: relation, then up to three cancers ("Breast 38" + short histology).
    for (const n of nodes) {
      n.lines = [{ t: n.label, cls: n.implied ? 'ped-l ped-l-imp' : 'ped-l ped-rel' }];
      if (n.implied) continue;
      const st = n.p.deceased ? (has(n.p.ageDeath) ? `d. ${n.p.ageDeath}` : 'deceased') : (has(n.p.ageNow) ? `age ${n.p.ageNow}` : '');
      if (st) n.lines.push({ t: st, cls: 'ped-l ped-hist' });
      const e = elig.get(n.p.id) || { meets: [], maybe: [] };
      n.elig = e.meets;
      // Long lists of codes are shortened ("+1") so labels do not run into neighbours; all codes are in the hover text.
      if (e.meets.length) n.lines.push({ t: `Meets ${e.meets.slice(0, 2).join(', ')}${e.meets.length > 2 ? ` +${e.meets.length - 2}` : ''}`, cls: 'ped-l ped-elig', pre: 'Meets ', codes: e.meets });
      if (e.maybe.length) n.lines.push({ t: `May meet ${e.maybe.slice(0, 2).join(', ')}${e.maybe.length > 2 ? ` +${e.maybe.length - 2}` : ''}`, cls: 'ped-l ped-maybe', pre: 'May meet ', codes: e.maybe });
      const dxs = n.p.dx.filter(d => d.site && d.hist);
      n.affected = dxs.length > 0;
      n.hit = dxs.some(d => hitDx.has(d.id));
      dxs.slice(0, 3).forEach(d => {
        const cls = hitDx.has(d.id) ? ' ped-hit' : '';
        n.lines.push({ t: shortText(SITES[d.site].label, 16) + (d.age !== '' ? ' ' + d.age : ''), cls: 'ped-l ped-dx' + cls });
        const h = histLabel(d.site, d.hist);
        if (!/^(any|other)/i.test(h)) n.lines.push({ t: shortText(h, 20), cls: 'ped-l ped-hist' + cls });
        // Side (with the second cancer's age) and number of tumours, when entered.
        const sn = [d.side ? sideLabel(d, d.side).replace(/ \(one (side|eye)\)/, '') + (d.side === 'both' && has(d.age2) ? `, 2nd ${d.age2}` : '') : '',
          (isCounted(d) && +d.count > 1) ? `${d.count} tumours` : ''].filter(Boolean).join(' · ');
        if (sn) n.lines.push({ t: shortText(sn, 22), cls: 'ped-l ped-hist' + cls });
      });
      if (dxs.length > 3) n.lines.push({ t: `+${dxs.length - 3} more`, cls: 'ped-l ped-hist' });
      n.title = `${personLabel(n.p)}${personStatus(n.p) ? ` (${personStatus(n.p)})` : ''}${dxs.length ? ': ' + dxs.map(d => dxText(d, n.p)).join('; ') : ' – no cancer entered'}`;
    }
    // Row heights from the tallest label in each generation.
    const gens = [...new Set(nodes.map(n => n.g))].sort((a, b) => a - b);
    const rowY = {}; let y = TOP;
    for (const g of gens) {
      rowY[g] = y + (g === 5 ? 18 : 0);
      const lines = Math.max(...nodes.filter(n => n.g === g).map(n => n.lines.length));
      y = rowY[g] + S + 6 + lines * LINE + 30;
    }
    const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
    const X = x => PAD + (x - minX + 0.5) * SW;
    const cy = n => rowY[n.g] + S / 2;
    const W = Math.round(X(maxX) + SW / 2 + PAD), H = Math.round(y - 14);
    const parts = [];
    // Lines first, so symbols sit on top.
    for (const [a, b] of nodes.couples || []) parts.push(`<line class="ped-line" x1="${X(a.x)}" y1="${cy(a)}" x2="${X(b.x)}" y2="${cy(b)}"/>`);
    const sibBar = (from, g, kids, dashedAll) => {
      const barY = rowY[g + 1] - 14;
      const xs = kids.map(k => X(k.x));
      parts.push(`<line class="ped-line" x1="${X(from)}" y1="${rowY[g] + S / 2}" x2="${X(from)}" y2="${barY}"/>`);
      parts.push(`<line class="ped-line" x1="${Math.min(X(from), ...xs)}" y1="${barY}" x2="${Math.max(X(from), ...xs)}" y2="${barY}"/>`);
      kids.forEach(k => parts.push(`<line class="ped-line${k.dashed || dashedAll ? ' ped-dash' : ''}" x1="${X(k.x)}" y1="${barY}" x2="${X(k.x)}" y2="${rowY[k.g]}"/>`));
    };
    for (const s of nodes.sibships || []) sibBar(s.from, s.g, s.kids, s.dashed);
    for (const grp of nodes.dashedBars || []) {
      const barY = rowY[0] - 14, xs = grp.map(n => X(n.x));
      parts.push(`<line class="ped-line ped-dash" x1="${Math.min(...xs)}" y1="${barY}" x2="${Math.max(...xs)}" y2="${barY}"/>`);
      grp.forEach(n => parts.push(`<line class="ped-line ped-dash" x1="${X(n.x)}" y1="${barY}" x2="${X(n.x)}" y2="${rowY[0]}"/>`));
    }
    if (gens.includes(5)) parts.push(`<text class="ped-l ped-hist" x="${PAD}" y="${rowY[5] - 8}">Other relatives (position in family not specified)</text>`);
    for (const n of nodes) {
      const x = X(n.x), top = rowY[n.g], c = cy(n);
      const cls = `ped-sym${n.implied ? ' ped-imp' : n.hit ? ' ped-hitfill' : n.affected ? ' ped-aff' : ''}`;
      const shape = n.sex === 'M' ? `<rect class="${cls}" x="${x - S / 2}" y="${top}" width="${S}" height="${S}"/>`
        : n.sex === 'F' ? `<circle class="${cls}" cx="${x}" cy="${c}" r="${S / 2}"/>`
        : `<path class="${cls}" d="M${x} ${top - 1}L${x + S / 2 + 1} ${c}L${x} ${top + S + 1}L${x - S / 2 - 1} ${c}Z"/>`;
      const text = n.lines.map((l, i) => `<text class="${l.cls}" x="${x}" y="${top + S + 16 + i * LINE}" text-anchor="middle">${l.codes ? esc(l.pre) + l.codes.slice(0, 2).map(c => `<tspan class="ped-test" data-test="${esc(c.replace('*', ''))}">${esc(c)}</tspan>`).join(', ') + (l.codes.length > 2 ? ` <tspan class="ped-more">+${l.codes.length - 2}<title>${esc(l.codes.join(', '))}</title></tspan>` : '') : esc(l.t)}</text>`).join('');
      const arrow = n.proband ? pedArrow(x - S / 2 - 24, top - 8, x - S / 2 - 1, top + 9) : '';
      const ring = n.elig && n.elig.length ? `<rect class="ped-elig-ring" x="${x - S / 2 - 5}" y="${top - 5}" width="${S + 10}" height="${S + 10}" rx="${n.sex === 'F' ? S / 2 + 5 : 4}"/>` : '';
      const slash = n.p && n.p.deceased ? `<line class="ped-dead" x1="${x - S / 2 - 5}" y1="${top + S + 5}" x2="${x + S / 2 + 5}" y2="${top - 5}"/>` : '';
      parts.push(`<g class="ped-person${n.p ? '' : ' implied'}"${n.p ? ` data-person="${n.p.id}"` : ''}>${n.title ? `<title>${esc(n.title)}</title>` : ''}${ring}${shape}${slash}${arrow}${text}</g>`);
    }
    return `<svg class="ped-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Family tree${result ? ', highlighting ' + esc(result.cond.name) : ''}" aria-describedby="ped-text">${parts.join('')}</svg>`;
  }

  // Fixed light colours for downloaded images (the page itself uses CSS so dark mode works).
  const PED_EXPORT_CSS = `.ped-line{stroke:#4c6272;stroke-width:1.5;fill:none}.ped-dash{stroke-dasharray:4 3}
    .ped-sym{fill:#fff;stroke:#212b32;stroke-width:2}.ped-aff{fill:#768692}.ped-hitfill{fill:#005eb8;stroke:#003087}
    .ped-imp{fill:#fff;stroke:#aeb7bd;stroke-dasharray:3 2}.ped-arrow{stroke:#212b32;stroke-width:2}.ped-dead{stroke:#212b32;stroke-width:2}.ped-elig{fill:#007f3b;font-weight:700}.ped-maybe{fill:#8a5a00;font-weight:700}.ped-elig-ring{fill:none;stroke:#007f3b;stroke-width:2.5;stroke-dasharray:5 3}.ped-arrowhead{fill:#212b32}
    .ped-l{font:11px Arial,Helvetica,sans-serif;fill:#212b32}.ped-rel{font-weight:700}.ped-l-imp{fill:#768692;font-style:italic}
    .ped-hist{font-size:10px;fill:#4c6272}.ped-hit{fill:#005eb8;font-weight:700}`;

  function pedigreeExport(kind) {
    const svg = $('#ped-wrap svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    const w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
    const caption = [state.treeSyn && COND[state.treeSyn] ? 'Highlighted: ' + COND[state.treeSyn].name : '',
      `Cancer Family History Navigator · ${new Date().toLocaleDateString('en-GB')} · clinical decision support only`].filter(Boolean);
    const W = Math.max(w, Math.max(...caption.map(c => c.length)) * 5.6 + 2 * PED.PAD), H = h + 8 + caption.length * 14;
    clone.setAttribute('width', W); clone.setAttribute('height', H); clone.setAttribute('viewBox', `${(w - W) / 2} 0 ${W} ${H}`);
    clone.insertAdjacentHTML('afterbegin', `<style>${PED_EXPORT_CSS}</style><rect x="${(w - W) / 2}" width="${W}" height="${H}" fill="#fff"/>`);
    clone.insertAdjacentHTML('beforeend', caption.map((c, i) => `<text class="ped-l ped-hist" x="${(w - W) / 2 + PED.PAD}" y="${h + 6 + i * 14}">${esc(c)}</text>`).join(''));
    const src = new XMLSerializer().serializeToString(clone);
    const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    if (kind === 'svg') return save(new Blob([src], { type: 'image/svg+xml' }), 'family-tree.svg');
    const img = new Image();
    img.onload = () => {
      const scale = 2, cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = H * scale;
      const ctx = cv.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      cv.toBlob(b => save(b, 'family-tree.png'), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }

  // Shrink a wide tree to fit its panel (down to 75%, so labels stay legible); beyond that the panel scrolls sideways.
  function fitPedigree() {
    const wrap = $('#ped-wrap'), svg = wrap && wrap.querySelector('svg');
    if (!svg || !wrap.clientWidth) return;
    const w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
    // Normally shrink to at most 75% and scroll sideways; "Fit to width" shrinks as far as needed.
    const k = Math.min(1, state.treeFit ? wrap.clientWidth / w : Math.max(0.75, wrap.clientWidth / w));
    svg.style.width = `${w * k}px`; svg.style.height = `${h * k}px`;
    const note = $('#ped-wide');
    if (note) note.hidden = !(w * k > wrap.clientWidth + 2);
  }

  // Full-screen view of the family tree in the pop-up panel, at full size with scrolling.
  function openTreeFull() {
    const svg = $('#ped-wrap svg'), legend = $('#ped .ped-legend');
    if (!svg) return;
    const sel = $('#ped-syn');
    const clone = svg.cloneNode(true); clone.removeAttribute('style'); clone.removeAttribute('aria-describedby');
    const dlg = openPanel(`<header class="crit-head"><h2>Family tree${sel && sel.selectedOptions[0] ? ` – highlighting ${esc(sel.selectedOptions[0].text.replace(/^\d+\. /, ''))}` : ''}</h2>
      <button type="button" class="crit-close" data-close aria-label="Close">×</button></header>
      <div class="tree-full">${clone.outerHTML}</div>${legend ? legend.outerHTML : ''}`, 'tree');
    dlg.classList.add('wide');
    dlg.addEventListener('close', () => dlg.classList.remove('wide'), { once: true });
  }

  // Text version of the family tree for screen readers (the SVG points to it).
  function pedigreeTextHtml(people) {
    const elig = eligByPerson();
    return `<ul class="sr-only" id="ped-text">${people.map(p => {
      const dxs = p.dx.filter(d => d.site && d.hist), e = elig.get(p.id) || { meets: [], maybe: [] };
      const st = personStatus(p);
      return `<li>${esc(personLabel(p))}${st ? ` (${esc(st)})` : ''}: ${dxs.length ? dxs.map(d => esc(dxText(d, p))).join('; ') : 'no cancer entered'}${e.meets.length ? `. Meets ${e.meets.join(', ')}` : ''}${e.maybe.length ? `. May meet ${e.maybe.join(', ')}` : ''}.</li>`;
    }).join('')}</ul>`;
  }
  function pedigreeHtml(shown) {
    const people = state.people;
    if (!shown.some(r => r.cond.id === state.treeSyn)) state.treeSyn = shown[0] ? shown[0].cond.id : null;
    const sel = shown.find(r => r.cond.id === state.treeSyn);
    return `<details class="ped" id="ped"${state.treeOpen ? ' open' : ''}>
      <summary>Family tree</summary>
      <div class="ped-tools">
        <label class="mk">Highlight
          <select id="ped-syn" aria-label="Syndrome to highlight in the family tree">${shown.map((r, i) =>
            `<option value="${r.cond.id}"${r.cond.id === state.treeSyn ? ' selected' : ''}>${i + 1}. ${esc(r.cond.name)}</option>`).join('')}</select></label>
        <span class="ped-view"><button type="button" class="btn-ghost" data-ped-fit aria-pressed="${state.treeFit ? 'true' : 'false'}">Fit to width</button>
          <button type="button" class="btn-ghost" data-ped-full>Full screen</button></span>
        <span class="ped-dl"><button type="button" class="btn-ghost" data-ped-dl="png">Download PNG</button>
          <button type="button" class="btn-ghost" data-ped-dl="svg">SVG</button></span>
      </div>
      <p class="ped-wide small muted" id="ped-wide" hidden>The tree is wider than this panel – scroll sideways, or use Fit to width or Full screen.</p>
      <div class="ped-wrap" id="ped-wrap">${pedigreeSvg(people, sel)}</div>
      ${pedigreeTextHtml(people)}
      <p class="ped-legend small">
        <span><svg width="14" height="14" aria-hidden="true"><rect class="ped-sym ped-hitfill" x="1" y="1" width="12" height="12"/></svg> Cancer that fits ${sel ? esc(sel.cond.name) : 'the highlighted syndrome'}</span>
        <span><svg width="14" height="14" aria-hidden="true"><rect class="ped-sym ped-aff" x="1" y="1" width="12" height="12"/></svg> Other cancer</span>
        <span><svg width="14" height="14" aria-hidden="true"><rect class="ped-sym" x="1" y="1" width="12" height="12"/></svg> No cancer entered</span>
        <span><svg width="14" height="14" aria-hidden="true"><rect class="ped-sym ped-imp" x="1" y="1" width="12" height="12"/></svg> Not entered (implied)</span>
        <span><svg width="16" height="16" aria-hidden="true"><rect class="ped-elig-ring" x="1.5" y="1.5" width="13" height="13" rx="3"/></svg> Meets test criteria now (* = tumour testing first); “May meet” = check an unrecorded detail</span>
        <span class="muted">□ male · ○ female · ◇ sex not given · ↘ proband · ⁄ deceased · dashed line = half-sibling or uncertain link</span>
      </p>
    </details>`;
  }

  let lastShown = [];

  /* Testing pointers whose site/histology (and age limit, when an age is entered) match. */
  function pointersFor(dxs) {
    return TEST_POINTERS.filter(t => dxs.some(d => d.site === t.site && t.hist.split('|').includes(d.hist) &&
      (t.maxAge == null || d.age === '' || +d.age <= t.maxAge)));
  }
  const familyDxs = () => state.people.flatMap(p => p.dx.filter(d => d.site && d.hist));

  function pointersHtml(list, heading) {
    if (!list.length) return '';
    const g = US_GUIDES.aacr_brain;
    return `<section class="pointers"><h2>${heading}</h2>
      <p class="muted small">Tumour-specific advice from the ${link('AACR 2024 childhood CNS tumour update', g[1])}. NHS Test Directory eligibility takes priority; differences are noted.</p>
      <ul>${list.map(t => `<li>${esc(t.aacr)}<br><span class="small"><strong>NHS route:</strong> ${esc(t.nhs)}</span></li>`).join('')}</ul></section>`;
  }

  // Short status line under the results header (announced to screen readers; flashes briefly when it changes).
  let statusTimer = null;
  function setResultsStatus(text) {
    const el = $('#results-status');
    if (!el || el.dataset.text === text) return;
    el.dataset.text = text; el.textContent = text;
    el.classList.remove('flash'); void el.offsetWidth; if (text) el.classList.add('flash');
    clearTimeout(statusTimer); statusTimer = setTimeout(() => el.classList.remove('flash'), 1200);
  }
  // Results after the first five are folded under "Show N more".
  const MORE_AFTER = 5;
  // No hallmark or strong match anywhere: the list is possibilities only.
  const weakPattern = all => all.length > 0 && !all.some(r => r.hasStrong);
  const WEAK_TEXT = 'No hallmark or strong match was found, so an inherited cause is not suggested by the ranking alone – the syndromes below are possibilities only. Test Directory criteria (above) still apply.';
  // Bowel screening if no inherited condition is found (BSG/ACPGBI/UKCGG 2019, Box 1 and Table 1).
  function lynchLikeRelative() {
    return state.people.some(p => p.dx.some(d => ['msh2', 'msh6', 'pms2'].includes(d.mmr) || (d.mmr === 'mlh1' && d.meth === 'no' && d.braf !== 'yes')));
  }
  function fhccHtml() {
    const f = fhccCategory(state.people);
    if (!f.any) return '';
    const c = FHCC.categories[f.category], g = GUIDES[FHCC.source];
    const am = amsterdamCriteria(state.people);
    return `<section class="fhcc" id="fhcc">
      <h3>Bowel screening if no inherited condition is found</h3>
      <p class="fhcc-cat fhcc-${f.category}"><strong>${esc(c.label)}</strong> – ${esc(c.offer)}</p>
      ${f.reasons.length ? `<p class="small">Because: ${esc(f.reasons.join('; '))}.</p>` : ''}
      ${f.proAffected ? '<p class="small muted">The proband has had colorectal cancer, so their own follow-up is as after cancer treatment; this category applies to their unaffected relatives\' assessment.</p>' : ''}
      ${f.unknownLinks ? '<p class="small muted">Some links between affected relatives are not known (e.g. whose child a cousin is) and are not counted – use “Child of” to set them.</p>' : ''}
      ${am.met ? `<p class="small">${esc(FHCC.amsterdam)}</p>` : ''}
      ${lynchLikeRelative() ? `<p class="small">If an MMR-deficient tumour is unexplained after germline testing: ${esc(FHCC.lynchLike)}</p>` : ''}
      <details class="fhcc-defs"><summary class="small">Categories (Box 1)</summary>
        <ul class="small">${['high', 'moderate', 'average'].map(k => `<li><strong>${esc(FHCC.categories[k].label)}:</strong> ${esc(FHCC.categories[k].def)} <em>${esc(FHCC.categories[k].offer)}</em></li>`).join('')}</ul>
      </details>
      <ul class="small muted">${FHCC.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
      <p class="small muted">Source: ${link(g[0], g[1])} – Box 1 and Table 1.</p>
    </section>`;
  }
  function renderResults() {
    // Keep folded sections as the user left them (read from the page, so it does not depend on toggle-event timing).
    if (!$('#results').dataset.print) {
      const more = document.querySelector('#results details.more-results'), tests = document.querySelector('#results details.tests-compact');
      if (more) state.moreOpen = more.open;
      if (tests) state.testsOpen = tests.open;
    }
    const all = scoreFamily();
    const { shown, hidden, top } = filterByMode(all);
    lastShown = shown;
    document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active', b.dataset.mode === state.mode); if (b.closest('.segmented')) b.setAttribute('aria-pressed', b.dataset.mode === state.mode); });
    $('#mode-hint').textContent = MODES[state.mode].hint;
    const out = $('#results');
    out.dataset.print = state.printFull ? '1' : '';
    document.body.classList.toggle('compact-head', familyDxs().length > 0);
    $('#compare-top').hidden = shown.length < 2;
    remember();
    setResultsStatus(all.length ? `${shown.length} syndrome${shown.length === 1 ? '' : 's'} shown${hidden ? ` (${all.length} matched)` : ''} · updated` : '');
    if (!all.length) {
      out.innerHTML = `<div class="empty quick-start">
        <h3>How to use</h3>
        <ol>
          <li><strong>Add the proband's cancers</strong> – choose the site and type (or type in the find box), and the age at diagnosis.</li>
          <li><strong>Add relatives</strong> with their cancers. Finished relatives fold into one-line cards.</li>
          <li><strong>Read the results</strong> – who meets Test Directory criteria, the family tree and the ranked syndromes. Click any test code (e.g. <span class="code-sm">R208</span>) or Manchester score for the detail.</li>
        </ol>
        <p>Or load an example family: <span class="ex-quick">${exampleButtons()}</span></p><p class="muted small">Nothing you enter leaves this browser.</p>
      </div>`;
      $('#ped-host').innerHTML = '';
      updateToResults();
      return;
    }
    out.innerHTML = `
      ${familyTableHtml()}
      ${eligibilityHtml()}
      ${state.printFull ? pedigreeHtml(shown) : ''}
      <p class="muted small shown-note">${shown.length} shown${hidden ? ` · ${hidden} more in a wider search` : ''}. Scores are relative and are not probabilities. Click a result's title to highlight it in the family tree.</p>
      ${weakPattern(all) ? `<div class="weak-note" role="note"><strong>No strong pattern.</strong> ${WEAK_TEXT}</div>` : ''}
      ${TIER_LEGEND}
      ${shown.slice(0, MORE_AFTER).map((r, i) => resultCard(r, i, top)).join('')}
      ${shown.length > MORE_AFTER ? `<details class="more-results"${state.printFull || state.moreOpen ? ' open' : ''}>
        <summary><span class="when-closed">Show ${shown.length - MORE_AFTER} more lower-scoring syndrome${shown.length - MORE_AFTER === 1 ? '' : 's'}</span><span class="when-open">Hide the ${shown.length - MORE_AFTER} lower-scoring syndrome${shown.length - MORE_AFTER === 1 ? '' : 's'}</span></summary>
        ${shown.slice(MORE_AFTER).map((r, i) => resultCard(r, i + MORE_AFTER, top)).join('')}
      </details>` : ''}
      ${hidden && state.mode !== 'wide' ? `<button type="button" class="link-btn" data-mode="wide">Show all ${all.length} →</button>` : ''}
      ${fhccHtml()}
      ${pointersHtml(pointersFor(familyDxs()), 'Testing pointers for the cancers entered')}
      ${renderTests(shown)}`;
    // The family tree sits under the family form on screen (in the results when printing, so it prints in order).
    $('#ped-host').innerHTML = state.printFull ? '' : pedigreeHtml(shown);
    fitPedigree();
    updateToResults();
    updateFormTags();
  }
  /* ---- Checks on what has been entered: impossible or doubtful values that would change the results ---- */
  const ONE_ONLY = ['mother', 'father', 'm_gm', 'm_gf', 'p_gm', 'p_gf'];
  function personWarnings(p) {
    const w = [];
    const n = v => (v === '' || v == null ? null : +v);
    const status = p.deceased ? n(p.ageDeath) : n(p.ageNow);
    if (p.rel === 'unset' && p.relKind) w.push('Choose which side of the family – until then this relative is not counted in family-history criteria and only weakly in the ranking.');
    else if (p.rel === 'unset') w.push('Choose the relationship – until then this relative is not counted in family-history criteria and only weakly in the ranking.');
    if (PARENT_OF[p.rel] && !namedParent(p) && parentCandidates(p).length && isComplete(p)) w.push(`Not specified whose child this is ("Child of") – links to ${parentCandidates(p).map(personLabel).join(', ')} are not counted.`);
    if (ONE_ONLY.includes(p.rel) && state.people.filter(x => x.rel === p.rel).length > 1) w.push(`More than one ${REL[p.rel].label.toLowerCase()} entered – check the relationship.`);
    for (const d of p.dx) {
      if (!d.site) continue;
      const name = SITES[d.site].label.split(/ \/ | \(/)[0];
      if (!d.hist) { w.push(`${name}: choose the histology / type – until then this cancer is not counted.`); continue; }
      const a = n(d.age);
      if (a === null) w.push(`${name}: no age at diagnosis – age-based criteria and the Manchester score leave it out.`);
      else if (a < 0 || a > 110) w.push(`${name}: age ${d.age} looks wrong.`);
      else if (status !== null && a > status) w.push(`${name}: diagnosed at ${a}, older than ${p.deceased ? 'age at death' : 'age now'} (${status}).`);
      if (d.side === 'both' && n(d.age2) !== null && a !== null && n(d.age2) < a) w.push(`${name}: second cancer (${d.age2}) is younger than the first (${a}) – swap them if so.`);
      if (p.sex === 'M' && ['ovary', 'uterus', 'cervix'].includes(d.site)) w.push(`${name} cancer entered for a male relative – check sex or site.`);
      if (p.sex === 'F' && ['prostate', 'testis'].includes(d.site)) w.push(`${name} cancer entered for a female relative – check sex or site.`);
      if (d.site === 'polyps' && ['adenoma', 'pj', 'juvenile', 'serrated', 'mixed', 'ganglioneuroma'].includes(d.hist) && (d.count === '' || d.count == null)) w.push(`${name}: number of polyps not entered – polyposis criteria depend on it.`);
    }
    return w;
  }
  function updateFormTags() {
    document.querySelectorAll('[data-warn-for]').forEach(el => {
      const p = state.people.find(x => x.id === +el.dataset.warnFor);
      const w = p ? personWarnings(p) : [];
      const html = w.length ? `<ul>${w.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    });
    document.querySelectorAll('[data-mss-for]').forEach(el => {
      const p = state.people.find(x => x.id === +el.dataset.mssFor);
      const show = p && p.dx.some(d => d.site === 'breast' || (d.site === 'ovary' && d.hist));
      if (!show) { el.innerHTML = ''; el.dataset.html = ''; return; }
      const s = manchesterScore(p, state.people);
      const html = `<button type="button" class="mss-link" data-mss="${p.id}" title="Show how the Manchester score was calculated">Manchester score ${s.combined} (BRCA1 ${s.b1}, BRCA2 ${s.b2})</button>`;
      // Only replace when it changes, so a click that starts as a field loses focus still lands on the same button.
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    });
    const m = eligByPerson();
    document.querySelectorAll('[data-elig-for]').forEach(el => {
      const e = m.get(+el.dataset.eligFor) || { meets: [], maybe: [] };
      const chip = (c, cls, extra) => testBtn(c.replace('*', ''), `code-sm ${cls}`, c, `${c.endsWith('*') ? ' – tumour testing first' : ''}${extra}`);
      const html = [e.meets.length ? `Meets criteria: ${e.meets.map(c => chip(c, 'elig-code', '')).join(' ')}` : '',
        e.maybe.length ? `<span class="maybe">May meet: ${e.maybe.map(c => chip(c, 'elig-code maybe-code', ' – check an unrecorded detail')).join(' ')}</span>` : ''].filter(Boolean).join(' · ');
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    });
  }

  /* ---- Criteria panel: the exact Test Directory wording for a test, with the family's matches highlighted ---- */
  function critIndex(tc, snip) {
    if (!tc || !snip) return -1;
    const i = tc.items.findIndex(x => x[2].startsWith(snip));
    return i >= 0 ? i : tc.items.findIndex(x => x[2].includes(snip));
  }
  // Reason text, with "Manchester score …" made a link to the breakdown for the person it was calculated for.
  const reasonHtml = (text, mssPerson) => mssPerson && /Manchester score/.test(text)
    ? `<button type="button" class="mss-link" data-mss="${mssPerson.id}" title="Show how the Manchester score was calculated">${abbrHtml(text)}</button>`
    : abbrHtml(text);
  const KIND = { met: ['Meets now', '✓'], maybe: ['May meet – check', '?'], near: ['Near miss', '–'] };
  function criteriaHtml(code) {
    const t = TESTS[code], tc = typeof TD_CRITERIA !== 'undefined' ? TD_CRITERIA[code] : null;
    const entries = [
      ...checkEligibility(state.people, state.ancestry).filter(o => o.test === code).map(o => ({ o, kind: o.possible ? 'maybe' : 'met' })),
      ...nearMisses(state.people, state.ancestry).filter(o => o.test === code).map(o => ({ o, kind: 'near' }))];
    const hits = new Map(), loose = [];
    for (const { o, kind } of entries) o.text.forEach((text, i) => {
      const h = { p: o.person, mss: o.mssFor || o.person, text, kind, tag: kind === 'met' ? eligTag(o) : '' };
      const idx = critIndex(tc, o.crit && o.crit[i]);
      if (idx >= 0) { if (!hits.has(idx)) hits.set(idx, []); hits.get(idx).push(h); } else loose.push(h);
    });
    const rank = { met: 0, maybe: 1, near: 2 };
    const who = h => `<li class="who-${h.kind}"><span aria-hidden="true">${KIND[h.kind][1]}</span> <strong>${esc(personLabel(h.p))}</strong>${h.p.deceased ? ' (deceased)' : ''} – ${reasonHtml(h.text, h.mss)}${h.tag ? ` <span class="elig-tag">${esc(h.tag)}</span>` : ''}</li>`;
    const all = [...hits.values()].flat().concat(loose);
    const family = state.people.some(p => p.dx.some(d => d.site && d.hist));
    const summary = !family ? '<p class="small muted">Enter a family on the Assess tab to see who meets these criteria.</p>'
      : !all.length ? '<p class="small">No one in the family as entered meets these criteria (as far as can be judged from what is recorded).</p>'
      : ['met', 'maybe', 'near'].filter(k => all.some(h => h.kind === k)).map(k => `<h4 class="hit-${k}">${KIND[k][0]}</h4><ul class="crit-hits">${all.filter(h => h.kind === k).map(who).join('')}</ul>`).join('');
    const items = tc ? `<ol class="crit-list">${tc.items.map(([lv, mk, text], i) => {
      const hs = (hits.get(i) || []).sort((a, b) => rank[a.kind] - rank[b.kind]);
      return `<li class="lv${lv}${hs.length ? ` hit hit-${hs[0].kind}` : ''}"${hs.length ? ` id="crit-hit-${i}"` : ''}>${mk ? `<span class="crit-mk">${esc(mk)}</span> ` : ''}${esc(text)}${hs.length ? `<ul class="crit-hits">${hs.map(who).join('')}</ul>` : ''}</li>`;
    }).join('')}</ol>` : `<ul>${t.criteria.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="small muted">Summary only – see the PDF for the exact wording.</p>`;
    return `<header class="crit-head">
        <h2><span class="code">${esc(code)}</span> ${esc(t.name)}</h2>
        <button type="button" class="crit-close" data-close aria-label="Close">×</button>
      </header>
      <p class="small muted">Genes: ${esc(t.genes)}${t.panel ? ` · ${link('PanelApp ' + t.panel, PANELAPP(t.panel))}` : ''} ·
        ${link(`Test Directory v9.1${tc ? `, page ${tc.page}` : ''} (PDF)`, TD_URL + (tc ? `#page=${tc.page}` : ''))}</p>
      <section class="crit-family"><h3>This family</h3>${summary}</section>
      <section><h3>Testing criteria${tc ? ' (exact wording)' : ''}</h3>${items}</section>
      ${testGenesHtml(code)}
      <p class="small muted">Highlighted: green = met now, amber = may meet (check the detail named), grey = near miss. Judged only from what has been entered; the Test Directory always takes precedence.</p>`;
  }
  function testGenesHtml(code) {
    const g = testGenes(code), t = TESTS[code];
    if (!g) return `<section class="crit-genes"><h3>Genes tested</h3><p>${esc(t.genes)}</p></section>`;
    const extra = [g.strs ? `${g.strs} repeat expansion${g.strs > 1 ? 's' : ''}` : '', g.regions ? (Array.isArray(g.regions) ? `region${g.regions.length > 1 ? 's' : ''} ${g.regions.join(', ')}` : `${g.regions} regions`) : ''].filter(Boolean).join('; ');
    return `<section class="crit-genes"><h3>Genes tested (${g.n})</h3>
      ${g.genes ? `<p class="crit-gene-list">${g.genes.map(x => `<span class="gene">${esc(x)}</span>`).join(' ')}</p>` : `<p>${g.n} genes – too many to list here; see ${link('PanelApp panel ' + g.panel, PANELAPP(g.panel))}.</p>`}
      ${extra ? `<p class="small">Also: ${esc(extra)}.</p>` : ''}
      <p class="small muted">Green (diagnostic-grade) genes on ${link(`PanelApp ${g.panel}: ${g.name} v${g.version}`, PANELAPP(g.panel))}, checked ${esc(PANEL_DATE)}. Test Directory: ${esc(t.genes)}.</p></section>`;
  }
  // One pop-up panel shared by the criteria and Manchester score views.
  let panelOpener = null;
  function openPanel(html, view) {
    let dlg = $('#crit-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'crit-dialog'; dlg.setAttribute('aria-labelledby', 'crit-title');
      document.body.append(dlg);
      dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
      // Return focus to what opened the panel (or its replacement after a re-render).
      dlg.addEventListener('close', () => {
        const o = panelOpener; panelOpener = null;
        if (!o) return;
        const el = o.isConnected ? o : (o.dataset.test ? document.querySelector(`[data-test="${o.dataset.test}"]`) : o.dataset.mss ? document.querySelector(`[data-mss="${o.dataset.mss}"]`) : null);
        if (el) el.focus({ preventScroll: true });
      });
    }
    if (!dlg.open && document.activeElement && document.activeElement !== document.body) panelOpener = document.activeElement;
    dlg.innerHTML = html;
    dlg.dataset.view = view;
    dlg.querySelector('h2').id = 'crit-title';
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
    return dlg;
  }
  function openCriteria(code) {
    if (!TESTS[code]) return;
    const dlg = openPanel(criteriaHtml(code), code);
    const first = dlg.querySelector('.crit-list li.hit');
    if (first) first.scrollIntoView({ block: 'center' });
  }

  /* ---- Manchester score breakdown ---- */
  const SIDE_LABEL = { M: 'maternal side', P: 'paternal side' };
  function manchesterHtml(person, back) {
    const m = manchesterDetail(person, state.people);
    const both = m.sides.length > 1, other = m.sides.find(x => x.side !== m.side);
    const dxLabel = d => abbrHtml(`${SITES[d.site].label}: ${histLabel(d.site, d.hist)}${d.age !== '' && d.age != null ? `, age ${d.age}` : ''}`);
    const rowLabel = id => (MSS_TABLE.find(r => r[0] === id) || [])[1];
    const threshold = m.combined >= 15 || m.b1 >= 10 || m.b2 >= 10;
    const rows = m.rows.map(r => `<tr><td>${esc(personLabel(r.p))}</td><td>${dxLabel(r.d)}${r.second ? ` <span class="elig-tag">second breast cancer${r.ageGiven ? '' : ' – age of second not given, first age used'}</span>` : ''}</td><td>${esc(rowLabel(r.id))}</td><td class="num">${r.b1}</td><td class="num">${r.b2}</td></tr>`).join('');
    const adj = m.adj.map(a => `<tr class="mss-adj"><td>${esc(personLabel(person))}</td><td>${a.d ? dxLabel(a.d) : ''}</td><td>Pathology: ${abbrHtml(a.label)}</td><td class="num">${a.b1 > 0 ? '+' : ''}${a.b1}</td><td class="num">${a.b2 ? `+${a.b2}` : '–'}</td></tr>`).join('');
    const used = new Set(m.rows.map(r => r.id)), usedAdj = new Set(m.adj.map(a => a.id));
    return `<header class="crit-head">
        <h2>Manchester score – ${esc(personLabel(person))}</h2>
        <button type="button" class="crit-close" data-close aria-label="Close">×</button>
      </header>
      ${back ? `<p><button type="button" class="link-btn" id="back-from-mss" data-back="${esc(back)}">← Back to ${esc(back)}</button></p>` : ''}
      <p class="mss-total"><strong>Combined ${m.combined}</strong> (BRCA1 ${m.b1}, BRCA2 ${m.b2})${both ? ` · ${SIDE_LABEL[m.side]}` : ''}
        <span class="elig-tag ${threshold ? 'mss-ok' : 'dec'}">${threshold ? 'meets the R208 threshold (≥15 combined or ≥10 for one gene)' : 'below the R208 threshold (≥15 combined or ≥10 for one gene)'}</span></p>
      ${person.rel === 'proband' ? `<p class="mss-adopted"><label class="chk"><input type="checkbox" data-mss-adopted="${person.id}"${person.adopted ? ' checked' : ''}> Adopted, with no known cancer history in blood relatives (+2 BRCA1, +2 BRCA2)</label></p>` : ''}
      ${both ? `<p class="small muted">The proband can count either side of the family; the higher-scoring side is shown. The ${SIDE_LABEL[other.side]} scores ${other.combined} (BRCA1 ${other.b1}, BRCA2 ${other.b2}).</p>` : ''}
      <section><h3>How it was calculated</h3>
      ${m.rows.length || m.adj.length ? `<div class="table-wrap"><table class="syn-table mss-table"><thead><tr><th>Relative</th><th>Cancer</th><th>Scored as</th><th class="num">BRCA1</th><th class="num">BRCA2</th></tr></thead>
        <tbody>${rows}${adj}</tbody>
        <tfoot><tr><th colspan="3">Total (combined ${m.combined})</th><th class="num">${m.b1}</th><th class="num">${m.b2}</th></tr></tfoot></table></div>` : '<p>No cancers on this side of the family score points.</p>'}
      <p class="small muted">Pathology adjustments apply to the tested person's own tumour only and change the BRCA1 score; the adoption adjustment adds to both.</p></section>
      ${m.excluded.length ? `<section><h3>Not counted</h3><ul class="mss-excl">${m.excluded.map(x => `<li><strong>${esc(personLabel(x.p))}</strong> – ${dxLabel(x.d)}: ${esc(x.why)}</li>`).join('')}</ul></section>` : ''}
      <section><h3>Scoring table</h3>
      <div class="table-wrap"><table class="syn-table mss-ref"><thead><tr><th>Cancer</th><th class="num">BRCA1</th><th class="num">BRCA2</th></tr></thead>
        <tbody>${MSS_TABLE.map(([id, label, b1, b2]) => `<tr${used.has(id) ? ' class="used"' : ''}><td>${esc(label)}</td><td class="num">${b1}</td><td class="num">${b2}</td></tr>`).join('')}
        <tr class="mss-head"><th colspan="3">Adjustments for the tested person (pathology of their own tumour; adoption)</th></tr>
        ${MSS_ADJ.map(([id, label, b1, b2]) => `<tr${usedAdj.has(id) ? ' class="used"' : ''}><td>${abbrHtml(label)}</td><td class="num">${b1 > 0 ? '+' : ''}${b1}</td><td class="num">${b2 ? `+${b2}` : '–'}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Rows used for this family are highlighted. Points from Evans et al. (${link('J Med Genet 2004', 'https://doi.org/10.1136/jmg.2003.017996')}; ${link('2017 update', 'https://doi.org/10.1136/jmedgenet-2017-104584')}) as published by ${link('GeNotes', 'https://www.genomicseducation.hee.nhs.uk/genotes/knowledge-hub/manchester-evans-score/')}. Grade adjustments apply to invasive breast cancer when a grade is entered. The adoption adjustment (+2/+2) applies to the proband when ticked, for an adopted person with no known cancer history in blood relatives. Bilateral breast cancer is counted as two primaries. Count only one side of the family (plus the tested person's own cancers and siblings/children). R208 threshold: combined ≥15 or one gene ≥10 (deceased with tissue only ≥17; unaffected ≥20). Judged only from what has been entered.</p></section>`;
  }
  function openManchester(id, back) {
    const p = state.people.find(x => x.id === id);
    if (p) openPanel(manchesterHtml(p, back), 'mss');
  }

  /* ---- Who meets Test Directory criteria now (js/eligibility.js) ---- */
  const ELIG_TESTS = ['R207', 'R208', 'R210', 'R211', 'R212', 'R213', 'R214', 'R215', 'R216', 'R217', 'R218', 'R219', 'R221', 'R222', 'R223', 'R224', 'R225', 'R226', 'R254', 'R347', 'R363', 'R364', 'R365', 'R366', 'R367', 'R414', 'R422', 'R430', 'R456', 'R457'];
  // People grouped with their entries; `possible` picks the "may meet" entries instead of those met now.
  function eligibilityList(possible = false) {
    const res = checkEligibility(state.people, state.ancestry).filter(o => !!o.possible === possible);
    const byPerson = new Map();
    for (const o of res) { if (!byPerson.has(o.person)) byPerson.set(o.person, []); byPerson.get(o.person).push(o); }
    return [...byPerson.entries()].sort((a, b) => (a[0].rel === 'proband' ? -1 : 0) - (b[0].rel === 'proband' ? -1 : 0));
  }
  // Test codes each person meets now, by person id (germline routes; tumour-first and unaffected routes marked).
  function eligByPerson() {
    const m = new Map();
    for (const o of checkEligibility(state.people, state.ancestry)) {
      const code = o.tumourFirst ? `${o.test}*` : o.test;
      if (!m.has(o.person.id)) m.set(o.person.id, { meets: [], maybe: [] });
      const list = m.get(o.person.id)[o.possible ? 'maybe' : 'meets'];
      if (!list.includes(code)) list.push(code);
    }
    return m;
  }
  const eligTag = o => o.possible ? (o.deceased ? 'may meet – check; deceased' : 'may meet – check') : o.unaffected ? 'via Clinical Genetics' : o.tumourFirst ? 'tumour MMR/MSI testing first' : o.deceased ? 'deceased – needs stored DNA or tissue' : '';
  // Modified Amsterdam: a banner when met, a checklist when two or more relatives have Lynch-associated cancers.
  function amsterdamHtml() {
    const a = amsterdamCriteria(state.people);
    if (a.affectedCount < 2) return '';
    const who = a.members.map(p => esc(personLabel(p))).join(', ');
    return `<div class="ams${a.met ? ' met' : ''}">
      <p class="ams-head">${a.met ? '<strong>Family history meets the modified Amsterdam criteria</strong> – germline Lynch syndrome testing (R210) is indicated irrespective of tumour MMR status.' : `<strong>Modified Amsterdam criteria not met</strong> (${a.n} of 4)`}</p>
      ${a.met ? `<p class="small">Relatives involved: ${who}.</p>` : ''}
      <ul class="ams-list">${a.checks.map(c => `<li class="${c.ok ? 'ok' : 'no'}"><span aria-hidden="true">${c.ok ? '✓' : '✗'}</span> ${esc(c.label)}</li>`).join('')}</ul>
      <p class="small muted">Excludes familial adenomatous polyposis; tumours should be verified by pathology where possible.</p>
    </div>`;
  }

  // Short form of a reason for the box: drop the "(Site: histology, age …)" detail and long Manchester wording;
  // the full text is printed, copied in the summary and shown in the criteria panel.
  const shortReason = t => {
    const m = t.match(/^Manchester score (\d+)/);
    if (m) return `Manchester ${m[1]}`;
    return t.replace(/\s*\((?:[^()]|\([^()]*\))*:(?:[^()]|\([^()]*\))*\)/g, '').replace(/^note: /, '').trim();
  };
  function eligibilityHtml() {
    const list = eligibilityList(), maybe = eligibilityList(true);
    const ams = amsterdamHtml();
    const reasons = o => {
      const mssP = o.mssFor || o.person;
      const short = [...new Set(o.text.map(t => /Manchester score/.test(t) ? reasonHtml(shortReason(t).replace('Manchester', 'Manchester score'), mssP) : abbrHtml(shortReason(t))))];
      return `<span class="why-short">${short.join(' · ')}</span><span class="why-full">${o.text.map(t => abbrHtml(t)).join('; ')}</span>`;
    };
    const people = l => `<ul class="elig-people">${l.map(([p, os]) => `<li><div class="elig-who"><strong>${esc(personLabel(p))}</strong>${p.deceased ? ' <span class="elig-tag dec">deceased</span>' : ''}</div>
        <ul>${os.map(o => `<li class="elig-line">${testBtn(o.test)} <span class="elig-test">${esc(TESTS[o.test].name)}</span>${eligTag(o) && !o.possible ? ` <span class="elig-tag">${esc(eligTag(o))}</span>` : ''}
          <div class="elig-why">${reasons(o)}</div></li>`).join('')}</ul></li>`).join('')}</ul>`;
    const maybeHtml = maybe.length ? `<div class="elig-maybe"><h4>May meet – check an unrecorded detail</h4>${people(maybe)}</div>` : '';
    const foot = `<p class="small muted">Checked against the inherited cancer tests (${ELIG_TESTS.join(', ')}) using what has been entered. Click a test code for the exact criteria and the full reasons. Criteria needing information not recorded here (e.g. CanRisk, Wimmer score) are not assessed. Deceased relatives need stored DNA, or tissue with Manchester ≥17 / CanRisk ≥15% for R208/R207. Always confirm against the ${link(TD_VERSION, TD_URL)}.</p>`;
    if (!list.length) return `<section class="elig none"><h3>Test Directory criteria</h3>${ams}
      <p class="small">No one in the family as entered meets the inherited cancer test criteria checked here. Check the full criteria, CanRisk and the Manchester score.</p>${maybeHtml}${foot}</section>`;
    return `<section class="elig"><h3>Meets Test Directory criteria now</h3>${ams}
      ${people(list)}${maybeHtml}${foot}</section>`;
  }

  // Print-only table of the family as entered.
  function familyTableHtml() {
    const rows = state.people.map(p => {
      const dxs = p.dx.filter(d => d.site && d.hist);
      return `<tr><td>${esc(personLabel(p))}${namedParent(p) ? `<br><span class="small muted">child of ${esc(personLabel(namedParent(p)))}</span>` : ''}</td><td>${p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : '–'}</td>
        <td>${esc(personStatus(p) || '–')}</td>
        <td>${dxs.length ? dxs.map(d => abbrHtml(dxText(d, p))).join('<br>') : 'No cancer entered'}</td></tr>`;
    }).join('');
    return `<section class="print-show fam-table">
      <h2>Family history</h2>
      ${state.ancestry ? `<p class="small">Ancestry: ${esc($('#ancestry').selectedOptions[0].text)}</p>` : ''}
      <table class="syn-table"><thead><tr><th>Relative</th><th>Sex</th><th>Age / status</th><th>Cancers and findings (age at diagnosis)</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="small muted">Printed ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · search breadth: ${esc(MODES[state.mode].label.toLowerCase())} · information checked ${esc(DATA_CHECKED)}</p>
    </section>`;
  }

  // Phones: a floating button jumps to the results while they are below the screen.
  function updateToResults() {
    const btn = $('#to-results'), res = $('#results');
    const n = lastShown.length;
    // Hide as soon as the Differential panel's heading is on screen (not only the list below it).
    const panel = res.closest('.panel') || res;
    const below = panel.getBoundingClientRect().top > window.innerHeight - 80;
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#family') && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    btn.hidden = !(n && state.tab === 'assess' && window.innerWidth < 1000 && below && !typing);
    btn.textContent = `See results (${n}) ↓`;
  }

  /* ---- Out-of-date warning: information checked over 6 months ago, or a Test Directory over a year old ---- */
  function staleNote() {
    const q = new URLSearchParams(location.search).get('today'); // for testing
    const now = q ? new Date(q) : new Date();
    const months = d => (now - new Date(d)) / (1000 * 60 * 60 * 24 * 30.44);
    const tdDate = (TD_VERSION.match(/\(([^)]+)\)/) || [])[1];
    const msgs = [];
    const oldest = [['information checked', DATA_CHECKED], ['PanelApp gene lists', typeof PANEL_DATE !== 'undefined' ? PANEL_DATE : null]].filter(([, d]) => d && months(d) > 6);
    if (oldest.length) msgs.push(`${oldest.map(([w, d]) => `${w} ${d}`).join('; ')} – over 6 months ago, so some details may be out of date`);
    if (tdDate && months(tdDate) > 12) msgs.push(`the Test Directory version used (${tdDate}) is over a year old – check for a newer version`);
    const el = $('#stale-note');
    el.hidden = !msgs.length;
    el.textContent = msgs.length ? `Please note: ${msgs.join('; ')}.` : '';
  }

  /* ---------------- Summary ---------------- */

  function summaryText() {
    const lines = ['FAMILY HISTORY'];
    if (state.ancestry) lines.push(`Ancestry: ${$('#ancestry').selectedOptions[0].text}`);
    for (const p of state.people) {
      const dxs = p.dx.filter(d => d.site && d.hist);
      const status = personStatus(p);
      if (!dxs.length && !status) continue;
      lines.push(`- ${personLabel(p)}${namedParent(p) ? ` [child of ${personLabel(namedParent(p))}]` : ''}${status ? ` (${status})` : ''}: ${dxs.length ? dxs.map(d => dxText(d, p)).join('; ') : 'no cancer'}`);
    }
    const el = eligibilityList();
    const am = amsterdamCriteria(state.people);
    if (am.affectedCount >= 2) lines.push('', am.met ? `FAMILY HISTORY MEETS MODIFIED AMSTERDAM CRITERIA (${am.members.map(personLabel).join(', ')})` : `Modified Amsterdam criteria not met (${am.n} of 4): ${am.checks.filter(c => !c.ok).map(c => c.label).join('; ')}`);
    lines.push('', 'MEETS TEST DIRECTORY CRITERIA NOW');
    if (!el.length) lines.push(`- None of the checked criteria met (${ELIG_TESTS.join(', ')})`);
    const eLine = ([p, os]) => os.forEach(o => lines.push(`- ${personLabel(p)}${p.deceased ? ' (deceased)' : ''}: ${o.test} ${TESTS[o.test].name}${eligTag(o) && !o.possible ? ` [${eligTag(o)}]` : ''} – ${o.text.join('; ')}`));
    el.forEach(eLine);
    const mb = eligibilityList(true);
    if (mb.length) { lines.push('', 'MAY MEET TEST DIRECTORY CRITERIA – CHECK'); mb.forEach(eLine); }
    lines.push('', `DIFFERENTIAL (${MODES[state.mode].label.toLowerCase()} search)`);
    if (weakPattern(scoreFamily())) lines.push(`No strong pattern: ${WEAK_TEXT}`);
    lastShown.forEach((r, i) => lines.push(`${i + 1}. ${r.cond.name} [${r.cond.genes.join(', ')}] – score ${r.score.toFixed(1)}`));
    const fh = fhccCategory(state.people);
    if (fh.any) {
      const c = FHCC.categories[fh.category];
      lines.push('', 'BOWEL SCREENING IF NO INHERITED CONDITION IS FOUND (BSG/ACPGBI/UKCGG 2019, Box 1)', `- ${c.label}: ${c.offer}`);
      if (fh.reasons.length) lines.push(`  Because: ${fh.reasons.join('; ')}`);
      if (fh.unknownLinks) lines.push('  Some links between affected relatives are not known and are not counted.');
    }
    const ptrs = pointersFor(familyDxs());
    if (ptrs.length) {
      lines.push('', 'TESTING POINTERS (AACR 2024 childhood CNS tumour update; NHS route takes priority)');
      ptrs.forEach(t => lines.push(`- ${t.aacr}`, `  NHS route: ${t.nhs}`));
    }
    const tests = testsSummary(lastShown);
    if (tests.length) {
      lines.push('', `TESTS TO CONSIDER (${TD_VERSION})`);
      tests.forEach(([k]) => lines.push(`- ${TESTS[k].code} ${TESTS[k].name}`));
    }
    lines.push('', 'Generated by a decision-support tool; not a substitute for clinical judgement.');
    return lines.join('\n');
  }

  async function copySummary(btn) {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch (_) {
      window.prompt('Copy the summary:', text);
    }
    setTimeout(() => { btn.textContent = 'Copy summary'; }, 1500);
  }

  /* ---------------- Reference browser ---------------- */

  const COND = Object.fromEntries(CONDITIONS.map(c => [c.id, c]));
  const TIER_ORDER = { H: 0, S: 1, M: 2, W: 3 };
  const GENES = [...new Set(CONDITIONS.flatMap(c => c.genes))].sort();
  const condsForGene = g => CONDITIONS.filter(c => c.genes.includes(g));
  const SITE_URL = location.href.split('#')[0];
  const itemUrl = key => { const [t, id] = key.split(':'); return `${SITE_URL}#${t === 'syn' ? 'syndrome' : 'gene'}=${id}`; };
  const itemName = key => { const [t, id] = key.split(':'); return t === 'syn' ? COND[id].name : `${id} (gene)`; };
  state.sel = new Set();

  /* Shared filters (search text, Test Directory code, UKCGG guideline). */
  // Search ignores case, accents, hyphens and punctuation, treats UK and US spellings alike and matches all words in any order.
  const SPELL = [[/phaeo/g, 'pheo'], [/haem/g, 'hem'], [/oesoph/g, 'esoph'], [/tumour/g, 'tumor'], [/oestrogen/g, 'estrogen'], [/anaem/g, 'anem'],
    [/leukaem/g, 'leukem'], [/paediatr/g, 'pediatr'], [/gynaec/g, 'gynec'], [/foetal/g, 'fetal'], [/colour/g, 'color'], [/fibre/g, 'fiber']];
  const normSearch = s => SPELL.reduce((t, [re, v]) => t.replace(re, v),
    String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[‐-―\-_/,.;:'’()[\]]+/g, ' ')).replace(/\s+/g, ' ').trim();
  // Abbreviations whose meaning names a syndrome (e.g. LFS, HNPCC, PHTS) also find it.
  const ALIASES = {};
  for (const c of CONDITIONS) {
    const main = normSearch(c.name.split('(')[0]);
    ALIASES[c.id] = Object.entries(ABBREVIATIONS).filter(([, full]) => main.length > 4 && normSearch(full).includes(main)).map(([k]) => k);
  }
  function filterPass(conds, texts) {
    const q = normSearch($('#browse-search').value);
    const test = $('#browse-test').value;
    if (test && !conds.some(c => c.tests.includes(test))) return false;
    if ($('#browse-ukcgg').checked && !conds.some(c => SOURCES[c.id] && SOURCES[c.id].guide)) return false;
    if (!q) return true;
    const hay = normSearch(texts.join(' | '));
    return q.split(' ').every(w => hay.includes(w));
  }
  const synMatches = c => filterPass([c], [c.name, ...c.genes, ...(ALIASES[c.id] || []), ...c.rules.map(r => ruleText(r).text)]);
  const geneMatches = g => { const cs = condsForGene(g); return filterPass(cs, [g, ...cs.map(c => c.name)]); };

  function listGroups(mode) {
    if (mode === 'gene') {
      const genes = GENES.filter(geneMatches);
      const letters = [...new Set(genes.map(g => g[0]))];
      return letters.map(l => [l, genes.filter(g => g[0] === l).map(g => ({ key: `gene:${g}`, href: `#gene=${g}`, name: g, sub: condsForGene(g).length > 1 ? `${condsForGene(g).length} syndromes` : '' }))]);
    }
    return CATEGORIES.map(([label, ids]) => [label, ids.map(id => COND[id]).filter(synMatches)
      .map(c => ({ key: `syn:${c.id}`, href: `#syndrome=${c.id}`, name: c.name }))]).filter(([, l]) => l.length);
  }

  function renderSynList() {
    const mode = $('#browse-mode').value;
    const groups = listGroups(mode);
    const items = groups.flatMap(([, l]) => l);
    const curKey = mode === 'gene' ? `gene:${state.gene}` : `syn:${state.syn}`;
    if (!items.some(i => i.key === curKey)) {
      const first = items[0] ? items[0].key.split(':')[1] : null;
      if (mode === 'gene') state.gene = first; else state.syn = first;
    }
    const cur = mode === 'gene' ? `gene:${state.gene}` : `syn:${state.syn}`;
    const total = mode === 'gene' ? GENES.length : CONDITIONS.length;
    const n = state.sel.size;
    const selecting = state.selecting || n > 0;
    const noun = mode === 'gene' ? 'genes' : 'syndromes';
    const listOpen = $('#syn-layout').classList.contains('list-open');
    $('#syn-list-toggle').textContent = listOpen ? 'Hide list ▴' : `Browse ${items.length} ${noun} ▾`;
    $('#syn-list-toggle').setAttribute('aria-expanded', listOpen);
    $('#syn-list').innerHTML = `<div class="print-bar">
        <span class="muted small">${items.length} of ${total} ${noun}</span>
        <button type="button" class="btn-ghost" data-print="shown"${items.length ? '' : ' disabled'}>Print all shown (${items.length})</button>
        ${selecting ? `<button type="button" class="btn-ghost" data-print="selected"${n ? '' : ' disabled'}>Print selected (${n})</button>
          <button type="button" class="link-btn small" data-print="done">${n ? 'Clear selection' : 'Cancel'}</button>`
        : '<button type="button" class="btn-ghost" data-print="select">Select to print</button>'}
      </div>` + (groups.map(([label, list]) => `<h2 class="list-group">${esc(label)}</h2><ul>${list.map(i =>
        `<li>${selecting ? `<input type="checkbox" data-sel="${i.key}" aria-label="Select ${esc(i.name)} for printing"${state.sel.has(i.key) ? ' checked' : ''}>` : ''}
          <a href="${i.href}"${i.key === cur ? ' aria-current="true"' : ''}>${esc(i.name)}${i.sub ? ` <span class="muted small">${i.sub}</span>` : ''}</a></li>`).join('')}</ul>`).join('')
      || '<div class="empty">No matches.</div>');
    renderSynDetail();
  }

  /* ---- Evidence for associations: rule[6] = source keys, rule[7] = risk figure ---- */
  // Returns [short label, full title, url] for a source key.
  function evSource(k) {
    const [type, id] = k.includes(':') ? k.split(/:(.*)/) : ['', k];
    if (type === 'gr') return ['GeneReviews', `GeneReviews: ${GR_TITLES[id]}`, REF_LINKS.geneReviews(id)];
    if (type === 'ukcgg') { const g = GUIDES[id]; return [EV_SHORT[id] || g[0].split(' ').slice(0, 2).join(' '), g[0], g[1]]; }
    if (type === 'eu') { const g = EU_GUIDES[id]; return [EV_SHORT[id] || shortTitle(g[0]), g[0], g[1]]; }
    if (type === 'us') { const g = US_GUIDES[id]; return [EV_SHORT[id] || shortTitle(g[0]), g[0], g[1]]; }
    if (type === 'clingen') return [`ClinGen ${id}`, `ClinGen gene–disease validity: ${id}`, REF_LINKS.clingen(id)];
    if (type === 'canvar') return [`CanVar-UK ${id}`, `CanVar-UK gene-specific variant interpretation: ${id}`, REF_LINKS.canvar(id)];
    const e = EVIDENCE[k];
    return [e[0], e[1], e[2]];
  }
  // "ERN GENTURIS 2023", "AACR 2024" … from a guideline title.
  const shortTitle = t => {
    const y = (t.match(/\b(19|20)\d{2}\b(?!.*\b(19|20)\d{2}\b)/) || [''])[0];
    const org = (t.match(/^(ERN GENTURIS|EHTG|SIOPE|AACR|IGCLC|ESMO|NCCN|ACMG|NICE|BSG)/) || [])[0];
    return `${org || t.split(/[:(–]/)[0].trim().split(' ').slice(0, 3).join(' ')}${y ? ' ' + y : ''}`;
  };
  const evLinks = keys => [...new Set(keys || [])].map(k => { const [sh, t, u] = evSource(k); return `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(t)}">${esc(sh)}</a>`; }).join(' · ');
  const evShort = keys => (keys || []).map(k => evSource(k)[0]).join(', ');

  function cancersTable(c) {
    const hasEv = c.rules.some(r => r[6] || r[7]);
    const rows = [...c.rules].sort((x, y) => TIER_ORDER[x[2]] - TIER_ORDER[y[2]]).map(([site, hist, tier, early, pred, maxAge, src, risk, usDiff]) => {
      const h = hist === '*' ? 'Any type' : hist.split('|').map(x => histLabel(site, x)).join('; ');
      return `<tr><td data-label="Site">${abbrHtml(SITES[site].label)}</td><td data-label="Histology / type">${abbrHtml(h)}</td>
        <td data-label="Strength"><span class="tier tier-${tier}" title="${esc(tierTitle(tier))}">${TIER_LABEL[tier]}</span></td>
        ${(() => { const notes = [early != null ? `Early onset ≤${early}` : '', maxAge != null ? `Only ≤${maxAge}` : '', pred ? abbrHtml(PRED_LABEL[pred]) : ''].filter(Boolean);
          return `<td data-label="Age / condition"${notes.length ? '' : ' class="na"'}>${notes.length ? notes.map(n => `<span class="ac-note">${n}</span>`).join('') : '–'}</td>`; })()}
        ${hasEv ? `<td class="ev" data-label="Risk and evidence"><div>${risk ? `<span class="ev-risk">${esc(risk)}</span>` : ''}<span class="ev-src">${evLinks(src)}</span>${usDiff ? `<span class="ev-diff"><strong>US differs:</strong> ${esc(usDiff)}</span>` : ''}</div></td>` : ''}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="syn-table cancers">
      <thead><tr><th>Site</th><th>Histology / type</th><th>Strength</th><th>Age / condition</th>${hasEv ? '<th>Risk and evidence</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>${TIER_LEGEND}`;
  }

  function variantHtml(c, heading = 'h3') {
    const notes = VARIANT_NOTES[c.id];
    if (!notes || !notes.length) return '';
    return `<${heading}${heading === 'h3' ? ' id="jump-variants"' : ''}>Variant-level notes</${heading}>
      <p class="muted small">Genotype–phenotype information only; it does not change the ranking.</p>
      <ul class="variant-notes">${notes.map(([t, src]) => `<li>${esc(t)} <span class="ev-src">${evLinks(src)}</span></li>`).join('')}</ul>`;
  }

  function testsDetail(keys) {
    return keys.map(k => {
      const t = TESTS[k];
      return `<div class="test">
        <h4>${testBtn(k, 'code')} ${esc(t.name)}${t.part ? ` <span class="muted small">Part ${esc(t.part)}</span>` : ''}</h4>
        <p class="muted">Genes: ${esc(t.genes)}${t.panel ? ` · ${link('PanelApp ' + t.panel, PANELAPP(t.panel))}` : ''}</p>
        <ul>${t.criteria.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    }).join('');
  }

  /* ---- Last reviewed date per syndrome (flagged when over 12 months old) ---- */
  function reviewInfo(c) {
    const iso = LAST_REVIEWED[c.id];
    if (!iso) return { text: 'Not recorded', stale: true };
    const d = new Date(iso + 'T00:00:00');
    const stale = (Date.now() - d.getTime()) / 864e5 > 365;
    return { text: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), stale };
  }
  function reviewedHtml(c) {
    const r = reviewInfo(c);
    return `<span class="reviewed${r.stale ? ' stale' : ''}">${esc(r.text)}${r.stale ? ' <span class="stale-flag">over 12 months ago – due for review</span>' : ''}</span>`;
  }

  /* On screen: a button to the Sources tab. In print: the full table plus the web address of the list. */
  function datesHtml(forPrint) {
    if (!forPrint) return `<p class="sources-link" id="jump-sources"><a class="btn-ghost" href="#sources">Information sources and dates →</a>
      <span class="muted small">Information checked ${esc(DATA_CHECKED)}</span></p>`;
    return `${sourcesTableHtml()}<p class="small">Full list of sources and dates: ${esc(SITE_URL)}#sources</p>`;
  }
  function sourcesTableHtml(heading = 'h3') {
    return `<${heading}>Information sources and dates</${heading}>
      <p class="small">Information checked: <strong>${esc(DATA_CHECKED)}</strong>. Guideline years are shown in each title.</p>
      <div class="table-wrap"><table class="syn-table dates"><thead><tr><th>Source</th><th>Version</th><th>Checked</th></tr></thead>
      <tbody>${SOURCE_DATES.map(([src, ver, d]) => `<tr><td>${esc(src)}</td><td>${esc(ver)}</td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  // "How syndromes are ranked": strength definitions and the scoring steps (Sources tab).
  function rankingHtml() {
    const rows = ['H', 'S', 'M', 'W'].map(t => `<tr><td><span class="tier tier-${t}">${TIER_LABEL[t]}</span></td><td>${TIER[t]}</td>
      <td>${esc(TIER_DEFS[t].yield)}</td><td>${esc(TIER_DEFS[t].risk)}</td></tr>`).join('');
    return `<section class="ranking" id="ranking" tabindex="-1">
      <h2>How syndromes are ranked</h2>
      <p class="small">Each syndrome has rules linking it to tumours and clinical features, sometimes limited by histology, a tumour marker
        (e.g. triple-negative, MSH2 loss) or age. Every rule has a strength, judged on two measures – the rule takes the higher of the two,
        but hallmark needs the first (or a defining feature):</p>
      <ul class="small">
        <li><strong>Yield</strong> – of people with this tumour or feature, how many have the syndrome?</li>
        <li><strong>Carrier risk</strong> – how likely is a carrier to develop it (lifetime, or in childhood for childhood tumours)?</li>
      </ul>
      <div class="table-wrap"><table class="ranking-table small"><thead><tr><th>Strength</th><th>Points</th><th>Yield</th><th>Carrier risk</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="small">Figures come from each rule's cited sources (UK guidance first, then European guidance, GeneReviews, ClinGen and
        peer-reviewed studies), shown with the risk figure on every syndrome page. Where the evidence is thin, the lower strength is used.
        In a syndrome usually recognised by its non-cancer features (polyposis, pigmentation, growth or skin), a common adult cancer on its
        own is at most moderate.
        ${TIER_AUDIT ? `All rules were checked against these definitions on ${esc(TIER_AUDIT)} (AI-assisted; ${link('audit report and items for clinical review', 'https://github.com/cjs1218/Claud-scratchpad/blob/main/docs/tier-audit.md')}). ` : ''}These are editorial weightings for ranking a differential,
        not a validated scoring system.</p>
      <h3>From strengths to a ranked list</h3>
      <ol class="small">
        <li>For each cancer or finding, the best-matching rule for each syndrome gives its points.</li>
        <li>Early onset: ×1.5 at or below the rule's early-onset age, ×2 if 15 or more years younger. A rule limited to an age (“only ≤”)
          does not apply above it.</li>
        <li>Tumour markers and other details adjust the points (e.g. MLH1 loss explained by methylation ×0.2 for Lynch MLH1; both sides
          ×1.3; several tumours ×1.3).</li>
        <li>Relatedness to the proband: first-degree and the proband ×1, second-degree ×0.6, third-degree ×0.35, more distant ×0.2.</li>
        <li>Dominant conditions: the stronger parental side counts fully and the other side ×0.3. Recessive conditions: only the proband and
          their brothers and sisters count – cancers in parents or other relatives do not support a recessive syndrome. Mosaic
          (not inherited) conditions: only the affected person counts.</li>
        <li>Each further supporting cancer adds 20% (up to five), and syndromes are listed by total. Scores are relative, not probabilities.</li>
        <li>A light weighting by how common the syndrome is: ×1 for the commonest (about 1 in 1,000 or commoner, e.g. BRCA1/2,
          CHEK2, ATM, Lynch MSH6/PMS2), ×0.9, ×0.8, and ×0.7 for the rarest (rarer than about 1 in 100,000). With similar evidence
          the commoner syndrome ranks higher; a hallmark finding still outweighs it. Exact ties list the commoner syndrome first.</li>
        <li>If nothing in the family is a hallmark or strong match, a “No strong pattern” note says the list is possibilities only.</li>
        <li>Narrow, Balanced and Wide set how far down the list to show.</li>
      </ol>
    </section>`;
  }
  function renderSources() {
    const ev = Object.entries(EVIDENCE).sort((a, b) => a[1][1].localeCompare(b[1][1]));
    $('#sources-page').innerHTML = `${sourcesTableHtml('h2')}
      <p class="muted small">Each syndrome also shows the date its own content was last reviewed.</p>
      ${rankingHtml()}
      <h3>Evidence for tumour associations</h3>
      <p class="small">Each association on a syndrome page names its sources: UK guidance (UKCGG, BSG, NICE), European guidance,
        GeneReviews, ${link('ClinGen gene–disease validity', 'https://search.clinicalgenome.org/kb/gene-validity')}, and the
        peer-reviewed studies below. Variant interpretation data: ${link('CanVar-UK', 'https://canvaruk.org/')}.</p>
      <ul class="small evidence-refs">${ev.map(([, [, t, u]]) => `<li>${link(t, u)}</li>`).join('')}</ul>`;
  }

  // In-page section links (buttons, so the URL hash keeps naming the syndrome).
  const jumpNav = items => `<nav class="jump" aria-label="On this page">${items.map(([id, label]) =>
    `<button type="button" data-jump="${id}">${label}</button>`).join('')}</nav>`;

  function pageActions(key) {
    return `<div class="actions">
      ${key.startsWith('syn:') ? `<select class="compare-pick" data-compare-from="${key.slice(4)}" aria-label="Compare with another syndrome"><option value="">Compare with…</option>${CONDITIONS.filter(c => c.id !== key.slice(4)).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>` : ''}
      ${key.startsWith('syn:') ? '<button type="button" class="btn-ghost" data-syn-act="copy">Copy summary</button>' : ''}
      <button type="button" class="btn-ghost" data-syn-act="link">Copy link</button>
      <button type="button" class="btn-ghost" data-syn-act="print">Print</button>
    </div>`;
  }
  const printKicker = (kind) => `<p class="print-only print-kicker">Cancer Family History Navigator – ${kind} summary · information checked ${esc(DATA_CHECKED)}</p>`;

  /* ---- Suggested surveillance (UK first, then European, then international) ---- */
  const SURV_LEVEL = {
    uk: ['UK', 'UK guidance'],
    eu: ['EU', 'European guidance – no UK gene-specific guideline'],
    intl: ['INTL', 'International guidance – no UK or European gene-specific guideline']
  };
  function survSource(k) {
    if (k.startsWith('gr:')) { const n = k.slice(3); return [`GeneReviews: ${GR_TITLES[n]} (summary of published guidelines)`, REF_LINKS.geneReviews(n)]; }
    return GUIDES[k] || EU_GUIDES[k] || US_GUIDES[k];
  }
  const survLink = k => { const [l, u] = survSource(k); return link(l, u); };

  function survHtml(c, heading = 'h3') {
    const sv = SURVEILLANCE[c.id];
    const h = `<${heading}${heading === 'h3' ? ' id="jump-surveillance"' : ''}>Suggested surveillance</${heading}>`;
    if (!sv || sv.lvl === 'none') return `${h}<p class="muted small">${esc(sv ? sv.note : 'No surveillance guidance recorded.')}</p>`;
    const [badge, label] = SURV_LEVEL[sv.lvl];
    return `${h}
      <p class="surv-src"><span class="surv-badge surv-${sv.lvl}">${badge}</span> ${esc(label)}. Based on: ${sv.src.map(survLink).join('; ')}</p>
      <div class="table-wrap"><table class="syn-table surv-table"><tbody>
        ${sv.items.map(([a, t]) => `<tr><th scope="row">${esc(a)}</th><td>${esc(t)}</td></tr>`).join('')}
      </tbody></table></div>
      ${sv.note ? `<p class="small">${esc(sv.note)}</p>` : ''}
      ${sv.diff ? `<p class="small"><strong>Other guidance that differs:</strong></p><ul class="small surv-diff">${sv.diff.map(([k, t]) => `<li>${survLink(k)}: ${esc(t)}</li>`).join('')}</ul>` : ''}
      <p class="muted small">Summarised from published guidance (checked ${esc(DATA_CHECKED)}). Confirm with the full guideline and local services (e.g. NHS screening programmes, NDRS Lynch portal) before use.</p>`;
  }

  function synPage(c, forPrint) {
    const flags = c.genes.map(g => [g, geneFlags(g)]).filter(([, f]) => f.length);
    const mods = (c.mods || []).map(([site, pred, f]) => `${site === '*' ? 'Any site' : SITES[site].label}: ${PRED_LABEL[pred]} ×${f}`);
    const notes = [c.note, c.notOnNicpr && 'Not on the NICPR gene list (June 2026) but included in Test Directory panels.'].filter(Boolean);
    return `${printKicker('Syndrome')}
      <div class="syn-head">
        <div><h2>${esc(c.name)}</h2>
          <div class="genes">${geneChips(c.genes)} <span class="inh">${esc(c.inh)}</span></div></div>
        ${forPrint ? '' : pageActions(`syn:${c.id}`)}
      </div>
      ${forPrint ? '' : jumpNav([['cancers', 'Cancers'], ...(VARIANT_NOTES[c.id] ? [['variants', 'Variants']] : []), ['tests', 'Tests'], ['guidance', 'Guidance'], ['surveillance', 'Surveillance'], ['sources', 'Sources']])}
      ${notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
      <dl class="syn-facts">
        <dt>Genes</dt><dd>${c.genes.map(g => forPrint ? esc(g) : `<a href="#gene=${g}">${esc(g)}</a>`).join(', ')}</dd>
        <dt>Inheritance</dt><dd>${esc(c.inh)}</dd>
        <dt>Last reviewed</dt><dd>${reviewedHtml(c)}</dd>
        ${flags.length ? `<dt>NICPR notes</dt><dd>${flags.map(([g, f]) => `${esc(g)}: ${esc(f.join('; '))}`).join('<br>')}</dd>` : ''}
      </dl>
      <h3 id="jump-cancers">Cancers and histology</h3>
      ${cancersTable(c)}
      <p class="muted small">Strength: hallmark 10, strong 6, moderate 3, weak 1 points. Early onset: ×1.5 at or below the age shown, ×2 if 15+ years below. “Only ≤”: the association only applies at or below this age. <button type="button" class="link-btn" data-goto-ranking>How strength is defined</button></p>
      ${mods.length ? `<p class="small"><strong>Score modifiers:</strong> ${esc(mods.join('; '))}</p>` : ''}
      ${variantHtml(c)}
      <h3 id="jump-tests">Test Directory tests</h3>
      ${c.tests.length ? testsDetail(c.tests) : '<p class="muted small">No specific Test Directory test is listed for this condition; discuss testing with your Genomic Laboratory Hub.</p>'}
      <h3 id="jump-guidance">Guidance, leaflets and references</h3>
      ${sourcesHtml(c)}
      ${survHtml(c)}
      ${datesHtml(forPrint)}`;
  }

  function genePage(g, forPrint) {
    const cs = condsForGene(g);
    const flags = geneFlags(g);
    const uniq = arr => [...new Set(arr)];
    const src = {};
    for (const k of ['eg', 'guide', 'eu', 'us']) src[k] = uniq(cs.flatMap(c => (SOURCES[c.id] || {})[k] || []));
    const mainCancers = c => {
      const top = [...c.rules].sort((x, y) => TIER_ORDER[x[2]] - TIER_ORDER[y[2]]);
      const strong = top.filter(r => r[2] === 'H' || r[2] === 'S');
      return (strong.length ? strong : top.slice(0, 3)).map(r => ruleText(r).text).join('; ');
    };
    return `${printKicker('Gene')}
      <div class="syn-head">
        <div><h2>${esc(g)}</h2>
          <div class="genes">${geneChips([g])} <span class="inh">${cs.length} syndrome${cs.length > 1 ? 's' : ''}</span></div></div>
        ${forPrint ? '' : pageActions(`gene:${g}`)}
      </div>
      ${forPrint ? '' : jumpNav([['syndromes', 'Syndromes'], ['tests', 'Tests'], ['guidance', 'Guidance'], ['surveillance', 'Surveillance'], ['sources', 'Sources']])}
      <dl class="syn-facts">
        <dt>OMIM gene</dt><dd>${geneMimLink(g)}</dd>
        ${CANVAR_GENES.includes(g) ? `<dt>Variant data</dt><dd>${link(`CanVar-UK ${g} gene-specific variant interpretation`, REF_LINKS.canvar(g))}</dd>` : ''}
        ${CLINGEN_HGNC[g] ? `<dt>Gene–disease validity</dt><dd>${link(`ClinGen ${g}`, REF_LINKS.clingen(g))}</dd>` : ''}
        <dt>NICPR</dt><dd>${esc(flags.join('; ') || 'On the NICPR list (June 2026)')}</dd>
      </dl>
      <h3 id="jump-syndromes">Syndromes caused by ${esc(g)}</h3>
      <div class="table-wrap"><table class="syn-table">
        <thead><tr><th>Syndrome</th><th>Inheritance</th><th>Main cancers and features (hallmark / strong)</th><th>Last reviewed</th></tr></thead>
        <tbody>${cs.map(c => `<tr><td>${forPrint ? esc(c.name) : `<a href="#syndrome=${c.id}">${esc(c.name)}</a>`}</td><td>${esc(c.inh)}</td><td>${abbrHtml(mainCancers(c))}</td><td>${reviewedHtml(c)}</td></tr>`).join('')}</tbody>
      </table></div>
      ${cs.filter(c => c.note).map(c => `<p class="note">${esc(c.name)}: ${esc(c.note)}</p>`).join('')}
      ${cs.map(c => variantHtml(c, 'h4').replace('Variant-level notes</h4>', `Variant-level notes – ${esc(c.name)}</h4>`)).join('')}
      <h3 id="jump-tests">Test Directory tests</h3>
      ${testsDetail(uniq(cs.flatMap(c => c.tests)))}
      <h3 id="jump-guidance">Guidance and leaflets</h3>
      <div class="sources">${guidanceHtml(src)}
        ${genotesHtml(cs.map(c => c.id))}
        <h4>References</h4>
        <ul>${cs.map(c => { const ph = phenoLinks(c); return `<li><strong>${esc(c.name)}</strong> – GeneReviews: ${grLinks(c)}${ph ? `; OMIM: ${ph}` : ''}</li>`; }).join('')}
          <li>OMIM gene: ${geneMimLink(g)}</li></ul>
      </div>
      <h3 id="jump-surveillance">Suggested surveillance</h3>
      ${cs.map(c => `<div class="surv-block">${survHtml(c, 'h4').replace('Suggested surveillance</h4>', `${esc(c.name)}</h4>`)}</div>`).join('')}
      ${datesHtml(forPrint)}`;
  }

  function currentKey() {
    return $('#browse-mode').value === 'gene' ? (state.gene && `gene:${state.gene}`) : (state.syn && `syn:${state.syn}`);
  }

  /* ---- Compare two syndromes: the cancers each causes, side by side ---- */
  function comparePage(a, b) {
    const A = COND[a], B = COND[b];
    const opts = sel => CONDITIONS.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    const rows = new Map();
    for (const [c, side] of [[A, 0], [B, 1]]) for (const r of c.rules) {
      const k = `${r[0]}|${r[1]}|${r[4] || ''}`;
      if (!rows.has(k)) rows.set(k, { r, cells: [null, null] });
      const cur = rows.get(k).cells[side];
      if (!cur || TIER_ORDER[r[2]] < TIER_ORDER[cur[2]]) rows.get(k).cells[side] = r;
    }
    const best = x => Math.min(...x.cells.filter(Boolean).map(r => TIER_ORDER[r[2]]));
    const cell = r => r ? `<span class="tier tier-${r[2]}" title="${esc(tierTitle(r[2]))}">${TIER_LABEL[r[2]]}</span>${r[3] != null ? ` <span class="muted small">early ≤${r[3]}</span>` : ''}${r[5] != null ? ` <span class="muted small">only ≤${r[5]}</span>` : ''}` : '<span class="muted">–</span>';
    const list = [...rows.values()].sort((x, y) => best(x) - best(y) || SITES[x.r[0]].label.localeCompare(SITES[y.r[0]].label));
    const shared = list.filter(x => x.cells[0] && x.cells[1]).length;
    return `<div class="syn-head"><div><h2>Compare syndromes</h2>
        <p class="muted small">The cancers and features each syndrome causes. ${shared} shared, ${list.length - shared} in only one.</p></div></div>
      <div class="compare-pickers">
        <label class="mk">First<select id="cmp-a">${opts(a)}</select></label>
        <label class="mk">Second<select id="cmp-b">${opts(b)}</select></label>
      </div>
      <div class="table-wrap"><table class="syn-table compare">
        <thead><tr><th>Cancer / feature</th>
          <th><a href="#syndrome=${A.id}">${esc(A.name)}</a><div class="genes">${geneChips(A.genes)} <span class="inh">${esc(A.inh)}</span></div></th>
          <th><a href="#syndrome=${B.id}">${esc(B.name)}</a><div class="genes">${geneChips(B.genes)} <span class="inh">${esc(B.inh)}</span></div></th></tr></thead>
        <tbody>${list.map(x => `<tr${x.cells[0] && x.cells[1] ? ' class="shared"' : ''}><td data-label="Cancer / feature">${abbrHtml(`${SITES[x.r[0]].label} – ${x.r[1] === '*' ? 'any type' : x.r[1].split('|').map(h => histLabel(x.r[0], h)).join(' / ')}`)}${x.r[4] ? ` <span class="muted small">(${abbrHtml(PRED_LABEL[x.r[4]])})</span>` : ''}</td>
          <td data-label="${esc(A.name)}">${cell(x.cells[0])}</td><td data-label="${esc(B.name)}">${cell(x.cells[1])}</td></tr>`).join('')}</tbody>
      </table></div>${TIER_LEGEND}`;
  }

  function renderSynDetail() {
    const key = currentKey();
    const out = $('#syn-detail');
    if (state.compareView) { out.innerHTML = comparePage(...state.compareView); return; }
    if (!key) { out.innerHTML = '<div class="empty">Choose an item from the list.</div>'; return; }
    const [t, id] = key.split(':');
    out.innerHTML = t === 'syn' ? synPage(COND[id], false) : genePage(id, false);
    foldSections(out);
  }
  // Phones: long sections (variants, tests, guidance, surveillance) start folded under their headings; the jump links open them.
  const FOLD = ['jump-variants', 'jump-tests', 'jump-guidance', 'jump-surveillance'];
  function foldSections(root) {
    if (window.innerWidth >= 700) return;
    for (const id of FOLD) {
      const h = root.querySelector(`h3#${id}`);
      if (!h) continue;
      const det = document.createElement('details');
      det.className = 'syn-fold'; det.id = id;
      const sum = document.createElement('summary');
      sum.innerHTML = h.innerHTML;
      det.append(sum);
      let n = h.nextSibling;
      while (n && !(n.nodeType === 1 && (/^H[23]$/.test(n.tagName) || n.matches('.sources-link, .dates')))) { const next = n.nextSibling; det.append(n); n = next; }
      h.replaceWith(det);
    }
  }

  function synSummary(c) {
    const src = SOURCES[c.id] || {};
    const ref = REFS[c.id];
    const L = [c.name.toUpperCase(), `Genes: ${c.genes.join(', ')} · Inheritance: ${c.inh}`];
    { const r = reviewInfo(c); L.push(`Last reviewed: ${r.text}${r.stale ? ' (over 12 months ago – due for review)' : ''}`); }
    if (c.note) L.push(c.note);
    L.push('', 'CANCERS AND HISTOLOGY');
    [...c.rules].sort((x, y) => TIER_ORDER[x[2]] - TIER_ORDER[y[2]]).forEach(r => {
      const t = ruleText(r);
      L.push(`- [${TIER_LABEL[t.tier]}] ${t.text}${r[7] ? ` – ${r[7]}` : ''}${r[6] ? ` (${evShort(r[6])})` : ''}${r[8] ? ` [US differs: ${r[8]}]` : ''}`);
    });
    if (VARIANT_NOTES[c.id]) { L.push('', 'VARIANT-LEVEL NOTES (information only)'); VARIANT_NOTES[c.id].forEach(([t, src]) => L.push(`- ${t} (${evShort(src)})`)); }
    const sv = SURVEILLANCE[c.id];
    if (sv) {
      L.push('', 'SUGGESTED SURVEILLANCE' + (sv.lvl !== 'none' ? ` (${SURV_LEVEL[sv.lvl][1]})` : ''));
      if (sv.lvl === 'none') L.push(`- ${sv.note}`);
      sv.items.forEach(([a, t]) => L.push(`- ${a}: ${t}`));
      if (sv.lvl !== 'none') L.push(`  Based on: ${sv.src.map(k => survSource(k)[0]).join('; ')}`);
      if (sv.note && sv.lvl !== 'none') L.push(`  ${sv.note}`);
      (sv.diff || []).forEach(([k, t]) => L.push(`  Differs – ${survSource(k)[0]}: ${t}`));
    }
    L.push('', 'TEST DIRECTORY');
    c.tests.forEach(k => L.push(`- ${TESTS[k].code} ${TESTS[k].name}${TESTS[k].part ? ` (Part ${TESTS[k].part})` : ''}`));
    L.push('', 'REFERENCES');
    ref.gr.forEach(n => L.push(`- GeneReviews: ${GR_TITLES[n]} ${REF_LINKS.geneReviews(n)}`));
    ref.omim.forEach(m => L.push(`- OMIM ${omimId(m)} ${OMIM_TITLES[m]} ${REF_LINKS.omim(m)}`));
    c.genes.forEach(g => L.push(`- OMIM ${g} *${GENE_MIM[g]} ${REF_LINKS.omim(GENE_MIM[g])}`));
    const sec = (title, keys, table) => { if (keys && keys.length) { L.push('', title); keys.forEach(k => L.push(`- ${table[k][0]} ${table[k][1]}`)); } };
    sec('UK GUIDANCE', src.guide, GUIDES);
    sec('EUROPEAN GUIDANCE', src.eu, EU_GUIDES);
    sec('US AND INTERNATIONAL GUIDANCE', src.us, US_GUIDES);
    if (src.eg) { L.push('', 'EAST GENOMICS LEAFLETS'); src.eg.forEach(k => L.push(`- ${EG[k].label} ${EG[k].url}`)); }
    if (src.ukl) { L.push('', 'UKCGG PATIENT INFORMATION'); src.ukl.forEach(k => L.push(`- ${UKCGG_LEAFLETS[k][0]} ${UKCGG_LEAFLETS[k][1]}`)); }
    L.push('', `Information checked: ${DATA_CHECKED}`, `Source: Cancer Family History Navigator – ${itemUrl(`syn:${c.id}`)}`);
    return L.join('\n');
  }

  async function copyText(btn, text, label) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
    catch (_) { window.prompt('Copy:', text); }
    setTimeout(() => { btn.textContent = label; }, 1500);
  }

  /*
   * Printing: the chosen pages are rendered into #print-area (one per printed page, with a
   * contents page when there are several); body.printing hides everything else on paper.
   */
  function printItems(keys, title) {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const foot = `<div class="print-foot">Clinical decision support only – not a substitute for clinical judgement; check the linked sources before use. ` +
      `Cancer Family History Navigator · ${esc(SITE_URL)} · information checked ${esc(DATA_CHECKED)} · printed ${esc(today)}</div>`;
    // A table footer repeats at the bottom of every printed page in all major browsers.
    const framed = html => `<section class="print-page"><table class="print-frame"><tfoot><tr><td>${foot}</td></tr></tfoot>` +
      `<tbody><tr><td>${html}</td></tr></tbody></table></section>`;
    const pages = keys.map(k => { const [t, id] = k.split(':'); return framed(t === 'syn' ? synPage(COND[id], true) : genePage(id, true)); });
    const contents = keys.length > 1 ? framed(`<div class="print-contents${keys.length > 12 ? ' long' : ''}">
        <h1>Cancer Family History Navigator</h1><h2>${esc(title)}</h2>
        <p>Information checked ${esc(DATA_CHECKED)} · printed ${esc(today)} · ${keys.length} items</p>
        <ol>${keys.map(k => `<li>${esc(itemName(k))}</li>`).join('')}</ol></div>`) : '';
    // The full disclaimer (from the page footer) ends every printout.
    const legal = `<section class="print-legal"><h3>Disclaimer</h3>${[...document.querySelectorAll('#disclaimer p')].map(x => `<p>${esc(x.textContent.replace(/\s+/g, ' ').trim())}</p>`).join('')}</section>`;
    $('#print-area').innerHTML = contents + pages.join('') + legal;
    document.body.classList.add('printing');
    window.print();
  }

  function onSynAction(e) {
    const j = e.target.closest('[data-jump]');
    if (j) { const t = document.getElementById('jump-' + j.dataset.jump); if (t) { const d = t.closest('details.syn-fold'); if (d) d.open = true; t.scrollIntoView({ behavior: 'smooth' }); } return; }
    const btn = e.target.closest('[data-syn-act]');
    if (!btn) return;
    const key = currentKey();
    if (btn.dataset.synAct === 'copy') copyText(btn, synSummary(COND[key.split(':')[1]]), 'Copy summary');
    if (btn.dataset.synAct === 'link') copyText(btn, itemUrl(key), 'Copy link');
    if (btn.dataset.synAct === 'print') printItems([key], itemName(key));
  }

  function onListAction(e) {
    // On phones the list collapses once an item is chosen.
    if (e.target.closest('a[href^="#"]')) { $('#syn-layout').classList.remove('list-open'); }
    const sel = e.target.closest('[data-sel]');
    if (sel) { if (sel.checked) state.sel.add(sel.dataset.sel); else state.sel.delete(sel.dataset.sel); renderSynList(); return; }
    const btn = e.target.closest('[data-print]');
    if (!btn) return;
    const mode = $('#browse-mode').value;
    if (btn.dataset.print === 'select') { state.selecting = true; renderSynList(); return; }
    if (btn.dataset.print === 'done') { state.sel.clear(); state.selecting = false; renderSynList(); return; }
    if (btn.dataset.print === 'selected') {
      const order = [...CONDITIONS.map(c => `syn:${c.id}`), ...GENES.map(g => `gene:${g}`)];
      printItems(order.filter(k => state.sel.has(k)), 'Selected syndromes and genes');
    }
    if (btn.dataset.print === 'shown') printItems(listGroups(mode).flatMap(([, l]) => l.map(i => i.key)), mode === 'gene' ? 'Gene handbook' : 'Syndrome handbook');
  }

  function renderBrowse() {
    const mode = $('#browse-mode').value;
    const out = $('#browse-results');
    const listMode = mode === 'syndrome' || mode === 'gene';
    $('#browse-cancer').hidden = listMode;
    $('#browse-filters').hidden = !listMode;
    $('#syn-layout').hidden = !listMode;
    out.hidden = listMode;
    if (listMode) { renderSynList(); return; }
    const site = $('#browse-site').value;
    const histSel = $('#browse-hist');
    const prevHist = histSel.value;
    histSel.innerHTML = site ? optionList(SITES[site].hist, prevHist, 'Any histology') : '<option value="">Any histology</option>';
    histSel.disabled = !site;
    if (!site) { out.innerHTML = '<div class="empty">Pick a cancer site to see which genes it suggests.</div>'; return; }
    const hist = histSel.value;
    const rows = [];
    for (const c of CONDITIONS) {
      const matching = c.rules.filter(r => r[0] === site && (!hist || r[1] === '*' || r[1].split('|').includes(hist)));
      if (!matching.length) continue;
      matching.sort((a, b) => TIER_ORDER[a[2]] - TIER_ORDER[b[2]]);
      rows.push({ c, best: matching[0][2], rules: matching });
    }
    rows.sort((a, b) => TIER_ORDER[a.best] - TIER_ORDER[b.best]);
    const ptrs = TEST_POINTERS.filter(t => t.site === site && (!hist || t.hist.split('|').includes(hist)));
    out.innerHTML = pointersHtml(ptrs, 'Testing pointers') + rows.map(({ c, rules }) => `<article class="result compact">
      <h3><a href="#syndrome=${c.id}">${esc(c.name)}</a></h3>
      <div class="genes">${geneChips(c.genes)}</div>
      <ul class="assoc">${rules.map(r => { const t = ruleText(r); return `<li><span class="tier tier-${t.tier}" title="${esc(tierTitle(t.tier))}">${TIER_LABEL[t.tier]}</span> ${abbrHtml(t.text)}</li>`; }).join('')}</ul>
    </article>`).join('') || '<div class="empty">No associations recorded.</div>';
  }

  /*
   * The address holds the open tab: no hash = Family assessment, #syndromes = Syndromes tab,
   * #syndrome=<id> = a syndrome page, #gene=<symbol> = a gene page (shareable). Refresh, Back
   * and Forward follow it.
   */
  function route() {
    const cm = location.hash.match(/^#compare=(\w+),(\w+)$/);
    state.compareView = cm && COND[cm[1]] && COND[cm[2]] ? [cm[1], cm[2]] : null;
    if (state.compareView) {
      $('#browse-mode').value = 'syndrome';
      setTab('browse');
      if ($('#syn-detail').getBoundingClientRect().top < $('.tabbar').offsetHeight) $('#syn-detail').scrollIntoView();
      return;
    }
    const m = location.hash.match(/^#(syndrome|gene)=(\w+)$/);
    const ok = m && (m[1] === 'syndrome' ? COND[m[2]] : GENES.includes(m[2]));
    if (ok) {
      const isSyn = m[1] === 'syndrome';
      if (isSyn) state.syn = m[2]; else state.gene = m[2];
      $('#browse-mode').value = isSyn ? 'syndrome' : 'gene';
      if (!(isSyn ? synMatches(COND[m[2]]) : geneMatches(m[2]))) { $('#browse-search').value = ''; $('#browse-test').value = ''; $('#browse-ukcgg').checked = false; }
      setTab('browse');
      if ($('#syn-detail').getBoundingClientRect().top < $('.tabbar').offsetHeight) $('#syn-detail').scrollIntoView();
    } else {
      setTab(location.hash === '#syndromes' ? 'browse' : location.hash === '#sources' ? 'sources' : 'assess');
    }
  }

  function goTab(tab) {
    if (tab === 'sources') {
      if (location.hash !== '#sources') location.hash = 'sources'; else route();
    } else if (tab === 'browse') {
      const key = currentKey();
      if (!/^#(syndrome|gene|compare)=/.test(location.hash)) location.hash = key ? `${key.startsWith('gene') ? 'gene' : 'syndrome'}=${key.split(':')[1]}` : 'syndromes';
      else route();
    } else if (location.hash) {
      history.pushState(null, '', location.pathname + location.search);
      route();
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- Example & setup ---------------- */

  // Example families (EXAMPLES in data.js), chosen from the "Load example" menu.
  function loadExample(exId) {
    const ex = EXAMPLES.find(e => e.id === exId) || EXAMPLES[0];
    state.people = ex.people.map(([rel, sex, dxs, extra]) => ({ ...newPerson(rel), sex, ...(extra || {}), dx: (dxs.length ? dxs : [{}]).map(d => ({ ...newDx(), ...d })) }));
    state.ancestry = ex.ancestry || ''; $('#ancestry').value = state.ancestry;
    state.openPeople.clear();
    renderFamily();
    renderResults();
    showExampleNote(ex);
  }
  function showExampleNote(ex) {
    const n = $('#example-note');
    if (!ex) { n.hidden = true; n.innerHTML = ''; return; }
    n.innerHTML = `<p><strong>Example – ${esc(ex.label)}:</strong> ${abbrHtml(ex.caption)} <span class="muted">(fictional family)</span></p>
      <button type="button" class="icon-btn" data-act="close-example-note" title="Hide this note" aria-label="Hide example note">×</button>`;
    n.hidden = false;
  }
  function exampleButtons() { return EXAMPLES.map(e => `<button type="button" class="ex-item" data-load-example="${e.id}">${esc(e.label)}</button>`).join(''); }
  function setExampleMenu(open) {
    const m = $('#example-menu'), b = $('#example');
    if (open && !m.innerHTML) m.innerHTML = exampleButtons();
    m.hidden = !open; b.setAttribute('aria-expanded', String(open));
    // Keep the menu on screen (on a phone the button can sit near the left edge).
    if (open) {
      m.style.right = '0'; m.style.left = 'auto';
      const r = m.getBoundingClientRect(), pad = 8;
      if (r.left < pad) m.style.right = `${r.left - pad}px`;
      else if (r.right > innerWidth - pad) m.style.right = `${r.right - (innerWidth - pad)}px`;
    }
    if (open) m.querySelector('.ex-item').focus();
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#tab-assess').hidden = tab !== 'assess';
    $('#tab-browse').hidden = tab !== 'browse';
    $('#tab-sources').hidden = tab !== 'sources';
    if (tab === 'browse') renderBrowse();
    if (tab === 'sources') renderSources();
    if (tab === 'assess') fitPedigree();
  }

  function init() {
    $('#family').addEventListener('change', onFamilyInput);
    $('#family').addEventListener('input', e => { if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') onFamilyInput(e); });
    $('#family').addEventListener('click', onFamilyClick);
    $('#add-person').addEventListener('click', () => {
      const np = newPerson('unset');
      state.people.push(np); state.openPeople.clear();
      renderFamily(); renderResults(); focusPerson(np.id);
    });
    // "How strength is defined": open the Sources tab at the ranking section.
    document.addEventListener('click', e => {
      if (!(e.target.closest && e.target.closest('[data-goto-ranking]'))) return;
      const go = () => { const r = $('#ranking'); if (r) { r.scrollIntoView({ block: 'start' }); r.focus({ preventScroll: true }); } };
      if (location.hash !== '#sources') { location.hash = 'sources'; setTimeout(go, 50); } else go();
    });
    // "Disclaimer" links in the notice strip scroll to the footer section (without changing the page's #route).
    document.querySelectorAll('.disc-link').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); const d = $('#disclaimer'); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); d.focus({ preventScroll: true });
    }));
    $('#example').addEventListener('click', () => setExampleMenu($('#example-menu').hidden));
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-load-example]');
      if (t) { setExampleMenu(false); loadExample(t.dataset.loadExample); return; }
      if (e.target.closest && e.target.closest('[data-act=close-example-note]')) { showExampleNote(null); return; }
      if (!$('#example-menu').hidden && !e.target.closest('.ex-wrap')) setExampleMenu(false);
    });
    $('#example-menu').addEventListener('keydown', e => {
      const items = [...$('#example-menu').querySelectorAll('.ex-item')], i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { setExampleMenu(false); $('#example').focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    });
    $('#clear').addEventListener('click', () => {
      const before = JSON.stringify(state.people);
      state.people = [newPerson('proband')]; state.expanded.clear(); state.openPeople.clear(); renderFamily(); renderResults(); showExampleNote(null);
      offerUndo('Family cleared.', before);
    });
    // Find-a-cancer list, family files, remember-on-device, ancestry.
    $('#cancer-finder').innerHTML = [...FINDER.keys()].map(k => `<option value="${esc(k)}"></option>`).join('');
    $('#save-family').addEventListener('click', saveFamilyFile);
    $('#open-family').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { loadFamily(JSON.parse(t)); toast(`Opened ${f.name}.`); })
        .catch(() => toast('That file could not be opened. Choose a family file saved from this site.'))
        .finally(() => { e.target.value = ''; });
    });
    try {
      $('#remember').checked = localStorage.getItem(REMEMBER_KEY + ':on') === '1';
      if ($('#remember').checked) { const saved = localStorage.getItem(REMEMBER_KEY); if (saved) loadFamily(JSON.parse(saved)); }
    } catch (e) { /* storage unavailable */ }
    $('#remember').addEventListener('change', e => {
      try {
        if (e.target.checked) { localStorage.setItem(REMEMBER_KEY + ':on', '1'); remember(); toast('This family will be remembered in this browser until you untick the box.'); }
        else { localStorage.removeItem(REMEMBER_KEY + ':on'); localStorage.removeItem(REMEMBER_KEY); toast('Family removed from this browser.'); }
      } catch (err) { e.target.checked = false; toast('This browser does not allow saving here. Use "Save family to file" instead.'); }
    });
    $('#ancestry').addEventListener('change', e => { state.ancestry = e.target.value; renderResults(); });
    // Results: expand / collapse lower-ranked cards, compare the top two, jump to results on phones.
    $('#results').addEventListener('click', e => {
      const ex = e.target.closest('[data-expand]'), co = e.target.closest('[data-collapse]');
      if (ex) { state.expanded.add(ex.dataset.expand); renderResults(); }
      if (co) { state.expanded.delete(co.dataset.collapse); renderResults(); }
    });
    $('#compare-top').addEventListener('click', () => { if (lastShown.length > 1) location.hash = `compare=${lastShown[0].cond.id},${lastShown[1].cond.id}`; });
    $('#to-results').addEventListener('click', () => $('#results').scrollIntoView({ behavior: 'smooth' }));
    window.addEventListener('scroll', updateToResults, { passive: true });
    window.addEventListener('resize', updateToResults);
    $('#syn-detail').addEventListener('change', e => {
      if (e.target.matches('.compare-pick') && e.target.value) location.hash = `compare=${e.target.dataset.compareFrom},${e.target.value}`;
      if (e.target.id === 'cmp-a' || e.target.id === 'cmp-b') location.hash = `compare=${$('#cmp-a').value},${$('#cmp-b').value}`;
    });
    $('#copy').addEventListener('click', e => copySummary(e.target));
    $('#print').addEventListener('click', () => window.print());
    // One-page clinic summary: the same printout with only the essentials (see body.print-brief in style.css).
    $('#print-brief').addEventListener('click', () => { document.body.classList.add('print-brief'); window.print(); setTimeout(() => document.body.classList.remove('print-brief'), 1000); });
    // Family tree: open/closed state, highlighted syndrome, downloads.
    $('#tab-assess').addEventListener('toggle', e => { if (e.target.id === 'ped') { state.treeOpen = e.target.open; fitPedigree(); } }, true);
    window.addEventListener('resize', fitPedigree);
    $('#tab-assess').addEventListener('change', e => { if (e.target.id === 'ped-syn') { state.treeSyn = e.target.value; renderResults(); } });
    $('#tab-assess').addEventListener('click', e => {
      const dl = e.target.closest('[data-ped-dl]');
      if (dl) { pedigreeExport(dl.dataset.pedDl); return; }
      const fit = e.target.closest('[data-ped-fit]');
      if (fit) { state.treeFit = !state.treeFit; fit.setAttribute('aria-pressed', state.treeFit); fitPedigree(); return; }
      if (e.target.closest('[data-ped-full]')) { openTreeFull(); return; }
      const head = e.target.closest('.result-head');
      if (head && !e.target.closest('a, button')) { state.treeSyn = head.closest('.result').dataset.cond; renderResults(); }
    });
    // Printing the assessment always includes the tree, even if it was collapsed.
    let pedWasOpen = null;
    // Printing the assessment: every result in full, the tree open, and a family history table first.
    window.addEventListener('beforeprint', () => {
      if (document.body.classList.contains('printing')) return;
      const wasOpen = $('#ped') ? $('#ped').open : null;
      state.printFull = true; renderResults();
      const d = $('#ped'); if (d) { pedWasOpen = wasOpen; d.open = true; }
    });
    window.addEventListener('afterprint', () => {
      if (!state.printFull) return;
      state.printFull = false; renderResults();
      document.body.classList.remove('print-brief');
      const d = $('#ped'); if (d && pedWasOpen !== null) { d.open = pedWasOpen; state.treeOpen = pedWasOpen; pedWasOpen = null; }
    });
    // Adopted tick in the Manchester panel: saved on the proband, so every score and criterion updates.
    document.addEventListener('change', e => {
      const t = e.target.closest && e.target.closest('[data-mss-adopted]');
      if (!t) return;
      const p = state.people.find(x => x.id === +t.dataset.mssAdopted);
      if (!p) return;
      p.adopted = t.checked;
      const back = $('#back-from-mss') ? $('#back-from-mss').dataset.back : null;
      renderFamily(); renderResults();
      openManchester(p.id, back);
    });
    // Manchester score links open the breakdown (with a way back when opened from a criteria panel).
    document.addEventListener('click', e => {
      const m = e.target.closest && e.target.closest('[data-mss], [data-back]');
      if (!m) return;
      e.preventDefault(); e.stopPropagation();
      if (m.dataset.back) { openCriteria(m.dataset.back); return; }
      const dlg = m.closest('#crit-dialog');
      openManchester(+m.dataset.mss, dlg && TESTS[dlg.dataset.view] ? dlg.dataset.view : null);
    }, true);
    document.addEventListener('focusin', () => updateToResults());
    document.addEventListener('focusout', () => setTimeout(updateToResults, 0));
    // Test codes open the criteria panel.
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-test]');
      if (!b || b.closest('#crit-dialog')) return;
      e.preventDefault(); e.stopPropagation();
      openCriteria(b.dataset.test);
    }, true);
    // Abbreviations: marked everywhere as content renders; the meaning shows at once in a tooltip on hover or tap.
    const tip = document.createElement('div');
    tip.id = 'abbr-tip'; tip.className = 'no-abbr'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    document.body.append(tip);
    let tipFor = null;
    const TIP_SEL = 'abbr.abbr, svg text[data-tip]';
    const showTip = el => {
      if (el.title) { el.dataset.full = el.dataset.full || el.title; el.removeAttribute('title'); } // avoid the slow browser tooltip as well
      tip.textContent = el.dataset.full || el.dataset.tip;
      // An open modal (the criteria panel) sits in the top layer above the page, so the tooltip must live inside it.
      const host = el.closest('dialog[open]') || document.body;
      if (tip.parentNode !== host) host.append(tip);
      tip.hidden = false; tipFor = el;
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
      const top = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    };
    const hideTip = () => { tip.hidden = true; tipFor = null; };
    document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest(TIP_SEL); if (el) showTip(el); else if (tipFor) hideTip(); });
    document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('abbr.abbr'); if (el) showTip(el); else if (tipFor) hideTip(); });
    document.addEventListener('click', e => {
      const el = e.target.closest && e.target.closest(TIP_SEL);
      if (!el) { if (tipFor) hideTip(); return; }
      if (el.closest('a, button, summary, label')) return; // links and controls keep working; hover still shows the meaning
      e.preventDefault();
      if (tipFor === el && e.pointerType !== 'mouse') hideTip(); else showTip(el);
    }, true);
    window.addEventListener('scroll', () => { if (tipFor) hideTip(); }, { passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && tipFor) hideTip(); });
    let abbrQueued = false;
    new MutationObserver(() => {
      if (abbrQueued) return;
      abbrQueued = true;
      requestAnimationFrame(() => { abbrQueued = false; markAbbr(document.body); });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    markAbbr(document.body);
    document.addEventListener('click', e => {
      const m = e.target.closest('[data-mode]');
      if (m) { state.mode = m.dataset.mode; renderResults(); }
      const t = e.target.closest('[data-tab]');
      if (t) goTab(t.dataset.tab);
    });
    $('#browse-site').innerHTML = optionList(Object.entries(SITES).map(([k, s]) => [k, s.label]), '', 'Choose site…');
    const usedTests = Object.keys(TESTS).filter(k => CONDITIONS.some(c => c.tests.includes(k))).sort((a, b) => a.slice(1) - b.slice(1));
    $('#browse-test').innerHTML = optionList(usedTests.map(k => [k, `${k} ${TESTS[k].name}`]), '', 'Any test');
    ['browse-mode', 'browse-site', 'browse-hist', 'browse-test', 'browse-ukcgg'].forEach(id => $('#' + id).addEventListener('change', renderBrowse));
    $('#browse-search').addEventListener('input', renderBrowse);
    $('#syn-detail').addEventListener('click', onSynAction);
    $('#syn-list').addEventListener('click', onListAction);
    $('#syn-list-toggle').addEventListener('click', () => { $('#syn-layout').classList.toggle('list-open'); renderSynList(); });
    window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); $('#print-area').innerHTML = ''; });
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    // A link to the syndrome already in the URL fires no hashchange, so open it directly.
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#syndrome="], a[href^="#gene="]');
      if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); route(); }
    });
    $('#gene-count').textContent = NICPR.genes.length;
    $('#cond-count').textContent = CONDITIONS.length;
    $('#foot-genes').textContent = NICPR.genes.length;
    $('#foot-conds').textContent = CONDITIONS.length;
    $('#foot-checked').textContent = DATA_CHECKED;
    staleNote();
    renderFamily();
    renderResults();
    route();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
