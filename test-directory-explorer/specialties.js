/* Requesting specialties as the eligibility criteria word them (lower case) → the filter group(s) they belong to.
 * The indication pages always show the PDF wording; only the "Requesting specialty" filter uses these groups.
 * Rules: spelling and capital-letter variants merge; footnote marks (*) and qualifiers ("(in liaison with …)") file
 * under the main specialty; entries naming two specialties file under both; paediatric sub-specialties file under the
 * parent specialty and Paediatrics; open-ended entries ("Other", "Appropriate specialist …") form their own group.
 * tests/explorer.test.js fails if the data has a specialty that is not listed here. */
const TDX_SPECIALTY_ANY = 'Any appropriate specialist';
const TDX_SPECIALTIES = {
  'allergy specialists': ['Allergy specialists'],
  'appropriate specialist referring clinician': [TDX_SPECIALTY_ANY],
  'other': [TDX_SPECIALTY_ANY],
  'audiology': ['Audiology'],
  'audiology/audiovestibular medicine': ['Audiology'],
  'cancer': ['Cancer'],
  'cardiology': ['Cardiology'],
  'cf service,': ['CF service'],
  'chemical pathology': ['Chemical Pathology'],
  'cleft clinics': ['Cleft clinics'],
  'clinical genetics': ['Clinical Genetics'],
  'clinical genetics (in liaison with designated doctor for child deaths)': ['Clinical Genetics'],
  'clinical genetics and/or other appropriate specialist referring clinician': ['Clinical Genetics', TDX_SPECIALTY_ANY],
  'community paediatrics': ['Community Paediatrics'],
  'dermatology': ['Dermatology'],
  'ear, nose and throat': ['Ear, Nose and Throat'],
  'endocrinology': ['Endocrinology'],
  'paediatric endocrinology': ['Endocrinology', 'Paediatrics'],
  'fertility centres': ['Reproductive medicine and fertility'],
  'reproductive medicine': ['Reproductive medicine and fertility'],
  'fetal medicine': ['Fetal Medicine'],
  'gastroenterology': ['Gastroenterology'],
  'general practice': ['General Practice'],
  'genomic laboratory': ['Genomics Laboratory'],
  'genomics laboratory': ['Genomics Laboratory'],
  'gynaecology': ['Gynaecology'],
  'urology / gynaecology': ['Urology', 'Gynaecology'],
  'haematology': ['Haematology'],
  'hepatology': ['Hepatology'],
  'histopathology': ['Pathology and histopathology'],
  'pathology': ['Pathology and histopathology'],
  'immunology': ['Immunology'],
  'immunology (+/- paediatrics)': ['Immunology'],
  'intensive care': ['Intensive Care'],
  'metabolic medicine': ['Metabolic Medicine'],
  'midwifery': ['Midwifery'],
  'specialist midwifery': ['Specialist Midwifery'],
  'neonatology': ['Neonatology'],
  'nephrology': ['Nephrology'],
  'renal': ['Nephrology'],
  'neurology': ['Neurology'],
  'paediatric neurology': ['Neurology', 'Paediatrics'],
  'neurosurgery': ['Neurosurgery'],
  'obstetrics': ['Obstetrics'],
  'oncology': ['Oncology'],
  'oncology*': ['Oncology'],
  'paediatric oncology': ['Oncology', 'Paediatrics'],
  'ophthalmology': ['Ophthalmology'],
  'orthopaedics': ['Orthopaedics'],
  'paediatrics': ['Paediatrics'],
  'paediatrics (in liaison with designated doctor for child deaths)': ['Paediatrics'],
  'paediatrics (on agreement with paediatric hepatologist)': ['Paediatrics'],
  'psychiatry': ['Psychiatry'],
  'respiratory medicine': ['Respiratory Medicine'],
  'paediatric respiratory medicine': ['Respiratory Medicine', 'Paediatrics'],
  'rheumatology': ['Rheumatology'],
  'specialist diabetes clinics': ['Specialist Diabetes Clinics'],
  'surgery': ['Surgery'],
  'surgery*': ['Surgery'],
  'surgery (head/neck/endocrine)': ['Surgery'],
  'surgical dentistry': ['Surgical Dentistry'],
  'urology': ['Urology'],
};
/* Where an indication's footnote says which specialists a footnoted entry covers, that indication's entry files under
 * those groups too (the page still shows the PDF wording and footnote). Keyed by indication, then the wording as above.
 * tests/explorer.test.js checks each entry against the indication's specialties and footnote. */
const TDX_SPECIALTY_FOOTNOTES = {
  // "* Surgery to cover colorectal and gynecological surgeons"
  R210: { 'surgery*': ['Surgery', 'Gynaecology'] },
  // "*including paediatrics"
  R216: { 'oncology*': ['Oncology', 'Paediatrics'] },
  R414: { 'oncology*': ['Oncology', 'Paediatrics'] }
};
