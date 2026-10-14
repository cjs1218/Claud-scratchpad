/* Search help for the Explorer: everyday and US wording mapped to the wording the Test Directory uses.
 * TDX_SYNONYMS: groups of words or phrases that mean the same for searching; a search for any one finds the others.
 *   Keep each group to genuine equivalents – a search must never broaden to a different condition.
 * TDX_SPELLING: US → UK spelling fragments (the Directory uses UK spelling), applied to each search word. */
const TDX_SYNONYMS = [
  ['hearing loss', 'deafness', 'deaf', 'hearing impairment'],
  ['intellectual disability', 'learning disability', 'learning disabilities', 'learning difficulty', 'learning difficulties'],
  ['epilepsy', 'seizures', 'seizure', 'fits', 'convulsions'],
  ['heart', 'cardiac'],
  ['kidney', 'renal'],
  ['liver', 'hepatic'],
  ['bowel cancer', 'colorectal cancer', 'colon cancer'],
  ['womb cancer', 'endometrial cancer', 'uterine cancer'],
  ['stillbirth', 'still birth', 'intrauterine death'],
  ['miscarriage', 'pregnancy loss'],
  ['blindness', 'visual impairment', 'sight loss'],
  ['sudden death', 'sudden cardiac death'],
  ['fainting', 'syncope'],
  ['high cholesterol', 'hypercholesterolaemia'],
  ['short stature', 'growth failure'],
  ['skeletal dysplasia', 'dwarfism'],
  ['NF1', 'neurofibromatosis type 1'],
  ['NF2', 'neurofibromatosis type 2'],
  ['Down syndrome', 'Down’s syndrome', "Down's syndrome", 'trisomy 21'],
  ['Edwards syndrome', 'Edwards’ syndrome', 'trisomy 18'],
  ['Patau syndrome', 'Patau’s syndrome', 'trisomy 13'],
  ['Turner syndrome', 'monosomy X'],
  ['Lynch syndrome', 'HNPCC', 'hereditary non-polyposis colorectal cancer'],
  ['MND', 'motor neurone disease', 'motor neuron disease'],
];
const TDX_SPELLING = [
  ['tumor', 'tumour'], ['anemia', 'anaemia'], ['anemic', 'anaemic'], ['hemo', 'haemo'], ['hema', 'haema'], ['hemat', 'haemat'],
  ['hemorrh', 'haemorrh'], ['leukemia', 'leukaemia'], ['pediatric', 'paediatric'], ['esophag', 'oesophag'], ['edema', 'oedema'],
  ['estrogen', 'oestrogen'], ['estradiol', 'oestradiol'], ['orthopedic', 'orthopaedic'], ['gynecolog', 'gynaecolog'],
  ['ischemi', 'ischaemi'], ['glycemi', 'glycaemi'], ['lipidemi', 'lipidaemi'], ['calcemi', 'calcaemi'], ['kalemi', 'kalaemi'],
  ['natremi', 'natraemi'], ['uremi', 'uraemi'], ['cholesterolemi', 'cholesterolaemi'], ['center', 'centre'], ['color', 'colour'],
  ['behavior', 'behaviour'], ['diarrhea', 'diarrhoea'], ['celiac', 'coeliac'], ['ization', 'isation'], ['ize', 'ise'],
];
