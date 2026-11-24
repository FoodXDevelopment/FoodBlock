// The audit's worlds, frozen as their answers: `node test/audit/freeze.cjs` writes spec/audit-vectors.json; `--check` writes nothing and fails
// if the file is not what the worlds give now. Each world's blocks once, and every question the word ops of protocol.json ask of it (askAll,
// tools/fuzz/folds.cjs), with the oracle's answer (spec/oracle, from the text alone); the Rust core must give the same, or nothing is written.
// The file is data, never one engine's program (core.md, section 11: it is in the rule set's manifest). Keys are made from fixed seeds here
// so the worlds are the same on every run: test keys only, never for anything real.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const fb = require('../../sdk/javascript/src/index.cjs')
let n = 0
fb.generateKeypair = () => fb.keypairFromSeed(crypto.createHash('sha256').update('foodblock audit key ' + n++).digest('hex'), null)
const oracle = require('../../spec/oracle/fb.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')
const { askAll } = require('../../tools/fuzz/folds.cjs')
const { same } = require('./same.cjs')
const P = require('../../spec/protocol.json')
const OUT = path.join(__dirname, '../../spec/audit-vectors.json')
const files = ['coffee-shop-circle', 'forged-as-the-cafe', 'guest-grant-speaks-for-no-one', 'who-has-a-vote', 'lending-kept-and-broken', 'pool-assessor-by-id', 'confirmer-named-by-id', 'open-standing-offer', 'several-takers-on-one-offer', 'reading-at-a-block-not-a-clock', 'recipe-lineage-make', 'schema-ref-and-stranger-schema', 'acceptances-and-stops-carry-status', 'base-schemas-in-use', 'device-attestation', 'signers-word-and-invasion', 'pot-vouch-and-pool', 'congruence-audit']
const quiet = console.log
console.log = () => {}
for (const f of files) require('./' + f + '.cjs')
console.log = quiet
const WORD = new Set(P.door.protocol.word)
const BLOCKS = '$blocks'
const worlds = [], faults = []
for (const w of global.__worlds) {
  const blocks = w.blocks
  const cases = []
  for (const q of askAll(blocks)) {
    if (!WORD.has(q.op)) continue
    const args = q.args.map((a) => (a === blocks ? BLOCKS : a))
    let expect, core
    try { expect = { answer: oracle.door(q.op, ...JSON.parse(JSON.stringify(q.args))) } } catch (e) { expect = { error: true } }
    try { core = { answer: call(q.op, ...JSON.parse(JSON.stringify(q.args))) } } catch (e) { core = { error: true } }
    // `expect` is a subset match, as a door case's is (vectors.json): `backed` keeps only `backed` and `chain` (its `why` is a sentence)
    const pick = (x) => (q.op === 'backed' && x.answer ? { answer: { backed: x.answer.backed, chain: x.answer.chain } } : x)
    if (!same(pick(expect), pick(core))) faults.push(`${w.name}: ${q.op} ${q.what}`)
    const want = pick(expect)
    cases.push({ op: q.op, args: JSON.parse(JSON.stringify(args)), ...JSON.parse(JSON.stringify(want.error ? { error: true } : { expect: want.answer === undefined ? null : want.answer })) })
  }
  if (cases.length) worlds.push({ name: w.name, blocks: blocks, cases })
}
if (faults.length) { console.error(faults.slice(0, 20).join('\n')); console.error(`${faults.length} answers where the core and the oracle differ: nothing written`); process.exit(1) }
const doc = { $comment: 'The audit\'s worlds (test/audit), frozen as their answers: each world\'s blocks once, and the questions the word ops ask of it (an argument "$blocks" is the world\'s blocks), each with the oracle\'s answer, which the Rust core gives too: `expect` is a subset match, as a door case\'s is (vectors.json), and `error` an argument error. Written by test/audit/freeze.cjs; never edit by hand. Test keys from fixed seeds: never use them for anything real. In the rule set\'s manifest (core.md, section 11).', worlds }
const text = JSON.stringify(doc, null, 1) + '\n'
if (process.argv.includes('--check')) { const ok = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text; console.log(ok ? 'audit-vectors.json is current' : 'audit-vectors.json is out of date: node test/audit/freeze.cjs'); process.exit(ok ? 0 : 1) }
fs.writeFileSync(OUT, text)
console.log(`wrote spec/audit-vectors.json: ${worlds.length} worlds, ${worlds.reduce((a, w) => a + w.cases.length, 0)} cases, ${(text.length / 1e6).toFixed(1)} MB`)
