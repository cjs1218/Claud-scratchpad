// Shared helpers for the Node tests: load the browser scripts into one sandbox, find Playwright.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// The Navigator's files; the Explorer is in test-directory-explorer/.
const NAV = path.join(ROOT, 'cancer-family-history-navigator');
// Run js files (browser globals) together and return their `window` exports plus the named consts.
exports.load = (files = ['js/data.js', 'js/criteria.js', 'js/eligibility.js']) => {
  const src = files.map(f => fs.readFileSync(path.join(NAV, f), 'utf8')).join('\n');
  const names = [...src.matchAll(/^const ([A-Z_]+)\b/gm)].map(m => m[1]);
  const window = {};
  const consts = new Function('window', src + `\nreturn { ${names.join(', ')} };`)(window);
  return { ...consts, ...window };
};
exports.playwright = () => {
  try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); }
};
exports.ROOT = ROOT;
exports.NAV = NAV;
exports.NAV_PATH = 'cancer-family-history-navigator/';
