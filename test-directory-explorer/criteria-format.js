/* Clearer layout for the verbatim testing criteria. Formatting only: every character of the criteria text is kept, in
 * order (tests/explorer.test.js checks that the text of the formatted HTML equals the original for every line).
 * - the logic: OR / AND at the end of a criterion become connector badges; AND, OR, NOT… inside a sentence are emphasised
 * - ages and numeric thresholds stand out (e.g. <35 years, ≥2, under 60 years of age, score ≥15)
 * - lists run together in the PDF text (" o … o …", " - … - …") are shown as bullet lists; very long paragraphs break at sentences
 * - NOTE lines are shown as notes; PMIDs link to PubMed; R codes link to their indication (via the linkCode callback) */
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

  function line(text, linkCode) {
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
      const sentences = body.split(/(?<=[.;:])(\s+)(?=[A-Z(•])/);
      // The first sentence stays inline (next to its number or bullet); each later one starts a new block.
      html = sentences.map((s, i) => /^\s+$/.test(s) ? esc(s) : i ? `<span class="sent">${inline(esc(s), linkCode)}</span>` : inline(esc(s), linkCode)).join('');
    } else html = inline(esc(body), linkCode);
    if (joiner) html += `${esc(gap)}<span class="join join-${joiner === 'AND' ? 'and' : 'or'}">${esc(joiner)}</span>`;
    return html;
  }
  const isNote = text => /^(NOTES?\b|Notes?:|Please note\b|N\.?B\.?:)/.test(text);
  return { line, isNote };
})();
