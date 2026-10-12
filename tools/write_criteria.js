// Write js/criteria.js from the JSON made by tools/extract_criteria.py.  Usage: node tools/write_criteria.js <crit.json>
const fs = require('fs');
const path = require('path');
const crit = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = '/* Testing criteria quoted verbatim from the National Genomic Test Directory: Rare and Inherited Disease eligibility\n' +
  ' * criteria v9.1 (20 May 2026). Generated from the PDF text; each item is [level, marker, text]; page is the PDF page. */\n' +
  'const TD_CRITERIA = ' + JSON.stringify(crit, null, 0).replace(/\],\[/g, '],\n    [').replace(/"(R\d+)":/g, '\n  "$1":') + ';\n';
fs.writeFileSync(path.join(__dirname, '../js/criteria.js'), out);
console.log(`js/criteria.js: ${Object.keys(crit).length} tests`);
