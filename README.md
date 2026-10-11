# Cancer Predisposition Differential

A static GitHub Pages tool for clinical genetics. Enter cancers (site, histology,
age, markers) across a family to get a ranked differential of germline cancer
predisposition syndromes, with suggested NHS National Genomic Test Directory tests.

Live at: https://cjs1218.github.io/Claud-scratchpad/

Decision support only. Nothing entered leaves the browser.

## Structure

```
index.html        The app
assets/style.css  Styles (light/dark, print)
js/data.js        Knowledge base: sites/histologies, conditions + scoring rules,
                  Test Directory entries, NICPR gene list (June 2026)
js/app.js         Scoring engine and UI
.nojekyll         Serve files as-is (no Jekyll build)
```

## Editing the knowledge base

Everything clinical lives in `js/data.js`:

- **CONDITIONS** – each syndrome has `genes`, `inh`, `tests` and `rules`.
  A rule is `[site, histology, tier, earlyAge, predicate, maxAge]`:
  - histology `'*'` matches any type; `'a|b'` matches either
  - tier `H` hallmark (10), `S` strong (6), `M` moderate (3), `W` weak (1)
  - `earlyAge`: age at or below this ×1.5, 15+ years below ×2
  - `predicate`: a key in `PRED` (e.g. `tnbc`, `msh2`, `n100`)
  - `maxAge`: rule only applies at or below this age
- `mods` multiply a condition's score when a marker is present
  (e.g. MLH1 loss explained by methylation ×0.2 for Lynch MLH1).
- **TESTS** – Rare and Inherited Disease Test Directory v9.1 (Part XI) codes, PanelApp
  panels and condensed criteria (`code: null` = test lives outside Part XI).
- **EG / SOURCES** – East Genomics patient leaflets and UK guidance per condition.
- **NICPR** – the NICPR Appendix 1 gene list and its annotations.

## Scoring

Per cancer, the best-matching rule for each condition gives a base weight, adjusted
for age, markers and bilaterality, then by relatedness (1st degree ×1, 2nd ×0.6,
3rd ×0.35). For dominant conditions only the stronger parental side counts fully;
for recessive conditions only the proband and siblings count fully. Several
matching cancers add a bonus. Narrow / Balanced / Wide set the cutoff relative
to the top score.
