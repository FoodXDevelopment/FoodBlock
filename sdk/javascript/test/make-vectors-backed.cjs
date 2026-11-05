// Adds to spec/vectors.json the cases of `backed` (authority.md, Backed by a person): is this block backed by this person? `node test/make-vectors-backed.cjs`, after
// `node scripts/build-wasm.cjs`. Idempotent. Each expectation is written by hand from the spec text; the Rust core must give it and so must the oracle (spec/oracle).
// `why` is a sentence, not a rule: the cases check `backed` and `chain`, and this maker checks that a block that is not backed always says why.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { call, story, door, LATER, M } = kit

const backed = (name, block, who, held, expect, invariants) => {
  const got = door(`backed: ${name}`, 'backed', [block, who.id, held], { expect, invariants })
  assert.equal(typeof got.why, expect.backed ? 'object' : 'string', `${name}: a block that is not backed says why, and one that is says nothing`)
  assert.ok(expect.backed ? got.why === null : got.why.length > 0)
}
const yes = (chain) => ({ backed: true, chain: chain.map((b) => b.hash) })
const no = (chain = []) => ({ backed: false, chain: chain.map((b) => b.hash) })
const note = (s, who, refs = {}, extra = {}) => s.say(who, 'observe', { kind: 'note', text: 'x', ...extra }, refs)
const stop = (s, who, grant, extra = {}) => s.say(who, 'grant', { kind: 'agent', status: 'stopped', stop: 'onward' }, { updates: grant.hash, ...extra })
const agentGrant = (s, who, to, scope = {}, refs = {}, state = {}) => s.say(who, 'grant', { kind: 'agent', scope: { acts: ['observe.note'], parties: [], until: LATER, ...scope }, ...state }, { to: to.id, ...refs })

{
  // her own signature
  const s = story(), her = s.person('bk-her'), sam = s.person('bk-sam')
  const mine = note(s, her)
  backed('her own signature backs a block', mine, her, s.held, yes([mine]), [3])
  backed('and no one else\'s: the same block is not backed by another person', mine, sam, s.held, no([mine]))
  const tampered = { ...mine, state: { ...mine.state, text: 'changed' } }
  backed('a block whose bytes were changed after signing is no word', tampered, her, s.held, no())
}
{
  // an agent under a live grant; her stop reaches only the blocks that have seen it
  const s = story(), her = s.person('bk2-her'), bot = s.person('bk2-bot', { kind: 'agent' }), other = s.person('bk2-other', { kind: 'agent' })
  const g = agentGrant(s, her, bot)
  const live = note(s, bot, { under: g.hash })
  backed('an agent under her live grant is backed by her', live, her, s.held, yes([live, g]), [9])
  backed('and not by anyone else', live, other, s.held, no([live, g]))
  const stolen = note(s, other, { under: g.hash })
  backed('a grant made for one agent backs no other', stolen, her, s.held, no([stolen]))
  const early = note(s, bot, { under: g.hash })
  const stopped = stop(s, her, g)
  backed('under a grant she stopped, a block signed before she stopped still counts, though the stop reaches her node first', early, her, s.held, yes([early, g]), [9])
  const unseen = note(s, bot, { under: g.hash })
  backed('a block signed without having seen the stop counts: place in time is what the signer had seen, never a clock or an arrival', unseen, her, s.held, yes([unseen, g]), [9])
  const seen = note(s, bot, { under: g.hash }, {}); void seen
}
{
  // the signer's own chain keeps what it has seen: an act later in its chain than an acknowledged stop is not backed
  const s = story(), her = s.person('bk3-her'), bot = s.person('bk3-bot', { kind: 'agent' })
  const g = agentGrant(s, her, bot)
  const before = note(s, bot, { under: g.hash })
  const stopped = stop(s, her, g)
  const delayed = note(s, bot, { under: g.hash })
  const ack = s.say(bot, 'observe', { kind: 'ack', text: 'her grant was stopped' }, { for: g.hash }, { after: [stopped.hash] })
  const later = note(s, bot, { under: g.hash })
  const named = note(s, bot, { under: g.hash }, {}); void named
  backed('a block signed before the stop and before it was seen is backed', before, her, s.held, yes([before, g]), [9])
  backed('so is one signed after the stop but before the signer acknowledged it: its operator answers for the delay under its own word', delayed, her, s.held, yes([delayed, g]), [9])
  backed('once the signer\'s chain has a block that names the stop, every later block of that chain has seen it', later, her, s.held, no([later]), [9])
  backed('the acknowledgment itself is no act under the grant', ack, her, s.held, no([ack]))
  // a block that names the stop itself, no acknowledgment before it
  const s2 = story(), her2 = s2.person('bk3b-her'), bot2 = s2.person('bk3b-bot', { kind: 'agent' })
  const g2 = agentGrant(s2, her2, bot2)
  const stop2 = stop(s2, her2, g2)
  const names = note(s2, bot2, { under: g2.hash }, {}); void names
  const knew = s2.say(bot2, 'observe', { kind: 'note', text: 'x' }, { under: g2.hash }, { after: [stop2.hash] })
  backed('a block that names the stop in `after` has seen it', knew, her2, s2.held, no([knew]), [9])
  void bot
}
{
  // backdating: a block cannot be put before a stop its signer's chain already holds; two blocks that name one prev are a fork, and a fork counts for nothing
  const s = story(), her = s.person('bk4-her'), bot = s.person('bk4-bot', { kind: 'agent' })
  const g = agentGrant(s, her, bot)
  const first = note(s, bot, { under: g.hash })
  const stopped = stop(s, her, g)
  const seeing = s.say(bot, 'observe', { kind: 'note', text: 'x' }, { under: g.hash }, { after: [stopped.hash] })
  // the same key signs a second block after `first`, as if the stop had never been seen
  const state = { kind: 'note', text: 'backdated', seq: first.state.seq + 1, at: first.state.at, audience: 'public' }
  const refs = { author: bot.id, prev: first.hash, under: g.hash }
  const forged = s.keep({ hash: kit.fb.hash('observe', state, refs), type: 'observe', state, refs, signature: kit.fb.sign({ type: 'observe', state, refs }, kit.keyOf('bk4-bot').private_key) })
  backed('a block put before a stop its signer already named is a fork of its chain, and a fork counts for nothing', forged, her, s.held, no([forged]))
  backed('and the block it forks from is not backed either', seeing, her, s.held, no([seeing]))
}
{
  // forged or broken chains
  const s = story(), her = s.person('bk5-her'), mal = s.person('bk5-mal'), bot = s.person('bk5-bot', { kind: 'agent' })
  const g = agentGrant(s, mal, bot)
  const b = note(s, bot, { under: g.hash })
  backed('a grant someone else signed backs nothing of hers, whatever it names', b, her, s.held, no([b, g]))
  backed('it backs the blocks of the one who signed it', b, mal, s.held, yes([b, g]), [9])
  const ghost = { type: 'grant', state: { kind: 'agent', scope: { acts: ['observe.note'], until: LATER }, at: '2026-10-27T12:00:00.000Z', audience: 'public' }, refs: { author: her.id, to: bot.id } }
  ghost.hash = kit.fb.hash(ghost.type, ghost.state, ghost.refs)
  const orphan = s.say(bot, 'observe', { kind: 'note', text: 'x' }, { under: g.hash })
  const missing = { ...orphan, refs: { ...orphan.refs, under: ghost.hash } }
  backed('a block under a grant that is not held is no word', missing, her, s.held, no())
  // a child grant passed on by someone who did not receive the parent is refused: its blocks are no word
  const top = agentGrant(s, her, bot, {}, {}, { depth: 1 })
  const fake = s.raw(mal, 'grant', { kind: 'agent', scope: { acts: ['observe.note'], parties: [], until: LATER } }, { to: bot.id, parent: top.hash })
  const rider = s.raw(bot, 'observe', { kind: 'note', text: 'x' }, { under: fake.hash })
  backed('a grant passed on by one who never received the parent breaks the chain', rider, her, s.held, no())
}
{
  // outside what the grant covers: the act, the parties, the money
  const s = story(), her = s.person('bk6-her'), bot = s.person('bk6-bot', { kind: 'agent' }), shop = s.person('bk6-shop'), stranger = s.person('bk6-stranger')
  const g = s.say(her, 'grant', { kind: 'agent', scope: { acts: ['transfer', 'observe.note'], parties: [shop.id], limit: M(10000), each: M(1000), until: LATER } }, { to: bot.id })
  const inside = s.say(bot, 'transfer', { money: M(900) }, { under: g.hash, to_owner: shop.id })
  backed('inside what the grant names: its act, its parties and its money', inside, her, s.held, yes([inside, g]), [23])
  const dear = s.say(bot, 'transfer', { money: M(5000) }, { under: g.hash, to_owner: shop.id })
  backed('past the cap a public grant shows on each act, it does not bind her', dear, her, s.held, no([dear]), [23])
  const toStranger = s.say(bot, 'transfer', { money: M(500) }, { under: g.hash, to_owner: stranger.id })
  backed('to a party the grant does not name', toStranger, her, s.held, no([toStranger]))
  const offScope = s.say(bot, 'observe', { kind: 'order', text: 'x' }, { under: g.hash })
  backed('an act the grant does not list', offScope, her, s.held, no([offScope]))
  const silent = s.say(her, 'grant', { kind: 'agent', scope: { acts: ['transfer'], parties: [shop.id], until: LATER } }, { to: bot.id })
  const unfenced = s.say(bot, 'transfer', { money: M(100) }, { under: silent.hash, to_owner: shop.id })
  backed('a grant with no limit lets no money move', unfenced, her, s.held, no([unfenced]), [23])
}
{
  // a helper under her AI under her: each grant passed on fits inside the one above, and every link must be live
  const s = story(), her = s.person('bk7-her'), ai = s.person('bk7-ai', { kind: 'agent' }), helper = s.person('bk7-helper', { kind: 'agent' })
  const g = agentGrant(s, her, ai, {}, {}, { depth: 1 })
  const h = agentGrant(s, ai, helper, {}, { parent: g.hash })
  const b = note(s, helper, { under: h.hash })
  backed('a helper under her AI under her grant is backed by her', b, her, s.held, yes([b, h, g]), [9, 10])
  backed('and the chain does not stop at the AI: the AI is not the person it roots in', b, ai, s.held, no([b, h, g]))
  const aiStops = stop(s, ai, h)
  const afterAi = s.say(helper, 'observe', { kind: 'note', text: 'x' }, { under: h.hash }, { after: [aiStops.hash] })
  backed('her AI stopping the helper\'s grant ends it for the blocks that have seen that', afterAi, her, s.held, no([afterAi]), [9])
  backed('what the helper signed before, unseen, stands', b, her, s.held, yes([b, h, g]), [9])
  {
    const s3 = story(), her3 = s3.person('bk7c-her'), ai3 = s3.person('bk7c-ai', { kind: 'agent' }), helper3 = s3.person('bk7c-helper', { kind: 'agent' })
    const g3 = agentGrant(s3, her3, ai3, {}, {}, { depth: 1 })
    const wide = s3.raw(ai3, 'grant', { kind: 'agent', scope: { acts: ['observe.note', 'transfer'], parties: [], until: LATER } }, { to: helper3.id, parent: g3.hash })
    const over = s3.raw(helper3, 'observe', { kind: 'note', text: 'x' }, { under: wide.hash })
    backed('a grant wider than the one above it breaks the chain', over, her3, s3.held, no(), [10])
  }
  const s2 = story(), her2 = s2.person('bk7b-her'), ai2 = s2.person('bk7b-ai', { kind: 'agent' }), helper2 = s2.person('bk7b-helper', { kind: 'agent' })
  const g2 = agentGrant(s2, her2, ai2, {}, {}, { depth: 1 })
  const h2 = agentGrant(s2, ai2, helper2, {}, { parent: g2.hash })
  const herStop = stop(s2, her2, g2)
  const afterHer = s2.say(helper2, 'observe', { kind: 'note', text: 'x' }, { under: h2.hash }, { after: [herStop.hash] })
  backed('her stopping the grant to her AI ends every grant passed on from it, for the blocks that have seen the stop', afterHer, her2, s2.held, no([afterHer]), [9])
}
{
  // a circle: its founding block says how its owners agree (circles.md, Many hands); a member under the circle's grant is backed by each owner
  const s = story(), ann = s.person('bk8-ann'), bea = s.person('bk8-bea'), eve = s.person('bk8-eve'), bot = s.person('bk8-bot', { kind: 'agent' })
  const stall = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Stall', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }], needed: { sign: 2 } })
  const into = (who) => { const g = s.say(ann, 'grant', { kind: 'member', roles: ['owner'] }, { subject: stall.hash, to: who.id, as: stall.hash }); return s.say(who, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: stall.hash }) }
  const beaIn = into(bea)
  const lone = s.say(ann, 'grant', { kind: 'agent', scope: { acts: ['observe.note'], parties: [], until: LATER } }, { to: bot.id, as: stall.hash })
  const early = note(s, bot, { under: lone.hash })
  backed('the circle needs two owners: a grant one owner signs as the circle backs nothing', early, ann, s.held, no([early]), [9])
  const confirm = s.say(bea, 'observe', { kind: 'agree', text: 'yes' }, { confirms: lone.hash })
  const b = s.say(bot, 'observe', { kind: 'note', text: 'x' }, { under: lone.hash }, { after: [confirm.hash] })
  backed('with the second owner\'s confirm the grant is the circle\'s: a member under it is backed by one owner', b, ann, s.held, yes([b, lone]), [9])
  backed('and by the other, who holds sign in the circle', b, bea, s.held, yes([b, lone]), [9])
  backed('and by the circle itself', b, { id: stall.hash }, s.held, yes([b, lone]), [9])
  backed('but not by someone who holds no sign there', b, eve, s.held, no([b, lone]))
  const own = s.say(ann, 'observe', { kind: 'note', text: 'x' }, { as: stall.hash }, { after: [beaIn.hash] })
  backed('a block one owner signs as the circle is not backed while the circle needs two', own, ann, s.held, no([own]))
  s.say(bea, 'observe', { kind: 'agree', text: 'yes' }, { confirms: own.hash })
  backed('with the second owner\'s confirm it is backed by both owners', own, bea, s.held, yes([own]), [9])
  // one is enough when the founding block says nothing: no number is filled in
  const café = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Cafe', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }] })
  const g2 = s.say(ann, 'grant', { kind: 'member', roles: ['owner'] }, { subject: café.hash, to: bea.id, as: café.hash })
  const beaCafe = s.say(bea, 'grant', { status: 'accepted', kind: 'member' }, { answers: g2.hash, subject: café.hash })
  const gc = s.say(ann, 'grant', { kind: 'agent', scope: { acts: ['observe.note'], parties: [], until: LATER } }, { to: bot.id, as: café.hash })
  const bc = s.say(bot, 'observe', { kind: 'note', text: 'x' }, { under: gc.hash }, { after: [beaCafe.hash] })
  backed('one owner\'s signature is enough when the founding block states no number', bc, ann, s.held, yes([bc, gc]), [9])
  backed('and the other owner holds sign there too, once the block has seen her join', bc, bea, s.held, yes([bc, gc]), [9])
  s.say(ann, 'grant', { kind: 'agent', status: 'stopped', stop: 'onward' }, { updates: gc.hash, as: café.hash })
}
{
  // a witness: a block in which a signer says what a channel said; backed by her only under a live grant of hers that names that channel and that signer
  const s = story(), her = s.person('bk9-her'), host = s.person('bk9-host', { kind: 'agent' }), other = s.person('bk9-other', { kind: 'agent' })
  const readback = 'a'.repeat(64)
  const deal = s.say(host, 'observe', { kind: 'note', text: 'the read-back she saw' })
  const word = (who, under, channel = 'sms:+447700900123', extra = {}) => s.say(who, 'observe', { kind: 'witness', channel, said: 'yes', readback, ...extra }, { for: deal.hash, ...(under ? { under: under.hash } : {}) })
  const none = word(host, null)
  backed('a witness with no grant is the host\'s own word, never hers', none, her, s.held, no([none]), [9])
  const g = s.say(her, 'grant', { kind: 'witness', channel: 'sms:+447700900123', scope: { acts: ['observe.witness'], parties: [], until: LATER } }, { to: host.id })
  const w = word(host, g)
  backed('an SMS witness under her grant, which names the channel and the host as witness, is backed by her', w, her, s.held, yes([w, g]), [9])
  const wrongChannel = word(host, g, 'sms:+447700900999')
  backed('a witness for another channel is not covered by that grant', wrongChannel, her, s.held, no([wrongChannel]), [9])
  const wide = s.say(her, 'grant', { kind: 'agent', scope: { acts: ['observe.witness'], parties: [], until: LATER } }, { to: other.id })
  const open = word(other, wide)
  backed('a grant that names no channel backs no witness of any channel', open, her, s.held, no([open]), [9])
  const stranger = word(other, g)
  backed('a witness signed by someone the grant is not made for is not backed', stranger, her, s.held, no([stranger]))
  // a grant that names a channel is passed on only to that channel
  const hostGrant = s.say(her, 'grant', { kind: 'witness', channel: 'sms:+447700900123', depth: 1, scope: { acts: ['observe.witness'], parties: [], until: LATER } }, { to: other.id })
  const widerChild = s.raw(other, 'grant', { kind: 'witness', scope: { acts: ['observe.witness'], parties: [], until: LATER } }, { to: host.id, parent: hostGrant.hash })
  door('backed: a grant passed on from one that names a channel must name the same channel', 'valid', [widerChild, s.held.filter((b) => b.hash !== widerChild.hash), null], { expect: [{ code: 'wider_than_parent' }] })
  const ended = stop(s, her, g)
  const after = s.say(host, 'observe', { kind: 'witness', channel: 'sms:+447700900123', said: 'yes', readback }, { for: deal.hash, under: g.hash }, { after: [ended.hash] })
  backed('once she stops the grant, a witness signed after the host saw it is not backed', after, her, s.held, no([after]), [9])
}

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
void call
