/* Request forms. Whole genome sequencing (WGS) uses the national GMS forms; other tests use the forms of the requester's
 * Genomic Laboratory Hub (chosen on the page and remembered in the browser). Some tests have their own route or forms
 * (special), some with a further information link (info). Forms are version-controlled: the page reminds users to check the current version with their hub.
 * Links checked 16 Oct 2026 (the North East and Yorkshire, South West and Exeter sites block automated checks).
 * tests/explorer.test.js checks the structure. A form: { kind, label, type, url }. */
const TDX_FORMS = {
  checked: '2026-10-16',
  hubsListUrl: 'https://www.england.nhs.uk/genomics/genomic-laboratory-hubs/',
  // Finding your hub: NHS England Genomics Education Programme map of clinical genetics services and the trusts each serves.
  servicesMapUrl: 'https://www.genomicseducation.hee.nhs.uk/genotes/knowledge-hub/clinical-genetics-departments-map/',
  boundaryNote: 'Hospitals near a boundary may use a different hub from their county – for example, Bedfordshire, East and North Hertfordshire and North Essex hospitals use East GLH laboratories but London clinical genetics services, and North Derbyshire and Bassetlaw refer to Sheffield. Wales, Scotland and Northern Ireland have their own genomic services.',
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
      note: 'R14 is delivered by the Exeter Genomics Laboratory, which has its own record of discussion and test request form. Requests need a Clinical Geneticist’s support.',
      forms: [{ kind: 'Record of discussion', label: 'R14 rapid genome sequencing record of discussion v3.0', type: 'PDF',
        url: 'https://www.exeterlaboratory.com/wp-content/uploads/Record_of_Discussion_regarding_R14_Rapid_Genome_Sequencing_v3.0.pdf' },
      { kind: 'Test request form', label: 'R14 rapid WGS test request form v7.0', type: 'PDF',
        url: 'https://www.exeterlaboratory.com/wp-content/uploads/R14__Rapid_WGS_Test_request_form_v7.0.pdf' }],
      // Further information (not a form), shown below the notes.
      info: { label: 'Further information about R14 rapid whole genome sequencing (Exeter Genomics Laboratory)',
        url: 'https://www.exeterlaboratory.com/genetics/genome-sequencing/' } },
    // R21 is tested by two laboratories for the whole country, with national forms. Each hub sends its samples to a default
    // testing laboratory (NHS England guidance, Rapid exome sequencing service for fetal anomalies testing v3.0, Figure 1).
    r21: { title: 'Rapid prenatal exome sequencing', codes: ['R21'],
      note: 'R21 is tested by two laboratories for the whole of England: North Thames GLH (Great Ormond Street) and Central and South GLH (Birmingham). Agree testing with Clinical Genetics, then contact the testing laboratory before sending samples – its contact details are on the form. Samples go to your own hub, which does the rapid aneuploidy test (and microarray if needed) and forwards them.',
      forms: [
        { kind: 'Test request form', label: 'R21 rapid prenatal exome sequencing test request form v2 (national)', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2025/08/R21-Rapid-Exome-Sequencing-Test-request-form-v2-Feb23.pdf' },
        { kind: 'Record of discussion', label: 'Record of discussion – prenatal exome sequencing (one per parent)', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2023/08/Record-of-discussion-regarding-prenatal-exome-sequencing.pdf' }],
      labs: { 'north-thames': 'North Thames GLH (Great Ormond Street)', 'central-south': 'Central and South GLH (Birmingham)' },
      testingLab: { 'north-thames': 'north-thames', 'south-east': 'north-thames', east: 'north-thames', 'south-west': 'north-thames',
        'central-south': 'central-south', 'north-west': 'central-south', 'north-east-yorkshire': 'central-south' },
      info: { label: 'NHS England guidance – rapid exome sequencing service for fetal anomalies testing', type: 'PDF',
        url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2023/08/Rapid-Exome-Sequencing-Guidance.pdf' } },
    prenatal: { title: 'Prenatal and fetal testing', codes: ['R320', 'R448', 'R471'], part: /Fetal/,
      note: 'Fetal and prenatal (including NIPD) samples usually need your hub’s prenatal request form, and many tests need Clinical Genetics or specialist agreement first.' },
    pharmacogenomic: { title: 'Pharmacogenomic testing', codes: ['R454', 'R65'],
      note: 'Pharmacogenomic tests often have their own request form (e.g. CYP2C19 for mavacamten).' },
    carrier: { title: 'Carrier testing', codes: ['R181', 'R185', 'R244', 'R246', 'R252', 'R361'],
      note: 'Carrier tests use your hub’s standard rare disease forms unless it has a specific one (some hubs have a separate GP form, e.g. for cystic fibrosis carrier testing).' },
  },
  // The seven Genomic Laboratory Hubs. area, services: the area and clinical genetics services each serves (from areaSource,
  // the hub's or its lead trust's own page, and the services map; checked 16 Oct 2026). other: standard non-WGS rare disease forms. special: forms for a special
  // category (key as above) or for one R code.
  hubs: [
    { id: 'east', name: 'East GLH (East Genomics)',
      area: "East of England and East Midlands – Cambridgeshire, Norfolk, Suffolk, Leicestershire, Northamptonshire, Rutland, Nottinghamshire, Derbyshire and Lincolnshire, plus hospitals in Bedfordshire, East and North Hertfordshire and North Essex",
      services: ["East Anglian Medical Genetics Service, Cambridge", "Leicester Clinical Genetics Service", "Nottingham Clinical Genetics Service"],
      areaSource: 'https://www.eastgenomics.nhs.uk/for-healthcare-professionals/clinical-genetics-services/',
      page: 'https://www.eastgenomics.nhs.uk/for-healthcare-professionals/genomic-tests/referral-forms-index/',
      other: [
        { kind: 'Record of discussion', label: 'Rare disease record of discussion (non-WGS) v5', type: 'Word document',
          url: 'https://www.eastgenomics.nhs.uk/documents/1063/Rare_Disease_RoD_NON_WGS_v5_Q7xD0St.docx' },
        { kind: 'Test order form', label: 'Rare disease test order form (non-WGS)', type: 'PDF',
          url: 'https://www.eastgenomics.nhs.uk/documents/2339/East_GLH_Rare_Disease_Test_Order_Form_Adobe_GH-RI-FRM-2_v2.pdf' },
      ], special: {} },
    { id: 'north-thames', name: 'North Thames GLH',
      area: "North, East, Central and West London, West Hertfordshire and Mid and South Essex",
      services: ["North West Thames Regional Genetics Service (Northwick Park)", "North East Thames Regional Genetics Service (Great Ormond Street Hospital)", "Royal Marsden Cancer Genetics Unit (cancer only)"],
      areaSource: 'https://norththamesgenomics.nhs.uk/about/clinical-genetics/',
      page: 'https://norththamesgenomics.nhs.uk/request-a-genetic-test/test-request-information/',
      other: [
        { kind: 'Record of discussion', label: 'NTGLH record of discussion v1', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2023/08/NTGLH_Record-of-Discussion_v1.pdf' },
        { kind: 'Test order form', label: 'Genetic test request form', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2024/12/Genetic-Test-Request-Form.pdf' },
      ], special: {
        prenatal: [{ kind: 'Prenatal test request form', label: 'Prenatal cytogenetic test request form v9', type: 'PDF',
          url: 'https://norththamesgenomics.nhs.uk/wp-content/uploads/2026/08/Prenatal-Cytogenetic-Test-Request-Form-v9-EDITABLE.pdf' }]
      } },
    { id: 'south-east', name: 'South East GLH',
      area: "South London, Kent, Medway, Surrey and Sussex",
      services: ["South East Thames Regional Genetics Service (Guy’s Hospital)", "South West Thames Centre for Genomics (St George’s Hospital)"],
      areaSource: 'https://southeastgenomics.nhs.uk/about-us/who-are-we/',
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
      area: "West Midlands, Oxfordshire and the Thames Valley (Buckinghamshire, Berkshire, Milton Keynes), and Wessex (Hampshire, Isle of Wight, Dorset, Salisbury)",
      services: ["West Midlands Clinical Genetics Service, Birmingham", "Oxford Centre for Genomic Medicine", "Wessex Clinical Genetics Service, Southampton"],
      areaSource: 'https://centralsouthgenomics.nhs.uk/about-us/',
      page: 'https://bwc.nhs.uk/west-midlands-regional-genetics-laboratory/',
      other: [
        { kind: 'Test order form', label: 'Rare disease, reproductive and inherited cancer genomics test request form', type: 'PDF',
          url: 'https://bwc.nhs.uk/download.cfm?doc=docm93jijm4n5610.pdf&ver=8167' },
      ], special: {
        prenatal: [{ kind: 'Test order form', label: 'Rare disease, reproductive and inherited cancer genomics test request form', type: 'PDF',
          url: 'https://bwc.nhs.uk/download.cfm?doc=docm93jijm4n5610.pdf&ver=8167' }],
      } },
    { id: 'south-west', name: 'South West GLH',
      area: "Cornwall and the Isles of Scilly, Devon, Somerset, Bristol, Gloucestershire and parts of Wiltshire",
      services: ["South West Clinical Genetics Service (Exeter and Bristol)"],
      areaSource: 'https://www.southwestgenomics.nhs.uk/about-us/',
      page: 'https://www.southwestgenomics.nhs.uk/healthcare-professionals/request-a-test/',
      other: [
        { kind: 'Test order form', label: 'GMS test order form v2.4', type: 'PDF',
          url: 'https://www.southwestgenomics.nhs.uk/app/uploads/2025/07/GMS-Test-Order-Form-v2.4.pdf' },
      ], special: {
        R454: [{ kind: 'R454 test order form', label: 'GMS test order form for R454 CYP2C19 – mavacamten v2.1', type: 'PDF',
          url: 'https://www.southwestgenomics.nhs.uk/app/uploads/2026/02/GMS-Test-Order-Form-for-R454-CYP2C19-Mavacamten-V2.1.pdf' }],
      } },
    { id: 'north-west', name: 'North West GLH',
      area: "Greater Manchester, Lancashire, South Cumbria, Cheshire, Merseyside and the Isle of Man",
      services: ["Manchester Centre for Genomic Medicine (St Mary’s Hospital)", "Liverpool Centre for Genomic Medicine (Liverpool Women’s Hospital)"],
      areaSource: 'https://mft.nhs.uk/services/genomic-medicine',
      page: 'https://mft.nhs.uk/nwglh/documents/test-request-forms/',
      other: [
        { kind: 'Test order form', label: 'NW GLH genomic testing request form – rare disease (DOC4900)', type: 'Word document',
          url: 'https://mft.nhs.uk/app/uploads/2021/11/DOC4900-Genomic-Testing-Request-Form-Rare-Disease.docx' },
      ], special: {
        R454: [{ kind: 'R454 test request form', label: 'CYP2C19 R454 mavacamten referral form', type: 'PDF',
          url: 'https://mft.nhs.uk/cyp2c19-r454-mavacamten-referral-form' }],
      } },
    { id: 'north-east-yorkshire', name: 'North East and Yorkshire GLH',
      area: "North East England, North Cumbria, and Yorkshire and the Humber (including Bassetlaw and North Derbyshire, which refer to Sheffield)",
      services: ["Northern Genetics Service, Newcastle", "Leeds Clinical Genomics Service", "Sheffield Clinical Genomics Service"],
      areaSource: 'https://www.newcastle-hospitals.nhs.uk/news/newcastle-hospitals-leads-new-genomics-laboratory-hub-for-the-north-east-and-yorkshire/',
      page: 'https://ney-genomics.org.uk/', other: [], special: {} },
  ],
};
