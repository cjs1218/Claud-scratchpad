/* Request forms linked from each test. Whole genome sequencing (WGS) tests use the national GMS forms; all other tests
 * use the East Genomic Laboratory Hub's rare disease forms. Forms are version-controlled: check the current version
 * with your Genomic Laboratory Hub. tests/explorer.test.js checks each entry is well formed. */
const TDX_FORMS = {
  wgs: [
    { kind: 'Record of discussion', label: 'NHS GMS record of discussion form (WGS) v4.04', type: 'PDF',
      url: 'https://www.england.nhs.uk/wp-content/uploads/2021/09/nhs-genomic-medicine-service-record-of-discussion-form-v4.04-1.pdf' },
    { kind: 'Test order form', label: 'NHS GMS test order form – rare disease (WGS) v1.3', type: 'PDF',
      url: 'https://www.england.nhs.uk/wp-content/uploads/2021/09/gms-test-order-form-rare-disease-v1.3.pdf' },
  ],
  other: [
    { kind: 'Record of discussion', label: 'Rare disease record of discussion (non-WGS) v5 – East GLH', type: 'Word document',
      url: 'https://www.eastgenomics.nhs.uk/documents/1063/Rare_Disease_RoD_NON_WGS_v5_Q7xD0St.docx' },
    { kind: 'Test order form', label: 'Rare disease test order form – East GLH', type: 'PDF',
      url: 'https://www.eastgenomics.nhs.uk/documents/2339/East_GLH_Rare_Disease_Test_Order_Form_Adobe_GH-RI-FRM-2_v2.pdf' },
  ],
};
