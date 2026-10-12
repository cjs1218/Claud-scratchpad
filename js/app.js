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
  const newPerson = (rel) => ({ id: nextId(), rel, sex: REL[rel].sex, ageNow: '', deceased: false, ageDeath: '', dx: [newDx()] });

  const state = { people: [newPerson('proband')], mode: 'balanced', tab: 'assess', treeOpen: true, treeSyn: null, ancestry: '', expanded: new Set(), compareView: null };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Escape text and mark known abbreviations (the meaning shows in a tooltip on hover or tap).
  const ABBR_RE = new RegExp(`(^|[^A-Za-z0-9])(${Object.keys(ABBREVIATIONS).sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z0-9])`, 'g');
  const abbrHtml = s => esc(s).replace(ABBR_RE, (m, pre, k) =>
    `${pre}<abbr class="abbr" title="${esc(ABBREVIATIONS[k])}" data-full="${esc(ABBREVIATIONS[k])}">${k}</abbr>`);
  const abbrList = texts => [...new Set(texts.flatMap(t => [...String(t).matchAll(ABBR_RE)].map(m => m[2])))];
  // Mark abbreviations in every text node under `root` (skipping form controls, code and existing marks);
  // SVG labels (the family tree) get one tooltip listing each abbreviation they contain.
  const ABBR_SKIP = 'script,style,textarea,select,option,input,abbr,code,pre,svg,.no-abbr';
  function markAbbr(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n; (n = walker.nextNode());) {
      if (!/[A-Z]{2}/.test(n.nodeValue) || !n.parentElement || n.parentElement.closest(ABBR_SKIP)) continue;
      ABBR_RE.lastIndex = 0;
      if (ABBR_RE.test(n.nodeValue)) hits.push(n);
    }
    for (const n of hits) { const t = document.createElement('template'); t.innerHTML = abbrHtml(n.nodeValue); n.replaceWith(t.content); }
    root.querySelectorAll('svg text').forEach(t => {
      const ks = abbrList([t.textContent]);
      if (ks.length) t.dataset.tip = ks.map(k => `${k} = ${ABBREVIATIONS[k]}`).join('\n'); else delete t.dataset.tip;
    });
  }
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

  const has = v => v !== '' && v != null;
  const personStatus = p => p.deceased ? `deceased${has(p.ageDeath) ? ` at ${p.ageDeath}` : ''}` : (has(p.ageNow) ? `age ${p.ageNow}` : '');

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
      <div class="person-elig" data-elig-for="${p.id}"></div>
      <div class="person-extra">
        ${p.deceased
          ? `<label class="mk">Age at death<input type="number" min="0" max="120" inputmode="numeric" data-f="ageDeath" value="${esc(p.ageDeath ?? '')}" placeholder="Age"></label>`
          : `<label class="mk">Age now<input type="number" min="0" max="120" inputmode="numeric" data-f="ageNow" value="${esc(p.ageNow ?? '')}" placeholder="Age"></label>`}
        <label class="mk chk"><input type="checkbox" data-f="deceased"${p.deceased ? ' checked' : ''}>Deceased</label>
      </div>
      ${p.dx.map(d => renderDx(p, d)).join('')}
      <button type="button" class="link-btn" data-act="add-dx">+ Add cancer or finding</button>
    </section>`;
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
      if (f === 'hist') {
        const box = el.closest('.dx'), old = box.querySelector('.abbr-hint');
        if (old) old.remove();
        box.querySelector('.dx-main').insertAdjacentHTML('afterend', abbrHint(dx));
      }
    } else {
      p[f] = val;
      if (f === 'rel' && REL[val].sex) { p.sex = REL[val].sex; renderFamily(); }
      if (f === 'deceased') renderFamily();
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
    if (!data || !Array.isArray(data.people)) throw new Error('not a family file');
    const people = data.people.filter(p => REL[p.rel]).map(p => ({
      ...newPerson(p.rel), sex: ['F', 'M'].includes(p.sex) ? p.sex : '',
      ageNow: p.ageNow ?? '', deceased: !!p.deceased, ageDeath: p.ageDeath ?? '',
      dx: (p.dx || []).map(d => {
        const site = SITES[d.site] ? d.site : '';
        const hist = site && SITES[site].hist.some(h => h[0] === d.hist) ? d.hist : '';
        return { ...newDx(), ...Object.fromEntries(Object.entries(d).filter(([k]) => k in newDx() && k !== 'id')), site, hist };
      })
    }));
    if (!people.some(p => p.rel === 'proband')) people.unshift(newPerson('proband'));
    people.forEach(p => { if (!p.dx.length) p.dx.push(newDx()); });
    state.people = people;
    state.ancestry = ['ashkenazi', 'other_founder'].includes(data.ancestry) ? data.ancestry : '';
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
    const bits = [`<span class="tier tier-${s.tier}">${TIER_LABEL[s.tier]}</span>`];
    const notes = [...s.notes, ...s.modNotes];
    return `<li>${bits.join('')} <strong>${esc(personLabel(person))}</strong> — ${abbrHtml(dxText(dx, person))}${notes.length ? ` <span class="muted">· ${esc(notes.join('; '))}</span>` : ''}</li>`;
  }

  function associationsHtml(cond) {
    const order = { H: 0, S: 1, M: 2, W: 3 };
    return cond.rules.map(ruleText).sort((a, b) => order[a.tier] - order[b.tier])
      .map(r => `<li><span class="tier tier-${r.tier}">${TIER_LABEL[r.tier]}</span> ${abbrHtml(r.text)}</li>`).join('');
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
    return `${tiers.join(' + ')} match${r.evidence.length > 1 ? 'es' : ''} in ${people} ${people > 1 ? 'people' : 'person'}, ${sideTxt}${early ? `; early onset in ${early}` : ''}.`;
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
      <p class="tests-line small">Tests: ${c.tests.map(k => `<span class="code-sm" title="${esc(TESTS[k].name)}">${esc(TESTS[k].code)}</span>`).join(' ') || 'none listed'}</p>
      <details><summary>All associations</summary><ul class="assoc">${associationsHtml(c)}</ul></details>
      <details><summary>Leaflets &amp; sources</summary>${sourcesHtml(c)}</details>
      <a class="small syn-open" href="#syndrome=${c.id}">Open syndrome page →</a>
      ${i >= 3 ? `<button type="button" class="link-btn small" data-collapse="${c.id}">Show less ▴</button>` : ''}
    </article>`;
  }
  const TIER_LEGEND = `<p class="tier-legend small">Strength: ${['H', 'S', 'M', 'W'].map(t => `<span class="tier tier-${t}">${TIER_LABEL[t]}</span>`).join(' ')}</p>`;

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
    m_other: 'Other (maternal)', p_other: 'Other (paternal)', other: 'Other relative'
  };
  const PED = { SW: 124, S: 24, LINE: 13, TOP: 26, PAD: 16 };
  const shortText = (s, n) => { s = s.split(/ \/ | \(|;/)[0].trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function buildPedigree(people) {
    const by = rel => people.filter(p => p.rel === rel);
    const node = (p, extra = {}) => ({ p, implied: !p, sex: p ? p.sex : '', label: p ? PED_SHORT[p.rel] : '', kids: [], partner: null, dashed: false, ...extra });
    const implied = (label, sex = '') => node(null, { label, sex });
    const withKids = (n, kids) => { n.kids = kids; if (kids.length) n.partner = implied('Partner', n.sex === 'F' ? 'M' : n.sex === 'M' ? 'F' : ''); return n; };
    const proband = people.find(p => p.rel === 'proband');
    const anyOf = rels => rels.some(r => by(r).length);

    // Proband's descendants: grandchildren hang from the first child (implied if none).
    const children = [...by('daughter'), ...by('son')].map(p => node(p));
    if (by('grandchild').length && !children.length) children.push(implied('Child'));
    if (children.length) withKids(children[0], by('grandchild').map(p => node(p)));
    const probandNode = withKids(node(proband), children);
    probandNode.proband = true;

    const needParents = people.some(p => !['proband', 'son', 'daughter', 'grandchild'].includes(p.rel));
    if (!needParents) return { core: probandNode };

    // Siblings; nieces / nephews hang from the first sibling (implied if none). Half-siblings get dashed links.
    const sibs = [...by('sister'), ...by('brother')].map(p => node(p));
    if (by('niece').length && !sibs.length) sibs.push(implied('Sibling'));
    if (sibs.length) withKids(sibs[0], by('niece').map(p => node(p)));
    const coreKids = [...by('m_halfsib').map(p => node(p, { dashed: true })), ...sibs, probandNode, ...by('p_halfsib').map(p => node(p, { dashed: true }))];
    const mother = by('mother')[0], father = by('father')[0];
    const momNode = mother ? node(mother) : implied('Mother', 'F');
    const dadNode = father ? node(father) : implied('Father', 'M');
    momNode.kids = coreKids; momNode.partner = dadNode;
    // Extra people entered as a second mother/father are shown with the "other" relatives.
    const extra = [...by('mother').slice(1), ...by('father').slice(1)];

    const side = (s) => {
      const aunts = [...by(s + '_aunt'), ...by(s + '_uncle')].map(p => node(p));
      if (by(s + '_cousin').length && !aunts.length) aunts.push(implied(s === 'm' ? 'Mat. aunt/uncle' : 'Pat. aunt/uncle'));
      if (aunts.length) withKids(aunts[0], by(s + '_cousin').map(p => node(p)));
      const need = anyOf([s + '_aunt', s + '_uncle', s + '_cousin', s + '_great', s + '_gm', s + '_gf']);
      const gm = by(s + '_gm')[0], gf = by(s + '_gf')[0];
      const pre = s === 'm' ? 'Mat.' : 'Pat.';
      return {
        aunts, need,
        gf: gf ? node(gf) : implied(`${pre} grandfather`, 'M'),
        gm: gm ? node(gm) : implied(`${pre} grandmother`, 'F'),
        great: by(s + '_great').map(p => node(p, { dashed: true })),
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
      }
      t.otherExtra = [...t.extra, ...t.mat.extraGp, ...t.pat.extraGp];
    }
    // Relatives without a fixed position go on a separate row.
    const others = [...people.filter(p => ['m_other', 'p_other', 'other'].includes(p.rel)), ...(t.otherExtra || [])];
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
      if (e.meets.length) n.lines.push({ t: `Meets ${e.meets.join(', ')}`, cls: 'ped-l ped-elig' });
      if (e.maybe.length) n.lines.push({ t: `May meet ${e.maybe.join(', ')}`, cls: 'ped-l ped-maybe' });
      const dxs = n.p.dx.filter(d => d.site && d.hist);
      n.affected = dxs.length > 0;
      n.hit = dxs.some(d => hitDx.has(d.id));
      dxs.slice(0, 3).forEach(d => {
        const cls = hitDx.has(d.id) ? ' ped-hit' : '';
        n.lines.push({ t: shortText(SITES[d.site].label, 16) + (d.age !== '' ? ' ' + d.age : ''), cls: 'ped-l ped-dx' + cls });
        const h = histLabel(d.site, d.hist);
        if (!/^(any|other)/i.test(h)) n.lines.push({ t: shortText(h, 20), cls: 'ped-l ped-hist' + cls });
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
    for (const s of nodes.sibships || []) sibBar(s.from, s.g, s.kids);
    for (const grp of nodes.dashedBars || []) {
      const barY = TOP - 14, xs = grp.map(n => X(n.x));
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
      const text = n.lines.map((l, i) => `<text class="${l.cls}" x="${x}" y="${top + S + 16 + i * LINE}" text-anchor="middle">${esc(l.t)}</text>`).join('');
      const arrow = n.proband ? pedArrow(x - S / 2 - 24, top - 8, x - S / 2 - 1, top + 9) : '';
      const ring = n.elig && n.elig.length ? `<rect class="ped-elig-ring" x="${x - S / 2 - 5}" y="${top - 5}" width="${S + 10}" height="${S + 10}" rx="${n.sex === 'F' ? S / 2 + 5 : 4}"/>` : '';
      const slash = n.p && n.p.deceased ? `<line class="ped-dead" x1="${x - S / 2 - 5}" y1="${top + S + 5}" x2="${x + S / 2 + 5}" y2="${top - 5}"/>` : '';
      parts.push(`<g class="ped-person${n.p ? '' : ' implied'}"${n.p ? ` data-person="${n.p.id}"` : ''}>${n.title ? `<title>${esc(n.title)}</title>` : ''}${ring}${shape}${slash}${arrow}${text}</g>`);
    }
    return `<svg class="ped-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Family tree${result ? ', highlighting ' + esc(result.cond.name) : ''}">${parts.join('')}</svg>`;
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
      `Cancer Predisposition Differential · ${new Date().toLocaleDateString('en-GB')} · clinical decision support only`].filter(Boolean);
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
    const k = Math.min(1, Math.max(0.75, wrap.clientWidth / w));
    svg.style.width = `${w * k}px`; svg.style.height = `${h * k}px`;
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
        <span class="ped-dl"><button type="button" class="btn-ghost" data-ped-dl="png">Download PNG</button>
          <button type="button" class="btn-ghost" data-ped-dl="svg">SVG</button></span>
      </div>
      <div class="ped-wrap" id="ped-wrap">${pedigreeSvg(people, sel)}</div>
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

  function renderResults() {
    const all = scoreFamily();
    const { shown, hidden, top } = filterByMode(all);
    lastShown = shown;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    const out = $('#results');
    document.body.classList.toggle('compact-head', familyDxs().length > 0);
    $('#compare-top').hidden = shown.length < 2;
    remember();
    if (!all.length) {
      out.innerHTML = `<div class="empty">Enter cancers or findings in the family to see a ranked differential.</div>`;
      updateToResults();
      return;
    }
    out.innerHTML = `
      ${familyTableHtml()}
      ${eligibilityHtml()}
      ${pedigreeHtml(shown)}
      <p class="muted small">${shown.length} shown${hidden ? ` · ${hidden} more in a wider search` : ''}. Scores are relative and are not probabilities. Click a result's title to highlight it in the family tree.</p>
      ${TIER_LEGEND}
      ${shown.map((r, i) => resultCard(r, i, top)).join('')}
      ${hidden && state.mode !== 'wide' ? `<button type="button" class="link-btn" data-mode="wide">Show all ${all.length} →</button>` : ''}
      ${pointersHtml(pointersFor(familyDxs()), 'Testing pointers for the cancers entered')}
      ${renderTests(shown)}`;
    fitPedigree();
    updateToResults();
    updateFormTags();
  }
  function updateFormTags() {
    const m = eligByPerson();
    document.querySelectorAll('[data-elig-for]').forEach(el => {
      const e = m.get(+el.dataset.eligFor) || { meets: [], maybe: [] };
      const chip = (c, cls, extra) => `<span class="code-sm ${cls}" title="${esc(TESTS[c.replace('*', '')].name)}${c.endsWith('*') ? ' – tumour testing first' : ''}${extra}">${c}</span>`;
      el.innerHTML = [e.meets.length ? `Meets criteria: ${e.meets.map(c => chip(c, 'elig-code', '')).join(' ')}` : '',
        e.maybe.length ? `<span class="maybe">May meet: ${e.maybe.map(c => chip(c, 'elig-code maybe-code', ' – check an unrecorded detail')).join(' ')}</span>` : ''].filter(Boolean).join(' · ');
    });
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

  function eligibilityHtml() {
    const list = eligibilityList(), maybe = eligibilityList(true);
    const ams = amsterdamHtml();
    const people = l => `<ul>${l.map(([p, os]) => `<li><strong>${esc(personLabel(p))}</strong>${p.deceased ? ' <span class="elig-tag dec">deceased</span>' : ''}
        <ul>${os.map(o => `<li><span class="code-sm" title="${esc(TESTS[o.test].name)}">${o.test}</span> ${esc(TESTS[o.test].name)}${eligTag(o) && !o.possible ? ` <span class="elig-tag">${esc(eligTag(o))}</span>` : ''}
          <div class="small muted">${o.text.map(t => abbrHtml(t)).join('; ')}</div></li>`).join('')}</ul></li>`).join('')}</ul>`;
    const maybeHtml = maybe.length ? `<div class="elig-maybe"><h4>May meet – check an unrecorded detail</h4>${people(maybe)}</div>` : '';
    if (!list.length) return `<section class="elig none"><h3>Test Directory criteria</h3>${ams}
      <p class="small">No one in the family as entered meets the inherited cancer test criteria checked here (${ELIG_TESTS.join(', ')}). Check the full criteria, CanRisk and the Manchester score.</p>${maybeHtml}</section>`;
    return `<section class="elig"><h3>Meets Test Directory criteria now</h3>${ams}
      ${people(list)}${maybeHtml}
      <p class="small muted">Checked against the inherited cancer tests (${ELIG_TESTS.join(', ')}) using what has been entered; criteria needing information not recorded here (e.g. tumour grade, CanRisk, Wimmer score) are not assessed. Deceased relatives need stored DNA, or tissue with Manchester ≥17 / CanRisk ≥15% for R208/R207. Always confirm against the ${link(TD_VERSION, TD_URL)}.</p></section>`;
  }

  // Print-only table of the family as entered.
  function familyTableHtml() {
    const rows = state.people.map(p => {
      const dxs = p.dx.filter(d => d.site && d.hist);
      return `<tr><td>${esc(personLabel(p))}</td><td>${p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : '–'}</td>
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
    const below = res.getBoundingClientRect().top > window.innerHeight - 40;
    btn.hidden = !(n && state.tab === 'assess' && window.innerWidth < 1000 && below);
    btn.textContent = `See results (${n}) ↓`;
  }

  /* ---------------- Summary ---------------- */

  function summaryText() {
    const lines = ['FAMILY HISTORY'];
    if (state.ancestry) lines.push(`Ancestry: ${$('#ancestry').selectedOptions[0].text}`);
    for (const p of state.people) {
      const dxs = p.dx.filter(d => d.site && d.hist);
      const status = personStatus(p);
      if (!dxs.length && !status) continue;
      lines.push(`- ${personLabel(p)}${status ? ` (${status})` : ''}: ${dxs.length ? dxs.map(d => dxText(d, p)).join('; ') : 'no cancer'}`);
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
      </div>` + (groups.map(([label, list]) => `<h4>${esc(label)}</h4><ul>${list.map(i =>
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
        <td data-label="Strength"><span class="tier tier-${tier}">${TIER_LABEL[tier]}</span></td>
        <td data-label="Early onset"${early == null ? ' class="na"' : ''}>${early != null ? '≤' + early : '–'}</td><td data-label="Age limit"${maxAge == null ? ' class="na"' : ''}>${maxAge != null ? '≤' + maxAge : '–'}</td>
        <td data-label="Condition"${pred ? '' : ' class="na"'}>${pred ? abbrHtml(PRED_LABEL[pred]) : '–'}</td>
        ${hasEv ? `<td class="ev" data-label="Risk and evidence"><div>${risk ? `<span class="ev-risk">${esc(risk)}</span>` : ''}<span class="ev-src">${evLinks(src)}</span>${usDiff ? `<span class="ev-diff"><strong>US differs:</strong> ${esc(usDiff)}</span>` : ''}</div></td>` : ''}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="syn-table cancers">
      <thead><tr><th>Site</th><th>Histology / type</th><th>Strength</th><th>Early onset</th><th>Age limit</th><th>Condition</th>${hasEv ? '<th>Risk and evidence</th>' : ''}</tr></thead>
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
        <h4><span class="code">${esc(t.code)}</span> ${esc(t.name)}${t.part ? ` <span class="muted small">Part ${esc(t.part)}</span>` : ''}</h4>
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
  function renderSources() {
    const ev = Object.entries(EVIDENCE).sort((a, b) => a[1][1].localeCompare(b[1][1]));
    $('#sources-page').innerHTML = `${sourcesTableHtml('h2')}
      <p class="muted small">Each syndrome also shows the date its own content was last reviewed.</p>
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
  const printKicker = (kind) => `<p class="print-only print-kicker">Cancer Predisposition Differential – ${kind} summary · information checked ${esc(DATA_CHECKED)}</p>`;

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
      <p class="muted small">Strength: hallmark 10, strong 6, moderate 3, weak 1 points. Early onset: ×1.5 at or below the age shown, ×2 if 15+ years below. Age limit: association only applies at or below this age.</p>
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
    const cell = r => r ? `<span class="tier tier-${r[2]}">${TIER_LABEL[r[2]]}</span>${r[3] != null ? ` <span class="muted small">early ≤${r[3]}</span>` : ''}${r[5] != null ? ` <span class="muted small">only ≤${r[5]}</span>` : ''}` : '<span class="muted">–</span>';
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
    const j = e.target.closest('[data-jump]');
    if (j) { const t = document.getElementById('jump-' + j.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth' }); return; }
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
      <ul class="assoc">${rules.map(r => { const t = ruleText(r); return `<li><span class="tier tier-${t.tier}">${TIER_LABEL[t.tier]}</span> ${abbrHtml(t.text)}</li>`; }).join('')}</ul>
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

  function loadExample() {
    const mk = (rel, sex, dxs) => ({ ...newPerson(rel), sex, dx: dxs.map(d => ({ ...newDx(), ...d })) });
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
    $('#tab-sources').hidden = tab !== 'sources';
    if (tab === 'browse') renderBrowse();
    if (tab === 'sources') renderSources();
    if (tab === 'assess') fitPedigree();
  }

  function init() {
    $('#family').addEventListener('change', onFamilyInput);
    $('#family').addEventListener('input', e => { if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') onFamilyInput(e); });
    $('#family').addEventListener('click', onFamilyClick);
    $('#add-person').addEventListener('click', () => { state.people.push(newPerson('mother')); renderFamily(); renderResults(); });
    $('#example').addEventListener('click', loadExample);
    $('#clear').addEventListener('click', () => {
      const before = JSON.stringify(state.people);
      state.people = [newPerson('proband')]; state.expanded.clear(); renderFamily(); renderResults();
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
    // Family tree: open/closed state, highlighted syndrome, downloads.
    $('#results').addEventListener('toggle', e => { if (e.target.id === 'ped') { state.treeOpen = e.target.open; fitPedigree(); } }, true);
    window.addEventListener('resize', fitPedigree);
    $('#results').addEventListener('change', e => { if (e.target.id === 'ped-syn') { state.treeSyn = e.target.value; renderResults(); } });
    $('#results').addEventListener('click', e => {
      const dl = e.target.closest('[data-ped-dl]');
      if (dl) { pedigreeExport(dl.dataset.pedDl); return; }
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
      const d = $('#ped'); if (d && pedWasOpen !== null) { d.open = pedWasOpen; state.treeOpen = pedWasOpen; pedWasOpen = null; }
    });
    // Abbreviations: marked everywhere as content renders; the meaning shows at once in a tooltip on hover or tap.
    const tip = document.createElement('div');
    tip.id = 'abbr-tip'; tip.className = 'no-abbr'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    document.body.append(tip);
    let tipFor = null;
    const TIP_SEL = 'abbr.abbr, svg text[data-tip]';
    const showTip = el => {
      if (el.title) { el.dataset.full = el.dataset.full || el.title; el.removeAttribute('title'); } // avoid the slow browser tooltip as well
      tip.textContent = el.dataset.full || el.dataset.tip;
      tip.hidden = false; tipFor = el;
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
      const top = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    };
    const hideTip = () => { tip.hidden = true; tipFor = null; };
    document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest(TIP_SEL); if (el) showTip(el); else if (tipFor) hideTip(); });
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
    renderFamily();
    renderResults();
    route();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
