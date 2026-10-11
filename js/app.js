/* Cancer predisposition differential – scoring engine and UI. */
(function () {
  'use strict';

  const REL = Object.fromEntries(RELATIONS.map(r => [r[0], { id: r[0], label: r[1], degree: r[2], side: r[3], sex: r[4] }]));
  const REL_FACTOR = [1, 1, 0.6, 0.35];
  const MODES = {
    narrow: { label: 'Narrow', minFrac: 0.35, max: 6, needStrong: true },
    balanced: { label: 'Balanced', minFrac: 0.15, max: 15, needStrong: false },
    wide: { label: 'Wide', minFrac: 0, max: Infinity, needStrong: false }
  };

  let uid = 0;
  const nextId = () => ++uid;
  const newDx = () => ({ id: nextId(), site: '', hist: '', age: '', er: '', pr: '', her2: '', mmr: '', meth: '', braf: '', count: '', bilat: false });
  const newPerson = (rel) => ({ id: nextId(), rel, sex: REL[rel].sex, dx: [newDx()] });

  const state = { people: [newPerson('proband')], mode: 'balanced', tab: 'assess' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    for (const rule of cond.rules) {
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
    if (dx.bilat) { mult *= 1.3; modNotes.push('bilateral / multiple ×1.3'); }
    return { ...best, value: best.value * mult, modNotes };
  }

  function scoreFamily() {
    const results = [];
    for (const cond of CONDITIONS) {
      const recessive = cond.inh.startsWith('AR');
      const sides = { core: 0, M: 0, P: 0, unknown: 0 };
      const evidence = [];
      let strongCount = 0, hasStrong = false;
      for (const p of state.people) {
        const rel = REL[p.rel];
        for (const dx of p.dx) {
          if (!dx.site || !dx.hist) continue;
          const s = scoreDx(cond, dx, p);
          if (!s || s.value <= 0) continue;
          let rf = REL_FACTOR[rel.degree];
          if (recessive && !(rel.degree === 0 || rel.side === 'core')) rf *= 0.2;
          const v = s.value * rf;
          const side = ['core', 'core2', 'child'].includes(rel.side) ? 'core' : rel.side;
          sides[side] += v;
          if (TIER[s.tier] >= TIER.M && s.value >= TIER.M * 0.5) strongCount++;
          if ((s.tier === 'H' || s.tier === 'S') && s.value >= TIER.M) hasStrong = true;
          evidence.push({ person: p, dx, s, v });
        }
      }
      if (!evidence.length) continue;
      let total = recessive
        ? sides.core + sides.M + sides.P + sides.unknown
        : sides.core + Math.max(sides.M, sides.P) + 0.3 * Math.min(sides.M, sides.P) + sides.unknown;
      total *= 1 + 0.2 * Math.min(Math.max(strongCount - 1, 0), 5);
      evidence.sort((a, b) => b.v - a.v);
      results.push({ cond, score: total, evidence, hasStrong });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  function filterByMode(results) {
    const mode = MODES[state.mode];
    const top = results.length ? results[0].score : 0;
    const shown = results.filter(r => r.score >= top * mode.minFrac && (!mode.needStrong || r.hasStrong)).slice(0, mode.max);
    return { shown, hidden: results.length - shown.length, top };
  }

  /* ---------------- Text helpers ---------------- */

  function personLabel(p) {
    const r = REL[p.rel];
    return r.label + (p.sex && !r.sex ? ` (${p.sex})` : '');
  }

  function dxText(dx, person) {
    const site = SITES[dx.site];
    let t = `${site.label}: ${histLabel(dx.site, dx.hist)}`;
    const extra = [];
    if (dx.site === 'breast') {
      if (dx.er || dx.pr || dx.her2) {
        const sign = v => (v === 'pos' ? '+' : v === 'neg' ? '−' : '?');
        extra.push(PRED.tnbc(dx) ? 'triple negative' : `ER${sign(dx.er)} PR${sign(dx.pr)} HER2${sign(dx.her2)}`);
      }
    }
    if (dx.mmr) extra.push(MARKER_OPTIONS.mmr.opts.find(o => o[0] === dx.mmr)[1]);
    if (dx.meth) extra.push(`MLH1 methylation ${dx.meth === 'yes' ? 'present' : 'absent'}`);
    if (dx.braf) extra.push(`BRAF V600E ${dx.braf === 'yes' ? 'present' : 'absent'}`);
    if (dx.site === 'polyps' && dx.count !== '') extra.push(`n=${dx.count}`);
    if (dx.bilat) extra.push('bilateral / multiple');
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
    return `<span class="test-chip" title="${esc(part + t.name)}">${esc(t.code)} · ${esc(t.name)}</span>`;
  }

  const link = (label, url) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

  const leafletLi = k => `<li>${link(EG[k].label, EG[k].url)}</li>`;

  /* Leaflets and UK / European / US guidance for a source set {eg, guide, eu, us}. */
  function guidanceHtml(src) {
    const list = (keys, table) => (keys || []).map(k => `<li>${link(table[k][0], table[k][1])}</li>`).join('');
    const eu = list(src.eu, EU_GUIDES), us = list(src.us, US_GUIDES);
    return `<h4>East Genomics patient information</h4>
      <ul>${(src.eg || []).map(leafletLi).join('') || `<li class="muted">No condition-specific leaflet – general leaflets below, or see the ${link('A-Z index', EG_AZ)}</li>${EG_GENERAL.map(leafletLi).join('')}`}</ul>
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

  function sourcesHtml(c) {
    const pheno = phenoLinks(c);
    return `<div class="sources">${guidanceHtml(SOURCES[c.id] || {})}
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

  function renderDx(p, dx) {
    const siteOpts = Object.entries(SITES).map(([k, s]) => [k, s.label]);
    const site = SITES[dx.site];
    let markers = '';
    if (site) {
      for (const m of site.markers || []) {
        if (m === 'count') {
          markers += `<label class="mk">Number<input type="number" min="0" inputmode="numeric" data-f="count" value="${esc(dx.count)}" placeholder="n"></label>`;
        } else {
          const mo = MARKER_OPTIONS[m];
          markers += `<label class="mk">${esc(mo.label)}<select data-f="${m}">${optionList(mo.opts, dx[m])}</select></label>`;
        }
      }
    }
    return `<div class="dx" data-did="${dx.id}">
      <div class="dx-main">
        <select data-f="site" aria-label="Site">${optionList(siteOpts, dx.site, 'Cancer site / finding…')}</select>
        <select data-f="hist" aria-label="Histology"${site ? '' : ' disabled'}>${site ? optionList(site.hist, dx.hist, 'Histology / type…') : '<option>Histology…</option>'}</select>
        <input type="number" min="0" max="120" inputmode="numeric" data-f="age" value="${esc(dx.age)}" placeholder="Age" aria-label="Age at diagnosis">
        <button type="button" class="icon-btn" data-act="rm-dx" title="Remove">×</button>
      </div>
      ${site ? `<div class="dx-markers">${markers}<label class="mk chk"><input type="checkbox" data-f="bilat"${dx.bilat ? ' checked' : ''}>Bilateral / multifocal / multiple primaries</label></div>` : ''}
    </div>`;
  }

  function renderPerson(p) {
    const isProband = p.rel === 'proband';
    const relOpts = RELATIONS.filter(r => isProband ? r[0] === 'proband' : r[0] !== 'proband').map(r => [r[0], r[1]]);
    return `<section class="person" data-pid="${p.id}">
      <div class="person-head">
        ${isProband ? '<strong class="proband-label">Proband</strong>' : `<select data-f="rel" aria-label="Relationship">${optionList(relOpts, p.rel)}</select>`}
        <select data-f="sex" aria-label="Sex">${optionList([['F', 'Female'], ['M', 'Male']], p.sex, 'Sex')}</select>
        ${isProband ? '' : '<button type="button" class="icon-btn" data-act="rm-person" title="Remove relative">×</button>'}
      </div>
      ${p.dx.map(d => renderDx(p, d)).join('')}
      <button type="button" class="link-btn" data-act="add-dx">+ Add cancer or finding</button>
    </section>`;
  }

  function renderFamily() {
    $('#family').innerHTML = state.people.map(renderPerson).join('');
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
    const val = el.type === 'checkbox' ? el.checked : el.value;
    if (dx) {
      dx[f] = val;
      if (f === 'site') { Object.assign(dx, { ...newDx(), id: dx.id, site: val, age: dx.age }); renderFamily(); }
    } else {
      p[f] = val;
      if (f === 'rel' && REL[val].sex) { p.sex = REL[val].sex; renderFamily(); }
    }
    renderResults();
  }

  function onFamilyClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { p, dx } = findTarget(btn);
    switch (btn.dataset.act) {
      case 'add-dx': p.dx.push(newDx()); break;
      case 'rm-dx': p.dx = p.dx.filter(x => x !== dx); if (!p.dx.length) p.dx.push(newDx()); break;
      case 'rm-person': state.people = state.people.filter(x => x !== p); break;
      default: return;
    }
    renderFamily();
    renderResults();
  }

  /* ---------------- Results ---------------- */

  function evidenceLine(ev) {
    const { person, dx, s } = ev;
    const bits = [`<span class="tier tier-${s.tier}">${TIER_LABEL[s.tier]}</span>`];
    const notes = [...s.notes, ...s.modNotes];
    return `<li>${bits.join('')} <strong>${esc(personLabel(person))}</strong> — ${esc(dxText(dx, person))}${notes.length ? ` <span class="muted">· ${esc(notes.join('; '))}</span>` : ''}</li>`;
  }

  function associationsHtml(cond) {
    const order = { H: 0, S: 1, M: 2, W: 3 };
    return cond.rules.map(ruleText).sort((a, b) => order[a.tier] - order[b.tier])
      .map(r => `<li><span class="tier tier-${r.tier}">${TIER_LABEL[r.tier]}</span> ${esc(r.text)}</li>`).join('');
  }

  function resultCard(r, i, top) {
    const c = r.cond;
    const pct = Math.max(4, Math.round((r.score / top) * 100));
    const notes = [];
    if (c.note) notes.push(c.note);
    if (c.notOnNicpr) notes.push('Not on the NICPR gene list (June 2026) but included in Test Directory panels.');
    return `<article class="result">
      <div class="result-head">
        <span class="rank">${i + 1}</span>
        <div class="result-title">
          <h3>${esc(c.name)}</h3>
          <div class="genes">${geneChips(c.genes)} <span class="inh">${esc(c.inh)}</span></div>
        </div>
        <span class="score" title="Relative score">${r.score.toFixed(1)}</span>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <ul class="evidence">${r.evidence.map(evidenceLine).join('')}</ul>
      ${notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
      <div class="tests">${c.tests.map(testChip).join('')}</div>
      <details><summary>All associations</summary><ul class="assoc">${associationsHtml(c)}</ul></details>
      <details><summary>Leaflets &amp; sources</summary>${sourcesHtml(c)}</details>
      <a class="small syn-open" href="#syndrome=${c.id}">Open syndrome page →</a>
    </article>`;
  }

  function testsSummary(shown) {
    const map = new Map();
    shown.forEach((r, i) => r.cond.tests.forEach(t => {
      if (!map.has(t)) map.set(t, { rank: i, conds: [] });
      map.get(t).conds.push(r.cond);
    }));
    return [...map.entries()].sort((a, b) => a[1].rank - b[1].rank);
  }

  function renderTests(shown) {
    const list = testsSummary(shown);
    if (!list.length) return '';
    return `<h2>Suggested Test Directory tests</h2>
      <p class="muted small">Criteria condensed from the ${link(TD_VERSION, TD_URL)}, Part XI (Inherited cancer) unless
      another part is shown. For deceased probands, stored DNA or tissue is needed with no living affected relative,
      after cancer genetics MDT.</p>
      ${list.map(([key, info]) => {
        const t = TESTS[key];
        return `<article class="test">
          <h3><span class="code">${esc(t.code)}</span> ${esc(t.name)}${t.part ? ` <span class="muted small">Part ${esc(t.part)}</span>` : ''}</h3>
          <p class="muted">Genes: ${esc(t.genes)}${t.panel ? ` · ${link('PanelApp ' + t.panel, PANELAPP(t.panel))}` : ''}</p>
          <p class="muted">For: ${info.conds.map(c => esc(c.name)).join('; ')}</p>
          <details open><summary>Eligibility criteria</summary><ul>${t.criteria.map(c => `<li>${esc(c)}</li>`).join('')}</ul></details>
        </article>`;
      }).join('')}
      <p class="muted small">Unaffected individuals with no living affected relative: ${esc(TESTS.R404.code)} ${esc(TESTS.R404.name)} – ${esc(TESTS.R404.criteria[0])}.</p>`;
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

  function renderResults() {
    const all = scoreFamily();
    const { shown, hidden, top } = filterByMode(all);
    lastShown = shown;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    const out = $('#results');
    if (!all.length) {
      out.innerHTML = `<div class="empty">Enter cancers or findings in the family to see a ranked differential.</div>`;
      return;
    }
    out.innerHTML = `
      <p class="muted small">${shown.length} shown${hidden ? ` · ${hidden} more in a wider search` : ''}. Scores are relative and are not probabilities.</p>
      ${shown.map((r, i) => resultCard(r, i, top)).join('')}
      ${hidden && state.mode !== 'wide' ? `<button type="button" class="link-btn" data-mode="wide">Show all ${all.length} →</button>` : ''}
      ${pointersHtml(pointersFor(familyDxs()), 'Testing pointers for the cancers entered')}
      ${renderTests(shown)}`;
  }

  /* ---------------- Summary ---------------- */

  function summaryText() {
    const lines = ['FAMILY HISTORY'];
    for (const p of state.people) {
      const dxs = p.dx.filter(d => d.site && d.hist);
      if (!dxs.length) continue;
      lines.push(`- ${personLabel(p)}: ${dxs.map(d => dxText(d, p)).join('; ')}`);
    }
    lines.push('', `DIFFERENTIAL (${MODES[state.mode].label.toLowerCase()} search)`);
    lastShown.forEach((r, i) => lines.push(`${i + 1}. ${r.cond.name} [${r.cond.genes.join(', ')}] – score ${r.score.toFixed(1)}`));
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
  function filterPass(conds, texts) {
    const q = $('#browse-search').value.trim().toLowerCase();
    const test = $('#browse-test').value;
    if (test && !conds.some(c => c.tests.includes(test))) return false;
    if ($('#browse-ukcgg').checked && !conds.some(c => SOURCES[c.id] && SOURCES[c.id].guide)) return false;
    return !q || texts.some(t => t.toLowerCase().includes(q));
  }
  const synMatches = c => filterPass([c], [c.name, ...c.genes, ...c.rules.map(r => ruleText(r).text)]);
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
    $('#syn-list').innerHTML = `<div class="print-bar">
        <span class="muted small">${items.length} of ${total} ${mode === 'gene' ? 'genes' : 'syndromes'}</span>
        <button type="button" class="btn-ghost" data-print="selected"${n ? '' : ' disabled'}>Print selected (${n})</button>
        <button type="button" class="btn-ghost" data-print="shown"${items.length ? '' : ' disabled'}>Print all shown (${items.length})</button>
        ${n ? '<button type="button" class="link-btn small" data-print="clear">Clear selection</button>' : ''}
      </div>` + (groups.map(([label, list]) => `<h4>${esc(label)}</h4><ul>${list.map(i =>
        `<li><input type="checkbox" data-sel="${i.key}" aria-label="Select ${esc(i.name)} for printing"${state.sel.has(i.key) ? ' checked' : ''}>
          <a href="${i.href}"${i.key === cur ? ' aria-current="true"' : ''}>${esc(i.name)}${i.sub ? ` <span class="muted small">${i.sub}</span>` : ''}</a></li>`).join('')}</ul>`).join('')
      || '<div class="empty">No matches.</div>');
    renderSynDetail();
  }

  function cancersTable(c) {
    const rows = [...c.rules].sort((x, y) => TIER_ORDER[x[2]] - TIER_ORDER[y[2]]).map(([site, hist, tier, early, pred, maxAge]) => {
      const h = hist === '*' ? 'Any type' : hist.split('|').map(x => histLabel(site, x)).join('; ');
      return `<tr><td>${esc(SITES[site].label)}</td><td>${esc(h)}</td>
        <td><span class="tier tier-${tier}">${TIER_LABEL[tier]}</span></td>
        <td>${early != null ? '≤' + early : '–'}</td><td>${maxAge != null ? '≤' + maxAge : '–'}</td>
        <td>${pred ? esc(PRED_LABEL[pred]) : '–'}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="syn-table">
      <thead><tr><th>Site</th><th>Histology / type</th><th>Strength</th><th>Early onset</th><th>Age limit</th><th>Condition</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function testsDetail(keys) {
    return keys.map(k => {
      const t = TESTS[k];
      return `<div class="test">
        <h4><span class="code">${esc(t.code)}</span> ${esc(t.name)}${t.part ? ` <span class="muted small">Part ${esc(t.part)}</span>` : ''}</h4>
        <p class="muted">Genes: ${esc(t.genes)}${t.panel ? ` · ${link('PanelApp ' + t.panel, PANELAPP(t.panel))}` : ''}</p>
        <ul>${t.criteria.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    }).join('');
  }

  function datesHtml() {
    return `<h3>Information sources and dates</h3>
      <p class="small">Information checked: <strong>${esc(DATA_CHECKED)}</strong>. Guideline years are shown in each title.</p>
      <div class="table-wrap"><table class="syn-table dates"><thead><tr><th>Source</th><th>Version</th><th>Checked</th></tr></thead>
      <tbody>${SOURCE_DATES.map(([src, ver, d]) => `<tr><td>${esc(src)}</td><td>${esc(ver)}</td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function pageActions(key) {
    return `<div class="actions">
      ${key.startsWith('syn:') ? '<button type="button" class="btn-ghost" data-syn-act="copy">Copy summary</button>' : ''}
      <button type="button" class="btn-ghost" data-syn-act="link">Copy link</button>
      <button type="button" class="btn-ghost" data-syn-act="print">Print</button>
    </div>`;
  }
  const printKicker = (kind) => `<p class="print-only print-kicker">Cancer Predisposition Differential – ${kind} summary · information checked ${esc(DATA_CHECKED)}</p>`;

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
      ${notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
      <dl class="syn-facts">
        <dt>Genes</dt><dd>${c.genes.map(g => forPrint ? esc(g) : `<a href="#gene=${g}">${esc(g)}</a>`).join(', ')}</dd>
        <dt>Inheritance</dt><dd>${esc(c.inh)}</dd>
        ${flags.length ? `<dt>NICPR notes</dt><dd>${flags.map(([g, f]) => `${esc(g)}: ${esc(f.join('; '))}`).join('<br>')}</dd>` : ''}
      </dl>
      <h3>Cancers and histology</h3>
      ${cancersTable(c)}
      <p class="muted small">Strength: hallmark 10, strong 6, moderate 3, weak 1 points. Early onset: ×1.5 at or below the age shown, ×2 if 15+ years below. Age limit: association only applies at or below this age.</p>
      ${mods.length ? `<p class="small"><strong>Score modifiers:</strong> ${esc(mods.join('; '))}</p>` : ''}
      <h3>Test Directory tests</h3>
      ${testsDetail(c.tests)}
      <h3>Guidance, leaflets and references</h3>
      ${sourcesHtml(c)}
      ${datesHtml()}`;
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
      <dl class="syn-facts">
        <dt>OMIM gene</dt><dd>${geneMimLink(g)}</dd>
        <dt>NICPR</dt><dd>${esc(flags.join('; ') || 'On the NICPR list (June 2026)')}</dd>
      </dl>
      <h3>Syndromes caused by ${esc(g)}</h3>
      <div class="table-wrap"><table class="syn-table">
        <thead><tr><th>Syndrome</th><th>Inheritance</th><th>Main cancers and features (hallmark / strong)</th></tr></thead>
        <tbody>${cs.map(c => `<tr><td>${forPrint ? esc(c.name) : `<a href="#syndrome=${c.id}">${esc(c.name)}</a>`}</td><td>${esc(c.inh)}</td><td>${esc(mainCancers(c))}</td></tr>`).join('')}</tbody>
      </table></div>
      ${cs.filter(c => c.note).map(c => `<p class="note">${esc(c.name)}: ${esc(c.note)}</p>`).join('')}
      <h3>Test Directory tests</h3>
      ${testsDetail(uniq(cs.flatMap(c => c.tests)))}
      <h3>Guidance and leaflets</h3>
      <div class="sources">${guidanceHtml(src)}
        <h4>References</h4>
        <ul>${cs.map(c => { const ph = phenoLinks(c); return `<li><strong>${esc(c.name)}</strong> – GeneReviews: ${grLinks(c)}${ph ? `; OMIM: ${ph}` : ''}</li>`; }).join('')}
          <li>OMIM gene: ${geneMimLink(g)}</li></ul>
      </div>
      ${datesHtml()}`;
  }

  function currentKey() {
    return $('#browse-mode').value === 'gene' ? (state.gene && `gene:${state.gene}`) : (state.syn && `syn:${state.syn}`);
  }

  function renderSynDetail() {
    const key = currentKey();
    const out = $('#syn-detail');
    if (!key) { out.innerHTML = '<div class="empty">Choose an item from the list.</div>'; return; }
    const [t, id] = key.split(':');
    out.innerHTML = t === 'syn' ? synPage(COND[id], false) : genePage(id, false);
  }

  function synSummary(c) {
    const src = SOURCES[c.id] || {};
    const ref = REFS[c.id];
    const L = [c.name.toUpperCase(), `Genes: ${c.genes.join(', ')} · Inheritance: ${c.inh}`];
    if (c.note) L.push(c.note);
    L.push('', 'CANCERS AND HISTOLOGY');
    [...c.rules].sort((x, y) => TIER_ORDER[x[2]] - TIER_ORDER[y[2]]).forEach(r => { const t = ruleText(r); L.push(`- [${TIER_LABEL[t.tier]}] ${t.text}`); });
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
    L.push('', `Information checked: ${DATA_CHECKED}`, `Source: Cancer Predisposition Differential – ${itemUrl(`syn:${c.id}`)}`);
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
      `Cancer Predisposition Differential · ${esc(SITE_URL)} · information checked ${esc(DATA_CHECKED)} · printed ${esc(today)}</div>`;
    // A table footer repeats at the bottom of every printed page in all major browsers.
    const framed = html => `<section class="print-page"><table class="print-frame"><tfoot><tr><td>${foot}</td></tr></tfoot>` +
      `<tbody><tr><td>${html}</td></tr></tbody></table></section>`;
    const pages = keys.map(k => { const [t, id] = k.split(':'); return framed(t === 'syn' ? synPage(COND[id], true) : genePage(id, true)); });
    const contents = keys.length > 1 ? framed(`<div class="print-contents${keys.length > 12 ? ' long' : ''}">
        <h1>Cancer Predisposition Differential</h1><h2>${esc(title)}</h2>
        <p>Information checked ${esc(DATA_CHECKED)} · printed ${esc(today)} · ${keys.length} items</p>
        <ol>${keys.map(k => `<li>${esc(itemName(k))}</li>`).join('')}</ol></div>`) : '';
    $('#print-area').innerHTML = contents + pages.join('');
    document.body.classList.add('printing');
    window.print();
  }

  function onSynAction(e) {
    const btn = e.target.closest('[data-syn-act]');
    if (!btn) return;
    const key = currentKey();
    if (btn.dataset.synAct === 'copy') copyText(btn, synSummary(COND[key.split(':')[1]]), 'Copy summary');
    if (btn.dataset.synAct === 'link') copyText(btn, itemUrl(key), 'Copy link');
    if (btn.dataset.synAct === 'print') printItems([key], itemName(key));
  }

  function onListAction(e) {
    const sel = e.target.closest('[data-sel]');
    if (sel) { if (sel.checked) state.sel.add(sel.dataset.sel); else state.sel.delete(sel.dataset.sel); renderSynList(); return; }
    const btn = e.target.closest('[data-print]');
    if (!btn) return;
    const mode = $('#browse-mode').value;
    if (btn.dataset.print === 'clear') { state.sel.clear(); renderSynList(); return; }
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
      <ul class="assoc">${rules.map(r => { const t = ruleText(r); return `<li><span class="tier tier-${t.tier}">${TIER_LABEL[t.tier]}</span> ${esc(t.text)}</li>`; }).join('')}</ul>
    </article>`).join('') || '<div class="empty">No associations recorded.</div>';
  }

  /*
   * The address holds the open tab: no hash = Family assessment, #syndromes = Syndromes tab,
   * #syndrome=<id> = a syndrome page, #gene=<symbol> = a gene page (shareable). Refresh, Back
   * and Forward follow it.
   */
  function route() {
    const m = location.hash.match(/^#(syndrome|gene)=(\w+)$/);
    const ok = m && (m[1] === 'syndrome' ? COND[m[2]] : GENES.includes(m[2]));
    if (ok) {
      const isSyn = m[1] === 'syndrome';
      if (isSyn) state.syn = m[2]; else state.gene = m[2];
      $('#browse-mode').value = isSyn ? 'syndrome' : 'gene';
      if (!(isSyn ? synMatches(COND[m[2]]) : geneMatches(m[2]))) { $('#browse-search').value = ''; $('#browse-test').value = ''; $('#browse-ukcgg').checked = false; }
      setTab('browse');
      if ($('#syn-detail').getBoundingClientRect().top < 0) $('#syn-detail').scrollIntoView();
    } else {
      setTab(location.hash === '#syndromes' ? 'browse' : 'assess');
    }
  }

  function goTab(tab) {
    if (tab === 'browse') {
      const key = currentKey();
      if (!/^#(syndrome|gene)=/.test(location.hash)) location.hash = key ? `${key.startsWith('gene') ? 'gene' : 'syndrome'}=${key.split(':')[1]}` : 'syndromes';
      else route();
    } else if (location.hash) {
      history.pushState(null, '', location.pathname + location.search);
      route();
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- Example & setup ---------------- */

  function loadExample() {
    const mk = (rel, sex, dxs) => ({ id: nextId(), rel, sex, dx: dxs.map(d => ({ ...newDx(), ...d })) });
    state.people = [
      mk('proband', 'F', [{ site: 'breast', hist: 'idc', age: '38', er: 'neg', pr: 'neg', her2: 'neg' }]),
      mk('mother', 'F', [{ site: 'ovary', hist: 'hgsc', age: '52' }]),
      mk('m_aunt', 'F', [{ site: 'breast', hist: 'idc', age: '46' }]),
      mk('father', 'M', [{ site: 'colorectal', hist: 'adeno', age: '68', mmr: 'intact' }])
    ];
    renderFamily();
    renderResults();
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#tab-assess').hidden = tab !== 'assess';
    $('#tab-browse').hidden = tab !== 'browse';
    if (tab === 'browse') renderBrowse();
  }

  function init() {
    $('#family').addEventListener('change', onFamilyInput);
    $('#family').addEventListener('input', e => { if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') onFamilyInput(e); });
    $('#family').addEventListener('click', onFamilyClick);
    $('#add-person').addEventListener('click', () => { state.people.push(newPerson('mother')); renderFamily(); renderResults(); });
    $('#example').addEventListener('click', loadExample);
    $('#clear').addEventListener('click', () => { state.people = [newPerson('proband')]; renderFamily(); renderResults(); });
    $('#copy').addEventListener('click', e => copySummary(e.target));
    $('#print').addEventListener('click', () => window.print());
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
    renderFamily();
    renderResults();
    route();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
