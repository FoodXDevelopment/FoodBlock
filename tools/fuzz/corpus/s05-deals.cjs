'use strict';
// Stage 5, deals (changes-1.9/05-deals.md): every door question the oracle's stories ask (spec/oracle/stage5, each checked there against the
// text's answer), as fixed worlds asked of both engines. The questions are written by spec/oracle/stage5/export.cjs into
// sdk/rust/tests/fixtures/stage5.json; one entry per story, so a split is named by the rule it breaks.
const path = require('path');
const fixture = require(path.join(__dirname, '../../../sdk/rust/tests/fixtures/stage5.json'));
const RULE = {
  '5-0': "Amara's flour", '5-B': 'R-B1, when', '5-B2': 'crossed accepts, a firm offer, the 31st tray', '5-C': 'conditions, R-C1 to R-C4', '5-DEL': 'deleted shapes',
  '5-H1-5': 'holds, R-H1 to R-H5', '5-H6': 'R-H6, the rest of a deal', '5-H7': 'R-H7, a will', '5-H8-9': 'R-H8, R-H9, a stake on ruled', '5-H10': 'R-H10, elapsed',
  '5-J': 'the bench and judges', '5-P': 'paying, R-P1 to R-P10', '5-T': 'T1 to T4', '5-W': 'requests and waiting', '5-X': 'a deposit, wills, a machine handed over',
};
const stories = [...new Set(fixture.questions.map((q) => q.story))];
module.exports = stories.map((story) => ({
  name: `stage 5 ${story}: ${RULE[story] || story}`, row: 'stage5', source: `spec/oracle/stage5/${story}.cjs; changes-1.9/05-deals.md`,
  build(L) {
    fixture.questions.filter((q) => q.story === story && !q.error).forEach((q, i) => L.ask({ name: `stage 5 ${story}`, blocks: [] }, `${q.op} #${i + 1}`, q.op, q.args));
  },
}));
