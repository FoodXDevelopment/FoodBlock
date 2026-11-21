// Adds to spec/vectors.json three small rules about deals (promises.md, Answers and Owed; Rulings). `node test/make-vectors-deals.cjs`, after
// `node scripts/build-wasm.cjs`. Idempotent; older vectors are untouched, so the old shapes read as before. Every expectation is written here by hand
// from the spec text and checked against the Rust core; the oracle then checks the file.
//   7. Her AI's reading "accepted under rule R" is her accept when R is her live grant that covers the offer; nothing else a machine says accepts.
//   8. A stake given by a transfer rests on the deal its condition `ruled` names, as it does on a deal it is `for`.
//   9. What a side owes in goods ("Anna owes you a loaf") is handed on like a price in money: the new holder is the one owed.
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, door, stage, M, LATER } = kit

const accept = (s, who, deal, extra = {}) => s.say(who, 'promise', { status: 'accepted' }, { answers: deal.hash, for: deal.hash, after: [deal.hash], ...extra })

// ---- 7. accepted under her standing rule ----
{
  const s = story(), sam = s.person('dl-sam'), bea = s.person('dl-bea'), bot = s.person('dl-bot', { kind: 'agent' }), eggs = s.say(sam, 'thing', { kind: 'eggs' })
  const rule = (who, to, scope = {}) => s.say(who, 'grant', { kind: 'agent', scope: { types: ['observe'], parties: [sam.id], limit: M(1000), until: LATER, ...scope } }, { to: to.id })
  const offer = (price = 450) => s.say(sam, 'promise', { terms: { price: M(price) } }, { from: sam.id, to: bea.id, what: eggs.hash })
  const reading = (who, o, refs = {}) => s.say(who, 'observe', { status: 'accepted' }, { answers: o.hash, for: o.hash, after: [o.hash], ...refs })
  const live = rule(bea, bot)
  const o1 = offer(), r1 = reading(bot, o1, { under: live.hash })
  stage('deals: her AI\'s reading "accepted under rule R", R her live grant that covers the offer, is her accept: the deal is accepted', o1, s.held, { stage: 'accepted', accept: r1.hash })
  const o2 = offer(451)
  reading(bot, o2)
  stage('deals: the same reading under no grant is a machine\'s bare word and accepts nothing', o2, s.held, { stage: 'offered', accept: null })
  const noLimit = rule(bea, bot, { limit: undefined }), o3 = offer(452)
  reading(bot, o3, { under: noLimit.hash })
  stage('deals: a rule with no limit lets no accept stand under it: the offer stays offered', o3, s.held, { stage: 'offered', accept: null })
  const o4 = offer(1500)
  reading(bot, o4, { under: live.hash })
  stage('deals: an offer worth more than the rule\'s limit is not covered by it', o4, s.held, { stage: 'offered', accept: null })
  const other = rule(bea, bot, { parties: [] }), o5 = offer(453)
  reading(bot, o5, { under: other.hash })
  stage('deals: a rule that does not name the offerer in its parties covers no accept of his offer', o5, s.held, { stage: 'offered', accept: null })
  const stranger = s.person('dl-stranger', { kind: 'agent' }), o6 = offer(454)
  reading(stranger, o6, { under: live.hash })
  stage('deals: a rule made for one machine lets no other machine accept under it', o6, s.held, { stage: 'offered', accept: null })
  const ended = rule(bea, bot), o7 = offer(455)
  const stopped = s.say(bea, 'grant', { kind: 'agent', status: 'stopped', stop: 'onward' }, { updates: ended.hash })
  reading(bot, o7, { under: ended.hash, after: [o7.hash, stopped.hash] })
  stage('deals: a reading signed after she stopped the rule is not her accept', o7, s.held, { stage: 'offered', accept: null })
  const samBot = s.person('dl-sambot', { kind: 'agent' }), samRule = s.say(sam, 'grant', { kind: 'agent', scope: { types: ['observe'], parties: [bea.id], limit: M(1000), until: LATER } }, { to: samBot.id }), o8 = offer(456)
  reading(samBot, o8, { under: samRule.hash })
  stage('deals: the offerer\'s own machine, under the offerer\'s own rule, accepts nothing: a side never accepts its own offer', o8, s.held, { stage: 'offered', accept: null })
}

// ---- 8. a stake given by a transfer rests on the deal its condition names ----
{
  const s = story(), dep = s.person('dl8-dep'), bene = s.person('dl8-bene'), judge = s.person('dl8-judge'), box = s.say(dep, 'thing', { kind: 'box' })
  const trade = s.say(dep, 'promise', { what: 'the order', terms: { price: M(800) } }, { from: bene.id, to: dep.id })
  const esc = s.say(dep, 'transfer', { money: M(800), condition: { ruled: trade.hash, by: judge.id, awards: bene.id } }, { what: box.hash, to_owner: bene.id })
  s.say(judge, 'observe', { kind: 'ruling', text: 'late', awards: [{ to: bene.id, money: M(300) }] }, { subject: trade.hash })
  door('deals: a stake given by a transfer rests on the deal its condition names: that deal only offered, it releases nothing', 'ruling_releases', [esc, s.held, null], { expect: { releases: false, to: bene.id }, invariants: [36] })
  accept(s, bene, trade)
  door('deals: once that deal is accepted, the same stake is released by the ruling', 'ruling_releases', [esc, s.held, null], { expect: { releases: true, to: bene.id, money: { minor: 300 } }, invariants: [36] })
  // a ruling about something that is no deal (a claim) leaves the stake resting on what it is `for` alone
  const claim = s.say(bene, 'observe', { kind: 'claim', text: 'his goats ate my maize' })
  const esc2 = s.say(dep, 'transfer', { money: M(800), condition: { ruled: claim.hash, by: judge.id, awards: bene.id } }, { what: box.hash, to_owner: bene.id })
  s.say(judge, 'observe', { kind: 'ruling', text: 'yes', awards: [{ to: bene.id }] }, { subject: claim.hash })
  door('deals: a stake whose ruling is about a claim, not a deal, rests on no deal: the ruling releases it', 'ruling_releases', [esc2, s.held, null], { expect: { releases: true, to: bene.id, money: { minor: 800 } }, invariants: [36] })
}

// ---- 9. what is owed in goods is handed on ----
{
  const s = story(), anna = s.person('dl9-anna'), bob = s.person('dl9-bob'), cy = s.person('dl9-cy')
  // an IOU priced in goods: Anna asks (to = the issuer), Bob accepts; one loaf is owed to him
  const iou = s.say(anna, 'promise', { what: 'one loaf', terms: { price: { value: '1', unit: 'loaf' } } }, { from: bob.id, to: anna.id }); accept(s, bob, iou)
  const hand = s.say(bob, 'transfer', {}, { what: iou.hash, to_owner: cy.id, for: iou.hash, after: [iou.hash] })
  stage('deals: an IOU priced in goods before any hand-over reads as before: no owed shown', iou, s.held.filter((b) => b.hash !== hand.hash), { stage: 'accepted', owed: null })
  s.say(cy, 'transfer', { status: 'accepted' }, { answers: hand.hash, for: iou.hash, after: [hand.hash] })
  stage('deals: a loaf owed is handed on like a price in money: the new holder is the one owed', iou, s.held, { owed: { from: [{ owner: cy.id, amount: { value: '1', unit: 'loaf' } }] } })
  // a hand-over by someone who is not owed counts for nothing
  const s2 = story(), a2 = s2.person('dl9-a2'), b2 = s2.person('dl9-b2'), c2 = s2.person('dl9-c2')
  const iou2 = s2.say(a2, 'promise', { what: 'one loaf', terms: { price: { value: '1', unit: 'loaf' } } }, { from: b2.id, to: a2.id }); accept(s2, b2, iou2)
  const bad = s2.say(c2, 'transfer', {}, { what: iou2.hash, to_owner: c2.id, for: iou2.hash, after: [iou2.hash] })
  s2.say(c2, 'transfer', { status: 'accepted' }, { answers: bad.hash, for: iou2.hash, after: [bad.hash] })
  stage('deals: a hand-over of a loaf owed by someone who is not owed it counts for nothing', iou2, s2.held, { owed: null })
  // Anna owes Bob a loaf of her own bread (what moves): Bob hands on the right to the loaf
  const s3 = story(), a3 = s3.person('dl9-a3'), b3 = s3.person('dl9-b3'), c3 = s3.person('dl9-c3'), loaf = s3.say(a3, 'thing', { kind: 'loaf' })
  const owes = s3.say(a3, 'promise', { terms: {} }, { from: a3.id, to: b3.id, what: loaf.hash }); accept(s3, b3, owes)
  const pass3 = s3.say(b3, 'transfer', {}, { what: owes.hash, to_owner: c3.id, for: owes.hash, after: [owes.hash] })
  s3.say(c3, 'transfer', { status: 'accepted' }, { answers: pass3.hash, for: owes.hash, after: [pass3.hash] })
  stage('deals: Anna owes Bob a loaf; Bob hands the right on, and Cy is the one the loaf is owed to', owes, s3.held, { owed: { to: c3.id } })
}

vectorsFile.save(V, tags)
