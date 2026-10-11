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

  function sourcesHtml(c) {
    const src = SOURCES[c.id] || {};
    const ref = REFS[c.id] || { gr: [], omim: [] };
    const leaflet = k => `<li>${link(EG[k].label, EG[k].url)}</li>`;
    const leaflets = (src.eg || []).map(leaflet);
    const guides = (src.guide || []).map(k => `<li>${link(GUIDES[k][0], GUIDES[k][1])}</li>`);
    const eu = (src.eu || []).map(k => `<li>${link(EU_GUIDES[k][0], EU_GUIDES[k][1])}</li>`);
    const us = (src.us || []).map(k => `<li>${link(US_GUIDES[k][0], US_GUIDES[k][1])}</li>`);
    const gr = ref.gr.length
      ? ref.gr.map(n => `<li>GeneReviews: ${link(GR_TITLES[n], REF_LINKS.geneReviews(n))}</li>`).join('')
      : `<li class="muted">No GeneReviews chapter – ${link('search GeneReviews', REF_LINKS.geneReviewsSearch(c.genes[0]))}</li>`;
    const pheno = ref.omim.map(m => link(`#${m} ${OMIM_TITLES[m]}`, REF_LINKS.omim(m)));
    const genes = c.genes.map(g => link(`${g} *${GENE_MIM[g]}`, REF_LINKS.omim(GENE_MIM[g])));
    return `<div class="sources">
      <h4>East Genomics patient information</h4>
      <ul>${leaflets.join('') || `<li class="muted">No condition-specific leaflet – general leaflets below, or see the ${link('A-Z index', EG_AZ)}</li>${EG_GENERAL.map(leaflet).join('')}`}</ul>
      <h4>UK guidance</h4>
      <ul>${guides.join('') || `<li class="muted">No UKCGG gene-specific guideline – see ${link('UKCGG leaflets and guidelines', REF_LINKS.ukcgg)}</li>`}</ul>
      ${eu.length ? `<h4>European guidance</h4><ul>${eu.join('')}</ul>` : ''}
      ${us.length ? `<h4>US and international guidance</h4><ul>${us.join('')}</ul>` : ''}
      <h4>References</h4>
      <ul>${gr}
        ${pheno.length ? `<li>OMIM phenotype: ${pheno.join('; ')}</li>` : ''}
        <li>OMIM gene: ${genes.join(', ')}</li></ul>
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

  function synMatches(c) {
    const q = $('#browse-search').value.trim().toLowerCase();
    const test = $('#browse-test').value;
    if (test && !c.tests.includes(test)) return false;
    if ($('#browse-ukcgg').checked && !(SOURCES[c.id] && SOURCES[c.id].guide)) return false;
    return !q || c.name.toLowerCase().includes(q) || c.genes.some(g => g.toLowerCase().includes(q)) ||
      c.rules.some(r => ruleText(r).text.toLowerCase().includes(q));
  }

  function renderSynList() {
    const groups = CATEGORIES.map(([label, ids]) => [label, ids.map(id => COND[id]).filter(synMatches)]).filter(([, l]) => l.length);
    const visible = groups.flatMap(([, l]) => l.map(c => c.id));
    if (!visible.includes(state.syn)) state.syn = visible[0] || null;
    $('#syn-list').innerHTML = groups.map(([label, list]) => `<h4>${esc(label)}</h4><ul>${list.map(c =>
      `<li><a href="#syndrome=${c.id}" data-syn="${c.id}"${c.id === state.syn ? ' aria-current="true"' : ''}>${esc(c.name)}</a></li>`).join('')}</ul>`).join('')
      || '<div class="empty">No matches.</div>';
    $('#syn-list').insertAdjacentHTML('afterbegin', `<p class="muted small">${visible.length} of ${CONDITIONS.length} syndromes</p>`);
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

  function testsDetail(c) {
    return c.tests.map(k => {
      const t = TESTS[k];
      return `<div class="test">
        <h4><span class="code">${esc(t.code)}</span> ${esc(t.name)}${t.part ? ` <span class="muted small">Part ${esc(t.part)}</span>` : ''}</h4>
        <p class="muted">Genes: ${esc(t.genes)}${t.panel ? ` · ${link('PanelApp ' + t.panel, PANELAPP(t.panel))}` : ''}</p>
        <ul>${t.criteria.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    }).join('');
  }

  function renderSynDetail() {
    const c = COND[state.syn];
    const out = $('#syn-detail');
    if (!c) { out.innerHTML = '<div class="empty">Choose a syndrome.</div>'; return; }
    const flags = c.genes.map(g => [g, geneFlags(g)]).filter(([, f]) => f.length);
    const mods = (c.mods || []).map(([site, pred, f]) => `${site === '*' ? 'Any site' : SITES[site].label}: ${PRED_LABEL[pred]} ×${f}`);
    const notes = [c.note, c.notOnNicpr && 'Not on the NICPR gene list (June 2026) but included in Test Directory panels.'].filter(Boolean);
    out.innerHTML = `
      <div class="syn-head">
        <div><h2>${esc(c.name)}</h2>
          <div class="genes">${geneChips(c.genes)} <span class="inh">${esc(c.inh)}</span></div></div>
        <div class="actions">
          <button type="button" class="btn-ghost" data-syn-act="copy">Copy summary</button>
          <button type="button" class="btn-ghost" data-syn-act="link">Copy link</button>
          <button type="button" class="btn-ghost" data-syn-act="print">Print</button>
        </div>
      </div>
      ${notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
      <dl class="syn-facts">
        <dt>Genes</dt><dd>${c.genes.map(esc).join(', ')}</dd>
        <dt>Inheritance</dt><dd>${esc(c.inh)}</dd>
        ${flags.length ? `<dt>NICPR notes</dt><dd>${flags.map(([g, f]) => `${esc(g)}: ${esc(f.join('; '))}`).join('<br>')}</dd>` : ''}
      </dl>
      <h3>Cancers and histology</h3>
      ${cancersTable(c)}
      <p class="muted small">Strength: hallmark 10, strong 6, moderate 3, weak 1 points. Early onset: ×1.5 at or below the age shown, ×2 if 15+ years below. Age limit: association only applies at or below this age.</p>
      ${mods.length ? `<p class="small"><strong>Score modifiers:</strong> ${esc(mods.join('; '))}</p>` : ''}
      <h3>Test Directory tests</h3>
      ${testsDetail(c)}
      <h3>Guidance, leaflets and references</h3>
      ${sourcesHtml(c)}`;
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
    ref.omim.forEach(m => L.push(`- OMIM #${m} ${OMIM_TITLES[m]} ${REF_LINKS.omim(m)}`));
    c.genes.forEach(g => L.push(`- OMIM ${g} *${GENE_MIM[g]} ${REF_LINKS.omim(GENE_MIM[g])}`));
    const sec = (title, keys, table) => { if (keys && keys.length) { L.push('', title); keys.forEach(k => L.push(`- ${table[k][0]} ${table[k][1]}`)); } };
    sec('UK GUIDANCE', src.guide, GUIDES);
    sec('EUROPEAN GUIDANCE', src.eu, EU_GUIDES);
    sec('US AND INTERNATIONAL GUIDANCE', src.us, US_GUIDES);
    if (src.eg) { L.push('', 'EAST GENOMICS LEAFLETS'); src.eg.forEach(k => L.push(`- ${EG[k].label} ${EG[k].url}`)); }
    L.push('', `Source: Cancer Predisposition Differential – ${location.href.split('#')[0]}#syndrome=${c.id}`);
    return L.join('\n');
  }

  async function copyText(btn, text, label) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
    catch (_) { window.prompt('Copy:', text); }
    setTimeout(() => { btn.textContent = label; }, 1500);
  }

  function onSynAction(e) {
    const btn = e.target.closest('[data-syn-act]');
    if (!btn) return;
    const c = COND[state.syn];
    const url = `${location.href.split('#')[0]}#syndrome=${c.id}`;
    if (btn.dataset.synAct === 'copy') copyText(btn, synSummary(c), 'Copy summary');
    if (btn.dataset.synAct === 'link') copyText(btn, url, 'Copy link');
    if (btn.dataset.synAct === 'print') {
      document.body.classList.add('print-syndrome');
      window.print();
      document.body.classList.remove('print-syndrome');
    }
  }

  function renderBrowse() {
    const mode = $('#browse-mode').value;
    const out = $('#browse-results');
    $('#browse-cancer').hidden = mode !== 'cancer';
    $('#browse-filters').hidden = mode !== 'syndrome';
    $('#syn-layout').hidden = mode !== 'syndrome';
    out.hidden = mode !== 'cancer';
    if (mode === 'syndrome') { renderSynList(); return; }
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
    out.innerHTML = rows.map(({ c, rules }) => `<article class="result compact">
      <h3><a href="#syndrome=${c.id}">${esc(c.name)}</a></h3>
      <div class="genes">${geneChips(c.genes)}</div>
      <ul class="assoc">${rules.map(r => { const t = ruleText(r); return `<li><span class="tier tier-${t.tier}">${TIER_LABEL[t.tier]}</span> ${esc(t.text)}</li>`; }).join('')}</ul>
    </article>`).join('') || '<div class="empty">No associations recorded.</div>';
  }

  /*
   * The address holds the open tab: no hash = Family assessment, #syndromes = Syndromes tab,
   * #syndrome=<id> = a syndrome page (shareable). Refresh, Back and Forward follow it.
   */
  function route() {
    const m = location.hash.match(/^#syndrome=(\w+)$/);
    if (m && COND[m[1]]) {
      state.syn = m[1];
      $('#browse-mode').value = 'syndrome';
      if (!synMatches(COND[m[1]])) { $('#browse-search').value = ''; $('#browse-test').value = ''; $('#browse-ukcgg').checked = false; }
      setTab('browse');
      if ($('#syn-detail').getBoundingClientRect().top < 0) $('#syn-detail').scrollIntoView();
    } else {
      setTab(location.hash === '#syndromes' ? 'browse' : 'assess');
    }
  }

  function goTab(tab) {
    if (tab === 'browse') {
      if (!location.hash.startsWith('#syndrome')) location.hash = state.syn ? `syndrome=${state.syn}` : 'syndromes';
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
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    // A link to the syndrome already in the URL fires no hashchange, so open it directly.
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#syndrome="]');
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
