/* Corrections to obvious typos and punctuation in the eligibility criteria, shown only in the formatted layout. Each one
 * is marked on the page (hover shows the PDF wording) and "Show as in the PDF" always shows the original text.
 * Entry: [indication, exact text in the PDF (must occur once in that indication's criteria, overlapping indications or
 * pathway), corrected text, kind]. Kinds:
 *   spelling    – a misspelt word (the fix may differ from the PDF by at most 3 letters)
 *   punctuation – spaces, full stops, commas, apostrophes, hyphens only (the letters are unchanged)
 *   break       – a missing full stop between two sentences, or a heading run into the line before; "\n" starts a new line
 *   heading     – a section heading run onto the end of the line before: shown on its own line in bold (no words change)
 * tests/explorer.test.js checks every entry against these rules and the data. When the directory is updated, entries
 * whose text no longer appears are reported by the test and should be removed. */
const TDX_CORRECTIONS = [
  // Spelling
  ['R249', 'different varints', 'different variants', 'spelling'],
  ['R333', 'PHOX2B-reated features', 'PHOX2B-related features', 'spelling'],
  ['R80', 'congenital myaesthenia', 'congenital myasthenia', 'spelling'],
  ['R43', 'blepharohimosis', 'blepharophimosis', 'spelling'],
  ['R237', 'Rothmund- Thompson syndrome', 'Rothmund-Thomson syndrome', 'spelling'],
  ['R414', 'Rubenstein Taybi', 'Rubinstein-Taybi', 'spelling'],
  ['R231', 'vacuolate lymphocytes', 'vacuolated lymphocytes', 'spelling'],
  ['R318', 'in the absences of', 'in the absence of', 'spelling'],
  // Apostrophes, stray spaces and doubled punctuation
  ['R150', 'autoimmune Addisons disease', 'autoimmune Addison’s disease', 'punctuation'],
  ['R156', 'during Liddles test', 'during Liddle’s test', 'punctuation'],
  ['R343', 'Blaschkos lines', 'Blaschko’s lines', 'punctuation'],
  ['R85', 'common aneuploidy testing .', 'common aneuploidy testing.', 'punctuation'],
  ['R207', '(STIC) , OR', '(STIC), OR', 'punctuation'],
  ['R444', 'pathological high grade ,', 'pathological high grade,', 'punctuation'],
  ['R409', '(if informative),.', '(if informative).', 'punctuation'],
  ['R452', 'At presentation,.', 'At presentation.', 'punctuation'],
  ['R229', 'R27Paediatric disorders ,', 'R27 Paediatric disorders,', 'punctuation'],
  ['R101', 'eds.sheffield@nhs.net .', 'eds.sheffield@nhs.net.', 'punctuation'],
  ['R85', 'through screening )', 'through screening)', 'punctuation'],
  ['R225', 'extra- adrenal', 'extra-adrenal', 'punctuation'],
  ['R228', 'Non- renal hamartomas', 'Non-renal hamartomas', 'punctuation'],
  ['R343', 'hypo- pigmentation', 'hypo-pigmentation', 'punctuation'],
  ['R454', 'calcium- channel blockers', 'calcium-channel blockers', 'punctuation'],
  // Web addresses broken by a line wrap in the PDF (they now work as links)
  ['R62', 'https://www.uclh.nhs.uk/our- services/', 'https://www.uclh.nhs.uk/our-services/', 'punctuation'],
  ['R411', 'Surgical- sperm-retrieval', 'Surgical-sperm-retrieval', 'punctuation'],
  ['R431', 'Methylation-Array-Panel- content-for-EpiSign', 'Methylation-Array-Panel-content-for-EpiSign', 'punctuation'],
  // Missing full stops between sentences
  ['R15', 'consultant immunologist Indications include', 'consultant immunologist. Indications include', 'break'],
  ['R17', 'absent SAP expression Typical features', 'absent SAP expression. Typical features', 'break'],
  ['R18', 'absent XIAP expression Typical features', 'absent XIAP expression. Typical features', 'break'],
  ['R21', 'disorder is likely This indication', 'disorder is likely. This indication', 'break'],
  ['R21', 'Consultant Clinical Geneticist Referral for testing', 'Consultant Clinical Geneticist. Referral for testing', 'break'],
  ['R28', 'Williams syndrome Where possible', 'Williams syndrome. Where possible', 'break'],
  ['R31', 'urine reducing substances Where additional', 'urine reducing substances. Where additional', 'break'],
  ['R32', 'likely to be monogenic Please note', 'likely to be monogenic. Please note', 'break'],
  ['R91', 'Fanconi anaemia is unlikely This includes', 'Fanconi anaemia is unlikely. This includes', 'break'],
  ['R102', 'reproductive choices Testing should', 'reproductive choices. Testing should', 'break'],
  ['R105', 'c.985G>A variant Testing following', 'c.985G>A variant. Testing following', 'break'],
  ['R125', 'dilatation >38 mm Testing should', 'dilatation >38 mm. Testing should', 'break'],
  ['R127', 'prior to testing Testing should', 'prior to testing. Testing should', 'break'],
  ['R129', 'over 40 years of age Testing should', 'over 40 years of age. Testing should', 'break'],
  ['R132', 'consultation with an expert Testing should', 'consultation with an expert. Testing should', 'break'],
  ['R138', 'normal post-mortem) Where available', 'normal post-mortem). Where available', 'break'],
  ['R144', 'ketone bodies Where possible', 'ketone bodies. Where possible', 'break'],
  ['R153', 'no detectable cause Testing of patients', 'no detectable cause. Testing of patients', 'break'],
  ['R171', 'in the third trimester Testing may', 'in the third trimester. Testing may', 'break'],
  ['R210', 'should have been confirmed Testing of unaffected', 'should have been confirmed. Testing of unaffected', 'break'],
  ['R217', 'histologically confirmed Where a patient', 'histologically confirmed. Where a patient', 'break'],
  ['R228', 'requiring molecular testing Testing should', 'requiring molecular testing. Testing should', 'break'],
  ['R240', 'to guide management This indication', 'to guide management. This indication', 'break'],
  ['R251', 'genitalia are ambiguous Testing may', 'genitalia are ambiguous. Testing may', 'break'],
  ['R321', 'performed on cord blood Testing will', 'performed on cord blood. Testing will', 'break'],
  ['R411', 'male-infertility.pdf) Testing for Y chromosome', 'male-infertility.pdf). Testing for Y chromosome', 'break'],
  ['R411', 'chapter/Recommendations) Testing for this', 'chapter/Recommendations). Testing for this', 'break'],
  ['R438', 'on oral feeding alone This test', 'on oral feeding alone. This test', 'break'],
  ['R454', 'At prescribing decision Requests', 'At prescribing decision. Requests', 'break'],
  // Headings run into the line before them
  ['R21', 'for non-urgent testing Clinical examples', 'for non-urgent testing.\nClinical examples', 'break'],
  ['R21', 'FGR or still birth Exclusion criteria', 'FGR or still birth.\nExclusion criteria', 'break'],
  ['R33', 'have not been excluded Order of testing', 'have not been excluded.\nOrder of testing', 'break'],
  ['R137', 'should be present Exclusion criteria Non-syndromic', 'should be present.\nExclusion criteria\nNon-syndromic', 'break'],
  ['R143', 'follow-up of variants Order of testing Start with', 'follow-up of variants.\nOrder of testing\nStart with', 'break'],
  ['R143', 'by using R143.1 Continue to panel test', 'by using R143.1.\nContinue to panel test', 'break'],
  ['R144', 'follow-up of variants Order of testing', 'follow-up of variants.\nOrder of testing', 'break'],
  ['R151', 'Hypocalciuric hypercalcaemia Hypercalcaemia with', 'Hypocalciuric hypercalcaemia\nHypercalcaemia with', 'break'],
  // heading: [indication, text ending with the heading, the heading] – the heading starts a new line in bold, words unchanged
  ['R457', 'nerve sheath tumour <25 Chordoma', 'Chordoma', 'heading'],
  ['R49', 'Two or more suggestive features Cardinal features', 'Cardinal features', 'heading'],
];
