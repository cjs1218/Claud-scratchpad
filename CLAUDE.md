# Cancer Predisposition Differential

Static GitHub Pages app (no build). Clinical content lives in `js/data.js`; see README.md.
Run `npm run test:fast` after editing data or logic, and `npm test` (adds the browser tests) before pushing; tests live in `tests/`
(every rule's site/histology/predicate/test must exist, every NICPR gene must be covered by a condition).
Add or update tests in `tests/` with each change. Data refresh scripts are in `tools/` (see README).
After changing data.js, criteria.js, panels.js, eligibility.js, app.js or style.css, bump the `?v=` version on their tags in index.html (`npm run bump`) so browsers load the new files.
When re-checking a source, update its date in `SOURCE_DATES` (and `DATA_CHECKED`) in data.js.
Every rule must cite at least one source (7th element) that resolves – use only reliable sources (UK/European guidance, GeneReviews, ClinGen, peer-reviewed studies you have read, and US guidance – NCCN or published in a peer-reviewed journal; where it differs, keep the UK value and record the US position as the rule's 9th element) and add new papers to `EVIDENCE` with a DOI or PubMed URL.
When re-checking a syndrome, update its date in `LAST_REVIEWED` in data.js (pages flag dates over 12 months old).

## Git

- Always commit and push directly to `main`.
