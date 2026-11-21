'use strict';
// Stage 4, grants (changes-1.9/04-grants.md, section 5): every door question the oracle's stories ask (spec/oracle/stage4, each checked there
// against the text's answer), as fixed worlds asked of both engines. The questions are written by spec/oracle/stage4/export.cjs into
// sdk/rust/tests/fixtures/stage4.json; one entry per story, so a split is named by the rule it breaks.
const path = require('path');
const fixture = require(path.join(__dirname, '../../../sdk/rust/tests/fixtures/stage4.json'));
const RULE = {
  '4-1': 'G1, one rule', '4-2': 'G1, the bookkeeper', '4-3': 'Keeps to, item 6', '4-4': 'G3, overlap', '4-5': 'G4, one fill', '4-6': 'her quantity', '4-7': 'G6, one line',
  '4-8': 'G7, a copied key', '4-9': 'G8, counted once', '4-10': 'G9, a child grant', '4-11': 'Due', '4-12': 'toll work', '4-13': 'G13, a pass between tools',
  '4-14': 'G14, the link', '4-15': 'G15, the lowest offer', '4-16': 'G16, the stop', '4-17': 'a stop of one thing', '4-18': "a voice's bounds", '4-19': 'G18, the worst case',
};
const stories = [...new Set(fixture.questions.map((q) => q.story))];
module.exports = stories.map((story) => ({
  name: `stage 4 ${story}: ${RULE[story] || story}`, row: 'stage4', source: `spec/oracle/stage4/${story}.cjs; changes-1.9/04-grants.md section 5`,
  build(L) {
    fixture.questions.filter((q) => q.story === story && !q.error).forEach((q, i) => L.ask({ name: `stage 4 ${story}`, blocks: [] }, `${q.op} #${i + 1}`, q.op, q.args));
  },
}));
