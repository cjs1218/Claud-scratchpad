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
- **TESTS** – Rare and Inherited Disease Test Directory v9.1 codes, PanelApp panels and
  condensed criteria (Part XI unless `part` names another chapter, e.g. `'IV'` Endocrinology).
- **EG / GUIDES / EU_GUIDES / US_GUIDES / SOURCES** – East Genomics leaflets (direct links), UKCGG / NICE
  guidance, European guidelines (ERN GENTURIS, ESMO, ESGE, EHTG/ESCP, ESE, SIOPE) and US / international
  guidelines (NCCN, ACMG, ACG, USMSTF, ATA, Endocrine Society, AACR) per condition.
- **REFS** – per-condition GeneReviews chapters (`GR_TITLES`) and OMIM phenotype entries
  (`OMIM_TITLES`); gene entries come from `GENE_MIM`.
- **NICPR** – the NICPR Appendix 1 gene list and its annotations.
- **DATA_CHECKED / SOURCE_DATES** – when each information source was last pulled and checked; listed on the Sources tab (`#sources`), linked by a button at the foot of each syndrome and gene page, and printed in full on printouts.
- **Rule evidence** – each rule is `[site, hist, tier, earlyAge, condition, maxAge, sources, risk]`. `sources` lists keys:
  `gr:<NBK>` (GeneReviews), `ukcgg:<GUIDES key>`, `eu:` / `us:` guideline keys, `clingen:<GENE>`, `canvar:<GENE>`, or a key
  in **EVIDENCE** (`[short label, citation, DOI/PubMed URL]`). `risk` is an optional short risk figure. Shown in the
  "Risk and evidence" column on syndrome pages.
- **VARIANT_NOTES** – genotype–phenotype notes per condition (`[text, sources]`), information only (not scored).
- **ABBREVIATIONS** – abbreviations in cancer types / histologies / markers; click-to-expand wherever they appear.
- **GENOTES** – GeNotes (NHS England Genomics Education Programme) Knowledge Hub pages and In the Clinic pathways per condition (`[title, path]` under `GENOTES_BASE`), shown with each syndrome's guidance and on gene pages.
- **NICPR_IN_SCOPE** – genes treated as fully in scope (RAD51C and the Lynch genes): no NICPR scope warnings are shown, while `NICPR` itself stays as published.
- **LAST_REVIEWED** – date each syndrome was last reviewed (YYYY-MM-DD); shown on syndrome and gene pages, summaries and printouts, and flagged when over 12 months old.
- **SURVEILLANCE** – suggested surveillance per condition: UK first (UKCGG gene guidelines, BSG 2019),
  then European (ERN GENTURIS, EHTG/ESCP, SIOPE), then international (AACR, consensus guidelines, GeneReviews
  summaries); `diff` lists other guidance that differs. Shown on syndrome/gene pages, summaries and printouts.
- **TEST_POINTERS** – tumour-specific testing advice (currently from the AACR 2024 childhood CNS tumour
  update), each with the NHS Test Directory route; shown in results and the By-cancer view.
- **CATEGORIES** – groups conditions for the Syndromes tab (every condition in exactly one group).

## Family assessment features

- **Results**: top three in full; lower-ranked results as compact rows (Show details). Each shows its score, % of the
  top score and a one-line "why here". Strength is shown as coloured pills with a legend.
- **Save family to file / Open family file** (JSON, stays on the user's computer) and an opt-in
  **Remember on this device** (browser storage only).
- **Find a cancer type** box on each cancer (searches histologies, sites and spelled-out abbreviations).
- **Undo** after removing a cancer, a relative or clearing the family.
- **Person details**: age now, deceased and age at death (shown in the tree and summary, not scored);
  **family ancestry** (Ashkenazi Jewish adds founder-variant notes from `VARIANT_NOTES`; not scored).
- **Compare top two** (or "Compare with…" on a syndrome page; `#compare=a,b`): the cancers each syndrome causes.
- The header slims once a family is entered; on phones a "See results" button jumps to the differential and syndrome
  tables become stacked cards.

## Family tree

Above the differential, a pedigree is drawn from the relatives entered (standard symbols: square male,
circle female, diamond sex not given, arrow for the proband). Relatives needed to connect the family but not
entered (parents, grandparents, partners, an aunt for a cousin) are drawn faintly. People whose cancers score for
the highlighted syndrome are filled blue, other cancers grey. The top result is highlighted by default; pick
another from the dropdown or click a result's title. The tree can be collapsed, is always included when the
assessment is printed, and can be downloaded as PNG or SVG (`pedigreeSvg` / `layoutPedigree` in app.js).

## Syndromes tab

Three views: **By syndrome** (grouped into categories), **By gene** (one page per gene, combining
every syndrome it causes) and **By cancer and histology**. Filter by text, Test Directory code or
UK guideline. Each syndrome / gene page shows genes, inheritance, NICPR notes, cancers and
histology with strength and age thresholds, Test Directory tests with criteria, all guidance,
leaflets and references, then suggested surveillance as the last section, and a button to the Sources tab.

Printing: each page has Print; press **Select to print** and tick items in the list for **Print selected**, or **Print all
shown** for a handbook with a contents page. Printouts show URLs after links and a footer with
the disclaimer, site address, information-checked date and print date. Links: `#syndrome=<id>`,
`#gene=<symbol>`, `#syndromes`.

## Scoring

Per cancer, the best-matching rule for each condition gives a base weight, adjusted
for age, markers and bilaterality, then by relatedness (1st degree ×1, 2nd ×0.6,
3rd ×0.35). For dominant conditions only the stronger parental side counts fully;
for recessive conditions only the proband and siblings count fully. Several
matching cancers add a bonus. Narrow / Balanced / Wide set the cutoff relative
to the top score.
