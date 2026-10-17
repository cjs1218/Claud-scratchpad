/*
 * Knowledge base for the Cancer Family History Navigator.
 *
 * SITES      – tumour sites / findings, their histologies and which marker
 *              fields apply.
 * CONDITIONS – predisposition syndromes keyed to NICPR genes, with scoring
 *              rules. Rule format:
 *                [site, histology ('*' = any, 'a|b' = either), tier,
 *                 earlyAge (optional), condition (optional), maxAge (optional)]
 *              Tier: H = hallmark, S = strong, M = moderate, W = weak.
 *              mods: [site ('*' = any), condition, multiplier]
 * TESTS      – NHS National Genomic Test Directory entries from the Rare and
 *              Inherited Disease eligibility criteria v9.1 (Part XI and others).
 * NICPR      – genes on the NICPR list (Appendix 1, June 2026) with notes.
 */

const TIER = { H: 10, S: 6, M: 3, W: 1 };
const TIER_LABEL = { H: 'hallmark', S: 'strong', M: 'moderate', W: 'weak' };
/*
 * How each rule's strength is assigned (shown on the Sources tab and as hover text
 * on the strength labels). Two measures; a rule takes the higher of the two, but
 * hallmark always needs the first (or a defining feature present in most carriers).
 *  yield – of people with this tumour/feature (within the rule's histology, marker
 *          and age limits), the proportion with the syndrome
 *  risk  – the chance a carrier develops it (lifetime, or childhood for childhood tumours)
 */
const TIER_DEFS = {
  H: { yield: 'Pathognomonic or near-pathognomonic (about half or more have the syndrome), or a major diagnostic criterion rare outside it',
       risk: 'Not enough on its own – except a defining feature present in most carriers and uncommon otherwise (e.g. >100 adenomas in FAP, multiple café-au-lait macules in NF1)' },
  S: { yield: 'About 10–50% have the syndrome', risk: 'Lifetime risk about 20% or more, or relative risk about 10 or more' },
  M: { yield: 'About 2–10% have the syndrome', risk: 'Lifetime risk about 5–20%, or relative risk about 2–10' },
  W: { yield: 'Under about 2%, or unknown', risk: 'Lifetime risk under about 5%, relative risk under about 2, or reported only in case reports or small series' }
};
/*
 * Rough population frequency of each syndrome (affected genotype; biallelic for
 * recessive conditions). Used as a light weighting (FREQ_WEIGHT) so that, with
 * similar evidence, the commoner syndrome ranks higher, and to order exact ties.
 * 1: about 1 in 1,000 or commoner; 2: 1 in 1,000–10,000; 3: 1 in 10,000–100,000; 4: rarer.
 */
const FREQ_WEIGHT = { 1: 1, 2: 0.9, 3: 0.8, 4: 0.7 };
const FREQ_BAND = {
  brca1: 1, brca2: 1, palb2: 1, atm: 1, chek2: 1, bard1: 2, rad51d: 2, rad51c: 2,
  brip1: 1, lynch_mlh1: 1, lynch_msh2: 2, lynch_msh6: 1, lynch_pms2: 1, cmmrd: 4, fap: 2, map: 3,
  nthl1: 4, ppap: 3, mbd4: 4, jps_smad4: 3, jps_bmpr1a: 3, hmps: 4, rnf43: 3, pjs: 3,
  phts: 3, hdgc: 2, ctnna1: 4, tylosis: 4, lfs: 2, men1: 3, men4: 4, men2: 3,
  hptjt: 4, fipa: 3, carney: 4, mas: 3, vhl: 3, sdhb: 2, sdhd: 2, sdhc: 3,
  sdha: 1, sdhaf2: 4, tmem127: 3, max: 3, hlrcc: 2, bhd: 4, hprc: 4, tsc: 2,
  bap1: 3, cdkn2a: 2, cdk4: 4, pot1: 3, gorlin: 3, sufu: 4, xp: 3, nf1: 2,
  nf2: 3, smarcb1: 4, lztr1: 3, smarca4: 4, smarce1: 4, dgcr8: 4, jmjd1c: 4, elp1: 3,
  gpr161: 4, dicer1: 2, rb1: 3, wt1: 3, wilms_other: 4, perlman: 4, mulibrey: 4, mva: 4,
  bws: 2, sgbs: 4, sotos: 2, weaver: 4, alk: 4, phox2b: 3, noonan: 1, cbl: 4,
  costello: 3, kit: 4, pdgfra: 4, pdgfrb: 4, tbxt: 4, ollier: 3, fanconi: 3, fancm: 4,
  at: 3, nbs: 4, bloom: 4, rts: 4, werner: 4, cebpa: 4, runx1: 4, gata2: 4,
  ddx41: 1, etv6: 4, ankrd26: 4, samd9l: 4, pax5: 4, kdm3b: 4, tbd: 4
};

/*
 * Syndromes usually recognised by their non-cancer features (polyps, pigmentation,
 * skin, growth, bone marrow failure or other physical signs). For these, a common
 * adult cancer on its own is at most moderate (checked in tests/check-data.js);
 * a strong rule on one of these cancers needs an age limit of 40 or under.
 */
const NONCANCER_RECOGNISED = ['pjs', 'phts', 'jps_smad4', 'jps_bmpr1a', 'hmps', 'fap', 'map', 'nthl1', 'mbd4', 'gorlin', 'xp', 'tylosis',
  'nf1', 'nf2', 'tsc', 'bloom', 'fanconi', 'tbd', 'costello', 'noonan', 'cbl', 'bws', 'sotos', 'weaver', 'sgbs', 'mulibrey', 'perlman',
  'mva', 'rts', 'werner', 'at', 'nbs', 'carney', 'mas', 'ollier', 'kit', 'pdgfra', 'pdgfrb', 'men4', 'fipa'];
const COMMON_ADULT_CANCERS = { breast: '*', colorectal: '*', prostate: '*', lung: '*', pancreas: 'pdac|nos', stomach: '*', uterus: '*',
  urothelial: '*', skin: 'bcc|scc|melanoma', headneck: '*', oesophagus: '*', kidney: 'ccrcc|nos' };
const TIER_AUDIT = '13 Oct 2026'; // date all rules were last checked against TIER_DEFS

const MMR_MARKERS = ['mmr', 'meth', 'braf'];

const SITES = {
  breast: { label: 'Breast', markers: ['er', 'pr', 'her2', 'grade'], hist: [
    ['idc', 'Invasive ductal / no special type'], ['ilc', 'Invasive lobular'],
    ['medullary', 'Medullary-like / basal-like'], ['metaplastic', 'Metaplastic'],
    ['dcis', 'DCIS only'], ['phyllodes', 'Malignant phyllodes'], ['nos', 'Other / unknown']] },
  ovary: { label: 'Ovary / fallopian tube / peritoneum', markers: ['ovgrade'], hist: [
    ['fibroma', 'Ovarian fibroma / fibrothecoma'],
    ['hgsc', 'High-grade serous'], ['lgsc', 'Low-grade serous'], ['endometrioid', 'Endometrioid'],
    ['clearcell', 'Clear cell'], ['mucinous', 'Mucinous'], ['granulosa_a', 'Adult granulosa cell'],
    ['granulosa_j', 'Juvenile granulosa cell'], ['sertoli', 'Sertoli–Leydig cell tumour'],
    ['sctat', 'Sex cord tumour with annular tubules (SCTAT)'],
    ['sccoht', 'Small cell carcinoma, hypercalcaemic type'], ['germ', 'Germ cell tumour'],
    ['nos', 'Epithelial, type unknown']] },
  uterus: { label: 'Uterus (endometrium / myometrium)', markers: MMR_MARKERS, hist: [
    ['endometrioid', 'Endometrioid'], ['serous', 'Serous'], ['clearcell', 'Clear cell'],
    ['carcinosarcoma', 'Carcinosarcoma'], ['lms', 'Leiomyosarcoma'], ['nos', 'Other / unknown']] },
  cervix: { label: 'Cervix', hist: [
    ['gastric', 'Gastric-type adenocarcinoma / adenoma malignum'],
    ['erms', 'Embryonal rhabdomyosarcoma'], ['scc', 'Squamous cell carcinoma'],
    ['adeno', 'Adenocarcinoma (usual type)'], ['nos', 'Other / unknown']] },
  colorectal: { label: 'Colorectal', markers: MMR_MARKERS, hist: [
    ['adeno', 'Adenocarcinoma'], ['mucinous', 'Mucinous / signet ring'], ['nos', 'Other / unknown']] },
  smallbowel: { label: 'Small bowel / duodenum', markers: MMR_MARKERS, hist: [
    ['adeno', 'Adenocarcinoma'], ['nos', 'Other / unknown']] },
  stomach: { label: 'Stomach', markers: MMR_MARKERS, hist: [
    ['diffuse', 'Diffuse / signet ring cell'], ['intestinal', 'Intestinal type'], ['nos', 'Other / unknown']] },
  oesophagus: { label: 'Oesophagus', hist: [
    ['scc', 'Squamous cell carcinoma'], ['adeno', 'Adenocarcinoma']] },
  pancreas: { label: 'Pancreas', hist: [
    ['pdac', 'Ductal adenocarcinoma'], ['pnet', 'Neuroendocrine tumour'], ['acinar', 'Acinar cell'],
    ['nos', 'Other / unknown']] },
  liver: { label: 'Liver', hist: [
    ['hcc', 'Hepatocellular carcinoma'], ['hepatoblastoma', 'Hepatoblastoma']] },
  biliary: { label: 'Biliary tract / gallbladder', markers: MMR_MARKERS, hist: [
    ['cholangio', 'Cholangiocarcinoma'], ['gallbladder', 'Gallbladder carcinoma']] },
  kidney: { label: 'Kidney', hist: [
    ['ccrcc', 'Clear cell RCC'], ['papillary1', 'Papillary RCC (type 1 / classic)'],
    ['fhrcc', 'FH-deficient / HLRCC RCC (type 2 papillary, tubulo-papillary)'],
    ['chromophobe', 'Chromophobe / oncocytoma / hybrid oncocytic'], ['sdhrcc', 'SDH-deficient RCC'],
    ['wilms', 'Wilms tumour (nephroblastoma)'], ['rhabdoid', 'Malignant rhabdoid tumour'],
    ['aml', 'Angiomyolipoma'], ['cystic_nephroma', 'Cystic nephroma'], ['nos', 'Other / unknown']] },
  urothelial: { label: 'Urothelial', markers: MMR_MARKERS, hist: [
    ['upper', 'Upper tract (renal pelvis / ureter)'], ['bladder', 'Bladder']] },
  prostate: { label: 'Prostate', hist: [
    ['adeno', 'Adenocarcinoma'], ['highrisk', 'Metastatic or high-grade (Gleason ≥8)'],
    ['ductal', 'Intraductal / ductal']] },
  testis: { label: 'Testis', hist: [
    ['gct', 'Germ cell tumour'], ['lccsct', 'Large cell calcifying Sertoli cell tumour']] },
  thyroid: { label: 'Thyroid', hist: [
    ['medullary', 'Medullary'], ['papillary', 'Papillary'],
    ['cmv', 'Cribriform-morular variant papillary'], ['follicular', 'Follicular'],
    ['mng', 'Multinodular goitre (benign)']] },
  parathyroid: { label: 'Parathyroid', hist: [
    ['adenoma', 'Adenoma / primary hyperparathyroidism'], ['carcinoma', 'Carcinoma']] },
  pituitary: { label: 'Pituitary', hist: [
    ['gh', 'GH-secreting adenoma / gigantism'], ['other', 'Other adenoma'], ['blastoma', 'Pituitary blastoma']] },
  adrenal: { label: 'Adrenal', hist: [
    ['acc', 'Adrenocortical carcinoma'], ['phaeo', 'Phaeochromocytoma']] },
  ppgl: { label: 'Paraganglioma', hist: [
    ['hn', 'Head and neck (incl. carotid body)'], ['ta', 'Thoraco-abdominal / extra-adrenal sympathetic']] },
  net: { label: 'Neuroendocrine (non-pancreatic)', hist: [
    ['gastrinoma', 'Duodenal gastrinoma'], ['lung', 'Bronchial carcinoid'], ['thymic', 'Thymic carcinoid'],
    ['gastric', 'Gastric NET'], ['duodenal_som', 'Duodenal / ampullary somatostatinoma'],
    ['nos', 'Other / unknown']] },
  cns: { label: 'Brain / CNS', hist: [
    ['hgg', 'High-grade glioma / glioblastoma'], ['lgg', 'Low-grade glioma / pilocytic astrocytoma'],
    ['optic', 'Optic pathway glioma'], ['medullo_shh', 'Medulloblastoma – SHH'],
    ['medullo_wnt', 'Medulloblastoma – WNT'], ['medullo_nos', 'Medulloblastoma – group 3/4 / unknown'],
    ['cpc', 'Choroid plexus carcinoma'], ['atrt', 'Atypical teratoid / rhabdoid tumour'],
    ['meningioma', 'Meningioma'], ['meningioma_cc', 'Clear cell meningioma'],
    ['vs', 'Vestibular schwannoma'], ['schwannoma', 'Non-vestibular schwannoma'],
    ['ependymoma', 'Ependymoma (spinal)'], ['hb', 'Haemangioblastoma (CNS / retinal)'],
    ['sega', 'Subependymal giant cell astrocytoma'], ['pineoblastoma', 'Pineoblastoma'],
    ['germ', 'Germ cell tumour (intracranial)'], ['cribriform', 'Cribriform neuroepithelial tumour']] },
  eye: { label: 'Eye', hist: [['rb', 'Retinoblastoma'], ['uveal', 'Uveal melanoma']] },
  skin: { label: 'Skin', markers: MMR_MARKERS, hist: [
    ['melanoma', 'Cutaneous melanoma'], ['bcc', 'Basal cell carcinoma'],
    ['scc', 'Squamous cell carcinoma'], ['sebaceous', 'Sebaceous adenoma / carcinoma / keratoacanthoma']] },
  meso: { label: 'Mesothelioma', hist: [['pleural', 'Pleural'], ['peritoneal', 'Peritoneal']] },
  lung: { label: 'Lung', hist: [
    ['adeno', 'Adenocarcinoma'], ['nos', 'Other / unknown'], ['ppb', 'Pleuropulmonary blastoma']] },
  sarcoma: { label: 'Sarcoma / soft tissue', hist: [
    ['chondrosarcoma', 'Chondrosarcoma'],
    ['mrt', 'Extracranial malignant rhabdoid tumour (soft tissue / liver)'],
    ['rms', 'Rhabdomyosarcoma'], ['osteo', 'Osteosarcoma'], ['sts', 'Other soft tissue sarcoma'],
    ['lms', 'Leiomyosarcoma (non-uterine)'], ['mpnst', 'Malignant peripheral nerve sheath tumour'],
    ['gist', 'Gastrointestinal stromal tumour (GIST)'], ['desmoid', 'Desmoid fibromatosis'],
    ['angiosarcoma', 'Angiosarcoma'], ['chordoma', 'Chordoma']] },
  heme: { label: 'Haematological', hist: [
    ['aml', 'Acute myeloid leukaemia'], ['mds', 'Myelodysplastic syndrome'],
    ['all', 'Acute lymphoblastic leukaemia'], ['all_hypo', 'Low-hypodiploid ALL'],
    ['jmml', 'Juvenile myelomonocytic leukaemia'], ['lymphoma', 'Lymphoma'],
    ['cll', 'Chronic lymphocytic leukaemia'], ['other', 'Other']] },
  nb: { label: 'Neuroblastoma', hist: [['nb', 'Neuroblastoma / ganglioneuroblastoma']] },
  headneck: { label: 'Head and neck', hist: [['scc', 'Squamous cell carcinoma']] },
  polyps: { label: 'GI polyps', markers: ['count'], hist: [
    ['adenoma', 'Adenomas'], ['pj', 'Peutz–Jeghers polyps'], ['juvenile', 'Juvenile polyps'],
    ['serrated', 'Serrated / hyperplastic polyps'], ['sps', 'Serrated polyposis (meets WHO criteria)'], ['mixed', 'Mixed polyposis'],
    ['ganglioneuroma', 'Ganglioneuromas / mixed hamartomatous']] },
  feature: { label: 'Other tumours & clinical features', hist: [
    ['cardiac_fibroma', 'Cardiac fibroma'],
    ['macrocephaly', 'Macrocephaly'], ['cal', 'Café-au-lait macules (≥6)'],
    ['neurofibromas', 'Neurofibromas / axillary freckling'],
    ['pigment_pj', 'Mucocutaneous pigmentation (lips / buccal)'],
    ['pigment_carney', 'Spotty skin pigmentation / blue naevi'],
    ['fibrofolliculoma', 'Fibrofolliculomas'], ['lungcysts', 'Lung cysts / spontaneous pneumothorax'],
    ['cutleio', 'Cutaneous leiomyomas'], ['fibroids', 'Uterine fibroids – early / multiple'],
    ['trichilemmoma', 'Trichilemmomas / oral papillomas / acral keratoses'],
    ['okc', 'Odontogenic keratocysts'], ['palmarpits', 'Palmar / plantar pits'],
    ['cardiac_myxoma', 'Cardiac myxoma'], ['cardiac_rhabdo', 'Cardiac rhabdomyoma'],
    ['jaw', 'Ossifying fibroma of jaw'], ['chrpe', 'CHRPE (multifocal / bilateral)'],
    ['overgrowth', 'Overgrowth / hemihypertrophy / macroglossia'],
    ['elst', 'Endolymphatic sac tumour'], ['epididymal', 'Epididymal / broad ligament cystadenoma'],
    ['thrombocytopenia', 'Familial thrombocytopenia / platelet dysfunction'],
    ['bmf', 'Bone marrow failure / unexplained cytopenias'],
    ['fa_anom', 'Radial ray anomalies / short stature (Fanconi-type)'],
    ['photosens', 'Extreme sun sensitivity / childhood freckling'],
    ['tbd', 'Nail dystrophy / oral leukoplakia / pulmonary fibrosis'],
    ['gata2', 'Monocytopenia / mycobacterial infection / lymphoedema'],
    ['rasopathy', 'Noonan / Costello features'], ['bimt', 'BAP1-inactivated melanocytic tumours'],
    ['tsc_skin', 'Facial angiofibromas / hypomelanotic macules / shagreen patch'],
    ['ppnad', 'PPNAD / ACTH-independent Cushing'], ['at', 'Ataxia / oculocutaneous telangiectasia'],
    ['microcephaly', 'Microcephaly / growth deficiency'], ['poikiloderma', 'Poikiloderma (Rothmund–Thomson)'],
    ['progeroid', 'Premature ageing / early cataracts'],
    ['cchs', 'Congenital central hypoventilation / Hirschsprung'],
    ['gu_anom', 'Hypospadias / undescended testes / ambiguous genitalia / gonadoblastoma'],
    ['myofibroma', 'Infantile myofibromatosis'], ['ifp', 'Inflammatory fibroid polyps'],
    ['fibrous_dysplasia', 'Polyostotic fibrous dysplasia / precocious puberty'],
    ['tylosis', 'Palmoplantar keratoderma (tylosis)'], ['hht', 'HHT features (telangiectasia / AVMs)'],
    ['pilomatrixoma', 'Pilomatrixomas'], ['gapps', 'Gastric fundic gland polyposis (GAPPS)'],
    ['osteomas', 'Multiple osteomas / dental anomalies'], ['falx', 'Falx calcification'],
    ['cleft', 'Cleft lip / palate (self or FDR)'], ['lld', 'Lhermitte–Duclos disease'],
    ['renal_cysts', 'Multiple renal / pancreatic cysts'], ['enchondromas', 'Multiple enchondromas (Ollier / Maffucci)'],
    ['dicer1_rare', 'Childhood lung cysts / ciliary body medulloepithelioma / nasal chondromesenchymal hamartoma / gynandroblastoma']] }
};

const MARKER_OPTIONS = {
  er: { label: 'ER', opts: [['', 'Unknown'], ['pos', 'Pos'], ['neg', 'Neg']] },
  pr: { label: 'PR', opts: [['', 'Unknown'], ['pos', 'Pos'], ['neg', 'Neg']] },
  her2: { label: 'HER2', opts: [['', 'Unknown'], ['pos', 'Pos'], ['neg', 'Neg']] },
  grade: { label: 'Grade', opts: [['', 'Unknown'], ['1', '1 (low)'], ['2', '2 (intermediate)'], ['3', '3 (high)']] },
  ovgrade: { label: 'Grade', opts: [['', 'Unknown'], ['low', 'Low grade'], ['high', 'High grade']] },
  // Ovarian grade is asked only where the histology does not already give it (endometrioid, epithelial type unknown).
  mmr: { label: 'MMR / MSI', opts: [['', 'Not done'], ['intact', 'IHC intact'],
    ['mlh1', 'Loss MLH1 + PMS2'], ['msh2', 'Loss MSH2 + MSH6'], ['msh6', 'Loss MSH6 only'],
    ['pms2', 'Loss PMS2 only'], ['msi', 'MSI-high (no IHC)'], ['mss', 'MSS (no IHC)']] },
  meth: { label: 'MLH1 methylation', opts: [['', 'Not done'], ['yes', 'Present'], ['no', 'Absent']] },
  braf: { label: 'BRAF V600E', opts: [['', 'Not done'], ['yes', 'Present'], ['no', 'Absent']] }
};

/*
 * Side and number. Paired organs get a "Side" choice (both sides asks the age of the second cancer);
 * tumours that criteria count get a "Number" box. [histologies ('*' = any), side options].
 */
const LATERALITY = {
  breast: ['*', ['one', 'both', 'multi']],
  kidney: ['*', ['one', 'both', 'multi']],
  adrenal: ['*', ['one', 'both']],
  ovary: ['*', ['one', 'both']],
  eye: ['*', ['one', 'both', 'multi']],
  nb: ['*', ['one', 'both', 'multi']],
  cns: ['vs', ['one', 'both']],
  feature: ['chrpe', ['one', 'both', 'multi']],
  parathyroid: ['adenoma', ['one', 'multi']]
};
const SIDE_LABELS = {
  default: { '': 'Unknown', one: 'One side', both: 'Both sides', multi: 'Multifocal (one side)' },
  parathyroid: { '': 'Unknown', one: 'Single gland', multi: 'Multiglandular' },
  nb: { '': 'Unknown', one: 'Single', both: 'Bilateral', multi: 'Multiple' },
  eye: { '': 'Unknown', one: 'One eye', both: 'Both eyes', multi: 'Multifocal (one eye)' }
};
const COUNTED = { skin: '*', sarcoma: '*', feature: 'bimt|cutleio|pilomatrixoma', cns: 'schwannoma|meningioma|meningioma_cc' };
const sideOptions = d => { const l = LATERALITY[d.site]; return l && (l[0] === '*' || l[0].split('|').includes(d.hist)) ? l[1] : null; };
const MARKER_HISTS = { ovgrade: ['endometrioid', 'nos'] };
const showMarker = (m, d) => !MARKER_HISTS[m] || MARKER_HISTS[m].includes(d.hist);
const isCounted = d => !!COUNTED[d.site] && (COUNTED[d.site] === '*' || COUNTED[d.site].split('|').includes(d.hist));

/*
 * Abbreviations used in cancer sites, histologies, markers and conditions. Wherever they appear on screen
 * they can be clicked (or tapped / Enter) to show the full term.
 */
const ABBREVIATIONS = {
  DCIS: 'ductal carcinoma in situ', SCTAT: 'sex cord tumour with annular tubules', RCC: 'renal cell carcinoma',
  HLRCC: 'hereditary leiomyomatosis and renal cell cancer', FH: 'fumarate hydratase', SDH: 'succinate dehydrogenase',
  GH: 'growth hormone', NET: 'neuroendocrine tumour', CNS: 'central nervous system',
  SHH: 'sonic hedgehog (molecular subgroup)', WNT: 'wingless / WNT pathway (molecular subgroup)',
  GIST: 'gastrointestinal stromal tumour', ALL: 'acute lymphoblastic leukaemia', GI: 'gastrointestinal',
  CHRPE: 'congenital hypertrophy of the retinal pigment epithelium', BAP1: 'BRCA1-associated protein 1',
  PPNAD: 'primary pigmented nodular adrenocortical disease', ACTH: 'adrenocorticotropic hormone',
  HHT: 'hereditary haemorrhagic telangiectasia', AVMs: 'arteriovenous malformations',
  GAPPS: 'gastric adenocarcinoma and proximal polyposis of the stomach', FDR: 'first-degree relative',
  ER: 'oestrogen receptor', PR: 'progesterone receptor', HER2: 'human epidermal growth factor receptor 2',
  MMR: 'mismatch repair', MSI: 'microsatellite instability', MSS: 'microsatellite stable', IHC: 'immunohistochemistry',
  // Tumour types
  HGSC: 'high-grade serous carcinoma', LGSC: 'low-grade serous carcinoma', IDC: 'invasive ductal carcinoma', ILC: 'invasive lobular carcinoma',
  TNBC: 'triple-negative breast cancer', CRC: 'colorectal cancer', EC: 'endometrial cancer', EOC: 'epithelial ovarian cancer',
  STIC: 'serous tubal intraepithelial carcinoma', DGC: 'diffuse gastric cancer', LBC: 'lobular breast cancer',
  MPNST: 'malignant peripheral nerve sheath tumour', AML: 'acute myeloid leukaemia', MDS: 'myelodysplastic syndrome',
  CLL: 'chronic lymphocytic leukaemia', JMML: 'juvenile myelomonocytic leukaemia', 'B-ALL': 'B-cell acute lymphoblastic leukaemia',
  'T-ALL': 'T-cell acute lymphoblastic leukaemia', 'AT/RT': 'atypical teratoid / rhabdoid tumour', ATRT: 'atypical teratoid / rhabdoid tumour',
  SCCOHT: 'small cell carcinoma of the ovary, hypercalcaemic type', PPB: 'pleuropulmonary blastoma', MTC: 'medullary thyroid carcinoma',
  PTC: 'papillary thyroid carcinoma', DTC: 'differentiated thyroid cancer', MNG: 'multinodular goitre',
  PPGL: 'phaeochromocytoma and paraganglioma', PGL: 'paraganglioma', HNPGL: 'head and neck paraganglioma',
  ACC: 'adrenocortical carcinoma', BCC: 'basal cell carcinoma', SCC: 'squamous cell carcinoma', HNSCC: 'head and neck squamous cell carcinoma',
  RMS: 'rhabdomyosarcoma', ERMS: 'embryonal rhabdomyosarcoma', SEGA: 'subependymal giant cell astrocytoma', LGG: 'low-grade glioma',
  HB: 'haemangioblastoma', ELST: 'endolymphatic sac tumour', TCC: 'transitional cell carcinoma', SLCT: 'Sertoli–Leydig cell tumour',
  LCCSCT: 'large cell calcifying Sertoli cell tumour', BIMT: 'BAP1-inactivated melanocytic tumour', 'SHH-MB': 'sonic hedgehog medulloblastoma',
  PHPT: 'primary hyperparathyroidism', HPT: 'hyperparathyroidism', LAM: 'lymphangioleiomyomatosis', ILD: 'interstitial lung disease',
  BMF: 'bone marrow failure', AVM: 'arteriovenous malformation', VS: 'vestibular schwannoma',
  // Syndromes
  LFS: 'Li–Fraumeni syndrome', FAP: 'familial adenomatous polyposis', AFAP: 'attenuated familial adenomatous polyposis',
  MAP: 'MUTYH-associated polyposis', PJS: 'Peutz–Jeghers syndrome', JPS: 'juvenile polyposis syndrome', 'JP-HHT': 'juvenile polyposis – hereditary haemorrhagic telangiectasia overlap',
  HMPS: 'hereditary mixed polyposis syndrome', SPS: 'serrated polyposis syndrome', PPAP: 'polymerase proofreading-associated polyposis',
  CMMRD: 'constitutional mismatch repair deficiency', LS: 'Lynch syndrome', HBOC: 'hereditary breast and ovarian cancer',
  HDGC: 'hereditary diffuse gastric cancer', VHL: 'von Hippel–Lindau disease', MEN: 'multiple endocrine neoplasia',
  MEN2: 'multiple endocrine neoplasia type 2', MEN2A: 'multiple endocrine neoplasia type 2A', MEN2B: 'multiple endocrine neoplasia type 2B',
  MEN4: 'multiple endocrine neoplasia type 4', TSC: 'tuberous sclerosis complex', PHTS: 'PTEN hamartoma tumour syndrome',
  NBCCS: 'naevoid basal cell carcinoma (Gorlin) syndrome', BWS: 'Beckwith–Wiedemann syndrome', BHD: 'Birt–Hogg–Dubé syndrome',
  FIPA: 'familial isolated pituitary adenoma', RTPS: 'rhabdoid tumour predisposition syndrome', 'A-T': 'ataxia telangiectasia',
  NBS: 'Nijmegen breakage syndrome', XP: 'xeroderma pigmentosum', FA: 'Fanconi anaemia', TBD: 'telomere biology disorder',
  RTS: 'Rothmund–Thomson syndrome', MVA: 'mosaic variegated aneuploidy', CCHS: 'congenital central hypoventilation syndrome',
  HPRC: 'hereditary papillary renal cancer', MIRAGE: 'myelodysplasia, infection, restriction of growth, adrenal hypoplasia, genital phenotypes and enteropathy',
  // Clinical and genetic terms
  AD: 'autosomal dominant', AR: 'autosomal recessive', MRI: 'magnetic resonance imaging', CT: 'computed tomography',
  OGD: 'oesophagogastroduodenoscopy', EUS: 'endoscopic ultrasound', PSA: 'prostate-specific antigen', AFP: 'alpha-fetoprotein',
  PTH: 'parathyroid hormone', 'IGF-1': 'insulin-like growth factor 1', HRT: 'hormone replacement therapy', BSO: 'bilateral salpingo-oophorectomy',
  RRSO: 'risk-reducing salpingo-oophorectomy', HSCT: 'haematopoietic stem cell transplant', RR: 'relative risk', SIR: 'standardised incidence ratio',
  CI: 'confidence interval', 'O/E': 'observed / expected', PTV: 'protein-truncating variant', PV: 'pathogenic variant',
  GPV: 'germline pathogenic variant', VAF: 'variant allele fraction', LOF: 'loss of function', LOH: 'loss of heterozygosity',
  LOM: 'loss of methylation', UPD: 'uniparental disomy', HRD: 'homologous recombination deficiency', MLPA: 'multiplex ligation-dependent probe amplification',
  WGS: 'whole genome sequencing', WES: 'whole exome sequencing', UTR: 'untranslated region', DNA: 'deoxyribonucleic acid',
  FDR: 'first-degree relative', SDR: 'second-degree relative', MDT: 'multidisciplinary team meeting', UV: 'ultraviolet',
  NICPR: 'National Inherited Cancer Predisposition Register', UKCGG: 'UK Cancer Genetics Group', CanVIG: 'Cancer Variant Interpretation Group',
  NICE: 'National Institute for Health and Care Excellence', BSG: 'British Society of Gastroenterology', ACPGBI: 'Association of Coloproctology of Great Britain and Ireland',
  NHSBSP: 'NHS Breast Screening Programme', NDRS: 'National Disease Registration Service', ERN: 'European Reference Network',
  GENTURIS: 'genetic tumour risk syndromes (European Reference Network)', EHTG: 'European Hereditary Tumour Group', ESCP: 'European Society of Coloproctology',
  ESMO: 'European Society for Medical Oncology', SIOPE: 'European Society for Paediatric Oncology', ESGE: 'European Society of Gastrointestinal Endoscopy',
  ESE: 'European Society of Endocrinology', NCCN: 'National Comprehensive Cancer Network (US)', ACMG: 'American College of Medical Genetics and Genomics',
  ACG: 'American College of Gastroenterology', USMSTF: 'US Multi-Society Task Force on Colorectal Cancer', ATA: 'American Thyroid Association',
  AACR: 'American Association for Cancer Research', NCI: 'National Cancer Institute (US)', WHO: 'World Health Organization',
  OMIM: 'Online Mendelian Inheritance in Man', PLSD: 'Prospective Lynch Syndrome Database', BCAC: 'Breast Cancer Association Consortium',
  CIMBA: 'Consortium of Investigators of Modifiers of BRCA1/2', IGCLC: 'International Gastric Cancer Linkage Consortium',
  // Further terms found in the page text
  LCIS: 'lobular carcinoma in situ', HLBC: 'hereditary lobular breast cancer', PDAC: 'pancreatic ductal adenocarcinoma',
  IPMN: 'intraductal papillary mucinous neoplasm', NMSC: 'non-melanoma skin cancer', OSCC: 'oral squamous cell carcinoma',
  STS: 'soft tissue sarcoma', MRT: 'malignant rhabdoid tumour', NB: 'neuroblastoma', WT: 'Wilms tumour', PHEO: 'phaeochromocytoma',
  NHL: 'non-Hodgkin lymphoma', CML: 'chronic myeloid leukaemia', MPD: 'myeloproliferative disorder', ZES: 'Zollinger–Ellison syndrome',
  LDD: 'Lhermitte–Duclos disease', SEN: 'subependymal nodules', PSP: 'primary spontaneous pneumothorax', FD: 'fibrous dysplasia',
  GU: 'genitourinary', DSD: 'difference in sex development', SRNS: 'steroid-resistant nephrotic syndrome', DMS: 'diffuse mesangial sclerosis',
  HNPCC: 'hereditary non-polyposis colorectal cancer (older term for Lynch syndrome)', FMTC: 'familial medullary thyroid carcinoma',
  FIHP: 'familial isolated hyperparathyroidism', CNC: 'Carney complex', MAS: 'McCune–Albright syndrome', NS: 'Noonan syndrome',
  DC: 'dyskeratosis congenita', SGBS: 'Simpson–Golabi–Behmel syndrome', WAGR: 'Wilms tumour, aniridia, genitourinary anomalies, range of developmental delays',
  GOM: 'gain of methylation', IC1: 'imprinting centre 1', IC2: 'imprinting centre 2', UPD11: 'uniparental disomy of chromosome 11',
  XL: 'X-linked', VUS: 'variant of uncertain significance', NMD: 'nonsense-mediated decay', MAF: 'minor allele frequency',
  CHIP: 'clonal haematopoiesis of indeterminate potential', PCR: 'polymerase chain reaction', HR: 'hormone receptor',
  PARP: 'poly(ADP-ribose) polymerase', MRCP: 'magnetic resonance cholangiopancreatography', CEA: 'carcinoembryonic antigen',
  TSH: 'thyroid-stimulating hormone', GFR: 'glomerular filtration rate', SDS: 'standard deviation score', ENT: 'ear, nose and throat',
  GP: 'general practitioner', VHR: 'very high risk (NHS Breast Screening Programme)', ADHD: 'attention deficit hyperactivity disorder',
  ASD: 'autism spectrum disorder', HVA: 'homovanillic acid', VMA: 'vanillylmandelic acid', BC: 'breast cancer'
};

/* Predicates used by rules and modifiers. */
const PRED = {
  tnbc: d => d.er === 'neg' && d.pr === 'neg' && d.her2 === 'neg',
  erpos: d => d.er === 'pos',
  her2pos: d => d.her2 === 'pos',
  male: (d, p) => p.sex === 'M',
  age3plus: d => d.age !== '' && +d.age >= 3,
  mlh1_unexpl: d => d.mmr === 'mlh1' && d.meth !== 'yes' && d.braf !== 'yes',
  mlh1_sporadic: d => d.mmr === 'mlh1' && (d.meth === 'yes' || d.braf === 'yes'),
  mlh1_any: d => d.mmr === 'mlh1',
  msh2: d => d.mmr === 'msh2',
  msh6: d => d.mmr === 'msh6',
  pms2: d => d.mmr === 'pms2',
  msi: d => d.mmr === 'msi',
  mmr_prof: d => d.mmr === 'intact' || d.mmr === 'mss',
  mmr_def: d => ['msh2', 'msh6', 'pms2', 'msi'].includes(d.mmr) || PRED.mlh1_unexpl(d),
  n5: d => +d.count >= 5,
  n10: d => +d.count >= 10,
  n20: d => +d.count >= 20,
  n100: d => +d.count >= 100
};

const PRED_LABEL = {
  tnbc: 'triple negative', erpos: 'ER+', her2pos: 'HER2+', male: 'male', age3plus: 'age 3 or over',
  mlh1_unexpl: 'MLH1/PMS2 loss, unmethylated', mlh1_sporadic: 'MLH1 loss explained by methylation/BRAF',
  mlh1_any: 'MLH1/PMS2 loss', msh2: 'MSH2/MSH6 loss', msh6: 'isolated MSH6 loss', pms2: 'isolated PMS2 loss',
  msi: 'MSI-high', mmr_prof: 'MMR proficient', mmr_def: 'MMR deficient',
  n5: '≥5 polyps', n10: '≥10 polyps', n20: '≥20 polyps', n100: '≥100 polyps'
};

/* Standard modifier sets for the Lynch genes. */
const LYNCH_MODS = {
  MLH1: [['*', 'mlh1_unexpl', 2.2], ['*', 'mlh1_sporadic', 0.2], ['*', 'msh2', 0.05], ['*', 'msh6', 0.05],
    ['*', 'pms2', 0.5], ['*', 'msi', 1.5], ['*', 'mmr_prof', 0.15]],
  MSH2: [['*', 'msh2', 2.5], ['*', 'msh6', 0.6], ['*', 'mlh1_any', 0.05], ['*', 'pms2', 0.05],
    ['*', 'msi', 1.5], ['*', 'mmr_prof', 0.15]],
  MSH6: [['*', 'msh6', 2.5], ['*', 'msh2', 0.5], ['*', 'mlh1_any', 0.05], ['*', 'pms2', 0.05],
    ['*', 'msi', 1.3], ['*', 'mmr_prof', 0.25]],
  PMS2: [['*', 'pms2', 2.5], ['*', 'mlh1_unexpl', 0.3], ['*', 'mlh1_sporadic', 0.05], ['*', 'msh2', 0.05],
    ['*', 'msh6', 0.05], ['*', 'msi', 1.3], ['*', 'mmr_prof', 0.2]]
};


const CONDITIONS = [
  /* ---------- Breast / ovarian ---------- */
  { id: 'brca1', name: 'Hereditary breast and ovarian cancer (BRCA1)', genes: ['BRCA1'], inh: 'AD',
    tests: ['R208','R207','R444','R367','R430'],
    rules: [
      ['breast', '*', 'S', 60, 'tnbc', null, ['ukcgg:brca1', 'gr:NBK1247', 'dorling2021'], 'BRCA1 tumours mostly triple negative; PTV OR higher for ER-negative disease (BCAC)'],
      ['breast', 'medullary|metaplastic', 'S', 50, null, null, ['gr:NBK1247'], 'Excess of medullary histology; overlaps basal-like (GeneReviews)'],
      ['ovary', 'hgsc', 'S', 60, null, null, ['ukcgg:brca1', 'kuchenbaecker2017', 'gr:NBK1247', 'nccn_bop2021'], 'Tubo-ovarian ~44% by 80; 8% by 50, 20% by 60 (UKCGG/Kuchenbaecker 2017)'],
      ['breast', '*', 'S', 45, null, null, ['ukcgg:brca1', 'kuchenbaecker2017', 'hu2021', 'gr:NBK1247', 'nccn_bop2021'], 'Female breast ~72% by 80; 24% by 40, 43% by 50 (UKCGG/Kuchenbaecker 2017); OR 7.62 (CARRIERS)'],
      ['ovary', 'endometrioid|clearcell|nos', 'M', null, null, null, ['ukcgg:brca1', 'gr:NBK1247'], 'Tubo-ovarian ~44% by 80, predominantly high-grade serous'],
      ['breast', '*', 'M', 60, 'male', null, ['ukcgg:brca1', 'li2022', 'gr:NBK1247'], 'Male breast 0.4% by 80; RR 4.30 (Li 2022)'],
      ['pancreas', 'pdac', 'M', 60, null, null, ['ukcgg:brca1', 'li2022', 'gr:NBK1247', 'nccn_bop2021', 'us:acg_gi'], 'Pancreatic: male ~3% by 80, female similar to population (UKCGG); RR 2.36, ~2.5% by 80 (Li 2022)'],
      ['ovary', 'lgsc', 'W', null, null, null, ['gr:NBK1247']],
      ['prostate', '*', 'W', null, null, null, ['ukcgg:brca1', 'li2022', 'nccn_bop2021'], '17% by 85 (Nyberg 2020) vs no significant association (Li 2022), per UKCGG']
    ],
    mods: [['breast', 'erpos', 0.5], ['breast', 'her2pos', 0.5]] },
  { id: 'brca2', name: 'Hereditary breast and ovarian cancer (BRCA2)', genes: ['BRCA2'], inh: 'AD',
    tests: ['R208','R207','R430','R444','R367'],
    rules: [
      ['breast', '*', 'S', null, 'male', null, ['ukcgg:brca2', 'li2022', 'gr:NBK1247'], 'Male breast ~4% by 80 (UKCGG); RR 44.0 (Li 2022)'],
      ['ovary', 'hgsc', 'S', 60, null, null, ['ukcgg:brca2', 'kuchenbaecker2017', 'gr:NBK1247', 'nccn_bop2021'], 'Tubo-ovarian ~17% by 80 (likely underestimate >70); <0.5% by 40, 1-2% by 50 (UKCGG)'],
      ['breast', '*', 'S', 45, null, null, ['ukcgg:brca2', 'kuchenbaecker2017', 'hu2021', 'gr:NBK1247', 'nccn_bop2021'], 'Female breast ~69% by 80; 13% by 40, 35% by 50 (UKCGG/Kuchenbaecker 2017); OR 5.23 (CARRIERS)'],
      ['pancreas', 'pdac', 'M', 60, null, null, ['ukcgg:brca2', 'li2022', 'gr:NBK1247', 'nccn_bop2021', 'us:acg_gi'], 'Pancreatic: male ~4-5%, female ~2% by 80 (UKCGG); RR 3.34 overall, 4.92 below 65 (Li 2022)'],
      ['prostate', 'adeno|ductal', 'S', 60, null, null, ['ukcgg:brca2', 'li2022', 'gr:NBK1247', 'nccn_bop2021'], 'Prostate 27% by 80 (Li 2022); 41% by 85 screening-adjusted (Nyberg 2020) [UKCGG]; RR 3.10 below 65'],
      ['prostate', 'highrisk', 'S', 65, null, null, ['gr:NBK1247', 'ukcgg:brca2', 'li2022'], 'BRCA2 prostate cancer more often high grade/stage; annual PSA from 40 (UKCGG)'],
      ['ovary', 'endometrioid|clearcell|nos', 'M', null, null, null, ['ukcgg:brca2', 'gr:NBK1247'], 'Tubo-ovarian ~17% by 80, predominantly high-grade serous'],
      ['cns', 'medullo_shh|medullo_nos', 'W', null, null, null, ['waszak2018', 'clingen:BRCA2', 'us:aacr_brain'], 'BRCA2 a consensus medulloblastoma predisposition gene (rare); biallelic = Fanconi anaemia D1'],
      ['stomach', '*', 'W', null, null, null, ['li2022'], 'Stomach RR 3.69 (female 6.89, male 2.76) (Li 2022); UKCGG: no consistent association']
    ],
    mods: [['breast', 'her2pos', 0.6]] },
  { id: 'palb2', name: 'PALB2-related breast cancer predisposition', genes: ['PALB2'], inh: 'AD',
    tests: ['R208','R367','R207','R430'],
    rules: [
      ['breast', '*', 'S', 45, null, null, ['ukcgg:palb2', 'yang2020palb2', 'hu2021', 'dorling2021', 'us:acmg_palb2'], 'Female breast ~53% by 80; RR 7.18, declining with age (Yang 2020); OR 3.83 (CARRIERS)'],
      ['breast', '*', 'S', 60, 'tnbc', null, ['dorling2021', 'hu2021'], 'PALB2 PTV ORs higher for ER-negative than ER-positive disease (BCAC)'],
      ['breast', '*', 'M', null, 'male', null, ['yang2020palb2'], 'Male breast ~1% by 80; RR 7.34 (Yang 2020)'],
      ['pancreas', 'pdac', 'M', 60, null, null, ['yang2020palb2', 'us:acmg_palb2'], 'Pancreatic 2-3% by 80; RR 2.37 (Yang 2020)'],
      ['ovary', 'hgsc', 'M', null, null, null, ['ukcgg:hanson', 'yang2020palb2', 'us:acmg_palb2'], 'Ovarian ~5% by 80 (3.2% in another study); RR 2.91 (Yang 2020; Hanson 2023)'],
      ['cns', 'medullo_shh|medullo_nos', 'W', null, null, null, ['waszak2018', 'us:aacr_brain'], 'PALB2 a consensus (rare) medulloblastoma predisposition gene']
    ] },
  { id: 'atm', name: 'ATM-related cancer predisposition (heterozygous)', genes: ['ATM'], inh: 'AD',
    tests: ['R208','R367','R430'],
    rules: [
      ['breast', '*', 'M', 50, null, null, ['ukcgg:atm', 'gr:NBK623002', 'dorling2021', 'hu2021'], 'Female breast OR 2.16 (all GPV); 21-24% by 80; ER-positive association (UKCGG; GeneReviews)'],
      ['pancreas', 'pdac|acinar', 'M', 60, null, null, ['ukcgg:atm', 'gr:NBK623002', 'us:acg_gi'], 'Pancreatic 9.5% by 80; OR 4.21 / RR 6.5; mean age 64 (Hsu 2021, via UKCGG/GeneReviews)'],
      ['prostate', '*', 'M', 60, null, null, ['ukcgg:atm', 'gr:NBK623002'], 'Prostate OR 2.58-4.4; higher risk of early-onset and aggressive disease (Karlsson 2021, Darst 2023 via GeneReviews)'],
      ['stomach', '*', 'W', null, null, null, ['ukcgg:atm', 'gr:NBK623002'], 'Gastric OR 2.97-5.5 in single studies; UKCGG: modest, needs confirmation'],
      ['breast', '*', 'W', null, 'male', null, ['ukcgg:atm', 'gr:NBK623002']]
    ],
    mods: [['breast', 'tnbc', 0.5]] },
  { id: 'chek2', name: 'CHEK2-related cancer predisposition', genes: ['CHEK2'], inh: 'AD',
    tests: ['R208','R430'],
    rules: [
      ['breast', '*', 'M', 50, null, null, ['ukcgg:chek2', 'gr:NBK615090', 'dorling2021', 'hu2021', 'acmg_chek2'], 'Female breast OR 2.54 (c.1100del), 2.40 all GPV; ~20-50% by 80 depending on family history (UKCGG); ER-positive association'],
      ['breast', '*', 'M', null, 'male', null, ['ukcgg:chek2', 'gr:NBK615090', 'acmg_chek2'], 'Male breast OR 3.13; up to 1% (UKCGG)'],
      ['prostate', '*', 'M', null, null, null, ['ukcgg:chek2', 'gr:NBK615090', 'acmg_chek2'], 'Prostate OR 3.29 for c.1100del (UKCGG); ~2-fold (GeneReviews); possibly more aggressive disease'],
      ['colorectal', '*', 'W', null, null, null, ['ukcgg:chek2', 'gr:NBK615090', 'clingen:CHEK2', 'acmg_chek2', 'nccn_ceg2024'], 'Conflicting; c.1100delC SIR 1.43 (Schreurs 2024 via GeneReviews); ClinGen HNPCC Limited', 'NCCN (CEG v3.2024): colon cancer screening for CHEK2 carriers de-implemented on updated evidence about the CHEK2–colon cancer association'],
      ['kidney', '*', 'W', null, null, null, ['ukcgg:chek2', 'gr:NBK615090', 'acmg_chek2'], 'Conflicting; excess in UK 100,000 Genomes renal cohort'],
      ['thyroid', 'papillary', 'W', null, null, null, ['ukcgg:chek2', 'gr:NBK615090', 'acmg_chek2'], 'Suggested; significant mainly for Polish founder c.444+1G>A']
    ],
    mods: [['breast', 'tnbc', 0.4], ['breast', 'erpos', 1.3]] },
  { id: 'bard1', name: 'BARD1-related breast cancer predisposition', genes: ['BARD1'], inh: 'AD',
    tests: ['R208'],
    rules: [
      ['breast', '*', 'M', 60, 'tnbc', null, ['ukcgg:bard1', 'hu2021', 'dorling2021'], 'Stronger association with triple-negative than ER+ disease (UKCGG; CARRIERS)'],
      ['breast', '*', 'M', 50, null, null, ['ukcgg:bard1', 'dorling2021', 'hu2021'], 'Female breast OR 2.09 for PTVs (non-PTV 1.00); ~17-30% by 80 (UKCGG)']
    ] },
  { id: 'rad51d', name: 'RAD51D-related ovarian/breast cancer predisposition', genes: ['RAD51D'], inh: 'AD',
    tests: ['R207','R208'],
    rules: [
      ['ovary', 'hgsc', 'M', null, null, null, ['ukcgg:rad51d', 'ukcgg:hanson', 'yang2020rad51'], 'Tubo-ovarian ~13% by 80, RR 7.6; up to 32-36% with 2 FDRs; risk mostly after 50 (Yang 2020; UKCGG)'],
      ['ovary', 'endometrioid|nos', 'M', null, null, null, ['ukcgg:rad51d', 'yang2020rad51'], 'Tubo-ovarian ~13% by 80 (histotype not separated)'],
      ['breast', '*', 'M', 60, 'tnbc', null, ['ukcgg:rad51d', 'ukcgg:hanson', 'hu2021', 'dorling2021'], 'Association strongest with ER-negative/triple-negative BC (CARRIERS ER-neg OR RAD51C 2.19, RAD51D 3.93, via Hanson)'],
      ['breast', '*', 'M', null, null, null, ['ukcgg:rad51d', 'ukcgg:hanson', 'yang2020rad51', 'dorling2021'], 'Female breast ~20% by 80, RR 1.83 (Yang 2020); BCAC OR 1.8']
    ] },
  { id: 'rad51c', name: 'RAD51C-related ovarian/breast cancer predisposition', genes: ['RAD51C'], inh: 'AD',
    tests: ['R207','R208'],
    rules: [
      ['ovary', 'hgsc', 'M', null, null, null, ['ukcgg:rad51c', 'ukcgg:hanson', 'yang2020rad51'], 'Tubo-ovarian ~11% by 80, RR 7.55; up to 32-36% with 2 FDRs; risk mostly after 50 (Yang 2020; UKCGG)'],
      ['ovary', 'endometrioid|nos', 'M', null, null, null, ['ukcgg:rad51c', 'yang2020rad51'], 'Tubo-ovarian ~11% by 80 (histotype not separated)'],
      ['breast', '*', 'M', 60, 'tnbc', null, ['ukcgg:rad51c', 'ukcgg:hanson', 'hu2021', 'dorling2021'], 'Association strongest with ER-negative/triple-negative BC (CARRIERS ER-neg OR RAD51C 2.19, RAD51D 3.93, via Hanson)'],
      ['breast', '*', 'M', null, null, null, ['ukcgg:rad51c', 'ukcgg:hanson', 'yang2020rad51', 'dorling2021'], 'Female breast ~21% by 80, RR 1.99 (Yang 2020); BCAC OR 1.93']
    ] },
  { id: 'brip1', name: 'BRIP1-related ovarian cancer predisposition (heterozygous)', genes: ['BRIP1'], inh: 'AD',
    tests: ['R207'],
    rules: [
      ['ovary', 'hgsc', 'M', null, null, null, ['ukcgg:brip1', 'ukcgg:hanson', 'ramus2015', 'weberlasselle2018', 'clingen:BRIP1'], 'Tubo-ovarian ~5-15% lifetime (UKCGG); 5.8% by 80 (Hanson); RR 14.09 for HGSC in case-control (Ramus 2015); median age at diagnosis 63-65'],
      ['ovary', 'endometrioid|nos', 'W', null, null, null, ['ukcgg:brip1', 'ramus2015'], 'Invasive EOC RR 11.22 overall (Ramus 2015); histotype-specific data limited']
    ] },

  /* ---------- Colorectal / GI ---------- */
  { id: 'lynch_mlh1', name: 'Lynch syndrome (MLH1)', genes: ['MLH1'], inh: 'AD',
    tests: ['R210','R211','R207','R430','R230'],
    rules: [
      ['colorectal', '*', 'S', 50, null, null, ['ukcgg:mlh1', 'plsd2023', 'gr:NBK1211', 'clingen:MLH1', 'us:usmstf_lynch', 'us:acg_gi'], 'Colorectal ~56% (M) / 48% (F) by 75 vs 2-3% population (PLSD, UKCGG v5)'],
      ['uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos', 'S', 50, null, null, ['ukcgg:mlh1', 'plsd2023', 'gr:NBK1211', 'us:usmstf_lynch'], 'Endometrial ~37% by 75 (PLSD, UKCGG v5); median age 52'],
      ['smallbowel', 'adeno', 'S', 50, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Small bowel ~8% (M) / 5% (F) by 75 vs <1% population (UKCGG v5)'],
      ['stomach', 'intestinal|nos', 'M', 50, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Gastric ~9% (M) / 4% (F) by 75 vs ~1% (UKCGG v5)'],
      ['ovary', 'endometrioid|clearcell', 'M', 50, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Ovarian ~8% by 75 vs ~1% (UKCGG v5); median age 47-49'],
      ['urothelial', '*', 'M', null, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Bladder ~6%/5% and ureter/kidney ~5%/3% (M/F) by 75 vs ~1% (UKCGG v5)'],
      ['biliary', '*', 'M', null, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Bile duct/gallbladder ~4% (M) / 2% (F) by 75 vs <1% (UKCGG v5)'],
      ['skin', 'sebaceous', 'M', null, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch'], 'No reliable risk estimate (UKCGG v5)'],
      ['pancreas', 'pdac', 'M', null, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Pancreas ~3-4% by 75 vs ~1% (UKCGG v5); 0.4% by 70 in Dutch prospective cohort (GeneReviews)', 'USMSTF/ACG: 8.6–10.7-fold pancreatic cancer risk in 2 cohorts (≈3.7% by 70), not confirmed where histology was validated; ACG lists pancreas among LS cancers; no screening advised'],
      ['prostate', '*', 'W', null, null, null, ['ukcgg:mlh1', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Prostate ~16% by 75 vs 9% population (UKCGG v5) - under 2-fold'],
      ['polyps', 'adenoma', 'W', 40, null, null, ['gr:NBK1211', 'ukcgg:bsg'], 'No risk figure; adenomas are the CRC precursor targeted by colonoscopy']
    ],
    mods: LYNCH_MODS.MLH1 },
  { id: 'lynch_msh2', name: 'Lynch syndrome (MSH2 / EPCAM)', genes: ['MSH2', 'EPCAM'], inh: 'AD',
    tests: ['R210','R211','R207','R430','R230'],
    rules: [
      ['skin', 'sebaceous', 'S', null, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'us:usmstf_lynch'], 'No reliable risk estimate; MSH2 is the commonest gene in Lynch-associated sebaceous carcinoma (Cook 2023, via GeneReviews)'],
      ['colorectal', '*', 'S', 50, null, null, ['ukcgg:msh2', 'plsd2023', 'gr:NBK1211', 'clingen:MSH2', 'clingen:EPCAM', 'kempers2011', 'us:usmstf_lynch', 'us:acg_gi'], 'Colorectal ~56% (M) / 43% (F) by 75 (PLSD, UKCGG v5); EPCAM 3\' deletion ~75% by 70, mean age 43 (Kempers 2011)'],
      ['uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos', 'S', 50, null, null, ['ukcgg:msh2', 'plsd2023', 'gr:NBK1211', 'us:usmstf_lynch'], 'Endometrial ~44% by 75 (UKCGG v5); median age 52; much lower for EPCAM-only deletions'],
      ['smallbowel', 'adeno', 'S', 50, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Small bowel ~7% (M) / 4% (F) by 75 vs <1% (UKCGG v5)'],
      ['urothelial', '*', 'S', null, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'plsd2020', 'us:usmstf_lynch'], 'Ureter/kidney ~16% (M) / 20% (F) and bladder ~13% / 9% by 75 vs ~1% (UKCGG v5)'],
      ['stomach', 'intestinal|nos', 'M', 50, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Gastric ~8% (M) / 4% (F) by 75 vs ~1% (UKCGG v5)'],
      ['ovary', 'endometrioid|clearcell', 'M', 50, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Ovarian ~13% by 75 vs ~1% (UKCGG v5); median age 47-49'],
      ['biliary', '*', 'M', null, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Bile duct/gallbladder ~5% (M) / 2% (F) by 75 vs <1% (UKCGG v5)'],
      ['adrenal', 'acc', 'M', null, null, null, ['gr:NBK1211'], 'Lynch is found in ~2.5-3% of ACC; under 1% of carriers develop it, mostly MSH2 (GeneReviews)'],
      ['prostate', '*', 'M', null, null, null, ['ukcgg:msh2', 'plsd2023', 'plsd2020', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Prostate ~24% by 75 vs 9% (UKCGG v5); PLSD 2023 abstract 39.7% at 75'],
      ['cns', 'hgg', 'M', null, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'plsd2020', 'us:usmstf_lynch', 'us:acg_gi'], 'Brain ~7% (M) / 2% (F) by 75 vs ~1% (UKCGG v5); glioblastoma is the commonest subtype'],
      ['pancreas', 'pdac', 'M', null, null, null, ['ukcgg:msh2', 'gr:NBK1211', 'us:usmstf_lynch', 'us:acg_gi'], 'Pancreas ~3-4% by 75 vs ~1% (UKCGG v5); 1.3% by 70 (Dutch cohort, GeneReviews)', 'USMSTF/ACG: 8.6–10.7-fold pancreatic cancer risk in 2 cohorts (≈3.7% by 70), not confirmed where histology was validated; ACG lists pancreas among LS cancers; no screening advised'],
      ['polyps', 'adenoma', 'W', 40, null, null, ['gr:NBK1211', 'ukcgg:bsg'], 'No risk figure']
    ],
    mods: LYNCH_MODS.MSH2 },
  { id: 'lynch_msh6', name: 'Lynch syndrome (MSH6)', genes: ['MSH6'], inh: 'AD',
    tests: ['R210','R211','R207','R430'],
    rules: [
      ['uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos', 'S', 60, null, null, ['ukcgg:msh6', 'plsd2023', 'gr:NBK1211', 'clingen:MSH6', 'us:usmstf_lynch'], 'Endometrial ~46% by 75 but only 9% by 50 (UKCGG v5); median age 60-62'],
      ['colorectal', '*', 'M', 60, null, null, ['ukcgg:msh6', 'plsd2023', 'gr:NBK1211', 'ukcgg:bsg', 'us:usmstf_lynch', 'us:acg_gi'], 'Colorectal ~16-17% by 75 vs 2-3% (UKCGG v5); median age 55-60'],
      ['ovary', 'endometrioid|clearcell', 'M', null, null, null, ['ukcgg:msh6', 'gr:NBK1211'], 'Ovarian ~6% (3-15%) by 75 vs ~1% (UKCGG v5); median age 65'],
      ['urothelial', '*', 'M', null, null, null, ['ukcgg:msh6', 'plsd2023'], 'Bladder ~9% (M) / 3% (F) and ureter/kidney ~3-4% by 75 vs ~1% (UKCGG v5)'],
      ['skin', 'sebaceous', 'M', null, null, null, ['ukcgg:msh6', 'gr:NBK1211'], 'No reliable risk estimate (UKCGG v5)'],
      ['smallbowel', 'adeno', 'W', null, null, null, ['ukcgg:msh6'], 'Small bowel ~3% (M) by 75; similar to population in females (UKCGG v5)']
    ],
    mods: LYNCH_MODS.MSH6 },
  { id: 'lynch_pms2', name: 'Lynch syndrome (PMS2)', genes: ['PMS2'], inh: 'AD',
    tests: ['R210','R211'],
    rules: [
      ['colorectal', '*', 'M', 60, null, null, ['ukcgg:pms2', 'tenbroeke2018', 'plsd2023', 'gr:NBK1211', 'ukcgg:bsg', 'clingen:PMS2', 'us:usmstf_lynch', 'us:acg_gi'], 'Colorectal ~10% (M) / 9% (F) by 75 (Ten Broeke 2018); 13%/12% by 80 vs 6.6%/4.7%; PLSD median age 66-71'],
      ['uterus', 'endometrioid|serous|clearcell|carcinosarcoma|nos', 'M', 60, null, null, ['ukcgg:pms2', 'tenbroeke2018', 'plsd2023', 'gr:NBK1211', 'us:usmstf_lynch'], 'Endometrial ~11% by 75 (Ten Broeke) to 21% (PLSD, wide CI); median age 55-62']
    ],
    mods: LYNCH_MODS.PMS2 },
  { id: 'cmmrd', name: 'Constitutional mismatch repair deficiency (biallelic MMR)', inh: 'AR',
    genes: ['MLH1', 'MSH2', 'MSH6', 'PMS2', 'EPCAM'], tests: ['R210','R211'],
    rules: [
      ['cns', 'hgg', 'S', 25, null, null, ['eu:ern_cmmrd', 'gr:NBK1211', 'us:aacr_brain'], 'Malignant brain tumours in ~55%, most often high-grade glioma (ERN 2024)'],
      ['colorectal', '*', 'S', 25, null, 35, ['eu:ern_cmmrd', 'gr:NBK1211', 'us:aacr_brain'], 'CRC and other LS tumours in ~50% (ERN 2024)'],
      ['smallbowel', '*', 'S', 25, null, 35, ['eu:ern_cmmrd'], 'Small bowel cancer is part of the LS spectrum scored in C4CMMRD'],
      ['heme', 'all|lymphoma', 'S', 18, null, null, ['eu:ern_cmmrd', 'gr:NBK1211', 'us:aacr_brain'], 'Haematological malignancy in ~40%, most often T-cell lymphoblastic lymphoma (ERN 2024)'],
      ['polyps', 'adenoma', 'S', 20, 'n10', 30, ['eu:ern_cmmrd'], 'Adenomas or (oligo-)polyposis in most patients during the second decade (ERN 2024)'],
      ['feature', 'cal', 'S', null, null, null, ['eu:ern_cmmrd'], 'CALMs are the most prevalent non-neoplastic feature (ERN 2024)'],
      ['uterus', '*', 'M', 30, null, 35, ['eu:ern_cmmrd'], 'Incidence unknown; part of the LS spectrum (ERN 2024)'],
      ['cns', 'lgg|medullo_nos|medullo_shh', 'M', 18, null, null, ['eu:ern_cmmrd', 'us:aacr_brain'], 'Low-grade glioma and medulloblastoma are addressed in the ERN treatment recommendations; no frequency is given'],
      ['sarcoma', '*', 'W', null, null, 18, ['eu:ern_cmmrd'], 'Less frequent CMMRD tumour (ERN 2024)'],
      ['nb', 'nb', 'W', null, null, 18, ['eu:ern_cmmrd'], 'Less frequent CMMRD tumour (ERN 2024)'],
      ['kidney', 'wilms', 'W', null, null, 18, ['eu:ern_cmmrd'], 'Less frequent CMMRD tumour (ERN 2024)'],
      ['feature', 'pilomatrixoma', 'W', null, null, null, ['eu:ern_cmmrd'], 'Scoring feature in the revised C4CMMRD criteria']
    ],
    mods: [['*', 'mmr_def', 1.5], ['*', 'mmr_prof', 0.3]] },
  { id: 'fap', name: 'Familial adenomatous polyposis (APC)', genes: ['APC'], inh: 'AD', tests: ['R211','R414'],
    rules: [
      ['polyps', 'adenoma', 'H', 35, 'n100', null, ['ukcgg:apc', 'gr:NBK1345', 'clingen:APC', 'us:acg_gi'], 'Classical FAP: >100 adenomas, 95% have polyps by 35 (UKCGG); early age 35 so classical polyposis in the early 30s ranks APC above MUTYH'],
      ['sarcoma', 'desmoid', 'S', null, null, null, ['ukcgg:apc', 'ukcgg:bsg', 'gr:NBK1345', 'us:acg_gi', 'us:aacr_gi'], 'Desmoids in ~15% (UKCGG; 10-30% GeneReviews); >800x population risk; >=7.5% of desmoid fibromatoses occur in FAP'],
      ['thyroid', 'cmv', 'H', null, null, null, ['ukcgg:apc', 'eu:ehtg_fap', 'gr:NBK1345', 'us:acg_gi', 'us:aacr_gi'], 'Thyroid cancer 1.5-12% lifetime, mostly cribriform-morular PTC, strong female excess (EHTG 2024)'],
      ['feature', 'gapps', 'H', null, null, null, ['gr:NBK1345', 'eu:ehtg_fap', 'clingen:APC', 'us:aacr_gi'], 'GAPPS: proximal fundic gland polyposis, gastric cancer 13-25% lifetime (GeneReviews)'],
      ['polyps', 'adenoma', 'S', 30, 'n20', null, ['gr:NBK1345', 'eu:ehtg_fap', 'us:acg_gi'], 'Attenuated FAP: average ~30 adenomas; CRC risk ~70% by 80 (GeneReviews)'],
      ['liver', 'hepatoblastoma', 'S', null, null, null, ['ukcgg:apc', 'eu:ehtg_fap', 'gr:NBK1345', 'us:acg_gi', 'us:aacr_gi'], 'Hepatoblastoma ~1.6-2% absolute, RR ~847, highest at 1-4 years (EHTG 2024)'],
      ['cns', 'medullo_wnt', 'S', null, null, null, ['gr:NBK1345', 'us:aacr_gi', 'us:aacr_brain'], 'CNS tumours ~1% absolute; medulloblastoma most common (GeneReviews)'],
      ['feature', 'chrpe', 'S', null, null, null, ['ukcgg:bsg', 'gr:NBK1345', 'us:acg_gi'], 'CHRPE in up to 80% of FAP (GeneReviews)'],
      ['feature', 'osteomas', 'S', null, null, null, ['gr:NBK1345', 'eu:ehtg_fap', 'us:acg_gi'], 'Osteomas 60-80%; dental anomalies 30-75% vs 1-2% population (GeneReviews)'],
      ['polyps', 'adenoma', 'M', 30, 'n10', null, ['ukcgg:bsg', 'gr:NBK1345', 'us:acg_gi'], 'APC or biallelic MUTYH variants in 9% of people with 10-19 adenomas (BSG)'],
      ['colorectal', '*', 'M', 40, null, null, ['ukcgg:apc', 'gr:NBK1345', 'eu:ehtg_fap', 'us:acg_gi'], 'Near 100% untreated in classical FAP, mean age 39; 3-10% under surveillance (UKCGG)'],
      ['smallbowel', 'adeno', 'S', null, null, null, ['ukcgg:apc', 'gr:NBK1345', 'eu:ehtg_fap', 'us:acg_gi'], 'Duodenal cancer 5-10% lifetime without surveillance (UKCGG); small bowel 4-12% (GeneReviews)'],
      ['stomach', 'intestinal|nos', 'M', null, null, null, ['ukcgg:apc', 'eu:ehtg_fap', 'gr:NBK1345', 'clingen:APC', 'us:acg_gi'], 'GAPPS (APC promoter 1B): gastric cancer 12-25% (EHTG 2024); classical FAP ~2% in Western cohorts, rising and ~10x in Japan/Korea', 'ACG 2015: gastric cancer lifetime risk ~0.6% in (western) FAP; gastric adenomas rare – lower than the M tier implies'],
      ['feature', 'pilomatrixoma', 'W', null, null, null, ['gr:NBK1345'], 'Multiple pilomatricomas rare but reported (GeneReviews)'],
      ['adrenal', 'acc', 'W', null, null, null, ['eu:ehtg_fap', 'gr:NBK1345'], 'Adrenal masses 7-26% (2-3x population); adrenal carcinoma rare (EHTG 2024)'],
      ['pancreas', 'pdac', 'W', null, null, null, ['eu:ehtg_fap', 'gr:NBK1345', 'us:acg_gi'], 'Pancreatic cancer RR 4.5, ~1% by 80; lifetime <2% (EHTG 2024)']
    ],
    mods: [['colorectal', 'mmr_def', 0.4]] },
  { id: 'map', name: 'MUTYH-associated polyposis (biallelic MUTYH)', genes: ['MUTYH'], inh: 'AR', tests: ['R211'],
    rules: [
      ['polyps', 'adenoma', 'S', 50, 'n10', null, ['ukcgg:bsg', 'gr:NBK107219', 'eu:ehtg_fap', 'clingen:MUTYH', 'us:acg_gi'], 'Most have 10 to a few hundred adenomas, mean presentation ~50; 77% have <100 adenomas (EHTG 2024)'],
      ['polyps', 'adenoma', 'M', 50, 'n100', null, ['ukcgg:bsg', 'eu:ehtg_fap', 'us:acg_gi'], 'MAP accounts for up to 29% of classical (100-1000 adenoma) phenotypes (BSG)'],
      ['colorectal', '*', 'M', 50, null, null, ['ukcgg:bsg', 'gr:NBK107219', 'eu:ehtg_fap', 'us:acg_gi', 'us:aacr_gi'], 'CRC 63% by 60 (BSG); 80-90% lifetime without surveillance (GeneReviews); mean age at CRC ~48 (EHTG)'],
      ['smallbowel', 'adeno', 'M', null, null, null, ['ukcgg:bsg', 'gr:NBK107219', 'eu:ehtg_fap', 'us:acg_gi'], 'Duodenal adenomas 17-34%; duodenal cancer ~4% lifetime (BSG; EHTG estimate 1.5%)'],
      ['ovary', '*', 'W', null, null, null, ['gr:NBK107219', 'clingen:MUTYH', 'us:acg_gi'], 'Ovarian cancer 6-14% lifetime, median 51 (GeneReviews); ClinGen: MUTYH-familial ovarian cancer Disputed, so capped at W', 'ACG 2015: ovarian cancer reported in MAP but increased risk unclear'],
      ['urothelial', 'bladder', 'W', null, null, null, ['gr:NBK107219', 'eu:ehtg_fap', 'us:acg_gi'], 'Bladder cancer 6-8% (F), 6-25% (M) lifetime, median 61 (GeneReviews)', 'ACG 2015: bladder cancer reported in MAP but increased risk unclear'],
      ['skin', 'sebaceous', 'W', null, null, null, ['gr:NBK107219', 'us:acg_gi'], 'Sebaceous adenomas/epitheliomas in 5/276 (Vogt 2009, via GeneReviews)'],
      ['thyroid', 'papillary', 'W', null, null, null, ['gr:NBK107219', 'us:acg_gi'], 'PTC in 3/24 on ultrasound screening, not replicated (possible selection bias)', 'ACG 2015: annual thyroid ultrasound recommended for MAP (conditional, low-quality evidence) – stronger than the W tier'],
      ['polyps', 'serrated|sps', 'W', null, null, null, ['gr:NBK107219', 'us:acg_gi'], 'Serrated/hyperplastic polyps present in some MAP; 3/17 met serrated polyposis criteria']
    ] },
  { id: 'nthl1', name: 'NTHL1 tumour syndrome (biallelic NTHL1)', genes: ['NTHL1'], inh: 'AR', tests: ['R211'],
    rules: [
      ['polyps', 'adenoma', 'M', 50, 'n10', null, ['gr:NBK555473', 'clingen:NTHL1', 'eu:ehtg_fap', 'us:aacr_gi'], 'Adenomatous (also hyperplastic/SSL) polyposis; >=10 adenomas a testing criterion (GeneReviews)'],
      ['colorectal', '*', 'M', 50, null, null, ['gr:NBK555473', 'us:aacr_gi'], 'CRC in 37/72 reported, median 51 (31-73), 19 diagnosed <50'],
      ['breast', '*', 'M', 50, null, null, ['gr:NBK555473', 'us:aacr_gi'], 'Breast cancer in 12/22 females, median 49 (36-63); bilateral in >=3'],
      ['uterus', '*', 'W', null, null, null, ['gr:NBK555473', 'us:aacr_gi'], 'Endometrial cancer in 5/22 females, median 57'],
      ['urothelial', '*', 'W', null, null, null, ['gr:NBK555473'], 'Urothelial bladder carcinoma reported; extracolonic cancer by 60 estimated 35-78%'],
      ['cns', 'meningioma', 'W', null, null, null, ['gr:NBK555473'], '11 meningiomas reported (10 female), median 46'],
      ['headneck', 'scc', 'W', null, null, null, ['gr:NBK555473'], 'Head and neck SCC reported (case level)'],
      ['skin', 'bcc', 'W', null, null, null, ['gr:NBK555473'], 'Basal cell carcinoma reported (case level); listed among suggestive multiple primaries']
    ] },
  { id: 'ppap', name: 'Polymerase proofreading-associated polyposis (POLE / POLD1)', genes: ['POLE', 'POLD1'], inh: 'AD',
    tests: ['R211'],
    rules: [
      ['polyps', 'adenoma', 'M', 50, 'n10', null, ['palles2022ppap', 'eu:ehtg_fap', 'clingen:POLE', 'us:acg_gi'], 'Adenomas in 78/105 POLE (median 36) and 18/27 POLD1 carriers'],
      ['colorectal', '*', 'M', 50, null, null, ['palles2022ppap', 'ukcgg:bsg', 'clingen:POLE', 'us:acg_gi'], 'CRC in 74/105 POLE (median 44.5) and 12/27 POLD1 (median 41); earliest 14'],
      ['uterus', 'endometrioid|nos', 'M', 50, null, null, ['palles2022ppap', 'us:acg_gi'], 'Endometrial cancer in 9/17 POLD1 females (median 52) and 5/43 POLE females (median 53)'],
      ['smallbowel', 'adeno', 'M', null, null, null, ['palles2022ppap'], 'Duodenal cancer in 10/105 (9.5%) POLE carriers (median 55); duodenal adenomas 15%'],
      ['cns', 'hgg', 'W', null, null, null, ['palles2022ppap', 'us:acg_gi', 'us:aacr_brain'], 'Brain tumours in 9/105 POLE carriers (glioblastomas at 30-52) and 1/27 POLD1'],
      ['ovary', '*', 'W', null, null, null, ['palles2022ppap'], 'Ovarian cancer in 5/43 POLE females (median 45), none in POLD1']
    ] },
  { id: 'mbd4', name: 'MBD4-associated neoplasia syndrome', genes: ['MBD4'], inh: 'AR (AD for uveal melanoma)', adSites: ['eye'],
    note: 'Biallelic MBD4: early AML/MDS and adenomatous polyposis. Heterozygous: uveal melanoma.', tests: ['R211','R347'],
    rules: [
      ['heme', 'aml|mds', 'S', 40, null, null, ['gr:NBK624097', 'palles2022mbd4', 'clingen:MBD4'], 'AML in 16/21 biallelic carriers, median 35 (27-55), 13/16 before 40; MDS preceded AML in 2'],
      ['polyps', 'adenoma', 'M', 50, 'n10', null, ['gr:NBK624097', 'palles2022mbd4', 'eu:ehtg_fap', 'us:aacr_gi'], 'Polyps in all 19 scoped (5-130), median 34 (18-54), mostly adenomatous'],
      ['colorectal', '*', 'M', 45, null, null, ['gr:NBK624097', 'us:aacr_gi'], 'CRC in 4/21 (19%) at 30, 33, 40 and 52'],
      ['eye', 'uveal', 'M', null, null, null, ['gr:NBK624097', 'clingen:MBD4', 'palles2022mbd4', 'us:aacr_gi'], 'Biallelic: 4/21 uveal melanoma. Heterozygotes: RR 9.15-31.44 (ClinGen AD uveal melanoma Moderate)'],
      ['cns', 'vs|schwannoma', 'W', null, null, null, ['gr:NBK624097'], 'Schwannoma in 6/21 biallelic carriers (30-50 years), including bilateral vestibular']
    ] },
  { id: 'jps_smad4', name: 'Juvenile polyposis (SMAD4) / JP-HHT', genes: ['SMAD4'], inh: 'AD', tests: ['R211','R186'],
    rules: [
      ['polyps', 'juvenile', 'H', null, 'n5', null, ['ukcgg:smad4', 'ukcgg:bsg', 'gr:NBK1469', 'clingen:SMAD4', 'us:acg_gi', 'us:aacr_gi'], 'Clinical JPS: >5 juvenile polyps in colon/rectum (UKCGG)'],
      ['feature', 'hht', 'S', null, null, null, ['ukcgg:smad4', 'ukcgg:bsg', 'gr:NBK1351', 'clingen:SMAD4', 'us:acg_gi', 'us:usmstf_hamartoma', 'us:aacr_gi'], 'HHT features in up to 76% of SMAD4 carriers; aortopathy ~38%'],
      ['polyps', 'juvenile', 'M', null, null, null, ['ukcgg:smad4', 'gr:NBK1469', 'us:acg_gi'], 'Juvenile polyps anywhere in the GI tract; colonic polyps in 97% of SMAD4 carriers'],
      ['stomach', '*', 'M', 50, null, null, ['ukcgg:smad4', 'ukcgg:bsg', 'gr:NBK1469', 'us:acg_gi', 'us:aacr_gi'], 'Gastric polyposis 65-83%; up to 30% gastric cancer risk with gastric polyposis; gastric cancer almost exclusively SMAD4'],
      ['colorectal', '*', 'M', 45, null, null, ['ukcgg:smad4', 'ukcgg:bsg', 'gr:NBK1469', 'us:acg_gi'], 'CRC lifetime 38-66%, mean age 44 (UKCGG; likely overestimate)', 'ACG 2015: JPS colon cancer mean age 34 (range 15–68), 17–22% by 35 – younger than the UK-based early-onset threshold of 45'],
      ['smallbowel', 'adeno', 'W', null, null, null, ['us:acg_gi'], 'Upper GI cancer (stomach, pancreas, small bowel) 21% incidence, median 54 (ACG 2015, JPS overall)'],
      ['pancreas', 'pdac', 'W', null, null, null, ['us:acg_gi'], 'Upper GI cancer (stomach, pancreas, small bowel) 21% incidence, median 54 (ACG 2015, JPS overall)']
    ] },
  { id: 'jps_bmpr1a', name: 'Juvenile polyposis (BMPR1A)', genes: ['BMPR1A'], inh: 'AD', tests: ['R211'],
    rules: [
      ['polyps', 'juvenile', 'H', null, 'n5', null, ['ukcgg:bmpr1a', 'gr:NBK1469', 'clingen:BMPR1A', 'us:acg_gi', 'us:aacr_gi'], 'Clinical JPS: >5 juvenile polyps in colon/rectum (UKCGG)'],
      ['polyps', 'juvenile', 'M', null, null, null, ['ukcgg:bmpr1a', 'gr:NBK1469', 'us:acg_gi'], 'Juvenile polyps; BMPR1A in 25-30% of JPS'],
      ['polyps', 'mixed', 'M', null, null, null, ['ukcgg:bmpr1a', 'gr:NBK1469'], 'Mixed juvenile/adenomatous/hyperplastic polyps; BMPR1A variants found in HMPS-like families'],
      ['colorectal', '*', 'M', 45, null, null, ['ukcgg:bmpr1a', 'ukcgg:bsg', 'gr:NBK1469', 'us:acg_gi'], 'CRC risk up to 60% (overestimate), median age 44; CRC is 88% of BMPR1A-associated cancers', 'ACG 2015: JPS colon cancer mean age 34 (range 15–68), 17–22% by 35 – younger than the UK-based early-onset threshold of 45'],
      ['smallbowel', 'adeno', 'W', null, null, null, ['us:acg_gi'], 'Upper GI cancer (stomach, pancreas, small bowel) 21% incidence, median 54 (ACG 2015, JPS overall)'],
      ['pancreas', 'pdac', 'W', null, null, null, ['us:acg_gi'], 'Upper GI cancer (stomach, pancreas, small bowel) 21% incidence, median 54 (ACG 2015, JPS overall)']
    ] },
  { id: 'hmps', name: 'Hereditary mixed polyposis (GREM1)', genes: ['GREM1'], inh: 'AD', tests: ['R211'],
    rules: [
      ['polyps', 'mixed', 'H', null, null, null, ['clingen:GREM1', 'jaeger2012', 'otherpolyposis2026', 'us:acg_gi'], 'Mixed hyperplastic/atypical juvenile/adenomatous polyps, typically 10-100; average age at polyp detection 28'],
      ['colorectal', '*', 'M', 50, null, null, ['jaeger2012', 'clingen:GREM1', 'ukcgg:bsg', 'us:acg_gi', 'us:aacr_gi'], 'CRC in a high proportion of affected individuals (no quantified risk)'],
      ['polyps', 'serrated|sps|adenoma', 'W', null, 'n5', null, ['otherpolyposis2026', 'jaeger2012', 'us:acg_gi'], 'Component polyp types in HMPS']
    ] },
  { id: 'rnf43', name: 'Serrated polyposis (RNF43)', genes: ['RNF43'], inh: 'AD', tests: ['R211'],
    rules: [
      ['polyps', 'serrated', 'M', null, 'n5', null, ['clingen:RNF43', 'rnf43gut2026', 'ukcgg:bsg', 'us:aacr_gi'], 'Germline RNF43 LoF in a small minority of serrated polyposis (WHO-criteria SPS)'],
      ['polyps', 'sps', 'M', null, null, null, ['clingen:RNF43', 'rnf43gut2026', 'ukcgg:bsg', 'us:aacr_gi'], 'Serrated polyposis syndrome (WHO criteria): germline RNF43 LoF in a small minority'],
      ['polyps', 'serrated', 'W', null, null, null, ['rnf43gut2026', 'otherpolyposis2026'], 'Population carriers often lack multiple polyps'],
      ['colorectal', '*', 'W', null, null, null, ['rnf43gut2026', 'clingen:RNF43'], 'Germline RNF43 LoF: CRC OR 2.7 overall, higher for N-terminal variants (CORGI/100kGP/UKB)']
    ] },
  { id: 'pjs', name: 'Peutz–Jeghers syndrome (STK11)', genes: ['STK11'], inh: 'AD', tests: ['R212','R211','R367'],
    rules: [
      ['polyps', 'pj', 'H', null, null, null, ['eu:ehtg_pjs', 'gr:NBK1266', 'clingen:STK11', 'us:acg_gi', 'us:aacr_gi'], 'Arborising hamartomatous polyps, mainly small bowel: the sine qua non of PJS'],
      ['feature', 'pigment_pj', 'H', null, null, null, ['gr:NBK1266', 'eu:ehtg_pjs', 'us:acg_gi'], 'Mucocutaneous macules develop in most children before age 5'],
      ['ovary', 'sctat', 'S', null, null, null, ['gr:NBK1266', 'eu:ehtg_pjs', 'us:acg_gi', 'us:aacr_gi'], 'Ovarian (mostly SCTAT) 10-21% lifetime, mean 28 (GeneReviews)'],
      ['cervix', 'gastric', 'S', null, null, null, ['gr:NBK1266', 'eu:ehtg_pjs', 'us:acg_gi'], 'Cervix 10-23% lifetime, mostly minimal deviation (gastric-type) adenocarcinoma'],
      ['testis', 'lccsct', 'S', null, null, null, ['gr:NBK1266', 'us:acg_gi', 'us:aacr_gi'], 'Large cell calcifying Sertoli cell tumour ~9%, age 6-9 (GeneReviews)'],
      ['pancreas', 'pdac', 'M', 50, null, null, ['eu:ehtg_pjs', 'gr:NBK1266', 'us:acg_gi'], 'PDAC lifetime 11-55%, mean 41-52; surveillance from 40 (EHTG/CAPS)'],
      ['breast', '*', 'M', 50, null, null, ['eu:ehtg_pjs', 'gr:NBK1266', 'us:acg_gi', 'us:aacr_gi'], 'Breast 19-54% lifetime; 11-24% by 50; mean age 37-45; MRI from 25'],
      ['smallbowel', '*', 'S', null, null, null, ['gr:NBK1266', 'ukcgg:bsg', 'us:acg_gi'], 'Small bowel cancer 10-14% lifetime, mean 37-42 (GeneReviews)'],
      ['stomach', '*', 'M', 50, null, null, ['gr:NBK1266', 'ukcgg:bsg', 'us:acg_gi'], 'Gastric 24-29% lifetime, mean 30-40 (GeneReviews)'],
      ['colorectal', '*', 'M', 50, null, null, ['gr:NBK1266', 'ukcgg:bsg', 'us:acg_gi'], 'CRC 39% lifetime, mean 42-46; luminal GI cancer 1/9/15/33/57% at 30/40/50/60/70 (BSG, Hearle)'],
      ['lung', '*', 'W', null, null, null, ['gr:NBK1266', 'us:acg_gi'], 'Lung 7-17% lifetime vs 6.9% population; avoid smoking']
    ],
    mods: [['breast', 'tnbc', 0.5]] },
  { id: 'phts', name: 'PTEN hamartoma tumour syndrome (Cowden)', genes: ['PTEN'], inh: 'AD', tests: ['R213','R211'],
    rules: [
      ['thyroid', 'follicular', 'S', null, null, null, ['ukcgg:pten', 'gr:NBK1488', 'us:phts_consensus', 'us:aacr_pten_dicer1_tsc'], 'Thyroid cancer 6-38% lifetime, usually follicular, median 37 (UKCGG)'],
      ['feature', 'macrocephaly', 'H', null, null, null, ['gr:NBK1488', 'ukcgg:pten', 'us:aacr_pten_dicer1_tsc'], 'Macrocephaly in 94%'],
      ['feature', 'trichilemmoma', 'H', null, null, null, ['gr:NBK1488', 'us:aacr_pten_dicer1_tsc'], 'Skin/mucosal lesions in 99% by 4th decade (trichilemmomas, oral papillomatosis, acral keratoses)'],
      ['feature', 'lld', 'H', null, null, null, ['gr:NBK1488', 'ukcgg:pten', 'us:aacr_brain'], 'Lhermitte-Duclos disease: rare but pathognomonic'],
      ['breast', '*', 'M', 50, null, null, ['ukcgg:pten', 'gr:NBK1488', 'us:phts_consensus'], 'Female breast 67-85% lifetime, average age 38-46 (UKCGG)'],
      ['polyps', 'ganglioneuroma', 'S', null, null, null, ['gr:NBK1488', 'ukcgg:pten', 'us:acg_gi'], 'GI polyps in >90% scoped; ganglioneuromatous/hamartomatous typical'],
      ['thyroid', 'mng', 'M', 40, null, null, ['ukcgg:pten', 'gr:NBK1488', 'us:phts_consensus', 'us:aacr_pten_dicer1_tsc'], 'Up to 75% have benign thyroid disease (MNG, adenomatous nodules, follicular adenomas)'],
      ['uterus', 'endometrioid|nos', 'M', 50, null, null, ['ukcgg:pten', 'gr:NBK1488', 'us:phts_consensus'], 'Endometrial 2-28% lifetime, rising from late 30s (UKCGG); ~48% in GeneReviews (US cohort)'],
      ['kidney', 'ccrcc|papillary1|chromophobe|nos', 'M', null, null, null, ['ukcgg:pten', 'gr:NBK1488', 'us:phts_consensus'], 'Renal 2-34% lifetime, mostly papillary, rising from late 40s (UKCGG)'],
      ['colorectal', '*', 'M', 50, null, null, ['ukcgg:pten', 'gr:NBK1488', 'us:phts_consensus', 'us:usmstf_hamartoma'], 'CRC 9-20% lifetime, mean 44-58 (UKCGG)'],
      ['polyps', 'mixed|juvenile', 'M', null, null, null, ['gr:NBK1488', 'ukcgg:pten', 'us:acg_gi', 'us:phts_consensus'], 'Mixed histology polyposis throughout the GI tract'],
      ['thyroid', 'papillary', 'W', 40, null, null, ['ukcgg:pten', 'us:phts_consensus', 'us:aacr_pten_dicer1_tsc'], 'Papillary thyroid cancer is rare in PHTS (UKCGG)', 'PHTS consensus 2025 / AACR 2024: risk is given for differentiated thyroid cancer as a whole (17–38% lifetime; 15% before 30), not restricted to follicular – US sources do not treat papillary as rare'],
      ['skin', 'melanoma', 'W', null, null, null, ['ukcgg:pten', 'gr:NBK1488', 'us:acg_gi'], 'Melanoma 0-6% lifetime (UKCGG)'],
      ['cns', 'lgg', 'W', null, null, null, ['gr:NBK1488'], 'No glioma risk in sources; kept as proxy for dysplastic cerebellar gangliocytoma (LDD) entered as a low-grade tumour'],
      ['cns', 'meningioma', 'W', null, null, null, ['gr:NBK1488', 'us:aacr_brain'], 'Meningiomas among reported neuroimaging findings']
    ] },
  { id: 'hdgc', name: 'Hereditary diffuse gastric cancer (CDH1)', genes: ['CDH1'], inh: 'AD', tests: ['R215'],
    rules: [
      ['stomach', 'diffuse', 'S', 50, null, null, ['ukcgg:cdh1', 'eu:igclc_hdgc', 'gr:NBK1139', 'clingen:CDH1', 'us:acg_gi', 'us:aacr_gi'], 'DGC by 80: 70% M / 56% F (2010-criteria families); 42% M / 33% F (broader ascertainment); mean onset 42-49'],
      ['breast', 'ilc', 'S', 50, null, null, ['ukcgg:cdh1', 'eu:igclc_hdgc', 'gr:NBK1139', 'us:acg_gi'], 'Lobular breast 42-55% lifetime by 80 (UKCGG); mean onset 45-54'],
      ['feature', 'cleft', 'M', null, null, null, ['eu:igclc_hdgc', 'gr:NBK1139'], 'Cleft lip/palate in >=1 member of 19% of CDH1 families'],
      ['colorectal', 'mucinous', 'W', null, null, null, ['gr:NBK1139', 'eu:igclc_hdgc', 'us:acg_gi'], 'CRC in 9.9% of US CDH1 carriers (3.8% signet ring), <2% in European families; IGCLC finds no strong evidence and no extra CRC screening']
    ] },
  { id: 'ctnna1', name: 'CTNNA1-related diffuse gastric cancer', genes: ['CTNNA1'], inh: 'AD', tests: ['R215'],
    rules: [
      ['stomach', 'diffuse', 'S', 50, null, null, ['gr:NBK1139', 'eu:igclc_hdgc', 'clingen:CTNNA1'], 'DGC cumulative 49-57% by 80 (Coudert 2022, likely overestimate), mean onset ~40'],
      ['breast', 'ilc', 'W', null, null, null, ['gr:NBK1139', 'clingen:CTNNA1'], 'LBC extremely rare; unspecified breast cancer common in families (Lobo 2021)']
    ] },
  { id: 'tylosis', name: 'Tylosis with oesophageal cancer (RHBDF2)', genes: ['RHBDF2'], inh: 'AD', tests: ['R166'],
    rules: [
      ['feature', 'tylosis', 'H', null, null, null, ['ellis2015', 'clingen:RHBDF2'], 'Focal palmoplantar keratoderma with complete penetrance, usually by age 7-8'],
      ['oesophagus', 'scc', 'M', null, null, null, ['ellis2015', 'clingen:RHBDF2'], 'Oesophageal SCC ~95% by 65 in the large Liverpool family; presents mid-50s onwards, no earlier than sporadic OSCC']
    ] },

  /* ---------- Multi-cancer / Li–Fraumeni ---------- */
  { id: 'lfs', name: 'Li–Fraumeni syndrome (TP53)', genes: ['TP53'], inh: 'AD', tests: ['R216','R456','R457','R347'],
    rules: [
      ['breast', '*', 'S', 30, null, 30, ['eu:ern_lfs', 'ukcgg:tp53', 'gr:NBK1311'], 'TP53 PV in 3.8-7.7% of women with breast cancer <31 (ERN)'],
      ['breast', '*', 'S', 35, 'her2pos', 39, ['gr:NBK1311']],
      ['adrenal', 'acc', 'H', null, null, 18, ['eu:ern_lfs', 'ukcgg:tp53', 'gr:NBK1311'], 'ACC in 6-13% of carriers; TP53 PV in 50-80% of childhood ACC (ERN)'],
      ['adrenal', 'acc', 'M', null, null, null, ['eu:ern_lfs', 'ukcgg:tp53', 'gr:NBK1311'], 'Adult ACC: TP53 PV in a small minority (~4-6%); still a Chompret criterion at any age'],
      ['cns', 'cpc', 'H', null, null, null, ['eu:ern_lfs', 'gr:NBK1311', 'us:aacr_brain'], 'TP53 PV in 50-80% of choroid plexus carcinoma (ERN)'],
      ['sarcoma', 'rms', 'S', null, null, 5, ['eu:ern_lfs', 'gr:NBK1311'], 'TP53 PV in up to 73% of embryonal anaplastic RMS (ERN)'],
      ['heme', 'all_hypo', 'H', null, null, null, ['eu:ern_lfs', 'gr:NBK1311']],
      ['breast', '*', 'S', 35, null, 45, ['ukcgg:tp53', 'eu:ern_lfs', 'gr:NBK1311', 'fortuno2024'], 'Female breast ~63% by 50 (Fortuno 2024); 80-90% lifetime (GeneReviews)'],
      ['breast', '*', 'M', null, null, null, ['ukcgg:tp53', 'gr:NBK1311'], 'Breast cancer after 45: TP53 found in very few (most LFS breast cancers are diagnosed before 45)'],
      ['sarcoma', 'rms', 'S', 18, null, null, ['gr:NBK1311', 'eu:ern_lfs']],
      ['sarcoma', 'osteo', 'S', 30, null, null, ['gr:NBK1311', 'eu:ern_lfs', 'ukcgg:tp53'], 'Bone cancer by 70: 5% women, 11% men (Mai 2016 via GR); up to 16% of LFS cancers'],
      ['sarcoma', 'sts|lms|angiosarcoma', 'S', 46, null, null, ['eu:ern_lfs', 'gr:NBK1311', 'ukcgg:tp53'], 'STS cumulative incidence 15% women, 22% men (Mai 2016 via GR); 17-27% of LFS cancers'],
      ['cns', 'hgg', 'S', 46, null, null, ['gr:NBK1311', 'eu:ern_lfs', 'ukcgg:tp53', 'us:aacr_brain'], 'CNS tumours by 70: 6% women, 19% men (Mai 2016 via GR); 9-14% of LFS cancers'],
      ['cns', 'lgg', 'M', 46, null, null, ['gr:NBK1311', 'us:aacr_brain'], 'Low-grade glioma much less clearly linked than high-grade glioma'],
      ['cns', 'medullo_shh', 'S', null, null, 18, ['eu:ern_lfs', 'gr:NBK1311', 'us:aacr_brain']],
      ['breast', 'phyllodes', 'M', null, null, null, ['gr:NBK1311']],
      ['heme', 'aml|mds', 'M', 40, null, null, ['gr:NBK1311'], 'Leukaemia ~4% of carriers (Bougeard 2015 via GR); often therapy-related'],
      ['uterus', 'lms', 'W', 46, null, null, ['gr:NBK1311']],
      ['lung', 'adeno', 'W', 46, null, null, ['gr:NBK1311', 'fortuno2024']],
      ['colorectal', '*', 'W', 30, null, null, ['ukcgg:tp53', 'eu:ern_lfs', 'gr:NBK1311', 'fortuno2024'], 'CRC in 2.8% of carriers (Hatton 2024 via GR)'],
      ['kidney', '*', 'W', 20, null, null, ['gr:NBK1311']],
      ['pancreas', '*', 'W', 46, null, null, ['gr:NBK1311', 'fortuno2024']],
      ['stomach', '*', 'W', null, null, null, ['fortuno2024', 'gr:NBK1311', 'ukcgg:tp53'], 'Stomach ~2%, oesophagus 0.6% of carriers (UKCGG)'],
      ['ovary', '*', 'W', null, null, null, ['fortuno2024', 'gr:NBK1311']],
      ['prostate', '*', 'W', null, null, null, ['gr:NBK1311']],
      ['heme', 'all', 'W', null, null, null, ['gr:NBK1311']]
    ] },

  /* ---------- Endocrine ---------- */
  { id: 'men1', name: 'Multiple endocrine neoplasia type 1 (MEN1)', genes: ['MEN1'], inh: 'AD', tests: ['R217','R151','R223'],
    rules: [
      ['net', 'gastrinoma', 'S', null, null, null, ['gr:NBK1538'], 'Gastrinoma ~40%; >90% duodenal; ZES usually <40'],
      ['net', 'thymic', 'S', null, null, null, ['gr:NBK1538', 'us:endo_men1'], 'Thymic/bronchial/gastric carcinoid 3-10%; thymic M:F 20:1'],
      ['parathyroid', 'adenoma', 'S', 35, null, null, ['gr:NBK1538', 'us:endo_men1'], 'PHPT first feature in 90%; essentially all hypercalcaemic by 50'],
      ['pituitary', 'gh|other', 'S', 30, null, null, ['gr:NBK1538', 'us:endo_men1'], 'Pituitary adenoma 15-55%'],
      ['pancreas', 'pnet', 'S', 50, null, null, ['gr:NBK1538', 'us:endo_men1'], 'Non-functioning pNET ~34% by 50; up to 55% on EUS'],
      ['net', 'lung', 'M', null, null, null, ['gr:NBK1538', 'us:endo_men1']],
      ['net', 'gastric', 'M', null, null, null, ['gr:NBK1538', 'us:endo_men1']],
      ['adrenal', 'acc', 'W', null, null, null, ['gr:NBK1538', 'us:endo_men1'], 'ACC ~1% (Gatta-Cherifi 2012); ~13% malignancy in adrenal tumours >1 cm'],
      ['parathyroid', 'carcinoma', 'W', null, null, null, ['gr:NBK1538']],
      ['cns', 'meningioma', 'W', null, null, null, ['gr:NBK1538', 'us:endo_men1'], '~8%'],
      ['cns', 'ependymoma', 'W', null, null, null, ['gr:NBK1538'], '~1%'],
      ['breast', '*', 'W', null, null, null, ['gr:NBK1538'], 'Female breast RR 2.83, median age 45 (Dreijerink 2014 via GR)']
    ] },
  { id: 'men4', name: 'MEN4 (CDKN1B)', genes: ['CDKN1B'], inh: 'AD', tests: ['R217','R151'],
    rules: [
      ['parathyroid', 'adenoma', 'M', 40, null, null, ['gr:NBK594826', 'singeisen2023'], 'PHPT in 75% of reported cases (symptomatic cohort); median age 51'],
      ['pituitary', 'gh|other', 'M', 40, null, null, ['gr:NBK594826', 'singeisen2023'], 'Pituitary adenoma 44%; median age 39'],
      ['pancreas', 'pnet', 'M', null, null, null, ['gr:NBK594826', 'singeisen2023'], 'Endocrine pancreas 15% (7/48)'],
      ['net', '*', 'W', null, null, null, ['gr:NBK594826'], 'Thymic/bronchial/ileal carcinoid 4-7%'],
      ['thyroid', 'papillary', 'W', null, null, null, ['gr:NBK594826', 'singeisen2023'], 'PTC 8%']
    ] },
  { id: 'men2', name: 'Multiple endocrine neoplasia type 2 (RET)', genes: ['RET'], inh: 'AD', tests: ['R218','R217','R223','R151'],
    rules: [
      ['thyroid', 'medullary', 'H', null, null, null, ['gr:NBK1257', 'us:ata_men2', 'clingen:RET'], 'MTC 95% MEN2A, ~100% MEN2B/FMTC; germline RET in 20-30% of all MTC and 6-7% of simplex MTC'],
      ['adrenal', 'phaeo', 'S', 40, null, null, ['gr:NBK1257'], 'Phaeochromocytoma ~50% MEN2A and MEN2B; ~5% of non-syndromic phaeo carry germline RET'],
      ['parathyroid', 'adenoma', 'M', null, null, null, ['gr:NBK1257'], 'HPT 20-30% in MEN2A (mean onset 38); <1% MEN2B']
    ] },
  { id: 'hptjt', name: 'Hyperparathyroidism–jaw tumour syndrome (CDC73)', genes: ['CDC73'], inh: 'AD', tests: ['R226','R151','R217'],
    rules: [
      ['parathyroid', 'carcinoma', 'S', null, null, null, ['gr:NBK3789', 'clingen:CDC73'], 'Parathyroid carcinoma in 10-15% (up to 23-31% in recent series); germline CDC73 in 20-29% of apparently sporadic PC'],
      ['feature', 'jaw', 'S', null, null, null, ['gr:NBK3789'], 'Ossifying fibroma 11-40%'],
      ['parathyroid', 'adenoma', 'S', 35, null, null, ['gr:NBK3789'], 'PHPT penetrance 8% at 25, 53% at 50, 75% at 70 (van der Tuin 2017)'],
      ['kidney', 'wilms|papillary1|nos', 'W', null, null, null, ['gr:NBK3789']],
      ['uterus', '*', 'W', null, null, null, ['gr:NBK3789']],
      ['feature', 'renal_cysts', 'M', null, null, null, ['gr:NBK3789'], 'Kidney lesions 15-20%']
    ] },
  { id: 'fipa', name: 'Familial isolated pituitary adenoma (AIP)', genes: ['AIP'], inh: 'AD', tests: ['R217'],
    rules: [
      ['pituitary', 'gh', 'S', 30, null, null, ['gr:NBK97965'], 'Acromegaly in ~80% of AIP-FIPA, gigantism in ~1/3; AIP PV in ~20% of simplex childhood GH adenomas; median age at diagnosis 23'],
      ['pituitary', 'other', 'M', 30, null, null, ['gr:NBK97965'], 'Prolactinoma ~10%, NF-PitNET 8%']
    ] },
  { id: 'carney', name: 'Carney complex (PRKAR1A)', genes: ['PRKAR1A'], inh: 'AD', tests: ['R156','R160','R217'],
    rules: [
      ['feature', 'cardiac_myxoma', 'S', null, null, null, ['gr:NBK1286', 'us:carney_nih']],
      ['feature', 'ppnad', 'H', null, null, null, ['gr:NBK1286']],
      ['feature', 'pigment_carney', 'S', null, null, null, ['gr:NBK1286', 'us:carney_nih']],
      ['testis', 'lccsct', 'S', null, null, null, ['gr:NBK1286', 'us:carney_nih'], 'LCCSCT in 1/3 of males at presentation; most adult males'],
      ['pituitary', 'gh', 'M', null, null, null, ['gr:NBK1286'], 'Clinical acromegaly ~10% of adults'],
      ['cns', 'schwannoma', 'M', null, null, null, ['gr:NBK1286', 'us:carney_nih'], 'Psammomatous melanotic schwannoma ~10% (10% of these malignant)'],
      ['thyroid', 'follicular|papillary', 'W', null, null, null, ['gr:NBK1286']],
      ['pancreas', '*', 'W', null, null, null, ['gr:NBK1286'], '2.5% (9/354)'],
      ['ovary', '*', 'W', null, null, null, ['gr:NBK1286']]
    ] },
  { id: 'mas', name: 'McCune–Albright syndrome (GNAS, usually mosaic)', genes: ['GNAS'], inh: 'Post-zygotic mosaic',
    note: 'Only activating (gain-of-function) GNAS variants are relevant; usually detected in affected tissue.',
    tests: ['R327'],
    rules: [
      ['feature', 'fibrous_dysplasia', 'H', null, null, null, ['gr:NBK274564']],
      ['pituitary', 'gh', 'S', null, null, null, ['gr:NBK274564'], 'GH excess 15-20%'],
      ['feature', 'cal', 'W', null, null, null, ['gr:NBK274564']],
      ['thyroid', '*', 'W', null, null, null, ['gr:NBK274564']],
      ['breast', '*', 'W', null, null, null, ['gr:NBK274564']],
      ['pancreas', '*', 'W', null, null, null, ['gr:NBK274564'], 'IPMN ~46% in one cohort; adenocarcinoma rare']
    ] },

  /* ---------- PPGL / renal ---------- */
  { id: 'vhl', name: 'von Hippel–Lindau disease (VHL)', genes: ['VHL'], inh: 'AD', tests: ['R225','R224','R223','R217'],
    rules: [
      ['cns', 'hb', 'H', 60, null, null, ['gr:NBK1463', 'us:aacr_brain'], 'Retinal haemangioblastoma in ~70%, mean age at detection ~25 y; CNS haemangioblastoma is the prototypic lesion (GeneReviews)'],
      ['feature', 'elst', 'H', null, null, null, ['gr:NBK1463'], 'Endolymphatic sac tumour in ~10-16% (GeneReviews)'],
      ['kidney', 'ccrcc', 'S', 46, null, null, ['gr:NBK1463', 'nccn_insights_kidney2021', 'nccn_kidney2022'], 'Clear cell RCC ~70% by age 60 (GeneReviews)'],
      ['adrenal', 'phaeo', 'S', 40, null, null, ['gr:NBK1463'], 'High risk in VHL type 2 (missense) families; low in type 1'],
      ['ppgl', 'ta', 'M', null, null, null, ['gr:NBK1463']],
      ['pancreas', 'pnet', 'M', null, null, null, ['gr:NBK1463'], 'Pancreatic NET in 5-17% (GeneReviews)'],
      ['feature', 'epididymal', 'S', null, null, null, ['gr:NBK1463']],
      ['feature', 'renal_cysts', 'M', null, null, null, ['gr:NBK1463']]
    ] },
  { id: 'sdhb', name: 'Hereditary PPGL (SDHB)', genes: ['SDHB'], inh: 'AD', tests: ['R223','R224','R363'],
    rules: [
      ['kidney', 'sdhrcc', 'H', null, null, null, ['ukcgg:sdhb', 'andrews2018', 'eu:sdhx_consensus', 'nccn_insights_kidney2021', 'aacr_vhl_ppgl2017'], 'Renal tumour risk ~4.7% by 60 (Andrews 2018)'],
      ['ppgl', 'ta', 'S', null, null, null, ['ukcgg:sdhb', 'gr:NBK1548', 'andrews2018', 'us:endo_ppgl'], 'PPGL/HNPGL penetrance ~22% by 60 in non-index carriers; metastatic disease 4.2% by 60 (Andrews 2018)'],
      ['ppgl', 'hn', 'M', null, null, null, ['ukcgg:sdhb', 'gr:NBK1548']],
      ['adrenal', 'phaeo', 'M', null, null, null, ['ukcgg:sdhb', 'gr:NBK1548']],
      ['sarcoma', 'gist', 'M', null, null, null, ['ukcgg:sdhb', 'eu:sdhx_consensus', 'gr:NBK1548', 'aacr_vhl_ppgl2017']],
      ['kidney', 'ccrcc|nos', 'W', 40, null, null, ['gr:NBK1548', 'andrews2018'], 'Lifetime clear cell RCC 4.7% vs 1.7% general population (GeneReviews, citing Andrews 2018)'],
      ['pituitary', '*', 'W', null, null, null, ['ukcgg:sdhb', 'eu:sdhx_consensus']]
    ] },
  { id: 'sdhd', name: 'Hereditary PPGL (SDHD)', genes: ['SDHD'], inh: 'AD (paternal transmission)',
    note: 'Tumours almost exclusively when inherited from the father (maternal imprinting).',
    tests: ['R223','R363'],
    rules: [
      ['ppgl', 'hn', 'S', null, null, null, ['ukcgg:sdhd', 'gr:NBK1548', 'andrews2018', 'us:endo_ppgl'], 'PPGL/HNPGL penetrance ~43% by 60 in non-index paternally inherited carriers (Andrews 2018); ~75% have multifocal tumours'],
      ['ppgl', 'ta', 'M', null, null, null, ['ukcgg:sdhd', 'gr:NBK1548']],
      ['adrenal', 'phaeo', 'M', null, null, null, ['ukcgg:sdhd', 'gr:NBK1548']],
      ['sarcoma', 'gist', 'W', null, null, null, ['ukcgg:sdhd', 'gr:NBK1548', 'aacr_vhl_ppgl2017']],
      ['kidney', 'sdhrcc', 'M', null, null, null, ['ukcgg:sdhd', 'eu:sdhx_consensus', 'nccn_insights_kidney2021', 'aacr_vhl_ppgl2017'], 'RCC in ~2-3% of SDHx carriers (SDHx consensus)'],
      ['pituitary', '*', 'W', null, null, null, ['ukcgg:sdhd', 'andrews2018']],
      ['kidney', 'ccrcc|nos', 'W', null, null, null, ['gr:NBK1548', 'ukcgg:sdhd']]
    ] },
  { id: 'sdhc', name: 'Hereditary PPGL (SDHC)', genes: ['SDHC'], inh: 'AD', tests: ['R223','R363'],
    rules: [
      ['ppgl', 'hn', 'S', null, null, null, ['ukcgg:sdhc', 'eu:sdhx_consensus', 'gr:NBK1548', 'us:endo_ppgl'], 'PPGL/HNPGL penetrance ~25% by 60 (Andrews 2018; GeneReviews notes this is higher than clinical experience)'],
      ['ppgl', 'ta', 'M', null, null, null, ['gr:NBK1548', 'andrews2018']],
      ['sarcoma', 'gist', 'M', null, null, null, ['ukcgg:sdhc', 'gr:NBK1548', 'eu:sdhx_consensus', 'aacr_vhl_ppgl2017']],
      ['kidney', 'sdhrcc', 'M', null, null, null, ['ukcgg:sdhc', 'nccn_insights_kidney2021', 'aacr_vhl_ppgl2017']],
      ['pituitary', '*', 'W', null, null, null, ['ukcgg:sdhc', 'andrews2018']],
      ['adrenal', 'phaeo', 'W', null, null, null, ['ukcgg:sdhc', 'andrews2018']]
    ] },
  { id: 'sdha', name: 'Hereditary PPGL (SDHA)', genes: ['SDHA'], inh: 'AD (low penetrance)', tests: ['R223','R363'],
    rules: [
      ['sarcoma', 'gist', 'M', null, null, null, ['ukcgg:sdha', 'eu:sdhx_consensus', 'gr:NBK1548', 'aacr_vhl_ppgl2017'], 'SDHx variants are found in ~15% of adult and 85% of childhood GIST, mostly germline SDHA (SDHx consensus)'],
      ['ppgl', '*', 'M', null, null, null, ['ukcgg:sdha', 'gr:NBK1548', 'bausch2017', 'aacr_vhl_ppgl2017'], 'Penetrance ~10% by 70 in non-index carriers (10-13% lifetime)'],
      ['kidney', 'sdhrcc', 'M', null, null, null, ['ukcgg:sdha', 'nccn_insights_kidney2021', 'aacr_vhl_ppgl2017']],
      ['adrenal', 'phaeo', 'W', null, null, null, ['ukcgg:sdha', 'gr:NBK1548', 'bausch2017']],
      ['pituitary', '*', 'W', null, null, null, ['ukcgg:sdha']],
      ['nb', '*', 'W', null, null, null, ['ukcgg:sdha']]
    ] },
  { id: 'sdhaf2', name: 'Hereditary PPGL (SDHAF2)', genes: ['SDHAF2'], inh: 'AD (paternal transmission)',
    tests: ['R223'], rules: [
      ['ppgl', 'hn', 'S', null, null, null, ['gr:NBK1548', 'clingen:SDHAF2', 'aacr_vhl_ppgl2017'], '~90% multiple tumours; penetrance unknown (GeneReviews)']
    ] },
  { id: 'tmem127', name: 'Hereditary phaeochromocytoma (TMEM127)', genes: ['TMEM127'], inh: 'AD', tests: ['R223'],
    rules: [
      ['adrenal', 'phaeo', 'S', null, null, null, ['gr:NBK1548', 'armaizpena2021', 'clingen:TMEM127', 'aacr_vhl_ppgl2017'], 'PHEO in 85.5% of 110 index cases, mean age 45; ~25% bilateral (Armaiz-Pena 2021)'],
      ['ppgl', '*', 'W', null, null, null, ['gr:NBK1548', 'armaizpena2021'], 'PGL in 9% of index cases'],
      ['kidney', 'ccrcc', 'W', null, null, null, ['gr:NBK1548', 'armaizpena2021'], 'RCC in 5.4% of index cases; causal link not yet proven']
    ] },
  { id: 'max', name: 'Hereditary phaeochromocytoma (MAX)', genes: ['MAX'], inh: 'AD (paternal transmission)',
    tests: ['R223'], rules: [
      ['adrenal', 'phaeo', 'S', 40, null, null, ['gr:NBK1548', 'burnichon2012', 'bausch2017', 'aacr_vhl_ppgl2017'], 'All MAX index cases had adrenal tumours, often bilateral or multiple (~60% bilateral); age at diagnosis lower than in non-mutated cases'],
      ['ppgl', 'ta', 'M', null, null, null, ['burnichon2012', 'gr:NBK1548'], '15.8% developed additional thoraco-abdominal tumours']
    ] },
  { id: 'hlrcc', name: 'Hereditary leiomyomatosis and RCC (FH)', genes: ['FH'], inh: 'AD', tests: ['R365','R224','R223'],
    rules: [
      ['kidney', 'fhrcc', 'H', null, null, null, ['ukcgg:fh', 'gr:NBK1252', 'nccn_insights_kidney2021', 'nccn_kidney2022', 'us:aacr_fh'], 'Lifetime renal cancer ~15-20%, 2-4% before 20, mean age early 40s (UKCGG)'],
      ['feature', 'cutleio', 'H', null, null, null, ['ukcgg:fh', 'gr:NBK1252', 'us:aacr_fh'], 'Lifetime ~45-80%, mean onset 30s (UKCGG)'],
      ['feature', 'fibroids', 'S', 40, null, null, ['ukcgg:fh', 'gr:NBK1252', 'us:aacr_fh'], 'Lifetime ~40-60%, mean onset 30s (UKCGG); mean age at identification ~30 (GeneReviews)'],
      ['uterus', 'lms', 'W', null, null, null, ['ukcgg:fh', 'gr:NBK1252']],
      ['kidney', 'papillary1|nos', 'W', 40, null, null, ['ukcgg:fh', 'gr:NBK1252']],
      ['ppgl', '*', 'W', null, null, null, ['ukcgg:fh', 'gr:NBK1252']],
      ['adrenal', 'phaeo', 'W', null, null, null, ['ukcgg:fh', 'gr:NBK1252']]
    ] },
  { id: 'bhd', name: 'Birt–Hogg–Dubé syndrome (FLCN)', genes: ['FLCN'], inh: 'AD', tests: ['R224','R190','R230'],
    rules: [
      ['kidney', 'chromophobe', 'S', 50, null, null, ['ukcgg:flcn', 'eu:ern_bhd', 'gr:NBK1522', 'nccn_insights_kidney2021'], 'Lifetime renal cancer ~15-30%, mean onset ~50 (UKCGG); median age 46 (ERN)'],
      ['feature', 'fibrofolliculoma', 'H', null, null, null, ['ukcgg:flcn', 'eu:ern_bhd', 'gr:NBK1522'], '~40% by 30, nearly complete by 70 (UKCGG)'],
      ['feature', 'lungcysts', 'S', null, null, null, ['ukcgg:flcn', 'eu:ern_bhd'], 'Lung cysts ~75-85% lifetime; pneumothorax ~30% (UKCGG), 24-48% (ERN), median ~34 y'],
      ['kidney', 'ccrcc', 'W', 50, null, null, ['ukcgg:flcn', 'eu:ern_bhd', 'gr:NBK1522']],
      ['kidney', 'papillary1|nos', 'W', null, null, null, ['ukcgg:flcn', 'eu:ern_bhd', 'gr:NBK1522']]
    ] },
  { id: 'hprc', name: 'Hereditary papillary renal carcinoma (MET)', genes: ['MET'], inh: 'AD',
    note: 'Activating MET variants.', tests: ['R224'],
    rules: [
      ['kidney', 'papillary1', 'S', 45, null, null, ['ukcgg:met', 'clingen:MET', 'schmidt2004', 'nccn_insights_kidney2021'], 'Penetrance almost complete by 80 under surveillance; median age at renal cancer 43 (UKCGG); 46-63 in three families (Schmidt 2004)']
    ] },
  { id: 'tsc', name: 'Tuberous sclerosis complex (TSC1 / TSC2)', genes: ['TSC1', 'TSC2'], inh: 'AD', tests: ['R228', 'R190'],
    rules: [
      ['cns', 'sega', 'H', null, null, null, ['gr:NBK1220', 'us:aacr_pten_dicer1_tsc', 'us:aacr_brain'], 'SEGA in up to 25% (GeneReviews)'],
      ['kidney', 'aml', 'H', null, null, null, ['gr:NBK1220', 'us:aacr_pten_dicer1_tsc', 'nccn_insights_kidney2021'], 'Renal AML ~70% (GeneReviews)'],
      ['feature', 'tsc_skin', 'H', null, null, null, ['gr:NBK1220'], 'Hypomelanotic macules ~90%, facial angiofibromas ~75%, shagreen ~50%'],
      ['feature', 'cardiac_rhabdo', 'H', null, null, null, ['gr:NBK1220', 'us:aacr_pten_dicer1_tsc'], '~50%; 90-95% of fetuses with >=2 rhabdomyomas have TSC'],
      ['kidney', 'ccrcc|chromophobe|nos', 'M', 45, null, null, ['gr:NBK1220', 'us:aacr_pten_dicer1_tsc', 'nccn_insights_kidney2021'], 'RCC in 2-5%, typical age at diagnosis 28-30 (GeneReviews)'],
      ['pancreas', 'pnet', 'M', null, null, null, ['gr:NBK1220', 'us:aacr_pten_dicer1_tsc']],
      ['feature', 'lungcysts', 'M', null, null, null, ['gr:NBK1220'], 'LAM in 30-40% of women (up to 80% by 40), cystic change in 10-12% of men'],
      ['sarcoma', 'chordoma', 'W', null, null, null, ['us:aacr_brain'], 'Rare; familial (sacral) chordoma linked to TSC1/2 (AACR 2024)']
    ] },
  { id: 'bap1', name: 'BAP1 tumour predisposition syndrome', genes: ['BAP1'], inh: 'AD', tests: ['R422','R224','R254'],
    rules: [
      ['eye', 'uveal', 'S', 40, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611', 'us:aacr_brain'], 'Lifetime ~25%, mean age 50s, range 15-80 (UKCGG)'],
      ['feature', 'bimt', 'H', null, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611', 'us:aacr_brain'], 'BIMT in up to 72% of carriers'],
      ['meso', '*', 'S', 60, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611', 'us:aacr_brain'], 'Lifetime ~20% (15-25%); median onset 55-58 vs 68-72 sporadic'],
      ['skin', 'melanoma', 'S', null, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611', 'us:aacr_brain'], 'Lifetime ~20%, mean age 40s-50s (UKCGG)'],
      ['kidney', 'ccrcc|nos', 'M', 45, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611', 'nccn_insights_kidney2021', 'us:aacr_brain'], 'Lifetime ~5-10%, mean age early 40s (UKCGG)'],
      ['cns', 'meningioma', 'M', null, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611', 'us:aacr_brain'], '8.5% of probands, 2.2% of relatives; often high-grade/rhabdoid'],
      ['biliary', 'cholangio', 'W', null, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611'], '1.4% of probands, 0 relatives (GeneReviews)'],
      ['skin', 'bcc', 'W', null, null, null, ['gr:NBK390611'], 'Median age of non-melanoma skin cancer 44 (Walpole 2018, via GeneReviews)'],
      ['liver', 'hcc', 'W', null, null, null, ['ukcgg:bap1', 'eu:bap1_eu', 'gr:NBK390611'], '0.7% of probands, 1.6% of relatives']
    ] },

  /* ---------- Skin ---------- */
  { id: 'cdkn2a', name: 'Familial melanoma / melanoma–pancreatic cancer (CDKN2A)', genes: ['CDKN2A'], inh: 'AD',
    tests: ['R254','R367','R221'],
    rules: [
      ['skin', 'melanoma', 'S', 40, null, null, ['gr:NBK616232', 'clingen:CDKN2A', 'us:aacr_brain'], 'Lifetime melanoma 28-76%; median onset ~40 y vs mid-60s sporadic (GeneReviews)'],
      ['pancreas', 'pdac', 'S', 60, null, null, ['gr:NBK616232', 'clingen:CDKN2A', 'us:aacr_brain'], 'Lifetime pancreatic cancer ~15-20% (~12-fold); mean onset 65-71 y (GeneReviews)'],
      ['cns', 'hgg', 'W', null, null, null, ['gr:NBK616232', 'us:aacr_brain'], 'Nervous system tumour risk \'elevated\' with p14ARF-disrupting variants; no figure (GeneReviews Table 2)'],
      ['eye', 'uveal', 'W', null, null, null, ['gr:NBK616232']],
      ['headneck', 'scc', 'W', null, null, null, ['gr:NBK616232']],
      ['cns', 'lgg', 'W', null, null, null, ['gr:NBK616232']],
      ['lung', '*', 'W', null, null, null, ['gr:NBK616232']]
    ],
    note: 'Whole-gene CDKN2A/CDKN2B deletion causes melanoma–astrocytoma syndrome (melanoma, malignant glioma, pancreatic cancer); some people with a clinical NF1 diagnosis have been reclassified to it.' },
  { id: 'cdk4', name: 'Familial melanoma (CDK4)', genes: ['CDK4'], inh: 'AD', tests: ['R254'],
    rules: [
      ['skin', 'melanoma', 'S', 40, null, null, ['puntervoll2013', 'clingen:CDK4'], 'Median age at first melanoma 39 y; 42% multiple primaries (17 families, Puntervoll 2013)'],
      ['pancreas', 'pdac', 'W', null, null, null, ['puntervoll2013'], 'Only 2 pancreatic cancers across 17 CDK4 families']
    ] },
  { id: 'pot1', name: 'POT1 tumour predisposition', genes: ['POT1'], inh: 'AD', tests: ['R216','R254'],
    rules: [
      ['sarcoma', 'angiosarcoma', 'S', null, null, null, ['ukcgg:pot1', 'gr:NBK563529'], 'Lifetime angiosarcoma/cardiac angiosarcoma ~2% (vs 0.005% population) (UKCGG)'],
      ['skin', 'melanoma', 'M', 40, null, null, ['ukcgg:pot1', 'gr:NBK563529', 'tsoulaki2025'], 'Lifetime melanoma ~3.3-5% (vs 2.5% population), onset 15-80 y (UKCGG)'],
      ['cns', 'hgg|lgg', 'M', null, null, null, ['ukcgg:pot1', 'gr:NBK563529', 'us:aacr_brain'], 'Glioma risk estimates not yet available (UKCGG); oligodendroglioma in familial glioma kindreds'],
      ['heme', 'cll', 'M', null, null, null, ['ukcgg:pot1', 'gr:NBK563529'], 'Lifetime CLL ~1-2% (vs 0.5% population) (UKCGG)'],
      ['heme', 'lymphoma', 'W', null, null, null, ['gr:NBK563529'], 'T-cell clonality incl. cutaneous T-cell lymphoma in 5/18 carriers (DeBoy 2024, via GeneReviews)'],
      ['thyroid', 'papillary', 'W', null, null, null, ['gr:NBK563529'], 'POT1 PVs in 1.5% of selected and 0.7% of unselected PTC (DeBoy 2024, via GeneReviews)']
    ] },
  { id: 'gorlin', name: 'Gorlin syndrome / naevoid BCC syndrome (PTCH1)', genes: ['PTCH1'], inh: 'AD', tests: ['R214','R456'],
    rules: [
      ['skin', 'bcc', 'H', null, null, 20, ['eu:bcns_eu', 'eu:siope_gorlin'], 'BCC before 20 is a major diagnostic criterion; ~12-13% by age 20'],
      ['feature', 'okc', 'H', null, null, null, ['eu:siope_gorlin', 'gr:NBK1151', 'us:aacr_brain'], 'Jaw keratocysts in 75-89% (PTCH1 only)'],
      ['feature', 'palmarpits', 'H', null, null, null, ['gr:NBK1151', 'eu:bcns_eu']],
      ['feature', 'falx', 'H', null, null, 20, ['gr:NBK1151'], 'Falx calcification in 90% by age 30; a major criterion when lamellar or under 20'],
      ['feature', 'falx', 'M', null, null, null, ['gr:NBK1151'], 'Falx calcification is common in older adults; less specific after 20'],
      ['skin', 'bcc', 'M', 30, null, null, ['eu:siope_gorlin', 'eu:bcns_eu', 'gr:NBK1151', 'clingen:PTCH1', 'us:aacr_brain'], 'Median first BCC 33 y; cumulative BCC ~13% by 20 and 76-80% by 50 (Manchester, SIOPE)'],
      ['cns', 'medullo_shh', 'M', 5, null, null, ['eu:siope_gorlin', 'eu:bcns_eu', 'gr:NBK1151', 'us:aacr_brain'], 'Medulloblastoma ~0.4-2.4% in PTCH1 carriers (SIOPE 0.37%; BAD 1.2-2.4%); peak age 1-2 y'],
      ['feature', 'cardiac_fibroma', 'M', null, null, null, ['eu:siope_gorlin', 'eu:bcns_eu', 'gr:NBK1151', 'us:aacr_brain'], 'Cardiac fibroma in 1-5% of NBCCS, usually congenital/infancy'],
      ['ovary', 'fibroma', 'M', null, null, null, ['eu:siope_gorlin', 'eu:bcns_eu', 'gr:NBK1151', 'us:aacr_brain'], 'Ovarian fibroma in ~20% of females (6-60%), often bilateral and calcified, ages 16-45'],
      ['cns', 'meningioma', 'W', null, null, null, ['eu:siope_gorlin', 'gr:NBK1151', 'us:aacr_brain'], 'Meningioma ~2% in PTCH1-related NBCCS (vs 11-30% SUFU)'],
      ['feature', 'macrocephaly', 'W', null, null, null, ['gr:NBK1151', 'eu:bcns_eu'], 'Macrocephaly ~50% (BAD)'],
      ['feature', 'cleft', 'W', null, null, null, ['gr:NBK1151'], 'Cleft lip/palate ~5%']
    ] },
  { id: 'sufu', name: 'SUFU-related predisposition (Gorlin spectrum)', genes: ['SUFU'], inh: 'AD', tests: ['R214','R456','R221'],
    rules: [
      ['cns', 'medullo_shh', 'S', 3, null, null, ['eu:siope_gorlin', 'eu:bcns_eu', 'gr:NBK1151', 'us:aacr_brain', 'clingen:SUFU'], 'Medulloblastoma penetrance ~7-9.2% (SIOPE), up to 33% in NBCCS series; almost all under 3 y'],
      ['cns', 'meningioma', 'S', null, null, null, ['gr:NBK1151', 'eu:siope_gorlin', 'us:aacr_brain'], 'Meningioma in 11-30% of SUFU-related NBCCS (vs ~2% PTCH1); 4/9 SUFU carriers in Manchester cohort'],
      ['skin', 'bcc', 'M', 40, null, null, ['eu:siope_gorlin', 'us:aacr_brain'], 'BCC risk much lower than PTCH1: 1/34 adult carrier relatives (median age 51) had BCC'],
      ['ovary', 'fibroma', 'M', null, null, null, ['eu:siope_gorlin', 'gr:NBK1151', 'us:aacr_brain'], 'Ovarian fibroma 3/7 female SUFU carriers vs 4/68 PTCH1 (Manchester)'],
      ['feature', 'macrocephaly', 'W', null, null, null, ['eu:siope_gorlin', 'gr:NBK1151']]
    ] },
  { id: 'xp', name: 'Xeroderma pigmentosum',
    genes: ['XPA', 'XPC', 'ERCC2', 'ERCC3', 'ERCC4', 'ERCC5', 'DDB2', 'POLH'], inh: 'AR', tests: ['R227'],
    rules: [
      ['skin', 'bcc|scc|melanoma', 'S', null, null, 20, ['gr:NBK1397'], 'Skin cancer within the first decade without UV protection'],
      ['feature', 'photosens', 'H', null, null, null, ['gr:NBK1397'], 'Freckle-like lesions on sun-exposed skin 100%; acute sunburn ~60%'],
      ['skin', 'bcc|scc|melanoma', 'M', 30, null, null, ['gr:NBK1397', 'clingen:XPC'], 'NMSC >10,000-fold (median onset 9 y); melanoma >2,000-fold (median 22 y) under age 20 (Bradford 2011, via GeneReviews)'],
      ['headneck', 'scc', 'M', 30, null, null, ['gr:NBK1397']],
      ['thyroid', 'papillary', 'M', null, null, null, ['gr:NBK1397'], 'Thyroid cancer frequency ~74-fold increased (Nikolaev 2022); 2/29 with PTC in NIH prospective series']
    ] },

  /* ---------- CNS / nerve sheath ---------- */
  { id: 'nf1', name: 'Neurofibromatosis type 1 (NF1)', genes: ['NF1'], inh: 'AD', tests: ['R222','R376','R457'],
    rules: [
      ['cns', 'optic', 'H', null, null, null, ['eu:ern_nf1', 'eu:nf1_criteria', 'gr:NBK1109', 'us:aacr_ras', 'us:aacr_brain'], 'LGG in ~20% of NF1, mostly optic pathway, mean age 4.5 y'],
      ['sarcoma', 'mpnst', 'H', 25, null, null, ['eu:ern_nf1', 'gr:NBK1109', 'us:aacr_ras'], 'Lifetime MPNST 8-16%, usually diagnosed at 20-40 y (ERN)'],
      ['feature', 'cal', 'H', null, null, null, ['eu:nf1_criteria', 'eu:ern_nf1']],
      ['feature', 'neurofibromas', 'H', null, null, null, ['eu:nf1_criteria', 'eu:ern_nf1', 'us:aacr_ras']],
      ['cns', 'lgg', 'S', 20, null, null, ['eu:ern_nf1', 'us:aacr_ras'], 'Non-OPG glioma in ~4-5% of NF1; most LGG in childhood'],
      ['sarcoma', 'gist', 'S', null, null, null, ['eu:ern_nf1', 'us:aacr_ras', 'gr:NBK1109'], '~200-fold increased GIST risk; mean age ~53, often multiple, small bowel, KIT/PDGFRA wild-type'],
      ['heme', 'jmml', 'S', null, null, null, ['eu:ern_nf1', 'gr:NBK1109', 'us:aacr_ras'], 'JMML hundreds of times more frequent in NF1, but absolute risk <1%'],
      ['net', 'duodenal_som', 'S', null, null, null, ['gr:NBK1109']],
      ['cns', 'hgg', 'M', null, null, null, ['eu:ern_nf1', 'us:aacr_ras']],
      ['adrenal', 'phaeo', 'M', null, null, null, ['eu:ern_nf1', 'us:aacr_ras'], 'PPGL in 1-5% of adults with NF1, median 40-50 y; 12% malignant'],
      ['breast', '*', 'M', 50, null, null, ['eu:ern_nf1', 'gr:NBK1109', 'us:aacr_ras'], 'Excess breast cancer confined to women aged 30-50; more often ER-/HER2+; annual MRI from 30 (ERN)', 'AACR 2024: breast screening (mammography, consider MRI) discussed from about age 30, earlier than UK practice'],
      ['sarcoma', 'rms', 'M', null, null, null, ['eu:ern_nf1', 'gr:NBK1109', 'us:aacr_ras'], 'Rare; higher frequency than general population in early childhood'],
      ['nb', '*', 'W', null, null, null, ['us:aacr_ras'], 'Rare (<1%); childhood']
    ] },
  { id: 'nf2', name: 'NF2-related schwannomatosis (NF2)', genes: ['NF2'], inh: 'AD', tests: ['R221'],
    rules: [
      ['cns', 'vs', 'H', 30, null, null, ['us:aacr_schwann', 'gr:NBK1201', 'clingen:NF2'], 'Bilateral VS ~100%; 88% by age 30 (AACR 2024)'],
      ['cns', 'meningioma', 'S', 30, null, null, ['us:aacr_schwann', 'gr:NBK1201'], 'Lifetime meningioma ~70%, often first tumour in childhood (AACR 2024)'],
      ['cns', 'ependymoma', 'S', null, null, null, ['us:aacr_schwann', 'gr:NBK1201', 'us:aacr_brain'], 'Spinal ependymoma 20-40% (lifetime ~25%), usually non-progressive'],
      ['cns', 'schwannoma', 'S', null, null, null, ['us:aacr_schwann', 'gr:NBK1201'], 'Non-vestibular cranial schwannoma ~40%; spinal/peripheral and intradermal schwannomas common (AACR 2024 Table 1)']
    ] },
  { id: 'smarcb1', name: 'SMARCB1: rhabdoid tumour predisposition / schwannomatosis', genes: ['SMARCB1'], inh: 'AD',
    tests: ['R456','R221'],
    rules: [
      ['cns', 'atrt', 'H', 2, null, null, ['eu:siope_rhabdoid', 'gr:NBK469816', 'us:aacr_brain', 'clingen:SMARCB1'], 'Penetrance possibly >90% by age 5; RTPS median onset 4-7 months vs ~18 months sporadic; CNS is most common site (65%)'],
      ['kidney', 'rhabdoid', 'H', 2, null, null, ['eu:siope_rhabdoid', 'gr:NBK469816', 'us:aacr_brain'], 'As above; RTK median 13 months in EU-RHAB'],
      ['sarcoma', 'mrt', 'H', 2, null, null, ['eu:siope_rhabdoid', 'gr:NBK469816', 'us:aacr_brain'], 'Extracranial MRT (soft tissue, liver, etc.) ~23% of EU-RHAB rhabdoid tumours; synchronous tumours in ~25% of RTPS'],
      ['cns', 'schwannoma', 'S', null, null, null, ['eu:ern_schwann', 'us:aacr_schwann', 'gr:NBK487394', 'us:aacr_brain'], 'SMARCB1 explains ~40% of familial and ~10% of sporadic schwannomatosis; peripheral 90%, spinal 75%'],
      ['cns', 'cribriform', 'M', null, null, null, ['us:aacr_brain', 'eu:siope_rhabdoid']],
      ['cns', 'meningioma', 'W', null, null, null, ['us:aacr_schwann', 'eu:ern_schwann', 'us:aacr_brain'], 'Meningioma ~5% in SMARCB1-SWN (vs 70% NF2)'],
      ['sarcoma', 'mpnst', 'W', null, null, null, ['eu:ern_schwann', 'us:aacr_schwann', 'us:aacr_brain'], 'Four SMARCB1-SWN MPNSTs reported, some without radiation']
    ],
    note: 'Includes distal 22q11.2 deletions spanning SMARCB1. Gonadal mosaicism occurs: test young at-risk siblings even if parents test negative.' },
  { id: 'lztr1', name: 'LZTR1-related schwannomatosis', genes: ['LZTR1'], inh: 'AD',
    note: 'Biallelic LZTR1 also causes autosomal recessive Noonan syndrome.', tests: ['R221'],
    rules: [
      ['cns', 'schwannoma', 'M', null, null, null, ['eu:ern_schwann', 'us:aacr_schwann', 'gr:NBK487394', 'clingen:LZTR1'], 'Peripheral (90%) and spinal (75%) schwannomas; low penetrance; onset 2nd-4th decade'],
      ['cns', 'vs', 'M', null, null, null, ['eu:ern_schwann', 'us:aacr_schwann'], 'Unilateral VS in ~10% of LZTR1-schwannomatosis'],
      ['cns', 'meningioma', 'W', null, null, null, ['us:aacr_brain', 'us:aacr_schwann'], null, 'AACR schwannomatosis 2025: meningioma not reported in LZTR1-SWN (AACR brain 2024 does list LZTR1 with meningioma)'],
      ['feature', 'rasopathy', 'W', null, null, null, ['us:aacr_schwann', 'clingen:LZTR1', 'us:aacr_ras'], 'LZTR1 accounts for ~8% of Noonan syndrome']
    ] },
  { id: 'smarca4', name: 'SMARCA4: rhabdoid tumour predisposition 2 / SCCOHT', genes: ['SMARCA4'], inh: 'AD',
    tests: ['R456'], rules: [
      ['ovary', 'sccoht', 'H', null, null, null, ['eu:sccoht', 'eu:siope_rhabdoid', 'gr:NBK469816', 'clingen:SMARCA4', 'us:aacr_brain'], 'SCCOHT almost always SMARCA4-deficient; affects females ~18 months to >50 y, mainly under 40'],
      ['cns', 'atrt', 'S', null, null, null, ['eu:siope_rhabdoid', 'gr:NBK469816', 'us:aacr_brain'], 'Incomplete penetrance (rhabdoid tumour in 8/60 carriers in one meta-analysis) but very poor outcome'],
      ['kidney', 'rhabdoid', 'S', null, null, null, ['eu:siope_rhabdoid', 'gr:NBK469816', 'us:aacr_brain']],
      ['sarcoma', 'mrt', 'S', null, null, null, ['eu:siope_rhabdoid', 'gr:NBK469816', 'us:aacr_brain']],
      ['nb', '*', 'W', null, null, null, ['us:aacr_brain', 'gr:NBK469816'], 'Lifetime neuroblastoma penetrance unknown']
    ] },
  { id: 'smarce1', name: 'SMARCE1: familial clear cell meningioma', genes: ['SMARCE1'], inh: 'AD', tests: ['R221'],
    rules: [
      ['cns', 'meningioma_cc', 'H', null, null, 25, ['us:aacr_brain', 'smith2013', 'clingen:SMARCE1'], 'Clear cell meningioma, median age 17.5 y (range 2-72); up to 60% recurrence'],
      ['cns', 'meningioma_cc', 'M', null, null, null, ['us:aacr_brain', 'smith2013', 'clingen:SMARCE1'], 'Adult clear cell meningioma: germline yield lower and not well defined'],
      ['cns', 'meningioma', 'M', 30, null, null, ['smith2013', 'us:aacr_brain'], 'Familial multiple spinal meningiomas (clear cell subtype)']
    ] },
  { id: 'dgcr8', name: 'DGCR8-related familial schwannomatosis with multinodular goitre', genes: ['DGCR8'], inh: 'AD',
    notOnNicpr: true, note: 'Recently described microprocessor defect (AACR 2024 childhood CNS tumour update).', tests: ['R221'],
    rules: [
      ['cns', 'schwannoma', 'W', null, null, null, ['rivera2020', 'us:aacr_brain', 'us:aacr_schwann'], 'Single kindred (DGCR8 p.E518K); penetrance unknown'],
      ['thyroid', 'mng', 'W', null, null, null, ['rivera2020'], 'Early-onset MNG in the index kindred']
    ] },
  { id: 'jmjd1c', name: 'JMJD1C-associated intracranial germ cell tumour predisposition', genes: ['JMJD1C'], inh: 'AD (low penetrance)',
    notOnNicpr: true, tests: ['R89'],
    note: 'Emerging association, notably in Japanese and East Asian patients; germline Fanconi anaemia pathway variants have also been reported in intracranial germ cell tumour series. No surveillance recommendations.',
    rules: [
      ['cns', 'germ', 'W', null, null, null, ['wang2014', 'us:aacr_brain'], 'Rare germline variants enriched in Japanese iGCT patients; no penetrance estimate']
    ] },
  { id: 'elp1', name: 'ELP1-associated SHH medulloblastoma', genes: ['ELP1'], inh: 'AD', tests: ['R456'],
    rules: [
      ['cns', 'medullo_shh', 'S', 15, 'age3plus', 20, ['waszak2020', 'us:aacr_brain'], 'Germline ELP1 LoF in 14.4% (29/202) of paediatric SHH-MB; median age 6.3 y; absent in 51 adult SHH-MB; absolute risk considered low'],
      ['cns', 'medullo_shh', 'M', null, null, 20, ['waszak2020', 'us:aacr_brain'], 'ELP1 SHH-MB is mainly in children aged 3-16; infant SHH-MB is mostly SUFU or PTCH1']
    ],
    note: '14–21% of SHH medulloblastoma in older children (median 6.3 years), with somatic 9q loss. Absolute medulloblastoma risk in carriers is low.' },
  { id: 'gpr161', name: 'GPR161-associated SHH medulloblastoma', genes: ['GPR161'], inh: 'AD', tests: ['R456'],
    rules: [
      ['cns', 'medullo_shh', 'M', 3, null, null, ['begemann2020', 'us:aacr_brain', 'clingen:GPR161'], 'Up to 5% of infant SHH-MB; median age 1.5 y; absolute risk considered low'],
      ['skin', 'bcc', 'W', null, null, null, ['us:aacr_brain', 'begemann2020']],
      ['cns', 'meningioma', 'W', null, null, null, ['us:aacr_brain', 'begemann2020']]
    ],
    note: 'Up to 5% of infant SHH medulloblastoma (median 1.5 years); families may show a Gorlin-like phenotype. Absolute medulloblastoma risk is low.' },

  /* ---------- Paediatric / overgrowth ---------- */
  { id: 'dicer1', name: 'DICER1 tumour predisposition', genes: ['DICER1'], inh: 'AD', tests: ['R364','R456','R457'],
    rules: [
      ['lung', 'ppb', 'H', null, null, null, ['ukcgg:dicer1', 'us:aacr_pten_dicer1_tsc', 'gr:NBK196157', 'clingen:DICER1', 'us:aacr_dicer1'], 'Type I/II/III PPB <10%; lung cysts/type Ir PPB 25-40% (AACR 2024)'],
      ['ovary', 'sertoli', 'H', null, null, null, ['ukcgg:dicer1', 'us:aacr_pten_dicer1_tsc', 'gr:NBK196157', 'us:aacr_dicer1'], 'SLCT <10% (AACR 2024); ~60% of SLCT carry DICER1 GPV (GeneReviews)'],
      ['cervix', 'erms', 'H', null, null, null, ['gr:NBK196157', 'us:aacr_pten_dicer1_tsc', 'us:aacr_dicer1']],
      ['pituitary', 'blastoma', 'H', null, null, null, ['gr:NBK196157', 'us:aacr_pten_dicer1_tsc', 'us:aacr_dicer1', 'us:aacr_brain']],
      ['feature', 'dicer1_rare', 'H', null, null, null, ['ukcgg:dicer1', 'gr:NBK196157', 'us:aacr_dicer1']],
      ['kidney', 'cystic_nephroma', 'S', null, null, null, ['ukcgg:dicer1', 'us:aacr_pten_dicer1_tsc', 'gr:NBK196157', 'us:aacr_dicer1'], 'Cystic nephroma <10% (AACR 2024)'],
      ['cns', 'pineoblastoma', 'S', null, null, null, ['gr:NBK196157', 'us:aacr_pten_dicer1_tsc', 'us:aacr_dicer1', 'us:aacr_brain']],
      ['thyroid', 'mng', 'S', 30, null, null, ['ukcgg:dicer1', 'us:aacr_pten_dicer1_tsc', 'gr:NBK196157', 'us:aacr_dicer1'], 'MNG or thyroidectomy by 20: 32% females, 13% males (GeneReviews/AACR)'],
      ['thyroid', 'follicular|papillary', 'M', 30, null, null, ['ukcgg:dicer1', 'us:aacr_pten_dicer1_tsc', 'gr:NBK196157', 'us:aacr_dicer1'], 'DTC 16-24-fold increased risk (AACR 2024)'],
      ['ovary', 'granulosa_j', 'M', null, null, null, ['gr:NBK196157', 'us:aacr_dicer1']],
      ['sarcoma', 'rms', 'M', null, null, null, ['gr:NBK196157', 'ukcgg:dicer1', 'us:aacr_dicer1']],
      ['kidney', 'wilms', 'W', null, null, null, ['ukcgg:dicer1', 'gr:NBK196157', 'us:aacr_dicer1']],
      ['feature', 'macrocephaly', 'W', null, null, null, ['gr:NBK196157', 'ukcgg:dicer1', 'us:aacr_dicer1']]
    ] },
  { id: 'rb1', name: 'Hereditary retinoblastoma (RB1)', genes: ['RB1'], inh: 'AD', tests: ['R219','R457'],
    rules: [
      ['eye', 'rb', 'H', null, null, null, ['gr:NBK1452', 'clingen:RB1', 'us:aacr_rb']],
      ['cns', 'pineoblastoma', 'S', null, null, null, ['gr:NBK1452', 'schonfeld2021', 'us:aacr_rb', 'us:aacr_brain'], 'Pineoblastoma SIR ~1930 in hereditary RB (Schonfeld 2021)'],
      ['sarcoma', 'osteo', 'S', 25, null, null, ['gr:NBK1452', 'schonfeld2021', 'us:aacr_rb'], 'Bone sarcoma ~9% at 50 years after hereditary RB (Schonfeld 2021)'],
      ['sarcoma', 'sts|lms|rms', 'M', null, null, null, ['gr:NBK1452', 'schonfeld2021', 'us:aacr_rb'], 'Soft tissue sarcoma ~15% at 50 years (Schonfeld 2021)'],
      ['uterus', 'lms', 'M', null, null, null, ['schonfeld2021', 'gr:NBK1452']],
      ['skin', 'melanoma', 'M', null, null, null, ['gr:NBK1452', 'schonfeld2021', 'us:aacr_rb'], 'Melanoma SIR 17, ~5.5% by 50 years after hereditary RB (Schonfeld 2021)']
    ] },
  { id: 'wt1', name: 'WT1-related Wilms tumour predisposition', genes: ['WT1'], inh: 'AD', tests: ['R456'],
    rules: [
      ['kidney', 'wilms', 'S', 2, null, null, ['gr:NBK556455', 'gr:NBK1294', 'us:aacr_bws', 'clingen:WT1'], 'Wilms 38-60% overall, varies by genotype (GeneReviews); 38-43% (AACR 2024)'],
      ['feature', 'gu_anom', 'S', null, null, null, ['gr:NBK556455', 'gr:NBK1294', 'us:aacr_bws']],
      ['testis', 'gct', 'W', null, null, null, ['us:aacr_bws'], 'Gonadoblastoma/dysgerminoma, mainly Frasier syndrome (exon 9/10 splice variants) with dysgenetic gonads; absolute risk not established'],
      ['ovary', 'germ', 'W', null, null, null, ['us:aacr_bws'], 'Gonadoblastoma/dysgerminoma in dysgenetic (streak) gonads, especially 46,XY phenotypic females; absolute risk not established']
    ] },
  { id: 'wilms_other', name: 'Familial Wilms tumour (TRIM28 / REST / CTR9)', genes: ['TRIM28', 'REST', 'CTR9'],
    inh: 'AD', tests: ['R456'], rules: [
      ['kidney', 'wilms', 'M', null, null, null, ['gr:NBK1294', 'us:aacr_bws', 'us:aacr_wilms'], 'TRIM28 and REST each ~2% of Wilms; CTR9 >60% (GeneReviews)']
    ] },
  { id: 'perlman', name: 'Perlman syndrome (DIS3L2)', genes: ['DIS3L2'], inh: 'AR', tests: ['R456'],
    rules: [
      ['kidney', 'wilms', 'S', 2, null, null, ['gr:NBK1294', 'us:aacr_bws', 'clingen:DIS3L2'], 'Wilms ~65% (GeneReviews), ~70% of neonatal survivors (AACR 2024)'],
      ['feature', 'overgrowth', 'S', null, null, null, ['gr:NBK1294', 'us:aacr_bws']]
    ] },
  { id: 'mulibrey', name: 'Mulibrey nanism (TRIM37)', genes: ['TRIM37'], inh: 'AR', tests: ['R456'],
    rules: [
      ['kidney', 'wilms', 'M', null, null, null, ['gr:NBK1294', 'us:aacr_bws', 'clingen:TRIM37'], 'Wilms ~6-8% (GeneReviews/AACR 2024)'],
      ['feature', 'microcephaly', 'S', null, null, null, ['us:aacr_bws', 'gr:NBK1294']]
    ] },
  { id: 'mva', name: 'Mosaic variegated aneuploidy (BUB1B / CEP57 / TRIP13)', genes: ['BUB1B', 'CEP57', 'TRIP13'],
    inh: 'AR', tests: ['R456','R457'],
    rules: [
      ['feature', 'microcephaly', 'S', null, null, null, ['gr:NBK1294', 'us:aacr_gid']],
      ['kidney', 'wilms', 'S', null, null, null, ['gr:NBK1294', 'clingen:BUB1B', 'us:aacr_gid'], 'Wilms: GeneReviews table gives >85% for BUB1B-MVA and ~10% for TRIP13-MVA', 'AACR: convincing cancer risk only for MVA1 (BUB1B) and MVA3 (TRIP13); none of 15 reported MVA2 (CEP57) individuals developed cancer, though surveillance still advised for all MVA'],
      ['sarcoma', 'rms', 'M', null, null, null, ['gr:NBK1294', 'us:aacr_gid']],
      ['heme', '*', 'W', null, null, null, ['gr:NBK1294', 'us:aacr_gid']]
    ] },
  { id: 'bws', name: 'Beckwith–Wiedemann spectrum (CDKN1C)', genes: ['CDKN1C'], inh: 'AD (maternal transmission)',
    tests: ['R49','R456'],
    note: 'Most BWS is epigenetic (11p15 imprinting) rather than a CDKN1C variant. Wilms tumour and hepatoblastoma risk is mainly in IC1 gain of methylation and paternal UPD11; CDKN1C carriers mainly develop neuroblastoma.',
    rules: [
      ['feature', 'overgrowth', 'H', null, null, null, ['eu:bws_consensus', 'us:aacr_bws']],
      ['kidney', 'wilms', 'M', null, null, null, ['eu:bws_consensus', 'us:aacr_bws', 'gr:NBK1294'], 'Wilms 24% IC1 GOM, 7.9% pUPD11, 1.4% CDKN1C, 0.2% IC2 LOM (consensus)', 'AACR: no Wilms tumour reported in 126 BWSp patients with CDKN1C PVs; WT surveillance not recommended for CDKN1C'],
      ['liver', 'hepatoblastoma', 'M', null, null, null, ['eu:bws_consensus', 'us:aacr_bws'], 'HB 3.5% pUPD11, 0.7% IC2 LOM; RR ~2,280 (AACR 2024)', 'AACR: no hepatoblastoma reported in CDKN1C carriers; HB/AFP surveillance not recommended for CDKN1C'],
      ['adrenal', 'acc', 'M', 10, null, null, ['eu:bws_consensus', 'us:aacr_bws'], 'ACC 1.1% in pUPD11 (consensus)', 'AACR: tumours other than neuroblastoma each <1% in CDKN1C carriers (ACC listed only for other BWSp subgroups)'],
      ['nb', '*', 'M', null, null, null, ['eu:bws_consensus', 'us:aacr_bws', 'clingen:CDKN1C'], 'Neuroblastoma 4.2% with CDKN1C (consensus); 3.2% of 126 CDKN1C patients (AACR 2024)'],
      ['sarcoma', 'rms', 'W', null, null, null, ['eu:bws_consensus', 'us:aacr_bws'], 'RMS 0.3-0.5% by subgroup (consensus)', 'AACR: tumours other than neuroblastoma each <1% in CDKN1C carriers (rhabdomyosarcoma listed only for other BWSp subgroups)']
    ] },
  { id: 'sgbs', name: 'Simpson–Golabi–Behmel syndrome (GPC3)', genes: ['GPC3'], inh: 'XL', tests: ['R456','R27'],
    rules: [
      ['feature', 'overgrowth', 'S', null, null, null, ['gr:NBK1219', 'us:aacr_bws']],
      ['kidney', 'wilms', 'S', null, null, null, ['gr:NBK1219', 'us:aacr_bws', 'gr:NBK1294'], 'Wilms 5.1% (AACR 2024); 4-9% (GeneReviews)'],
      ['liver', 'hepatoblastoma', 'S', null, null, null, ['gr:NBK1219', 'us:aacr_bws'], 'HB 5.1% (AACR 2024); overall tumour risk 15.8% (GeneReviews)'],
      ['nb', '*', 'W', null, null, null, ['gr:NBK1219', 'gr:NBK1294', 'us:aacr_bws'], null, 'AACR: tumours other than HB and WT each <1% in 189 reported SGBS cases']
    ] },
  { id: 'sotos', name: 'Sotos syndrome (NSD1)', genes: ['NSD1'], inh: 'AD', tests: ['R27'],
    rules: [
      ['feature', 'overgrowth', 'S', null, null, null, ['gr:NBK1479', 'clingen:NSD1', 'us:aacr_bws']],
      ['feature', 'macrocephaly', 'M', null, null, null, ['gr:NBK1479']],
      ['nb', '*', 'W', null, null, null, ['gr:NBK1479', 'us:aacr_bws'], '~1% (GeneReviews)'],
      ['heme', 'all', 'W', null, null, null, ['gr:NBK1479', 'us:aacr_bws']],
      ['kidney', 'wilms', 'W', null, null, null, ['gr:NBK1479', 'gr:NBK1294', 'us:aacr_bws'], 'Wilms <3% (GeneReviews overview); 1% or less (AACR 2024)']
    ] },
  { id: 'weaver', name: 'Weaver syndrome (EZH2)', genes: ['EZH2'], inh: 'AD', tests: ['R456','R27'],
    rules: [
      ['feature', 'overgrowth', 'S', null, null, null, ['gr:NBK148820', 'clingen:EZH2', 'us:aacr_bws']],
      ['nb', '*', 'M', null, null, null, ['gr:NBK148820', 'us:aacr_bws'], 'Neuroblastoma 5-7% (GeneReviews); ~9% (AACR 2024)'],
      ['heme', '*', 'W', null, null, null, ['gr:NBK148820']]
    ] },
  { id: 'alk', name: 'Familial neuroblastoma (ALK)', genes: ['ALK'], inh: 'AD', tests: ['R456'],
    rules: [
      ['nb', '*', 'S', 2, null, null, ['gr:NBK24599', 'us:aacr_nb', 'clingen:ALK'], 'Penetrance ~50%; 98% of neuroblastic tumours by age 10 (GeneReviews)']
    ] },
  { id: 'phox2b', name: 'PHOX2B-related neuroblastoma / CCHS', genes: ['PHOX2B'], inh: 'AD', tests: ['R456','R333'],
    rules: [
      ['feature', 'cchs', 'H', null, null, null, ['gr:NBK1427', 'clingen:PHOX2B', 'us:aacr_nb']],
      ['nb', '*', 'S', 2, null, null, ['gr:NBK1427', 'us:aacr_nb', 'clingen:PHOX2B'], 'Neural crest tumours ~50% with NPARM; <5% with PARM 20/30-20/33 (GeneReviews)']
    ] },

  /* ---------- RASopathies ---------- */
  { id: 'noonan', name: 'Noonan syndrome spectrum (RASopathy)',
    genes: ['PTPN11', 'SOS1', 'RAF1', 'SHOC2', 'KRAS', 'NRAS'], inh: 'AD', tests: ['R27','R456','R457'],
    rules: [
      ['feature', 'rasopathy', 'H', null, null, null, ['gr:NBK1124', 'us:aacr_ras', 'clingen:PTPN11', 'clingen:SOS1', 'clingen:RAF1', 'clingen:KRAS', 'clingen:NRAS']],
      ['heme', 'jmml', 'S', null, null, null, ['gr:NBK1124', 'us:aacr_ras', 'kratz2015', 'us:aacr_heme'], 'Childhood cancer SIR 8.1 in NS, JMML most frequent (Kratz 2015); ~4% cancer by 20 (GeneReviews)'],
      ['sarcoma', 'rms', 'M', 10, null, null, ['gr:NBK1124', 'us:aacr_ras', 'kratz2015']],
      ['nb', '*', 'W', null, null, null, ['gr:NBK1124', 'us:aacr_ras', 'kratz2015']],
      ['heme', 'all', 'W', null, null, null, ['gr:NBK1124', 'us:aacr_ras', 'kratz2015', 'us:aacr_heme']],
      ['cns', 'lgg', 'W', null, null, null, ['gr:NBK1124', 'us:aacr_ras', 'kratz2015'], 'Brain tumours <1% (AACR 2024)']
    ] },
  { id: 'cbl', name: 'CBL syndrome', genes: ['CBL'], inh: 'AD', tests: ['R27','R456','R457'],
    rules: [
      ['heme', 'jmml', 'S', null, null, null, ['us:aacr_ras', 'clingen:CBL', 'niemeyer2010', 'us:aacr_heme']],
      ['feature', 'rasopathy', 'M', null, null, null, ['us:aacr_ras', 'niemeyer2010']]
    ] },
  { id: 'costello', name: 'Costello syndrome (HRAS)', genes: ['HRAS'], inh: 'AD', tests: ['R27','R456','R457'],
    rules: [
      ['sarcoma', 'rms', 'S', 10, null, null, ['gr:NBK1507', 'us:aacr_ras', 'astiazaran2023', 'kratz2015', 'clingen:HRAS'], 'RMS ~7% (AACR 2024); SIR 1240 (Astiazaran-Symonds 2023)'],
      ['nb', '*', 'S', null, null, null, ['gr:NBK1507', 'us:aacr_ras', 'astiazaran2023'], 'NB ~2% (AACR 2024); SIR 60'],
      ['urothelial', 'bladder', 'S', 20, null, 20, ['gr:NBK1507', 'us:aacr_ras', 'astiazaran2023'], 'Bladder TCC ~2.2%, SIR 1971; ages 10-16 at presentation'],
      ['feature', 'rasopathy', 'S', null, null, null, ['gr:NBK1507', 'clingen:HRAS', 'us:aacr_ras']]
    ] },

  /* ---------- GIST / mesenchymal ---------- */
  { id: 'kit', name: 'Familial GIST (KIT)', genes: ['KIT'], inh: 'AD',
    note: 'Only gain-of-function KIT variants are relevant.', tests: ['R363'],
    rules: [
      ['sarcoma', 'gist', 'S', 50, null, null, ['gr:NBK625142', 'clingen:KIT', 'nccn_gist_taskforce2010'], 'Near-complete penetrance of some features; mean GIST onset ~48 y (range from 18 y) (GeneReviews)'],
      ['feature', 'pigment_carney', 'W', null, null, null, ['gr:NBK625142', 'nccn_gist_taskforce2010']]
    ] },
  { id: 'pdgfra', name: 'PDGFRA-mutant syndrome (familial GIST / IFPs)', genes: ['PDGFRA'], inh: 'AD', tests: ['R363'],
    rules: [
      ['feature', 'ifp', 'S', null, null, null, ['gr:NBK625142']],
      ['sarcoma', 'gist', 'M', 50, null, null, ['gr:NBK625142', 'clingen:PDGFRA', 'nccn_gist_taskforce2010'], 'Penetrance reduced compared with KIT (GeneReviews)']
    ] },
  { id: 'pdgfrb', name: 'Infantile myofibromatosis (PDGFRB)', genes: ['PDGFRB'], inh: 'AD', tests: ['R89','R230'],
    rules: [
      ['feature', 'myofibroma', 'S', null, null, null, ['cheung2013', 'martignetti2013']]
    ] },

  { id: 'tbxt', name: 'Familial chordoma (TBXT duplication)', genes: ['TBXT'], inh: 'AD', notOnNicpr: true,
    note: 'Germline duplication of TBXT (brachyury), mainly intracranial chordoma; detected by copy-number analysis (R457 includes TBXT duplications).',
    tests: ['R457'], rules: [
      ['sarcoma', 'chordoma', 'S', null, null, null, ['yang2009', 'us:aacr_brain']]
    ] },
  { id: 'ollier', name: 'Ollier disease / Maffucci syndrome (post-zygotic IDH1 / IDH2)', genes: ['IDH1', 'IDH2'],
    inh: 'Post-zygotic mosaic (not inherited)', notOnNicpr: true,
    note: 'Mosaic variants: test affected tissue (enchondroma or tumour), not blood. Gliomas occur in childhood and adulthood.',
    tests: ['R89'], rules: [
      ['feature', 'enchondromas', 'H', null, null, null, ['pansuriya2011', 'amary2011', 'verdegaal2011']],
      ['sarcoma', 'chondrosarcoma', 'S', null, null, null, ['verdegaal2011'], 'Chondrosarcoma in ~40% (161 patients; higher with long/flat bone or pelvic enchondromas) (Verdegaal 2011)'],
      ['cns', 'hgg|lgg', 'M', null, null, null, ['us:aacr_brain']]
    ] },

  /* ---------- DNA repair / chromosome instability ---------- */
  { id: 'fanconi', name: 'Fanconi anaemia (biallelic FANC genes)',
    genes: ['FANCA', 'FANCB', 'FANCC', 'BRCA2', 'FANCD2', 'FANCE', 'FANCF', 'FANCG', 'FANCI', 'BRIP1', 'FANCL', 'PALB2', 'SLX4'],
    inh: 'AR (FANCB X-linked)', note: 'Biallelic BRCA2 (FA-D1) / PALB2 (FA-N): medulloblastoma, Wilms tumour and AML in early childhood.',
    tests: ['R260','R258','R229'],
    rules: [
      ['feature', 'fa_anom', 'H', null, null, null, ['gr:NBK1401', 'us:aacr_gid'], 'Physical abnormalities in ~60-75%'],
      ['headneck', 'scc', 'S', 40, null, 40, ['gr:NBK1401', 'alter2018', 'us:aacr_gid'], 'HNSCC 500-1000x population; typically age 20-40 (GeneReviews)'],
      ['feature', 'bmf', 'S', null, null, null, ['gr:NBK1401', 'us:aacr_gid'], 'Severe BMF ~70% by 50 (AACR 2024)'],
      ['heme', 'aml|mds', 'S', 20, null, null, ['gr:NBK1401', 'us:aacr_gid', 'who2022', 'us:aacr_heme'], 'MDS/AML cumulative incidence ~35% by 40; RR MDS ~6000x, AML ~700x (GeneReviews)'],
      ['oesophagus', 'scc', 'S', 40, null, 40, ['gr:NBK1401', 'alter2018']],
      ['cns', 'medullo_nos|medullo_shh', 'M', 5, null, null, ['gr:NBK1401', 'us:aacr_gid', 'us:aacr_brain'], 'FA-D1/FA-N: embryonal tumours in 10-33%, usually before 5 y'],
      ['kidney', 'wilms', 'M', 5, null, null, ['gr:NBK1401', 'us:aacr_gid']],
      ['liver', 'hcc', 'W', null, null, null, ['gr:NBK1401'], 'Mainly with androgen therapy'],
      ['nb', 'nb', 'W', 5, null, null, ['gr:NBK1401', 'us:aacr_gid']],
      ['cervix', 'scc', 'W', null, null, null, ['gr:NBK1401']],
      ['skin', 'bcc|scc', 'W', null, null, null, ['alter2018', 'gr:NBK1401', 'us:aacr_gid'], '11/163 FA patients in NCI cohort had skin cancer']
    ] },
  { id: 'fancm', name: 'Recessive FANCM cancer syndrome (biallelic FANCM; Fanconi-like, not Fanconi anaemia)', genes: ['FANCM'], inh: 'AR',
    note: 'Biallelic FANCM causes a separate Fanconi-like genomic instability disorder (ClinGen: Definitive); ClinGen has refuted FANCM as a cause of Fanconi anaemia. No bone marrow failure or Fanconi physical features; chromosome fragility, chemotherapy toxicity and gonadal failure (ovarian dysfunction) are reported.',
    tests: [],
    rules: [
      ['breast', '*', 'M', null, null, null, ['nynas2025', 'clingen:FANCM'], 'Homozygous c.5101C>T: high breast cancer risk (FinnGen, 76 homozygotes); heterozygous OR 1.24'],
      ['headneck', 'scc', 'M', null, null, null, ['nynas2025', 'clingen:FANCM'], 'High risk in homozygotes; heterozygous hypopharyngeal OR 3.98 (FinnGen)'],
      ['heme', 'aml|mds|all|lymphoma|cll|other', 'W', null, null, null, ['nynas2025'], 'High risk of haematological cancer in homozygotes (FinnGen)'],
      ['ovary', '*', 'W', null, null, null, ['nynas2025'], 'Gynaecological cancers increased in homozygotes (FinnGen)'],
      ['lung', '*', 'W', null, null, null, ['nynas2025']],
      ['skin', '*', 'W', null, null, null, ['nynas2025']]
    ] },
  { id: 'at', name: 'Ataxia–telangiectasia (biallelic ATM)', genes: ['ATM'], inh: 'AR', tests: ['R294','R295'],
    rules: [
      ['feature', 'at', 'H', null, null, null, ['gr:NBK26468', 'us:aacr_gid']],
      ['heme', 'lymphoma|all', 'S', 20, null, null, ['gr:NBK26468', 'us:aacr_gid', 'us:aacr_heme'], 'Any cancer ~15% by 18 y and 38% by 40 y; ~60% of childhood tumours are NHL (AACR 2024)'],
      ['breast', '*', 'M', null, null, null, ['gr:NBK26468', 'us:aacr_gid', 'ukcgg:atm']]
    ] },
  { id: 'nbs', name: 'Nijmegen breakage syndrome (biallelic NBN)', genes: ['NBN'], inh: 'AR',
    note: 'Heterozygous NBN variants have weak evidence for breast/prostate cancer risk.', tests: ['R259','R457'],
    rules: [
      ['heme', 'lymphoma|all', 'S', 20, null, null, ['gr:NBK1176', 'us:aacr_gid', 'us:aacr_heme'], 'Malignancy ~40-70% by 20 y, mostly B/T-NHL and T-ALL (AACR 2024)'],
      ['feature', 'microcephaly', 'S', null, null, null, ['gr:NBK1176', 'us:aacr_gid']],
      ['cns', 'medullo_nos', 'W', null, null, null, ['gr:NBK1176', 'us:aacr_gid']],
      ['sarcoma', 'rms', 'W', null, null, null, ['gr:NBK1176', 'us:aacr_gid']],
      ['cns', 'hgg|lgg', 'W', null, null, null, ['gr:NBK1176']]
    ] },
  { id: 'bloom', name: 'Bloom syndrome (biallelic BLM)', genes: ['BLM'], inh: 'AR', tests: ['R260','R229'],
    rules: [
      ['heme', 'lymphoma|aml|all', 'S', 25, null, null, ['gr:NBK1398', 'us:aacr_gid', 'us:aacr_heme'], 'Any cancer 52% by 30 and 82.5% by 40; haematological ~1/3 of tumours; registry median ages AML 18, ALL 15, lymphoma 23'],
      ['feature', 'microcephaly', 'S', null, null, null, ['gr:NBK1398']],
      ['colorectal', '*', 'M', 35, null, null, ['gr:NBK1398', 'us:aacr_gid'], '30 CRC in registry, median 36 y (range 16-49)'],
      ['kidney', 'wilms', 'S', null, null, null, ['gr:NBK1398', 'us:aacr_gid'], 'Wilms ~3% (9 in registry, median age 3)'],
      ['headneck', 'scc', 'S', 40, null, 40, ['gr:NBK1398', 'us:aacr_gid'], '28 oropharyngeal cancers in registry, median ages 31-39.5'],
      ['breast', '*', 'M', 40, null, null, ['gr:NBK1398', 'us:aacr_gid'], '29 breast cancers in registry, median 32 y (range 18-52)'],
      ['skin', 'bcc|scc', 'M', 40, null, null, ['gr:NBK1398', 'us:aacr_gid'], '18 BCC (median 32) and 8 SCC (median 35) in registry'],
      ['stomach', '*', 'W', null, null, null, ['gr:NBK1398'], '7 gastric cancers in registry, median 27 y'],
      ['oesophagus', '*', 'W', null, null, null, ['gr:NBK1398'], '5 oesophageal cancers in registry, median 39 y']
    ] },
  { id: 'rts', name: 'Rothmund–Thomson syndrome (biallelic RECQL4)', genes: ['RECQL4'], inh: 'AR', tests: ['R457','R27'],
    rules: [
      ['feature', 'poikiloderma', 'H', null, null, null, ['gr:NBK1237', 'us:aacr_gid']],
      ['sarcoma', 'osteo', 'S', 20, null, null, ['gr:NBK1237', 'us:aacr_gid'], 'Osteosarcoma ~30% prevalence, median age 9-11; ~50% by 20 and >60% by 40 (AACR 2024)'],
      ['skin', 'bcc|scc', 'M', 40, null, null, ['gr:NBK1237', 'us:aacr_gid'], 'Skin cancer ~5%; mean age epithelial tumours 34.4 y']
    ] },
  { id: 'werner', name: 'Werner syndrome (biallelic WRN)', genes: ['WRN'], inh: 'AR', tests: ['R457','R89'],
    rules: [
      ['feature', 'progeroid', 'H', null, null, null, ['gr:NBK1514']],
      ['sarcoma', 'sts|osteo', 'M', 50, null, null, ['gr:NBK1514']],
      ['skin', 'melanoma', 'M', 50, null, null, ['gr:NBK1514'], 'Acral lentiginous melanoma particularly prevalent'],
      ['thyroid', 'follicular|papillary', 'M', 50, null, null, ['gr:NBK1514']],
      ['cns', 'meningioma', 'M', 50, null, null, ['gr:NBK1514', 'us:aacr_brain']],
      ['heme', '*', 'W', null, null, null, ['gr:NBK1514']]
    ] },

  /* ---------- Haematological ---------- */
  { id: 'cebpa', name: 'Familial AML with germline CEBPA', genes: ['CEBPA'], inh: 'AD', tests: ['R347'],
    rules: [
      ['heme', 'aml', 'S', 50, null, null, ['ukcgg:cebpa', 'gr:NBK47457', 'us:aacr_heme', 'who2022', 'clingen:CEBPA'], 'Lifetime AML ~80% (N-terminal) vs ~50% (other variants); median onset 24.5 y (UKCGG)']
    ] },
  { id: 'runx1', name: 'RUNX1 familial platelet disorder with myeloid malignancy', genes: ['RUNX1'], inh: 'AD',
    tests: ['R347','R90'],
    rules: [
      ['feature', 'thrombocytopenia', 'H', null, null, null, ['ukcgg:runx1', 'gr:NBK568319', 'us:aacr_heme'], 'Bleeding/bruising ~90%'],
      ['heme', 'aml|mds', 'S', null, null, null, ['ukcgg:runx1', 'gr:NBK568319', 'us:aacr_heme', 'who2022', 'clingen:RUNX1'], 'Lifetime MDS/AML ~25-50%, mean age ~33 (UKCGG)'],
      ['heme', 'all|lymphoma', 'W', null, null, null, ['ukcgg:runx1', 'gr:NBK568319', 'us:aacr_heme'], '~25% of families have a lymphoid malignancy; individual risk unknown']
    ] },
  { id: 'gata2', name: 'GATA2 deficiency', genes: ['GATA2'], inh: 'AD', tests: ['R347','R91'],
    rules: [
      ['feature', 'gata2', 'H', null, null, null, ['ukcgg:gata2', 'spinner2014', 'us:aacr_heme']],
      ['heme', 'mds', 'S', 40, null, null, ['ukcgg:gata2', 'homan2021', 'us:aacr_heme', 'who2022', 'clingen:GATA2'], 'MDS lifetime ~56%, median 17 y; myeloid malignancy overall ~75% (UKCGG)'],
      ['heme', 'aml', 'M', 40, null, null, ['ukcgg:gata2', 'homan2021', 'us:aacr_heme'], 'AML ~7% de novo plus ~9% progression from MDS, median ~17-20 y']
    ] },
  { id: 'ddx41', name: 'DDX41-associated myeloid neoplasm', genes: ['DDX41'], inh: 'AD', tests: ['R347','R91'],
    rules: [
      ['heme', 'aml|mds', 'S', null, null, null, ['ukcgg:ddx41', 'gr:NBK574843', 'us:aacr_heme', 'who2022', 'clingen:DDX41'], 'Lifetime up to ~50%, nearly all after 40 (mean ~68); 3:1 male (UKCGG)'],
      ['heme', 'lymphoma|cll', 'W', null, null, null, ['gr:NBK574843', 'us:aacr_heme']]
    ] },
  { id: 'etv6', name: 'ETV6-related thrombocytopenia and leukaemia', genes: ['ETV6'], inh: 'AD', tests: ['R366','R90','R347','R91'],
    rules: [
      ['heme', 'all', 'S', 18, null, null, ['ukcgg:etv6', 'gr:NBK564234', 'us:aacr_heme', 'clingen:ETV6'], 'Haematological malignancy ~30% lifetime, median 11 y; ~2/3 B-ALL (UKCGG)'],
      ['feature', 'thrombocytopenia', 'S', null, null, null, ['ukcgg:etv6', 'gr:NBK564234', 'us:aacr_heme'], 'Thrombocytopenia in ~90%'],
      ['heme', 'mds|aml', 'M', null, null, null, ['ukcgg:etv6', 'gr:NBK564234', 'us:aacr_heme']],
      ['heme', 'other', 'W', null, null, null, ['us:aacr_heme'], 'Multiple myeloma reported; absolute risk not established']
    ] },
  { id: 'ankrd26', name: 'ANKRD26-related thrombocytopenia', genes: ['ANKRD26'], inh: 'AD', tests: ['R90','R347','R91'],
    rules: [
      ['feature', 'thrombocytopenia', 'S', null, null, null, ['ukcgg:ankrd26', 'gr:NBK507664', 'clingen:ANKRD26', 'us:aacr_heme'], 'Penetrance for thrombocytopenia complete'],
      ['heme', 'aml|mds', 'M', null, null, null, ['ukcgg:ankrd26', 'gr:NBK507664', 'us:aacr_heme', 'who2022'], '4.9% AML, 2.2% MDS in 222 carriers; ~24-fold AML risk'],
      ['heme', 'other', 'W', null, null, null, ['ukcgg:ankrd26', 'us:aacr_heme'], 'CML 1.3% of 222 carriers'],
      ['heme', 'cll', 'W', null, null, null, ['us:aacr_heme'], 'CLL reported; absolute risk not established']
    ] },
  { id: 'samd9l', name: 'SAMD9 / SAMD9L-related monosomy 7 MDS (incl. ataxia-pancytopenia, MIRAGE)', genes: ['SAMD9L', 'SAMD9'], inh: 'AD', tests: ['R91','R347'],
    rules: [
      ['heme', 'mds', 'S', 20, null, null, ['gr:NBK435692', 'us:aacr_heme', 'clingen:SAMD9L'], 'SAMD9/SAMD9L variants in 8-18% of childhood MDS (AACR 2024)'],
      ['feature', 'bmf', 'M', null, null, null, ['gr:NBK435692', 'us:aacr_heme']],
      ['heme', 'aml', 'M', 20, null, null, ['gr:NBK435692', 'us:aacr_heme']],
      ['feature', 'at', 'M', null, null, null, ['gr:NBK435692', 'us:aacr_heme']]
    ] },
  { id: 'pax5', name: 'PAX5-related familial B-ALL', genes: ['PAX5'], inh: 'AD', tests: ['R366'],
    rules: [
      ['heme', 'all', 'S', null, null, null, ['shah2013', 'us:aacr_heme', 'clingen:PAX5']]
    ] },
  { id: 'kdm3b', name: 'KDM3B-related neurodevelopmental disorder with haematological malignancy', genes: ['KDM3B'],
    inh: 'AD', tests: ['R89'], rules: [
      ['heme', 'aml|lymphoma', 'W', null, null, null, ['diets2019'], '2 childhood cancers (AML, Hodgkin) among 17 individuals'],
      ['kidney', 'wilms', 'W', null, null, null, ['mahamdallie2019']]
    ] },
  { id: 'tbd', name: 'Telomere biology disorder (dyskeratosis congenita spectrum)',
    genes: ['TERT', 'TERC', 'DKC1', 'TINF2', 'RTEL1', 'NHP2', 'WRAP53'], inh: 'AD / AR / X-linked (DKC1)', tests: ['R91','R421','R347'],
    rules: [
      ['feature', 'tbd', 'H', null, null, null, ['gr:NBK22301', 'us:aacr_gid']],
      ['feature', 'bmf', 'S', null, null, null, ['gr:NBK22301', 'us:aacr_gid'], 'About half develop severe BMF by 40'],
      ['heme', 'mds|aml', 'S', null, null, null, ['gr:NBK22301', 'us:aacr_gid', 'who2022', 'us:aacr_heme'], 'MDS O/E 578, median onset 31 y (NCI cohort)'],
      ['headneck', 'scc', 'S', 50, null, 40, ['gr:NBK22301', 'alter2018', 'us:aacr_gid'], 'HNSCC O/E 74 (tongue 216-fold); solid tumours 20-30% by 50'],
      ['skin', 'bcc|scc', 'W', null, null, null, ['alter2018', 'us:aacr_gid'], '9/197 DC patients had skin cancer'],
      ['heme', 'lymphoma', 'W', null, null, null, ['alter2018', 'gr:NBK22301', 'us:aacr_gid']],
      ['cervix', 'scc', 'W', null, null, null, ['gr:NBK22301', 'us:aacr_gid']]
    ] }
];
/*
 * Tumour-specific testing pointers, shown when a matching cancer is entered (and in the
 * By-cancer view). `aacr` = AACR 2024 childhood CNS tumour update (US_GUIDES.aacr_brain);
 * `nhs` = the NHS Test Directory route, noting where it differs (UK guidance takes priority).
 */
const TEST_POINTERS = [
  { site: 'cns', hist: 'medullo_wnt', aacr: 'WNT medulloblastoma: test germline APC (FAP) if there is no somatic CTNNB1 mutation or somatic testing is unavailable – >70% of CTNNB1-wild-type WNT-MB carry a germline APC variant.',
    nhs: 'R414 (APC) lists classic medulloblastoma in children/young adults before colonoscopy; it does not specify WNT subgroup or CTNNB1 status.' },
  { site: 'cns', hist: 'medullo_shh', aacr: 'SHH medulloblastoma: up to 40% have a predisposition syndrome. Test PTCH1 and SUFU (Gorlin), GPR161 (infants), ELP1 (older children), TP53 (20% at age 5–16), MMR/POLE if the tumour is hypermutated, and consider BRCA2/PALB2 or Fanconi anaemia if there is an HRD signature or unexpected treatment toxicity. Include chromosomal microarray.',
    nhs: 'R456 covers SHH medulloblastoma <25 (panel includes PTCH1, SUFU, GPR161, ELP1, TP53); R214 if Gorlin features; R210 if CMMRD is suspected.' },
  { site: 'cns', hist: 'medullo_nos', aacr: 'Group 3/4 medulloblastoma: no clear syndrome association – reserve germline testing for a family history of BRCA-associated cancers or an HRD signature on tumour sequencing.',
    nhs: 'No specific route; use R208 if the family meets HBOC criteria.' },
  { site: 'cns', hist: 'atrt', aacr: 'AT/RT: test SMARCB1 (including copy number and distal 22q11.2 deletion) and SMARCA4. Gonadal mosaicism occurs, so test young at-risk siblings even if both parents test negative.',
    nhs: 'R456 (AT/RT at any age).' },
  { site: 'kidney', hist: 'rhabdoid', aacr: 'Malignant rhabdoid tumour: test SMARCB1 (including copy number) and SMARCA4; test young siblings even if parents are negative.',
    nhs: 'R456.' },
  { site: 'ovary', hist: 'sccoht', aacr: 'SCCOHT: test SMARCA4 (rhabdoid tumour predisposition syndrome 2); discuss risk-reducing salpingo-oophorectomy for carriers.',
    nhs: 'R456 (SCCOHT at any age).' },
  { site: 'cns', hist: 'cribriform', aacr: 'Cribriform neuroepithelial tumour: consider germline SMARCB1.', nhs: 'R456 / R221.' },
  { site: 'cns', hist: 'meningioma|meningioma_cc|vs|schwannoma', maxAge: 25, aacr: 'Meningioma or schwannoma in a child or young adult: evaluate for a predisposition syndrome even without a family history – NF2, SMARCB1, LZTR1, SMARCE1 (clear cell meningioma), PTCH1/SUFU, PTEN, DGCR8, BAP1.',
    nhs: 'R221 – schwannoma <30, meningioma <20, any clear cell meningioma, 2 meningiomas <50; AACR suggests evaluating all children and young adults, which is broader.' },
  { site: 'cns', hist: 'pineoblastoma', aacr: 'Pineoblastoma: test DICER1 and RB1 (ask about Sertoli–Leydig tumour, pleuropulmonary blastoma or retinoblastoma in the family).',
    nhs: 'R364 (DICER1) and R219 (RB1).' },
  { site: 'pituitary', hist: 'blastoma', aacr: 'Pituitary blastoma: test DICER1.', nhs: 'R364.' },
  { site: 'cns', hist: 'hgg', maxAge: 25, aacr: 'High-grade glioma in a child or young adult: consider TP53 (Li–Fraumeni), MMR/POLE (CMMRD – check tumour hypermutation/MSI), NF1, CDKN2A/B deletion (melanoma–astrocytoma), POT1, and mosaic IDH1/IDH2 with enchondromas (Ollier/Maffucci).',
    nhs: 'R216 (TP53/POT1) and R210 (CMMRD, Wimmer score ≥3).' },
  { site: 'cns', hist: 'optic|lgg', maxAge: 18, aacr: 'Low-grade or optic pathway glioma in a child: consider NF1 – bilateral optic pathway glioma is almost pathognomonic.',
    nhs: 'R222 (clinical NF1 diagnosis).' },
  { site: 'cns', hist: 'sega', aacr: 'SEGA: tuberous sclerosis (TSC1/TSC2).', nhs: 'R228.' },
  { site: 'cns', hist: 'ependymoma', aacr: 'Spinal ependymoma: NF2-related schwannomatosis; rarely MEN1.', nhs: 'R221 (NF2).' },
  { site: 'cns', hist: 'cpc', aacr: 'Choroid plexus carcinoma: Li–Fraumeni (TP53) at any age.', nhs: 'R216 (any age).' },
  { site: 'cns', hist: 'hb', aacr: 'Haemangioblastoma: von Hippel–Lindau (VHL); surveillance MRI must use contrast every time.', nhs: 'R225.' },
  { site: 'cns', hist: 'germ', aacr: 'Intracranial germ cell tumour: offer genetic counselling and consider testing, particularly in Japanese or East Asian patients (JMJD1C; Fanconi anaemia pathway genes). No surveillance recommendations yet.',
    nhs: 'No specific test; WGS via R89 needs UKCGG/CanGene-CanVar national MDT approval.' },
  { site: 'sarcoma', hist: 'chordoma', aacr: 'Chordoma: familial or intracranial – germline TBXT (brachyury) duplication; sacral – TSC1/TSC2.',
    nhs: 'R457 (chordoma <25, multiple or familial; includes TBXT duplications); R228 if TSC features.' }
];

/*
 * Suggested surveillance per condition. Priority: UK (UKCGG gene guidelines, BSG/ACPGBI/UKCGG 2019),
 * then European (ERN GENTURIS, EHTG/ESCP, SIOPE), then international/US (AACR, consensus guidelines;
 * 'gr:NBK…' = GeneReviews summary of published guidelines where the original is not open access).
 * lvl: uk | eu | intl | none. src: keys of GUIDES / EU_GUIDES / US_GUIDES or 'gr:NBK…'.
 * diff: other guidance that differs, shown as [source, text]. Checked 11 Oct 2026.
 */
const SURVEILLANCE = {
  brca1: {"lvl": "uk", "src": ["brca1"], "items": [["Breast", "Annual MRI 25 to <40; MRI + mammography 40 to <51; mammography ± MRI 51 to <71; on request over 71"], ["Tubo-ovarian", "No screening. Discuss risk-reducing BSO once childbearing complete, not before 35–40; HRT to 50 if no breast cancer"], ["Breast surgery", "Discuss risk-reducing bilateral mastectomy with individualised risk assessment (no lifetime-risk threshold in UKCGG BRCA1 guidance)"], ["Prostate", "No national programme; men can discuss PSA testing with their GP"], ["Pancreas", "Research only (e.g. EUROPAC) if family history"], ["Chemoprevention", "Not recommended (high risk of triple-negative breast cancer)"]]},
  brca2: {"lvl": "uk", "src": ["brca2"], "items": [["Breast", "Annual MRI 25 to <40; MRI + mammography 40 to <51; mammography ± MRI 51 to <71"], ["Tubo-ovarian", "No screening. Discuss risk-reducing BSO once childbearing complete, not before 40–45"], ["Breast surgery", "Discuss risk-reducing bilateral mastectomy with individualised risk assessment (no lifetime-risk threshold in UKCGG BRCA2 guidance)"], ["Prostate", "Annual PSA from 40; refer if PSA >3.0 ng/ml"], ["Pancreas", "Research only (EUROPAC)"], ["Chemoprevention", "Can be offered if no contraindications"]]},
  palb2: {"lvl": "uk", "src": ["palb2", "hanson"], "items": [["Breast", "Very high-risk programme: annual MRI from 30 and mammography from 40 (consider MRI from 25 if 10-year risk ≥8%)"], ["Tubo-ovarian", "No screening; consider risk-reducing salpingo-oophorectomy at 50 if lifetime risk ≥5%"], ["Breast surgery", "Discuss risk-reducing bilateral mastectomy with personalised risk assessment, including age-specific (10-year) risk (no lifetime-risk threshold in UKCGG PALB2 guidance)"], ["Pancreas", "Research only; consider EUROPAC if family history on the PALB2 side"]]},
  atm: {"lvl": "uk", "src": ["atm"], "items": [["Breast", "Breast screening per NICE CG164 using CanRisk: moderate risk (17–29%) annual mammography 40–49 then NHSBSP; high risk (≥30%) annual mammography 40–59; very high risk (10-year risk ≥8% at 25–39 or ≥12% at 40–49) → VHR programme: annual MRI from 30 and mammography from 40. c.7271T>G (p.Val2424Gly): very high risk. Other missense variants: by family history. Mothers of children with A-T: at least moderate-risk surveillance"], ["Prostate", "No formal programme; annual PSA can be considered from 50"], ["Pancreas", "Research only (EUROPAC)"], ["Breast surgery", "Consider discussing risk-reducing bilateral mastectomy only if lifetime breast cancer risk ≥30%, after individualised risk assessment (e.g. CanRisk) and counselling"]]},
  chek2: {"lvl": "uk", "src": ["chek2"], "items": [["Breast", "Breast screening per NICE CG164 using CanRisk: moderate risk (17–29%) annual mammography 40–49 then NHSBSP; high risk (≥30%) annual mammography 40–59; very high risk (10-year risk ≥8% at 25–39 or ≥12% at 40–49) → VHR programme: annual MRI from 30 and mammography from 40. Biallelic CHEK2: very high-risk programme. Most missense variants: by family history"], ["Prostate", "No formal programme; annual PSA can be considered from 50"], ["Colorectal", "By family history (BSG 2019)"], ["Breast surgery", "Consider discussing risk-reducing bilateral mastectomy only if lifetime breast cancer risk ≥30%, after individualised risk assessment (e.g. CanRisk) and counselling"]]},
  bard1: {"lvl": "uk", "src": ["bard1"], "items": [["Breast", "Truncating variants: Breast screening per NICE CG164 using CanRisk: moderate risk (17–29%) annual mammography 40–49 then NHSBSP; high risk (≥30%) annual mammography 40–59; very high risk (10-year risk ≥8% at 25–39 or ≥12% at 40–49) → VHR programme: annual MRI from 30 and mammography from 40. Non-truncating variants: by family history"], ["Breast surgery", "Consider discussing risk-reducing bilateral mastectomy only if lifetime breast cancer risk ≥30%, after individualised risk assessment (e.g. CanRisk) and counselling"], ["Counselling", "Strong association with triple-negative breast cancer"]]},
  rad51d: {"lvl": "uk", "src": ["rad51d", "hanson"], "items": [["Breast", "Breast screening per NICE CG164 using CanRisk: moderate risk (17–29%) annual mammography 40–49 then NHSBSP; high risk (≥30%) annual mammography 40–59; very high risk (lifetime ≥40% and 10-year risk ≥8% at 25–39 or ≥12% at 40–49) → VHR programme: annual MRI from 30 and mammography from 40"], ["Tubo-ovarian", "No screening; consider risk-reducing salpingo-oophorectomy from 50 if lifetime risk ≥5%"], ["Breast surgery", "Consider discussing risk-reducing bilateral mastectomy only if lifetime breast cancer risk >30%, after individualised risk assessment (e.g. CanRisk) and counselling (RAD51C/D consensus, Hanson 2023: ≥30%)"]]},
  rad51c: {"lvl": "uk", "src": ["rad51c", "hanson"], "items": [["Breast", "Breast screening per NICE CG164 using CanRisk: moderate risk (17–29%) annual mammography 40–49 then NHSBSP; high risk (≥30%) annual mammography 40–59; very high risk (lifetime ≥40% and 10-year risk ≥8% at 25–39 or ≥12% at 40–49) → VHR programme: annual MRI from 30 and mammography from 40"], ["Tubo-ovarian", "No screening; consider risk-reducing salpingo-oophorectomy from 50 if lifetime risk ≥5%"], ["Breast surgery", "Consider discussing risk-reducing bilateral mastectomy only if lifetime breast cancer risk ≥30%, after individualised risk assessment (e.g. CanRisk) and counselling"]]},
  brip1: {"lvl": "uk", "src": ["brip1", "hanson"], "items": [["Breast", "Based on family history, not BRIP1 status"], ["Tubo-ovarian", "No screening; consider risk-reducing salpingo-oophorectomy at 50 (earlier after individual assessment)"]]},
  lynch_mlh1: {"lvl": "uk", "src": ["mlh1"], "items": [["Colorectal", "Colonoscopy every 2 years from 25 to 75 (register on the NDRS Lynch portal); review after 75"], ["Gastric", "Helicobacter pylori test at diagnosis or before aspirin; treat if positive"], ["Gynaecological", "No endometrial/ovarian surveillance outside research; low threshold for referral with red-flag symptoms"], ["Risk-reducing surgery", "Discuss hysterectomy + BSO once childbearing complete, not before 35–40; HRT to 51"], ["Chemoprevention", "Aspirin 75 mg daily from 20 to 65 for at least 5 years (stop by 70)"], ["Other sites", "No national screening for urinary tract, upper GI, brain or skin; PSA can be considered from 40; dermatology if suspicious lesions"]]},
  lynch_msh2: {"lvl": "uk", "src": ["msh2"], "items": [["Colorectal", "Colonoscopy every 2 years from 25 to 75 (register on the NDRS Lynch portal); review after 75"], ["Gastric", "Helicobacter pylori test at diagnosis or before aspirin; treat if positive"], ["Gynaecological", "No endometrial/ovarian surveillance outside research; low threshold for referral with red-flag symptoms"], ["Risk-reducing surgery", "Discuss hysterectomy + BSO once childbearing complete, not before 35–40; HRT to 51"], ["Chemoprevention", "Aspirin 75 mg daily from 20 to 65 for at least 5 years (stop by 70)"], ["Other sites", "No national screening for urinary tract, upper GI, brain or skin; PSA can be considered from 40; dermatology if suspicious lesions"]]},
  lynch_msh6: {"lvl": "uk", "src": ["msh6"], "items": [["Colorectal", "Colonoscopy every 2 years from 35 to 75 (register on the NDRS Lynch portal); review after 75"], ["Gastric", "Helicobacter pylori test at diagnosis or before aspirin; treat if positive"], ["Gynaecological", "No endometrial/ovarian surveillance outside research; low threshold for referral with red-flag symptoms"], ["Risk-reducing surgery", "Discuss hysterectomy + BSO once childbearing complete, not before 35–40; HRT to 51"], ["Chemoprevention", "Aspirin 75 mg daily from 30 to 65 for at least 5 years (stop by 70)"], ["Other sites", "No national screening for urinary tract, upper GI, brain or skin; dermatology if suspicious lesions"]]},
  lynch_pms2: {"lvl": "uk", "src": ["pms2"], "items": [["Colorectal", "Colonoscopy every 2 years from 35 to 75 (NDRS Lynch portal)"], ["Gynaecological", "No endometrial surveillance outside research; premenopausal risk-reducing hysterectomy not supported – discuss postmenopausal hysterectomy"], ["Gastric", "H. pylori test before aspirin"], ["Chemoprevention", "Aspirin 75 mg daily from 30 to 65 for at least 5 years"]]},
  cmmrd: {"lvl": "eu", "src": ["ern_cmmrd"], "items": [["Clinical", "Examination every 6 months from diagnosis"], ["Brain", "MRI every 6 months from 2 to 20, then annually"], ["GI tract", "Colonoscopy annually from 6 (6-monthly once polyps found); upper GI endoscopy with colonoscopy or from 10; capsule endoscopy annually from 10"], ["Gynaecological / urinary", "Annual clinical exam, transvaginal and abdominopelvic ultrasound from 20"], ["Whole body", "Whole-body MRI at least once; discuss optional annual imaging"], ["Surgery", "Discuss prophylactic surgery once family planning complete"]]},
  fap: {"lvl": "uk", "src": ["apc", "bsg"], "items": [["Colorectal", "Colonoscopy every 1–3 years from 12–14 (after a positive predictive test), by polyp burden, until surgery. At-risk relatives without an identified variant: from 12–14, then 5-yearly"], ["Surgery", "Colectomy timed by polyp burden at an RDCN centre of excellence; rectal/pouch surveillance 6–12-monthly afterwards"], ["Upper GI", "Upper GI endoscopy from 25 (interval by Spigelman stage)"], ["Other", "No routine hepatoblastoma or thyroid surveillance; symptom awareness"]], "diff": [["ehtg_fap", "Thyroid ultrasound at baseline and every 2–3 years if normal; colonoscopy from 12; upper GI from 18–30"], ["aacr_gi", "Hepatoblastoma: abdominal ultrasound and AFP every 3 months from infancy to age 7"]]},
  map: {"lvl": "uk", "src": ["bsg"], "items": [["Colorectal", "Colonoscopy from 18–20; annually if surgery not undertaken"], ["Upper GI", "Consider upper GI endoscopy from 35, interval as for FAP"], ["Monoallelic carriers", "Population-level risk – routine colonoscopy not recommended"]], "diff": [["ehtg_fap", "Colonoscopy every 1–2 years from 18; OGD from 35, interval no longer than 3 years (Spigelman stage not reliable in MAP); no extra-intestinal screening"]]},
  nthl1: {"lvl": "eu", "src": ["ehtg_fap"], "items": [["Colorectal", "Follow MAP guidance: colonoscopy from 18 (consider 5 years earlier with an aggressive family phenotype)"]], "diff": [["gr:NBK555473", "Colonoscopy every 2 years from 18–20; breast MRI annually 30–60 and mammography; OGD at least 5-yearly from 25; consider endometrial assessment 40–60"]]},
  ppap: {"lvl": "eu", "src": ["ehtg_fap"], "items": [["Colorectal", "Follow MAP guidance: colonoscopy from 18; consider starting 5 years earlier for POLE/POLD1 variants with severe early-onset phenotypes"]], "diff": [["aacr_rrd", "Some children with POLE/POLD1 variants have CMMRD-like brain tumours – see AACR replication repair deficiency update"]]},
  mbd4: {"lvl": "eu", "src": ["ehtg_fap"], "items": [["Colorectal", "Follow MAP guidance: colonoscopy from 18"]], "diff": [["gr:NBK624097", "Colonoscopy every 2 years from 18–20; blood count in adults (no agreed interval); annual dilated eye exam in adulthood for uveal melanoma"]]},
  jps_smad4: {"lvl": "uk", "src": ["smad4", "bsg"], "items": [["Colorectal", "Colonoscopy from 15 (earlier if symptoms), every 1–3 years by phenotype"], ["Upper GI", "Upper GI endoscopy from 18, every 1–3 years"], ["HHT", "Assess for HHT (CT thorax, echocardiogram, capsule endoscopy); manage with a specialist HHT centre"]]},
  jps_bmpr1a: {"lvl": "uk", "src": ["bmpr1a", "bsg"], "items": [["Colorectal", "Colonoscopy from 15 (earlier if symptoms), every 1–3 years by phenotype"], ["Upper GI", "Upper GI endoscopy from 25, every 1–3 years"]]},
  hmps: {"lvl": "uk", "src": ["bsg"], "items": [["Colorectal", "Individualised by phenotype; for multiple polyps, annual colonoscopy after clearance of lesions >5 mm, 2-yearly if no polyps ≥10 mm"]], "note": "No GREM1-specific guideline; BSG multiple colorectal polyp recommendations applied."},
  rnf43: {"lvl": "uk", "src": ["bsg"], "items": [["Colorectal", "Serrated polyposis: annual colonoscopy once cleared of lesions >5 mm; 2-yearly if no polyps ≥10 mm"], ["Relatives", "First-degree relatives: colonoscopy at 40 (or 10 years before the index diagnosis), then 5-yearly"]], "note": "RNF43-specific guidance does not exist; BSG serrated polyposis recommendations are applied."},
  pjs: {"lvl": "uk", "src": ["bsg"], "items": [["GI tract", "OGD, colonoscopy and capsule endoscopy from 8; small bowel every 3 years. If OGD/colonoscopy normal, defer to 18; if polyps, repeat 3-yearly"], ["Polypectomy", "Elective removal of small-bowel polyps >1.5–2 cm to prevent intussusception"]], "diff": [["ehtg_pjs", "Breast: clinical exam 6–12-monthly from 25, annual MRI from 25–30, MRI + mammography 30–50, mammography 50–75. Pancreas: surveillance only within a study/registry (CAPS criteria). Gynaecological: counselling at 18–20, annual examination from 25 focused on cervical adenocarcinoma and ovarian sex-cord tumours. Small bowel every 1–3 years"]]},
  phts: {"lvl": "uk", "src": ["pten"], "items": [["Breast", "Annual MRI 30–50 and annual mammography from 40 (VHR programme)"], ["Thyroid", "Annual ultrasound from 18 (earlier if family history of thyroid cancer <16)"], ["Renal", "Ultrasound every 2 years from 40"], ["Colorectal", "Baseline colonoscopy at 35–40; follow-up by polyp findings"], ["Skin", "Baseline dermatology review from 30"], ["Endometrium", "Not routine (research only); red-flag awareness"], ["Brain", "MRI only if symptoms of Lhermitte–Duclos disease"], ["Surgery", "Risk-reducing mastectomy case by case (not usually <30 or >60); no evidence for risk-reducing hysterectomy"]]},
  hdgc: {"lvl": "uk", "src": ["cdh1"], "items": [["Gastric", "Prophylactic total gastrectomy recommended (age 20–30) in confirmed HDGC families; caution if ascertained outside criteria. Annual endoscopy in a specialist centre if postponing surgery or risk uncertain (not usually over 70); treat H. pylori"], ["Breast", "VHR programme: annual MRI 30–50, mammography from 40; risk-reducing mastectomy can be considered (not usually <30 or >60)"]]},
  ctnna1: {"lvl": "eu", "src": ["igclc_hdgc"], "items": [["Gastric", "Annual endoscopic surveillance in an expert centre; consider gastrectomy depending on biopsies and family penetrance"]]},
  tylosis: {"lvl": "none", "src": [], "items": [], "note": "No guideline linked; manage with gastroenterology (oesophageal cancer risk)."},
  lfs: {"lvl": "uk", "src": ["tp53"], "items": [["Adrenocortical", "Abdominal ultrasound every 3–4 months from birth to 18"], ["Breast", "Annual MRI 20–70; consider risk-reducing mastectomy from 20"], ["Brain", "Annual brain MRI from birth (first with contrast)"], ["Sarcoma / whole body", "Annual whole-body MRI from birth"], ["Other", "No routine blood counts; colonoscopy only with a family history of colorectal cancer; annual skin check; avoid radiotherapy where possible"]], "diff": [["ern_lfs", "Abdominal ultrasound every 6 months to 17; breast MRI 20–65; brain MRI annually from birth only for high-risk variants or after chemo/radiotherapy, otherwise adults to 50; colonoscopy 5-yearly from 18 only after abdominal radiotherapy or with family history"], ["aacr_lfs", "Toronto protocol remains the standard, with age-adjusted modalities and an expanded adult schedule (2025 update)"]]},
  men1: {"lvl": "intl", "src": ["endo_men1", "gr:NBK1538"], "items": [["Parathyroid", "Annual calcium (± PTH) from 5"], ["Pituitary", "Annual prolactin and IGF-1 from 5; pituitary MRI every 3–5 years from 5"], ["Pancreas / duodenum", "Annual chromogranin A and pancreatic hormones from 8; fasting gastrin annually from 20; abdominal MRI, CT or EUS every 3–5 years from 20"], ["Thymic / bronchial carcinoid", "Consider chest CT or MRI from 15"], ["Skin", "Skin examination as needed"]], "diff": [["aacr_endo", "Updated paediatric recommendations for MEN1 (2025)"]]},
  men4: {"lvl": "intl", "src": ["gr:NBK594826"], "items": [["Parathyroid", "Calcium every 2 years from 25"], ["Pituitary", "IGF-1 and prolactin every 3–5 years and pituitary MRI every 5 years from 25"], ["NET", "Gastrin from 25; abdominal MRI every 5 years from 25, every 2.5 years from 40"]]},
  men2: {"lvl": "intl", "src": ["ata_men2", "gr:NBK1257"], "items": [["Thyroid", "Prophylactic thyroidectomy timed by ATA risk level; until then annual calcitonin from 3–5 (MEN2A) or 6 months (MEN2B); after surgery calcitonin and CEA at 3 months then annually"], ["Phaeochromocytoma", "Annual plasma metanephrines from 11 (ATA high/highest risk) or 16 (moderate risk), and before any surgery or pregnancy"], ["Parathyroid", "Annual calcium from 11 (high risk) or 16 (moderate risk) in MEN2A; not needed in MEN2B"]], "diff": [["aacr_endo", "Updated paediatric recommendations for MEN2 (2025)"]]},
  hptjt: {"lvl": "intl", "src": ["gr:NBK3789"], "items": [["Parathyroid", "Annual calcium and PTH (with vitamin D) from 10"], ["Jaw", "Dental review every 6 months; panoramic jaw X-ray at least every 5 years"], ["Kidney", "Renal ultrasound periodically"], ["Uterus", "Annual gynaecological review from reproductive age; pelvic ultrasound every 5 years"]], "diff": [["aacr_endo", "Updated paediatric recommendations for HPT-JT (2025)"]]},
  fipa: {"lvl": "intl", "src": ["gr:NBK97965"], "items": [["Pituitary", "Annual growth/puberty review and pituitary hormones (IGF-1, prolactin, sex hormones, TSH/fT4) from 4 to 30; pituitary MRI at 10 then every 5 years to 30; clinical review every 5 years from 30 to 50"]]},
  carney: {"lvl": "intl", "src": ["carney_nih", "gr:NBK1286"], "items": [["Heart", "Annual echocardiogram from childhood (6-monthly after an excised myxoma)"], ["Adrenal / pituitary / thyroid", "Annual urinary free cortisol, IGF-1 and thyroid ultrasound from adolescence"], ["Testis", "Annual testicular ultrasound from childhood in males"], ["Ovary", "Ultrasound as needed"]], "diff": [["aacr_endo", "Updated paediatric recommendations for Carney complex (2025)"]]},
  mas: {"lvl": "intl", "src": ["gr:NBK274564"], "items": [["Endocrine / skeletal", "Specialist monitoring: thyroid function (± ultrasound), testicular ultrasound periodically, skull CT about every 5 years, puberty and bone age review"]]},
  vhl: {"lvl": "intl", "src": ["vhl_consensus", "gr:NBK1463"], "items": [["General", "Annual clinical review and blood pressure from the first decade"], ["Retina", "Annual eye examination from 1 (no later than 5)"], ["Phaeochromocytoma", "Annual plasma or urine metanephrines from 5"], ["CNS", "Brain and spine MRI every 2 years from 11"], ["Abdomen", "Abdominal MRI (kidney, pancreas, adrenals) every 2 years from 15"], ["Ear (ELST)", "Audiology every 2–3 years from 11; internal auditory canal MRI once at 15–20"]], "diff": [["vhl_eu", "Danish/European guideline (2022) – surveillance from childhood of retina, CNS, inner ear, kidneys, adrenals and pancreas"], ["aacr_vhl", "Updated paediatric recommendations (2025); contrast-enhanced MRI is needed for haemangioblastoma surveillance"]]},
  sdhb: {"lvl": "uk", "src": ["sdhb"], "items": [["Biochemistry", "Annual symptom review, blood pressure and plasma metanephrines + 3-methoxytyramine from 5"], ["Imaging", "Abdominal MRI at baseline then every 12–24 months from 10; neck and thorax MRI every 2–3 years from 14–16"], ["Stopping", "If tumour-free at 70, review at 75 and 80 then stop"], ["Other tumours", "No specific imaging for GIST, RCC or pituitary adenoma without symptoms"]], "diff": [["sdhx_consensus", "International consensus on initial screening and follow-up of asymptomatic SDHx carriers (2021)"]]},
  sdhd: {"lvl": "uk", "src": ["sdhd"], "items": [["Biochemistry", "Paternally inherited variant: annual symptom review, blood pressure and plasma metanephrines + 3-methoxytyramine from 10"], ["Imaging", "MRI head, neck, abdomen and pelvis every 2–3 years from 13–16"], ["Maternal transmission", "Surveillance not routinely recommended (tumour risk ≤5%)"], ["Stopping", "If tumour-free at 70, review at 75 and 80 then stop"]]},
  sdhc: {"lvl": "uk", "src": ["sdhc"], "items": [["Biochemistry", "Annual symptom review, blood pressure and plasma metanephrines + 3-methoxytyramine from 10"], ["Imaging", "MRI head, neck, abdomen and pelvis every 2–3 years from 14–16"], ["Stopping", "If tumour-free at 70, review at 75 and 80 then stop"]]},
  sdha: {"lvl": "uk", "src": ["sdha"], "items": [["Unaffected carriers (predictive test)", "Annual symptom review, blood pressure and metanephrines + 3-methoxytyramine from 10; MRI neck to pelvis every 3–5 years from 15"], ["Incidental finding", "No surveillance unless SDHA/SDHB loss on tumour IHC or a family history of SDHA-related tumours"], ["After an SDHA tumour", "Annual biochemistry; imaging neck to pelvis every 2–3 years"]]},
  sdhaf2: {"lvl": "intl", "src": ["endo_ppgl", "gr:NBK1548"], "items": [["PPGL", "No agreed gene-specific schedule (risk mainly head and neck paraganglioma); GeneReviews suggests annual clinical review and metanephrines (2-yearly in childhood, annually in adults) with periodic imaging"], ["Before surgery / pregnancy", "Check metanephrines"]], "diff": [["aacr_ppgl", "Updated paediatric PPGL recommendations for SDHx, MAX and TMEM127 (2025)"]]},
  tmem127: {"lvl": "intl", "src": ["endo_ppgl", "gr:NBK1548"], "items": [["PPGL", "No agreed gene-specific schedule (risk mainly phaeochromocytoma); GeneReviews suggests annual clinical review and metanephrines (2-yearly in childhood, annually in adults) with periodic imaging"], ["Before surgery / pregnancy", "Check metanephrines"]], "diff": [["aacr_ppgl", "Updated paediatric PPGL recommendations for SDHx, MAX and TMEM127 (2025)"]]},
  max: {"lvl": "intl", "src": ["endo_ppgl", "gr:NBK1548"], "items": [["PPGL", "No agreed gene-specific schedule (risk mainly phaeochromocytoma); GeneReviews suggests annual clinical review and metanephrines (2-yearly in childhood, annually in adults) with periodic imaging"], ["Before surgery / pregnancy", "Check metanephrines"]], "diff": [["aacr_ppgl", "Updated paediatric PPGL recommendations for SDHx, MAX and TMEM127 (2025)"]]},
  hlrcc: {"lvl": "uk", "src": ["fh"], "items": [["Renal", "Annual renal MRI from 10 to 75 (3 mm slices)"], ["Uterine", "Consider annual gynaecology review and ultrasound from 20"], ["PPGL", "No routine surveillance; symptom awareness"]]},
  bhd: {"lvl": "uk", "src": ["flcn"], "items": [["Renal", "Annual MRI (or expert ultrasound) from 18 to 70"], ["Lung", "Baseline high-resolution CT at 20 or at diagnosis"], ["Colorectal", "Colonoscopy only with a family history of bowel cancer"]], "diff": [["ern_bhd", "Renal surveillance every 1–2 years (MRI preferred)"]]},
  hprc: {"lvl": "uk", "src": ["met"], "items": [["Renal", "Abdominal MRI every 2 years from 30 (or from 5 years before the earliest family diagnosis)"]]},
  tsc: {"lvl": "intl", "src": ["tsc_consensus", "aacr_pten_dicer1_tsc"], "items": [["Brain (SEGA)", "MRI every 1–3 years until 25 if asymptomatic"], ["Kidney", "Abdominal MRI every 1–3 years (ultrasound under 12); annual blood pressure and GFR"], ["Skin / eyes", "Annual dermatology and dilated eye examination"], ["Heart", "Echocardiogram at diagnosis (repeat 1–3-yearly if rhabdomyoma)"], ["Lung", "Chest CT at 18 in females (LAM) and symptomatic males"]]},
  bap1: {"lvl": "uk", "src": ["bap1"], "items": [["Renal", "Annual imaging from 30 (MRI preferred)"], ["Uveal melanoma", "Annual dilated eye examination by an ocular oncologist from 16–18"], ["Skin", "Annual dermatology review with photography from 18–20"], ["Mesothelioma", "Not recommended outside research; symptom awareness"]], "note": "The European BAP1 guideline (2023) gives the same schedule."},
  cdkn2a: {"lvl": "intl", "src": ["gr:NBK616232", "nccn_bopp"], "items": [["Skin", "Dermatology every 6 months from diagnosis; monthly self-examination"], ["Pancreas", "Annual MRCP or EUS (alternating) from 40 or 10 years before the earliest family diagnosis; in the UK offered within research (EUROPAC)"], ["Nervous system", "Consider annual brain and whole-body MRI for p14ARF-affecting variants with a family history of nervous system tumours"]]},
  cdk4: {"lvl": "none", "src": [], "items": [], "note": "No CDK4-specific guideline found; dermatology review guided by family history."},
  pot1: {"lvl": "uk", "src": ["pot1"], "items": [["Skin", "Baseline dermatology examination at diagnosis (18+); further review by individual risk, every 3–6 months if high risk"], ["Angiosarcoma", "Cardiac MRI every 6–12 months only if a first/second-degree relative had cardiac angiosarcoma (18+)"], ["CLL / glioma", "Not recommended"]]},
  gorlin: {"lvl": "intl", "src": ["aacr_brain", "gr:NBK1151"], "items": [["Skin", "Dermatology at least annually (consider every 3–4 months) from 10, earlier after radiotherapy"], ["Jaw", "Orthopantomogram (or MRI) every 12–18 months from 8"], ["Medulloblastoma", "Clinical: neurological exam and head circumference every 3–4 months to 5; routine brain MRI not warranted for PTCH1"], ["Heart", "Baseline echocardiogram in infancy (cardiac fibroma)"], ["Ovary", "Pelvic ultrasound once at 18"], ["Radiation", "Avoid ionising radiation and sun exposure where possible"]], "note": "European guidelines (basal cell naevus syndrome 2022; SIOPE 2021) are linked under European guidance."},
  sufu: {"lvl": "intl", "src": ["aacr_brain", "gr:NBK1151"], "items": [["Medulloblastoma", "Brain MRI every 3–4 months to 3, every 6 months to 5 (some guidelines annually to 8); neurological exam"], ["Meningioma", "Brain MRI every 3–5 years from 30"], ["Skin", "Dermatology at least annually from 10"], ["Ovary", "Pelvic ultrasound every 3 years from 5"], ["Heart", "Baseline echocardiogram in infancy"]], "note": "European guidelines (basal cell naevus syndrome 2022; SIOPE 2021) are linked under European guidance."},
  xp: {"lvl": "intl", "src": ["gr:NBK1397"], "items": [["Skin", "Physician skin examination every 3–12 months; weekly checks by patient or carers; strict UV protection"], ["Eyes", "Eye examination at least every 6 months"], ["Neurological / hearing", "Neurological review and audiograms every 6–12 months"]], "note": "Managed through the national XP service."},
  nf1: {"lvl": "uk", "src": ["mangen_nf1"], "items": [["Overview", "All patients seen in clinical genetics at (possible) diagnosis; annual NF1 review by community/district paediatrician and GP through childhood, then GP in adulthood; complex cases via the nationally funded Complex NF1 Service"], ["Genetics appointments", "Under 6 at 50% risk: in the first year, then at 2 and 5 (NF1 can usually be excluded if no café au lait macules by 5; consider genetic testing). Affected under 8: confirm diagnosis and counsel family. 8–15 and over 16: on request. 16–18: appointment about adult complications and genetics"], ["Eyes", "Under 8 affected: at least annual paediatric ophthalmology; 8–15: annual optician/orthoptist; 16+: symptom check at NF1 review. Urgent ophthalmology referral for squint, proptosis, reduced acuity or visual symptoms"], ["Annual review – children (0–16)", "Height, weight, head circumference and blood pressure; skin (neurofibromas, plexiform neurofibromas, large café au lait areas or hair growth); scoliosis and pseudarthrosis; neurological symptoms; development and puberty; learning and behaviour (ADHD, ASD)"], ["Annual review – adults (16+)", "Symptomatic subcutaneous or plexiform neurofibromas; neurological symptoms (headache, seizures, nerve pain, gait or visual change); blood pressure (renovascular lesions usually <20, phaeochromocytoma at any age); psychological burden"], ["Breast", "Women 40–50: refer to local breast screening for annual mammography (moderate risk, NICE)"], ["When to refer", "Rapidly growing, painful or changing lesion: urgent referral to Complex NF1 Service or sarcoma team (MPNST). Any spinal curvature or bowing: NF1 orthopaedics. New or worsening headache or neurological symptoms: Complex NF1 Service or neurology. Hypertension with possible phaeochromocytoma: endocrinology. Pregnancy planning: clinical genetics"]], "note": "Manchester Centre for Genomic Medicine NF1 review checklist, version 18 (updated January 2019; its stated review date of January 2022 has passed).", "diff": [["ern_nf1", "ERN GENTURIS 2023: breast MRI annually 30–50 (rather than mammography 40–50); whole-body MRI once at transition to adulthood; ophthalmology at least yearly to 8, then 2-yearly to adulthood; adult clinical review at least every 3 years"]]},
  nf2: {"lvl": "intl", "src": ["aacr_schwann", "gr:NBK1201"], "items": [["Baseline", "At diagnosis or age 10: brain MRI with internal auditory canal views, spine MRI, whole-body MRI, audiology and ophthalmology"], ["Ongoing", "Annual neurological exam and audiology; annual brain MRI from 10; spine MRI every 3 years"]]},
  smarcb1: {"lvl": "eu", "src": ["siope_rhabdoid", "ern_schwann"], "items": [["Rhabdoid tumours (infancy)", "Neurological exam and brain + spine MRI from birth: every 4–6 weeks to 6 months (not less than every 2–3 months), then every 3 months to 5 years"], ["Abdomen / neck", "Ultrasound every 3 months under 5, every 6 months over 5"], ["Whole body", "Annual whole-body MRI, continuing after 5"], ["Schwannomatosis", "Baseline brain, spine and whole-body MRI; repeat every 2–3 years if tumours"], ["Relatives", "Test young siblings even if parents test negative (gonadal mosaicism)"]]},
  lztr1: {"lvl": "eu", "src": ["ern_schwann"], "items": [["Imaging", "Baseline brain (fine cuts through internal auditory canals) and spine or whole-body MRI at diagnosis (around 12–14, without anaesthesia); repeat every 2–3 years if tumours present"], ["Incidental finding", "No imaging if no personal or family history of schwannoma and no pain (risk <1%)"]], "diff": [["aacr_schwann", "Annual neurological and pain assessment; brain MRI from 13 (or 3 years after baseline) every 3 years, alternating spine MRI and whole-body MRI"]]},
  smarca4: {"lvl": "eu", "src": ["siope_rhabdoid", "sccoht"], "items": [["Infancy", "As for SMARCB1 (brain/spine MRI, ultrasound, whole-body MRI)"], ["Ovary (females)", "Abdominopelvic ultrasound every 6 months from 5 for SCCOHT; discuss risk-reducing salpingo-oophorectomy"], ["Neuroblastoma", "No routine screening"]]},
  smarce1: {"lvl": "intl", "src": ["aacr_brain"], "items": [["CNS", "Neurological exam and brain + spine MRI yearly from diagnosis until 30, then every 2–3 years (the article table gives yearly to 18 then 5-yearly)"]]},
  dgcr8: {"lvl": "eu", "src": ["ern_schwann"], "items": [["Schwannomas", "No gene-specific guidance; schwannomatosis approach: baseline craniospinal or whole-body MRI, repeat every 2–3 years if tumours"], ["Thyroid", "Clinical thyroid assessment (multinodular goitre)"]]},
  jmjd1c: {"lvl": "none", "src": [], "items": [], "note": "No surveillance recommendations (AACR 2024 CNS update); genetic counselling."},
  elp1: {"lvl": "intl", "src": ["aacr_brain"], "items": [["Medulloblastoma", "No routine imaging; educate about symptoms; annual CNS-focused examination; personalised imaging only after shared decision-making"]]},
  gpr161: {"lvl": "intl", "src": ["aacr_brain"], "items": [["Medulloblastoma", "No routine imaging; educate about symptoms; annual CNS-focused examination; personalised imaging only after shared decision-making"]]},
  dicer1: {"lvl": "uk", "src": ["dicer1"], "items": [["General", "Annual clinical review from birth to 20 (paediatric oncology to 8, then endocrinology)"], ["Lung", "Chest X-ray every 6 months from birth to 6; consider low-dose CT in year 1 and at 2.5–3 years"], ["Kidney", "Abdominal ultrasound every 6 months from birth to 6"], ["Thyroid", "Ultrasound every 3 years from 8 to 40"], ["Ovary", "Clinical evaluation; annual pelvic ultrasound 8–40 can be considered individually"]]},
  rb1: {"lvl": "intl", "src": ["aacr_rb", "gr:NBK1452"], "items": [["Eyes", "Examination (under anaesthesia when young) every 3–4 weeks to 6 months, every 2 months to 3 years, every 3–6 months to 7, annually to 10, then every 2 years"], ["Second cancers", "Prompt investigation of symptoms (sarcoma, melanoma); avoid radiation where possible"]], "note": "Usually via the Highly Specialised Retinoblastoma Services in the UK."},
  wt1: {"lvl": "intl", "src": ["aacr_bws", "gr:NBK556455"], "items": [["Wilms tumour", "Renal ultrasound every 3 months from birth (or diagnosis) to the 7th birthday"], ["Kidney", "Monitor for proteinuria (6-monthly to 10, then annually)"]], "note": "SIOPE (European) guidance uses a 5% risk threshold for surveillance; AACR uses 1%."},
  wilms_other: {"lvl": "intl", "src": ["gr:NBK1294", "aacr_wilms"], "items": [["Wilms tumour", "Abdominal ultrasound every 3 months until age 8 where the at-risk age is not established"]]},
  perlman: {"lvl": "intl", "src": ["aacr_bws"], "items": [["Wilms tumour", "Renal ultrasound every 3 months to the 7th birthday"]]},
  mulibrey: {"lvl": "intl", "src": ["aacr_bws"], "items": [["Wilms tumour", "Renal ultrasound every 3 months to the 7th birthday"]]},
  mva: {"lvl": "intl", "src": ["gr:NBK1294"], "items": [["Wilms tumour", "Consider abdominal ultrasound every 3 months until 8 (risk above surveillance thresholds); discuss with paediatric oncology"]]},
  bws: {"lvl": "intl", "src": ["aacr_bws", "gr:NBK1394"], "items": [["Hepatoblastoma", "Abdominal ultrasound and serum AFP every 3 months to the 3rd–4th birthday"], ["Wilms tumour", "Renal ultrasound every 3 months to the 7th birthday (include adrenals)"], ["CDKN1C variants", "Neuroblastoma screening (abdominal ultrasound, urine VMA/HVA, chest X-ray) every 3 months to 6, then 6-monthly to 10 – discuss benefits and harms"]], "diff": [["bws_consensus", "International consensus (2018): European centres often limit screening to higher-risk molecular subgroups (5% threshold)"]]},
  sgbs: {"lvl": "intl", "src": ["aacr_bws", "gr:NBK1219"], "items": [["Wilms / hepatoblastoma", "Abdominal ultrasound and AFP every 3 months to 3, renal ultrasound every 3 months to 7"]]},
  sotos: {"lvl": "intl", "src": ["aacr_bws"], "items": [["Tumours", "No routine tumour surveillance (Wilms risk <1%); clinical vigilance"]]},
  weaver: {"lvl": "intl", "src": ["aacr_bws", "gr:NBK148820"], "items": [["Neuroblastoma", "Clinical vigilance; US guidance suggests imaging and urine catecholamines to age 10, practice varies internationally"]]},
  alk: {"lvl": "intl", "src": ["aacr_nb", "gr:NBK24599"], "items": [["0–6 years", "Abdominal ultrasound and urine HVA/VMA every 3 months; examination and chest X-ray every 6 months"], ["6–10 years", "Abdominal ultrasound, urine HVA/VMA and examination every 6 months; chest X-ray every 6–12 months"], ["Over 10", "No screening"]]},
  phox2b: {"lvl": "intl", "src": ["aacr_nb"], "items": [["Neuroblastoma", "Risk mainly with non-polyalanine repeat (NPARM) variants; see the AACR neuroblastoma update for screening; CCHS managed in a specialist centre"]]},
  noonan: {"lvl": "intl", "src": ["aacr_ras", "gr:NBK1124"], "items": [["JMML / MPD", "Examination for hepatosplenomegaly every 3 months to 1, then at each check to 5 (PTPN11/KRAS: consider blood count 3–6-monthly to 5)"], ["Brain tumours", "No surveillance unless symptoms"]]},
  cbl: {"lvl": "intl", "src": ["aacr_ras"], "items": [["JMML / MPD", "Examination for hepatosplenomegaly every 3 months to 1, then at each check to 5"]]},
  costello: {"lvl": "intl", "src": ["aacr_ras", "gr:NBK1507"], "items": [["Rhabdomyosarcoma", "Abdominopelvic ultrasound every 3 months to 14 (HRAS p.Gly12 variants)"], ["Neuroblastoma", "Ultrasound every 6–12 months to 10"], ["Bladder", "Annual urinalysis from 10; consider cystoscopy every 2 years"]]},
  kit: {"lvl": "intl", "src": ["gr:NBK625142"], "items": [["GIST", "Clinical review and abdomen/pelvis CT or MRI at least annually from 18"]]},
  pdgfra: {"lvl": "intl", "src": ["gr:NBK625142"], "items": [["GIST", "Clinical review and abdomen/pelvis CT or MRI at least annually from 18"]]},
  pdgfrb: {"lvl": "none", "src": [], "items": [], "note": "No surveillance guideline found."},
  tbxt: {"lvl": "none", "src": [], "items": [], "note": "No surveillance recommendations (AACR 2024 CNS update); genetic counselling."},
  ollier: {"lvl": "none", "src": [], "items": [], "note": "No surveillance guideline found."},
  fancm: {"lvl": "none", "src": [], "items": [], "note": "No published surveillance guideline. Avoid standard-dose DNA crosslinking chemotherapy without specialist advice (toxicity reported); manage breast screening on family history and specialist advice."},
  fanconi: {"lvl": "intl", "src": ["fa_guidelines", "gr:NBK1401"], "items": [["Blood / marrow", "Blood counts every 3–4 months; bone marrow at least annually from 2"], ["Head and neck", "Oral/ENT exam every 6 months from 9–10; annual nasolaryngoscopy from 10"], ["Gynaecological", "Annual assessment from 13; cervical cytology annually from 18"], ["Skin", "Dermatology every 6–12 months"], ["BRCA2/PALB2-type FA", "Annual abdominal ultrasound and brain MRI from diagnosis"]]},
  at: {"lvl": "intl", "src": ["gr:NBK26468", "aacr_gid"], "items": [["Haematological", "Annual clinical review and blood tests for leukaemia/lymphoma"], ["Breast", "Annual MRI from 25 in females"], ["Abdomen", "Annual ultrasound in adults"], ["Radiation", "Avoid ionising radiation"]]},
  nbs: {"lvl": "intl", "src": ["gr:NBK1176", "aacr_gid"], "items": [["Lymphoma", "Annual clinical assessment for malignancy, with imaging if symptoms"], ["Radiation", "Avoid ionising radiation"]]},
  bloom: {"lvl": "intl", "src": ["gr:NBK1398", "aacr_gid"], "items": [["Wilms tumour", "Abdominal ultrasound every 3 months to 8"], ["Haematological", "Education and review for leukaemia/lymphoma at every visit; whole-body MRI every 1–2 years from 12–13"], ["Colorectal", "Colonoscopy annually from 10–12"], ["Skin", "Annual dermatology"]]},
  rts: {"lvl": "intl", "src": ["gr:NBK1237", "aacr_gid"], "items": [["General / skin", "Annual review and dermatology"], ["Osteosarcoma", "Prompt X-ray for bone pain, swelling or a growing limb lesion"]]},
  werner: {"lvl": "intl", "src": ["gr:NBK1514"], "items": [["Malignancy", "Annual examination for common cancers, skin (acral melanoma) and neurological signs (meningioma)"]]},
  cebpa: {"lvl": "uk", "src": ["cebpa"], "items": [["Haematological", "No evidence-based surveillance; symptom awareness and prompt review for signs of AML/MDS; haematology referral if any blood abnormality"]]},
  runx1: {"lvl": "uk", "src": ["runx1"], "items": [["Haematological", "Refer to a haematologist with a haemostasis interest and register with a Haemophilia Centre; no evidence-based malignancy surveillance; symptom awareness"]]},
  gata2: {"lvl": "uk", "src": ["gata2"], "items": [["Haematological", "No evidence-based surveillance; symptom awareness, infection-prevention advice"], ["Other", "Baseline examination for lymphoedema and genital warts (anogenital dysplasia)"]]},
  ddx41: {"lvl": "uk", "src": ["ddx41"], "items": [["Haematological", "No evidence-based surveillance; symptom awareness and prompt review for signs of AML/MDS; haematology referral if any blood abnormality"]]},
  etv6: {"lvl": "uk", "src": ["etv6"], "items": [["Haematological", "Refer to a haematologist with a haemostasis interest and register with a Haemophilia Centre; no evidence-based malignancy surveillance; symptom awareness"]]},
  ankrd26: {"lvl": "uk", "src": ["ankrd26"], "items": [["Haematological", "Refer to a haematologist with a haemostasis interest and register with a Haemophilia Centre; no evidence-based malignancy surveillance; symptom awareness"]]},
  samd9l: {"lvl": "intl", "src": ["gr:NBK435692", "aacr_heme"], "items": [["Haematological", "Haematology review and blood count every 6–12 months; consider annual bone marrow (morphology, cytogenetics, monosomy 7)"]]},
  pax5: {"lvl": "intl", "src": ["aacr_heme"], "items": [["ALL", "No specific schedule; symptom awareness – see AACR haematological predisposition update"]]},
  kdm3b: {"lvl": "none", "src": [], "items": [], "note": "No surveillance guideline found."},
  tbd: {"lvl": "intl", "src": ["gr:NBK22301"], "items": [["Marrow", "Annual blood count and bone marrow"], ["Head and neck", "Monthly self-examination; annual ENT review; dental review every 6 months"], ["Other", "Annual gynaecological and dermatology review; annual lung function from 8"]]}
};

/*
 * Date each syndrome's content (associations, tests, references, surveillance) was last reviewed,
 * as YYYY-MM-DD. Update the entry whenever a syndrome is re-checked; pages flag dates over 12 months old.
 */
const LAST_REVIEWED = {
  fancm: '2026-10-11',
  brca1: '2026-10-11', brca2: '2026-10-11', palb2: '2026-10-11', atm: '2026-10-11', chek2: '2026-10-12', bard1: '2026-10-11',
  rad51d: '2026-10-11', rad51c: '2026-10-11', brip1: '2026-10-11', lynch_mlh1: '2026-10-11', lynch_msh2: '2026-10-11', lynch_msh6: '2026-10-11',
  lynch_pms2: '2026-10-11', cmmrd: '2026-10-11', fap: '2026-10-11', map: '2026-10-11', nthl1: '2026-10-11', ppap: '2026-10-11',
  mbd4: '2026-10-11', jps_smad4: '2026-10-11', jps_bmpr1a: '2026-10-11', hmps: '2026-10-11', rnf43: '2026-10-11', pjs: '2026-10-11',
  phts: '2026-10-11', hdgc: '2026-10-11', ctnna1: '2026-10-11', tylosis: '2026-10-11', lfs: '2026-10-12', men1: '2026-10-11',
  men4: '2026-10-11', men2: '2026-10-11', hptjt: '2026-10-11', fipa: '2026-10-11', carney: '2026-10-11', mas: '2026-10-11',
  vhl: '2026-10-11', sdhb: '2026-10-11', sdhd: '2026-10-11', sdhc: '2026-10-11', sdha: '2026-10-11', sdhaf2: '2026-10-11',
  tmem127: '2026-10-11', max: '2026-10-11', hlrcc: '2026-10-11', bhd: '2026-10-11', hprc: '2026-10-11', tsc: '2026-10-11',
  bap1: '2026-10-11', cdkn2a: '2026-10-11', cdk4: '2026-10-11', pot1: '2026-10-11', gorlin: '2026-10-11', sufu: '2026-10-11',
  xp: '2026-10-11', nf1: '2026-10-12', nf2: '2026-10-11', smarcb1: '2026-10-11', lztr1: '2026-10-11', smarca4: '2026-10-11',
  smarce1: '2026-10-11', dgcr8: '2026-10-12', jmjd1c: '2026-10-11', elp1: '2026-10-12', gpr161: '2026-10-11', dicer1: '2026-10-11',
  rb1: '2026-10-11', wt1: '2026-10-11', wilms_other: '2026-10-11', perlman: '2026-10-11', mulibrey: '2026-10-11', mva: '2026-10-12',
  bws: '2026-10-12', sgbs: '2026-10-11', sotos: '2026-10-11', weaver: '2026-10-11', alk: '2026-10-11', phox2b: '2026-10-11',
  noonan: '2026-10-11', cbl: '2026-10-11', costello: '2026-10-11', kit: '2026-10-11', pdgfra: '2026-10-11', pdgfrb: '2026-10-11',
  tbxt: '2026-10-11', ollier: '2026-10-11', fanconi: '2026-10-11', at: '2026-10-11', nbs: '2026-10-11', bloom: '2026-10-11',
  rts: '2026-10-11', werner: '2026-10-11', cebpa: '2026-10-11', runx1: '2026-10-11', gata2: '2026-10-11', ddx41: '2026-10-11',
  etv6: '2026-10-11', ankrd26: '2026-10-11', samd9l: '2026-10-12', pax5: '2026-10-11', kdm3b: '2026-10-11', tbd: '2026-10-12'
};

/* Syndrome categories for the Syndromes tab (same order as CONDITIONS). */
const CATEGORIES = [
  ['Breast and ovarian', ['brca1', 'brca2', 'palb2', 'atm', 'chek2', 'bard1', 'rad51d', 'rad51c', 'brip1']],
  ['Colorectal and gastrointestinal', ['lynch_mlh1', 'lynch_msh2', 'lynch_msh6', 'lynch_pms2', 'cmmrd', 'fap', 'map', 'nthl1', 'ppap', 'mbd4', 'jps_smad4', 'jps_bmpr1a', 'hmps', 'rnf43', 'pjs', 'phts', 'hdgc', 'ctnna1', 'tylosis']],
  ['Multi-cancer (Li–Fraumeni)', ['lfs']],
  ['Endocrine', ['men1', 'men4', 'men2', 'hptjt', 'fipa', 'carney', 'mas']],
  ['Phaeochromocytoma / paraganglioma and renal', ['vhl', 'sdhb', 'sdhd', 'sdhc', 'sdha', 'sdhaf2', 'tmem127', 'max', 'hlrcc', 'bhd', 'hprc', 'tsc', 'bap1']],
  ['Skin', ['cdkn2a', 'cdk4', 'pot1', 'gorlin', 'sufu', 'xp']],
  ['CNS and nerve sheath', ['nf1', 'nf2', 'smarcb1', 'lztr1', 'smarca4', 'smarce1', 'dgcr8', 'jmjd1c', 'elp1', 'gpr161']],
  ['Paediatric embryonal and overgrowth', ['dicer1', 'rb1', 'wt1', 'wilms_other', 'perlman', 'mulibrey', 'mva', 'bws', 'sgbs', 'sotos', 'weaver', 'alk', 'phox2b']],
  ['RASopathies', ['noonan', 'cbl', 'costello']],
  ['GIST and mesenchymal', ['kit', 'pdgfra', 'pdgfrb', 'tbxt', 'ollier']],
  ['DNA repair and chromosome instability', ['fanconi', 'fancm', 'at', 'nbs', 'bloom', 'rts', 'werner']],
  ['Haematological', ['cebpa', 'runx1', 'gata2', 'ddx41', 'etv6', 'ankrd26', 'samd9l', 'pax5', 'kdm3b', 'tbd']]
];


/*
 * NHS National Genomic Test Directory for Rare and Inherited Disease,
 * eligibility criteria v9.1 (20 May 2026). Part XI Inherited cancer unless
 * `part` names another chapter (e.g. IV Endocrinology, VIII Haematology).
 * Criteria are condensed from the document. `panel` is the PanelApp panel ID.
 */
const TD_VERSION = 'Rare and Inherited Disease eligibility criteria v9.1 (20 May 2026)';
const TD_URL = 'https://www.england.nhs.uk/wp-content/uploads/2018/08/rare-and-inherited-disease-eligibility-criteria-v9.1.pdf';
const PANELAPP = id => `https://panelapp.genomicsengland.co.uk/panels/${id}/`;

const TESTS = {
  R207: { code: 'R207', name: 'Inherited ovarian cancer (without breast cancer)', panel: 143,
    genes: 'Small panel – Inherited ovarian cancer (without breast cancer)',
    criteria: ['High-grade non-mucinous epithelial ovarian cancer or STIC at any age',
      'EOC/STIC AND ≥1 FDR with EOC/STIC, OR ≥1 SDR with EOC/STIC (intervening relative without ovaries or deceased), OR ≥2 second/third-degree relatives with EOC/STIC',
      'Deceased proband: stored DNA and criteria met; or tissue only and criteria 2 met or pathology-adjusted Manchester ≥17 / CanRisk ≥15%'] },
  R208: { code: 'R208', name: 'Inherited breast cancer and ovarian cancer', panel: 635,
    genes: 'Small panel – Inherited breast and ovarian cancer',
    criteria: ['Living affected with breast* or high-grade ovarian cancer and: breast cancer <40; bilateral breast cancer <60; triple-negative breast cancer <60; assigned male at birth with breast cancer (any age); breast cancer <45 with FDR breast cancer <45; pathology-adjusted Manchester ≥15 (single gene ≥10) or CanRisk ≥10%; Ashkenazi Jewish ancestry; ≥1 grandparent from Westray or Whalsay',
      'Pancreatic cancer with family history of breast/high-grade ovarian/prostate cancer and Manchester ≥15 / CanRisk 10%',
      'Prostate cancer with family history of breast/ovarian/pancreatic cancer and Manchester ≥15 / CanRisk 10%',
      'Deceased affected: stored DNA and criteria met; or tissue only with Manchester ≥17 / CanRisk ≥15%',
      'Unaffected (Clinical Genetics only): FDR with breast or serous ovarian cancer, Manchester ≥20 / CanRisk ≥20% for affected relative or ≥10% for unaffected, no living affected or tumour available',
      '*Breast cancer includes high-grade DCIS, not LCIS. Fallopian tube and primary peritoneal cancers included'] },
  R210: { code: 'R210', name: 'Inherited MMR deficiency (Lynch syndrome)', panel: 503,
    genes: 'Small panel – Inherited MMR deficiency (Lynch syndrome); R210.4 germline MLH1 promoter methylation; R210.6 PMS2 MLPA',
    criteria: ['Germline: dMMR tumour where further testing suggests Lynch (BRAF in MLH1-deficient CRC; MLH1 hypermethylation in BRAF-negative CRC and all MLH1-deficient endometrial cancers)',
      'Germline: proband from a modified Amsterdam-positive family irrespective of tumour dMMR status',
      'Germline: personal/family history suggestive of CMMRD with Wimmer score ≥3',
      'Tumour MSI/IHC first if: modified Amsterdam; any Lynch-related cancer <50 (excluding isolated pancreas, prostate or gastric); two Lynch-related cancers (one CRC/EC); Lynch-related cancer + FDR (both ≤60); + ≥2 relatives (all ≤75); + ≥3 relatives (any age) – one CRC/EC in each case',
      'Lynch-related: colorectal, endometrial, epithelial ovarian, urothelial, renal pelvis TCC, cholangiocarcinoma, small bowel, upper GI, glioblastoma, endocervical, ≥2 sebaceous adenomas or ≥1 sebaceous carcinoma, prostate, gastric, pancreas',
      'Germline MLH1 promoter methylation: tumour methylation in >1 affected relative with CRC ≤60'] },
  R211: { code: 'R211', name: 'Inherited polyposis and early onset colorectal cancer – germline test', panel: 504,
    genes: 'Small panel – Inherited polyposis; R211.3 PMS2 MLPA',
    criteria: ['Colorectal or endometrial cancer <40; small bowel cancer <40',
      'CRC/EC with ≥2 siblings with CRC/EC, ≥1 diagnosed <50',
      'Adenomas: ≥5 with CRC; ≥5 aged <40; ≥10 aged <60; ≥20 aged ≥60; ≥5 aged <60 with FDR with ≥5 adenomas or CRC <60',
      'Serrated polyposis syndrome (WHO criteria) if aged <50, FDR with SPS, or dysplasia in any polyp',
      'Hamartomatous: ≥5 colorectal, ≥2 anywhere in GI tract, or ≥1 with a first/second-degree relative with a hamartomatous polyp'] },
  R414: { code: 'R414', name: 'APC associated polyposis', panel: 1212, genes: 'APC',
    criteria: ['Children/young adults (before colonoscopy) with: multifocal/bilateral CHRPE; desmoid (CTNNB1 wild-type); cribriform-morular PTC; hepatoblastoma; multiple osteomas or dental anomalies; classic medulloblastoma; pilomatrixomas (≥6 any age, ≥2 <20, or with another APC feature)',
      'Gastric polyposis meeting GAPPS criteria at any age'] },
  R212: { code: 'R212', name: 'Peutz Jeghers syndrome', panel: 1377, genes: 'STK11',
    criteria: ['≥2 PJS-type hamartomatous polyps; or ≥1 PJS polyp with characteristic pigmentation; or pigmentation age <10',
      'SCTAT or adenoma malignum of the cervix at any age',
      '≥1 PJS polyp or pigmentation AND first/second-degree relative with a PJS-like feature or ≥2 PJS-related cancers'] },
  R213: { code: 'R213', name: 'PTEN hamartoma tumour syndrome', panel: 1382, genes: 'PTEN',
    criteria: ['Macrocephaly AND mucocutaneous lesions (≥6 facial papules with ≥3 trichilemmomas; facial papules + oral papillomatosis; oral papillomatosis + acral keratoses; ≥6 palmoplantar keratoses)',
      'Macrocephaly AND ≥1 major (breast cancer, non-medullary thyroid cancer, endometrial carcinoma) or ≥3 minor criteria',
      'Adult Lhermitte–Duclos disease',
      'Cleveland Clinic PTEN score ≥10% probability'] },
  R214: { code: 'R214', name: 'Nevoid basal cell carcinoma syndrome / Gorlin syndrome', panel: 1373, genes: 'PTCH1, SUFU',
    criteria: ['≥1 major: falx calcification (lamellar, or any <20); odontogenic keratocyst; ≥2 palmar/plantar pits; SHH medulloblastoma; >5 BCCs under 50',
      'OR ≥2 minor: childhood medulloblastoma (SHH not tested); lympho-mesenteric/pleural cysts; macrocephaly; cleft lip/palate; vertebral/rib anomalies; polydactyly; ovarian/cardiac fibromas; ocular anomalies'] },
  R215: { code: 'R215', name: 'Hereditary diffuse gastric cancer', panel: 1221, genes: 'CDH1, CTNNA1',
    criteria: ['Diffuse gastric cancer <50; gastric in situ signet ring cells / pagetoid spread <50',
      'DGC at any age with personal or FDR cleft lip/palate; DGC in an individual of Māori ethnicity',
      'DGC and lobular breast cancer in the same person (both <70)',
      'DGC with FDR/SDR with DGC (any age) or lobular breast cancer <70; lobular breast cancer with FDR/SDR with DGC <70',
      '≥2 lobular breast cancers <50 (proband or FDR/SDR); bilateral lobular breast cancer <70'] },
  R216: { code: 'R216', name: 'Li Fraumeni syndrome', panel: 1222, genes: 'TP53, POT1',
    criteria: ['Rhabdomyosarcoma ≤5; embryonal anaplastic RMS (any age); adrenocortical cancer; choroid plexus cancer',
      'Breast cancer ≤30; HER2-positive breast cancer ≤35; hypodiploid ALL <18; SHH medulloblastoma <18; jaw osteosarcoma <18',
      '≥2 LFS-related cancers both ≤46 (not two breast)',
      'LFS-related cancer with FDR/SDR with LFS-related cancer (one ≤46, other ≤56; not two breast)',
      'Cancer with ≥2 FDR/SDR: sarcoma ≤45 + any cancer ≤45 + sarcoma or cancer ≤45',
      'POT1: ≥2 POT1-associated cancers (melanoma, CLL, angiosarcoma, glioma; not two melanomas), or one with FDR/SDR with one',
      'LFS-related: soft tissue sarcoma, osteosarcoma, ACC, CNS tumours, breast cancer incl. malignant phyllodes'] },
  R219: { code: 'R219', name: 'Retinoblastoma', panel: 1384, genes: 'RB1 (sequencing + MLPA)',
    criteria: ['Retinoblastoma (unilateral, bilateral or multifocal) ± family history; usually via Highly Specialised Retinoblastoma Services'] },
  R456: { code: 'R456', name: 'Embryonal tumour of possible germline origin', panel: 1636,
    genes: 'ALK, BUB1B, CBL, CDKN1C, CTR9, DICER1, DIS3L2, ELP1, EZH2, GPC3, GPR161, HRAS, KRAS, PHOX2B, PTCH1, PTPN11, REST, SMARCA4, SMARCB1, SOS1, SUFU, TP53, TRIM28, TRIM37, TRIP13, WT1 + 11p15 methylation',
    criteria: ['Wilms tumour / nephrogenic rests with: diagnosis <2; bilateral; multifocal; family history; proteinuria or renal failure; hypospadias, undescended testes or ambiguous genitalia; gonadoblastoma',
      'Neuroblastoma: bilateral/multiple; relative with neuroblastoma; Hirschsprung or congenital hypoventilation (self or relative)',
      'SHH medulloblastoma <25 (no other germline panel/WGS)',
      'AT/RT or SCCOHT at any age'] },
  R457: { code: 'R457', name: 'Sarcoma of possible germline origin', panel: 1637,
    genes: 'BUB1B, CBL, DICER1, HRAS, KRAS, NBN, NF1, PTPN11, RB1, WRN (RECQL2), RECQL4, TP53, TBXT duplications',
    criteria: ['Translocation-negative sarcoma <25; sarcoma with FDR/SDR with sarcoma; multiple primary sarcomas; MPNST <25',
      'Chordoma <25, multiple, or familial; multiple benign notochordal tumours'] },
  R223: { code: 'R223', part: 'IV', name: 'Inherited phaeochromocytoma and paraganglioma excluding NF1', panel: 649,
    genes: 'Small panel – Inherited phaeochromocytoma and paraganglioma excluding NF1',
    criteria: ['Phaeochromocytoma <60; any paraganglioma or metastatic phaeochromocytoma (any age)',
      'PPGL with loss of SDH staining on IHC; bilateral phaeochromocytoma; phaeochromocytoma and RCC (any age)',
      'PPGL (any age) with ≥1 first/second/third-degree relative with PPGL or GIST',
      'Does not include NF1; use R363 where GIST predominates in the family'] },
  R224: { code: 'R224', name: 'Inherited renal cancer', panel: 521, genes: 'Small panel – Inherited renal cancer',
    criteria: ['Renal cancer ≤46; FH-deficient/HLRCC-associated or SDH-deficient RCC; bilateral/multifocal (any age)',
      'Renal cancer with FDR with renal cancer (both <60) or SDR (both <50)',
      'Renal tumour with syndromic features: haemangioblastoma, retinal angioma, PPGL, pneumothorax/BHD lung features, fibrofolliculomas, trichodiscomas, cutaneous leiomyomata, uterine leiomyomas <40 with FH pathology, mesothelioma, uveal melanoma',
      'Karyotype via Clinical Genetics if ≥3 FDR/SDR with renal cancer'] },
  R225: { code: 'R225', name: 'Von Hippel Lindau syndrome', panel: 1403, genes: 'VHL',
    criteria: ['Retinal angioma, spinal haemangioblastoma or endolymphatic sac tumour <40; cerebellar or spinal haemangioblastoma <60',
      '≥2 VHL-related tumours; or ≥1 with FDR with ≥1 (one being retinal angioma/haemangioblastoma)',
      'VHL-related: retinal angioma, CNS haemangioblastoma, phaeochromocytoma/PGL, RCC, multiple renal/pancreatic cysts, ELST, epididymal/broad ligament cystadenoma, pancreatic NET'] },
  R254: { code: 'R254', name: 'Familial melanoma', panel: 522, genes: 'Small panel – Familial melanoma',
    criteria: ['Melanoma <18; ≥2 melanomas/MIS <30; melanoma <30 with FDR/SDR <30; ≥3 melanomas/MIS',
      '≥3 melanomas across proband and FDR/SDR',
      '≥2 melanomas with FDR pancreatic cancer <60; melanoma + atypical moles with FDR pancreatic cancer <60'] },
  R422: { code: 'R422', name: 'BAP1 associated tumour predisposition syndrome', panel: 1216, genes: 'BAP1',
    criteria: ['≥2 core BAP1 tumours (mesothelioma, uveal melanoma, cutaneous melanoma, RCC, BIMT; not two melanomas)',
      '≥2 BIMTs; BAP1 tumour with FDR with core BAP1 tumour (not two melanomas or renal cancers)',
      'Mesothelioma <60 without asbestos exposure; uveal melanoma <40'] },
  R363: { code: 'R363', name: 'Inherited predisposition to GIST', panel: 523, genes: 'Small panel – Inherited predisposition to GIST',
    criteria: ['GIST diagnosed before 50', 'GIST with ≥1 first/second/third-degree relative with GIST or PPGL'] },
  R364: { code: 'R364', name: 'DICER1-related cancer predisposition', panel: 1320, genes: 'DICER1',
    criteria: ['One of: PPB or childhood lung cysts; thoracic/uterine/cervical/ovarian ERMS; cystic nephroma; childhood GU sarcoma; Sertoli–Leydig tumour; gynandroblastoma; GU/gynae NET; childhood MNG or DTC; ciliary body medulloepithelioma; nasal chondromesenchymal hamartoma; pineoblastoma; pituitary blastoma',
      'Or two of (same person or two FDRs): adult lung cysts; Wilms; MNG/DTC; other ERMS; poorly differentiated NET; undifferentiated sarcoma; macrocephaly'] },
  R365: { code: 'R365', name: 'Fumarate hydratase-related tumour syndromes', panel: 1335, genes: 'FH',
    criteria: ['HLRCC-associated (type 2 papillary) or tubulo-papillary RCC at any age',
      'Two of: cutaneous leiomyomata, renal tumour, uterine leiomyomata with classic histology / FH deficiency',
      'Cutaneous leiomyomata with relative with renal tumour, or with two relatives with cutaneous leiomyomata or classic uterine leiomyomata <40',
      'Uterine leiomyomata with classic histology <40; multiple cutaneous leiomyomata'] },
  R367: { code: 'R367', name: 'Inherited pancreatic cancer', panel: 524,
    genes: 'Small panel – Inherited pancreatic cancer (East Genomics leaflet lists ATM, BRCA1, BRCA2, CDKN2A, PALB2, STK11)',
    criteria: ['Pancreatic adenocarcinoma <60',
      'Pancreatic cancer <70 AND: breast <60, melanoma <60 or ovarian cancer (self); or FDR/SDR with pancreatic cancer <60; or ≥2 FDR/SDR with breast <60, melanoma <60, ovarian, or ≥2 with pancreatic cancer',
      'Consider R208 if BRCA-related family history, R254 if melanoma'] },
  R430: { code: 'R430', name: 'Inherited prostate cancer', panel: 1223, genes: 'Small panel – Inherited prostate cancer',
    criteria: ['Prostate cancer <50; metastatic prostate cancer <60',
      'Ashkenazi Jewish ancestry or grandparent from Whalsay, any age',
      'CanRisk >10% and not meeting R208, R207 or R210'] },
  R444: { code: 'R444', name: 'NICE approved PARP inhibitor treatment', panel: null, genes: 'BRCA1, BRCA2',
    criteria: ['Only for patients not meeting R208/R430, with a current cancer, for treatment decisions',
      'R444.1 breast: TNBC or HR+/HER2− meeting NICE neoadjuvant/adjuvant/metastatic criteria',
      'R444.2 prostate: metastatic castration-resistant where somatic testing (M218.1) failed'] },
  R404: { code: 'R404', name: 'Testing of unaffected individuals for inherited cancer predisposition syndromes', panel: null,
    genes: 'As dictated by clinical indication',
    criteria: ['No living affected relative; somatic testing of deceased relatives done first; ≥10% chance of a monogenic variant (deceased FDR ≥20%); agreed by cancer genetics MDT',
      'For HBOC and Lynch, unaffected individuals must meet the criteria within R208/R210'] },
  /* Tests in other chapters of the v9.1 eligibility criteria (part shown in the UI). */
  R217: { code: 'R217', part: 'IV', name: 'Endocrine neoplasia', panel: 648, genes: 'Small panel – Endocrine neoplasia (incl. MEN1, CDKN1B, AIP, CDC73, RET)',
    criteria: ['MEN1: multiglandular parathyroid disease <35; any pituitary adenoma or insulinoma <20; pituitary macroadenoma <30; ≥2 MEN1-related endocrine abnormalities; ≥1 endocrine abnormality + ≥1 non-endocrine MEN1 tumour (facial angiofibromas, collagenomas, meningioma); ≥1 endocrine abnormality with an FDR with ≥1',
      'MEN1-related endocrine: parathyroid hyperplasia/multiglandular adenomas, pituitary, GEP endocrine tumours, carcinoids, adrenocortical tumours',
      'FIPA: isolated pituitary adenoma <35 with ≥1 FDR with an isolated pituitary adenoma',
      'X-linked acrogigantism: GH excess by age 20 in males with increased growth velocity / tall stature',
      'Specialist MDT can approve testing outside the criteria'] },
  R218: { code: 'R218', part: 'IV', name: 'Multiple endocrine neoplasia type 2', panel: 1366, genes: 'RET',
    criteria: ['Medullary thyroid carcinoma (any age)', '≥2 MEN2-related abnormalities (any age), or ≥1 with an FDR with ≥1',
      'MEN2-related: MTC, phaeochromocytoma/paraganglioma, parathyroid adenoma/hyperplasia, Hirschsprung disease',
      'Use R217 where a broader presentation is under investigation'] },
  R226: { code: 'R226', part: 'IV', name: 'Inherited parathyroid cancer', panel: 1348, genes: 'CDC73',
    criteria: ['Parathyroid carcinoma (tumour confirmed)', 'Use R151 for benign hyperparathyroidism'] },
  R151: { code: 'R151', part: 'IV', name: 'Familial hyperparathyroidism or hypocalciuric hypercalcaemia', panel: 480,
    genes: 'Small panel – Familial hyperparathyroidism (incl. CDC73, MEN1, CDKN1B)',
    criteria: ['Primary hyperparathyroidism <50', 'Any age with: relevant family history; multiglandular disease/hyperplasia with family history; parathyroid carcinoma or atypical/cystic adenoma; ossifying fibroma of the jaw',
      'Hypocalciuric hypercalcaemia (Ca:Cr clearance ratio <0.02)', 'Use R217/R218 if features of MEN'] },
  R156: { code: 'R156', part: 'IV', name: 'Carney complex', panel: 1313, genes: 'PRKAR1A',
    criteria: ['≥2 features, or 1 feature with an affected FDR: spotty pigmentation (lips, conjunctiva, genital mucosa); cutaneous/mucosal myxoma; cardiac myxoma; breast myxomatosis; PPNAD; GH-producing adenoma; LCCSCT or testicular calcification; thyroid carcinoma or multiple hypoechoic nodules when young; psammomatous melanotic schwannoma; blue/epithelioid blue naevus; breast ductal adenoma; osteochondromyxoma'] },
  R160: { code: 'R160', part: 'IV', name: 'Primary pigmented nodular adrenocortical disease', panel: 566, genes: 'Small panel – PPNAD (incl. PRKAR1A)',
    criteria: ['PPNAD, or ACTH-independent Cushing syndrome of unknown aetiology'] },
  R49: { code: 'R49', part: 'IV', name: 'Beckwith-Wiedemann syndrome', panel: 1309, genes: '11p15 methylation; CDKN1C sequencing',
    criteria: ['≥1 cardinal feature (macroglossia, exomphalos, lateralised overgrowth, multifocal/bilateral Wilms or nephroblastomatosis, prolonged hyperinsulinism, adrenal cytomegaly / placental mesenchymal dysplasia / pancreatic adenomatosis)',
      'Or ≥2 suggestive features (incl. birthweight >2 SDS, naevus simplex, ear creases/pits, transient hypoglycaemia, BWSp tumours: neuroblastoma, RMS, unilateral Wilms, hepatoblastoma, ACC, phaeochromocytoma)'] },
  R27: { code: 'R27', part: 'III', name: 'Paediatric disorders', panel: 486, genes: 'WGS – Paediatric disorders panel',
    criteria: ['Congenital malformations/dysmorphism or syndromic overgrowth suggestive of a monogenic disorder where targeted testing is not possible',
      'Used for RASopathies, overgrowth and chromosome-instability syndromes without a specific test'] },
  R89: { code: 'R89', part: 'XXI', name: 'Ultra-rare and atypical monogenic disorders', panel: null, genes: 'WGS – relevant PanelApp panels',
    criteria: ['Ultra-rare disorders or atypical presentations needing panels across indications',
      'Requests including any inherited cancer panel must be approved by the UKCGG/CanGene-CanVar National MDT'] },
  R221: { code: 'R221', part: 'XVII', name: 'Familial tumours of the nervous system', panel: 1334, genes: 'Small panel + MLPA (incl. NF2, SMARCB1, LZTR1, SMARCE1)',
    criteria: ['NF2-related schwannomatosis: bilateral VS; or 2 major / 1 major + 2 minor (unilateral VS, affected parent/child, ≥2 meningiomas; ependymoma, meningioma, schwannoma, juvenile cataract, retinal hamartoma, epiretinal membrane <40)',
      'Schwannoma <30; unilateral VS + non-intradermal schwannoma; ≥2 non-intradermal schwannomas; schwannoma + VS, meningioma or FDR with schwannomatosis',
      'Meningioma <20; any clear cell meningioma; 2 meningiomas <50 or >2 at any age; meningioma + schwannoma',
      'Childhood retinal hamartoma. Tumour testing for mosaicism may be needed'] },
  R222: { code: 'R222', part: 'XVII', name: 'Neurofibromatosis type 1', panel: 1370, genes: 'NF1, SPRED1 (sequencing + MLPA)',
    criteria: ['Clinical NF1 (≥2 of: ≥6 CALMs; ≥2 neurofibromas; plexiform neurofibroma; optic glioma; ≥2 Lisch nodules; bony dysplasia; family history; axillary/inguinal freckling; MPNST) AND molecular diagnosis needed for management or reproduction'] },
  R376: { code: 'R376', part: 'XVII', name: 'Segmental or atypical neurofibromatosis type 1', panel: 1387, genes: 'NF1 – mosaic (deep sequencing + MLPA)',
    criteria: ['Segmental/atypical NF1, or classical NF1 negative on gDNA needing cDNA analysis, after discussion with the highly specialised service'] },
  R228: { code: 'R228', part: 'XVII', name: 'Tuberous sclerosis', panel: 1400, genes: 'TSC1, TSC2 (sequencing, MLPA, deep sequencing)',
    criteria: ['≥1 major (hypomelanotic macules, angiofibromas, ungual fibromas, shagreen patch, retinal hamartomas, cortical dysplasia, SEN, SEGA, cardiac rhabdomyoma, LAM, ≥2 angiomyolipomas) or ≥2 minor features (confetti lesions, dental pits, intraoral fibromas, retinal achromic patch, multiple renal cysts, non-renal hamartomas)'] },
  R294: { code: 'R294', part: 'XVII', name: 'Ataxia telangiectasia – DNA repair testing', panel: null, genes: 'Genome-wide DNA repair defect testing',
    criteria: ['Features strongly suggestive of A-T incl. raised AFP AND ataxia onset 1-4 y, oculomotor apraxia, ocular telangiectasia, chorea/dysarthria, immunodeficiency or malignancy'] },
  R295: { code: 'R295', part: 'XVII', name: 'Ataxia telangiectasia – variant testing', panel: 1213, genes: 'ATM',
    criteria: ['Confirmed A-T requiring variant testing (after DNA repair testing)'] },
  R259: { code: 'R259', part: 'VIII', name: 'Nijmegen breakage syndrome', panel: 1376, genes: 'DNA repair testing; NBN',
    criteria: ['Clinical features characteristic of NBS, or genomic findings suggestive of NBS'] },
  R260: { code: 'R260', part: 'VIII', name: 'Fanconi anaemia or Bloom syndrome – chromosome breakage testing', panel: null, genes: 'Chromosome breakage (DNA repair) testing',
    criteria: ['Clinical features strongly suggestive of Fanconi anaemia or Bloom syndrome, or genomic findings suggesting either', 'Use R258 if testing is driven by cytopenia'] },
  R258: { code: 'R258', part: 'VIII', name: 'Cytopenia – Fanconi breakage testing indicated', panel: 508, genes: 'Breakage testing; Fanconi anaemia / Bloom syndrome panel',
    criteria: ['Persistent or recurrent bicytopenia/pancytopenia where Fanconi anaemia must be excluded'] },
  R229: { code: 'R229', part: 'VIII', name: 'Confirmed Fanconi anaemia or Bloom syndrome – variant testing', panel: 508, genes: 'Small panel – Fanconi anaemia or Bloom syndrome',
    criteria: ['Diagnosis confirmed by chromosome breakage analysis'] },
  R347: { code: 'R347', part: 'VIII', name: 'Inherited predisposition to acute myeloid leukaemia (AML)', panel: 525, genes: 'Small panel – incl. CEBPA, RUNX1, GATA2, DDX41, ANKRD26, ETV6, SAMD9L, MBD4, TERT, TERC',
    criteria: ['AML/MDS with a pre-existing platelet function disorder', 'AML/MDS with ≥1 first/second/third-degree relative with AML/MDS, unexplained cytopenia or aplastic anaemia'] },
  R366: { code: 'R366', part: 'VIII', name: 'Inherited susceptibility to acute lymphoblastic leukaemia (ALL)', panel: 1349, genes: 'PAX5, ETV6',
    criteria: ['ALL with one first/second/third-degree relative with ALL, or two with myeloid/lymphoid/platelet disorders'] },
  R91: { code: 'R91', part: 'VIII', name: 'Cytopenia – NOT Fanconi anaemia', panel: 519, genes: 'WES/medium panel (incl. GATA2, SAMD9L, telomere genes) + MLPA incl. TERT, TERC',
    criteria: ['Persistent/recurrent cytopenia of unknown cause incl. unexplained aplastic anaemia, thrombocytopenia or neutropenia, where Fanconi anaemia is unlikely'] },
  R90: { code: 'R90', part: 'VIII', name: 'Bleeding and platelet disorders', panel: 545, genes: 'WES/medium panel (incl. RUNX1, ETV6, ANKRD26)',
    criteria: ['Bleeding or platelet disorder of likely monogenic cause after haematology review and haemostasis testing'] },
  R421: { code: 'R421', part: 'XIX', name: 'Pulmonary fibrosis familial', panel: null, genes: 'WES/medium panel (telomere genes)',
    criteria: ['ILD <50 without cause; or family history of ILD', 'Suspected telomerase variants: ILD with unexplained cytopenia/macrocytosis, premature greying, liver abnormalities, or transplant assessment'] },
  R333: { code: 'R333', part: 'XIX', name: 'Central congenital hypoventilation', panel: 1314, genes: 'PHOX2B (STR + sequencing)',
    criteria: ['Central alveolar hypoventilation without lung, cardiac, neuromuscular or brainstem cause, ± Hirschsprung, neuroblastoma or autonomic dysfunction'] },
  R186: { code: 'R186', part: 'XIX', name: 'Hereditary haemorrhagic telangiectasia', panel: 123, genes: 'Small panel – HHT (incl. SMAD4)',
    criteria: ['≥3 of: recurrent epistaxis; typical telangiectases; visceral AVMs; FDR with HHT', 'Or pulmonary AVM; ≥2 AVMs; AVM + epistaxis/telangiectasia/family history; telangiectasia + severe epistaxis'] },
  R190: { code: 'R190', part: 'XIX', name: 'Pneumothorax – familial', panel: 105, genes: 'Small panel (incl. FLCN)',
    criteria: ['Primary spontaneous pneumothorax with an FDR with PSP', 'Characteristic BHD lung features on imaging'] },
  R166: { code: 'R166', part: 'XX', name: 'Palmoplantar keratodermas', panel: 556, genes: 'WES/medium panel (incl. RHBDF2)',
    criteria: ['Unexplained isolated or syndromic palmoplantar keratoderma'] },
  R227: { code: 'R227', part: 'XX', name: 'Xeroderma pigmentosum, trichothiodystrophy or Cockayne syndrome', panel: 77, genes: 'Small panel + DNA repair testing',
    criteria: ['Confident clinical XP diagnosis with XP-related eye, neurological or cancer features (complementation testing via the XP highly specialised service)'] },
  R230: { code: 'R230', part: 'XX', name: 'Multiple monogenic benign skin tumours', panel: 558, genes: 'Small panel (incl. FLCN)',
    criteria: ['≥3 benign skin tumours (≥2 histologically confirmed) suggesting familial cylindromatosis, Brooke-Spiegler, multiple familial trichoepithelioma, Muir-Torre, Buschke-Ollendorff or Birt-Hogg-Dubé'] },
  R327: { code: 'R327', part: 'XX', name: 'Mosaic skin disorders – deep sequencing', panel: 564, genes: 'Medium panel – deep sequencing (incl. GNAS)',
    criteria: ['Skin abnormality likely to have a mosaic single-gene cause; McCune-Albright syndrome is eligible (test affected tissue)'] }
};

/* Genes treated as fully in scope on this site: no NICPR scope warnings are shown for them
   (the NICPR list below is kept exactly as published). */
const NICPR_IN_SCOPE = ['RAD51C', 'MLH1', 'MSH2', 'MSH6', 'PMS2', 'EPCAM'];

const NICPR = {
  genes: ['AIP', 'ALK', 'ANKRD26', 'APC', 'ATM', 'BAP1', 'BARD1', 'BLM', 'BMPR1A', 'BRCA1', 'BRCA2', 'BRIP1', 'BUB1B',
    'CBL', 'CDC73', 'CDH1', 'CDK4', 'CDKN1B', 'CDKN1C', 'CDKN2A', 'CEBPA', 'CEP57', 'CHEK2', 'CTNNA1', 'CTR9', 'DDB2',
    'DDX41', 'DICER1', 'DIS3L2', 'ELP1', 'EPCAM', 'ERCC2', 'ERCC3', 'ERCC4', 'ERCC5', 'ETV6', 'EZH2', 'FANCA', 'FANCB',
    'FANCC', 'FANCD2', 'FANCE', 'FANCF', 'FANCG', 'FANCI', 'FANCL', 'FANCM', 'FH', 'FLCN', 'GATA2', 'GNAS', 'GPC3',
    'GPR161', 'GREM1', 'HRAS', 'KDM3B', 'KIT', 'KRAS', 'LZTR1', 'MAX', 'MBD4', 'MEN1', 'MET', 'MLH1', 'MSH2', 'MSH6',
    'MUTYH', 'NBN', 'NF1', 'NF2', 'NHP2', 'NRAS', 'NSD1', 'NTHL1', 'PALB2', 'PAX5', 'PDGFRA', 'PDGFRB', 'PHOX2B', 'POLD1',
    'POLE', 'POLH', 'POT1', 'PMS2', 'PRKAR1A', 'PTCH1', 'PTEN', 'PTPN11', 'RAD51D', 'RAF1', 'RB1', 'RECQL4', 'REST', 'RET',
    'RHBDF2', 'RNF43', 'RTEL1', 'RUNX1', 'SAMD9L', 'SDHA', 'SDHAF2', 'SDHB', 'SDHC', 'SDHD', 'SHOC2', 'SLX4', 'SMAD4',
    'SMARCA4', 'SMARCB1', 'SMARCE1', 'SOS1', 'STK11', 'SUFU', 'TERC', 'TERT', 'TMEM127', 'TP53', 'TRIM28', 'TRIM37',
    'TRIP13', 'TSC1', 'TSC2', 'VHL', 'WRAP53', 'WRN', 'WT1', 'XPA', 'XPC'],
  biallelic: ['BLM', 'BUB1B', 'CEP57', 'DDB2', 'EPCAM', 'ERCC2', 'ERCC3', 'ERCC4', 'ERCC5', 'FANCA', 'FANCB', 'FANCC',
    'FANCD2', 'FANCE', 'FANCF', 'FANCG', 'FANCI', 'FANCL', 'MLH1', 'MSH2', 'MSH6', 'MUTYH', 'NTHL1', 'PMS2', 'RECQL4',
    'XPA', 'XPC'],
  susceptibilityOnly: ['GNAS', 'KIT', 'POLE', 'SMAD4'],
  nonTruncatingAgreed: ['ATM', 'BARD1', 'CHEK2'],
  addedSince2025: ['CTNNA1', 'ELP1', 'FANCM', 'GPC3', 'GPR161', 'KDM3B', 'MBD4', 'PAX5', 'PDGFRA', 'SAMD9L', 'SLX4']
};

/*
 * When each information source was last pulled and checked (shown on every syndrome and gene page).
 * Update the matching entry whenever a source is re-checked.
 */
const DATA_CHECKED = '17 October 2026';
const SOURCE_DATES = [
  ['NHS Genomic Test Directory eligibility criteria', 'v9.1, 20 May 2026', '11 Oct 2026'],
  ['PanelApp panels', 'Signed-off panel versions and their green gene lists (PanelApp API); newer versions noted', '14 Oct 2026'],
  ['NICPR gene list', 'Appendix 1, June 2026', '11 Oct 2026'],
  ['GeneReviews chapters', 'NCBI GeneReviews mapping files', '11 Oct 2026'],
  ['OMIM entries', 'mim2gene.txt and NCBI Gene → OMIM gene map', '11 Oct 2026'],
  ['UKCGG and NICE guidance', 'UKCGG leaflets and guidelines page (guidelines and patient leaflets)', '13 Oct 2026'],
  ['European guidelines', 'ERN GENTURIS lists, Crossref', '11 Oct 2026'],
  ['US and international guidelines', 'NCCN, Crossref', '11 Oct 2026'],
  ['East Genomics patient leaflets', 'East Genomics A-Z index', '11 Oct 2026'],
  ['Associations, strengths and ages', 'Reviewed against GeneReviews and UKCGG; strengths checked against the yield / carrier-risk definitions', '13 Oct 2026'],
  ['AACR childhood CNS tumour update (Clin Cancer Res 2024;30:2342)', 'CNS associations and testing pointers', '11 Oct 2026'],
  ['Manchester NF1 review checklist', 'v18, January 2019 (NF1 surveillance)', '11 Oct 2026'],
  ['GeNotes links', 'NHS England Genomics Education Programme GeNotes: Knowledge Hub pages and In the Clinic pathways for 62 conditions (titles from the live pages)', '12 Oct 2026'],
  ['US guidance pass', 'NCCN (JNCCN publications), ACMG, ACG, USMSTF, ATA, Endocrine Society, AACR and consensus papers: supporting citations, US differences noted (UK guidance takes priority), additions where UK guidance is silent', '12 Oct 2026'],
  ['Association evidence review', 'Each association sourced to UKCGG / BSG / NICE, ERN and other European guidance, GeneReviews, ClinGen gene–disease validity and peer-reviewed risk studies (DOIs checked via Crossref); variant notes; CanVar-UK links', '11 Oct 2026'],
  ['Suggested surveillance', 'UKCGG / BSG first, then ERN GENTURIS, EHTG, SIOPE, then AACR, consensus guidelines and GeneReviews summaries', '11 Oct 2026'],
  ['Bowel screening without a known syndrome', 'BSG/ACPGBI/UKCGG 2019 hereditary colorectal cancer guidelines, Box 1 and Table 1; multiple colorectal adenomas (MCRA) and serrated polyposis (WHO 2019 criteria, surveillance)', '17 Oct 2026'],
  ['Breast screening without a known syndrome', 'NICE CG164: family-history referral patterns (1.3.3, 1.3.4, 1.4.2, 1.4.4, 1.4.5), risk categories and surveillance (1.6)', '17 Oct 2026'],
  ['Post-polypectomy surveillance', 'BSG/ACPGBI/PHE 2020 post-polypectomy surveillance guidelines (Rutter et al., Gut 2020): high-risk findings, intervals, family history', '17 Oct 2026']
];

/* Relationship to proband: degree of relatedness, side of family, default sex. */
const RELATIONS = [
  ['proband', 'Proband', 0, 'core', ''],
  ['mother', 'Mother', 1, 'M', 'F'], ['father', 'Father', 1, 'P', 'M'],
  ['sister', 'Sister', 1, 'core', 'F'], ['brother', 'Brother', 1, 'core', 'M'],
  ['daughter', 'Daughter', 1, 'child', 'F'], ['son', 'Son', 1, 'child', 'M'],
  ['m_gm', 'Maternal grandmother', 2, 'M', 'F'], ['m_gf', 'Maternal grandfather', 2, 'M', 'M'],
  ['m_aunt', 'Maternal aunt', 2, 'M', 'F'], ['m_uncle', 'Maternal uncle', 2, 'M', 'M'],
  ['p_gm', 'Paternal grandmother', 2, 'P', 'F'], ['p_gf', 'Paternal grandfather', 2, 'P', 'M'],
  ['p_aunt', 'Paternal aunt', 2, 'P', 'F'], ['p_uncle', 'Paternal uncle', 2, 'P', 'M'],
  ['m_halfsib', 'Maternal half-sibling', 2, 'M', ''], ['p_halfsib', 'Paternal half-sibling', 2, 'P', ''],
  ['niece', 'Niece / nephew', 2, 'core2', ''], ['grandchild', 'Grandchild', 2, 'child', ''],
  ['m_cousin', 'Maternal first cousin', 3, 'M', ''], ['p_cousin', 'Paternal first cousin', 3, 'P', ''],
  ['m_great', 'Maternal great-aunt / uncle', 3, 'M', ''], ['p_great', 'Paternal great-aunt / uncle', 3, 'P', ''],
  ['m_ggp', 'Maternal great-grandparent', 3, 'M', ''], ['p_ggp', 'Paternal great-grandparent', 3, 'P', ''],
  ['gniece', 'Great-niece / nephew', 3, 'core2', ''],
  ['m_cousin_child', "Maternal first cousin's child", 4, 'M', ''], ['p_cousin_child', "Paternal first cousin's child", 4, 'P', ''],
  ['m_other', 'Other maternal relative', 3, 'M', ''], ['p_other', 'Other paternal relative', 3, 'P', ''],
  ['other', 'Other / side unknown', 3, 'unknown', ''],
  ['unset', 'Relationship not chosen', 3, 'unknown', '']
];

/*
 * The form asks for the relationship in two steps: a short list, then the side
 * of the family where it matters (e.g. Grandmother, then mother's mother or
 * father's mother). Each choice maps onto a RELATIONS id above, so saved files
 * and the eligibility logic are unchanged. Sides: m maternal, p paternal, u not known.
 */
const REL_KINDS = [
  ['mother', 'Mother'], ['father', 'Father'], ['sister', 'Sister'], ['brother', 'Brother'],
  ['halfsib', 'Half-sibling', { m: ['m_halfsib', 'Same mother (maternal)'], p: ['p_halfsib', 'Same father (paternal)'] }],
  ['daughter', 'Daughter'], ['son', 'Son'],
  ['gm', 'Grandmother', { m: ['m_gm', "Mother's mother (maternal)"], p: ['p_gm', "Father's mother (paternal)"] }],
  ['gf', 'Grandfather', { m: ['m_gf', "Mother's father (maternal)"], p: ['p_gf', "Father's father (paternal)"] }],
  ['aunt', 'Aunt', { m: ['m_aunt', "Mother's sister (maternal)"], p: ['p_aunt', "Father's sister (paternal)"] }],
  ['uncle', 'Uncle', { m: ['m_uncle', "Mother's brother (maternal)"], p: ['p_uncle', "Father's brother (paternal)"] }],
  ['cousin', 'First cousin', { m: ['m_cousin', "Mother's side (maternal)"], p: ['p_cousin', "Father's side (paternal)"] }],
  ['niece', 'Niece / nephew'], ['grandchild', 'Grandchild'],
  ['great', 'Great-aunt / uncle', { m: ['m_great', "Mother's side (maternal)"], p: ['p_great', "Father's side (paternal)"] }],
  ['ggp', 'Great-grandparent', { m: ['m_ggp', "Mother's side (maternal)"], p: ['p_ggp', "Father's side (paternal)"] }],
  ['gniece', 'Great-niece / nephew'],
  ['cousin_child', "First cousin's child", { m: ['m_cousin_child', "Mother's side (maternal)"], p: ['p_cousin_child', "Father's side (paternal)"] }],
  ['other', 'Other relative', { m: ['m_other', "Mother's side (maternal)"], p: ['p_other', "Father's side (paternal)"], u: ['other', 'Side not known'] }]
];
/*
 * Example families for the "Load example" menu: classic, clear-cut pictures
 * for demonstration and teaching (fictional). Each person is
 * [relationship, sex, [cancers], extra fields]; `top` is the condition expected
 * first and `test` the R code the proband should meet (checked in tests/).
 */
const EXAMPLES = [
  { id: 'brca', label: 'BRCA (breast and ovarian)', top: 'brca1', test: 'R208',
    caption: 'Triple-negative breast cancer at 38, mother with high-grade serous ovarian cancer, maternal aunt with breast cancer at 46.',
    people: [
      ['proband', 'F', [{ site: 'breast', hist: 'idc', age: '38', er: 'neg', pr: 'neg', her2: 'neg' }]],
      ['mother', 'F', [{ site: 'ovary', hist: 'hgsc', age: '52' }]],
      ['m_aunt', 'F', [{ site: 'breast', hist: 'idc', age: '46' }]],
      ['father', 'M', [{ site: 'colorectal', hist: 'adeno', age: '68', mmr: 'intact' }]]] },
  { id: 'lynch_msh2', label: 'Lynch syndrome (MSH2)', top: 'lynch_msh2', test: 'R210',
    caption: 'Amsterdam-positive family: bowel cancer at 42 with MSH2/MSH6 loss, endometrial cancer in the mother and upper tract urothelial cancer in an uncle.',
    people: [
      ['proband', 'F', [{ site: 'colorectal', hist: 'adeno', age: '42', mmr: 'msh2' }]],
      ['mother', 'F', [{ site: 'uterus', hist: 'endometrioid', age: '49', mmr: 'msh2' }]],
      ['m_uncle', 'M', [{ site: 'urothelial', hist: 'upper', age: '56' }]],
      ['m_gf', 'M', [{ site: 'colorectal', hist: 'adeno', age: '61' }], { deceased: true, ageDeath: '63' }]] },
  { id: 'pten', label: 'PTEN hamartoma tumour syndrome', top: 'phts', test: 'R213',
    caption: 'Macrocephaly with breast cancer at 36 and trichilemmomas; mother with follicular thyroid and endometrial cancer.',
    people: [
      ['proband', 'F', [{ site: 'breast', hist: 'idc', age: '36', er: 'pos', pr: 'pos', her2: 'neg' }, { site: 'feature', hist: 'macrocephaly' }, { site: 'feature', hist: 'trichilemmoma', age: '30' }]],
      ['mother', 'F', [{ site: 'thyroid', hist: 'follicular', age: '41' }, { site: 'uterus', hist: 'endometrioid', age: '52' }]],
      ['brother', 'M', [{ site: 'feature', hist: 'macrocephaly' }]]] },
  { id: 'bap1', label: 'BAP1 tumour predisposition', top: 'bap1', test: 'R422',
    caption: 'Uveal melanoma at 38, father with mesothelioma (no asbestos exposure known) and a paternal aunt with clear cell renal cancer.',
    people: [
      ['proband', 'M', [{ site: 'eye', hist: 'uveal', age: '38' }]],
      ['father', 'M', [{ site: 'meso', hist: 'pleural', age: '57' }], { deceased: true, ageDeath: '58' }],
      ['p_aunt', 'F', [{ site: 'kidney', hist: 'ccrcc', age: '51' }]]] },
  { id: 'lfs', label: 'Li-Fraumeni syndrome (TP53)', top: 'lfs', test: 'R216',
    caption: 'Classic Li-Fraumeni: osteosarcoma at 15, mother with HER2-positive breast cancer at 31, maternal aunt with adrenocortical carcinoma in childhood.',
    people: [
      ['proband', 'M', [{ site: 'sarcoma', hist: 'osteo', age: '15' }]],
      ['mother', 'F', [{ site: 'breast', hist: 'idc', age: '31', er: 'pos', pr: 'neg', her2: 'pos' }]],
      ['m_aunt', 'F', [{ site: 'adrenal', hist: 'acc', age: '3' }]],
      ['m_gm', 'F', [{ site: 'cns', hist: 'hgg', age: '44' }], { deceased: true, ageDeath: '45' }]] },
  { id: 'dicer1', label: 'DICER1 tumour predisposition', top: 'dicer1', test: 'R364',
    caption: 'Pleuropulmonary blastoma at 2; mother with a multinodular goitre at 15 and a Sertoli–Leydig cell tumour of the ovary at 24, maternal aunt with a cystic nephroma in childhood.',
    people: [
      ['proband', 'F', [{ site: 'lung', hist: 'ppb', age: '2' }]],
      ['mother', 'F', [{ site: 'thyroid', hist: 'mng', age: '15' }, { site: 'ovary', hist: 'sertoli', age: '24' }]],
      ['m_aunt', 'F', [{ site: 'kidney', hist: 'cystic_nephroma', age: '3' }]],
      ['father', 'M', [], { ageNow: '36' }]] },
  { id: 'gorlin', label: 'Gorlin syndrome (PTCH1)', top: 'gorlin', test: 'R214',
    caption: 'Basal cell carcinomas from 17 and an odontogenic keratocyst at 14; mother with palmar pits and basal cell carcinomas from 28.',
    people: [
      ['proband', 'M', [{ site: 'feature', hist: 'okc', age: '14' }, { site: 'skin', hist: 'bcc', age: '17' }]],
      ['mother', 'F', [{ site: 'feature', hist: 'palmarpits', age: '30' }, { site: 'skin', hist: 'bcc', age: '28' }]],
      ['father', 'M', [], { ageNow: '50' }]] },
  { id: 'elp1', label: 'ELP1 SHH medulloblastoma', top: 'elp1', test: 'R456',
    caption: 'SHH-activated medulloblastoma at 7 (typical age for ELP1; infant SHH medulloblastoma points more to SUFU or PTCH1). No other cancers in the family.',
    people: [
      ['proband', 'M', [{ site: 'cns', hist: 'medullo_shh', age: '7' }]],
      ['mother', 'F', [], { ageNow: '38' }],
      ['father', 'M', [], { ageNow: '40' }]] },
  { id: 'fap', label: 'Familial adenomatous polyposis (APC)', top: 'fap', test: 'R211',
    caption: 'Over 100 adenomas at 24 with CHRPE; mother with bowel cancer at 39 and a maternal uncle with a desmoid tumour.',
    people: [
      ['proband', 'M', [{ site: 'polyps', hist: 'adenoma', age: '24', count: '150' }, { site: 'feature', hist: 'chrpe' }]],
      ['mother', 'F', [{ site: 'colorectal', hist: 'adeno', age: '39' }]],
      ['m_uncle', 'M', [{ site: 'sarcoma', hist: 'desmoid', age: '33' }]]] },
  { id: 'mutyh', label: 'MUTYH-associated polyposis (MAP)', top: 'map', test: 'R211',
    caption: 'Recessive pattern: about 40 adenomas and bowel cancer at 53, a brother with about 25 adenomas; parents unaffected.',
    people: [
      ['proband', 'M', [{ site: 'polyps', hist: 'adenoma', age: '53', count: '40' }, { site: 'colorectal', hist: 'adeno', age: '53', mmr: 'intact' }]],
      ['brother', 'M', [{ site: 'polyps', hist: 'adenoma', age: '50', count: '25' }]],
      ['mother', 'F', [], { ageNow: '80' }],
      ['father', 'M', [], { ageNow: '82' }]] },
  { id: 'mcra', label: 'Multiple colorectal adenomas (MCRA)', top: 'fap', test: 'R211',
    caption: '14 adenomas at 56, father with 12 adenomas and bowel cancer at 72. Germline panel testing (R211) first; if no APC or MUTYH variant is found this is MCRA – see “Polyposis without a known syndrome” under bowel screening.',
    people: [
      ['proband', 'M', [{ site: 'polyps', hist: 'adenoma', age: '56', count: '14' }]],
      ['father', 'M', [{ site: 'polyps', hist: 'adenoma', age: '70', count: '12' }, { site: 'colorectal', hist: 'adeno', age: '72', mmr: 'intact' }]],
      ['mother', 'F', [], { ageNow: '80' }],
      ['sister', 'F', [], { ageNow: '52' }]] },
  { id: 'sps', label: 'Serrated polyposis syndrome (SPS)', top: 'rnf43', test: 'R211',
    caption: 'Serrated polyposis meeting the WHO criteria at 44 (R211: under 50), and a sister with 12 serrated polyps. Most SPS has no germline cause; RNF43 explains a small minority.',
    people: [
      ['proband', 'F', [{ site: 'polyps', hist: 'sps', age: '44' }]],
      ['sister', 'F', [{ site: 'polyps', hist: 'serrated', age: '47', count: '12' }]],
      ['mother', 'F', [], { ageNow: '72' }],
      ['father', 'M', [], { ageNow: '74' }]] },
  { id: 'ret', label: 'Multiple endocrine neoplasia type 2 (RET)', top: 'men2', test: 'R218',
    caption: 'Medullary thyroid cancer at 32; father with a phaeochromocytoma at 38 and medullary thyroid cancer at 40, paternal aunt with a parathyroid adenoma at 45.',
    people: [
      ['proband', 'F', [{ site: 'thyroid', hist: 'medullary', age: '32' }]],
      ['father', 'M', [{ site: 'adrenal', hist: 'phaeo', age: '38' }, { site: 'thyroid', hist: 'medullary', age: '40' }]],
      ['p_aunt', 'F', [{ site: 'parathyroid', hist: 'adenoma', age: '45' }]],
      ['mother', 'F', [], { ageNow: '62' }]] },
  { id: 'carney', label: 'Carney complex (PRKAR1A)', top: 'carney', test: 'R156',
    caption: 'Cardiac myxoma at 24 with spotty skin pigmentation of the lips; mother with PPNAD (ACTH-independent Cushing syndrome) at 30.',
    people: [
      ['proband', 'F', [{ site: 'feature', hist: 'cardiac_myxoma', age: '24' }, { site: 'feature', hist: 'pigment_carney', age: '20' }]],
      ['mother', 'F', [{ site: 'feature', hist: 'ppnad', age: '30' }]],
      ['father', 'M', [], { ageNow: '58' }]] },
  { id: 'bowel_mod', label: 'Bowel cancer family history – moderate risk', fhcc: 'moderate',
    caption: 'Unaffected woman of 45; father with bowel cancer at 45 (MMR proficient). Moderate-risk family history (BSG 2019 Box 1): one-off colonoscopy at 55 if no inherited condition is found.',
    people: [
      ['proband', 'F', [], { ageNow: '45' }],
      ['father', 'M', [{ site: 'colorectal', hist: 'adeno', age: '45', mmr: 'intact' }]],
      ['mother', 'F', [], { ageNow: '72' }]] },
  { id: 'bowel_high', label: 'Bowel cancer family history – high risk', fhcc: 'high',
    caption: 'Unaffected woman of 40; mother (62), maternal grandmother (70) and maternal uncle (58) with bowel cancer, all MMR proficient. High-risk family history (BSG 2019 Box 1): 5-yearly colonoscopy from 40 to 75.',
    people: [
      ['proband', 'F', [], { ageNow: '40' }],
      ['mother', 'F', [{ site: 'colorectal', hist: 'adeno', age: '62', mmr: 'intact' }]],
      ['m_gm', 'F', [{ site: 'colorectal', hist: 'adeno', age: '70', mmr: 'intact' }]],
      ['m_uncle', 'M', [{ site: 'colorectal', hist: 'adeno', age: '58', mmr: 'intact' }]]] },
  { id: 'breast_mod', label: 'Breast cancer family history – moderate risk', breast: 'moderate',
    caption: 'Unaffected woman of 38; mother with breast cancer at 38. Moderate-risk pattern (NICE CG164): secondary care, annual mammography 40–49 – confirm with CanRisk.',
    people: [
      ['proband', 'F', [], { ageNow: '38' }],
      ['mother', 'F', [{ site: 'breast', hist: 'idc', age: '38', er: 'pos', pr: 'pos', her2: 'neg' }]],
      ['father', 'M', [], { ageNow: '68' }]] },
  { id: 'breast_high', label: 'Breast cancer family history – high risk', breast: 'high',
    caption: 'Unaffected woman of 32; mother with breast cancer at 46 and maternal aunt at 44. High-risk pattern (NICE CG164): specialist genetic clinic, annual mammography 40–59 – confirm with CanRisk.',
    people: [
      ['proband', 'F', [], { ageNow: '32' }],
      ['mother', 'F', [{ site: 'breast', hist: 'idc', age: '46', er: 'pos', pr: 'pos', her2: 'neg' }]],
      ['m_aunt', 'F', [{ site: 'breast', hist: 'idc', age: '44', er: 'pos', pr: 'pos', her2: 'neg' }]],
      ['father', 'M', [], { ageNow: '62' }]] },
  { id: 'ovarian_fh', label: 'Ovarian cancer family history', top: 'brca1', test: 'R208', breast: 'high',
    caption: 'Unaffected woman of 42; mother (58) and maternal aunt (62) died of high-grade serous ovarian cancer, with no stored DNA. She can be tested as an unaffected relative (R208, Manchester score 25 via her mother) through Clinical Genetics; NICE CG164 high-risk pattern (two ovarian cancers on the same side).',
    people: [
      ['proband', 'F', [], { ageNow: '42' }],
      ['mother', 'F', [{ site: 'ovary', hist: 'hgsc', age: '58' }], { deceased: true, ageDeath: '60' }],
      ['m_aunt', 'F', [{ site: 'ovary', hist: 'hgsc', age: '62' }], { deceased: true, ageDeath: '65' }],
      ['father', 'M', [], { ageNow: '70' }]] },
  { id: 'vhl', label: 'von Hippel–Lindau syndrome', top: 'vhl', test: 'R225',
    caption: 'Cerebellar haemangioblastoma at 26; mother with phaeochromocytoma and clear cell renal cancer, maternal uncle with a pancreatic NET.',
    people: [
      ['proband', 'F', [{ site: 'cns', hist: 'hb', age: '26' }]],
      ['mother', 'F', [{ site: 'adrenal', hist: 'phaeo', age: '29' }, { site: 'kidney', hist: 'ccrcc', age: '44', side: 'both' }]],
      ['m_uncle', 'M', [{ site: 'pancreas', hist: 'pnet', age: '40' }]]] },
  { id: 'sdhb', label: 'SDHB paraganglioma', top: 'sdhb', test: 'R223',
    caption: 'Abdominal (extra-adrenal) paraganglioma at 31; father with SDH-deficient renal cancer and a paternal aunt with an SDH-deficient GIST.',
    people: [
      ['proband', 'M', [{ site: 'ppgl', hist: 'ta', age: '31' }]],
      ['father', 'M', [{ site: 'kidney', hist: 'sdhrcc', age: '47' }]],
      ['p_aunt', 'F', [{ site: 'sarcoma', hist: 'gist', age: '35' }]]] }
];
/* [kind, side] for a RELATIONS id ('' side for kinds without one). */
function relParts(rel) {
  for (const [k, , sides] of REL_KINDS) {
    if (!sides && k === rel) return [k, ''];
    if (sides) for (const s in sides) if (sides[s][0] === rel) return [k, s];
  }
  return ['', ''];
}

/*
 * East Genomics patient information leaflets (direct pages, all checked
 * against the East Genomics A-Z index, Oct 2026). `general` leaflets are shown
 * for conditions without a specific leaflet.
 */
const EG_AZ = 'https://www.eastgenomics.nhs.uk/for-patients-and-carers/patient-information/';
const EG = {
  brca1: { label: 'BRCA1', url: EG_AZ + 'brca1/' },
  brca2: { label: 'BRCA2', url: EG_AZ + 'brca2/' },
  palb2: { label: 'PALB2', url: EG_AZ + 'palb2/' },
  brca_r444: { label: 'BRCA1, BRCA2 and PALB2 – breast, ovarian, prostate and pancreatic cancers (R444.1)', url: EG_AZ + 'brca1-brca2-and-palb2-breast-ovarian-prostate-and-pancreatic-cancers/' },
  breast_ovarian: { label: 'Breast and ovarian cancer – genetic testing for inherited causes (R208)', url: EG_AZ + 'breast_and_ovarian_cancer_genetic_testing_for_inherited_causes/' },
  ovarian: { label: 'Ovarian cancer – genetic testing for inherited causes (R207)', url: EG_AZ + 'ovarian_cancer_genetic_testing_for_inherited_causes/' },
  atm: { label: 'ATM gene', url: EG_AZ + 'atm_gene/' },
  chek2: { label: 'CHEK2 gene', url: EG_AZ + 'chek2_gene/' },
  brip1: { label: 'BRIP1', url: EG_AZ + 'brip1/' },
  rad51c: { label: 'Breast and ovarian cancer – RAD51C gene', url: EG_AZ + 'rad51c_gene/' },
  rad51d: { label: 'Breast and ovarian cancer – RAD51D gene', url: EG_AZ + 'rad51d_gene/' },
  pancreatic: { label: 'Pancreatic cancer gene testing (R367)', url: EG_AZ + 'pancreatic-cancer-gene-testing-patient-information-leaflet/' },
  prostate: { label: 'Prostate cancer and genetics', url: EG_AZ + 'prostate-cancer-and-genetics/' },
  prostate_r430: { label: 'Prostate cancer – genetic testing for inherited causes (R430)', url: EG_AZ + 'prostate_cancer_genetic_testing_for_inherited_causes/' },
  prostate_brca: { label: 'Prostate cancer – BRCA1 and BRCA2 gene tests (R444.2)', url: EG_AZ + 'prostate-cancer-brca1-and-brca2-gene-tests-patient-information-booklet/' },
  lynch: { label: 'Lynch syndrome (endometrial and colorectal cancers)', url: EG_AZ + 'endometrial-cancer-lynch-syndrome/' },
  lynch_aspirin: { label: 'Lynch syndrome – aspirin and LS, FAQs for patients', url: EG_AZ + 'lynch-syndrome-aspirin-and-ls-faqs-for-patients/' },
  bowel: { label: 'Bowel polyps or young onset bowel or endometrial cancer – genetic testing for inherited causes (R211)', url: EG_AZ + 'bowel_polyps_or_young_onset_bowel_or_endometrial_cancer_genetic_testing_for_inherited_causes-r211/' },
  map: { label: 'MUTYH associated polyposis syndrome (MAP)', url: EG_AZ + 'mutyh_associated_polyposis_syndrome/' },
  pten: { label: 'PTEN hamartoma tumour syndrome', url: EG_AZ + 'pten-hamartoma-tumour-syndrome-patient-information/' },
  lfs: { label: 'Li-Fraumeni syndrome (LFS)', url: EG_AZ + 'li_fraumeni_syndrome/' },
  melanoma: { label: 'Melanoma – genetic testing for inherited causes (R254)', url: EG_AZ + 'melanoma-genetic-testing-for-inherited-causes-information-for-patients/' },
  bap1: { label: 'BAP1 tumour predisposition syndrome', url: EG_AZ + 'bap1-tumour-predisposition-syndrome/' },
  ppgl: { label: 'Paraganglioma and phaeochromocytoma – genetic testing for inherited causes (R223)', url: EG_AZ + 'paraganglioma-and-phaeochromocytoma-genetic-testing-for-inherited-causes/' },
  gist: { label: 'Gastrointestinal stromal tumours (GIST) – genetic testing for inherited causes (R363)', url: EG_AZ + 'gastro-intestinal-stromal-tumours-gist-genetic-testing-for-inherited-causes/' },
  hlrcc: { label: 'Renal – HLRCC: hereditary leiomyomatosis and renal cell cancer', url: EG_AZ + 'kidney-hereditary-leiomyomatosis-and-renal-cell-cancer-hlrcc/' },
  hprc: { label: 'Renal – MET and hereditary papillary renal cell cancer (HPRC)', url: EG_AZ + 'met_and_hprc/' },
  carney: { label: 'Carney complex', url: EG_AZ + 'carney_complex/' },
  dicer1: { label: 'DICER1 syndrome', url: EG_AZ + 'dicer1-syndrome/' },
  nf1: { label: 'Neurofibromatosis type 1 (NF1)', url: EG_AZ + 'neurofibromatosis-type-1-nf1/' },
  cancer_diag: { label: 'Cancer – diagnostic genetic testing for inherited causes', url: EG_AZ + 'cancer-diagnostic-genetic-testing-for-inherited-causes/' },
  cancer_genetics: { label: 'Cancer and genetics', url: EG_AZ + 'cancer-and-genetics-patient-information-leaflet/' }
};
const EG_GENERAL = ['cancer_diag', 'cancer_genetics'];

/*
 * Panel genes that are deliberately NOT a testing route for the syndrome (the gene is on the PanelApp panel for
 * another reason, e.g. Fanconi anaemia breakage panels contain BRCA2/PALB2 for the biallelic condition, or a
 * mosaic/skin panel). Every other syndrome whose gene is on a test's panel must list that test (tests/check-data.js).
 * Test pages still show these under "Other syndromes with genes on this panel".
 */
const PANEL_NOT_ROUTE = {
  R207: ['cmmrd', 'fanconi'], R208: ['fanconi', 'at'], R367: ['fanconi', 'at'], R430: ['cmmrd', 'fanconi', 'at'],
  R258: ['brca1', 'brca2', 'palb2', 'brip1', 'xp', 'bloom'], R229: ['brca1', 'brca2', 'palb2', 'brip1', 'xp'],
  R295: ['atm'], R230: ['cmmrd'], R327: ['phts', 'gorlin', 'nf1', 'nf2', 'noonan', 'costello', 'ollier']
};

/*
 * Family history of colorectal cancer without a known hereditary syndrome: risk categories (Box 1) and
 * surveillance (Table 1) from the BSG/ACPGBI/UKCGG 2019 guidelines (Monahan et al., Gut 2019;69:411-444,
 * GUIDES.bsg). The category is worked out in eligibility.js (fhccCategory).
 */
const FHCC = {
  source: 'bsg',
  categories: {
    high: { label: 'High-risk family history of colorectal cancer',
      def: 'A cluster of at least three affected first-degree relatives with colorectal cancer at any age, across at least two generations, of whom the person is a first-degree relative of at least one.',
      offer: '5-yearly colonoscopy from age 40 until 75.' },
    moderate: { label: 'Moderate-risk family history of colorectal cancer',
      def: 'One first-degree relative with colorectal cancer under 50, or two first-degree relatives (who are first-degree relatives of each other) with colorectal cancer at any age, of whom the person is a first-degree relative of at least one.',
      offer: 'One-off colonoscopy at age 55; further colonoscopy as post-polypectomy surveillance guidelines.' },
    average: { label: 'Average risk (family history does not meet moderate or high risk)',
      def: 'No family history of colorectal cancer, or one that does not meet the moderate- or high-risk categories.',
      offer: 'National bowel cancer screening programme.' }
  },
  notes: [
    'Use only when no hereditary colorectal cancer syndrome (e.g. Lynch syndrome, polyposis) has been identified.',
    'Assess MMR status in the tumour of a close affected relative for everyone referred with a family history of colorectal cancer.',
    'Confirm reported diagnoses from histopathology or endoscopy reports where possible.'
  ],
  amsterdam: 'Amsterdam criteria families where MMR testing is not possible may be offered surveillance as for Lynch syndrome, and/or further germline testing.',
  lynchLike: 'Lynch-like syndrome (MMR-deficient tumour without MLH1 hypermethylation or BRAF V600E and no germline MMR variant): 2-yearly colonoscopy from 25 until 75, also for unaffected first-degree relatives.',
  // Anyone with polyps removed: BSG/ACPGBI/PHE 2020 post-polypectomy surveillance (Rutter et al., Gut 2020;69:201-223, GUIDES.bsg_pp).
  polyps: {
    source: 'bsg_pp',
    lead: 'Anyone found to have premalignant colorectal polyps (adenomas or serrated polyps) should also follow the BSG/ACPGBI/PHE 2020 post-polypectomy surveillance guidelines.',
    items: [
      'High-risk findings – two or more premalignant polyps including at least one advanced polyp (a serrated polyp ≥10 mm or with any dysplasia, or an adenoma ≥10 mm or with high-grade dysplasia), or five or more premalignant polyps: one-off surveillance colonoscopy at 3 years.',
      'Otherwise: no colonoscopic surveillance – national bowel cancer screening programme when of screening age.',
      'Polyps short of the high-risk criteria under about 40, or with a family history of colorectal cancer: decide individually, ideally with clinical genetics – e.g. under 30 or with a family history of colorectal cancer, a 5-year surveillance colonoscopy may be considered.',
      'Not routinely after 75, or when life expectancy is under 10 years.'
    ]
  },
  // Polyposis without a known syndrome: BSG/ACPGBI/UKCGG 2019 (GUIDES.bsg) – Table 1 and the MCRA and SPS sections.
  mcra: {
    def: '10 or more adenomas (lifetime total) without a constitutional pathogenic variant in APC or MUTYH.',
    testing: 'Germline panel testing first (R211): considered under 60 with ≥10 adenomas, or from 60 with ≥20 adenomas or ≥10 with a family history of colorectal cancer or polyposis.',
    affected: 'If none is found: colonoscopy individualised to the phenotype, 1–2 yearly from diagnosis until 75 – annual once the colon is cleared of lesions >5 mm, extending to 2-yearly if no polyps ≥10 mm are found.',
    dye: '10 or more polyps (adenomas or serrated): the next colonoscopy should be a high-quality examination with pancolonic dye spray to define the phenotype.',
    fdr: 'First-degree relatives of someone with MCRA: a colonoscopic assessment at referral and/or at 50 may be considered (the guideline group did not reach consensus).'
  },
  sps: {
    criteria: ['Five or more serrated lesions/polyps proximal to the rectum, all at least 5 mm, with two or more at least 10 mm; or',
      'More than 20 serrated lesions/polyps of any size distributed through the large bowel, with at least five proximal to the rectum.'],
    notes: ['The polyp count is cumulative over multiple colonoscopies.', 'A diagnosis of exclusion: rule out known predisposition syndromes (germline testing).'],
    r211: 'Test Directory R211: a clinical diagnosis of serrated polyposis syndrome qualifies if the patient is under 50, has a first-degree relative with SPS, or has dysplasia in any polyp.',
    affected: 'colonoscopy 1–2 yearly from diagnosis until 75.',
    fdr: 'colonoscopy 5-yearly from 40 (or 10 years earlier than the index case\'s diagnosis) until 75.',
    msp: 'Multiple serrated polyps (10 or more polyps, at least half serrated) not meeting the WHO criteria: the same surveillance might be considered for first-degree relatives.'
  }
};

/*
 * Family history of breast cancer without a known syndrome: NICE CG164 (GUIDES.cg164) – family-history patterns for
 * referral (1.3.3 secondary care; 1.4.4 specialist genetic clinic; 1.3.4 / 1.4.2 / 1.4.5 seek advice), risk categories
 * (Terms used) and surveillance for women without a personal history of breast cancer (1.6.3–1.6.9). The level is
 * worked out in eligibility.js (breastFhCategory) and should be confirmed with a formal risk assessment (CanRisk).
 */
const BREAST_FH = {
  source: 'cg164',
  levels: {
    high: { label: 'High-risk family history pattern – refer to a specialist genetic clinic', rec: '1.4.4',
      risk: 'Likely 30% or greater lifetime risk (or >8% between 40 and 50) – confirm with a formal risk assessment (CanRisk).',
      screen: 'Annual mammography 40–59; consider annual mammography 30–39; population screening from 60. No MRI unless the BRCA or TP53 carrier probability is above 30% or a variant is found (then annual MRI from 30 for BRCA, or from 20 for TP53, to 49).' },
    moderate: { label: 'Moderate-risk family history pattern – refer to secondary care (family history clinic)', rec: '1.3.3',
      risk: 'Likely 17–29% lifetime risk (3–8% between 40 and 50) – confirm with a formal risk assessment (CanRisk).',
      screen: 'Annual mammography 40–49; consider annual mammography 50–59; population screening from 60. No MRI.' },
    population: { label: 'Near population risk – primary care with standard written information', rec: '1.3.3',
      risk: 'Likely under 17% lifetime risk.',
      screen: 'NHS Breast Screening Programme from 50.' }
  },
  notes: ['For women without a personal history of breast cancer. First- and second-degree relatives count (four relatives may include third-degree); criteria that need the same side of the family are checked one side at a time.',
    'Average ages use each relative’s earliest breast cancer; in bilateral cancer each breast counts once where CG164 says so.',
    'A known BRCA1, BRCA2 or TP53 variant in the family means direct referral to a specialist genetics service (1.3.6).']
};

/*
 * UKCGG patient information leaflets (ukcgg.org leaflets and guidelines page,
 * checked 13 Oct 2026). Listed per condition with `ukl` in SOURCES; UKCGG_GENERAL
 * leaflets apply to every condition.
 */
const UKCGG_MEDIA = 'https://www.ukcgg.org/media/';
const UKCGG_LEAFLETS = {
  ankrd26: ['ANKRD26 – patient information (2026)', UKCGG_MEDIA + '12428/ankrd26-patient-information_may2026.pdf'],
  cebpa: ['CEBPA – patient information (2026)', UKCGG_MEDIA + '12429/cebpa-patient-information_may2026.pdf'],
  ddx41: ['DDX41 – patient information (2026)', UKCGG_MEDIA + '12430/ddx41-patient-information_may2026.pdf'],
  etv6: ['ETV6 – patient information (2026)', UKCGG_MEDIA + '12431/etv6-patient-information_may2026.pdf'],
  gata2: ['GATA2 – patient information (2026)', UKCGG_MEDIA + '12432/gata2-patient-information_may2026.pdf'],
  runx1: ['RUNX1 – patient information (2026)', UKCGG_MEDIA + '12433/runx1-patient-information_may2026.pdf'],
  palb2: ['Information for PALB2 carriers and their families (2021)', UKCGG_MEDIA + '12664/information-for-palb2-carriers-and-their-families-v1-nov2021.pdf'],
  pot1: ['POT1 – patient information leaflet (2025)', UKCGG_MEDIA + '12814/pot1-patient-information-leaflet_june-2025.pdf'],
  chemo_pre_high: ['Risk-reducing medication (chemoprevention) – premenopausal women at high risk of breast cancer (2023)', UKCGG_MEDIA + '12660/24-update-leaflet-for-premenopausal-women-at-high-risk-of-breast-cancer-nov-2023.pdf'],
  chemo_post_high: ['Risk-reducing medication (chemoprevention) – postmenopausal women at high risk of breast cancer (2023)', UKCGG_MEDIA + '12423/24-update-leaflet-for-postmenopausal-women-high-risk-nov-2023_final.pdf'],
  chemo_pre_mod: ['Risk-reducing medication (chemoprevention) – premenopausal women at moderate risk of breast cancer (2023)', UKCGG_MEDIA + '12424/24-update-leaflet-for-premenopausal-women-at-moderate-risk-of-breast-cancer-nov-2023.pdf'],
  chemo_post_mod: ['Risk-reducing medication (chemoprevention) – postmenopausal women at moderate risk of breast cancer (2023)', UKCGG_MEDIA + '12425/24-update-leaflet-for-postmenopausal-women-moderate-risk-nov-2023_final.pdf'],
  repro: ['Reproductive options for cancer susceptibility gene variants (UKCGG / BSGM)', UKCGG_MEDIA + '12292/pnd-and-pgt-for-cancer-susceptibility-variants-patient-leaflet.pdf']
};
const UKCGG_GENERAL = ['repro'];

/* UK guidance (UKCGG gene-specific guidelines and national guidance). */
const GUIDES = {
  mangen_nf1: ['Manchester Centre for Genomic Medicine NF1 review guidelines and checklist (v18, 2019)', 'https://www.mangen.co.uk/wp-content/uploads/2019/01/NF1_review_checklist_.pdf'],
  brca1: ['UKCGG BRCA1 management guideline (v2.2, 2025)', 'https://www.ukcgg.org/media/12847/ukcgg_brca1_guideline_v2pt2-2025.pdf'],
  brca2: ['UKCGG BRCA2 management guideline (v2.2, 2025)', 'https://www.ukcgg.org/media/12848/ukcgg_brca2_guideline_v2pt2-2025.pdf'],
  palb2: ['UKCGG PALB2 management guideline (2023, slides)', 'https://www.ukcgg.org/media/12665/ukcgg_palb2_guideline_v1_31032023.pptx'],
  atm: ['UKCGG ATM management guideline (2025)', 'https://www.ukcgg.org/media/12728/ukcgg_atm_guideline_version-1_feb-2025.pdf'],
  chek2: ['UKCGG CHEK2 management guideline (v2, 2025)', 'https://www.ukcgg.org/media/12726/ukcgg_chek2_guideline_version-2_feb-2025.pdf'],
  bard1: ['UKCGG BARD1 management guideline (2026)', 'https://www.ukcgg.org/media/12979/bard1-one-page-with-logo-august-2026_tmcv.pdf'],
  brip1: ['UKCGG BRIP1 management guideline', 'https://www.ukcgg.org/media/12630/ukcgg_brip1_guideline_v2_31032023.pdf'],
  rad51c: ['UKCGG RAD51C management guideline (2022)', 'https://www.ukcgg.org/media/12647/ukcgg_rad51c_guideline_v1_13122022.pdf'],
  rad51d: ['UKCGG RAD51D management guideline (2022)', 'https://www.ukcgg.org/media/12648/ukcgg_rad51d_guideline_v1_13122022.pdf'],
  hanson: ['UK consensus: RAD51C, RAD51D, BRIP1, PALB2 (Hanson et al. 2023)', 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10176381/'],
  mlh1: ['UKCGG MLH1 guideline (v5, 2025)', 'https://www.ukcgg.org/media/12839/mlh1-guidelines-v5_final.pdf'],
  msh2: ['UKCGG MSH2 guideline (v5, 2025)', 'https://www.ukcgg.org/media/12840/msh2-guidelines-v5_final.pdf'],
  msh6: ['UKCGG MSH6 guideline (v5, 2025)', 'https://www.ukcgg.org/media/12841/msh6-guidelines-v5_final.pdf'],
  pms2: ['UKCGG PMS2 guideline (v5, 2025)', 'https://www.ukcgg.org/media/12842/pms2-guidelines-v5_final.pdf'],
  dg27: ['NICE DG27 Lynch testing in colorectal cancer', 'https://www.nice.org.uk/guidance/dg27'],
  dg42: ['NICE DG42 Lynch testing in endometrial cancer', 'https://www.nice.org.uk/guidance/dg42'],
  bsg: ['BSG/ACPGBI/UKCGG hereditary colorectal cancer guidelines (2019)', 'https://www.ukcgg.org/media/11962/guidelines-for-the-management-of-hereditary-colorectal-cancerfull_.pdf'],
  bsg_pp: ['BSG/ACPGBI/PHE post-polypectomy and post-colorectal cancer resection surveillance guidelines (Rutter et al., Gut 2020)', 'https://doi.org/10.1136/gutjnl-2019-319858'],
  apc: ['UKCGG APC management guideline (2023)', 'https://www.ukcgg.org/media/12625/ukcgg_apc_guideline_v1_15092023.pdf'],
  smad4: ['UKCGG SMAD4 management guideline (2023)', 'https://www.ukcgg.org/media/12643/ukcgg_smad4_guideline_v1_15092023.pdf'],
  bmpr1a: ['UKCGG BMPR1A management guideline (2023)', 'https://www.ukcgg.org/media/12644/ukcgg_bmpr1a_guideline_v1_15092023.pdf'],
  cdh1: ['UKCGG CDH1 management guideline (2024)', 'https://www.ukcgg.org/media/12631/ukcgg_cdh1_guideline_v2_20022024.pdf'],
  pten: ['UKCGG PTEN cancer surveillance guideline (2024)', 'https://www.ukcgg.org/media/12646/ukcgg_pten_guideline_v1_26012024.pdf'],
  tp53: ['UKCGG consensus guidelines for constitutional TP53 variants (2020)', 'https://www.ukcgg.org/media/11982/ukcgg-consensus-group-guidelines-for-the-management-of-patients-with-constitutional-tp53-pathogenic-variants.pdf'],
  sdha: ['UKCGG SDHA management guideline (2025)', 'https://www.ukcgg.org/media/12815/sdha_version1_june-2025_tmcv.pdf'],
  sdhb: ['UKCGG SDHB management guideline (2025)', 'https://www.ukcgg.org/media/12816/sdhb_version-1_june-2025.pdf'],
  sdhc: ['UKCGG SDHC management guideline (2025)', 'https://www.ukcgg.org/media/12817/sdhc_version-1_june-2025.pdf'],
  sdhd: ['UKCGG SDHD management guideline (2025)', 'https://www.ukcgg.org/media/12818/sdhd_version-1_june-2025.pdf'],
  fh: ['UKCGG FH management guideline (2023)', 'https://www.ukcgg.org/media/12634/ukcgg_fh_guideline_v1_24012023.pdf'],
  flcn: ['UKCGG FLCN management guideline (2025)', 'https://www.ukcgg.org/media/12801/final-version-for-website-ukcgg_flcn-version-for-cancer-leads.pdf'],
  met: ['UKCGG MET management guideline (2024)', 'https://www.ukcgg.org/media/12645/ukcgg_met_guideline_v1_28062024.pdf'],
  bap1: ['UKCGG BAP1 management guideline (2023)', 'https://www.ukcgg.org/media/12626/ukcgg_bap1_guideline_v1_06102023.pdf'],
  pot1: ['UKCGG POT1 management guideline (2025)', 'https://www.ukcgg.org/media/12813/ukcgg-guideline_pot1_v1_june-2025_final.pdf'],
  dicer1: ['UKCGG DICER1 management guideline (2024)', 'https://www.ukcgg.org/media/12633/ukcgg_dicer1_guideline_v1_26012024.pdf'],
  cebpa: ['UKCGG CEBPA management guideline (2023)', 'https://www.ukcgg.org/media/12637/ukcgg_cebpa_guideline_v1_14072023.pdf'],
  runx1: ['UKCGG RUNX1 management guideline (2023)', 'https://www.ukcgg.org/media/12641/ukcgg_runx1_guideline_v1_14072023.pdf'],
  gata2: ['UKCGG GATA2 management guideline (2023)', 'https://www.ukcgg.org/media/12640/ukcgg_gata2_guideline_v1_14072023.pdf'],
  ddx41: ['UKCGG DDX41 management guideline (2023)', 'https://www.ukcgg.org/media/12638/ukcgg_ddx41_guideline_v1_14072023.pdf'],
  etv6: ['UKCGG ETV6 management guideline (2023)', 'https://www.ukcgg.org/media/12639/ukcgg_etv6_guideline_v1_14072023.pdf'],
  ankrd26: ['UKCGG ANKRD26 management guideline (2023)', 'https://www.ukcgg.org/media/12636/ukcgg_ankrd26_guideline_v1_14072023.pdf'],
  cg164: ['NICE CG164 Familial breast cancer', 'https://www.nice.org.uk/guidance/cg164']
};

/* European guidelines (ERN GENTURIS-authored or -endorsed, ESMO, ESGE, EHTG/ESCP, ESE, SIOPE);
 * titles and years checked against Crossref, Oct 2026. */
const EU_GUIDES = {
  esmo_hboc: ['ESMO: risk reduction and screening in hereditary breast-ovarian cancer syndromes (2023)', 'https://doi.org/10.1016/j.annonc.2022.10.004'],
  emqn_hboc: ['EMQN best practice guidelines for genetic testing in hereditary breast and ovarian cancer (2024)', 'https://doi.org/10.1038/s41431-023-01507-5'],
  ehtg_lynch: ['EHTG/ESCP European guidelines for Lynch syndrome – Mallorca 3rd edition (2021)', 'https://doi.org/10.1002/bjs.11902'],
  esge_lynch: ['ESGE: endoscopic management of Lynch syndrome and familial colorectal cancer risk (2019)', 'https://doi.org/10.1055/a-1016-4977'],
  manchester_lynch: ['Manchester International Consensus: gynaecological cancers in Lynch syndrome (2019)', 'https://doi.org/10.1038/s41436-019-0489-y'],
  ern_cmmrd: ['ERN GENTURIS guidelines on constitutional mismatch repair deficiency (2024)', 'https://doi.org/10.1038/s41431-024-01708-6'],
  ehtg_fap: ['EHTG/ESCP European guidelines for FAP, MAP, GAPPS and other rare adenomatous polyposis syndromes (2024)', 'https://doi.org/10.1093/bjs/znae070'],
  esge_polyposis: ['ESGE: endoscopic management of polyposis syndromes (2019)', 'https://doi.org/10.1055/a-0965-0605'],
  ehtg_pjs: ['EHTG: management of Peutz–Jeghers syndrome (2021)', 'https://doi.org/10.3390/jcm10030473'],
  ern_phts: ['ERN GENTURIS cancer surveillance guideline for PTEN hamartoma tumour syndrome (2026)', 'https://doi.org/10.1038/s41431-026-02181-z'],
  igclc_hdgc: ['IGCLC hereditary diffuse gastric cancer guidelines (2020, ERN GENTURIS endorsed)', 'https://doi.org/10.1016/S1470-2045(20)30219-9'],
  ern_lfs: ['ERN GENTURIS guidelines for Li–Fraumeni and heritable TP53-related cancer syndromes (2020)', 'https://doi.org/10.1038/s41431-020-0638-4'],
  vhl_eu: ['von Hippel–Lindau disease: updated guideline for diagnosis and surveillance (2022, ERN GENTURIS endorsed)', 'https://doi.org/10.1016/j.ejmg.2022.104538'],
  ese_ppgl: ['ESE guideline: long-term follow-up after surgery for phaeochromocytoma/paraganglioma (2016)', 'https://doi.org/10.1530/eje-16-0033'],
  sdhx_consensus: ['International consensus on screening and follow-up of asymptomatic SDHx carriers (2021)', 'https://doi.org/10.1038/s41574-021-00492-3'],
  ppgl_children: ['International consensus on PPGL in children and adolescents (2024, ERN GENTURIS endorsed)', 'https://doi.org/10.1038/s41574-024-01024-5'],
  ern_bhd: ['ERN GENTURIS guidelines for Birt–Hogg–Dubé syndrome (2024)', 'https://doi.org/10.1038/s41431-024-01671-2'],
  bap1_eu: ['Clinical practice guidelines for BAP1 tumour predisposition syndrome (2023, ERN GENTURIS endorsed)', 'https://doi.org/10.1038/s41431-023-01448-z'],
  bcns_eu: ['Guideline for the clinical management of basal cell naevus syndrome (2022, ERN GENTURIS endorsed)', 'https://doi.org/10.1111/bjd.20700'],
  siope_gorlin: ['SIOPE Host Genome Working Group: cancer surveillance in Gorlin syndrome (2021)', 'https://doi.org/10.1007/s10689-021-00247-z'],
  ern_nf1: ['ERN GENTURIS tumour surveillance guidelines for NF1 (2023)', 'https://doi.org/10.1016/j.eclinm.2022.101818'],
  nf1_criteria: ['Revised diagnostic criteria for NF1 and Legius syndrome (2021, ERN GENTURIS endorsed)', 'https://doi.org/10.1038/s41436-021-01170-5'],
  ern_schwann: ['ERN GENTURIS guidelines for schwannomatosis (2022)', 'https://doi.org/10.1038/s41431-022-01086-x'],
  nf2_criteria: ['Updated diagnostic criteria for NF2 and schwannomatosis (2022, ERN GENTURIS endorsed)', 'https://doi.org/10.1016/j.gim.2022.05.007'],
  siope_rhabdoid: ['SIOPE Host Genome Working Group: surveillance and testing in rhabdoid tumour predisposition (2021)', 'https://doi.org/10.1007/s10689-021-00229-1'],
  sccoht: ['SCCOHT: genetics and management guidelines (2020, ERN GENTURIS endorsed)', 'https://doi.org/10.1158/1078-0432.CCR-19-3797'],
  siope_dicer1: ['SIOPE Host Genome Working Group: surveillance for DICER1 carriers (2021)', 'https://doi.org/10.1007/s10689-021-00264-y'],
  siope_wilms: ['SIOPE Host Genome Working Group / SIOP-RTSG: Wilms tumour surveillance in at-risk children (2021)', 'https://doi.org/10.1016/j.ejca.2021.05.014'],
  bws_consensus: ['International consensus on diagnosis, screening and management of Beckwith–Wiedemann syndrome (2018)', 'https://doi.org/10.1038/nrendo.2017.166'],
  esmo_gist: ['ESMO–EURACAN–GENTURIS: gastrointestinal stromal tumours (2022)', 'https://doi.org/10.1016/j.annonc.2021.09.005']
};

/* US and international guidelines (NCCN, ACMG, ACG, USMSTF, ATA, Endocrine Society, AACR Childhood
 * Cancer Predisposition Workshop); DOIs, titles and years checked against Crossref, Oct 2026. */
const US_GUIDES = {
  nccn_bopp: ['NCCN: Genetic/Familial High-Risk Assessment – Breast, Ovarian, Pancreatic, and Prostate (free registration)', 'https://www.nccn.org/guidelines/guidelines-detail?category=2&id=1503'],
  nccn_ceeg: ['NCCN: Genetic/Familial High-Risk Assessment – Colorectal, Endometrial, Esophageal, and Gastric (free registration)', 'https://www.nccn.org/guidelines/guidelines-detail?category=2&id=1436'],
  acmg_palb2: ['ACMG clinical practice resource: management of germline PALB2 variants (2021)', 'https://doi.org/10.1038/s41436-021-01151-8'],
  acg_gi: ['ACG clinical guideline: hereditary gastrointestinal cancer syndromes (2015)', 'https://doi.org/10.1038/ajg.2014.435'],
  usmstf_lynch: ['US Multi-Society Task Force: genetic evaluation and management of Lynch syndrome (2014)', 'https://doi.org/10.1053/j.gastro.2014.04.001'],
  usmstf_hamartoma: ['US Multi-Society Task Force: GI hamartomatous polyposis syndromes (2022)', 'https://doi.org/10.1053/j.gastro.2022.02.021'],
  ata_men2: ['Revised American Thyroid Association guidelines for medullary thyroid carcinoma / MEN2 (2015)', 'https://doi.org/10.1089/thy.2014.0335'],
  endo_men1: ['Clinical practice guidelines for MEN1 (Thakker et al., JCEM 2012)', 'https://doi.org/10.1210/jc.2012-1230'],
  endo_ppgl: ['Endocrine Society clinical practice guideline: phaeochromocytoma and paraganglioma (2014)', 'https://doi.org/10.1210/jc.2014-1498'],
  carney_nih: ['Carney complex: diagnostic criteria and recommendations for evaluation (Stratakis et al., JCEM 2001)', 'https://doi.org/10.1210/jcem.86.9.7903'],
  vhl_consensus: ['International VHL Surveillance Guidelines Consortium consensus statement (2023)', 'https://doi.org/10.1002/cncr.34896'],
  tsc_consensus: ['Updated international TSC diagnostic criteria and surveillance recommendations (2021)', 'https://doi.org/10.1016/j.pediatrneurol.2021.07.011'],
  phts_consensus: ['International PHTS Consensus Guidelines Working Group: cancer and overgrowth management (2025)', 'https://doi.org/10.1158/1078-0432.ccr-24-3819'],
  fa_guidelines: ['Fanconi Cancer Foundation: Fanconi anaemia clinical care guidelines', 'https://www.fanconi.org/explore/clinical-care-guidelines'],
  aacr_lfs: ['AACR 2023 workshop update: cancer screening in Li–Fraumeni syndrome (2025)', 'https://doi.org/10.1158/1078-0432.ccr-24-3301'],
  aacr_gi: ['AACR 2023 workshop update: paediatric screening in hereditary GI cancer syndromes (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-0953'],
  aacr_rrd: ['AACR 2023 workshop update: DNA replication repair deficiency syndromes (CMMRD, polymerase PPAP) (2024)', 'https://doi.org/10.1158/1078-0432.ccr-23-3994'],
  aacr_endo: ['AACR 2023 workshop update: MEN, hyperparathyroidism–jaw tumour and Carney complex (2025)', 'https://doi.org/10.1158/1078-0432.ccr-24-3860'],
  aacr_vhl: ['AACR 2023 workshop update: surveillance in von Hippel–Lindau disease (2025)', 'https://doi.org/10.1158/1078-0432.ccr-24-3525'],
  aacr_ppgl: ['AACR 2023 workshop update: hereditary phaeochromocytoma/paraganglioma in children (2025)', 'https://doi.org/10.1158/1078-0432.ccr-24-4354'],
  aacr_ras: ['AACR 2023 workshop update: NF1, Noonan, CBL, Costello and related RASopathies (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-1611'],
  aacr_schwann: ['AACR 2023 workshop update: NF2-, SMARCB1- and LZTR1-related schwannomatosis (2025)', 'https://doi.org/10.1158/1078-0432.ccr-24-3278'],
  aacr_brain: ['AACR 2023 workshop update: predisposition and surveillance for childhood brain tumours (2024)', 'https://doi.org/10.1158/1078-0432.ccr-23-4033'],
  aacr_pten_dicer1_tsc: ['AACR 2023 workshop update: PTEN hamartoma tumour syndrome, DICER1 and TSC (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-1947'],
  aacr_dicer1: ['DICER1-related tumour predisposition: at-risk individuals and surveillance (AACR, 2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-1532'],
  aacr_fh: ['AACR 2017 workshop: PTEN, DICER1 and FH tumour susceptibility syndromes in childhood (2017)', 'https://doi.org/10.1158/1078-0432.ccr-17-0629'],
  aacr_bws: ['AACR 2023 workshop update: Wilms tumour and hepatoblastoma in Beckwith–Wiedemann and related syndromes (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-2100'],
  aacr_wilms: ['AACR 2023 workshop update: emerging Wilms tumour predisposition syndromes (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-2488'],
  aacr_nb: ['AACR 2023 workshop update: neuroblastoma predisposition and surveillance (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-0237'],
  aacr_rb: ['AACR 2023 workshop update: retinoblastoma predisposition and surveillance (2025)', 'https://doi.org/10.1158/1078-0432.ccr-24-3271'],
  aacr_heme: ['AACR 2023 workshop update: predisposition to haematopoietic malignancy (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-0685'],
  aacr_gid: ['AACR 2023 workshop update: genomic instability disorders (2024)', 'https://doi.org/10.1158/1078-0432.ccr-24-1098']
};

/* Per-condition East Genomics leaflets (`eg`), UK (`guide`), European (`eu`) and US (`us`) guidance. */
const SOURCES = {
  brca1: { ukl: ['chemo_pre_high', 'chemo_post_high'], eg: ['brca1', 'brca_r444', 'breast_ovarian', 'ovarian', 'pancreatic', 'prostate_brca'], guide: ['brca1', 'cg164'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp'] },
  brca2: { ukl: ['chemo_pre_high', 'chemo_post_high'], eg: ['brca2', 'brca_r444', 'breast_ovarian', 'ovarian', 'pancreatic', 'prostate_r430', 'prostate_brca', 'prostate'], guide: ['brca2', 'cg164'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp', 'aacr_brain'] },
  palb2: { ukl: ['palb2', 'chemo_pre_high', 'chemo_post_high'], eg: ['palb2', 'brca_r444', 'breast_ovarian', 'pancreatic'], guide: ['palb2', 'hanson'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp', 'acmg_palb2', 'aacr_brain'] },
  atm: { ukl: ['chemo_pre_mod', 'chemo_post_mod'], eg: ['atm', 'breast_ovarian', 'pancreatic', 'prostate_r430'], guide: ['atm', 'cg164'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp'] },
  chek2: { ukl: ['chemo_pre_mod', 'chemo_post_mod'], eg: ['chek2', 'breast_ovarian'], guide: ['chek2', 'cg164'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp'] },
  bard1: { ukl: ['chemo_pre_mod', 'chemo_post_mod'], eg: ['breast_ovarian'], guide: ['bard1', 'cg164'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp'] },
  rad51d: { ukl: ['chemo_pre_mod', 'chemo_post_mod'], eg: ['rad51d', 'ovarian', 'breast_ovarian'], guide: ['rad51d', 'hanson'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp'] },
  rad51c: { ukl: ['chemo_pre_mod', 'chemo_post_mod'], eg: ['rad51c', 'ovarian', 'breast_ovarian'], guide: ['rad51c', 'hanson'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp'] },
  brip1: { eg: ['brip1', 'ovarian'], guide: ['brip1', 'hanson'], eu: ['esmo_hboc', 'emqn_hboc'], us: ['nccn_bopp'] },
  lynch_mlh1: { eg: ['lynch', 'lynch_aspirin', 'bowel'], guide: ['mlh1', 'dg27', 'dg42'], eu: ['ehtg_lynch', 'esge_lynch', 'manchester_lynch'], us: ['nccn_ceeg', 'usmstf_lynch', 'acg_gi'] },
  lynch_msh2: { eg: ['lynch', 'lynch_aspirin', 'bowel'], guide: ['msh2', 'dg27', 'dg42'], eu: ['ehtg_lynch', 'esge_lynch', 'manchester_lynch'], us: ['nccn_ceeg', 'usmstf_lynch', 'acg_gi'] },
  lynch_msh6: { eg: ['lynch', 'lynch_aspirin', 'bowel'], guide: ['msh6', 'dg27', 'dg42'], eu: ['ehtg_lynch', 'esge_lynch', 'manchester_lynch'], us: ['nccn_ceeg', 'usmstf_lynch', 'acg_gi'] },
  lynch_pms2: { eg: ['lynch', 'lynch_aspirin', 'bowel'], guide: ['pms2', 'dg27', 'dg42'], eu: ['ehtg_lynch', 'esge_lynch', 'manchester_lynch'], us: ['nccn_ceeg', 'usmstf_lynch', 'acg_gi'] },
  cmmrd: { eg: ['lynch', 'bowel'], guide: ['bsg'], eu: ['ern_cmmrd'], us: ['aacr_rrd', 'nccn_ceeg', 'aacr_brain'] },
  fap: { eg: ['bowel'], guide: ['apc', 'bsg'], eu: ['ehtg_fap', 'esge_polyposis'], us: ['nccn_ceeg', 'acg_gi', 'aacr_gi', 'aacr_brain'] },
  map: { eg: ['map', 'bowel'], guide: ['bsg'], eu: ['ehtg_fap', 'esge_polyposis'], us: ['nccn_ceeg', 'acg_gi'] },
  nthl1: { eg: ['bowel'], guide: ['bsg'], eu: ['ehtg_fap'], us: ['nccn_ceeg'] },
  ppap: { eg: ['bowel'], guide: ['bsg'], eu: ['ehtg_fap'], us: ['nccn_ceeg', 'aacr_rrd'] },
  mbd4: { eg: ['bowel'], guide: ['bsg'], eu: ['ehtg_fap'], us: ['nccn_ceeg'] },
  jps_smad4: { eg: ['bowel'], guide: ['smad4', 'bsg'], eu: ['esge_polyposis'], us: ['usmstf_hamartoma', 'nccn_ceeg', 'acg_gi', 'aacr_gi'] },
  jps_bmpr1a: { eg: ['bowel'], guide: ['bmpr1a', 'bsg'], eu: ['esge_polyposis'], us: ['usmstf_hamartoma', 'nccn_ceeg', 'acg_gi', 'aacr_gi'] },
  hmps: { eg: ['bowel'], guide: ['bsg'], eu: ['esge_polyposis'], us: ['usmstf_hamartoma'] },
  rnf43: { eg: ['bowel'], guide: ['bsg'], eu: ['esge_polyposis'], us: ['nccn_ceeg'] },
  pjs: { ukl: ['chemo_pre_high', 'chemo_post_high'], eg: ['bowel', 'pancreatic'], guide: ['bsg'], eu: ['ehtg_pjs', 'esge_polyposis'], us: ['usmstf_hamartoma', 'nccn_ceeg', 'acg_gi', 'aacr_gi'] },
  phts: { ukl: ['chemo_pre_high', 'chemo_post_high'], eg: ['pten'], guide: ['pten'], eu: ['ern_phts', 'esge_polyposis'], us: ['phts_consensus', 'nccn_bopp', 'usmstf_hamartoma', 'aacr_pten_dicer1_tsc', 'aacr_brain'] },
  hdgc: { ukl: ['chemo_pre_high', 'chemo_post_high'], guide: ['cdh1'], eu: ['igclc_hdgc'], us: ['nccn_ceeg', 'nccn_bopp', 'acg_gi'] },
  lfs: { ukl: ['chemo_pre_high', 'chemo_post_high'], eg: ['lfs'], guide: ['tp53'], eu: ['ern_lfs'], us: ['nccn_bopp', 'aacr_lfs', 'aacr_brain'] },
  men2: { eg: ['ppgl'], us: ['ata_men2', 'aacr_endo'] },
  carney: { eg: ['carney'], us: ['carney_nih', 'aacr_endo'] },
  vhl: { eg: ['ppgl'], eu: ['vhl_eu', 'ppgl_children'], us: ['vhl_consensus', 'aacr_vhl', 'endo_ppgl', 'aacr_brain'] },
  sdhb: { eg: ['ppgl', 'gist'], guide: ['sdhb'], eu: ['sdhx_consensus', 'ese_ppgl', 'ppgl_children'], us: ['endo_ppgl', 'aacr_ppgl'] },
  sdhd: { eg: ['ppgl', 'gist'], guide: ['sdhd'], eu: ['sdhx_consensus', 'ese_ppgl', 'ppgl_children'], us: ['endo_ppgl', 'aacr_ppgl'] },
  sdhc: { eg: ['ppgl', 'gist'], guide: ['sdhc'], eu: ['sdhx_consensus', 'ese_ppgl', 'ppgl_children'], us: ['endo_ppgl', 'aacr_ppgl'] },
  sdha: { eg: ['ppgl', 'gist'], guide: ['sdha'], eu: ['sdhx_consensus', 'ese_ppgl', 'ppgl_children'], us: ['endo_ppgl', 'aacr_ppgl'] },
  sdhaf2: { eg: ['ppgl'], eu: ['ese_ppgl', 'ppgl_children'], us: ['endo_ppgl', 'aacr_ppgl'] },
  tmem127: { eg: ['ppgl'], eu: ['ese_ppgl', 'ppgl_children'], us: ['endo_ppgl', 'aacr_ppgl'] },
  max: { eg: ['ppgl'], eu: ['ese_ppgl', 'ppgl_children'], us: ['endo_ppgl', 'aacr_ppgl'] },
  hlrcc: { eg: ['hlrcc'], guide: ['fh'], us: ['aacr_fh'] },
  bhd: { guide: ['flcn'], eu: ['ern_bhd'] },
  hprc: { eg: ['hprc'], guide: ['met'] },
  bap1: { eg: ['bap1', 'melanoma'], guide: ['bap1'], eu: ['bap1_eu'], us: ['aacr_brain'] },
  cdkn2a: { eg: ['melanoma', 'pancreatic'], us: ['nccn_bopp', 'aacr_brain'] },
  cdk4: { eg: ['melanoma'] },
  pot1: { ukl: ['pot1'], eg: ['melanoma'], guide: ['pot1'], us: ['aacr_brain'] },
  nf1: { eg: ['nf1'], guide: ['mangen_nf1'], eu: ['ern_nf1', 'nf1_criteria'], us: ['aacr_ras', 'aacr_brain'] },
  dicer1: { eg: ['dicer1'], guide: ['dicer1'], eu: ['siope_dicer1'], us: ['aacr_dicer1', 'aacr_pten_dicer1_tsc', 'aacr_brain'] },
  kit: { eg: ['gist'], eu: ['esmo_gist'] },
  pdgfra: { eg: ['gist'], eu: ['esmo_gist'] },
  cebpa: { ukl: ['cebpa'], guide: ['cebpa'], us: ['aacr_heme'] },
  runx1: { ukl: ['runx1'], guide: ['runx1'], us: ['aacr_heme'] },
  gata2: { ukl: ['gata2'], guide: ['gata2'], us: ['aacr_heme'] },
  ddx41: { ukl: ['ddx41'], guide: ['ddx41'], us: ['aacr_heme'] },
  etv6: { ukl: ['etv6'], guide: ['etv6'], us: ['aacr_heme'] },
  ankrd26: { ukl: ['ankrd26'], guide: ['ankrd26'], us: ['aacr_heme'] },
  ctnna1: { eu: ['igclc_hdgc'], us: ['nccn_ceeg'] },
  gorlin: { eu: ['bcns_eu', 'siope_gorlin'], us: ['aacr_brain'] },
  sufu: { eu: ['bcns_eu', 'siope_gorlin'], us: ['aacr_brain'] },
  nf2: { eu: ['ern_schwann', 'nf2_criteria'], us: ['aacr_schwann', 'aacr_brain'] },
  smarcb1: { eu: ['siope_rhabdoid', 'ern_schwann', 'nf2_criteria'], us: ['aacr_schwann', 'aacr_brain'] },
  lztr1: { eu: ['ern_schwann', 'nf2_criteria'], us: ['aacr_schwann', 'aacr_brain'] },
  smarca4: { eu: ['siope_rhabdoid', 'sccoht'], us: ['aacr_brain'] },
  wt1: { eu: ['siope_wilms'], us: ['aacr_bws', 'aacr_wilms'] },
  wilms_other: { eu: ['siope_wilms'], us: ['aacr_wilms'] },
  perlman: { eu: ['siope_wilms'], us: ['aacr_wilms'] },
  mulibrey: { eu: ['siope_wilms'], us: ['aacr_wilms'] },
  mva: { eu: ['siope_wilms'], us: ['aacr_wilms'] },
  sgbs: { eu: ['siope_wilms'], us: ['aacr_bws'] },
  bws: { eu: ['bws_consensus', 'siope_wilms'], us: ['aacr_bws'] },
  men1: { us: ['endo_men1', 'aacr_endo', 'aacr_brain'] },
  men4: { us: ['aacr_endo'] },
  hptjt: { us: ['aacr_endo'] },
  fipa: { us: ['endo_men1'] },
  tsc: { us: ['tsc_consensus', 'aacr_pten_dicer1_tsc', 'aacr_brain'] },
  noonan: { us: ['aacr_ras'] },
  cbl: { us: ['aacr_ras'] },
  costello: { us: ['aacr_ras'] },
  elp1: { us: ['aacr_brain'] },
  gpr161: { us: ['aacr_brain'] },
  alk: { us: ['aacr_nb'] },
  phox2b: { us: ['aacr_nb'] },
  rb1: { us: ['aacr_rb', 'aacr_brain'] },
  samd9l: { us: ['aacr_heme'] },
  pax5: { us: ['aacr_heme'] },
  tbd: { us: ['aacr_heme'] },
  fancm: {},
  fanconi: { us: ['fa_guidelines', 'aacr_gid', 'aacr_brain'] },
  at: { us: ['aacr_gid'] },
  nbs: { us: ['aacr_gid'] },
  bloom: { us: ['aacr_gid'] },
  rts: { us: ['aacr_gid'] },
  werner: { us: ['aacr_gid', 'aacr_brain'] },
  smarce1: { us: ['aacr_brain'] },
  dgcr8: { us: ['aacr_brain'] },
  jmjd1c: { us: ['aacr_brain'] },
  tbxt: { us: ['aacr_brain'] },
  ollier: { us: ['aacr_brain'] }
};

/*
 * GeneReviews chapters (NBK IDs from the NCBI GeneReviews gene/chapter mapping
 * file) and OMIM phenotype entries (NCBI Gene -> OMIM gene-map links), checked
 * Oct 2026. Gene entries come from GENE_MIM (OMIM mim2gene.txt).
 */
const GR_TITLES = {
  NBK1109: 'Neurofibromatosis 1',
  NBK1124: 'Noonan Syndrome',
  NBK1139: 'Diffuse Gastric and Lobular Breast Cancer Syndrome',
  NBK1151: 'Nevoid Basal Cell Carcinoma Syndrome',
  NBK1176: 'Nijmegen Breakage Syndrome',
  NBK1201: 'NF2-Related Schwannomatosis',
  NBK1211: 'Lynch Syndrome',
  NBK1219: 'Simpson-Golabi-Behmel Syndrome Type 1',
  NBK1220: 'Tuberous Sclerosis Complex',
  NBK1237: 'Rothmund-Thomson Syndrome',
  NBK1247: 'BRCA1- and BRCA2-Associated Hereditary Breast and Ovarian Cancer',
  NBK1252: 'FH Tumor Predisposition Syndrome',
  NBK1257: 'Multiple Endocrine Neoplasia Type 2',
  NBK1266: 'Peutz-Jeghers Syndrome',
  NBK1286: 'Carney Complex',
  NBK1294: 'Wilms Tumor Predisposition',
  NBK1311: 'Li-Fraumeni Syndrome',
  NBK1345: 'APC-Associated Polyposis Conditions',
  NBK1351: 'Hereditary Hemorrhagic Telangiectasia',
  NBK1394: 'Beckwith-Wiedemann Syndrome',
  NBK1397: 'Xeroderma Pigmentosum',
  NBK1398: 'Bloom Syndrome',
  NBK1401: 'Fanconi Anemia',
  NBK1427: 'Congenital Central Hypoventilation Syndrome (CCHS)',
  NBK1452: 'Retinoblastoma',
  NBK1463: 'Von Hippel-Lindau Syndrome',
  NBK1469: 'Juvenile Polyposis Syndrome',
  NBK1479: 'Sotos Syndrome',
  NBK1488: 'PTEN Hamartoma Tumor Syndrome',
  NBK1507: 'HRAS-Related Costello Syndrome',
  NBK1514: 'Werner Syndrome',
  NBK1522: 'Birt-Hogg-Dube Syndrome',
  NBK1538: 'Multiple Endocrine Neoplasia Type 1',
  NBK1548: 'Hereditary Paraganglioma-Pheochromocytoma Syndromes',
  NBK3789: 'CDC73-Related Disorders',
  NBK22301: 'Dyskeratosis Congenita and Related Telomere Biology Disorders',
  NBK24599: 'ALK-Related Neuroblastic Tumor Susceptibility',
  NBK26468: 'Ataxia-Telangiectasia',
  NBK47457: 'CEBPA-Associated Familial Acute Myeloid Leukemia',
  NBK97965: 'AIP Familial Isolated Pituitary Adenomas',
  NBK107219: 'MUTYH Polyposis',
  NBK148820: 'EZH2-Related Overgrowth',
  NBK196157: 'DICER1-Related Tumor Predisposition',
  NBK274564: 'Fibrous Dysplasia / McCune-Albright Syndrome',
  NBK390611: 'BAP1 Tumor Predisposition Syndrome',
  NBK435692: 'SAMD9L-Related Syndrome',
  NBK469816: 'Rhabdoid Tumor Predisposition Syndrome (RTPS)',
  NBK487394: 'Schwannomatosis',
  NBK507664: 'ANKRD26-Related Thrombocytopenia',
  NBK555473: 'NTHL1 Tumor Syndrome',
  NBK556455: 'WT1 Disorder',
  NBK563529: 'POT1 Tumor Predisposition',
  NBK564234: 'ETV6-Related Thrombocytopenia and Predisposition to Leukemia',
  NBK568319: 'RUNX1 Familial Platelet Disorder with Associated Myeloid Malignancies',
  NBK574843: 'DDX41-Associated Familial Myelodysplastic Syndrome and Acute Myeloid Leukemia',
  NBK594826: 'Multiple Endocrine Neoplasia Type 4',
  NBK615090: 'CHEK2-Related Cancer Predisposition',
  NBK616232: 'CDKN2A Cancer Predisposition',
  NBK623002: 'ATM-Related Cancer Predisposition',
  NBK624097: 'MBD4-Related Tumor Predisposition Syndrome',
  NBK625142: 'Primary Familial Gastrointestinal Stromal Tumors'
};
const OMIM_PREFIX = { 166000: '%', 614569: '%' };  // entries without a known molecular basis
const OMIM_TITLES = {
  166000: 'Enchondromatosis, Multiple, Ollier Type',
  215400: 'Chordoma, Susceptibility to',
  614569: 'Multiple Enchondromatosis, Maffucci Type',
  101000: 'Schwannomatosis, Vestibular',
  102200: 'Pituitary Adenoma 1, Multiple Types',
  109400: 'Basal Cell Nevus Syndrome 1',
  114480: 'Breast Cancer',
  115310: 'Pheochromocytoma/Paraganglioma Syndrome 4',
  117550: 'Sotos Syndrome',
  120435: 'Lynch Syndrome 1',
  127550: 'Dyskeratosis Congenita, Autosomal Dominant 1',
  305000: 'Dyskeratosis Congenita, X-Linked',
  613990: 'Dyskeratosis Congenita, Autosomal Dominant 3',
  617053: 'MIRAGE Syndrome',
  619041: 'Monosomy 7 Myelodysplasia and Leukemia Syndrome 2',
  130650: 'Beckwith-Wiedemann Syndrome',
  131100: 'Multiple Endocrine Neoplasia, Type I',
  135150: 'Birt-Hogg-Dube Syndrome 1',
  136680: 'Frasier Syndrome',
  137215: 'Diffuse Gastric and Lobular Breast Cancer Syndrome',
  138800: 'Goiter, Multinodular 1, with or without Sertoli-Leydig Cell Tumors',
  145001: 'Hyperparathyroidism 2 with Jaw Tumors',
  148500: 'Tylosis with Esophageal Cancer',
  150800: 'Hereditary Leiomyomatosis and Renal Cell Cancer',
  151623: 'Li-Fraumeni Syndrome',
  155240: 'Thyroid Carcinoma, Familial Medullary',
  155255: 'Medulloblastoma',
  155601: 'Melanoma, Cutaneous Malignant, Susceptibility to, 2',
  158320: 'Muir-Torre Syndrome',
  158350: 'Cowden Syndrome 1',
  159550: 'Ataxia-Pancytopenia Syndrome',
  160980: 'Carney Complex, Type 1',
  162091: 'Schwannomatosis 1',
  162200: 'Neurofibromatosis, Type I',
  162300: 'Multiple Endocrine Neoplasia, Type IIB',
  163950: 'Noonan Syndrome 1',
  168000: 'Pheochromocytoma/Paraganglioma Syndrome 1',
  171300: 'Pheochromocytoma',
  171400: 'Multiple Endocrine Neoplasia, Type IIA',
  174800: 'McCune-Albright Syndrome',
  174900: 'Juvenile Polyposis Syndrome',
  175050: 'Juvenile Polyposis/Hereditary Hemorrhagic Telangiectasia Syndrome',
  175100: 'Familial Adenomatous Polyposis 1',
  175200: 'Peutz-Jeghers Syndrome',
  175510: 'GIST-Plus Syndrome',
  180200: 'Retinoblastoma',
  188000: 'Thrombocytopenia 2',
  191100: 'Tuberous Sclerosis 1',
  193300: 'Von Hippel-Lindau Syndrome',
  194070: 'Wilms Tumor 1',
  194072: 'Wilms Tumor, Aniridia, Genitourinary Anomalies, and Impaired Intellectual Development Syndrome',
  194080: 'Denys-Drash Syndrome',
  208900: 'Ataxia-Telangiectasia',
  209880: 'Central Hypoventilation Syndrome, Congenital, 1',
  210900: 'Bloom Syndrome',
  218040: 'Costello Syndrome',
  224230: 'Dyskeratosis Congenita, Autosomal Recessive 1',
  227645: 'Fanconi Anemia, Complementation Group C',
  227646: 'Fanconi Anemia, Complementation Group D2',
  227650: 'Fanconi Anemia, Complementation Group A',
  228550: 'Myofibromatosis, Infantile, 1',
  251260: 'Nijmegen Breakage Syndrome',
  253250: 'Mulibrey Nanism',
  257300: 'Mosaic Variegated Aneuploidy Syndrome 1',
  267000: 'Perlman Syndrome',
  268400: 'Rothmund-Thomson Syndrome, Type 2',
  276300: 'Mismatch Repair Cancer Syndrome 1',
  277590: 'Weaver Syndrome',
  277700: 'Werner Syndrome',
  278700: 'Xeroderma Pigmentosum, Complementation Group A',
  278720: 'Xeroderma Pigmentosum, Complementation Group C',
  278730: 'Xeroderma Pigmentosum, Complementation Group D',
  278740: 'Xeroderma Pigmentosum, Complementation Group E',
  278750: 'Xeroderma Pigmentosum, Variant Type',
  278760: 'Xeroderma Pigmentosum, Complementation Group F',
  278780: 'Xeroderma Pigmentosum, Complementation Group G',
  300514: 'Fanconi Anemia, Complementation Group B',
  312870: 'Simpson-Golabi-Behmel Syndrome, Type 1',
  600901: 'Fanconi Anemia, Complementation Group E',
  601200: 'Pleuropulmonary Blastoma',
  601228: 'Polyposis Syndrome, Hereditary Mixed, 1',
  601399: 'Platelet Disorder, Familial, with Associated Myeloid Malignancy',
  601626: 'Leukemia, Acute Myeloid',
  601650: 'Pheochromocytoma/Paraganglioma Syndrome 2',
  603467: 'Fanconi Anemia, Complementation Group F',
  604370: 'Breast-Ovarian Cancer, Familial, Susceptibility to, 1',
  605074: 'Renal Cell Carcinoma, Papillary, 1',
  605373: 'Pheochromocytoma/Paraganglioma Syndrome 3',
  605724: 'Fanconi Anemia, Complementation Group D1',
  606660: 'Melanoma, Uveal, Susceptibility to, 1',
  606719: 'Melanoma-Pancreatic Cancer Syndrome',
  606764: 'Gastrointestinal Stromal Tumor',
  607174: 'Meningioma, Familial, Susceptibility to',
  607721: 'Noonan Syndrome-Like Disorder with Loose Anagen Hair 1',
  608266: 'Parathyroid Carcinoma',
  608456: 'Familial Adenomatous Polyposis 2',
  609048: 'Melanoma, Cutaneous Malignant, Susceptibility to, 3',
  609053: 'Fanconi Anemia, Complementation Group I',
  609054: 'Fanconi Anemia, Complementation Group J',
  609265: 'Tumor Predisposition Syndrome 4',
  609310: 'Lynch Syndrome 2',
  609322: 'Rhabdoid Tumor Predisposition Syndrome 1',
  609942: 'Noonan Syndrome 3',
  610651: 'Xeroderma Pigmentosum, Complementation Group B',
  610733: 'Noonan Syndrome 4',
  610755: 'Multiple Endocrine Neoplasia, Type IV',
  610832: 'Fanconi Anemia, Complementation Group N',
  611553: 'Noonan Syndrome 5',
  612555: 'Breast-Ovarian Cancer, Familial, Susceptibility to, 2',
  612591: 'Colorectal Cancer, Susceptibility to, 10',
  613013: 'Neuroblastoma, Susceptibility to, 2',
  613014: 'Neuroblastoma, Susceptibility to, 3',
  613224: 'Noonan Syndrome 6',
  613244: 'Lynch Syndrome 8',
  613254: 'Tuberous Sclerosis 2',
  613325: 'Rhabdoid Tumor Predisposition Syndrome 2',
  613348: 'Pancreatic Cancer, Susceptibility to, 3',
  613399: 'Breast-Ovarian Cancer, Familial, Susceptibility to, 3',
  613563: 'Noonan Syndrome-Like Disorder with or without Juvenile Myelomonocytic Leukemia',
  613951: 'Fanconi Anemia, Complementation Group P',
  613987: 'Dyskeratosis Congenita, Autosomal Recessive 2',
  613988: 'Dyskeratosis Congenita, Autosomal Recessive 3',
  613989: 'Dyskeratosis Congenita, Autosomal Dominant 2',
  614038: 'Lymphedema, Primary, with Myelodysplasia',
  614082: 'Fanconi Anemia, Complementation Group G',
  614083: 'Fanconi Anemia, Complementation Group L',
  614114: 'Mosaic Variegated Aneuploidy Syndrome 2',
  614165: 'Pheochromocytoma/Paraganglioma Syndrome 5',
  614172: 'Immunodeficiency 21',
  614291: 'Breast-Ovarian Cancer, Familial, Susceptibility to, 4',
  614327: 'Tumor Predisposition Syndrome 1',
  614337: 'Lynch Syndrome 4',
  614350: 'Lynch Syndrome 5',
  614742: 'Pulmonary Fibrosis And/Or Bone Marrow Failure Syndrome, Telomere-Related, 1',
  614743: 'Pulmonary Fibrosis And/Or Bone Marrow Failure Syndrome, Telomere-Related, 2',
  615083: 'Colorectal Cancer, Susceptibility to, 12',
  615190: 'Dyskeratosis Congenita, Autosomal Recessive 5',
  615545: 'Leukemia, Acute Lymphoblastic, Susceptibility to, 3',
  615670: 'Schwannomatosis 2',
  615848: 'Tumor Predisposition Syndrome 3',
  616216: 'Thrombocytopenia 5',
  616373: 'Pulmonary Fibrosis And/Or Bone Marrow Failure Syndrome, Telomere-Related, 3',
  616415: 'Familial Adenomatous Polyposis 3',
  616806: 'Wilms Tumor 6',
  616871: 'Myeloproliferative/Lymphoproliferative Neoplasms, Familial (multiple Types), Susceptibility to',
  617108: 'Sessile Serrated Polyposis Cancer Syndrome',
  617598: 'Mosaic Variegated Aneuploidy Syndrome 3',
  618846: 'Diets-Jongmans Syndrome',
  619096: 'Mismatch Repair Cancer Syndrome 2',
  619097: 'Mismatch Repair Cancer Syndrome 3',
  619101: 'Mismatch Repair Cancer Syndrome 4',
  619975: 'Tumor Predisposition Syndrome 2',
  620343: 'Basal Cell Nevus Syndrome 2',
  620442: 'Breast-Ovarian Cancer, Familial, Susceptibility to, 5',
  621332: 'Wilms Tumor 7',
  621687: 'Pheochromocytoma/Paraganglioma Syndrome 8'
};
const GENE_MIM = {
  DKC1: 300126, TINF2: 604319, SAMD9: 610456,
  DGCR8: 609030, JMJD1C: 604503, TBXT: 601397, IDH1: 147700, IDH2: 147650,
  AIP: 605555, ALK: 105590, ANKRD26: 610855, APC: 611731, ATM: 607585, BAP1: 603089, BARD1: 601593, BLM: 604610,
  BMPR1A: 601299, BRCA1: 113705, BRCA2: 600185, BRIP1: 605882, BUB1B: 602860, CBL: 165360, CDC73: 607393, CDH1: 192090,
  CDK4: 123829, CDKN1B: 600778, CDKN1C: 600856, CDKN2A: 600160, CEBPA: 116897, CEP57: 607951, CHEK2: 604373, CTNNA1: 116805,
  CTR9: 609366, DDB2: 600811, DDX41: 608170, DICER1: 606241, DIS3L2: 614184, ELP1: 603722, EPCAM: 185535, ERCC2: 126340,
  ERCC3: 133510, ERCC4: 133520, ERCC5: 133530, ETV6: 600618, EZH2: 601573, FANCA: 607139, FANCB: 300515, FANCC: 613899,
  FANCD2: 613984, FANCE: 613976, FANCF: 613897, FANCG: 602956, FANCI: 611360, FANCL: 608111, FANCM: 609644, FH: 136850,
  FLCN: 607273, GATA2: 137295, GNAS: 139320, GPC3: 300037, GPR161: 612250, GREM1: 603054, HRAS: 190020, KDM3B: 609373,
  KIT: 164920, KRAS: 190070, LZTR1: 600574, MAX: 154950, MBD4: 603574, MEN1: 613733, MET: 164860, MLH1: 120436,
  MSH2: 609309, MSH6: 600678, MUTYH: 604933, NBN: 602667, NF1: 613113, NF2: 607379, NHP2: 606470, NRAS: 164790,
  NSD1: 606681, NTHL1: 602656, PALB2: 610355, PAX5: 167414, PDGFRA: 173490, PDGFRB: 173410, PHOX2B: 603851, PMS2: 600259,
  POLD1: 174761, POLE: 174762, POLH: 603968, POT1: 606478, PRKAR1A: 188830, PTCH1: 601309, PTEN: 601728, PTPN11: 176876,
  RAD51C: 602774, RAD51D: 602954, RAF1: 164760, RB1: 614041, RECQL4: 603780, REST: 600571, RET: 164761, RHBDF2: 614404,
  RNF43: 612482, RTEL1: 608833, RUNX1: 151385, SAMD9L: 611170, SDHA: 600857, SDHAF2: 613019, SDHB: 185470, SDHC: 602413,
  SDHD: 602690, SHOC2: 602775, SLX4: 613278, SMAD4: 600993, SMARCA4: 603254, SMARCB1: 601607, SMARCE1: 603111, SOS1: 182530,
  STK11: 602216, SUFU: 607035, TERC: 602322, TERT: 187270, TMEM127: 613403, TP53: 191170, TRIM28: 601742, TRIM37: 605073,
  TRIP13: 604507, TSC1: 605284, TSC2: 191092, VHL: 608537, WRAP53: 612661, WRN: 604611, WT1: 607102, XPA: 611153,
  XPC: 613208
};
const REFS = {
  brca1: { gr: ['NBK1247'], omim: [604370] },
  brca2: { gr: ['NBK1247'], omim: [612555] },
  palb2: { gr: [], omim: [620442, 613348] },
  atm: { gr: ['NBK623002'], omim: [114480] },
  chek2: { gr: ['NBK615090'], omim: [609265] },
  bard1: { gr: [], omim: [114480] },
  rad51d: { gr: [], omim: [614291] },
  rad51c: { gr: [], omim: [613399] },
  brip1: { gr: [], omim: [114480] },
  lynch_mlh1: { gr: ['NBK1211'], omim: [609310, 158320] },
  lynch_msh2: { gr: ['NBK1211'], omim: [120435, 613244, 158320] },
  lynch_msh6: { gr: ['NBK1211'], omim: [614350] },
  lynch_pms2: { gr: ['NBK1211'], omim: [614337] },
  cmmrd: { gr: ['NBK1211'], omim: [276300, 619096, 619097, 619101] },
  fap: { gr: ['NBK1345'], omim: [175100] },
  map: { gr: ['NBK107219'], omim: [608456] },
  nthl1: { gr: ['NBK555473'], omim: [616415] },
  ppap: { gr: [], omim: [615083, 612591] },
  mbd4: { gr: ['NBK624097'], omim: [619975, 606660] },
  jps_smad4: { gr: ['NBK1469', 'NBK1351'], omim: [175050, 174900] },
  jps_bmpr1a: { gr: ['NBK1469'], omim: [174900] },
  hmps: { gr: [], omim: [601228] },
  rnf43: { gr: [], omim: [617108] },
  pjs: { gr: ['NBK1266'], omim: [175200] },
  phts: { gr: ['NBK1488'], omim: [158350] },
  hdgc: { gr: ['NBK1139'], omim: [137215] },
  ctnna1: { gr: ['NBK1139'], omim: [] },
  tylosis: { gr: [], omim: [148500] },
  lfs: { gr: ['NBK1311'], omim: [151623] },
  men1: { gr: ['NBK1538'], omim: [131100] },
  men4: { gr: ['NBK594826'], omim: [610755] },
  men2: { gr: ['NBK1257'], omim: [171400, 162300, 155240] },
  hptjt: { gr: ['NBK3789'], omim: [145001, 608266] },
  fipa: { gr: ['NBK97965'], omim: [102200] },
  carney: { gr: ['NBK1286'], omim: [160980] },
  mas: { gr: ['NBK274564'], omim: [174800] },
  vhl: { gr: ['NBK1463'], omim: [193300] },
  sdhb: { gr: ['NBK1548'], omim: [115310] },
  sdhd: { gr: ['NBK1548'], omim: [168000] },
  sdhc: { gr: ['NBK1548'], omim: [605373] },
  sdha: { gr: ['NBK1548'], omim: [614165] },
  sdhaf2: { gr: ['NBK1548'], omim: [601650] },
  tmem127: { gr: ['NBK1548'], omim: [621687] },
  max: { gr: ['NBK1548'], omim: [171300] },
  hlrcc: { gr: ['NBK1252'], omim: [150800] },
  bhd: { gr: ['NBK1522'], omim: [135150] },
  hprc: { gr: [], omim: [605074] },
  tsc: { gr: ['NBK1220'], omim: [191100, 613254] },
  bap1: { gr: ['NBK390611'], omim: [614327] },
  cdkn2a: { gr: ['NBK616232'], omim: [155601, 606719] },
  cdk4: { gr: [], omim: [609048] },
  pot1: { gr: ['NBK563529'], omim: [615848] },
  gorlin: { gr: ['NBK1151'], omim: [109400] },
  sufu: { gr: ['NBK1151'], omim: [620343, 155255] },
  xp: { gr: ['NBK1397'], omim: [278700, 610651, 278720, 278730, 278740, 278760, 278780, 278750] },
  nf1: { gr: ['NBK1109'], omim: [162200] },
  nf2: { gr: ['NBK1201'], omim: [101000] },
  smarcb1: { gr: ['NBK469816', 'NBK487394'], omim: [609322, 162091] },
  lztr1: { gr: ['NBK487394'], omim: [615670] },
  smarca4: { gr: ['NBK469816'], omim: [613325] },
  smarce1: { gr: [], omim: [607174] },
  elp1: { gr: [], omim: [155255] },
  gpr161: { gr: [], omim: [155255] },
  dicer1: { gr: ['NBK196157'], omim: [601200, 138800] },
  rb1: { gr: ['NBK1452'], omim: [180200] },
  wt1: { gr: ['NBK1294', 'NBK556455'], omim: [194070, 194080, 136680, 194072] },
  wilms_other: { gr: ['NBK1294'], omim: [616806, 621332] },
  perlman: { gr: [], omim: [267000] },
  mulibrey: { gr: [], omim: [253250] },
  mva: { gr: [], omim: [257300, 614114, 617598] },
  bws: { gr: ['NBK1394'], omim: [130650] },
  sgbs: { gr: ['NBK1219'], omim: [312870] },
  sotos: { gr: ['NBK1479'], omim: [117550] },
  weaver: { gr: ['NBK148820'], omim: [277590] },
  alk: { gr: ['NBK24599'], omim: [613014] },
  phox2b: { gr: ['NBK1427'], omim: [613013, 209880] },
  noonan: { gr: ['NBK1124'], omim: [163950, 609942, 610733, 611553, 613224, 607721] },
  cbl: { gr: [], omim: [613563] },
  costello: { gr: ['NBK1507'], omim: [218040] },
  kit: { gr: ['NBK625142'], omim: [606764] },
  pdgfra: { gr: ['NBK625142'], omim: [175510] },
  pdgfrb: { gr: [], omim: [228550] },
  fancm: { gr: [], omim: [] },
  fanconi: { gr: ['NBK1401'], omim: [227650, 300514, 227645, 605724, 227646, 600901, 603467, 614082, 609053, 609054, 614083, 610832, 613951] },
  at: { gr: ['NBK26468'], omim: [208900] },
  nbs: { gr: ['NBK1176'], omim: [251260] },
  bloom: { gr: ['NBK1398'], omim: [210900] },
  rts: { gr: ['NBK1237'], omim: [268400] },
  werner: { gr: ['NBK1514'], omim: [277700] },
  cebpa: { gr: ['NBK47457'], omim: [601626] },
  runx1: { gr: ['NBK568319'], omim: [601399] },
  gata2: { gr: [], omim: [614172, 614038] },
  ddx41: { gr: ['NBK574843'], omim: [616871] },
  etv6: { gr: ['NBK564234'], omim: [616216] },
  ankrd26: { gr: ['NBK507664'], omim: [188000] },
  samd9l: { gr: ['NBK435692'], omim: [159550, 617053, 619041] },
  pax5: { gr: [], omim: [615545] },
  kdm3b: { gr: ['NBK1294'], omim: [618846] },
  dgcr8: { gr: [], omim: [] },
  jmjd1c: { gr: [], omim: [] },
  tbxt: { gr: [], omim: [215400] },
  ollier: { gr: [], omim: [166000, 614569] },
  tbd: { gr: ['NBK22301'], omim: [127550, 613989, 224230, 613987, 615190, 613988, 614742, 614743, 616373, 305000, 613990] }
};

/*
 * Evidence for tumour associations. Each rule may carry two extra elements:
 *   [..., src, risk] – src lists source keys, risk is an optional short risk figure.
 * Source keys: gr:<NBK> (GeneReviews), ukcgg:<GUIDES key>, eu:<EU_GUIDES key>, us:<US_GUIDES key>,
 * clingen:<GENE> (ClinGen gene–disease validity), canvar:<GENE> (CanVar-UK), or a key in EVIDENCE.
 * EVIDENCE: key → [short label, full citation, DOI / PubMed URL]. Only sources read in full or as abstract.
 */
const EVIDENCE = {
  aacr_vhl_ppgl2017: ['AACR VHL/PPGL 2017', 'Rednam SP, Erez A, Druker H, et al. Von Hippel-Lindau and Hereditary Pheochromocytoma/Paraganglioma Syndromes: Clinical Features, Genetics, and Surveillance Recommendations in Childhood. Clin Cancer Res 2017;23(12):e68-e75', 'https://pubmed.ncbi.nlm.nih.gov/28620007/'],
  acmg_chek2: ['ACMG CHEK2 2023', 'Hanson H et al. Management of individuals with germline pathogenic/likely pathogenic variants in CHEK2: a clinical practice resource of the ACMG. Genet Med 2023;25(10):100870', 'https://doi.org/10.1016/j.gim.2023.100870'],
  alter2018: ['Alter 2018', 'Alter BP et al. Cancer in the National Cancer Institute inherited bone marrow failure syndrome cohort after fifteen years of follow-up. Haematologica 2018', 'https://doi.org/10.3324/haematol.2017.178111'],
  amary2011: ['Amary 2011', 'Amary MF et al. Ollier disease and Maffucci syndrome are caused by somatic mosaic mutations of IDH1 and IDH2. Nat Genet 2011', 'https://doi.org/10.1038/ng.994'],
  andrews2018: ['Andrews 2018', 'Andrews KA et al. Tumour risks and genotype-phenotype correlations associated with germline variants in succinate dehydrogenase subunit genes SDHB, SDHC and SDHD. J Med Genet 2018;55:384-394', 'https://doi.org/10.1136/jmedgenet-2017-105127'],
  armaizpena2021: ['Armaiz-Pena 2021', 'Armaiz-Pena G et al. Genotype-phenotype features of germline variants of the TMEM127 pheochromocytoma susceptibility gene: a 10-year update. J Clin Endocrinol Metab 2021;106:e350-e364', 'https://doi.org/10.1210/clinem/dgaa741'],
  astiazaran2023: ['Astiazaran-Symonds 2023', 'Astiazaran-Symonds E et al. Cancer in Costello syndrome: a systematic review and meta-analysis. Br J Cancer 2023', 'https://doi.org/10.1038/s41416-023-02229-7'],
  bausch2017: ['Bausch 2017', 'Bausch B et al. Clinical characterization of the pheochromocytoma and paraganglioma susceptibility genes SDHA, TMEM127, MAX, and SDHAF2 for gene-informed prevention. JAMA Oncol 2017;3:1204-1212', 'https://doi.org/10.1001/jamaoncol.2017.0223'],
  begemann2020: ['Begemann 2020', 'Begemann M et al. Germline GPR161 Mutations Predispose to Pediatric Medulloblastoma. J Clin Oncol 2020;38:43-50', 'https://doi.org/10.1200/JCO.19.00577'],
  burnichon2012: ['Burnichon 2012', 'Burnichon N et al. MAX mutations cause hereditary and sporadic pheochromocytoma and paraganglioma. Clin Cancer Res 2012;18:2828-37', 'https://doi.org/10.1158/1078-0432.CCR-12-0160'],
  cheung2013: ['Cheung 2013', 'Cheung YH et al. Mutations in PDGFRB cause autosomal-dominant infantile myofibromatosis. Am J Hum Genet 2013', 'https://doi.org/10.1016/j.ajhg.2013.04.024'],
  comino2011: ['Comino-Méndez 2011', 'Comino-Méndez I et al. Exome sequencing identifies MAX mutations as a cause of hereditary pheochromocytoma. Nat Genet 2011;43:663-7', 'https://doi.org/10.1038/ng.861'],
  deandrade2021: ['de Andrade 2021', 'de Andrade KC et al. Cancer incidence, patterns, and genotype-phenotype associations in individuals with pathogenic or likely pathogenic germline TP53 variants: an observational cohort study. Lancet Oncol 2021', 'https://doi.org/10.1016/s1470-2045(21)00580-5'],
  diets2019: ['Diets 2019', 'Diets IJ et al. De novo and inherited pathogenic variants in KDM3B cause intellectual disability, short stature, and facial dysmorphism. Am J Hum Genet 2019', 'https://doi.org/10.1016/j.ajhg.2019.02.023'],
  dorling2021: ['Dorling 2021 (BCAC)', 'Breast Cancer Association Consortium (Dorling L et al). Breast cancer risk genes - association analysis in more than 113,000 women. N Engl J Med 2021', 'https://doi.org/10.1056/NEJMoa1913948'],
  ellis2015: ['Ellis 2015', 'Ellis A, Risk JM, Maruthappu T, Kelsell DP. Tylosis with oesophageal cancer: diagnosis, management and molecular mechanisms. Orphanet J Rare Dis 2015;10:126', 'https://doi.org/10.1186/s13023-015-0346-2'],
  ern_cmmrd2024: ['ERN GENTURIS 2024', 'ERN GENTURIS guidelines on constitutional mismatch repair deficiency diagnosis, genetic counselling, surveillance, quality of life, and clinical management. Eur J Hum Genet 2024 (PMID 39420201)', 'https://doi.org/10.1038/s41431-024-01708-6'],
  fortuno2024: ['Fortuno 2024', 'Fortuno C et al. Cancer risks associated with TP53 pathogenic variants: maximum likelihood analysis of extended pedigrees for diagnosis of first cancers beyond the Li-Fraumeni syndrome spectrum. JCO Precis Oncol 2024', 'https://doi.org/10.1200/po.23.00453'],
  homan2021: ['Homan 2021', 'Homan CC et al. GATA2 deficiency syndrome: A decade of discovery. Hum Mutat 2021', 'https://doi.org/10.1002/humu.24271'],
  hu2021: ['Hu 2021', 'Hu C et al (CARRIERS). A population-based study of genes previously implicated in breast cancer. N Engl J Med 2021', 'https://doi.org/10.1056/NEJMoa2005936'],
  jaeger2012: ['Jaeger 2012', 'Jaeger E et al. Hereditary mixed polyposis syndrome is caused by a 40-kb upstream duplication that leads to increased and ectopic expression of the BMP antagonist GREM1. Nat Genet 2012;44:699-703', 'https://doi.org/10.1038/ng.2263'],
  kempers2011: ['Kempers 2011', 'Kempers MJ et al. Risk of colorectal and endometrial cancers in EPCAM deletion-positive Lynch syndrome: a cohort study. Lancet Oncol 2011;12:49-55', 'https://doi.org/10.1016/S1470-2045(10)70265-5'],
  kratz2015: ['Kratz 2015', 'Kratz CP et al. Cancer spectrum and frequency among children with Noonan, Costello, and cardio-facio-cutaneous syndromes. Br J Cancer 2015;112:1392-7', 'https://doi.org/10.1038/bjc.2015.75'],
  kuchenbaecker2017: ['Kuchenbaecker 2017', 'Kuchenbaecker KB et al. Risks of breast, ovarian, and contralateral breast cancer for BRCA1 and BRCA2 mutation carriers. JAMA 2017', 'https://doi.org/10.1001/jama.2017.7112'],
  li2022: ['Li 2022', 'Li S et al (CIMBA). Cancer risks associated with BRCA1 and BRCA2 pathogenic variants. J Clin Oncol 2022', 'https://doi.org/10.1200/JCO.21.02112'],
  mahamdallie2019: ['Mahamdallie 2019', 'Mahamdallie S et al. Identification of new Wilms tumour predisposition genes: an exome sequencing study. Lancet Child Adolesc Health 2019', 'https://doi.org/10.1016/S2352-4642(19)30018-5'],
  martignetti2013: ['Martignetti 2013', 'Martignetti JA et al. A recurrent PDGFRB mutation causes familial infantile myofibromatosis. Am J Hum Genet 2013', 'https://doi.org/10.1016/j.ajhg.2013.04.026'],
  mur2023: ['Mur 2023', 'Mur P et al. Recommendations for the classification of germline variants in the exonuclease domain of POLE and POLD1. Genome Med 2023;15:85', 'https://doi.org/10.1186/s13073-023-01234-y'],
  nccn_bop2021: ['NCCN BOP 2021', 'Daly MB et al. Genetic/Familial High-Risk Assessment: Breast, Ovarian, and Pancreatic, Version 2.2021, NCCN Clinical Practice Guidelines in Oncology. J Natl Compr Canc Netw 2021;19(1):77-102', 'https://doi.org/10.6004/jnccn.2021.0001'],
  nccn_ceg2024: ['NCCN CEG 2024', 'Hodan R et al. Genetic/Familial High-Risk Assessment: Colorectal, Endometrial, and Gastric, Version 3.2024, NCCN Clinical Practice Guidelines in Oncology. J Natl Compr Canc Netw 2024;22(10):695-711', 'https://doi.org/10.6004/jnccn.2024.0061'],
  nccn_gist_taskforce2010: ['NCCN GIST 2010', 'Demetri GD et al. NCCN Task Force report: update on the management of patients with gastrointestinal stromal tumors. J Natl Compr Canc Netw 2010;8 Suppl 2:S1-41', 'https://doi.org/10.6004/jnccn.2010.0116'],
  nccn_insights_kidney2021: ['NCCN Kidney 2021', 'Motzer RJ, Jonasch E, Boyle S, et al. NCCN Guidelines Insights: Kidney Cancer, Version 1.2021. J Natl Compr Canc Netw 2020;18(9):1160-1170', 'https://doi.org/10.6004/jnccn.2020.0043'],
  nccn_kidney2022: ['NCCN Kidney 2022', 'Motzer RJ, Jonasch E, Agarwal N, et al. Kidney Cancer, Version 3.2022, NCCN Clinical Practice Guidelines in Oncology. J Natl Compr Canc Netw 2022;20(1):71-90', 'https://doi.org/10.6004/jnccn.2022.0001'],
  niemeyer2010: ['Niemeyer 2010', 'Niemeyer CM et al. Germline CBL mutations cause developmental abnormalities and predispose to juvenile myelomonocytic leukemia. Nat Genet 2010;42:794-800', 'https://doi.org/10.1038/ng.641'],
  nynas2025: ['Nynäs 2025', 'Nynäs E et al. Recessive FANCM cancer syndrome with high cancer risks, chemotherapy toxicity, chromosome fragility, and gonadal failure. Genet Med 2025;27:101521', 'https://doi.org/10.1016/j.gim.2025.101521'],
  otherpolyposis2026: ['Liesegang 2026', 'Liesegang et al. The \'other\' colonic polyposis syndromes - evolving insights and guidance for endoscopists. Int J Colorectal Dis 2026', 'https://doi.org/10.1007/s00384-026-05186-8'],
  palles2022mbd4: ['Palles 2022 (MBD4)', 'Palles C et al. Germline MBD4 deficiency causes a multi-tumor predisposition syndrome. Am J Hum Genet 2022;109:953-960', 'https://doi.org/10.1016/j.ajhg.2022.03.018'],
  palles2022ppap: ['Palles 2021 (PPAP)', 'Palles C et al. The clinical features of polymerase proof-reading associated polyposis (PPAP) and recommendations for patient management. Fam Cancer 2022;21:197-209', 'https://doi.org/10.1007/s10689-021-00256-y'],
  pansuriya2011: ['Pansuriya 2011', 'Pansuriya TC et al. Somatic mosaic IDH1 and IDH2 mutations are associated with enchondroma and spindle cell hemangioma in Ollier disease and Maffucci syndrome. Nat Genet 2011', 'https://doi.org/10.1038/ng.1004'],
  plsd2020: ['Dominguez-Valentin 2020', 'Dominguez-Valentin M et al. Cancer risks by gene, age, and gender in 6350 carriers of pathogenic mismatch repair variants: findings from the Prospective Lynch Syndrome Database. Genet Med 2020;22:15-25', 'https://doi.org/10.1038/s41436-019-0596-9'],
  plsd2023: ['Dominguez-Valentin 2023', 'Dominguez-Valentin M et al. Mortality by age, gene and gender in carriers of pathogenic mismatch repair gene variants receiving surveillance: a report from the Prospective Lynch Syndrome Database. eClinicalMedicine 2023;58:101909', 'https://doi.org/10.1016/j.eclinm.2023.101909'],
  puntervoll2013: ['Puntervoll 2013', 'Puntervoll HE et al. Melanoma prone families with CDK4 germline mutation: phenotypic profile and associations with MC1R variants. J Med Genet 2013;50:264-70', 'https://doi.org/10.1136/jmedgenet-2012-101455'],
  ramus2015: ['Ramus 2015', 'Ramus SJ et al. Germline mutations in the BRIP1, BARD1, PALB2, and NBN genes in women with ovarian cancer. J Natl Cancer Inst 2015', 'https://doi.org/10.1093/jnci/djv214'],
  rebbeck2015: ['Rebbeck 2015', 'Rebbeck TR et al. Association of type and location of BRCA1 and BRCA2 mutations with risk of breast and ovarian cancer. JAMA 2015', 'https://doi.org/10.1001/jama.2014.5985'],
  rivera2020: ['Rivera 2020', 'Rivera B et al. DGCR8 microprocessor defect characterizes familial multinodular goiter with schwannomatosis. J Clin Invest 2020;130:1479-90', 'https://doi.org/10.1172/JCI130206'],
  rnf43gut2026: ['Palles 2025 (Gut)', 'Palles C et al. Comparison between germline and somatic loss-of-function RNF43 mutations reveals different genotype-phenotype associations. Gut 2026 (CORGI/100kGP/UK Biobank)', 'https://doi.org/10.1136/gutjnl-2025-337030'],
  schmidt1997: ['Schmidt 1997', 'Schmidt L et al. Germline and somatic mutations in the tyrosine kinase domain of the MET proto-oncogene in papillary renal carcinomas. Nat Genet 1997;16:68-73', 'https://doi.org/10.1038/ng0597-68'],
  schmidt2004: ['Schmidt 2004', 'Schmidt LS et al. Early onset hereditary papillary renal carcinoma: germline missense mutations in the tyrosine kinase domain of the met proto-oncogene. J Urol 2004;172:1256-61', 'https://doi.org/10.1097/01.ju.0000139583.63354.e0'],
  schonfeld2021: ['Schonfeld 2021', 'Schonfeld SJ, Kleinerman RA et al. Long-term risk of subsequent cancer incidence among hereditary and nonhereditary retinoblastoma survivors. Br J Cancer 2021;124:1312-1319', 'https://doi.org/10.1038/s41416-020-01248-y'],
  shah2013: ['Shah 2013', 'Shah S et al. A recurrent germline PAX5 mutation confers susceptibility to pre-B cell acute lymphoblastic leukemia. Nat Genet 2013', 'https://doi.org/10.1038/ng.2754'],
  singeisen2023: ['Singeisen 2023', 'Singeisen H et al. Multiple endocrine neoplasia type 4: a new member of the MEN family. Endocr Connect 2023', 'https://doi.org/10.1530/ec-22-0411'],
  smith2013: ['Smith 2013', 'Smith MJ et al. Loss-of-function mutations in SMARCE1 cause an inherited disorder of multiple spinal meningiomas. Nat Genet 2013;45:295-8', 'https://doi.org/10.1038/ng.2552'],
  spinner2014: ['Spinner 2014', 'Spinner MA et al. GATA2 deficiency: a protean disorder of hematopoiesis, lymphatics, and immunity. Blood 2014', 'https://doi.org/10.1182/blood-2013-07-515528'],
  tenbroeke2018: ['ten Broeke 2018', 'ten Broeke SW et al. Cancer risks for PMS2-associated Lynch syndrome. J Clin Oncol 2018;36:2961-8', 'https://doi.org/10.1200/JCO.2018.78.4777'],
  tsoulaki2025: ['Tsoulaki 2025', 'Tsoulaki O et al. UK clinical practice guidelines for the management of patients with constitutional POT1 pathogenic variants. J Med Genet 2025', 'https://doi.org/10.1136/jmg-2025-110638'],
  verdegaal2011: ['Verdegaal 2011', 'Verdegaal SH et al. Incidence, predictive factors, and prognosis of chondrosarcoma in patients with Ollier disease and Maffucci syndrome: an international multicenter study of 161 patients. Oncologist 2011', 'https://doi.org/10.1634/theoncologist.2011-0200'],
  wang2014: ['Wang 2014', 'Wang L et al. Novel somatic and germline mutations in intracranial germ cell tumours. Nature 2014;511:241-5', 'https://doi.org/10.1038/nature13296'],
  waszak2018: ['Waszak 2018', 'Waszak SM et al. Spectrum and prevalence of genetic predisposition in medulloblastoma. Lancet Oncol 2018', 'https://doi.org/10.1016/S1470-2045(18)30242-0'],
  waszak2020: ['Waszak 2020', 'Waszak SM et al. Germline Elongator mutations in Sonic Hedgehog medulloblastoma. Nature 2020;580:396-401', 'https://doi.org/10.1038/s41586-020-2164-5'],
  weberlasselle2018: ['Weber-Lassalle 2018', 'Weber-Lassalle N et al. BRIP1 loss-of-function mutations confer high risk for familial ovarian cancer, but not familial breast cancer. Breast Cancer Res 2018', 'https://doi.org/10.1186/s13058-018-0935-9'],
  who2022: ['WHO 2022 (Khoury)', 'Khoury JD et al. The 5th edition of the WHO Classification of Haematolymphoid Tumours: Myeloid and Histiocytic/Dendritic Neoplasms. Leukemia 2022', 'https://doi.org/10.1038/s41375-022-01613-1'],
  yang2009: ['Yang 2009', 'Yang XR et al. T (brachyury) gene duplication confers major susceptibility to familial chordoma. Nat Genet 2009', 'https://doi.org/10.1038/ng.454'],
  yang2020palb2: ['Yang 2020', 'Yang X et al. Cancer risks associated with germline PALB2 pathogenic variants: an international study of 524 families. J Clin Oncol 2020', 'https://doi.org/10.1200/JCO.19.01907'],
  yang2020rad51: ['Yang 2020', 'Yang X et al. Ovarian and breast cancer risks associated with pathogenic variants in RAD51C and RAD51D. J Natl Cancer Inst 2020', 'https://doi.org/10.1093/jnci/djaa030']
};

/* Short labels for guideline keys shown in the evidence column. */
const EV_SHORT = { bsg: 'BSG 2019', cg164: 'NICE CG164', hanson: 'Hanson 2023', haemconsensus: 'UK haem consensus', tp53: 'UKCGG TP53', mangen_nf1: 'Manchester NF1',
  ata_men2: 'ATA 2015', bws_consensus: 'BWS consensus 2018', sdhx_consensus: 'SDHx consensus 2021', carney_nih: 'Stratakis 2001',
  endo_men1: 'Thakker 2012', nf1_criteria: 'NF1 criteria 2021', sccoht: 'SCCOHT guideline 2020', bap1_eu: 'BAP1 guideline 2023',
  bcns_eu: 'BCNS guideline 2022', igclc_hdgc: 'IGCLC 2020' };

/* Variant-level (genotype–phenotype) notes per condition: [text, [source keys]]. Information only, not scored. */
const VARIANT_NOTES = {
  fancm: [
    ['Finnish-enriched truncating variants c.5101C>T p.(Gln1701Ter) and c.5791C>T p.(Arg1931Ter); homozygous c.5101C>T carries high risks of breast, head and neck, gastrointestinal, gynaecological, haematological, skin and lung cancer, plus ovarian dysfunction and haematological toxicity after cancer treatment.', ['nynas2025']],
    ['Heterozygous FANCM truncating variants confer only a modest breast cancer risk (c.5101C>T OR 1.24) and are not managed as this syndrome; ClinGen rates FANCM–hereditary breast cancer as Limited.', ['nynas2025', 'clingen:FANCM']]
  ],
  brca1: [
    ['BRCA1 ovarian cancer cluster region (OCCR, c.1380-c.4062, ~exon 11) carries a relatively higher ovarian:breast risk ratio; breast cancer cluster regions (c.179-c.505, c.4328-c.4945, c.5261-c.5563) carry relatively higher breast risk. Breast risk was lower for variants within c.2282-c.4071 in a prospective cohort.', ['rebbeck2015', 'kuchenbaecker2017', 'gr:NBK1247']],
    ['Ashkenazi Jewish founder variants BRCA1 c.68_69delAG (185delAG) and c.5266dupC (5382insC), with BRCA2 c.5946delT, account for up to 99% of BRCA1/2 PVs in Ashkenazi Jewish individuals (carrier frequency ~1 in 40).', ['gr:NBK1247']],
    ['BRCA1 p.Arg1699Gln is a reduced-penetrance (intermediate-risk) allele: cumulative breast or ovarian cancer risk ~24% by 70.', ['gr:NBK1247']],
    ['Biallelic BRCA1 pathogenic variants cause Fanconi anaemia complementation group S (ClinGen Definitive, AR).', ['clingen:BRCA1', 'gr:NBK1247']]
  ],
  brca2: [
    ['BRCA2 ovarian cancer cluster regions OCCR1 (c.3249-c.5681, adjacent to c.5946delT) and OCCR2 (c.6645-c.7471) carry a relatively higher ovarian:breast risk ratio; breast cancer cluster regions (c.1-c.596, c.772-c.1806, c.7394-c.8904) carry relatively higher breast risk. Breast risk was lower for variants within c.2831-c.6401 in a prospective cohort.', ['rebbeck2015', 'kuchenbaecker2017', 'gr:NBK1247']],
    ['Ashkenazi Jewish founder variant BRCA2 c.5946delT (6174delT); together with the two BRCA1 founders it accounts for up to 99% of BRCA1/2 PVs in Ashkenazi Jewish individuals.', ['gr:NBK1247']],
    ['Biallelic BRCA2 pathogenic variants cause Fanconi anaemia complementation group D1 (ClinGen Definitive, AR), with very high risk of early childhood cancers including leukaemia and solid tumours.', ['clingen:BRCA2', 'gr:NBK1247']],
    ['In CIMBA, the BRCA2 stomach cancer relative risk was higher in female (6.89) than male (2.76) carriers, though absolute risks were similar.', ['li2022']]
  ],
  palb2: [
    ['Biallelic PALB2 pathogenic variants cause Fanconi anaemia complementation group N (ClinGen Definitive, AR).', ['clingen:PALB2']],
    ['PALB2 breast cancer relative risk falls with age (RR 7.18 overall), and both breast and ovarian risks are strongly modified by family history (ovarian up to ~16% with mother and sister affected at 50).', ['yang2020palb2', 'ukcgg:hanson']]
  ],
  atm: [
    ['ATM c.7271T>G (p.Val2424Gly) carries a higher breast cancer risk than other ATM GPVs: OR 3.76, ~52% by 70 and ~60% by 80. It is also linked to prostate cancer (RR 4.84, UK Biobank). UKCGG recommends very-high-risk (VHR) breast screening for carriers. CanRisk underestimates the risk from this variant.', ['ukcgg:atm', 'gr:NBK623002']],
    ['Missense ATM GPVs other than c.7271T>G generally carry lower breast cancer risk than protein-truncating variants. UKCGG advises that screening be based on family history and that predictive testing is not generally indicated.', ['ukcgg:atm']],
    ['Biallelic ATM pathogenic variants cause ataxia-telangiectasia, with high risk of haematological malignancy and early-onset breast cancer. Mothers of children with A-T should be offered at least moderate-risk breast surveillance.', ['ukcgg:atm', 'gr:NBK623002', 'clingen:ATM']]
  ],
  chek2: [
    ['CHEK2 c.1100delC (p.Thr367MetfsTer15) breast cancer OR is ~2.5-2.7. The missense variants c.470T>C (p.Ile157Thr) and c.1283C>T (p.Ser428Phe) are low-risk alleles (OR <1.5; I157T OR 1.30 in CARRIERS) and in isolation should not change management. c.1427C>T (p.Thr476Met) has also been suggested to be lower risk.', ['ukcgg:chek2', 'gr:NBK615090', 'hu2021']],
    ['The missense CHEK2 c.349A>G p.(Arg117Gly) has a breast cancer risk similar to truncating variants (OR 2.69).', ['ukcgg:chek2']],
    ['Biallelic CHEK2 carriers (e.g. c.1100delC homozygotes) have higher risks of invasive, earlier (≤50) and multiple primary breast cancers. UKCGG recommends very-high-risk (VHR) screening for biallelic carriers of truncating or equivalent-risk variants.', ['ukcgg:chek2', 'gr:NBK615090']],
    ['c.1100delC is a northern European founder variant (~1% in the Netherlands). The Polish founder c.444+1G>A is the main source of the papillary thyroid signal.', ['gr:NBK615090']],
    ['A low-level (mosaic) CHEK2 variant in blood is common and suggests clonal haematopoiesis (CHIP) rather than a constitutional variant.', ['gr:NBK615090']],
    ['CHEK2 is not a Li-Fraumeni syndrome gene. ClinGen has refuted a CHEK2 link to familial ovarian cancer.', ['ukcgg:chek2', 'clingen:CHEK2']]
  ],
  bard1: [
    ['BARD1 breast risk is confined to protein-truncating variants (OR 2.09). Non-truncating variants show no excess risk (OR 1.00), and NHS labs usually report only PTVs. The recurrent exon 10 c.1935_1954dup (p.Glu652fs) escapes NMD but carries a similar or higher risk (OR 3.25).', ['ukcgg:bard1']],
    ['BARD1 is not clearly associated with ovarian cancer; ClinGen classes the BARD1-familial ovarian cancer link as Disputed. Male breast risk is uncertain (OR 3.55, CI 0.90-10.13).', ['ukcgg:bard1', 'clingen:BARD1']]
  ],
  rad51d: [
    ['RAD51D cancer risks apply to truncating variants. No breast cancer association has been shown for missense variants (BCAC missense OR 1.05).', ['ukcgg:rad51d', 'ukcgg:hanson']],
    ['RAD51D ovarian and breast risks are strongly modified by family history. Tubo-ovarian risk reaches 32-36% with two affected first-degree relatives and is largely after age 50. UKCGG suggests considering RRSO from 50 when lifetime risk is ≥5%.', ['ukcgg:rad51d', 'ukcgg:hanson', 'yang2020rad51']]
  ],
  rad51c: [
    ['RAD51C cancer risks apply to truncating variants. No breast cancer association has been shown for missense variants (BCAC missense OR 0.9).', ['ukcgg:rad51c', 'ukcgg:hanson']],
    ['RAD51C ovarian and breast risks are strongly modified by family history. Tubo-ovarian risk reaches 32-36% with two affected first-degree relatives and is largely after age 50. UKCGG suggests considering RRSO from 50 when lifetime risk is ≥5%.', ['ukcgg:rad51c', 'ukcgg:hanson', 'yang2020rad51']],
    ['Biallelic RAD51C variants have been reported with a Fanconi anaemia-like phenotype (FA complementation group O), but ClinGen rates this link only as Limited.', ['clingen:RAD51C']]
  ],
  brip1: [
    ['BRIP1 is not a breast cancer gene. ClinGen has refuted the link to hereditary breast carcinoma (BCAC PTV OR 1.11). UKCGG says breast surveillance should follow family history, not carrier status.', ['ukcgg:brip1', 'ukcgg:hanson', 'clingen:BRIP1', 'weberlasselle2018']],
    ['BRIP1 ovarian risk is linked to both truncating and missense pathogenic variants. Onset is late: mean or median age at diagnosis is 63-65, and risk is highest after 50.', ['ukcgg:brip1', 'weberlasselle2018']],
    ['Biallelic BRIP1 pathogenic variants cause Fanconi anaemia complementation group J (ClinGen Definitive, AR).', ['clingen:BRIP1', 'ukcgg:brip1']]
  ],
  lynch_mlh1: [
    ['MLH1 and MSH2 carry the highest colorectal risks (~50% by 75) with median CRC age 47-56; MLH1 has lower extracolonic (urothelial, brain, prostate) risks than MSH2, and brain tumour risk is not raised above population for MLH1.', ['ukcgg:mlh1', 'plsd2020', 'gr:NBK1211']],
    ['Constitutional MLH1 epimutation (germline promoter methylation) is a rare cause of Lynch syndrome: tumours show MLH1 methylation, so it mimics sporadic cancer. It is usually a simplex (non-inherited) case, and it is not detected by sequencing or MLPA. Consider methylation testing of blood when CRC at age 55 or under has tumour MLH1 promoter methylation, or when there are synchronous or metachronous methylated Lynch cancers.', ['gr:NBK1211']],
    ['Founder MLH1 variants are reported, e.g. Finnish c.454-1G>A and the exon 16 deletion (c.1731+2247_1897-402del), plus others in Italy, Quebec, the Manitoba Mennonites (c.2141G>A) and East Asia.', ['gr:NBK1211']],
    ['Biallelic MLH1 pathogenic variants cause CMMRD (childhood brain tumours, haematological malignancy, early CRC). Offspring are at risk when both parents carry a variant in the same MMR gene.', ['gr:NBK1211', 'clingen:MLH1', 'ern_cmmrd2024']]
  ],
  lynch_msh2: [
    ['MSH2 carries the broadest extracolonic spectrum: upper urinary tract (~16-20% by 75), prostate, ovarian, brain (glioblastoma), sebaceous and adrenocortical tumours. MSH2 should be favoured over MLH1 when these tumours occur in a family.', ['ukcgg:msh2', 'gr:NBK1211', 'plsd2020']],
    ['EPCAM 3\' deletions silence MSH2 by methylation, but only in EPCAM-expressing tissues. CRC risk is MSH2-like (~75% by 70, mean age 43), while endometrial risk is low (~12%) unless the deletion extends close to or into MSH2. UK guidance (BSG) is to manage these carriers as MSH2.', ['kempers2011', 'gr:NBK1211', 'ukcgg:bsg']],
    ['Founder variants: MSH2 c.942+3A>T (recurrent worldwide), c.1906G>C p.Ala636Pro (Ashkenazi Jewish), the Newfoundland exon 8 deletion, a deletion of exons 1-6 in the United States, and the Dutch, Spanish and Italian EPCAM exon 8-9 deletions.', ['gr:NBK1211']],
    ['Biallelic MSH2 variants cause CMMRD. Biallelic EPCAM variants instead cause congenital tufting enteropathy, not cancer predisposition.', ['gr:NBK1211', 'clingen:MSH2']]
  ],
  lynch_msh6: [
    ['MSH6 is predominantly an endometrial cancer gene: risk ~46% by 75, comparable with MLH1 and MSH2, but it occurs later (median age 60-62). CRC risk is modest (~16% by 75, median age 55-60). Prostate, gastric, biliary and brain risks are similar to the population, which is why colonoscopy starts at 35 rather than 25.', ['ukcgg:msh6', 'plsd2020', 'gr:NBK1211', 'ukcgg:bsg']],
    ['MSH6-deficient tumours have fewer indels and lower-level MSI, so MSI testing can miss them. IHC (isolated MSH6 loss) is more sensitive.', ['gr:NBK1211']],
    ['Founder MSH6 variants include c.3959_3962delCAAG (Ashkenazi Jewish), c.2983G>T (Finland), c.1346T>C (Sweden) and several Dutch variants.', ['gr:NBK1211']],
    ['Biallelic MSH6 accounts for over 20% of CMMRD. Because heterozygote penetrance is low, these children often have no family history of Lynch cancers.', ['ern_cmmrd2024', 'clingen:MSH6']]
  ],
  lynch_pms2: [
    ['PMS2 is the lowest-penetrance Lynch gene. Only colorectal and endometrial risks are clearly raised; ovarian, gastric, hepatobiliary, pancreatic, bladder, brain, small bowel and prostate risks are not consistently raised. The median CRC age (66-71) is close to the population, and metachronous CRC risk is negligible.', ['ukcgg:pms2', 'tenbroeke2018', 'gr:NBK1211']],
    ['Because of pseudogene homology (PMS2CL), PMS2 testing needs specialist methods such as long-range PCR or cDNA analysis. Large rearrangements make up a substantial share of variants.', ['gr:NBK1211']],
    ['Founder PMS2 variants include c.989-1G>T (Norway), c.736_741delins11 (United States), an exon 10 deletion (Australia) and c.2002A>G (Inuit).', ['gr:NBK1211']],
    ['Biallelic PMS2 is the commonest cause of CMMRD (over 60% of cases). Heterozygous parents frequently have no cancer history.', ['ern_cmmrd2024', 'clingen:PMS2']]
  ],
  cmmrd: [
    ['Gene distribution in CMMRD: over 60% PMS2, over 20% MSH6 and under 20% MLH1 or MSH2, reflecting carrier frequencies. About half of cases are homozygous, especially with consanguinity or founder variants.', ['eu:ern_cmmrd']],
    ['Family history is often absent because monoallelic PMS2 and MSH6 penetrance is low. Consanguinity, or Lynch syndrome in a relative, adds weight in the C4CMMRD score (testing threshold 3 or more points).', ['eu:ern_cmmrd']],
    ['80-90% develop their first tumour before 18 and about half before 10. Attenuated forms with later onset exist. Non-neoplastic clues include NF1-like CALMs, hypopigmented patches, multiple developmental venous anomalies, agenesis of the corpus callosum and IgG2/4 or IgA deficiency.', ['eu:ern_cmmrd']],
    ['Biallelic EPCAM variants do not cause CMMRD. They cause congenital tufting enteropathy.', ['gr:NBK1211']]
  ],
  fap: [
    ['Pathogenic variants in codons ~1250-1464 (including the hotspot at codon 1309) are associated with a severe, profuse colonic phenotype, faster polyp progression and higher rectal cancer risk after ileorectal anastomosis; genotype should inform but not replace phenotype-based timing of surgery.', ['eu:ehtg_fap']],
    ['Attenuated FAP is associated with variants at the 5\' end (codons 1-233), the alternatively spliced region of exon 9 (codons 311-412) and 3\' of codon 1595, but 35% of carriers of these variants still had classical FAP.', ['gr:NBK1345']],
    ['Desmoid risk is higher with variants 3\' of codon 1399 (UKCGG/BSG: 65% mesenteric desmoid risk after abdominal surgery in this region; GeneReviews cites codons 1395-1493), with a family history of desmoids and after abdominal surgery. Determine genotype and desmoid family history before colectomy.', ['ukcgg:apc', 'ukcgg:bsg', 'gr:NBK1345']],
    ['Point variants in APC promoter 1B cause GAPPS: fundic gland polyposis of the proximal stomach (antrum spared) with intestinal-type gastric cancer and little or no colorectal/duodenal polyposis. Not all panels cover promoter 1B, so ask the laboratory specifically.', ['eu:ehtg_fap', 'gr:NBK1345', 'clingen:APC']],
    ['Somatic mosaicism explains ~20% of simplex FAP and 20-50% of otherwise unexplained polyposis; test APC in two or more adenomas if blood testing is negative. Mosaic parents may be mildly affected.', ['gr:NBK1345', 'eu:ehtg_fap']],
    ['APC c.3920T>A p.(Ile1307Lys) (Ashkenazi) is a low-penetrance variant and does not cause FAP.', ['ukcgg:bsg']]
  ],
  map: [
    ['Biallelic disease only. c.536A>G p.(Tyr179Cys) and c.1187G>A p.(Gly396Asp) make up >=90% of pathogenic alleles in northern Europeans. Y179C homozygotes have a more severe phenotype, about 8 years earlier than G396D homozygotes, and more duodenal polyposis.', ['gr:NBK107219', 'eu:ehtg_fap']],
    ['Population founder alleles: c.1438G>T p.(Glu480Ter) in British Indians; c.312C>A p.(Tyr104Ter) in Pakistanis; c.857G>A p.(Gly286Glu) in Japanese/Korean; c.1147delC in northern Europeans; c.1214C>T p.(Pro405Leu) in Dutch; c.1227_1228dup in Iberian/Tunisian; c.1437_1439del in Italians; exon 4-16 deletion in Spanish/Brazilian/French. Use full-gene analysis in non-European ancestry.', ['gr:NBK107219']],
    ['Monoallelic (heterozygous) MUTYH carriers (1-2% of the population) have at most a 2-3 fold late-onset CRC risk. BSG does not recommend colonoscopy beyond population screening. ClinGen rates monoallelic MUTYH-CRC and MUTYH-breast as Disputed/Refuted.', ['ukcgg:bsg', 'gr:NBK107219', 'clingen:MUTYH']],
    ['Common p.Glu324His (high MAF) is not used to direct care.', ['gr:NBK107219']]
  ],
  nthl1: [
    ['Biallelic disease. c.268C>T p.(Gln90Ter) is the recurrent founder variant: common in the Dutch, seen in other ancestries, and homozygous in 15 reported families. Heterozygotes have no proven CRC risk and possibly a small breast cancer risk; no extra screening is recommended.', ['gr:NBK555473']],
    ['The carrier frequency is about 1 in 300, so the risk to offspring of an affected person is very low unless the parents are consanguineous. Test siblings.', ['eu:ehtg_fap']]
  ],
  ppap: [
    ['Only specific missense variants in the exonuclease (proofreading) domain of POLE or POLD1 cause PPAP. Truncating/loss-of-function variants outside this domain do not, so classify ED variants with the gene-specific criteria (Mur 2023). Panels should report POLE/POLD1 exonuclease-domain variants.', ['eu:ehtg_fap', 'mur2023']],
    ['POLD1 carriers have a significantly higher endometrial cancer risk than POLE carriers. POLE carriers have more duodenal, ovarian and brain tumours. POLE p.(Leu424Val) is the commonest recurrent variant.', ['palles2022ppap']],
    ['Some POLE/POLD1 variants cause a severe, CMMRD-like childhood/adolescent phenotype. Consider starting colonoscopy 5 years earlier (EHTG) or from 14 (Palles 2022) in such families. Tumours are ultramutated (SBS10).', ['eu:ehtg_fap', 'palles2022ppap']]
  ],
  mbd4: [
    ['Biallelic MBD4 loss causes the recessive polyposis/AML syndrome with tumours showing CpG>TpG signature SBS1/SBS96. Heterozygotes have increased uveal melanoma risk (RR 9-31) but no proven CRC/polyposis risk, and eye surveillance is not recommended for them.', ['gr:NBK624097', 'palles2022mbd4', 'clingen:MBD4']]
  ],
  jps_smad4: [
    ['SMAD4 (not BMPR1A) causes the combined JP-HHT syndrome. Assess every SMAD4 carrier for HHT (pulmonary/cerebral AVMs, angioectasia) and aortopathy, even without polyps. HHT symptoms may come before polyps.', ['ukcgg:smad4', 'ukcgg:bsg', 'gr:NBK1469', 'clingen:SMAD4']],
    ['SMAD4 carriers have a more aggressive gastric phenotype (gastric polyposis 73% vs 8% for BMPR1A), and almost all JPS gastric cancers occur in SMAD4 carriers. Upper GI surveillance starts at 18 for SMAD4 vs 25 for BMPR1A.', ['ukcgg:bsg', 'gr:NBK1469']]
  ],
  jps_bmpr1a: [
    ['Contiguous 10q22-q23 deletions including BMPR1A and PTEN cause severe juvenile polyposis of infancy with features of both JPS and PHTS. Manage such patients for both conditions.', ['ukcgg:bmpr1a', 'ukcgg:bsg', 'gr:NBK1469']],
    ['BMPR1A carriers have little gastric involvement (gastric polyps ~20%, no gastric cancer reported), and colorectal cancer predominates.', ['ukcgg:bmpr1a', 'gr:NBK1469']]
  ],
  hmps: [
    ['HMPS is caused by a ~40 kb duplication spanning the 3\' end of SCG5 and upstream GREM1, which causes ectopic epithelial GREM1 expression. It is seen mainly in Ashkenazi Jewish families. Copy-number analysis is needed, because sequencing alone misses it.', ['jaeger2012', 'otherpolyposis2026']]
  ],
  rnf43: [
    ['Germline RNF43 loss-of-function variants in the N-terminal half carry the CRC risk. C-terminal germline truncating variants (including p.Gly659fs-region changes, which are common somatic hotspots) gave no increased CRC risk in population data.', ['rnf43gut2026']]
  ],
  pjs: [
    ['Most STK11 pathogenic variants are truncating. Large deletions are common, so MLPA/CNV analysis is needed. Somatic mosaicism explains 2-6% of clinically suspected PJS, so test polyps or buccal DNA if blood is negative.', ['eu:ehtg_pjs', 'gr:NBK1266']]
  ],
  phts: [
    ['Weak genotype-phenotype trends: frameshift variants are overrepresented with thyroid cancer, nonsense variants with CRC, promoter variants with breast cancer, and missense variants with autism. These trends are not used for management.', ['gr:NBK1488']],
    ['Contiguous 10q23 deletions including PTEN and BMPR1A give combined PHTS plus juvenile polyposis (including juvenile polyposis of infancy). Manage for both.', ['gr:NBK1469']]
  ],
  hdgc: [
    ['CDH1 gives both DGC and lobular breast cancer (HLBC). CTNNA1 truncating variants give DGC (mean ~40) but lobular breast cancer is extremely rare and cleft is not seen. Test CDH1 first, then CTNNA1.', ['eu:igclc_hdgc', 'gr:NBK1139', 'ukcgg:cdh1']],
    ['Penetrance depends on ascertainment. Carriers found outside HDGC criteria (e.g. LBC-only families or incidental findings) have lower DGC risk, so UKCGG advises caution with prophylactic gastrectomy and offers endoscopic surveillance instead.', ['ukcgg:cdh1', 'eu:igclc_hdgc']],
    ['Only a few CDH1 missense variants (all splice-affecting) carry truncating-level risk; other missense VUS are unlikely to cause HDGC. There are no clear genotype-phenotype correlations, except that linker-region variants are associated with cleft lip/palate. Low-penetrance founder c.1901C>T (northern Portugal): <20% developed DGC/LBC. Māori have four common founder variants.', ['ukcgg:cdh1', 'gr:NBK1139']]
  ],
  ctnna1: [
    ['Only truncating CTNNA1 variants are diagnostic. Just 24% of CTNNA1 families meet HDGC criteria, and the rest present with other cancers (mostly unspecified breast) or none. Gastrectomy is offered when there is a family history of DGC/LBC.', ['gr:NBK1139']]
  ],
  tylosis: [
    ['Tylosis with oesophageal cancer is caused by missense variants in the cytosolic N-terminus of RHBDF2 (iRhom2): c.557T>C p.(Ile186Thr), c.562G>A p.(Asp188Asn) and c.566C>T p.(Pro189Leu). Oral leukokeratosis and small white oesophageal lesions are additional clues.', ['ellis2015', 'clingen:RHBDF2']]
  ],
  lfs: [
    ['p.Arg337His (R337H), the southern Brazilian founder variant (0.2-0.3% of that population), is a low-penetrance, non-dominant-negative allele: very high risk of childhood ACC, but other LFS cancers occur later and less often. UKCGG still offers full surveillance to carriers of lower-penetrance variants.', ['eu:ern_lfs', 'gr:NBK1311', 'ukcgg:tp53']],
    ['Variant type matters: dominant-negative DNA-binding-domain missense variants (e.g. p.Arg175His, p.Gly245Ser, p.Arg248Gln/Trp, p.Arg273His, p.Arg282Trp) give earlier and more childhood cancers; null and non-dominant-negative variants are seen mostly in adult-onset families. Reduced-penetrance missense variants include p.Pro47Ser, p.Gly334Arg, p.Arg181Cys/His and possibly p.Pro152Leu.', ['eu:ern_lfs', 'gr:NBK1311', 'deandrade2021']],
    ['\'Attenuated LFS\' (a TP53 PV without classic/Chompret criteria) carries lower and later cancer risk, but families can be reclassified as history evolves; this does not currently change surveillance. Penetrance estimates from familial series (73-100% by 70) are inflated by ascertainment; population prevalence is ~1 in 4,500.', ['gr:NBK1311', 'eu:ern_lfs']],
    ['De novo TP53 variants account for 7-20% of cases (about one fifth of these are mosaic), so a negative family history does not exclude LFS. Consider mosaicism (test tumour tissue) in childhood ACC, choroid plexus carcinoma, breast cancer <31 or multiple core tumours. UKCGG offers surveillance to constitutional mosaics confirmed in two tissues.', ['eu:ern_lfs', 'gr:NBK1311', 'ukcgg:tp53']],
    ['Clonal haematopoiesis caveat: a TP53 variant at low allele fraction in blood is often due to clonal haematopoiesis (age, smoking, prior chemo/radiotherapy; seen from ~30 years) or circulating tumour DNA, not germline LFS. Confirm in non-haematopoietic tissue (e.g. skin fibroblasts, hair follicles) or tumour before diagnosing LFS.', ['eu:ern_lfs', 'gr:NBK1311']],
    ['Colorectal cancer in a TP53 family should prompt a search for a second cause. UK (UKCGG) does not support routine colonoscopy; US GeneReviews advises it. UK guidance takes precedence.', ['ukcgg:tp53', 'eu:ern_lfs', 'gr:NBK1311']]
  ],
  men1: [
    ['No consistent MEN1 genotype-phenotype correlation. The Burin founder variant c.1378C>T (p.Arg460Ter; Newfoundland) gives more prolactinoma and less gastrinoma. Variants in the JunD-interacting domain were linked to a twofold higher mortality in one study.', ['gr:NBK1538']],
    ['About 10% of MEN1 is de novo. Age-related penetrance is over 50% by 20 years and 95% by 40 years. Isolated sporadic parathyroid adenoma, gastrinoma, insulinoma or bronchial carcinoid often carries a somatic (not germline) MEN1 variant.', ['gr:NBK1538']]
  ],
  men4: [
    ['MEN4 is milder than MEN1, with reduced, age-related penetrance and later onset (mean first tumour 43.5 vs 31.8 years). CDKN1B indels, and variants at codons 94-96, may carry higher PHPT and pituitary risk (one study). CDKN1B is found in <5% of MEN1-like cases without a MEN1 variant.', ['gr:NBK594826']]
  ],
  men2: [
    ['ATA 2015 MTC risk levels: HIGHEST = p.Met918Thr (MEN2B; thyroidectomy in the 1st year of life). HIGH = codon 634 (p.Cys634Arg/Gly/Phe/Ser/Trp/Tyr) and p.Ala883Phe (thyroidectomy before 5 years). MODERATE = all other gain-of-function variants (e.g. codons 609, 611, 618, 620, 630, 768, 790, 804, 891).', ['us:ata_men2', 'gr:NBK1257']],
    ['Codon 634 variants carry the highest rates of phaeochromocytoma and hyperparathyroidism, plus cutaneous lichen amyloidosis (36% in one series). Screening for phaeo/HPT starts at 11 years for ATA-H and 16 years for ATA-MOD. Codon 804 expression is highly variable even within a family; codons 790/804 have been linked to coexisting papillary thyroid cancer.', ['gr:NBK1257']],
    ['Exon 10 cysteine variants (codons 609, 611, 618, 620; ATA moderate) cause MEN2A/FMTC and can co-segregate with Hirschsprung disease, especially at 618/620. Loss-of-function RET variants anywhere in the gene cause Hirschsprung without MEN2 risk.', ['gr:NBK1257']],
    ['MEN2B (~5% of MEN2) is de novo in about 50% of cases (MEN2A 5-9%). Look for mucosal neuromas, marfanoid habitus and GI ganglioneuromatosis. FMTC is now treated as MEN2A with lower phaeo/HPT penetrance and should still be screened for phaeo.', ['gr:NBK1257']],
    ['Somatic RET p.Met918Thr is common in sporadic MTC, and somatic RET fusions are common in papillary thyroid cancer and lung adenocarcinoma. These tumour findings do not imply germline MEN2.', ['gr:NBK1257']]
  ],
  hptjt: [
    ['Parathyroid carcinoma is a key CDC73 marker: 20-29% of apparently sporadic parathyroid carcinomas carry a germline CDC73 variant, so test all cases. Parafibromin-deficient (atypical or cystic) parathyroid tumours, and PHPT under 45 with cystic, atypical or malignant histology, should also prompt testing. Carcinoma has been reported from age 8.', ['gr:NBK3789']],
    ['CDC73 variants also cause familial isolated hyperparathyroidism, with a more severe and earlier presentation than other FIHP. A second parathyroid tumour can occur years to decades later (recurrence ~25%).', ['gr:NBK3789']]
  ],
  fipa: [
    ['AIP has low penetrance: pituitary tumours develop in only ~23% (15-30%) of carriers, so unaffected carrier parents are common. Higher figures from early families reflect ascertainment bias. Truncating variants may give slightly earlier onset.', ['gr:NBK97965']],
    ['Recurrent and founder AIP variants: p.Arg304Ter (the commonest hotspot; founder effect in Ireland and Italy), p.Gln14Ter (Finnish founder), p.Phe269_His275dup (English/European founder), and hotspots p.Arg81Ter and p.Arg271Trp.', ['gr:NBK97965']],
    ['There is no conclusive evidence of non-pituitary tumour risk. Infant-onset gigantism suggests X-linked acrogigantism (GPR101 duplication, often mosaic in males) rather than AIP.', ['gr:NBK97965']]
  ],
  carney: [
    ['PRKAR1A hotspot c.491_492delTG is linked to more lentigines, cardiac myxoma and thyroid tumours. Exonic variants give fuller phenotypes than intronic or splice variants. Large deletions give a more severe phenotype. Overall penetrance is >95% by 50.', ['gr:NBK1286']],
    ['Two reduced-penetrance variants, c.709-7_709-2delTTTTTA and c.1A>G (p.Met1Val), mainly cause isolated PPNAD (sometimes with lentigines). About 30% of CNC is de novo.', ['gr:NBK1286']]
  ],
  mas: [
    ['FD/MAS is caused by post-zygotic mosaic activating GNAS variants (p.Arg201 or p.Gln227 only). It is not inherited and the risk to relatives is at population level, so it does not explain a familial cluster. Detection is ~80% in lesional tissue vs 20-30% in blood, so test affected tissue with a sensitive method.', ['gr:NBK274564']],
    ['Germline inactivating GNAS variants cause different, imprinting-dependent phenotypes (pseudohypoparathyroidism spectrum) and are not MAS.', ['gr:NBK274564']],
    ['Sarcomatous transformation of FD is rare and mostly follows radiation (or GH excess), so radiotherapy should be avoided.', ['gr:NBK274564']]
  ],
  vhl: [
    ['VHL type 1 (truncating variants, deletions, or missense variants that grossly disrupt protein folding): haemangioblastoma, ccRCC and pancreatic lesions with LOW phaeochromocytoma risk. Deletions extending 5\' to include BRK1 (type 1B) carry reduced RCC and phaeo risk.', ['gr:NBK1463']],
    ['VHL type 2 (usually missense) carries HIGH phaeochromocytoma risk: 2A = phaeo + haemangioblastoma, low RCC; 2B = phaeo + haemangioblastoma + pancreatic lesions, high RCC; 2C = phaeochromocytoma only. A phaeo-only family with a VHL missense variant may therefore show no RCC or haemangioblastoma.', ['gr:NBK1463']],
    ['Truncating variants carry higher age-related risk of haemangioblastoma, ccRCC and pNET than missense variants. About 5% of people with VHL are mosaic, and de novo cases are ~20%, so a negative family history does not exclude VHL.', ['gr:NBK1463']]
  ],
  sdhb: [
    ['SDHB carries the highest metastatic risk of the SDHx genes (malignancy ~4.2% by 60 in non-proband carriers; up to 45% of metastatic extra-adrenal PGL are SDHB). Children with SDHB have a higher risk of metastatic PGL, and tumours have occurred as young as 6, so screening starts at 5 in the UK.', ['ukcgg:sdhb', 'eu:sdhx_consensus', 'gr:NBK1548']],
    ['Penetrance of clinically apparent tumours is much lower than first thought: ~22% by 60 in non-proband SDHB carriers (24% by 60 and 31% by 80 adjusting for ascertainment). Highly destabilising SDHB missense variants carry higher age-related tumour risk.', ['andrews2018']],
    ['Unlike SDHD, there is no parent-of-origin effect: SDHB variants cause tumours whether inherited from the mother or the father.', ['ukcgg:sdhd']]
  ],
  sdhd: [
    ['Parent-of-origin effect: tumours develop almost only when the SDHD variant is inherited from the father (SDHD-pi). After maternal transmission (SDHD-mi), PPGL is rare (<=5%) and UK surveillance is not routinely advised. But a man with SDHD-mi can pass it to children who will then be at full risk, so tumours can skip generations through female carriers.', ['ukcgg:sdhd', 'eu:sdhx_consensus', 'gr:NBK1548']],
    ['SDHD p.Pro81Leu (a common founder variant in the UK cohort) has a distinct, milder phenotype: almost only HNPGL, with low risk of phaeo or sympathetic PGL.', ['andrews2018']],
    ['Metastatic risk is low (<5%), much lower than for SDHB, but multifocal tumours are common (~75%).', ['gr:NBK1548']]
  ],
  sdhc: [
    ['SDHC mainly causes non-metastatic, often non-functional head and neck PGL, with lower multiplicity than SDHD. It has no parent-of-origin effect. SDHC epimutations (constitutional promoter methylation) are seen in GIST and Carney triad and can be missed by sequencing.', ['ukcgg:sdhc', 'eu:sdhx_consensus']]
  ],
  sdha: [
    ['SDHA has low penetrance (~10% by 70 in non-index carriers; 13% of relatives vs 45% of index cases at 40). An SDHA variant found in someone with an unrelated (\'off-tumour\') cancer is a non-actionable incidental finding unless SDH IHC shows SDHB/SDHA loss or there is a family history of SDHA tumours (UK).', ['ukcgg:sdha', 'bausch2017']],
    ['Despite low penetrance, SDHA disease has occurred as early as age 8, and malignant PPGL is seen in some SDHA and TMEM127 carriers. Biallelic SDHA causes mitochondrial disease (Leigh syndrome; ClinGen).', ['bausch2017', 'clingen:SDHA']]
  ],
  sdhaf2: [
    ['SDHAF2 shows the same paternal-transmission (maternal imprinting) effect as SDHD: disease occurs almost only when the variant comes from the father. HNPGL are usually multiple (~90%) with low metastatic risk; only a few families are reported.', ['gr:NBK1548']]
  ],
  tmem127: [
    ['TMEM127 tumours often look like sporadic non-metastatic phaeo (metastatic 2.8%, mean age 45, female predominance). Non-truncating variants cluster in transmembrane domains and are over-represented in non-phaeo presentations (PGL, RCC).', ['armaizpena2021']]
  ],
  max: [
    ['MAX may show paternal transmission like SDHD (so far no tumours after maternal inheritance), but data are limited. Metastatic risk is ~10-25%.', ['gr:NBK1548', 'comino2011', 'burnichon2012']]
  ],
  hlrcc: [
    ['FH c.1431_1433dup (p.Lys477dup), like c.521C>G, c.923C>G and c.1127A>C, appears to cause recessive fumarate hydratase deficiency when biallelic, without a clear HLRCC tumour risk in heterozygotes. Offer partner testing; do not assume HLRCC-level renal risk without other evidence.', ['gr:NBK1252', 'ukcgg:fh']],
    ['PPGL risk seems confined to specific, mostly missense, FH variants (e.g. p.Glu53Lys, p.Arg74Ser, p.Ala117Pro, p.Cys434Tyr). UK guidance advises symptom awareness rather than routine PPGL surveillance.', ['gr:NBK1252', 'ukcgg:fh']],
    ['HLRCC RCC is aggressive and can occur in childhood (2-4% before age 20). The UK advises annual renal MRI from age 10.', ['ukcgg:fh']]
  ],
  bhd: [
    ['The commonest FLCN variants, the exon 11 hotspot c.1285dupC/c.1285delC, were linked to a lower renal tumour frequency in one 50-family study. c.1285dupC was linked to more colorectal neoplasia than c.610delGCinsTA in another, but a colorectal cancer link is unproven (ERN). The UK advises colonoscopy only if there is a family history.', ['gr:NBK1522', 'eu:ern_bhd', 'ukcgg:flcn']],
    ['Melanoma, thyroid, parotid (oncocytoma) and colorectal tumours have been reported, but no association is confirmed enough to warrant surveillance (ERN R12/R17; UKCGG).', ['eu:ern_bhd', 'ukcgg:flcn']]
  ],
  hprc: [
    ['Only activating missense variants in the MET tyrosine-kinase domain cause HPRC (e.g. p.V1110I, p.V1238I). Truncating or loss-of-function MET variants do not, so a MET truncating variant on a panel should not be read as HPRC. Penetrance can vary by variant (earlier for V1110I than V1238I).', ['schmidt1997', 'schmidt2004', 'ukcgg:met']],
    ['No extra-renal tumours are reported in HPRC; tumours are multiple, bilateral, type 1 papillary, often slow-growing.', ['ukcgg:met']]
  ],
  tsc: [
    ['TSC2/PKD1 contiguous gene deletion causes TSC plus severe early polycystic kidney disease, usually evident in utero or infancy, with risk of renal failure. Consider it when multiple renal cysts are seen with TSC features.', ['gr:NBK1220']],
    ['TSC2 variants cause more severe disease than TSC1, with more renal AMLs, renal malignancy, rhabdomyomas and intellectual disability. Some TSC2 missense variants (e.g. p.Arg905Gln, p.Arg622Trp) cause milder disease and run in families.', ['gr:NBK1220']],
    ['About two thirds of cases are de novo, and somatic mosaicism is common in people with no variant found in blood. Test other tissues (tumour, skin) when TSC is clinically suspected.', ['gr:NBK1220']]
  ],
  bap1: [
    ['The BAP1 spectrum differs with variant type. In 181 families, probands with truncating vs missense variants had uveal melanoma 36% vs 23%, cutaneous melanoma 23% vs 45%, mesothelioma 25% vs 15% and RCC 6% vs 10%. Core tumours are uveal and cutaneous melanoma, pleural/peritoneal mesothelioma, RCC and BIMT; meningioma (possibly the rhabdoid type) is associated but not core.', ['eu:bap1_eu', 'ukcgg:bap1']],
    ['Overall cancer risk (up to ~85%) is probably overestimated by ascertainment bias. BAP1 is not on the ACMG secondary-findings list. Somatic BAP1 loss is common in mesothelioma (60-70%), uveal melanoma (45%) and RCC (15%), so a tumour finding needs germline confirmation.', ['eu:bap1_eu', 'ukcgg:bap1']]
  ],
  cdkn2a: [
    ['Variants affecting p16INK4a carry the melanoma and pancreatic cancer risk; variants disrupting p14ARF (often intronic/3\'UTR, may be missed by exome) or whole-gene deletions give a broader spectrum including astrocytoma/glioma and nerve sheath tumours. Consider brain/whole-body MRI only for p14ARF variants with a family history of nervous system tumours.', ['gr:NBK616232']],
    ['Pancreatic adenocarcinoma is seen more often with p16INK4a-affecting variants; lifetime risk ~15-20%. Pancreatic surveillance (MRCP/EUS) from 40 or 10 years before the earliest family case.', ['gr:NBK616232']],
    ['Whole-gene CDKN2A/CDKN2B deletion causes melanoma-astrocytoma syndrome; some people with a clinical diagnosis of NF1 have been reclassified to it. Contiguous 9p21.3 deletions also reported with neurofibromas, giant cell tumour of bone and sarcoma.', ['us:aacr_brain', 'gr:NBK616232']],
    ['Founder variants: p.Met53Ile (Europe/N America/Australia), c.225_243del19 \'p16-Leiden\' (Dutch, 75-90%), p.Gly101Trp (France/Spain/Italy), p.Arg112dup (Swedish, ~90%; also lung, head/neck and gastro-oesophageal cancer, smoking-modified), c.458-105A>G (European).', ['gr:NBK616232']]
  ],
  cdk4: [
    ['Reported germline CDK4 variants are at codon 24 (p.Arg24His in 11 families, p.Arg24Cys in 6); CDK4 families are phenotypically indistinguishable from CDKN2A families, so test CDK4 when CDKN2A is negative.', ['puntervoll2013']]
  ],
  pot1: [
    ['p.Arg117Cys has been reported in Li-Fraumeni-like families with cardiac (and breast) angiosarcoma; otherwise GeneReviews reports no confirmed genotype-phenotype correlation.', ['gr:NBK563529']],
    ['p.Ser270Asn is a founder variant in families from the Romagna region of Italy.', ['gr:NBK563529']],
    ['Tumour-predisposing POT1 variants cause long telomeres (apparent anticipation across generations). Other POT1 variants cause telomere-shortening disorders instead: homozygous p.Ser322Leu in Coats plus and heterozygous variants in dyskeratosis congenita-like disease. These are not POT1-TPD.', ['gr:NBK563529']],
    ['UK guidance: risks are not high enough for intensive surveillance. Offer a baseline skin examination from 18. Consider cardiac MRI only when a first- or second-degree relative has had cardiac angiosarcoma. Routine CLL or glioma screening is not recommended. This differs from the LFS-style whole-body MRI suggested in US/GeneReviews.', ['ukcgg:pot1', 'tsoulaki2025', 'gr:NBK563529']]
  ],
  gorlin: [
    ['PTCH1 carriers have a lower medulloblastoma risk (~0.4-2%) than SUFU carriers (~7-9%, about 20-fold higher). Routine brain MRI is advised only for SUFU carriers (or clinical diagnosis without testing) under 5 years. For PTCH1, MRI is done only if there are symptoms.', ['eu:siope_gorlin', 'eu:bcns_eu', 'us:aacr_brain']],
    ['PTCH1 missense variants: later diagnosis, fewer BCCs and jaw cysts than truncating variants. A 9q22.3 deletion including PTCH1 adds developmental delay, overgrowth and Wilms tumour risk.', ['gr:NBK1151']],
    ['Somatic mosaicism occurs. It is confirmed when the same PTCH1 variant is found in two separate tumours but is absent or at low VAF in blood. Mosaic parents may be mildly affected.', ['gr:NBK1151']],
    ['Radiotherapy greatly increases BCC risk and is relatively contraindicated. Avoid ionising radiation where possible, e.g. use MRI instead of orthopantomograms.', ['eu:bcns_eu', 'eu:siope_gorlin']]
  ],
  sufu: [
    ['SUFU vs PTCH1: SUFU gives a much higher infant SHH medulloblastoma risk (~7-9% vs ~0.4-1%) and more meningiomas (especially after radiotherapy) and ovarian fibromas. SUFU gives fewer BCCs and no jaw keratocysts. Many carriers never meet Gorlin criteria. Brain MRI surveillance is recommended to age 5 (every 4 months to age 3 in BAD).', ['eu:siope_gorlin', 'eu:bcns_eu', 'us:aacr_brain']],
    ['Penetrance of SUFU variants appears reduced, and parental germline mosaicism is possible; the sibling recurrence risk is ~1% even when the parents test negative.', ['gr:NBK1151']]
  ],
  xp: [
    ['Progressive neurodegeneration (~25%) occurs mainly with XPA, ERCC2, ERCC3, ERCC4 (late onset) and ERCC5. XPC, DDB2 and POLH (XP variant) cause skin and eye disease without neurological involvement.', ['gr:NBK1397']],
    ['Biallelic (autosomal recessive). Internal cancers are increased ~34-fold and arise ~50 years earlier, including CNS tumours, leukaemia and smoking-related lung cancer; counsel strict smoking avoidance. Founder variants explain higher prevalence in Japan (~1:22,000) and North Africa/Middle East.', ['gr:NBK1397']]
  ],
  nf1: [
    ['A 1.4-Mb type 1 NF1 microdeletion (whole gene, including SUZ12) brings more and earlier neurofibromas, higher MPNST risk, more cognitive impairment and overgrowth. ERN treats these patients as high MPNST risk.', ['gr:NBK1109', 'eu:ern_nf1']],
    ['Missense variants at codons 844-848 give a severe phenotype (plexiform/spinal neurofibromas, optic glioma, malignancy) and high MPNST risk.', ['gr:NBK1109', 'eu:ern_nf1']],
    ['p.Met992del: pigmentary features only, with no cutaneous or surface plexiform neurofibromas. A quarter do not meet NF1 criteria, but non-optic brain tumours and learning problems occur at the usual NF1 frequency.', ['gr:NBK1109']],
    ['Missense variants at p.Arg1809: multiple CALMs without cutaneous or clinically apparent plexiform neurofibromas, often with Noonan features (pulmonic stenosis, short stature, learning difficulty).', ['gr:NBK1109']],
    ['Mosaic NF1 is usually milder or localised, but a mosaic parent can have a child with full NF1. Parental germline mosaicism can occur even when parental blood is negative. AACR does not change surveillance for mosaicism or genotype.', ['gr:NBK1109', 'us:aacr_ras']],
    ['ClinGen: NF1 has no known relationship with familial ovarian cancer.', ['clingen:NF1']]
  ],
  nf2: [
    ['Truncating (nonsense/frameshift) NF2 variants cause severe, early-onset disease with more meningiomas, spinal and peripheral nerve tumours and higher mortality. Missense variants and large deletions are usually mild; splice variants vary, being milder in the 3\' half.', ['gr:NBK1201', 'us:aacr_schwann']],
    ['Variants in the 3\' half of NF2 (especially exons 14-16) carry a lower meningioma risk than 5\' variants.', ['gr:NBK1201']],
    ['Mosaicism is common (up to 60% of de novo NF2) and milder even for truncating variants. Diagnose it from an identical NF2 variant in two distinct tumours. Mosaic NF2 can mimic schwannomatosis, so test two tumours in sporadic cases.', ['us:aacr_schwann', 'gr:NBK1201', 'eu:ern_schwann']],
    ['Avoid radiotherapy where possible. The risk of malignant progression or a new CNS malignancy is ~5-6% after radiation vs <1% without; MPNST is not seen without radiation.', ['gr:NBK1201', 'us:aacr_schwann']]
  ],
  smarcb1: [
    ['SMARCB1 genotype predicts phenotype. Truncating variants in central exons 2-9, nonsense variants and large/intragenic deletions cause complete protein loss and rhabdoid tumour predisposition (RTPS1). Non-truncating (missense) variants at the 5\'/3\' ends (exons 1 and 8), and exon 1 frameshifts with downstream re-initiation, cause schwannomatosis.', ['us:aacr_schwann', 'eu:siope_rhabdoid']],
    ['Splice-site variants occur in both conditions; the pooled rhabdoid risk is >10%, so RTPS surveillance is advised. Hypomorphic variants can occasionally cause both rhabdoid tumours and schwannomas.', ['eu:siope_rhabdoid']],
    ['Germline mosaicism may explain up to half of families with affected siblings. Test young at-risk siblings even if the parents test negative. Distal 22q11.2 deletions spanning SMARCB1 also cause RTPS1.', ['gr:NBK469816', 'us:aacr_brain', 'eu:siope_rhabdoid']],
    ['SMARCB1 vs SMARCA4: SMARCB1 (RTPS1) is commoner, with near-complete penetrance in infancy. SMARCA4 (RTPS2) has incomplete penetrance and adds SCCOHT risk in females. GeneReviews reports no germline SMARCB1 variants in SCCOHT; SIOPE notes one case.', ['gr:NBK469816', 'eu:siope_rhabdoid', 'us:aacr_brain']],
    ['Coffin-Siris syndrome due to SMARCB1 missense variants in the last two exons has no clear rhabdoid tumour risk.', ['eu:siope_rhabdoid', 'clingen:SMARCB1']]
  ],
  lztr1: [
    ['Incidental LZTR1 loss-of-function variants are common (~1 in 310 in gnomAD). Without a personal or family history of schwannoma, the risk is likely <1%, so they are not diagnostic and need no MRI surveillance.', ['eu:ern_schwann', 'us:aacr_schwann']],
    ['Allelic Noonan syndrome: dominant LZTR1-Noonan is usually due to gain-of-function variants. Recessive Noonan (biallelic missense/LoF) can overlap with schwannomatosis variants.', ['us:aacr_schwann', 'clingen:LZTR1']],
    ['Schwannoma tumourigenesis follows a 3-event/4-hit model: germline LZTR1 variant, loss of 22q (including NF2), then a different somatic NF2 variant in each tumour. Different NF2 variants across tumours do not indicate mosaic NF2. Germline LZTR1 variants are found in 33-40% of segmental schwannomatosis.', ['us:aacr_schwann', 'eu:ern_schwann']]
  ],
  smarca4: [
    ['Germline SMARCA4 truncating variants predispose to SCCOHT and rhabdoid tumours (RTPS2), with incomplete penetrance; most are inherited from a healthy parent. Female carriers need ovarian-focused counselling after age 5, including discussion of risk-reducing salpingo-oophorectomy.', ['gr:NBK469816', 'eu:siope_rhabdoid', 'us:aacr_brain']],
    ['Truncating SMARCA4 variants are also linked to undifferentiated uterine sarcoma and, rarely, SMARCA4-deficient lung carcinoma. \'CSS-like\' helicase-domain missense variants have been found in SCCOHT, and a Coffin-Siris patient with a truncating variant developed SCCOHT.', ['eu:siope_rhabdoid', 'gr:NBK469816']],
    ['SMARCA4 vs SMARCB1: RTPS2 is rarer and less penetrant than RTPS1 but has equally poor outcomes, and adds SCCOHT. SMARCA4- and SMARCB1-altered ATRTs differ on DNA methylation.', ['us:aacr_brain', 'eu:siope_rhabdoid']]
  ],
  smarce1: [
    ['Heterozygous loss-of-function SMARCE1 variants cause familial multiple spinal (and cranial) clear cell meningiomas, with SMARCE1 protein loss in the tumour. AACR advises yearly brain and spine MRI from diagnosis to age 30, then every 2-3 years.', ['smith2013', 'us:aacr_brain']]
  ],
  dgcr8: [
    ['The described variant is DGCR8 c.1552G>A p.(Glu518Lys), also a somatic hotspot in Wilms tumour. Tumours show 22q loss (LOH at DGCR8) and a shared microRNA-processing defect.', ['rivera2020']]
  ],
  jmjd1c: [
    ['Low-penetrance susceptibility: rare germline JMJD1C variants are enriched in Japanese/East Asian intracranial germ cell tumour patients. AACR suggests genetic counselling and considering testing, especially in patients of Japanese/East Asian descent, but gives no surveillance advice.', ['wang2014', 'us:aacr_brain']]
  ],
  elp1: [
    ['Heterozygous germline ELP1 loss-of-function variants predispose to childhood SHH-alpha medulloblastoma (median 6.3 y, older than SUFU/PTCH1 cases). Tumours lose 9q, inactivating ELP1 biallelically and usually PTCH1 too. Absolute risk seems low, so routine MRI is not advised, though it can be discussed in families with affected relatives.', ['waszak2020', 'us:aacr_brain']],
    ['Biallelic ELP1 variants cause familial dysautonomia (autosomal recessive; Ashkenazi splice founder). That founder variant was not found in the ELP1-associated medulloblastoma series.', ['waszak2020', 'clingen:ELP1']]
  ],
  gpr161: [
    ['Heterozygous germline GPR161 variants cause infant SHH medulloblastoma; tumours show copy-neutral LOH of 1q. Families may show a Gorlin-like phenotype. Absolute risk is considered low, so brain MRI surveillance is not routinely advised.', ['begemann2020', 'us:aacr_brain']]
  ],
  dicer1: [
    ['Typical germline variants are loss-of-function; DICER1 tumours usually acquire a second, somatic missense hit in the RNase IIIb \'hotspot\' (e.g. E1705, D1709, D1713, G1809, D1810, E1813). A hotspot variant found only in tumour does not by itself imply germline predisposition.', ['ukcgg:dicer1', 'us:aacr_pten_dicer1_tsc']],
    ['Mosaic RNase IIIb missense variants (GLOW phenotype: global developmental delay, lung cysts, overgrowth, Wilms tumour) are associated with earlier onset and more disease sites than germline LOF variants; offer at least standard surveillance. Mosaic LOF variants give a similar or milder phenotype. About 10% of de novo cases are mosaic, so test more than one tissue.', ['gr:NBK196157', 'us:aacr_pten_dicer1_tsc']],
    ['DICER1 pineoblastoma is unusual: it more often shows biallelic loss-of-function (germline + somatic LOF/LOH) than an RNase IIIb hotspot hit.', ['gr:NBK196157', 'us:aacr_pten_dicer1_tsc']],
    ['Penetrance is low and age-dependent: ~5% develop a DICER1 neoplasm by age 10 and ~20% by 50; after age 10, risk is higher in females.', ['ukcgg:dicer1', 'gr:NBK196157']],
    ['Wilms tumour is rare in DICER1, but one large family with p.Gly803Arg had four affected members.', ['gr:NBK1294']]
  ],
  rb1: [
    ['Low-penetrance RB1 alleles (<10% of families) cause unilateral or absent tumours and penetrance of 25% or less. They are usually in-frame, missense or particular splice variants, exon 1 indels or promoter variants. Null (frameshift/nonsense) alleles are >99% penetrant.', ['gr:NBK1452']],
    ['13q14 deletions are found in up to 5% of unifocal and 7.5% of multifocal cases and come with developmental delay and dysmorphism. Large deletions that include MED4 show reduced expressivity (unilateral or no retinoblastoma).', ['gr:NBK1452']],
    ['Mosaicism is found in ~5.5% of bilateral probands. If tumour RB1 variants are absent from blood, the proband has ~1.2% chance of germline mosaicism and offspring ~0.6% risk. An unaffected parent may be mosaic or carry a reduced-penetrance allele. Some families show a parent-of-origin effect.', ['gr:NBK1452']],
    ['Radiotherapy greatly increases SMN risk (>50% after external-beam RT). Epithelial cancers (kidney, bladder, lung, pancreas, uterine corpus) were not significantly raised in incident analyses, though breast (SIR 3.1), CNS, oral and nasal cavity SMNs were.', ['gr:NBK1452', 'schonfeld2021']]
  ],
  wt1: [
    ['Truncating WT1 variants (nonsense/frameshift/splice, excluding intron 9 KTS) carry the highest Wilms risk, and >50% of these tumours are bilateral (vs <15% with other variants).', ['gr:NBK556455', 'gr:NBK1294']],
    ['Exon 8/9 missense variants in the zinc-finger DNA-binding region (classic Denys-Drash: DMS nephropathy, Wilms, 46,XY DSD) give a 70-80% Wilms risk and the earliest congenital/rapid steroid-resistant nephrotic syndrome.', ['gr:NBK556455', 'gr:NBK1294']],
    ['Intron 9 KTS donor-splice variants (+4/+5; classic Frasier: SRNS, 46,XY gonadal dysgenesis) carry the highest gonadoblastoma risk but a low Wilms risk (3% or less).', ['gr:NBK556455', 'gr:NBK1294', 'us:aacr_bws']],
    ['WAGR (11p13 contiguous deletion of WT1 and PAX6, with aniridia) is a separate entity with a 45-60% Wilms risk; 90% of tumours occur by age 4 and 98% by 7. Request a chromosomal microarray if aniridia is present.', ['gr:NBK1294', 'us:aacr_bws']]
  ],
  wilms_other: [
    ['TRIM28 Wilms tumours are mostly epithelial-type, often with nephrogenic rests, and TRIM28-negative on IHC. 93% occur before age 8. Variants are mainly truncating, with evidence of a maternal parent-of-origin effect. Test TRIM28 in epithelial-predominant Wilms.', ['gr:NBK1294']],
    ['REST-related Wilms is mostly unilateral, diagnosed at a median age of 3.25 years (range 6 months to 6 years).', ['gr:NBK1294']]
  ],
  mulibrey: [
    ['A Finnish founder variant, TRIM37 c.493-2A>G, is the most common. Other cancers mostly arise in adulthood, each in 2% or fewer of patients.', ['us:aacr_bws']]
  ],
  mva: [
    ['Wilms risk differs by gene: very high for BUB1B and ~10% for TRIP13. Treat a child with MVA as at high Wilms risk.', ['gr:NBK1294']]
  ],
  bws: [
    ['Tumour risk depends on molecular subtype: IC1 gain of methylation 28% (Wilms 24%), segmental pUPD11 16% (Wilms, hepatoblastoma, adrenal), CDKN1C 6.9% (mainly neuroblastoma), and IC2 loss of methylation 2.6% (varied tumours; Wilms ~0.2%). Genome-wide paternal UPD carries higher risk, with hepatic and adrenal tumours extending into young adulthood.', ['eu:bws_consensus']],
    ['UK/European consensus: no routine ultrasound for IC2 LOM, and 3-monthly abdominal ultrasound to age 7 for the other subgroups. AACR 2024 (US) instead screens all subtypes except CDKN1C and adds AFP to age 3, because blood epigenotype may not reflect tissue mosaicism. For CDKN1C, AACR recommends neuroblastoma screening only, as it reports no Wilms or hepatoblastoma (vs 1.4% Wilms in the consensus).', ['eu:bws_consensus', 'us:aacr_bws']],
    ['CDKN1C variants cause ~5% of sporadic and ~40% of familial BWS. They show a 50% recurrence risk when maternally transmitted, while paternal transmission usually gives no phenotype.', ['eu:bws_consensus']],
    ['Isolated lateralised overgrowth with segmental pUPD11 may carry a tumour risk as high as 32-50%.', ['eu:bws_consensus']]
  ],
  sgbs: [
    ['X-linked: most affected patients are male. Heterozygous females with skewed X-inactivation can be affected (tumours reported rarely), and surveillance can be considered for them.', ['us:aacr_bws', 'gr:NBK1219']]
  ],
  sotos: [
    ['Overall tumour risk is ~3%, spread over varied types (sacrococcygeal teratoma, neuroblastoma, isolated others), so routine tumour surveillance is not recommended.', ['gr:NBK1479', 'us:aacr_bws']]
  ],
  weaver: [
    ['Neuroblastomas are reported with EZH2 missense variants across the gene (e.g. p.Pro132Ser, p.Tyr133Cys, p.Tyr153Cys, p.Ala682Thr, p.Arg684Cys), mostly in infancy. There is no clear variant-specific risk.', ['gr:NBK148820']]
  ],
  alk: [
    ['ALK p.Arg1275Gln is the commonest germline variant (~45%) and has somewhat lower penetrance (~40%). p.Gly1128Ala showed ~40% childhood penetrance in one family. Obligate carriers are often unaffected adults.', ['gr:NBK24599']],
    ['Germline p.Phe1174Val and p.Phe1245Val have been seen with congenital neuroblastoma, severe developmental delay and brainstem abnormalities. p.Phe1174Leu is mainly a somatic variant (~30% of ALK-mutant sporadic tumours, with MYCN amplification) and is relatively crizotinib-resistant.', ['gr:NBK24599']],
    ['Familial cases show multiple primary tumours (bilateral adrenal or multifocal sympathetic ganglia) and the full spectrum from neuroblastoma to ganglioneuroma.', ['gr:NBK24599']]
  ],
  phox2b: [
    ['Risk depends on genotype: non-polyalanine repeat expansion mutations (NPARMs) give ~50% neural crest tumour risk (and more Hirschsprung). Polyalanine expansions (PARMs 20/25-20/33) give <5%. Neuroblastoma typically presents before age 2, while ganglioneuromas present later.', ['gr:NBK1427']]
  ],
  noonan: [
    ['PTPN11 (about half of NS) carries the JMML risk: germline variants at codons 61, 71, 72 and 76 mark the subgroup at risk. Neonatal transient myeloproliferative disorder progresses to JMML in ~10%. AACR suggests 3-monthly examination to age 1 for PTPN11/KRAS, with no routine bloods.', ['gr:NBK1124', 'us:aacr_ras']],
    ['PTPN11 variants typical of somatic JMML, when germline, cause neonatal-lethal NS. NS-associated JMML usually runs a milder course.', ['gr:NBK1124']],
    ['Embryonal RMS has been reported with germline SOS1 variants. Giant cell lesions (jaw, joints) occur with PTPN11, SOS1 and RAF1. NS with multiple lentigines is due to distinct PTPN11 variants (e.g. Y279C, T468M); follow NS surveillance for it.', ['gr:NBK1124', 'us:aacr_ras']]
  ],
  cbl: [
    ['Germline CBL variants are missense (e.g. the common p.Tyr371His). In JMML, the normal allele is lost through acquired isodisomy (LOH). CBL-JMML often regresses spontaneously, so watchful waiting is recommended, but vasculitis/arteritis may follow later.', ['us:aacr_ras', 'niemeyer2010']]
  ],
  costello: [
    ['HRAS p.Gly12Ser (>80% of patients) has a lower cancer risk (~9%) than p.Gly12Ala (~39%, higher malignancy rate confirmed) and p.Gly12Cys (~38%). p.Gly12Cys/Asp/Val and p.Gly60Val carry higher mortality. Surveillance is currently the same for all genotypes.', ['gr:NBK1507', 'us:aacr_ras', 'astiazaran2023']],
    ['No malignant tumours have been reported to date with p.Gly13Cys (distinct phenotype: dolichocilia, loose anagen hair) or with non-Gly12 substitutions.', ['gr:NBK1507', 'us:aacr_ras']],
    ['Overall cancer risk is ~13% by age 20 (childhood cancer SIR 42 in Kratz 2015). RMS and neuroblastoma occur in early childhood (no RMS after 14), while bladder TCC occurs from age 10 into adulthood.', ['gr:NBK1507', 'us:aacr_ras', 'astiazaran2023', 'kratz2015']]
  ],
  kit: [
    ['KIT exon 11 (juxtamembrane) variants are the most common in familial GIST and are strongly associated with hyperpigmentation, dysphagia and cutaneous/systemic mastocytosis; exon 17 variants (e.g. p.Asp820Tyr) feature dysphagia; exon 13 p.Asn655Lys has been linked to severe imatinib intolerance.', ['gr:NBK625142']],
    ['Only gain-of-function KIT variants cause familial GIST; GISTs are typically multifocal (often gastric) with diffuse interstitial cell of Cajal hyperplasia, which on histology may indicate a germline cause.', ['gr:NBK625142']]
  ],
  pdgfra: [
    ['Germline PDGFRA variants reported in familial GIST lie in exons 12, 14 and 18; exon 14 p.Pro653Leu is associated with gastric GIST and inflammatory fibroid polyps; exon 18 p.Asp846Val has additional somatic features (coarse facies, broad hands/feet, premature tooth loss).', ['gr:NBK625142']]
  ],
  pdgfrb: [
    ['Recurrent germline PDGFRB p.Arg561Cys and p.Pro660Thr cause autosomal dominant infantile myofibromatosis; a second somatic PDGFRB hit has been found in myofibromas.', ['cheung2013', 'martignetti2013']]
  ],
  tbxt: [
    ['The susceptibility allele is a germline duplication of the 6q27 region containing only TBXT (brachyury), so it is found by copy-number analysis rather than sequencing; familial cases are mainly intracranial (sacral familial chordoma points instead to TSC1/TSC2).', ['yang2009', 'us:aacr_brain']]
  ],
  ollier: [
    ['Post-zygotic mosaic IDH1 (mostly R132C/R132H) or IDH2 (R172S) variants are shared between separate lesions in one person but are usually absent or at low level in blood, so test enchondroma or tumour tissue.', ['pansuriya2011', 'amary2011']]
  ],
  fanconi: [
    ['Biallelic BRCA2 (FA-D1) and PALB2 (FA-N) give near-universal childhood cancer (97% by 6 y with BRCA2): acute leukaemia ~80% by 10 y plus medulloblastoma, Wilms and neuroblastoma, usually before 5 y; AACR advises brain MRI to 5 y and abdominal ultrasound to 7 y. BRCA2 intron 7 splice variants c.631+1G>A / c.631+2T>G cause AML before 3 y; hypomorphic BRCA2 alleles carry lower risk.', ['gr:NBK1401', 'us:aacr_gid']],
    ['FANCD1/BRCA2 variants upstream of or in exon 11 (RAD51-binding region) confer earlier, higher childhood cancer risk than two variants downstream of exon 11. FANCS/BRCA1 FA also gives very early tumours (4/10 under 6 y).', ['us:aacr_gid']],
    ['FANCA exon 27-30 (C-terminal) variants have been linked to a sharp rise in solid tumours from about age 20, approaching 100% by 45. FANCA/FANCC/FANCG myeloid neoplasms rarely arise before age 4.', ['gr:NBK1401', 'us:aacr_gid']],
    ['Biallelic vs monoallelic: heterozygous carriers are not at risk of FA, but heterozygous BRCA1, BRCA2, PALB2, BRIP1 and RAD51C variants carry their own adult breast/ovarian cancer risks. Solid-tumour risk is higher after HSCT.', ['gr:NBK1401', 'alter2018']]
  ],
  at: [
    ['Classic A-T (truncating, no ATM kinase activity) gives mainly childhood lymphoid malignancy: B-NHL, Hodgkin, T-ALL and T-PLL. Variant A-T (missense/splice alleles with residual activity) has milder neurology and less childhood haematological malignancy, but high adult solid-tumour risk, notably premenopausal breast cancer.', ['gr:NBK26468', 'us:aacr_gid']],
    ['Biallelic vs heterozygous ATM: heterozygous carriers (e.g. parents) do not have A-T but have about 2-3-fold breast cancer risk (ER+), plus pancreatic and prostate risk. c.7271T>G (p.Val2424Gly) carries higher breast risk (OR ~3.8) and UKCGG advises very-high-risk screening. Mothers of children with A-T should be offered at least moderate-risk breast surveillance. c.5763-1050A>G is a UK variant-A-T founder allele.', ['ukcgg:atm', 'gr:NBK26468']]
  ],
  nbs: [
    ['NBN c.657_661del5 (p.Lys219fs) is a Slavic founder variant: about 100% of NBS alleles in Slavic countries and over 70% in US patients; targeted testing for it can be done first.', ['us:aacr_gid', 'gr:NBK1176']],
    ['Heterozygous c.657del5 carriers have been reported at higher frequency in breast and prostate cancer in some populations, but ClinGen classifies NBN-hereditary breast cancer as Refuted, so heterozygous risk should not drive management on its own.', ['gr:NBK1176', 'clingen:NBN']],
    ['Radiosensitivity: radiotherapy for CNS tumours has caused severe complications and death in NBS, so consider NBS before radiotherapy in microcephalic children under 3 with solid tumours.', ['gr:NBK1176']]
  ],
  bloom: [
    ['Ashkenazi Jewish founder variant blmAsh (a frameshift in BLM); about 1% of Ashkenazi Jewish people are carriers.', ['us:aacr_gid', 'gr:NBK1398']],
    ['Biallelic vs heterozygous BLM: cancer risk in heterozygotes is unclear (ClinGen BLM-colorectal cancer: Limited), so heterozygous carriers should not be managed as Bloom syndrome.', ['gr:NBK1398', 'clingen:BLM']]
  ],
  rts: [
    ['Osteosarcoma risk is confined to RECQL4-related (type 2) RTS; ANAPC1-related (type 1) RTS gives juvenile cataracts without osteosarcoma. Other RECQL4 disorders: RAPADILINO (frequent lymphoma) and Baller-Gerold.', ['gr:NBK1237', 'us:aacr_gid']]
  ],
  werner: [
    ['Japanese founder variant WRN c.3139-1G>C (carrier frequency ~1:167 in Japan); Sardinian founder effect also reported. Cancer type may depend on variant position (papillary thyroid with N-terminal variants).', ['gr:NBK1514']]
  ],
  cebpa: [
    ['N-terminal germline CEBPA variants (before the p30 start codon at residue 120, usually frameshifts) carry ~80% lifetime AML risk; variants outside the N-terminus (transactivation or bZIP/leucine-zipper) ~50% (UKCGG; GeneReviews 40-50%) with poorer outcome. Leukaemia typically gains a second, somatic C-terminal CEBPA variant (biallelic CEBPA AML).', ['ukcgg:cebpa', 'gr:NBK47457']],
    ['Cured patients can develop new, independent leukaemias (often >2 years after remission) with a different somatic CEBPA variant. Avoid related donors carrying the variant for HSCT.', ['ukcgg:cebpa', 'gr:NBK47457']]
  ],
  runx1: [
    ['Lymphoid malignancies are part of RUNX1-FPDMM (T-ALL and B-cell malignancy). Myeloid transformation usually involves somatic loss of the wild-type RUNX1 allele, or UPD21, which can also cause false-negative germline tests on blood. Some missense/nonsense variants act dominant-negatively while frameshifts/deletions cause haploinsufficiency.', ['gr:NBK568319', 'us:aacr_heme']],
    ['Eczema/psoriasis in ~50% of families is a useful clue. Germline RUNX1 variants are common in RUNX1-mutated AML; avoid related donors carrying the variant.', ['ukcgg:runx1', 'gr:NBK568319']]
  ],
  gata2: [
    ['GATA2 deficiency covers MonoMAC (monocytopenia with mycobacterial infection, plus B/NK/dendritic-cell lymphopenia), familial MDS/AML, Emberger syndrome (lymphoedema with MDS), deafness, warts/HPV disease and pulmonary alveolar proteinosis. Lymphoedema (and viral infection) is more common with null/haploinsufficient variants; all variant types predispose to MDS/AML.', ['spinner2014', 'homan2021', 'ukcgg:gata2']],
    ['MDS is typically hypocellular in childhood/young adulthood. Monosomy 7 and somatic SETBP1/ASXL1/RUNX1/RAS mutations mark progression; HSCT ideally in the hypocellular MDS phase.', ['us:aacr_heme', 'ukcgg:gata2']]
  ],
  ddx41: [
    ['DDX41 is the commonest germline cause of adult MDS/AML (~3-8%, up to 8% of older AML). Onset is late (57-70 y; rare before 40), with 3:1 male excess, hypocellular marrow and normal karyotype; only ~30% have a family history. Germline variants are usually truncating, upstream of the helicase 2 domain.', ['ukcgg:ddx41', 'us:aacr_heme']],
    ['In 50-88% of DDX41 MDS/AML the tumour gains a second, somatic DDX41 variant, usually p.Arg525His in the C-terminal helicase domain at low VAF. A truncating DDX41 variant with R525H on tumour testing strongly suggests germline. R525H alone is somatic.', ['gr:NBK574843']]
  ],
  etv6: [
    ['ETV6 and B-ALL: germline-ETV6 childhood B-ALL is more often hyperdiploid and diagnosed at older ages than sporadic ALL. Somatic ETV6::RUNX1 fusion (~25% of paediatric B-ALL) is not heritable and does not imply a germline variant. Solid-tumour risk (colorectal reported) is undefined.', ['gr:NBK564234', 'ukcgg:etv6']]
  ],
  ankrd26: [
    ['Most pathogenic ANKRD26 variants are substitutions or small deletions in a 22-nucleotide 5\'UTR region that stop RUNX1/FLI1 repressing ANKRD26, so sequencing must cover the 5\'UTR. Truncating variants outside the 5\'UTR may predispose to myeloid disease without thrombocytopenia. Germline ANKRD26 has not been reported in childhood haematological malignancy, so surveillance can wait until adulthood.', ['gr:NBK507664', 'us:aacr_heme']]
  ],
  samd9l: [
    ['SAMD9/SAMD9L variants are gain-of-function. Haematopoiesis often \'rescues\' itself by losing the mutant allele (monosomy 7/del7q, UPD7q) or by somatic inactivating SAMD9L variants in cis. Monosomy 7 can resolve spontaneously in young children, or progress with SETBP1/ASXL1/RUNX1/RAS mutations, which complicates HSCT timing.', ['gr:NBK435692', 'us:aacr_heme']],
    ['Because of somatic reversion, a germline SAMD9L variant may be missed or called somatic in blood or marrow DNA; test non-haematopoietic tissue such as skin fibroblasts. SAMD9 (paralogue) causes MIRAGE syndrome with the same monosomy 7 risk.', ['gr:NBK435692', 'us:aacr_heme']]
  ],
  pax5: [
    ['Germline PAX5 c.547G>A (p.Gly183Ser, octapeptide domain) segregates with autosomal dominant B-ALL. The leukaemias show 9p deletion with loss of the wild-type allele (retention of mutant PAX5). Somatic PAX5 alterations are common in sporadic B-ALL and do not imply germline.', ['shah2013']]
  ],
  kdm3b: [
    ['KDM3B haploinsufficiency (missense and truncating, de novo or inherited) causes Diets-Jongmans syndrome: ID/DD, short stature and facial dysmorphism. Cancer risk is uncertain, based on single cases.', ['diets2019']]
  ],
  tbd: [
    ['TBD and head and neck SCC: early-onset HNSCC (especially tongue), or anogenital cancer before 50 without risk factors, may be the first sign of a TBD even without marrow failure. AACR advises annual ENT review from age 10 and dental review every 6 months.', ['gr:NBK22301', 'us:aacr_gid']],
    ['Inheritance determines severity: X-linked DKC1, biallelic AR genes and (usually de novo) TINF2 present in childhood, while heterozygous AD TERT/TERC/RTEL1 typically present in adulthood (pulmonary fibrosis, liver disease, MDS) and do better. Revertant mosaicism in blood is reported with TERC; somatic TERT-promoter or DKC1 back-mutations can improve haematopoiesis.', ['us:aacr_gid', 'us:aacr_heme', 'gr:NBK22301']],
    ['Long-telomere disorders (e.g. POT1 tumour predisposition) are a distinct adult cancer predisposition (melanoma, CLL, angiosarcoma, glioma) and should not be scored as TBD.', ['us:aacr_gid', 'gr:NBK22301']]
  ]
};

/* HGNC IDs for ClinGen gene pages. */
const CLINGEN_HGNC = {
  DKC1: 'HGNC:2890', TINF2: 'HGNC:11824', SAMD9: 'HGNC:1348',
  ANKRD26: 'HGNC:29186', APC: 'HGNC:583', ATM: 'HGNC:795', BAP1: 'HGNC:950', BARD1: 'HGNC:952', BLM: 'HGNC:1058',
  BMPR1A: 'HGNC:1076', BRCA1: 'HGNC:1100', BRCA2: 'HGNC:1101', BRIP1: 'HGNC:20473', BUB1B: 'HGNC:1149',
  CBL: 'HGNC:1541', CDC73: 'HGNC:16783', CDK4: 'HGNC:1773', CDKN1B: 'HGNC:1785', CDKN2A: 'HGNC:1787',
  CEBPA: 'HGNC:1833', CEP57: 'HGNC:30794', CHEK2: 'HGNC:16627', CTNNA1: 'HGNC:2509', DDB2: 'HGNC:2718',
  DDX41: 'HGNC:18674', DICER1: 'HGNC:17098', DIS3L2: 'HGNC:28648', EPCAM: 'HGNC:11529', ERCC2: 'HGNC:3434',
  ERCC3: 'HGNC:3435', ERCC4: 'HGNC:3436', ERCC5: 'HGNC:3437', ETV6: 'HGNC:3495', EZH2: 'HGNC:3527',
  FANCA: 'HGNC:3582', FANCB: 'HGNC:3583', FANCC: 'HGNC:3584', FANCD2: 'HGNC:3585', FANCE: 'HGNC:3586',
  FANCF: 'HGNC:3587', FANCG: 'HGNC:3588', FANCI: 'HGNC:25568', FANCL: 'HGNC:20748', FLCN: 'HGNC:27310',
  GREM1: 'HGNC:2001', IDH2: 'HGNC:5383', KIT: 'HGNC:6342', MAX: 'HGNC:6913', MEN1: 'HGNC:7010', MET: 'HGNC:7029',
  MLH1: 'HGNC:7127', MSH2: 'HGNC:7325', MSH6: 'HGNC:7329', MUTYH: 'HGNC:7527', NBN: 'HGNC:7652', NTHL1: 'HGNC:8028',
  PALB2: 'HGNC:26144', PAX5: 'HGNC:8619', PDGFRA: 'HGNC:8803', PHOX2B: 'HGNC:9143', PMS2: 'HGNC:9122',
  POLE: 'HGNC:9177', POLH: 'HGNC:9181', PRKAR1A: 'HGNC:9388', PTCH1: 'HGNC:9585', RAD51C: 'HGNC:9820',
  RAD51D: 'HGNC:9823', RB1: 'HGNC:9884', RECQL4: 'HGNC:9949', RET: 'HGNC:9967', RHBDF2: 'HGNC:20788',
  RNF43: 'HGNC:18505', RUNX1: 'HGNC:10471', SDHA: 'HGNC:10680', SDHAF2: 'HGNC:26034', SDHB: 'HGNC:10681',
  SDHC: 'HGNC:10682', SDHD: 'HGNC:10683', SLX4: 'HGNC:23845', SMAD4: 'HGNC:6770', SMARCA4: 'HGNC:11100',
  SMARCB1: 'HGNC:11103', SMARCE1: 'HGNC:11109', STK11: 'HGNC:11389', SUFU: 'HGNC:16466', TERC: 'HGNC:11727',
  TERT: 'HGNC:11730', TMEM127: 'HGNC:26038', TRIM37: 'HGNC:7523', VHL: 'HGNC:12687', WRN: 'HGNC:12791',
  WT1: 'HGNC:12796', XPA: 'HGNC:12814', XPC: 'HGNC:12816', CDH1: 'HGNC:1748', NF1: 'HGNC:7765', KDM3B: 'HGNC:1337',
  FANCM: 'HGNC:23168', ALK: 'HGNC:427', FH: 'HGNC:3700', GATA2: 'HGNC:4171', HRAS: 'HGNC:5173', KRAS: 'HGNC:6407',
  LZTR1: 'HGNC:6742', NRAS: 'HGNC:7989', PTPN11: 'HGNC:9644', RAF1: 'HGNC:9829', SHOC2: 'HGNC:15454',
  SOS1: 'HGNC:11187', TP53: 'HGNC:11998', POLD1: 'HGNC:9175', CTR9: 'HGNC:16850', SAMD9L: 'HGNC:1349',
  NHP2: 'HGNC:14377', GPC3: 'HGNC:4451', MBD4: 'HGNC:6919', NSD1: 'HGNC:14234', PTEN: 'HGNC:9588',
  RTEL1: 'HGNC:15888', POT1: 'HGNC:17284', WRAP53: 'HGNC:25522', NF2: 'HGNC:7773', CDKN1C: 'HGNC:1786',
  ELP1: 'HGNC:5959', GPR161: 'HGNC:23694'
};

/* Genes with CanVar-UK gene-specific variant interpretation pages. */
const CANVAR_GENES = [
  'BRCA1', 'BRCA2', 'MLH1', 'MSH2', 'MSH6', 'PMS2', 'AIP', 'ALK', 'ANKRD26', 'APC', 'ATM', 'BAP1', 'BARD1', 'BLM',
  'BMPR1A', 'BRIP1', 'BUB1B', 'CBL', 'CDC73', 'CDH1', 'CDK4', 'CDKN1C', 'CDKN2A', 'CEBPA', 'CEP57', 'CHEK2', 'DDB2',
  'DDX41', 'DICER1', 'DIS3L2', 'EPCAM', 'ERCC2', 'ERCC3', 'ERCC4', 'ERCC5', 'ETV6', 'EZH2', 'FANCA', 'FANCB',
  'FANCC', 'FANCD2', 'FANCE', 'FANCF', 'FANCG', 'FANCI', 'FANCL', 'FANCM', 'FH', 'FLCN', 'GATA2', 'GPC3', 'GREM1',
  'HRAS', 'KIT', 'KRAS', 'LZTR1', 'MAX', 'MEN1', 'MET', 'MUTYH', 'NBN', 'NF1', 'NF2', 'NSD1', 'NTHL1', 'PALB2',
  'PAX5', 'PDGFRA', 'PHOX2B', 'POLD1', 'POLE', 'POT1', 'PRKAR1A', 'PTCH1', 'PTEN', 'RAD51C', 'RAD51D', 'RB1',
  'RECQL4', 'RET', 'RHBDF2', 'RNF43', 'RUNX1', 'SDHA', 'SDHAF2', 'SDHB', 'SDHC', 'SDHD', 'SLX4', 'SMAD4', 'SMARCA4',
  'SMARCB1', 'SMARCE1', 'STK11', 'SUFU', 'TERT', 'TMEM127', 'TP53', 'TSC1', 'TSC2', 'VHL', 'WRN', 'WT1', 'XPA',
  'XPC'
];

/*
 * GeNotes (NHS England Genomics Education Programme, "Genomic notes for clinicians"): Knowledge Hub pages and
 * In the Clinic pathways relevant to each condition. [page title, path under GENOTES_BASE]; titles taken from the live pages.
 */
const GENOTES_BASE = 'https://www.genomicseducation.hee.nhs.uk/genotes/';
const GENOTES = {
  brca1: [
    ['BRCA1 and BRCA2-associated cancer risk', 'knowledge-hub/brca1-and-brca2/'],
    ['Presentation: Patient with a relative who has a pathogenic BRCA variant', 'in-the-clinic/presentation-patient-with-a-relative-who-has-a-pathogenic-brca-variant/'],
    ['Results: Patient with breast cancer and a constitutional (germline) BRCA1 or BRCA2 variant', 'in-the-clinic/results-patient-with-breast-cancer-and-a-constitutional-germline-brca1-or-brca2-variant/'],
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/']
  ],
  brca2: [
    ['BRCA1 and BRCA2-associated cancer risk', 'knowledge-hub/brca1-and-brca2/'],
    ['Presentation: Patient with a relative who has a pathogenic BRCA variant', 'in-the-clinic/presentation-patient-with-a-relative-who-has-a-pathogenic-brca-variant/'],
    ['Results: Patient with breast cancer and a constitutional (germline) BRCA1 or BRCA2 variant', 'in-the-clinic/results-patient-with-breast-cancer-and-a-constitutional-germline-brca1-or-brca2-variant/'],
    ['Presentation: Patient with male breast cancer', 'in-the-clinic/presentation-patient-with-male-breast-cancer/'],
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/']
  ],
  palb2: [
    ['PALB2', 'knowledge-hub/palb2/'],
    ['Results: Patient with breast cancer and a constitutional (germline) PALB2 variant', 'in-the-clinic/results-patient-with-breast-cancer-and-a-constitutional-germline-palb2-variant/'],
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/']
  ],
  atm: [
    ['ATM-associated cancer risk', 'knowledge-hub/atm-associated-cancer-risk/'],
    ['Results: Patient with breast cancer and a constitutional (germline) pathogenic ATM variant', 'in-the-clinic/results-patient-with-breast-cancer-and-a-constitutional-germline-pathogenic-atm-variant/'],
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/']
  ],
  chek2: [
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/']
  ],
  bard1: [
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/']
  ],
  rad51c: [
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/'],
    ['Presentation: Patient with ovarian cancer', 'in-the-clinic/presentation-patient-with-ovarian-cancer/']
  ],
  rad51d: [
    ['Presentation: Patient with a family history of breast cancer', 'in-the-clinic/presentation-patient-with-a-family-history-of-breast-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/'],
    ['Presentation: Patient with ovarian cancer', 'in-the-clinic/presentation-patient-with-ovarian-cancer/']
  ],
  brip1: [
    ['Presentation: Patient with ovarian cancer', 'in-the-clinic/presentation-patient-with-ovarian-cancer/'],
    ['Presentation: Patient with a family history of breast and/or ovarian cancer', 'in-the-clinic/patient-with-a-family-history-of-breast-and-or-ovarian-cancer/']
  ],
  lynch_mlh1: [
    ['Lynch syndrome', 'knowledge-hub/lynch-syndrome/'],
    ['Mismatch repair deficiency and microsatellite instability', 'knowledge-hub/mismatch-repair-deficiency-and-microsatellite-instability/'],
    ['Presentation: Patient with suspected Lynch syndrome', 'in-the-clinic/presentation-patient-with-suspected-lynch-syndrome/'],
    ['Presentation: Patient with a genetic diagnosis of Lynch syndrome', 'in-the-clinic/presentation-patient-with-a-genetic-diagnosis-of-lynch-syndrome/']
  ],
  lynch_msh2: [
    ['Lynch syndrome', 'knowledge-hub/lynch-syndrome/'],
    ['Mismatch repair deficiency and microsatellite instability', 'knowledge-hub/mismatch-repair-deficiency-and-microsatellite-instability/'],
    ['Presentation: Patient with suspected Lynch syndrome', 'in-the-clinic/presentation-patient-with-suspected-lynch-syndrome/'],
    ['Presentation: Patient with a genetic diagnosis of Lynch syndrome', 'in-the-clinic/presentation-patient-with-a-genetic-diagnosis-of-lynch-syndrome/']
  ],
  lynch_msh6: [
    ['Lynch syndrome', 'knowledge-hub/lynch-syndrome/'],
    ['Mismatch repair deficiency and microsatellite instability', 'knowledge-hub/mismatch-repair-deficiency-and-microsatellite-instability/'],
    ['Presentation: Patient with suspected Lynch syndrome', 'in-the-clinic/presentation-patient-with-suspected-lynch-syndrome/'],
    ['Presentation: Patient with a genetic diagnosis of Lynch syndrome', 'in-the-clinic/presentation-patient-with-a-genetic-diagnosis-of-lynch-syndrome/']
  ],
  lynch_pms2: [
    ['Lynch syndrome', 'knowledge-hub/lynch-syndrome/'],
    ['Mismatch repair deficiency and microsatellite instability', 'knowledge-hub/mismatch-repair-deficiency-and-microsatellite-instability/'],
    ['Presentation: Patient with suspected Lynch syndrome', 'in-the-clinic/presentation-patient-with-suspected-lynch-syndrome/'],
    ['Presentation: Patient with a genetic diagnosis of Lynch syndrome', 'in-the-clinic/presentation-patient-with-a-genetic-diagnosis-of-lynch-syndrome/']
  ],
  cmmrd: [
    ['Mismatch repair deficiency and microsatellite instability', 'knowledge-hub/mismatch-repair-deficiency-and-microsatellite-instability/'],
    ['Lynch syndrome', 'knowledge-hub/lynch-syndrome/']
  ],
  fap: [
    ['Familial adenomatous polyposis', 'knowledge-hub/familial-adenomatous-polyposis/'],
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  map: [
    ['MUTYH-associated polyposis', 'knowledge-hub/mutyh-associated-polyposis/'],
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  nthl1: [
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  ppap: [
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  mbd4: [
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  jps_smad4: [
    ['Juvenile polyposis syndrome', 'knowledge-hub/juvenile-polyposis-syndrome/'],
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  jps_bmpr1a: [
    ['Juvenile polyposis syndrome', 'knowledge-hub/juvenile-polyposis-syndrome/'],
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  hmps: [
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  rnf43: [
    ['Serrated polyposis syndrome', 'knowledge-hub/serrated-polyposis-syndrome/'],
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  pjs: [
    ['Peutz-Jeghers syndrome', 'knowledge-hub/peutz-jeghers-syndrome/'],
    ['Presentation: Patient with polyposis', 'in-the-clinic/presentation-patient-with-polyposis/'],
    ['Presentation: Person with a family history of polyposis', 'in-the-clinic/presentation-person-with-a-family-history-of-polyposis/']
  ],
  phts: [
    ['PTEN syndrome', 'knowledge-hub/pten-syndrome/'],
    ['Presentation: Clinical suspicion of PTEN hamartoma tumour syndrome', 'in-the-clinic/presentation-clinical-suspicion-of-pten-hamartoma-tumour-syndrome/']
  ],
  hdgc: [
    ['Hereditary diffuse gastric cancer syndrome (CDH1-related)', 'knowledge-hub/hereditary-diffuse-gastric-cancer-syndrome-cdh1-related/'],
    ['Presentation: Patient with diffuse gastric cancer', 'in-the-clinic/presentation-patient-with-diffuse-gastic-cancer/'],
    ['Presentation: Patient with lobular breast cancer and a strong family history of diffuse gastric cancer', 'in-the-clinic/presentation-patient-with-lobular-breast-cancer-and-a-strong-family-history-of-diffuse-gastric-cancer/']
  ],
  ctnna1: [
    ['Hereditary diffuse gastric cancer syndrome (CDH1-related)', 'knowledge-hub/hereditary-diffuse-gastric-cancer-syndrome-cdh1-related/'],
    ['Presentation: Patient with diffuse gastric cancer', 'in-the-clinic/presentation-patient-with-diffuse-gastic-cancer/']
  ],
  lfs: [
    ['Heritable TP53-related cancer syndromes', 'knowledge-hub/heritable-tp53-related-cancer-syndromes/'],
    ['Adrenocortical carcinoma', 'knowledge-hub/adrenocortical-carcinoma/']
  ],
  men1: [
    ['Multiple endocrine neoplasia type 1', 'knowledge-hub/multiple-endocrine-neoplasia-type-1/'],
    ['Endocrine neoplasia', 'knowledge-hub/endocrine-neoplasia/'],
    ['Presentation: Patient with possible multiple endocrine neoplasia type 1', 'in-the-clinic/presentation-patient-with-possible-multiple-endocrine-neoplasia-type-1/'],
    ['Presentation: Patient with endocrine neoplasia', 'in-the-clinic/presentation-patient-with-endocrine-neoplasia/']
  ],
  men4: [
    ['Multiple endocrine neoplasia type 4', 'knowledge-hub/multiple-endocrine-neoplasia-type-4/'],
    ['Endocrine neoplasia', 'knowledge-hub/endocrine-neoplasia/'],
    ['Presentation: Patient with endocrine neoplasia', 'in-the-clinic/presentation-patient-with-endocrine-neoplasia/']
  ],
  men2: [
    ['Multiple endocrine neoplasia type 2', 'knowledge-hub/multiple-endocrine-neoplasia-type-2/'],
    ['Endocrine neoplasia', 'knowledge-hub/endocrine-neoplasia/'],
    ['Presentation: Patient with medullary thyroid carcinoma', 'in-the-clinic/presentation-patient-with-medullary-thyroid-carcinoma/'],
    ['Presentation: Patient with endocrine neoplasia', 'in-the-clinic/presentation-patient-with-endocrine-neoplasia/']
  ],
  hptjt: [
    ['Familial hyperparathyroidism', 'knowledge-hub/familial-hyperparathyroidism/'],
    ['Parathyroid carcinoma', 'knowledge-hub/parathyroid-carcinoma/'],
    ['Presentation: Patient with parathyroid carcinoma', 'in-the-clinic/presentation-patient-with-parathyroid-carcinoma/'],
    ['Presentation: Patient with possible familial hyperparathyroidism', 'in-the-clinic/presentation-patient-with-possible-familial-hyperparathyroidism/']
  ],
  fipa: [
    ['Pituitary adenoma', 'knowledge-hub/pituitary-adenoma/'],
    ['Endocrine neoplasia', 'knowledge-hub/endocrine-neoplasia/']
  ],
  carney: [
    ['Carney complex', 'knowledge-hub/carney-complex/']
  ],
  mas: [
    ['McCune-Albright syndrome', 'knowledge-hub/mccune-albright-syndrome/']
  ],
  vhl: [
    ['Renal cancer', 'knowledge-hub/renal-cancer/'],
    ['Presentation: Patient with renal cell cancer', 'in-the-clinic/presentation-patient-with-renal-cell-cancer/'],
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  sdhb: [
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  sdhd: [
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  sdhc: [
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  sdha: [
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  sdhaf2: [
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  tmem127: [
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  max: [
    ['Inherited phaeochromocytoma and paraganglioma', 'knowledge-hub/inherited-phaeochromocytoma-and-paraganglioma/'],
    ['Presentation: Patient with phaeochromocytoma or extra-adrenal paraganglioma', 'in-the-clinic/presentation-patient-with-phaeochromocytoma-or-extra-adrenal-paraganglioma/']
  ],
  hlrcc: [
    ['Fumarate hydratase tumour predisposition syndrome (including hereditary leiomyomatosis and renal cell cancer)', 'knowledge-hub/fumarate-hydratase-tumour-predisposition-syndrome-including-hereditary-leiomyomatosis-and-renal-cell-cancer/'],
    ['Renal cancer', 'knowledge-hub/renal-cancer/'],
    ['Presentation: Patient with renal cell cancer', 'in-the-clinic/presentation-patient-with-renal-cell-cancer/'],
    ['Presentation: Patient with multiple benign skin tumours with a suspected genetic cause', 'in-the-clinic/presentation-patient-with-multiple-benign-skin-tumours-with-a-suspected-genetic-cause/']
  ],
  bhd: [
    ['Birt-Hogg-Dubé syndrome', 'knowledge-hub/birt-hogg-dube-syndrome/'],
    ['Renal cancer', 'knowledge-hub/renal-cancer/'],
    ['Presentation: Patient with renal cell cancer', 'in-the-clinic/presentation-patient-with-renal-cell-cancer/'],
    ['Presentation: Patient with multiple benign skin tumours with a suspected genetic cause', 'in-the-clinic/presentation-patient-with-multiple-benign-skin-tumours-with-a-suspected-genetic-cause/']
  ],
  hprc: [
    ['Renal cancer', 'knowledge-hub/renal-cancer/'],
    ['Presentation: Patient with renal cell cancer', 'in-the-clinic/presentation-patient-with-renal-cell-cancer/']
  ],
  tsc: [
    ['Tuberous sclerosis complex', 'knowledge-hub/tuberous-sclerosis-complex/']
  ],
  bap1: [
    ['Presentation: Patient with uveal melanoma', 'in-the-clinic/presentation-patient-with-uveal-melanoma/'],
    ['Presentation: Patient with renal cell cancer', 'in-the-clinic/presentation-patient-with-renal-cell-cancer/']
  ],
  cdkn2a: [
    ['Presentation: Patient with cutaneous melanoma', 'in-the-clinic/presentation-patient-with-cutaneous-melanoma/'],
    ['Presentation: Patient with a family history of skin cancer', 'in-the-clinic/patient-with-a-family-history-of-skin-cancer/'],
    ['Pancreatic cancer', 'knowledge-hub/pancreatic-cancer/']
  ],
  cdk4: [
    ['Presentation: Patient with cutaneous melanoma', 'in-the-clinic/presentation-patient-with-cutaneous-melanoma/'],
    ['Presentation: Patient with a family history of skin cancer', 'in-the-clinic/patient-with-a-family-history-of-skin-cancer/']
  ],
  pot1: [
    ['Presentation: Patient with cutaneous melanoma', 'in-the-clinic/presentation-patient-with-cutaneous-melanoma/'],
    ['Presentation: Patient with a family history of skin cancer', 'in-the-clinic/patient-with-a-family-history-of-skin-cancer/']
  ],
  gorlin: [
    ['Gorlin syndrome', 'knowledge-hub/gorlin-syndrome/']
  ],
  sufu: [
    ['Gorlin syndrome', 'knowledge-hub/gorlin-syndrome/']
  ],
  xp: [
    ['Xeroderma pigmentosum', 'knowledge-hub/xeroderma-pigmentosum/']
  ],
  nf1: [
    ['Neurofibromatosis type 1', 'knowledge-hub/neurofibromatosis-type-1/'],
    ['RASopathies', 'knowledge-hub/rasopathies/'],
    ['Presentation: Patient with neurofibromatosis type 1', 'in-the-clinic/presentation-patient-with-neurofibromatosis-type-1/']
  ],
  noonan: [
    ['RASopathies', 'knowledge-hub/rasopathies/']
  ],
  cbl: [
    ['RASopathies', 'knowledge-hub/rasopathies/']
  ],
  costello: [
    ['RASopathies', 'knowledge-hub/rasopathies/']
  ],
  bws: [
    ['Beckwith-Wiedemann syndrome', 'knowledge-hub/beckwith-wiedemann-syndrome/']
  ],
  sotos: [
    ['Sotos syndrome', 'knowledge-hub/sotos-syndrome/']
  ],
  fanconi: [
    ['Fanconi anaemia', 'knowledge-hub/fanconi-anaemia/'],
    ['Presentation: Clinical suspicion of Fanconi anaemia', 'in-the-clinic/presentation-clinical-suspicion-of-fanconi-anaemia/']
  ],
  nbs: [
    ['Nijmegen breakage syndrome', 'knowledge-hub/nijmegen-breakage-syndrome/']
  ],
  at: [
    ['Ataxia telangiectasia', 'knowledge-hub/ataxia-telangiectasia/']
  ]
};

const REF_LINKS = {
  clingen: g => `https://search.clinicalgenome.org/kb/genes/${CLINGEN_HGNC[g]}`,
  canvar: g => `https://canvaruk.org/${g}/genespecview`,
  geneReviews: nbk => `https://www.ncbi.nlm.nih.gov/books/${nbk}/`,
  geneReviewsSearch: q => `https://www.ncbi.nlm.nih.gov/books/NBK1116/?term=${encodeURIComponent(q)}`,
  omim: mim => `https://www.omim.org/entry/${mim}`,
  ukcgg: 'https://www.ukcgg.org/information-education/ukcgg-leaflets-and-guidelines/'
};
