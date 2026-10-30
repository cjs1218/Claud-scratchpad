# GeneRoute family file format (version 1)

A specification for exchanging anonymised family histories between a pedigree system (for example an electronic health
record) and the GeneRoute Cancer Family History Navigator at <https://generoute.co.uk/cancer-family-history-navigator/>.

- **Into the Navigator:** your system writes a file; the user opens it with **Open family from file**.
- **Out of the Navigator:** **Save family to file** downloads a file in the same format; your system reads it.

The format is the Navigator's own: each person is described by their **relationship to the proband**, and cancers by the
Navigator's site and histology codes. The code lists are in the appendix, generated from the Navigator's data, so they
always match the live site.

Everything happens in the user's browser: the Navigator has no server, no upload endpoint and no API, and never sends a
family anywhere. "Uploading" means the user opening the file in their own browser.

Contents: [1. Anonymisation](#1-anonymisation) · [2. File basics](#2-file-basics) · [3. Top level](#3-top-level) ·
[4. People](#4-people) · [5. Diagnoses](#5-diagnoses) · [6. Mapping a pedigree to relationship codes](#6-mapping-a-pedigree-to-relationship-codes) ·
[7. Reading a Navigator file back](#7-reading-a-navigator-file-back) · [8. How the Navigator reads a file](#8-how-the-navigator-reads-a-file) ·
[9. Versioning](#9-versioning) · [10. Examples](#10-examples) · [11. Checklist](#11-checklist) · [Appendix: codes](#appendix-codes)

---

## 1. Anonymisation

A file must not identify anyone. Your export must follow these rules:

| Rule | Detail |
|---|---|
| **No identifiers** | No names, initials, NHS or hospital numbers, addresses, postcodes, contact details or record links. |
| **No dates** | No dates of birth, death or diagnosis, and no years. |
| **The only age is age at diagnosis** | Give `age` (and `age2` for a second side) on a diagnosis when it is known and needed. Leave out `ageNow` and `ageDeath`. |
| **No free text** | The format has no notes or comments field. Do not add one; the Navigator ignores unknown fields, but they would still travel in the file. |
| **Random ids** | `id` numbers are only for linking people within the file (1, 2, 3 …). Never use record numbers. |
| **File name** | Do not put identifiers in the file name. A neutral name such as `family-history.json` is fine. |
| **Allowed** | Relationship, sex, `deceased` (true/false, no age), `adopted` (proband only), ancestry code, diagnoses with ages at diagnosis and tumour results. |

What leaving out `ageNow` and `ageDeath` costs: the Navigator cannot warn when an age at diagnosis is later than a
person's current age, and the family tree shows "deceased" without an age. Rankings, Test Directory eligibility, the
Manchester score, bowel screening advice and breast family history categories do not use them.

Files saved **from** the Navigator contain whatever the user typed. The Navigator itself never asks for names, but a user
may have entered current ages or ages at death. Your import should accept those fields and may drop them.

Small numbers in rare conditions can still make a family recognisable. Treat files as sensitive and handle them under your
organisation's information governance rules.

## 2. File basics

- One JSON object, UTF-8, extension `.json`, MIME type `application/json`.
- No comments, no trailing commas. Whitespace and key order do not matter.
- Unknown fields are ignored, so you may add your own fields prefixed `x_`. They are not kept when the Navigator saves the
  file again.

## 3. Top level

| Field | Type | Required | Meaning |
|---|---|---|---|
| `app` | string | recommended | Always `"cancer-predisposition-differential"`. |
| `version` | integer | recommended | Format version: `1`. |
| `ancestry` | string | optional | Founder-population ancestry code (appendix B). `""` or missing = not known / not relevant. Unknown values are treated as `""`. |
| `people` | array | **required** | The family members (section 4). If `people` is missing or not an array, the file is rejected. |

## 4. People

Each element of `people` is one person.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | integer | required if anyone links to this person | Unique within the file. Used only by `parentId`. The Navigator renumbers people on loading. |
| `rel` | string | **required** | Relationship to the proband (appendix A). A person with an unknown code is left out. |
| `sex` | string | **required** | `"F"`, `"M"` or `""` (not known), meaning sex assigned at birth, which decides the cancers counted for each person. Missing or any other value is treated as `""`; the Navigator does **not** fill it in from the relationship, so send it for everyone, mothers and fathers included. |
| `parentId` | integer or null | optional | For cousins, nieces/nephews, grandchildren, great-nieces/nephews and cousins' children: the `id` of the relative they descend from (appendix A, last column). It keeps relatives on separate branches apart, for example two cousins who are children of different aunts. Leave it out or `null` when not known. |
| `deceased` | boolean | optional | `true` if the person has died. Default `false`. |
| `adopted` | boolean | optional | Proband only: the proband was adopted and has no known cancer history in blood relatives (used by the Manchester score). Ignored for anyone else. |
| `dx` | array | optional | Diagnoses and features (section 5). Missing or empty = no known cancer. |
| `ageNow`, `ageDeath` | integer | **leave out** in anonymised exports | Accepted from older files and from users; see section 1. |

Rules:

- **Exactly one proband.** If none is present, the Navigator adds an empty one. The proband is the person being assessed;
  everyone else is described relative to them.
- **Repeats are allowed** for every relationship except `mother` and `father` (the Navigator warns if either appears twice).
  Three sisters are three people with `rel: "sister"`.
- **Include unaffected people when they matter.** For example, include the aunt a cousin descends from, so that
  `parentId` has something to point to. Unaffected relatives can otherwise be left out.
- **Sex must match the relationship** where appendix A gives one (a `mother` is `F`, a `m_uncle` is `M`). Codes without
  one, such as `niece`, `m_cousin` or `m_halfsib`, cover both sexes.

## 5. Diagnoses

Each element of a person's `dx` array is one cancer, tumour or relevant non-cancer feature.

| Field | Type | Applies to | Meaning |
|---|---|---|---|
| `site` | string | all | Site code (appendix C). An unknown code blanks the entry, and a blank entry counts for nothing. |
| `hist` | string | all | Histology or type code for that site (appendix D). An unknown code blanks it. Use the site's "type not known" code (usually `nos`) when the type is not known. Never guess a type. |
| `age` | integer | all | Age in whole years at diagnosis (0–120; 0 = under 1 year). Leave it out or `""` if not known. |
| `side` | string | sites in appendix C | `"one"` = one side (left or right), `"both"` = both sides, `"multi"` = multifocal / multiple on one side. Only for the sites and types listed; other values are dropped. |
| `age2` | integer | with `side: "both"` | Age at diagnosis on the second side, if different. |
| `count` | integer | GI polyps and counted tumours (appendix C) | Number of polyps or tumours. Leave it out if not known; do not write ranges or words. |
| `er`, `pr`, `her2`, `grade` | string | `breast` | Receptor status and grade (appendix E). |
| `ovgrade` | string | `ovary` with `hist` `endometrioid` or `nos` | Low or high grade (appendix E). |
| `mmr`, `meth`, `braf` | string | Lynch-spectrum sites (appendix C) | Mismatch repair immunohistochemistry or MSI, MLH1 promoter methylation, BRAF V600E (appendix E). |

Rules:

- **One entry per primary.** Two separate primaries (for example breast cancer at 45 and ovarian cancer at 52) are two
  entries. Bilateral breast cancer is one entry with `side: "both"`, plus `age2` if the second side was later.
- **Non-cancer features** use `site: "feature"`, for example macrocephaly, café-au-lait macules or mucocutaneous
  pigmentation (appendix D). Benign tumours such as parathyroid adenomas or angiomyolipomas have their own sites or codes.
- **GI polyps** use `site: "polyps"` with the polyp type and `count`. Adenomas with no `count` are treated as possible
  polyposis, at most a moderate match, and the Navigator asks for the number.
- **Markers and values must be from appendix E.** Values the form does not offer are dropped on loading. Send markers only
  on the sites listed in appendix C: the form does not show them elsewhere, so the user cannot see or correct them.
- **Ampullary cancer** is `site: "biliary"`, `hist: "ampullary"`.

## 6. Mapping a pedigree to relationship codes

Most pedigree systems store each person with links to their mother and father. To export, walk from the proband to each
relative and choose the code from the path:

| Path from the proband | Code |
|---|---|
| mother / father | `mother` / `father` |
| child of both parents | `sister` / `brother` |
| child of the mother only / father only | `m_halfsib` / `p_halfsib` |
| own child | `daughter` / `son` |
| child of a child | `grandchild` (`parentId` = that son or daughter) |
| child of a sibling or half-sibling | `niece` (`parentId` = that sibling) |
| grandchild of a sibling | `gniece` (`parentId` = that niece or nephew) |
| mother's mother / father | `m_gm` / `m_gf` |
| father's mother / father | `p_gm` / `p_gf` |
| mother's sister / brother (full or half) | `m_aunt` / `m_uncle` |
| father's sister / brother (full or half) | `p_aunt` / `p_uncle` |
| child of a maternal aunt or uncle | `m_cousin` (`parentId` = that aunt or uncle) |
| child of a paternal aunt or uncle | `p_cousin` (`parentId` = that aunt or uncle) |
| child of a maternal / paternal first cousin | `m_cousin_child` / `p_cousin_child` (`parentId` = that cousin) |
| sibling of a maternal / paternal grandparent | `m_great` / `p_great` |
| parent of a maternal / paternal grandparent | `m_ggp` / `p_ggp` |
| any other blood relative on the mother's / father's side | `m_other` / `p_other` |
| blood relative whose side is not known | `other` |

Points to watch:

- **Partners and in-laws** are not blood relatives. Leave them out (the father of the proband's children, for example).
- **Twins** are `sister` / `brother`. The format has no twin field.
- **Consanguinity** has no field. A relative on both sides should appear once, on the side that is more closely related.
  If they are equally close, choose one side.
- **Adopted relatives** are not blood relatives. Leave them out, apart from the proband (`adopted: true`).
- **Do not use `unset`.** It marks a card where the user has not yet chosen a relationship.
- **Unknown sides** should be `other`, not guessed. The Navigator counts side-specific patterns, such as cancers on one
  side of the family, only when the side is known.
- **Lost detail.** Codes like `m_other` keep a relative's cancers and side but not their exact position. Converting back
  cannot rebuild the exact tree (section 7).

## 7. Reading a Navigator file back

A file saved by the Navigator has the same structure, with these differences:

- Every person has every field, with `""`, `false` or `null` for unknown values, and `ageNow`/`ageDeath` if the user
  typed them.
- Every diagnosis has an `id` (ignore it) and every diagnosis field, with `""` for not known. A person with no diagnoses
  has one empty entry (`site: ""`), which you should skip.
- `id` and `parentId` are the Navigator's own numbers: consistent within the file, but not the ids you exported.

To rebuild a pedigree, create the proband, then the people the codes imply:

- **Parents:** `mother` and `father` are the proband's parents. A `sister`/`brother` shares both of them, `m_halfsib` the
  mother only, and `p_halfsib` the father only.
- **Grandparents, aunts and uncles:** attach to the mother's or father's parents. Create unaffected placeholder
  grandparents if needed.
- **People with a `parentId`:** attach to that person. Without one, attach to a placeholder (for example "a maternal aunt
  or uncle, not entered").
- **`m_great`, `p_great`, `m_ggp`, `p_ggp`:** attach through placeholder grandparents.
- **`m_other`, `p_other`, `other`:** these have no fixed position. Keep them as unplaced relatives or ask the user where they
  belong.

If you exported the family in the first place, match people back to your own record by relationship, sex and diagnoses.
Do not rely on ids.

## 8. How the Navigator reads a file

The Navigator is forgiving: it loads what it understands and drops the rest, rather than rejecting the file.

| Input | What happens |
|---|---|
| Not JSON, or no `people` array | "That file could not be opened." Nothing changes. |
| Person with an unknown `rel` | Left out. |
| Missing or invalid `sex` | Treated as not known (`""`). |
| No proband | An empty proband is added. |
| Unknown `site` or `hist` | Blanked, and the diagnosis counts for nothing. If only the histology is unknown, the card warns the user to choose it. |
| `side`, marker or grade value not offered for that diagnosis | Dropped; the rest of the diagnosis loads. |
| Unknown fields | Ignored. |
| `parentId` pointing to a missing or unsuitable person | Treated as not specified. |
| `ancestry` not in appendix B | Treated as not known. |

After opening, the family appears folded into one-line cards, with any warnings shown on each card. Check the warnings
after testing your export.

## 9. Versioning

- `version` is `1`. A change that would break existing files (renaming or removing a field, or changing a field's meaning)
  will use a new version number. The Navigator will keep reading version 1 files.
- **Codes are added over time** (new sites, histologies or relationships). Adding codes does not change the version, so
  regenerate your code mapping from the appendix when the site is updated. A code your system does not know should be
  kept or mapped to the site's "type not known" code, not dropped silently.
- **Changed meanings** are listed here:
  - **18 Oct 2026:** `cns` / `medullo_nos` changed from "group 3/4 / unknown" to "subgroup not known". Group 3/4 is now
    `medullo_g34`. `biliary` / `ampullary` was added. Before this, ampullary cancer was entered as small bowel.

## 10. Examples

**Minimal:** a proband with breast cancer.

```json
{ "app": "cancer-predisposition-differential", "version": 1,
  "people": [ { "id": 1, "rel": "proband", "sex": "F", "dx": [ { "site": "breast", "hist": "idc", "age": 38 } ] } ] }
```

**A typical anonymised export:** a maternal cousin linked to her mother (an unaffected maternal aunt), tumour markers, a
second-side breast cancer and a deceased relative. There are no current ages or ages at death.

```json
{
  "app": "cancer-predisposition-differential",
  "version": 1,
  "ancestry": "",
  "people": [
    { "id": 1, "rel": "proband", "sex": "F",
      "dx": [ { "site": "breast", "hist": "idc", "age": 41, "er": "neg", "pr": "neg", "her2": "neg", "grade": "3" } ] },
    { "id": 2, "rel": "mother", "sex": "F", "deceased": true,
      "dx": [ { "site": "ovary", "hist": "hgsc", "age": 58 } ] },
    { "id": 3, "rel": "m_aunt", "sex": "F", "dx": [] },
    { "id": 4, "rel": "m_cousin", "sex": "F", "parentId": 3,
      "dx": [ { "site": "breast", "hist": "idc", "age": 44, "side": "both", "age2": 49 } ] },
    { "id": 5, "rel": "father", "sex": "M",
      "dx": [ { "site": "colorectal", "hist": "adeno", "age": 62, "mmr": "intact" },
              { "site": "polyps", "hist": "adenoma", "age": 60, "count": 3 } ] }
  ]
}
```

**A file saved by the Navigator** (abridged: a person with no cancer has one empty diagnosis):

```json
{
 "app": "cancer-predisposition-differential",
 "version": 1,
 "ancestry": "",
 "people": [
  { "id": 1, "rel": "proband", "sex": "F", "ageNow": "", "deceased": false, "ageDeath": "", "adopted": false, "parentId": null,
    "dx": [ { "id": 2, "site": "breast", "hist": "idc", "age": "41", "er": "neg", "pr": "neg", "her2": "neg", "grade": "3",
              "ovgrade": "", "mmr": "", "meth": "", "braf": "", "count": "", "side": "", "age2": "" } ] },
  { "id": 3, "rel": "m_aunt", "sex": "F", "ageNow": "", "deceased": false, "ageDeath": "", "adopted": false, "parentId": null,
    "dx": [ { "id": 4, "site": "", "hist": "", "age": "", "er": "", "pr": "", "her2": "", "grade": "", "ovgrade": "", "mmr": "",
              "meth": "", "braf": "", "count": "", "side": "", "age2": "" } ] }
 ]
}
```

Ages may arrive as strings (`"41"`) or numbers (`41`); treat `""` as not known.

## 11. Checklist

Before releasing your export:

- [ ] No names, numbers, dates, years, free text, current ages or ages at death (section 1).
- [ ] Exactly one `proband`, and every `rel` is in appendix A.
- [ ] Every `site` and `hist` is in appendices C and D; unknown types use the site's "type not known" code.
- [ ] `side`, `count` and markers only where appendix C allows them, with values from appendix E.
- [ ] Cousins, nieces/nephews and grandchildren carry `parentId` where the linking relative is known, and that relative is
      in the file.
- [ ] Opening the file in the Navigator shows no unexpected warnings, and the family tree looks right.
- [ ] Round trip: a file saved by the Navigator imports into your system without losing diagnoses.

---

## Appendix: codes

Generated from the Navigator's data on each update, so these lists match the live site.

<!-- codes:start (generated by tools/family-format-tables.js – do not edit by hand) -->

### A. Relationship codes (`rel`)

Relationship to the proband. Where Sex is given, `sex` must match it. `parentId` may point to a person with one of the listed relationships.

| Code | Meaning | Degree | Side | Sex | `parentId` may point to |
|---|---|---|---|---|---|
| `proband` | Proband | 0 | proband’s own generation | – | – |
| `mother` | Mother | 1 | maternal | F | – |
| `father` | Father | 1 | paternal | M | – |
| `sister` | Sister | 1 | proband’s own generation | F | – |
| `brother` | Brother | 1 | proband’s own generation | M | – |
| `daughter` | Daughter | 1 | proband’s children | F | – |
| `son` | Son | 1 | proband’s children | M | – |
| `m_gm` | Maternal grandmother | 2 | maternal | F | – |
| `m_gf` | Maternal grandfather | 2 | maternal | M | – |
| `m_aunt` | Maternal aunt | 2 | maternal | F | – |
| `m_uncle` | Maternal uncle | 2 | maternal | M | – |
| `p_gm` | Paternal grandmother | 2 | paternal | F | – |
| `p_gf` | Paternal grandfather | 2 | paternal | M | – |
| `p_aunt` | Paternal aunt | 2 | paternal | F | – |
| `p_uncle` | Paternal uncle | 2 | paternal | M | – |
| `m_halfsib` | Maternal half-sibling | 2 | maternal | – | – |
| `p_halfsib` | Paternal half-sibling | 2 | paternal | – | – |
| `niece` | Niece / nephew | 2 | proband’s siblings’ line | – | `sister`, `brother`, `m_halfsib`, `p_halfsib` |
| `grandchild` | Grandchild | 2 | proband’s children | – | `daughter`, `son` |
| `m_cousin` | Maternal first cousin | 3 | maternal | – | `m_aunt`, `m_uncle` |
| `p_cousin` | Paternal first cousin | 3 | paternal | – | `p_aunt`, `p_uncle` |
| `m_great` | Maternal great-aunt / uncle | 3 | maternal | – | – |
| `p_great` | Paternal great-aunt / uncle | 3 | paternal | – | – |
| `m_ggp` | Maternal great-grandparent | 3 | maternal | – | – |
| `p_ggp` | Paternal great-grandparent | 3 | paternal | – | – |
| `gniece` | Great-niece / nephew | 3 | proband’s siblings’ line | – | `niece` |
| `m_cousin_child` | Maternal first cousin's child | 4 | maternal | – | `m_cousin` |
| `p_cousin_child` | Paternal first cousin's child | 4 | paternal | – | `p_cousin` |
| `m_other` | Other maternal relative | 3 | maternal | – | – |
| `p_other` | Other paternal relative | 3 | paternal | – | – |
| `other` | Other / side unknown | 3 | unknown | – | – |
| `unset` | Relationship not chosen | 3 | unknown | – | – |

### B. Ancestry codes (`ancestry`)

| Code | Meaning |
|---|---|
| `""` | Not known / not relevant |
| `ashkenazi` | Ashkenazi Jewish |
| `westray` | Grandparent from Westray (Orkney) |
| `whalsay` | Grandparent from Whalsay (Shetland) |
| `maori` | Māori |
| `other_founder` | Other founder population |

### C. Sites (`site`) and what each accepts

| Site | Meaning | Tumour markers | `side` values | `count` |
|---|---|---|---|---|
| `breast` | Breast | `er`, `pr`, `her2`, `grade` | `one`, `both`, `multi` | – |
| `ovary` | Ovary / fallopian tube / peritoneum | `ovgrade` | `one`, `both` | – |
| `uterus` | Uterus (endometrium / myometrium) | `mmr`, `meth`, `braf` | – | – |
| `cervix` | Cervix | – | – | – |
| `colorectal` | Colorectal | `mmr`, `meth`, `braf` | – | – |
| `smallbowel` | Small bowel / duodenum | `mmr`, `meth`, `braf` | – | – |
| `stomach` | Stomach | `mmr`, `meth`, `braf` | – | – |
| `oesophagus` | Oesophagus | – | – | – |
| `pancreas` | Pancreas | – | – | – |
| `liver` | Liver | – | – | – |
| `biliary` | Biliary tract / gallbladder / ampulla | `mmr`, `meth`, `braf` | – | – |
| `kidney` | Kidney | – | `one`, `both`, `multi` | – |
| `urothelial` | Urothelial | `mmr`, `meth`, `braf` | – | – |
| `prostate` | Prostate | – | – | – |
| `testis` | Testis | – | – | – |
| `thyroid` | Thyroid | – | – | – |
| `parathyroid` | Parathyroid | – | `one`, `multi` (only for `adenoma`) | – |
| `pituitary` | Pituitary | – | – | – |
| `adrenal` | Adrenal | – | `one`, `both` | – |
| `ppgl` | Paraganglioma | – | – | – |
| `net` | Neuroendocrine (non-pancreatic) | – | – | – |
| `cns` | Brain / CNS | – | `one`, `both` (only for `vs`) | only for `schwannoma`, `meningioma`, `meningioma_cc`, `hb` |
| `eye` | Eye | – | `one`, `both`, `multi` | – |
| `skin` | Skin | `mmr`, `meth`, `braf` | – | yes |
| `meso` | Mesothelioma | – | – | – |
| `lung` | Lung | – | – | – |
| `sarcoma` | Sarcoma / soft tissue | – | – | yes |
| `heme` | Haematological | – | – | – |
| `nb` | Neuroblastoma | – | `one`, `both`, `multi` | – |
| `headneck` | Head and neck | – | – | – |
| `polyps` | GI polyps | – | – | yes (number of polyps) |
| `feature` | Other tumours & clinical features | – | `one`, `both`, `multi` (only for `chrpe`) | only for `bimt`, `cutleio`, `pilomatrixoma` |

### D. Histology / type codes (`hist`) by site

**`breast` – Breast**

| Code | Meaning |
|---|---|
| `idc` | Invasive ductal / no special type |
| `ilc` | Invasive lobular |
| `medullary` | Medullary-like / basal-like |
| `metaplastic` | Metaplastic |
| `dcis` | DCIS only |
| `phyllodes` | Malignant phyllodes |
| `nos` | Other / unknown |

**`ovary` – Ovary / fallopian tube / peritoneum**

| Code | Meaning |
|---|---|
| `fibroma` | Ovarian fibroma / fibrothecoma |
| `hgsc` | High-grade serous |
| `lgsc` | Low-grade serous |
| `endometrioid` | Endometrioid |
| `clearcell` | Clear cell |
| `mucinous` | Mucinous |
| `granulosa_a` | Adult granulosa cell |
| `granulosa_j` | Juvenile granulosa cell |
| `sertoli` | Sertoli–Leydig cell tumour |
| `sctat` | Sex cord tumour with annular tubules (SCTAT) |
| `sccoht` | Small cell carcinoma, hypercalcaemic type |
| `germ` | Germ cell tumour |
| `nos` | Epithelial, type unknown |

**`uterus` – Uterus (endometrium / myometrium)**

| Code | Meaning |
|---|---|
| `endometrioid` | Endometrioid |
| `serous` | Serous |
| `clearcell` | Clear cell |
| `carcinosarcoma` | Carcinosarcoma |
| `lms` | Leiomyosarcoma |
| `nos` | Other / unknown |

**`cervix` – Cervix**

| Code | Meaning |
|---|---|
| `gastric` | Gastric-type adenocarcinoma / adenoma malignum |
| `erms` | Embryonal rhabdomyosarcoma |
| `scc` | Squamous cell carcinoma |
| `adeno` | Adenocarcinoma (usual type) |
| `nos` | Other / unknown |

**`colorectal` – Colorectal**

| Code | Meaning |
|---|---|
| `adeno` | Adenocarcinoma |
| `mucinous` | Mucinous / signet ring |
| `nos` | Other / unknown |

**`smallbowel` – Small bowel / duodenum**

| Code | Meaning |
|---|---|
| `adeno` | Adenocarcinoma |
| `nos` | Other / unknown |

**`stomach` – Stomach**

| Code | Meaning |
|---|---|
| `diffuse` | Diffuse / signet ring cell |
| `intestinal` | Intestinal type |
| `nos` | Other / unknown |

**`oesophagus` – Oesophagus**

| Code | Meaning |
|---|---|
| `scc` | Squamous cell carcinoma |
| `adeno` | Adenocarcinoma |

**`pancreas` – Pancreas**

| Code | Meaning |
|---|---|
| `pdac` | Ductal adenocarcinoma |
| `pnet` | Neuroendocrine tumour |
| `acinar` | Acinar cell |
| `nos` | Other / unknown |

**`liver` – Liver**

| Code | Meaning |
|---|---|
| `hcc` | Hepatocellular carcinoma |
| `hepatoblastoma` | Hepatoblastoma |

**`biliary` – Biliary tract / gallbladder / ampulla**

| Code | Meaning |
|---|---|
| `cholangio` | Cholangiocarcinoma |
| `gallbladder` | Gallbladder carcinoma |
| `ampullary` | Ampullary carcinoma (ampulla of Vater) |

**`kidney` – Kidney**

| Code | Meaning |
|---|---|
| `ccrcc` | Clear cell RCC |
| `papillary1` | Papillary RCC (type 1 / classic) |
| `fhrcc` | FH-deficient / HLRCC RCC (type 2 papillary, tubulo-papillary) |
| `chromophobe` | Chromophobe / oncocytoma / hybrid oncocytic |
| `sdhrcc` | SDH-deficient RCC |
| `wilms` | Wilms tumour (nephroblastoma) |
| `rhabdoid` | Malignant rhabdoid tumour |
| `aml` | Angiomyolipoma |
| `cystic_nephroma` | Cystic nephroma |
| `nos` | Other / unknown |

**`urothelial` – Urothelial**

| Code | Meaning |
|---|---|
| `upper` | Upper tract (renal pelvis / ureter) |
| `bladder` | Bladder |

**`prostate` – Prostate**

| Code | Meaning |
|---|---|
| `adeno` | Adenocarcinoma |
| `highrisk` | Metastatic or high-grade (Gleason ≥8) |
| `ductal` | Intraductal / ductal |
| `nos` | Prostate cancer – type not known |

**`testis` – Testis**

| Code | Meaning |
|---|---|
| `gct` | Germ cell tumour |
| `lccsct` | Large cell calcifying Sertoli cell tumour |
| `nos` | Testicular cancer – type not known |

**`thyroid` – Thyroid**

| Code | Meaning |
|---|---|
| `medullary` | Medullary |
| `papillary` | Papillary |
| `cmv` | Cribriform-morular variant papillary |
| `follicular` | Follicular |
| `mng` | Multinodular goitre (benign) |
| `nos` | Thyroid cancer – type not known |

**`parathyroid` – Parathyroid**

| Code | Meaning |
|---|---|
| `adenoma` | Adenoma / primary hyperparathyroidism |
| `carcinoma` | Carcinoma |

**`pituitary` – Pituitary**

| Code | Meaning |
|---|---|
| `gh` | GH-secreting adenoma / gigantism |
| `other` | Other adenoma |
| `blastoma` | Pituitary blastoma |

**`adrenal` – Adrenal**

| Code | Meaning |
|---|---|
| `acc` | Adrenocortical carcinoma |
| `phaeo` | Phaeochromocytoma |

**`ppgl` – Paraganglioma**

| Code | Meaning |
|---|---|
| `hn` | Head and neck (incl. carotid body) |
| `ta` | Thoraco-abdominal / extra-adrenal sympathetic |

**`net` – Neuroendocrine (non-pancreatic)**

| Code | Meaning |
|---|---|
| `gastrinoma` | Duodenal gastrinoma |
| `lung` | Bronchial carcinoid |
| `thymic` | Thymic carcinoid |
| `gastric` | Gastric NET |
| `duodenal_som` | Duodenal / ampullary somatostatinoma |
| `nos` | Other / unknown |

**`cns` – Brain / CNS**

| Code | Meaning |
|---|---|
| `hgg` | High-grade glioma / glioblastoma |
| `lgg` | Low-grade glioma / pilocytic astrocytoma |
| `glioma_nos` | Glioma – grade not known |
| `optic` | Optic pathway glioma |
| `medullo_shh` | Medulloblastoma – SHH |
| `medullo_wnt` | Medulloblastoma – WNT |
| `medullo_g34` | Medulloblastoma – group 3/4 |
| `medullo_nos` | Medulloblastoma – subgroup not known |
| `cpc` | Choroid plexus carcinoma |
| `atrt` | Atypical teratoid / rhabdoid tumour |
| `meningioma` | Meningioma |
| `meningioma_cc` | Clear cell meningioma |
| `vs` | Vestibular schwannoma |
| `schwannoma` | Non-vestibular schwannoma |
| `ependymoma` | Ependymoma (spinal) |
| `hb` | Haemangioblastoma (CNS / retinal) |
| `sega` | Subependymal giant cell astrocytoma |
| `pineoblastoma` | Pineoblastoma |
| `germ` | Germ cell tumour (intracranial) |
| `cribriform` | Cribriform neuroepithelial tumour |
| `nos` | Brain tumour – type not known |

**`eye` – Eye**

| Code | Meaning |
|---|---|
| `rb` | Retinoblastoma |
| `uveal` | Uveal melanoma |

**`skin` – Skin**

| Code | Meaning |
|---|---|
| `melanoma` | Cutaneous melanoma |
| `bcc` | Basal cell carcinoma |
| `scc` | Squamous cell carcinoma |
| `sebaceous` | Sebaceous adenoma / carcinoma / keratoacanthoma |

**`meso` – Mesothelioma**

| Code | Meaning |
|---|---|
| `pleural` | Pleural |
| `peritoneal` | Peritoneal |

**`lung` – Lung**

| Code | Meaning |
|---|---|
| `adeno` | Adenocarcinoma |
| `nos` | Other / unknown |
| `ppb` | Pleuropulmonary blastoma |

**`sarcoma` – Sarcoma / soft tissue**

| Code | Meaning |
|---|---|
| `chondrosarcoma` | Chondrosarcoma |
| `mrt` | Extracranial malignant rhabdoid tumour (soft tissue / liver) |
| `rms` | Rhabdomyosarcoma |
| `osteo` | Osteosarcoma |
| `sts` | Other soft tissue sarcoma |
| `nos` | Sarcoma – type not known |
| `lms` | Leiomyosarcoma (non-uterine) |
| `mpnst` | Malignant peripheral nerve sheath tumour |
| `gist` | Gastrointestinal stromal tumour (GIST) |
| `desmoid` | Desmoid fibromatosis |
| `angiosarcoma` | Angiosarcoma |
| `chordoma` | Chordoma |

**`heme` – Haematological**

| Code | Meaning |
|---|---|
| `aml` | Acute myeloid leukaemia |
| `mds` | Myelodysplastic syndrome |
| `all` | Acute lymphoblastic leukaemia |
| `all_hypo` | Low-hypodiploid ALL |
| `jmml` | Juvenile myelomonocytic leukaemia |
| `lymphoma` | Lymphoma |
| `cll` | Chronic lymphocytic leukaemia |
| `leuk_nos` | Leukaemia – type not known |
| `other` | Other |

**`nb` – Neuroblastoma**

| Code | Meaning |
|---|---|
| `nb` | Neuroblastoma / ganglioneuroblastoma |

**`headneck` – Head and neck**

| Code | Meaning |
|---|---|
| `scc` | Squamous cell carcinoma |
| `nos` | Head and neck cancer – type not known |

**`polyps` – GI polyps**

| Code | Meaning |
|---|---|
| `adenoma` | Adenomas |
| `serrated` | Serrated / hyperplastic polyps |
| `sps` | Serrated polyposis (meets WHO criteria) |
| `pj` | Peutz–Jeghers polyps (confirmed on histology) |
| `juvenile` | Juvenile polyps |
| `ham_nos` | Hamartomatous polyps – type not known |
| `ganglioneuroma` | Ganglioneuromas |
| `mixed` | Mixed polyposis |
| `nos` | Polyps – type not known |

**`feature` – Other tumours & clinical features**

| Code | Meaning |
|---|---|
| `cardiac_fibroma` | Cardiac fibroma |
| `macrocephaly` | Macrocephaly |
| `cal` | Café-au-lait macules (≥6) |
| `neurofibromas` | Neurofibromas / axillary freckling |
| `pigment_pj` | Mucocutaneous pigmentation (lips / buccal) |
| `pigment_carney` | Spotty skin pigmentation / blue naevi |
| `fibrofolliculoma` | Fibrofolliculomas |
| `lungcysts` | Lung cysts / spontaneous pneumothorax |
| `cutleio` | Cutaneous leiomyomas |
| `fibroids` | Uterine fibroids – early / multiple |
| `trichilemmoma` | Trichilemmomas / oral papillomas / acral keratoses |
| `okc` | Odontogenic keratocysts |
| `palmarpits` | Palmar / plantar pits |
| `cardiac_myxoma` | Cardiac myxoma |
| `cardiac_rhabdo` | Cardiac rhabdomyoma |
| `jaw` | Ossifying fibroma of jaw |
| `chrpe` | CHRPE (multifocal / bilateral) |
| `overgrowth` | Overgrowth / hemihypertrophy / macroglossia |
| `elst` | Endolymphatic sac tumour |
| `epididymal` | Epididymal / broad ligament cystadenoma |
| `thrombocytopenia` | Familial thrombocytopenia / platelet dysfunction |
| `bmf` | Bone marrow failure / unexplained cytopenias |
| `fa_anom` | Radial ray anomalies / short stature (Fanconi-type) |
| `photosens` | Extreme sun sensitivity / childhood freckling |
| `tbd` | Nail dystrophy / oral leukoplakia / pulmonary fibrosis |
| `gata2` | Monocytopenia / mycobacterial infection / lymphoedema |
| `rasopathy` | Noonan / Costello features |
| `bimt` | BAP1-inactivated melanocytic tumours |
| `tsc_skin` | Facial angiofibromas / hypomelanotic macules / shagreen patch |
| `ppnad` | PPNAD / ACTH-independent Cushing |
| `at` | Ataxia / oculocutaneous telangiectasia |
| `microcephaly` | Microcephaly / growth deficiency |
| `poikiloderma` | Poikiloderma (Rothmund–Thomson) |
| `progeroid` | Premature ageing / early cataracts |
| `cchs` | Congenital central hypoventilation / Hirschsprung |
| `gu_anom` | Hypospadias / undescended testes / ambiguous genitalia / gonadoblastoma |
| `myofibroma` | Infantile myofibromatosis |
| `ifp` | Inflammatory fibroid polyps |
| `fibrous_dysplasia` | Polyostotic fibrous dysplasia / precocious puberty |
| `tylosis` | Palmoplantar keratoderma (tylosis) |
| `hht` | HHT features (telangiectasia / AVMs) |
| `pilomatrixoma` | Pilomatrixomas |
| `gapps` | Gastric fundic gland polyposis (GAPPS) |
| `osteomas` | Multiple osteomas / dental anomalies |
| `falx` | Falx calcification |
| `cleft` | Cleft lip / palate (self or FDR) |
| `lld` | Lhermitte–Duclos disease |
| `renal_cysts` | Multiple renal / pancreatic cysts |
| `enchondromas` | Multiple enchondromas (Ollier / Maffucci) |
| `dicer1_rare` | Childhood lung cysts / ciliary body medulloepithelioma / nasal chondromesenchymal hamartoma / gynandroblastoma |

### E. Tumour marker values

`""` (or leaving the field out) means not done / not known.

| Field | Values |
|---|---|
| `er` | `pos` Pos; `neg` Neg |
| `pr` | `pos` Pos; `neg` Neg |
| `her2` | `pos` Pos; `neg` Neg |
| `grade` | `1` 1 (low); `2` 2 (intermediate); `3` 3 (high) |
| `ovgrade` | `low` Low grade; `high` High grade (only for `endometrioid`, `nos`) |
| `mmr` | `intact` IHC intact; `mlh1` Loss MLH1 + PMS2; `msh2` Loss MSH2 + MSH6; `msh6` Loss MSH6 only; `pms2` Loss PMS2 only; `msi` MSI-high (no IHC); `mss` MSS (no IHC) |
| `meth` | `yes` Present; `no` Absent |
| `braf` | `yes` Present; `no` Absent |

<!-- codes:end -->
