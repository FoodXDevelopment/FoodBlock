const { fb, oracle, World } = require('./lib.cjs')
const { w } = require('./c1.cjs')
console.log('\n=============== c1e vote')
const P = w.people, alice = P.alice, bob = P.bob, carol = P.carol
const cafe = w.blocks.find(b => b.type === 'actor' && b.state.kind === 'circle')
const shareKind = w.blocks.find(b => b.type === 'thing' && b.state.kind === 'share' && !b.refs.of)
const shares = w.blocks.filter(b => b.state.lot)
const counter = w.person('counter', 'agent')
const rule = w.w(bob, 'thing', { kind: 'schema', target: 'observe.ballot', name: 'one share one vote', fields: { choice: 'hash' }, grounds: { event: 'ballot cast by a holder of a cafe share', confirmers: [counter.id] } }, { as: cafe.hash }, 'vote rule schema (counter named in grounds.confirmers)')
const rec = w.w(bob, 'thing', { kind: 'vote', name: 'Open a second shop?' }, { under: rule.hash, as: cafe.hash }, 'vote record')
const heads = []
const salt = fb.newSalt()
const choice = fb.saltedHash(salt, 'yes')
let ballot
try {
  ballot = w.w(carol, 'observe', { kind: 'ballot', choice }, { for: rec.hash, under: rule.hash, schema: rule.hash }, 'carol ballot', { audience: [counter.id] })
  console.log('ballot written', JSON.stringify(ballot).slice(0, 300))
} catch (e) { console.log('ballot err', e.message) }
const result = w.w(counter, 'observe', { kind: 'result', counted: [choice] }, { for: rec.hash, under: rule.hash }, 'counter result')
console.log('counted_in', fb.fold.countedIn(result, choice, counter.id), 'sdk; non-counter', fb.fold.countedIn(result, choice, bob.id))
// who has a vote? holdings of kind in the causal past of the vote record
const past = fb.pastOf(rec, w.blocks)
const inPast = w.blocks.filter(b => past.has(b.hash) || b.hash === rec.hash)
const holdings = {}
for (const s of shares) { const o = fb.ownerOf(s, inPast); holdings[o ? o.slice(0, 6) : 'null'] = (holdings[o ? o.slice(0, 6) : 'null'] || 0) + 1 }
console.log('holdings computed in vote record causal past (all blocks written before? record has no after):', JSON.stringify(holdings), 'past size', past.size, 'of', w.blocks.length)
const recAfter = w.w(bob, 'thing', { kind: 'vote', name: 'Open a second shop? (v2 naming heads)' }, { under: rule.hash, as: cafe.hash, after: fb.headsAmong ? undefined : undefined }, 'vote record 2')
console.log('names carol=', carol.id.slice(0, 6), 'bob', bob.id.slice(0, 6))
const all = {}; for (const s of shares) { const o = fb.ownerOf(s, w.blocks); all[o.slice(0, 6)] = (all[o.slice(0, 6)] || 0) + 1 }
console.log('holdings over ALL blocks', JSON.stringify(all))
w.report()
