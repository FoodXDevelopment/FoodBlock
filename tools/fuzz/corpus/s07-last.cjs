'use strict';
// Stage 7, last (changes-1.9/07-last.md): every door question the oracle's stories ask but the read-back's (spec/oracle/stage7, each checked
// there against the text's answer and the settled answers of the stage 7 compare), as fixed worlds asked of both engines. The questions are
// written by spec/oracle/stage7/export.cjs into sdk/rust/tests/fixtures/stage7.json; one entry per story, so a split is named by the rule it
// breaks. A question the oracle refuses is left out (as stage 6's), and so is one whose answer is random (a key pair, an envelope) or that
// names a mount (a mount is a fresh random id in each engine; tests/stage7.rs and rust-stories.cjs read one engine's id as the other's).
const path = require('path');
const fixture = require(path.join(__dirname, '../../../sdk/rust/tests/fixtures/stage7.json'));
const RULE = {
  '7-dealer': 'D4, the dealer\'s twelve cases', '7-deletions': 'A5, what the removed fields leave', '7-keeping': 'A1 Keeping apart, a wrapped copy; A2 the admission rule, a receipt',
  '7-oldreader': 'C5, an old reader', '7-owner': 'the owner\'s decisions 1 to 3', '7-privacy': 'A1 What stays public, Not given, Showing a deal, Sealed messages',
  '7-rules': 'B1 to B5 rule sets by hash, D2 the ops, D6 the lock, F the mount', '7-schema': 'B1, a schema types a field',
};
const random = ['keypair', 'seal', 'encryption_keypair', 'seal_copy', 'wrap_copy'];
const mounts = new Set(fixture.questions.filter((q) => q.op === 'mount' && typeof q.answer === 'string').map((q) => q.answer));
const namesMount = (q) => q.op === 'mount' || q.op === 'unmount' || (JSON.stringify(q.args).match(/"[0-9a-f]{32}"/g) || []).some((m) => mounts.has(m.slice(1, -1)));
const stories = [...new Set(fixture.questions.map((q) => q.story))];
module.exports = stories.map((story) => ({
  name: `stage 7 ${story}: ${RULE[story] || story}`, row: 'stage7', source: `spec/oracle/stage7/${story}.cjs; changes-1.9/07-last.md`,
  build(L) {
    fixture.questions.filter((q) => q.story === story && !q.error && !random.includes(q.op) && !namesMount(q)).forEach((q, i) => L.ask({ name: `stage 7 ${story}`, blocks: [] }, `${q.op} #${i + 1}`, q.op, q.args));
  },
}));
