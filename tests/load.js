// Load js/data.js (browser globals) into a Node object.
const fs = require('fs');
module.exports = file => {
  const src = fs.readFileSync(file, 'utf8');
  const names = [...src.matchAll(/^const ([A-Z_]+)\b/gm)].map(m => m[1]);
  return new Function(src + `\nreturn { ${names.join(', ')} };`)();
};
