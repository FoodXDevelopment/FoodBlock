'use strict';
// Grants: every door question the oracle's stories ask (spec/oracle/stories/grants, each checked there against the text's answer), as fixed worlds asked of both engines.
// The questions are written by spec/oracle/stories/export.cjs into sdk/rust/tests/fixtures/grants.json; one entry per story, so a split is named by the story it breaks.
const path = require('path');
const fixture = require(path.join(__dirname, '../../../sdk/rust/tests/fixtures/grants.json'));
const stories = [...new Set(fixture.questions.map((q) => q.story))];
module.exports = stories.map((story) => ({
  name: `grants: ${story}`, row: 'grants', source: `spec/oracle/stories/grants/${story}.cjs`,
  build(L) {
    fixture.questions.filter((q) => q.story === story && !q.error).forEach((q, i) => L.ask({ name: `grants ${story}`, blocks: [] }, `${q.op} #${i + 1}`, q.op, q.args));
  },
}));
