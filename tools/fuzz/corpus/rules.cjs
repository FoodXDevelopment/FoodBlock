'use strict';
// Privacy and rules: every door question the oracle's stories of spec/oracle/stories/privacy and spec/oracle/stories/rules ask (each checked there against the text's answer), as fixed worlds asked of both engines.
// The questions are written by spec/oracle/stories/export.cjs into sdk/rust/tests/fixtures/privacy.json and rules.json; one entry per story, so a split is named by the story it breaks.
// A question the oracle refuses is left out, and so is one whose answer is random (a key pair, an envelope) or that names a mount (a mount is a fresh random id in each engine;
// tests/rules.rs and spec/oracle/stories/core-stories.cjs read one engine's id as the other's).
const path = require('path');
const random = ['keypair', 'seal', 'encryption_keypair', 'seal_copy', 'wrap_copy'];
module.exports = ['privacy', 'rules'].flatMap((subject) => {
  const fixture = require(path.join(__dirname, `../../../sdk/rust/tests/fixtures/${subject}.json`));
  const mounts = new Set(fixture.questions.filter((q) => q.op === 'mount' && typeof q.answer === 'string').map((q) => q.answer));
  const namesMount = (q) => q.op === 'mount' || q.op === 'unmount' || (JSON.stringify(q.args).match(/"[0-9a-f]{32}"/g) || []).some((m) => mounts.has(m.slice(1, -1)));
  const stories = [...new Set(fixture.questions.map((q) => q.story))];
  return stories.map((story) => ({
    name: `${subject}: ${story}`, row: subject, source: `spec/oracle/stories/${subject}/${story}.cjs`,
    build(L) {
      fixture.questions.filter((q) => q.story === story && !q.error && !random.includes(q.op) && !namesMount(q)).forEach((q, i) => L.ask({ name: `${subject} ${story}`, blocks: [] }, `${q.op} #${i + 1}`, q.op, q.args));
    },
  }));
});
