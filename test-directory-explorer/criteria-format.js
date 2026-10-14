/* Clearer layout for the verbatim testing criteria. Formatting only: every character of the criteria text is kept, in
 * order (tests/explorer.test.js checks that the text of the formatted HTML equals the original for every line).
 * - the logic: OR / AND at the end of a criterion become connector badges; AND, OR, NOT… inside a sentence are emphasised
 * - ages and numeric thresholds stand out (e.g. <35 years, ≥2, under 60 years of age, score ≥15)
 * - lists run together in the PDF text (" o … o …", " - … - …") are shown as bullet lists; very long paragraphs break at sentences
 * - NOTE lines are shown as notes; PMIDs link to PubMed; R codes link to their indication (via the linkCode callback)
 * Corrections (corrections.js) are applied only when passed in: each corrected word is wrapped in <ins class="fix"> with
 * the PDF wording in data-pdf, and "\n" in a correction starts a new line. */
const TDX_FORMAT = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Comparators as they appear after escaping.
  const CMP = '(?:&lt;|&gt;|≤|≥|=)';
  const UNIT = '(?:years?|yrs?|weeks?|wks?|months?|days?|hours?|centiles?|percentiles?|%|mm|cm|kg|g\\/l|mmol\\/mol|mmol\\/l|ng\\/ml|SDS|SD)';
  const THRESHOLDS = new RegExp([
    `${CMP}\\s?=?\\s?\\d+(?:[.,]\\d+)?(?:st|nd|rd|th)?(?:\\s?-\\s?\\d+(?:[.,]\\d+)?)?(?:\\s?${UNIT}(?: of age| old)?)?`, // <35 years, ≥2, ≥ 15%, <3rd percentile
    // under 60 years of age, below age 50, under the age of 35, aged 16 (the unit is optional after a word like these)
    `\\b(?:(?:under|over|below|above|before|after|at least|less than|more than|greater than|up to)(?:\\s(?:the\\s)?age(?:\\sof)?)?|aged?)\\s\\d+(?:[.,]\\d+)?(?:\\s?(?:-|to)\\s?\\d+)?(?:\\s?${UNIT}(?: of age| old)?)?`,
    `\\b\\d+(?:[.,]\\d+)?(?:\\s?(?:-|to)\\s?\\d+(?:[.,]\\d+)?)?\\s?${UNIT}(?: of age| old| of gestation)?(?![A-Za-z])`, // 24 weeks, 3rd centile
    `\\b\\d+(?:st|nd|rd|th)\\s(?:centile|percentile)`,
  ].join('|'), 'g');
  const LOGIC = /(?<![A-Za-z0-9/-])(AND\/OR|AND|OR|NOT|WITH|WITHOUT|EITHER|BOTH|ONE|TWO|THREE|ANY|ALL OF)(?![A-Za-z0-9/-])/g;
  const PMID = /PMID:?\s?(\d{6,9})/g;
  // Corrections are carried through the formatting as private-use markers around the changed words (the marker holds the
  // correction's number as one private-use character, which no formatting rule matches), then become <ins>.
  const FIX_ON = '\uE000', FIX_OFF = '\uE001', fixId = k => String.fromCharCode(0xE100 + k);
  // Where a correction differs from the PDF: a list of [from, to] ranges in the PDF text and in the corrected text.
  // Punctuation-only corrections (same letters) are aligned character by character, so each added full stop, removed
  // space or apostrophe is its own change; a spelling correction is one change.
  const alnum = c => /[A-Za-z0-9]/.test(c);
  function changes(find, fix) {
    if (find.replace(/[^A-Za-z0-9]/g, '') !== fix.replace(/[^A-Za-z0-9]/g, '')) {
      let a = 0; while (a < find.length && a < fix.length && find[a] === fix[a]) a++;
      let b = 0; while (b < find.length - a && b < fix.length - a && find[find.length - 1 - b] === fix[fix.length - 1 - b]) b++;
      return [[a, find.length - b, a, fix.length - b]];
    }
    // A space and a new line count as the same (a break is shown, not marked); added or removed punctuation is a change.
    const ws = c => c === ' ' || c === '\n', punct = c => c !== undefined && !alnum(c) && !ws(c);
    const out = []; let i = 0, j = 0, open = null;
    const edit = (di, dj) => { if (!open) open = [i, i, j, j]; i += di; j += dj; open[1] = i; open[3] = j; };
    while (i < find.length || j < fix.length) {
      const f = find[i], x = fix[j];
      if (f !== undefined && x !== undefined && (f === x || (ws(f) && ws(x)))) { if (open) { out.push(open); open = null; } i++; j++; continue; }
      if (punct(x)) edit(0, 1);            // punctuation added
      else if (punct(f)) edit(1, 0);       // punctuation removed
      else if (f !== undefined && ws(f)) edit(1, 0);   // space removed
      else if (x !== undefined && ws(x)) edit(0, 1);   // space added
      else edit(f !== undefined ? 1 : 0, x !== undefined ? 1 : 0);
    }
    if (open) out.push(open);
    // Changes separated only by a space are one change (e.g. a comma moved across a space: "(STIC) , OR" → "(STIC), OR").
    const merged = [];
    for (const c of out) {
      const p = merged[merged.length - 1];
      if (p && /^\s*$/.test(fix.slice(p[3], c[2])) && /^\s*$/.test(find.slice(p[1], c[0])) && (c[2] - p[3] <= 1)) { p[1] = c[1]; p[3] = c[3]; }
      else merged.push(c);
    }
    // (A space that only became a new line is not a change at all: the alignment treats them as equal.)
    return merged;
  }
  function applyFixes(text, fixes) {
    const pdf = [];
    for (const [find, fix] of fixes || []) {
      const at = text.indexOf(find);
      if (at < 0) continue;
      // Mark each change together with the word it touches (e.g. "variants", "likely.", "Addison’s").
      const marks = changes(find, fix).map(([ia, ib, ja, jb]) => {
        const edge = c => c === undefined || /\s/.test(c);
        let ws = ja, wf = ia; while (!edge(fix[ws - 1]) && ws > 0) { ws--; wf--; }
        let we = jb, wfe = ib;
        if (ia === ib && /^ +$/.test(fix.slice(ja, jb))) { // a space added between two words: mark both ("R27Paediatric" → "R27 Paediatric")
          while (we < fix.length && !edge(fix[we])) we++;
          while (wfe < find.length && !edge(find[wfe])) wfe++;
          return [ws, we, find.slice(Math.max(0, wf), wfe)];
        }
        while (we > ws && edge(fix[we - 1]) && fix[we - 1] !== undefined) { we--; } // no trailing space in the mark
        if (we === jb) while (!edge(fix[we]) && we < fix.length && !edge(find[wfe])) { we++; wfe++; } // finish the word it is in
        while (wfe > wf && edge(find[wfe - 1])) wfe--;
        if (fix.slice(ws, we).trim() === '' ) { while (we < fix.length && !edge(fix[we])) we++; while (wfe < find.length && !edge(find[wfe])) wfe++; }
        return [ws, we, find.slice(Math.max(0, wf), wfe).trim()];
      });
      let out = '', last = 0;
      for (const [ws, we, was] of marks) {
        if (ws < last) continue;
        const on = FIX_ON + fixId(pdf.length);
        pdf.push(was);
        // A new line inside a mark closes it before the break (the break itself is shown, not marked).
        const piece = fix.slice(ws, we).split('\n').map((part, k) => part.trim() ? on + part + FIX_OFF : part).join('\n');
        out += fix.slice(last, ws) + piece; last = we;
      }
      text = text.slice(0, at) + out + fix.slice(last) + text.slice(at + find.length);
    }
    return { text, pdf };
  }
  const FIXED = new RegExp(`${FIX_ON}([\uE100-\uE1FF])([^${FIX_OFF}]*)${FIX_OFF}`, 'g');
  const finishFixes = (html, pdf) => html
    .replace(FIXED, (m, id, inner) => { const was = esc(pdf[id.charCodeAt(0) - 0xE100]);
      return `<ins class="fix" data-pdf="${was}" data-full="Corrected – the PDF has “${was}”" title="Corrected – the PDF has “${was}”">${inner}</ins>`; })
    .replace(/\n/g, '<br class="fix-br">\n');

  // Inline formatting of one piece of escaped text.
  function inline(html, linkCode) {
    // Thresholds first (they hold no letters that later steps match), then PMIDs, R codes and the logic words.
    html = html.replace(THRESHOLDS, m => `<span class="thr">${m}</span>`);
    html = html.replace(PMID, (m, id) => `<a class="ext" href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noopener">${m}</a>`);
    if (linkCode) html = html.replace(/\b(R\d{1,3})(\.\d+)?\b/g, (m, c) => linkCode(c, m));
    // Logic words, but not inside tags (attributes) or links.
    return html.replace(/(<a\b[^>]*>.*?<\/a>|<[^>]+>)|([^<]+)/g, (m, tag, text) => tag || text.replace(LOGIC, w => `<b class="logic">${w}</b>`));
  }
  // A line's own ending "OR" / "AND" (after the criterion) becomes a connector badge.
  const TRAIL = /^(.*?)(,?\s+)(OR|AND|AND\/OR)\s*$/s;

  function line(original, linkCode, fixes) {
    const { text, pdf } = applyFixes(original, fixes);
    let body = text, joiner = '', gap = '';
    const t = TRAIL.exec(text);
    if (t && t[1].trim()) { body = t[1]; gap = t[2]; joiner = t[3]; }
    // Lists run together in the extracted text: " o Item o Item" or " - Item - Item" (two or more items).
    // Items start with a capital, or with anything when the line itself starts with the list mark ("- facial angiofibromas - …").
    const listRe = /^\s*(?:o|-|–)\s/.test(body) ? /(^|\s)(o|-|–)\s+(?=[A-Za-z0-9(])/g : /(^|\s)(o|-|–)\s+(?=[A-Z0-9(])/g;
    const marks = [...body.matchAll(listRe)];
    const glyphs = new Set(marks.map(m => m[2]));
    let html;
    if (marks.length >= 2 && glyphs.size === 1) {
      const parts = []; let last = 0;
      for (const m of marks) { const at = m.index + m[1].length; parts.push(body.slice(last, at)); last = at; }
      parts.push(body.slice(last));
      const [lead, ...items] = parts;
      html = (lead.trim() ? `<span class="lead">${inline(esc(lead), linkCode)}</span>` : esc(lead)) +
        `<span class="split">${items.map(it => { const g = /^(\S+)(\s+)([\s\S]*)$/.exec(it);
          return `<span class="item"><span class="glyph" aria-hidden="true">${esc(g[1])}</span>${esc(g[2])}${inline(esc(g[3]), linkCode)}</span>`; }).join('')}</span>`;
    } else if (body.length > 400) {
      // A long paragraph: one sentence per block (the full stops stay where they are).
      const sentences = body.split(/(?<=[.;:]\uE001?)(\s+)(?=[A-Z(•])/);
      // The first sentence stays inline (next to its number or bullet); each later one starts a new block.
      html = sentences.map((s, i) => /^\s+$/.test(s) ? esc(s) : i ? `<span class="sent">${inline(esc(s), linkCode)}</span>` : inline(esc(s), linkCode)).join('');
    } else html = inline(esc(body), linkCode);
    if (joiner) html += `${esc(gap)}<span class="join join-${joiner === 'AND' ? 'and' : 'or'}">${esc(joiner)}</span>`;
    return finishFixes(html, pdf);
  }
  // Other verbatim text (overlapping indications, pathway): corrections and R code links only.
  function text(original, linkCode, fixes) {
    const { text: t, pdf } = applyFixes(original, fixes);
    let html = esc(t);
    if (linkCode) html = html.replace(/\b(R\d{1,3})(\.\d+)?\b/g, (m, c) => linkCode(c, m));
    return finishFixes(html, pdf);
  }
  // The text a line shows once corrected (what the page's text content equals).
  const corrected = (original, fixes) => applyFixes(original, fixes).text.replace(/[\uE000\uE001\uE100-\uE1FF]/g, '');
  const isNote = text => /^(NOTES?\b|Notes?:|Please note\b|N\.?B\.?:)/.test(text);
  return { line, text, corrected, isNote };
})();
