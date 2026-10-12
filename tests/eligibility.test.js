// Eligibility logic (js/eligibility.js): Test Directory criteria, Manchester score, modified Amsterdam, relationships.
// Run: node tests/eligibility.test.js
const w = require('./env.js').load();
let id = 0;
const P = (rel, sex, dx = [], extra = {}) => ({ id: ++id, rel, sex, ...extra, dx: dx.map(d => ({ site: '', hist: '', age: '', count: '', side: '', age2: '', ...d })) });
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };

/* Relationship degrees */
for (const [a, b, e] of [['proband','mother',1],['proband','sister',1],['proband','m_aunt',2],['proband','m_cousin',3],['proband','m_gm',2],['mother','m_aunt',1],['mother','m_gm',1],['m_aunt','m_cousin',null],['sister','niece',null],['proband','niece',2],['proband','m_halfsib',2],['sister','m_halfsib',2],['mother','father',null],['m_aunt','father',null],['proband','daughter',1],['proband','grandchild',2],['mother','daughter',2],['m_aunt','p_aunt',null],['m_gm','m_great',1],['proband','m_great',3],['m_aunt','m_aunt',1]]) ok(w.relDegree({ rel: a }, { rel: b }) === e, `degree ${a}–${b} expected ${e}`);

for (const [a, b, e] of [['proband','m_ggp',3],['mother','m_ggp',2],['m_gm','m_ggp',1],['proband','gniece',3],['niece','gniece',null],['proband','m_cousin_child',4],['m_cousin','m_cousin_child',null]]) ok(w.relDegree({ rel: a }, { rel: b }) === e, `degree ${a}–${b} expected ${e}`);

/* Named parents ("Child of") */
{
  const aunt1 = { id: 101, rel: 'm_aunt' }, aunt2 = { id: 102, rel: 'm_aunt' }, mum = { id: 103, rel: 'mother' }, pro = { id: 104, rel: 'proband' };
  const c1 = { id: 105, rel: 'm_cousin', parentId: 101 }, c2 = { id: 106, rel: 'm_cousin', parentId: 101 }, c3 = { id: 107, rel: 'm_cousin', parentId: 102 }, c4 = { id: 108, rel: 'm_cousin' };
  const cc = { id: 109, rel: 'm_cousin_child', parentId: 105 }, sis = { id: 110, rel: 'sister' }, nie = { id: 111, rel: 'niece', parentId: 110 }, gn = { id: 112, rel: 'gniece', parentId: 111 };
  const fam = [aunt1, aunt2, mum, pro, c1, c2, c3, c4, cc, sis, nie, gn];
  const D = (a, b) => w.relDegree(a, b, fam);
  ok(D(c1, aunt1) === 1 && D(c1, aunt2) === 2 && D(c1, mum) === 2 && D(c1, pro) === 3, 'cousin with a named parent: 1st to that aunt, 2nd to the other aunt and to mother, 3rd to proband');
  ok(D(c1, c2) === 1 && D(c1, c3) === 3, 'cousins: siblings if same parent, first cousins otherwise');
  ok(D(c4, aunt1) === null && D(c4, pro) === 3 && D(c4, c1) === null, 'cousin without a named parent: link to aunts and other cousins unknown, still 3rd to proband');
  ok(D(cc, c1) === 1 && D(cc, aunt1) === 2 && D(cc, pro) === 4, "cousin's child through the named cousin");
  ok(D(nie, sis) === 1 && D(gn, nie) === 1 && D(gn, sis) === 2 && D(gn, pro) === 3, 'niece and great-niece through named parents');
  // Amsterdam: aunt's own child links; another aunt's child does not
  const A = (rel, site, age, extra = {}) => P(rel, 'F', [{ site, hist: site === 'uterus' ? 'endometrioid' : 'adeno', age: String(age) }], extra);
  const au = A('m_aunt', 'colorectal', 55), gmum = A('m_gm', 'uterus', 70), cz = A('m_cousin', 'colorectal', 45, { parentId: au.id });
  ok(w.amsterdamCriteria([P('proband', 'F'), gmum, au, cz]).met, 'Amsterdam: grandmother, aunt and her own child (named) meet');
  const au2 = A('m_aunt', 'colorectal', 55), other = P('m_aunt', 'F'), cz2 = A('m_cousin', 'colorectal', 45, { parentId: other.id });
  ok(!w.amsterdamCriteria([P('proband', 'F'), A('m_gm', 'uterus', 70), au2, other, cz2]).met, "Amsterdam: the affected aunt is not FDR of another aunt's child");
}

/* Modified Amsterdam */
{
  const A = (rel, site, hist, age) => P(rel, 'F', [{ site, hist, age: String(age) }]);
  const t = (name, ppl, exp) => ok(w.amsterdamCriteria(ppl).met === exp, `Amsterdam: ${name}`);
  const P_ = A;
  t('classic 3 in 2 gens, one <50', [P_('proband','colorectal','adeno',45), P_('mother','uterus','endometrioid',55), P_('m_aunt','colorectal','adeno',60)], true);
  t('no one under 50', [P_('proband','colorectal','adeno',55), P_('mother','uterus','endometrioid',55), P_('m_aunt','colorectal','adeno',60)], false);
  t('only 2 affected', [P_('proband','colorectal','adeno',45), P_('mother','uterus','endometrioid',55)], false);
  t('3 sibs one generation', [P_('proband','colorectal','adeno',45), P_('sister','colorectal','adeno',50), P_('brother','colorectal','adeno',52)], false);
  t('proband + mother + mat gm', [P_('proband','colorectal','adeno',40), P_('mother','colorectal','adeno',60), P_('m_gm','uterus','endometrioid',70)], true);
  t('no FDR link: proband, m_aunt, m_cousin', [P_('proband','colorectal','adeno',40), P_('m_aunt','colorectal','adeno',60), P_('m_cousin','uterus','endometrioid',45)], false);
  t('different sides (mother + father)', [P_('proband','colorectal','adeno',40), P_('mother','colorectal','adeno',60), P_('father','colorectal','adeno',65)], false);
  t('mother side + father extra', [P_('proband','colorectal','adeno',40), P_('mother','colorectal','adeno',60), P_('m_aunt','uterus','endometrioid',62), P_('father','colorectal','adeno',65)], true);
  t('ureter counts', [P_('proband','urothelial','upper',45), P_('mother','colorectal','adeno',58), P_('m_aunt','smallbowel','adeno',62)], true);
}

/* Test Directory criteria: [relation, test, 'met' | 'maybe' | 'none'] */
function t(name, people, exp) {
  const r = w.checkEligibility(people);
  for (const [rel, test, kind] of exp) {
    const o = r.filter(x => x.person.rel === rel && x.test === test);
    const got = !o.length ? 'none' : o.some(x => !x.possible) ? 'met' : 'maybe';
    if (got === kind) pass++; else { fail++; console.log('FAIL', name, rel, test, 'expected', kind, 'got', got, o.map(x => x.text.join('; '))); }
  }
}
const M = (age, extra) => ({ site: 'skin', hist: 'melanoma', age, ...extra });
t('melanoma <18', [P('proband','F',[M('16')])], [['proband','R254','met']]);
t('2 melanomas <30', [P('proband','F',[M('25'), M('28')])], [['proband','R254','met']]);
t('mel <30 + SDR <30', [P('proband','F',[M('25')]), P('m_aunt','F',[M('29')])], [['proband','R254','met']]);
t('3 across family', [P('proband','F',[M('50')]), P('mother','F',[M('60')]), P('m_gm','F',[M('70')])], [['proband','R254','met']]);
t('single mel 50', [P('proband','F',[M('50')])], [['proband','R254','none']]);
t('mel + FDR panc <60', [P('proband','F',[M('50')]), P('father','M',[{site:'pancreas',hist:'pdac',age:'55'}])], [['proband','R254','maybe']]);
t('BAP1 uveal <40', [P('proband','M',[{site:'eye',hist:'uveal',age:'35'}])], [['proband','R422','met']]);
t('BAP1 meso <60', [P('proband','M',[{site:'meso',hist:'pleural',age:'50'}])], [['proband','R422','maybe']]);
t('BAP1 two core', [P('proband','M',[{site:'eye',hist:'uveal',age:'55'},{site:'kidney',hist:'ccrcc',age:'60'}])], [['proband','R422','met']]);
t('BAP1 two melanoma excluded', [P('proband','M',[M('55'), M('60')])], [['proband','R422','none']]);
t('BAP1 FDR', [P('proband','M',[{site:'skin',hist:'bcc',age:'55'}]), P('mother','F',[{site:'meso',hist:'pleural',age:'70'}])], [['proband','R422','met']]);
t('GIST <50', [P('proband','M',[{site:'sarcoma',hist:'gist',age:'45'}])], [['proband','R363','met']]);
t('GIST 60 + PGL cousin', [P('proband','M',[{site:'sarcoma',hist:'gist',age:'60'}]), P('m_cousin','F',[{site:'ppgl',hist:'hn',age:'40'}])], [['proband','R363','met']]);
t('GIST 60 alone', [P('proband','M',[{site:'sarcoma',hist:'gist',age:'60'}])], [['proband','R363','none']]);
t('PPB', [P('proband','M',[{site:'lung',hist:'ppb',age:'3'}])], [['proband','R364','met']]);
t('MNG adult + Wilms FDR', [P('proband','F',[{site:'thyroid',hist:'mng',age:'30'}]), P('sister','F',[{site:'kidney',hist:'wilms',age:'4'}])], [['proband','R364','met']]);
t('MNG adult alone', [P('proband','F',[{site:'thyroid',hist:'mng',age:'30'}])], [['proband','R364','none']]);
t('FH RCC', [P('proband','M',[{site:'kidney',hist:'fhrcc',age:'40'}])], [['proband','R365','met']]);
t('cut leio single', [P('proband','M',[{site:'feature',hist:'cutleio',age:'30'}])], [['proband','R365','maybe']]);
t('cut leio multiple', [P('proband','M',[{site:'feature',hist:'cutleio',age:'30',count:'4'}])], [['proband','R365','met']]);
t('fibroids <40', [P('proband','F',[{site:'feature',hist:'fibroids',age:'30'}])], [['proband','R365','maybe']]);
t('parathyroid ca', [P('proband','F',[{site:'parathyroid',hist:'carcinoma',age:'50'}])], [['proband','R226','met']]);
t('APC hepatoblastoma', [P('proband','M',[{site:'liver',hist:'hepatoblastoma',age:'1'}])], [['proband','R414','met']]);
t('APC CHRPE', [P('proband','M',[{site:'feature',hist:'chrpe',age:'10'}])], [['proband','R414','maybe']]);
t('Wilms <2', [P('proband','M',[{site:'kidney',hist:'wilms',age:'1'}])], [['proband','R456','met']]);
t('Wilms 4', [P('proband','M',[{site:'kidney',hist:'wilms',age:'4'}])], [['proband','R456','maybe']]);
t('Wilms deceased', [P('proband','M',[{site:'kidney',hist:'wilms',age:'1'}],{deceased:true})], [['proband','R456','none']]);
t('NB + cousin NB', [P('proband','M',[{site:'nb',hist:'nb',age:'2'}]), P('m_cousin','F',[{site:'nb',hist:'nb',age:'1'}])], [['proband','R456','met']]);
t('ATRT', [P('proband','M',[{site:'cns',hist:'atrt',age:'1'}])], [['proband','R456','met']]);
t('SCCOHT', [P('proband','F',[{site:'ovary',hist:'sccoht',age:'25'}])], [['proband','R456','met']]);
t('osteo <25', [P('proband','M',[{site:'sarcoma',hist:'osteo',age:'15'}])], [['proband','R457','met']]);
t('RMS <25', [P('proband','M',[{site:'sarcoma',hist:'rms',age:'15'}])], [['proband','R457','maybe']]);
t('sarcoma + FDR sarcoma', [P('proband','M',[{site:'sarcoma',hist:'sts',age:'50'}]), P('father','M',[{site:'sarcoma',hist:'lms',age:'60'}])], [['proband','R457','met']]);
t('chordoma <25', [P('proband','M',[{site:'sarcoma',hist:'chordoma',age:'20'}])], [['proband','R457','met']]);
t('chordoma 50', [P('proband','M',[{site:'sarcoma',hist:'chordoma',age:'50'}])], [['proband','R457','none']]);
t('AML alone', [P('proband','M',[{site:'heme',hist:'aml',age:'40'}])], [['proband','R347','maybe']]);
t('AML + relative MDS', [P('proband','M',[{site:'heme',hist:'aml',age:'40'}]), P('m_uncle','M',[{site:'heme',hist:'mds',age:'50'}])], [['proband','R347','met'],['m_uncle','R347','met']]);
t('ALL + sib ALL', [P('proband','M',[{site:'heme',hist:'all',age:'5'}]), P('brother','M',[{site:'heme',hist:'all',age:'7'}])], [['proband','R366','met']]);
t('ALL alone', [P('proband','M',[{site:'heme',hist:'all',age:'5'}])], [['proband','R366','none']]);
// Grade
const B = (extra) => ({ site: 'breast', hist: 'idc', age: '45', er: 'neg', pr: 'pos', her2: 'neg', ...extra });
const mss = (dx) => { const p = P('proband', 'F', [dx]); return w.manchesterScore(p, [p]).b1; };
const g0 = mss(B({})), g1 = mss(B({ grade: '1' })), g3 = mss(B({ grade: '3' }));
if (g1 === g0 - 2 && g3 === g0 + 2) pass++; else { fail++; console.log('FAIL grade adjust', g0, g1, g3); }
if (mss({ site: 'breast', hist: 'dcis', age: '45', grade: '3' }) === mss({ site: 'breast', hist: 'dcis', age: '45' })) pass++; else { fail++; console.log('FAIL DCIS grade should not adjust Manchester'); }
t('DCIS low grade <40', [P('proband','F',[{site:'breast',hist:'dcis',age:'35',grade:'1'}])], [['proband','R208','none']]);
t('DCIS high grade <40', [P('proband','F',[{site:'breast',hist:'dcis',age:'35',grade:'3'}])], [['proband','R208','met']]);
t('DCIS unknown <40', [P('proband','F',[{site:'breast',hist:'dcis',age:'35'}])], [['proband','R208','met']]);
t('endometrioid ovary unknown grade', [P('proband','F',[{site:'ovary',hist:'endometrioid',age:'50'}])], [['proband','R207','maybe']]);
t('endometrioid ovary high grade', [P('proband','F',[{site:'ovary',hist:'endometrioid',age:'50',ovgrade:'high'}])], [['proband','R207','met'],['proband','R208','none']]);
t('endometrioid ovary low grade', [P('proband','F',[{site:'ovary',hist:'endometrioid',age:'50',ovgrade:'low'}])], [['proband','R207','none']]);
t('endometrioid unknown + FDR EOC', [P('proband','F',[{site:'ovary',hist:'endometrioid',age:'50'}]), P('mother','F',[{site:'ovary',hist:'hgsc',age:'60'}])], [['proband','R207','met']]);
t('ovary NOS high grade + breast <40 sister → R208 Manchester', [P('proband','F',[{site:'ovary',hist:'nos',age:'50',ovgrade:'high'}]), P('sister','F',[{site:'breast',hist:'idc',age:'35'}]), P('mother','F',[{site:'breast',hist:'idc',age:'45'}])], [['proband','R208','met']]);


/* Bilateral breast: second cancer scored at its own age; multifocal once */
{
  const b1 = (side, age2 = '') => { const p = P('proband', 'F', [{ site: 'breast', hist: 'idc', age: '45', side, age2 }]); return w.manchesterScore(p, [p]).b1; };
  ok(b1('') === 3 && b1('both') === 6 && b1('both', '55') === 5 && b1('multi') === 3, 'Manchester side handling');
  t('multifocal breast is not bilateral', [P('proband','F',[{site:'breast',hist:'idc',age:'50',side:'multi'}])], [['proband','R208','none']]);
  t('bilateral breast <60', [P('proband','F',[{site:'breast',hist:'idc',age:'50',side:'both',age2:'55'}])], [['proband','R208','met']]);
  t('3 melanomas by number', [P('proband','F',[{site:'skin',hist:'melanoma',age:'50',count:'3'}])], [['proband','R254','met']]);
}

/* Ancestry criteria */
{
  const tA = (name, people, anc, exp) => { const r = w.checkEligibility(people, anc);
    for (const [rel, test, kind] of exp) { const o = r.filter(x => x.person.rel === rel && x.test === test); const got = !o.length ? 'none' : o.some(x => !x.possible) ? 'met' : 'maybe'; ok(got === kind, `${name}: ${rel} ${test} expected ${kind} got ${got}`); } };
  const br = age => ({ site: 'breast', hist: 'idc', age, er: 'pos' });
  tA('Westray proband breast 65', [P('proband','F',[br('65')])], 'westray', [['proband','R208','met']]);
  tA('Westray mother breast 65', [P('proband','F'), P('mother','F',[br('65')])], 'westray', [['mother','R208','maybe']]);
  tA('Whalsay sister breast 65', [P('proband','F'), P('sister','F',[br('65')])], 'whalsay', [['sister','R208','met']]);
  tA('Whalsay proband prostate 70', [P('proband','M',[{site:'prostate',hist:'adeno',age:'70'}])], 'whalsay', [['proband','R430','met']]);
  tA('Westray prostate 70 (no prostate criterion)', [P('proband','M',[{site:'prostate',hist:'adeno',age:'70'}])], 'westray', [['proband','R430','none']]);
  tA('Māori DGC 65 aunt', [P('proband','F'), P('m_aunt','F',[{site:'stomach',hist:'diffuse',age:'65'}])], 'maori', [['m_aunt','R215','met']]);
  tA('no ancestry: breast 65', [P('proband','F',[br('65')])], '', [['proband','R208','none']]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
