'use strict';
// Stage 6, circles (changes-1.9/06-circles.md): every door question the oracle's stories ask (spec/oracle/stage6, each checked there against the
// text's answer and the settled answers of 2026-11-19), as fixed worlds asked of both engines. The questions are written by
// spec/oracle/stage6/export.cjs into sdk/rust/tests/fixtures/stage6.json; one entry per story, so a split is named by the rule it breaks.
const path = require('path');
const fixture = require(path.join(__dirname, '../../../sdk/rust/tests/fixtures/stage6.json'));
const RULE = {
  '6-C0-C3': 'C0 to C3, owners and parts', '6-C4-C5': 'C4 unissued parts, C5 a ring of circles', '6-C6': 'C6, every owner together', '6-C7-C8': 'C7 a close, C8 a buyer of parts',
  '6-C9': 'C9, C9a, C9b, what a circle\'s word names', '6-C10-C12': 'C10 rows, C11 head counts, C12 bounds', '6-C13-C15': 'C13 a grant from a row, C14, C15 hands',
  '6-C16-C18': 'C16 no one is both sides, C17 a payout, C18', '6-C19-C21': 'C19 versions, C20 a circle\'s clock, C21 a circle\'s line', '6-C22-C23': 'C22, C23, the doors', '6-rekey': 'rekeys',
};
const stories = [...new Set(fixture.questions.map((q) => q.story))];
module.exports = stories.map((story) => ({
  name: `stage 6 ${story}: ${RULE[story] || story}`, row: 'stage6', source: `spec/oracle/stage6/${story}.cjs; changes-1.9/06-circles.md`,
  build(L) {
    fixture.questions.filter((q) => q.story === story && !q.error).forEach((q, i) => L.ask({ name: `stage 6 ${story}`, blocks: [] }, `${q.op} #${i + 1}`, q.op, q.args));
  },
}));
