# GeneRoute: Cancer Family History Navigator and Test Directory Explorer

Two static GitHub Pages tools for clinical genetics, live at https://generoute.co.uk/ (a landing page linking both):

- **Cancer Family History Navigator** (`cancer-family-history-navigator/`) – enter cancers (site, histology, age,
  markers) across a family to get a ranked differential of germline cancer predisposition syndromes, with suggested
  NHS National Genomic Test Directory tests. https://generoute.co.uk/cancer-family-history-navigator/
- **National Genomic Test Directory Explorer** (`test-directory-explorer/`) – every rare and inherited disease R code
  (see [below](#test-directory-explorer)). https://generoute.co.uk/test-directory-explorer/

Decision support only. Nothing entered leaves the browser.

GeneRoute is independent – not an NHS website or service – and every page says so. All three pages use the GeneRoute
deep-teal palette from the logo (header `#0e5866`, links and buttons `#0b7285`, teal focus ring, system font), deliberately
not the NHS identity (NHS Blue, yellow focus, green buttons, Frutiger/Arial). Keep it that way when changing styles.

## Structure

```
index.html                       Landing page; old Navigator links (generoute.co.uk/#test=R208) redirect to the Navigator
CNAME                            Custom domain (generoute.co.uk) for GitHub Pages
assets/                          Landing page icon (header, favicon, home-screen) and full logo (link previews)
cancer-family-history-navigator/
  index.html                     The Navigator
  assets/style.css               Styles (light/dark, print)
  assets/navigator-icon.png      Navigator logo (tree, DNA and compass); favicon-48.png and apple-touch-icon.png from it
  js/data.js                     Knowledge base: sites/histologies, conditions + scoring rules,
                                 Test Directory entries, NICPR gene list (June 2026)
  js/criteria.js                 Test Directory testing criteria, verbatim (generated from the v9.1 PDF)
  js/panels.js                   Green genes on each test's PanelApp panel, signed-off version (generated from the PanelApp API)
  js/eligibility.js              Who in the family meets Test Directory criteria
  js/app.js                      Scoring engine and UI
  docs/tier-audit.md             Strength-tier audit and items for clinical review
test-directory-explorer/         National Genomic Test Directory Explorer (separate app; see below)
tests/                           Checks and browser tests for both apps (npm test)
tools/                           Data refresh scripts for both apps
.nojekyll                        Serve files as-is (no Jekyll build)
```

In the rest of this README, `js/…` and `index.html` mean the Navigator's files in `cancer-family-history-navigator/`.

## Editing the knowledge base

Everything clinical lives in `js/data.js`:

- **CONDITIONS** – each syndrome has `genes`, `inh`, `tests` and `rules`.
  A rule is `[site, histology, tier, earlyAge, predicate, maxAge]`:
  - histology `'*'` matches any type; `'a|b'` matches either
  - tier `H` hallmark (10), `S` strong (6), `M` moderate (3), `W` weak (1)
    – assigned by the definitions in `TIER_DEFS` (yield and carrier risk; shown on the Sources tab). The last full check
      (`TIER_AUDIT`) and items for clinical review are in [docs/tier-audit.md](cancer-family-history-navigator/docs/tier-audit.md).
  - `earlyAge`: age at or below this ×1.5, 15+ years below ×2
  - `predicate`: a key in `PRED` (e.g. `tnbc`, `msh2`, `n100`)
  - `maxAge`: rule only applies at or below this age
- `mods` multiply a condition's score when a marker is present
  (e.g. MLH1 loss explained by methylation ×0.2 for Lynch MLH1).
- **TESTS** – Rare and Inherited Disease Test Directory v9.1 codes, PanelApp panels and
  condensed criteria (Part XI unless `part` names another chapter, e.g. `'IV'` Endocrinology).
- **NONCANCER_RECOGNISED / COMMON_ADULT_CANCERS** – in syndromes recognised by non-cancer features, a common adult cancer is at most moderate unless limited to age 40 or under (checked by `tests/check-data.js`).
- **FREQ_BAND / FREQ_WEIGHT** – rough frequency of each syndrome (1 commonest – 4 rarest) and the light weighting it gives the total score (×1, ×0.9, ×0.8, ×0.7); also orders exact ties.
- **PANEL_NOT_ROUTE** – syndromes whose gene is on a test's PanelApp panel but for which that test is not a testing route (e.g. BRCA2 on the Fanconi anaemia breakage panels). `tests/check-data.js` requires every other syndrome with a gene on a panel to list that test, and every listed test to have one of the syndrome's genes on its panel.
- **FHCC** – family history of colorectal cancer without a known syndrome: BSG/ACPGBI/UKCGG 2019 Box 1 categories and Table 1 surveillance; the category is worked out by `fhccCategory` in `js/eligibility.js` and shown as "Bowel screening if no inherited condition is found" in the results, copied summary and printouts. `FHCC.polyps` adds BSG/ACPGBI/PHE 2020 post-polypectomy surveillance (Rutter et al., Gut 2020): always shown, led by the proband's own adenomas or serrated polyps when entered (the section then shows even without colorectal cancer in the family), with a polyposis prompt at 10 or more adenomas. `FHCC.mcra` and `FHCC.sps` (BSG 2019 Table 1 and its MCRA and serrated polyposis sections) add plans for multiple colorectal adenomas (≥10 adenomas without APC/MUTYH) and SPS in the proband or a first-degree relative (relatives of SPS: 5-yearly from 40 or 10 years earlier). "WHO criteria" links (form, R211 reasons and criteria, bowel box) open the WHO 2019 serrated polyposis criteria. The bowel screening box is laid out as plan cards, most specific first (`fhccPlans` in `js/app.js`): proband polyposis (MCRA, SPS or possible SPS), first-degree relatives with polyposis, the proband's own polyps (post-polypectomy), then the family-history category; each card has labelled rows (testing, colonoscopy, relatives) and the copied summary follows the same order.
- **BREAST_FH** – family history of breast cancer without a known syndrome: NICE CG164 family-history patterns – high (1.4.4, specialist genetic clinic), moderate (1.3.3, secondary care) or near population – with the risk band, surveillance for women without a personal history (1.6) and "seek advice" features (1.3.4, 1.4.2, 1.4.5); worked out by `breastFhCategory` in `js/eligibility.js` (same-side criteria checked per side) and shown as "Breast screening if no inherited condition is found". Confirm with CanRisk.
- **UKCGG_LEAFLETS** – UKCGG patient information leaflets (gene leaflets, chemoprevention, reproductive options), listed per condition with `ukl` in SOURCES; `UKCGG_GENERAL` ones show for every condition.
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

## Family form

Relatives with at least one cancer entered fold into a one-line card (cancers, criteria tags and Manchester score);
click a card to edit it and **Done** to fold it again. Loading a family or adding a relative folds the others.

**Load example** opens a menu of fictional, clear-cut example families (BRCA, Lynch MSH2, PTEN, BAP1, Li-Fraumeni,
DICER1, Gorlin, ELP1, FAP, MUTYH (MAP), multiple colorectal adenomas (MCRA), serrated polyposis (SPS), RET (MEN2), Carney complex, VHL, SDHB, and moderate- and high-risk bowel and breast family histories), each with a short caption. They live in `EXAMPLES` in `js/data.js`; each names the syndrome
that should rank first (`top`) and the R code the proband should meet (`test`), which the browser tests check.

The relationship is chosen in two steps: a short list (Grandmother, Aunt, First cousin…), then the side of the
family where it matters (e.g. mother's mother or father's mother). Both map onto the relationship ids in `RELATIONS`
(`REL_KINDS` in `js/data.js`), so saved family files are unchanged; until the side is chosen the relative isn't counted.

Cousins, nieces/nephews, grandchildren, great-nieces/nephews and cousins' children have a **Child of** choice
(which aunt/uncle, sibling, child, niece or cousin is the parent). With it, the tree draws them under that parent and
eligibility uses the true relationships; without it, their links to possible parents are treated as unknown rather
than assuming every aunt or uncle is the parent.

## Test Directory eligibility

`js/eligibility.js` checks who in the family as entered meets the v9.1 criteria for the inherited cancer tests
(R156, R160, R207, R208, R210–R219, R221–R226, R254, R347, R363–R367, R414, R422, R430, R456, R457): single-person criteria (e.g. breast cancer under 40,
triple-negative under 60, high-grade ovarian), family patterns (e.g. modified Amsterdam, LFS, renal, PPGL), the
pathology-adjusted Manchester score (GeNotes table, Evans 2004/2017) and unaffected relatives when no affected relative
is alive. Results appear in a "Meets Test Directory criteria now" box at the top of the results column, in the copied summary
and in the printout. Deceased relatives are flagged as needing stored DNA or tissue. Criteria that fit apart from a detail
the form does not record are listed as "may meet – check"; others (tumour grade, CanRisk, Wimmer score) are not assessed.
R211 serrated polyposis: enter GI polyps as "Serrated polyposis (meets WHO criteria)" – met under 50 or with a first-degree
relative with SPS, otherwise "may meet" (dysplasia); five or more serrated polyps without that are "may meet – check the WHO criteria"
(size and site are not recorded).

Clicking any test code (results, eligibility box, form tags, family tree, syndrome and gene pages) opens a panel with
the exact criteria from `js/criteria.js`, linked to the PDF page. `CRIT_REF` in `js/eligibility.js` ties each reason
to its criterion line, so the lines the family meets (green), may meet (amber) or narrowly misses (grey) are
highlighted with who and why. The panel ends with the genes tested (green genes on the test's PanelApp panel,
from `js/panels.js`); hovering over a test code also shows them. Genes come from the panel's GMS signed-off version –
what laboratories test against – not PanelApp's latest version; genes added or removed since sign-off are shown as
"not yet signed off", and a panel with no signed-off version carries a warning.

Any Manchester score (eligibility box, R208 panel, and a live score under each person with breast or ovarian cancer in
the form) opens a breakdown: each cancer counted with its BRCA1/BRCA2 points, the tested person's pathology adjustments,
what was not counted and why, and the scoring table with the rows used highlighted (`manchesterDetail` in
`js/eligibility.js`).

## Test Directory tab

Lists every Test Directory test the site uses (`TESTS`), searchable by R code, test name, the exact criteria text,
genes on the PanelApp panel, and linked syndromes and their cancers. Each word also finds related forms and UK/US spellings
(pancreatic/pancreas, tumour/tumor, phaeo/pheo), from the start of a word. The list shows a match count and snippet for
each test (most mentions first); the open test highlights every match in yellow, with Previous / Next. Each test has its own page
(`#test=R208`) with the exact criteria, genes, linked syndromes and – when a family has been entered – who meets, may
meet or nearly meets each criterion; "Met or may be met by this family" filters the list. The R-code pop-up links to it.
The header, this tab and each test (pop-up and page) link to the Test Directory Explorer (`test-directory-explorer/#R208`), which
covers every R code; the links open in a new tab so the family entered is kept.

## Family tree

Layout: the family form and the family tree under it are on the left; the Test Directory criteria met and the
ranked differential are on the right (syndromes after the first five folded under "Show N more"), with the full list of Test Directory tests collapsed at the end (codes in the
differential open their criteria). Phones show one column in the same order. Printouts keep the order family table,
criteria, tree, syndromes.

Under the family form, a pedigree is drawn from the relatives entered (standard symbols: square male,
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
for recessive conditions only the proband and siblings count (cancers in parents or other relatives
do not support a recessive syndrome; `adSites` marks sites with dominant inheritance, e.g. MBD4 uveal melanoma); for
mosaic (not inherited) conditions only the best-scoring person counts. Several
matching cancers add a bonus. Narrow / Balanced / Wide set the cutoff relative
to the top score.


## Tests and data updates

Everything a contributor needs is in the repository (no build step for the site itself):

```
npm install                 # Playwright for the browser tests (first time only)
npx playwright install chromium
npm test                    # data checks, eligibility logic, criteria links, browser tests, gene pages
npm run test:fast           # the Node-only checks (seconds)
npm run test:live           # browser tests against the published site
```

- `tests/benchmarks.json` – typical families with the expected top syndrome, Test Directory tests and whether the "No strong pattern" note shows; run by the browser tests. Add one whenever a ranking problem is fixed.
- `tests/check-data.js` – every rule's site/histology/predicate/test exists, NICPR genes covered.
- `tests/eligibility.test.js` – Test Directory criteria, Manchester score, modified Amsterdam, relationships.
- `tests/criteria.test.js` – every eligibility reason links to a line of the verbatim criteria (random families).
- `tests/browser.test.js` – the app in Chromium (forms, results, pop-ups, printout, phone layout).
- `tests/a11y.test.js` – axe accessibility check of the main views in light and dark mode (serious problems and heading order).
- `tests/genes.test.js` – every gene page renders and its links are well formed.
- `tests/explorer.test.js` – Explorer data (every indication has tests, criteria, specialties) and the page in Chromium (`--no-browser` for the data checks only).

GitHub runs the same checks on every push (`.github/workflows/test.yml`).

Data updates:

- `npm run update:panels` – refresh `js/panels.js` from the PanelApp API. Each entry takes its green genes from the
  signed-off version (`/panels/signedoff/`) and records `signedOff` (date), `current` (PanelApp's newer version, if any)
  and `pending` (`added`/`removed` green genes not yet signed off), or `notSignedOff` if the panel has none. Run it
  monthly, and after each GMS sign-off, so pending changes show once they are live.
- `npm run update:criteria` – rebuild `js/criteria.js` from the Test Directory PDF (needs `pdftotext`).
- `npm run update:explorer` – rebuild the Explorer's data (below; needs `pdftotext` and Python `openpyxl`).
- `npm run bump` – new `?v=` version on every script and style tag in both apps' `index.html`.

## Test Directory Explorer

`test-directory-explorer/` is a separate page covering every rare and inherited disease (R) clinical indication in the
NHS England National Genomic Test Directory: search by R code, condition, gene or criteria wording; filter by clinical
area, method, commissioning or requesting specialty; open an indication for its tests (target, method, optimal family
structure, scope, PanelApp panel and green genes), verbatim testing criteria, overlapping indications, where in the
pathway and who can request it; or open a gene to see every test that covers it.

```
test-directory-explorer/index.html         The page
test-directory-explorer/explorer.js        Search, filters and views (#R133, #gene=BRCA1, #q=…)
test-directory-explorer/explorer.css       Styles (light/dark)
test-directory-explorer/explorer-icon.png  Explorer logo (magnifying glass over DNA); favicon-48.png and apple-touch-icon.png from it
test-directory-explorer/abbreviations.js   Meanings shown on hover/tap; per-indication meanings; words deliberately not expanded
test-directory-explorer/criteria-format.js Clearer layout of the verbatim criteria (formatting only; the words never change)
test-directory-explorer/corrections.js     Obvious typos and punctuation corrected in the formatted layout (each marked; PDF layout unchanged)
test-directory-explorer/search-terms.js    Search synonyms (deafness ↔ hearing loss …) and US → UK spellings
test-directory-explorer/specialties.js     Requesting specialties (PDF wording) → filter groups (e.g. Surgery* → Surgery)
test-directory-explorer/forms.js          Request forms: national WGS forms; each Genomic Laboratory Hub's forms for other tests (user picks the hub); rapid, prenatal, pharmacogenomic and carrier routes
test-directory-explorer/data/directory.js  Generated: indications, tests, verbatim criteria (do not edit)
test-directory-explorer/data/panels.js     Generated: green genes on each PanelApp panel (do not edit)
```

Search also finds abbreviations by their meaning (HCM → hypertrophic cardiomyopathy), everyday synonyms and US spellings
(`search-terms.js`), ranks names that exclude a term ("…excluding NF1") lower, and offers "Did you mean…?" when nothing
matches. Gene lists are each PanelApp panel's GMS signed-off version (what laboratories test against); if PanelApp's newer
version changes the green genes, the test and the gene page say so.

The list's search and filters are kept in the address (e.g. `#q=hearing+loss&part=IX+Audiology`), so a filtered view
can be bookmarked or shared; with no search the list is grouped by clinical area. Indication pages highlight the search
words, step to the previous/next indication in the results, show which other indications mention this one, and have
Copy link and Print buttons; large PanelApp panels have a box to find a gene. Press `/` anywhere to search.

The testing criteria are shown word for word but laid out for reading: OR / AND connectors between criteria, ages and
thresholds highlighted, lists that run together in the PDF text split into bullet points, long paragraphs broken at
sentences, NOTE lines as notes and PMIDs linked. “Show as in the PDF” switches to the plain layout (remembered per browser).
In the formatted layout, obvious typos and punctuation errors listed in `corrections.js` are corrected and marked with a
dashed underline (hover or tap shows the PDF wording); the PDF layout always shows the original. Each correction must match
its indication's text exactly once, spelling fixes may change at most 3 letters, and punctuation/break fixes may not change
any letters. `tests/explorer.test.js` checks all of this, and that the rest of the text is identical to the PDF.

Abbreviations are underlined with dots and show their meaning on hover, tap or keyboard focus; each indication page
also lists the ones it uses. `tests/explorer.test.js` fails if a new directory version brings an abbreviation that is not in
`abbreviations.js` (add its meaning, or add it to `TDX_ABBR_IGNORE` if it is not one).

`tools/update-explorer.py` builds both data files from the directory spreadsheet, the eligibility criteria PDF and the
PanelApp API, and lists anything it could not match. When NHS England publishes a new version, update the `XLSX` and
`PDF` URLs at the top of the script, run `npm run update:explorer`, check its output, then `npm test` and `npm run bump`.
