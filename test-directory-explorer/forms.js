/* Request forms. Whole genome sequencing (WGS) uses the national GMS forms; other tests use the forms of the requester's
 * Genomic Laboratory Hub (chosen on the page and remembered in the browser). Some tests have their own route or forms
 * (special). Forms are version-controlled: the page reminds users to check the current version with their hub.
 * Links checked 16 Oct 2026 (the North East and Yorkshire and Exeter sites block automated checks).
 * tests/explorer.test.js checks the structure. A form: { kind, label, type, url }. */
const TDX_FORMS = {
  checked: '2026-10-16',
  hubsListUrl: 'https://www.england.nhs.uk/genomics/genomic-laboratory-hubs/',
  // National WGS forms (rare disease), used whichever hub is chosen.
  wgs: [
    { kind: 'Record of discussion', label: 'NHS GMS record of discussion form (WGS) v4.04', type: 'PDF',
      url: 'https://www.england.nhs.uk/wp-content/uploads/2021/09/nhs-genomic-medicine-service-record-of-discussion-form-v4.04-1.pdf' },
    { kind: 'Test order form', label: 'NHS GMS test order form – rare disease (WGS) v2.0, April 2026', type: 'PDF',
      url: 'https://mft.nhs.uk/gms-wgs-test-order-form-rare-disease/' },
  ],
  // Tests with their own route or forms. codes: R codes; part: matches the clinical area (Part) of the criteria document.
  special: {
    rapid: { title: 'Rapid whole genome sequencing', codes: ['R14'],
      note: 'R14 is delivered by the Exeter Genomics Laboratory, which has its own test order form and record of discussion for rapid testing. Requests need a Clinical Geneticist’s support.',
      forms: [{ kind: 'Rapid WGS forms', label: 'Exeter Genomics Laboratory – genome sequencing (R14 forms)', type: 'web page',
        url: 'https://www.exeterlaboratory.com/genetics/genome-sequencing/' }] },
    prenatal: { title: 'Prenatal and fetal testing', codes: ['R320', 'R448', 'R471'], part: /Fetal/,
      note: 'Fetal and prenatal (including NIPD) samples usually need your hub’s prenatal request form, and many tests need Clinical Genetics or specialist agreement first.' },
    pharmacogenomic: { title: 'Pharmacogenomic testing', codes: ['R454', 'R65'],
      note: 'Pharmacogenomic tests often have their own request form (e.g. CYP2C19 for mavacamten).' },
    carrier: { title: 'Carrier testing', codes: ['R181', 'R185', 'R244', 'R246', 'R252', 'R361'],
      note: 'Carrier tests use your hub’s standard rare disease forms unless it has a specific one (some hubs have a separate GP form, e.g. for cystic fibrosis carrier testing).' },
  },
  // The seven Genomic Laboratory Hubs. other: standard non-WGS rare disease forms. special: forms for a special
  // category (key as above) or for one R code.
  hubs: [
    { id: 'east', name: 'East GLH (East Genomics)',
      page: 'https://www.eastgenomics.nhs.uk/for-healthcare-professionals/genomic-tests/referral-forms-index/',
      other: [
        { kind: 'Record of discussion', label: 'Rare disease record of discussion (non-WGS) v5', type: 'Word document',
          url: 'https://www.eastgenomics.nhs.uk/documents/1063/Rare_Disease_RoD_NON_WGS_v5_Q7xD0St.docx' },
        { kind: 'Test order form', label: 'Rare disease test order form (non-WGS)', type: 'PDF',
          url: 'https://www.eastgenomics.nhs.uk/documents/2339/East_GLH_Rare_Disease_Test_Order_Form_Adobe_GH-RI-FRM-2_v2.pdf' },
      ], special: {} },
    { id: 'north-thames', name: 'North Thames GLH',
      page: 'https://norththamesgenomics.nhs.uk/request-a-genetic-test/test-request-information/',
      other: [
        { kind: 'Record of discussion', label: 'NTGLH record of discussion v1', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2023/08/NTGLH_Record-of-Discussion_v1.pdf' },
        { kind: 'Test order form', label: 'Genetic test request form', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2024/12/Genetic-Test-Request-Form.pdf' },
      ], special: {
        prenatal: [{ kind: 'Prenatal test request form', label: 'Prenatal cytogenetic test request form v9', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2026/08/Prenatal-Cytogenetic-Test-Request-Form-v9-EDITABLE.pdf' }],
        R21: [
          { kind: 'R21 test request form', label: 'R21 rapid exome sequencing test request form v2', type: 'PDF',
            url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2025/08/R21-Rapid-Exome-Sequencing-Test-request-form-v2-Feb23.pdf' },
          { kind: 'Record of discussion', label: 'Record of discussion – prenatal exome sequencing', type: 'PDF',
            url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2023/08/Record-of-discussion-regarding-prenatal-exome-sequencing.pdf' }],
      } },
    { id: 'south-east', name: 'South East GLH',
      page: 'https://southeastgenomics.nhs.uk/professionals/test-order-forms/',
      other: [
        { kind: 'Record of discussion', label: 'Record of discussion form (non-WGS)', type: 'PDF',
          url: 'https://southeastgenomics.nhs.uk/wp-content/uploads/2025/04/13.Record-of-Discussion-Form-Non-WGS-editable.pdf' },
        { kind: 'Test order form', label: 'Rare disease test request form v2', type: 'PDF',
          url: 'https://southeastgenomics.nhs.uk/wp-content/uploads/2025/03/2.Rare-Disease-Test-Request-Form-editable-with-clinical-utility-v2.pdf' },
      ], special: {
        prenatal: [{ kind: 'Prenatal test request form', label: 'Test request form for urgent or prenatal tests', type: 'PDF',
          url: 'https://southeastgenomics.nhs.uk/wp-content/uploads/2024/10/Non-WGS-Genetic-Test-Request-Form.pdf' }],
        pharmacogenomic: [{ kind: 'Pharmacogenomic testing', label: 'South East GLH pharmacogenomic testing', type: 'web page',
          url: 'https://southeastgenomics.nhs.uk/professionals/pharmacogenomic-testing/' }],
      } },
    { id: 'central-south', name: 'Central and South GLH',
      page: 'https://bwc.nhs.uk/west-midlands-regional-genetics-laboratory/',
      other: [
        { kind: 'Test order form', label: 'Rare disease, reproductive and inherited cancer genomics test request form', type: 'PDF',
          url: 'https://bwc.nhs.uk/download.cfm?doc=docm93jijm4n5610.pdf&ver=8167' },
      ], special: {
        prenatal: [{ kind: 'Test order form', label: 'Rare disease, reproductive and inherited cancer genomics test request form', type: 'PDF',
          url: 'https://bwc.nhs.uk/download.cfm?doc=docm93jijm4n5610.pdf&ver=8167' }],
      } },
    { id: 'south-west', name: 'South West GLH',
      page: 'https://www.nbt.nhs.uk/south-west-genomic-laboratory-hub',
      other: [
        { kind: 'Test order form', label: 'GMS test order form v2.3', type: 'PDF',
          url: 'https://www.nbt.nhs.uk/sites/default/files/document/GMS%20Test%20Order%20Form%20v2.3.pdf' },
      ], special: {
        R454: [{ kind: 'R454 test order form', label: 'GMS test order form for R454 CYP2C19 – mavacamten v2.1', type: 'PDF',
          url: 'https://nbt.nhs.uk/sites/default/files/document/GMS%20Test%20Order%20Form%20for%20R454%20CYP2C19-Mavacamten%20V2.1.pdf' }],
      } },
    { id: 'north-west', name: 'North West GLH',
      page: 'https://mft.nhs.uk/nwglh/documents/test-request-forms/',
      other: [
        { kind: 'Test order form', label: 'NW GLH genomic testing request form – rare disease (DOC4900)', type: 'Word document',
          url: 'https://mft.nhs.uk/app/uploads/2021/11/DOC4900-Genomic-Testing-Request-Form-Rare-Disease.docx' },
      ], special: {
        R454: [{ kind: 'R454 test request form', label: 'CYP2C19 R454 mavacamten referral form', type: 'PDF',
          url: 'https://mft.nhs.uk/cyp2c19-r454-mavacamten-referral-form' }],
      } },
    { id: 'north-east-yorkshire', name: 'North East and Yorkshire GLH',
      page: 'https://ney-genomics.org.uk/', other: [], special: {} },
  ],
};
