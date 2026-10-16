// Adds to spec/vectors.json the cases of the rules in "causal dependencies, one refusal rule, circles' cut, consent follows the
// principal, sealed headers": `node test/make-vectors-causal.cjs`. It is idempotent: a case it made is replaced by name, never
// repeated. Every expectation is written here by hand and checked against the Rust core (through this SDK) before the file is
// written; the oracle (spec/oracle) then checks the file against an implementation written from the spec text alone.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const fb = require('../src/index.cjs')
const { call } = require('../src/core.cjs')
const { recoveryKeyHash, genesis, keyGrant } = fb.identity

const FILE = path.join(__dirname, '../../../spec/vectors.json')
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const keys = {}
const keyOf = (name, suite = 'std') => {
  if (keys[name]) return keys[name]
  const seed = sha(`foodblock 1.6 causal vectors: ${name}`), x = sha(`foodblock 1.6 causal vectors x25519: ${name}`)
  const kp = fb.keypairFromSeed(seed, suite)
  keys[name] = { seed, private_key: kp.private_key, public_key_sign: kp.public_key_sign, public_key_encrypt: fb.encryptionKeyOf(x, suite) }
  if (name.endsWith('_recovery')) keys[name].hash = recoveryKeyHash(kp.public_key_sign, suite)
  return keys[name]
}
let tick = 0
const at = () => new Date(Date.UTC(2026, 9, 16, 12, 0, 0) + 1000 * tick++).toISOString()
const codesOf = (list) => [...new Set(list.map((one) => one.code))]
const DAY = '2026-10-20T00:00:00.000Z', LATER = '2026-12-31T00:00:00.000Z'
const M = (minor, currency = 'GBP') => fb.money(minor, currency)

function story() {
  const held = []
  const keep = (block) => { held.push(block); return block }
  const person = (name, { kind = 'person', recover = true } = {}) => {
    const key = keyOf(name), recovery = recover ? keyOf(`${name}_recovery`) : null
    const g = genesis(key, { kind, at: at(), encryptionKey: key.public_key_encrypt, ...(recover ? { recoveryKey: recovery.public_key_sign, reach: 'P30D' } : {}) })
    keep(g)
    return { name, id: g.hash, key, recovery, g }
  }
  const say = (who, type, state, refs = {}, { key = who.name, after, link } = {}) => {
    refs = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)].sort() : v]))
    const block = fb.write(type, state, refs, { author: who.id, key: keyOf(key), held, at: at(), audience: 'public', after, link })
    return keep(block)
  }
  const without = (...blocks) => held.filter((b) => !blocks.includes(b))
  return { held, person, say, keep, without }
}

const made = new Set()
function door(name, op, args, { expect, codes, exact } = {}) {
  args = JSON.parse(JSON.stringify(args))
  const got = call(op, ...args)
  if (codes) assert.deepEqual(codesOf(got), codes, `${name}: ${JSON.stringify(got)}`)
  else if (expect !== undefined) {
    const subset = (a, b) => (Array.isArray(b) && Array.isArray(a) && a.length === b.length ? b.every((v, i) => subset(a[i], v)) : (b && typeof b === 'object' && !Array.isArray(b)) ? Object.entries(b).every(([k, v]) => subset(a && a[k], v)) : (assert.deepEqual(a, b, name), true))
    if (exact) assert.deepEqual(got, expect, name); else subset(got, expect)
  }
  made.add(name)
  V.door = V.door.filter((c) => c.name !== name)
  V.door.push({ name, op, args, ...(codes ? { codes } : { expect: expect !== undefined ? expect : got }), ...(exact ? { exact: true } : {}) })
  return got
}
// A check case (no context): the refusal the bytes alone give.
function check(name, block, codes) {
  const got = call('refusals', block.type, block.state, block.refs, [], null)
  assert.deepEqual(codesOf(got), codes, `${name}: ${JSON.stringify(got)}`)
  made.add(name)
  V.refusals.cases = V.refusals.cases.filter((c) => c.name !== name)
  V.refusals.cases.push({ name, by: 'check', block: { type: block.type, state: block.state, refs: block.refs }, codes })
}
const sorted = (list) => [...list].sort()

// ---- 1. Authority depends on blocks, and they are causal dependencies: a block waits until it holds them, then is judged once ----
{
  const s = story(), ann = s.person('cann'), bob = s.person('cbob'), ag = s.person('cagent', { kind: 'agent' })
  const eggs = s.say(ann, 'thing', { kind: 'eggs' })
  s.say(ann, 'grant', { kind: 'operator' }, { to: ag.id })
  const grant = s.say(ann, 'grant', { kind: 'shop', depth: 1, scope: { acts: ['promise'], until: LATER } }, { to: ag.id })
  const offer = s.say(ag, 'promise', { terms: { price: M(450), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash, under: grant.hash })
  const held0 = s.without(grant, offer)
  door('needs: a promise rests on its prev and the grant it acts under', 'needs', [offer], { expect: [offer.refs.prev, grant.hash], exact: true })
  door('needs: only the grant is missing when the rest is held', 'needs', [offer, s.without(offer, grant)], { expect: [grant.hash], exact: true })
  door('needs: an observe rests on its prev alone, whatever else it names', 'needs', [{ ...eggs, type: 'observe', refs: { ...eggs.refs, under: grant.hash } }], { expect: [eggs.refs.prev], exact: true })
  door('valid: a promise under a grant that is not held is not judged: unmet', 'valid', [offer, s.without(offer, grant)], { codes: ['unmet'] })
  door('valid: judged once the grant is held', 'valid', [offer, s.without(offer)], { codes: [] })
  door('accept: a promise under a grant not yet held waits, and is taken once the grant arrives', 'accept', [[offer], s.without(grant, offer), null, null], { expect: { taken: [], waiting: [{ hash: offer.hash, needs: [grant.hash] }], refused: [] } })
  door('accept: grant and promise in one push, in any order: both taken', 'accept', [[offer, grant], s.without(grant, offer), null, null], { expect: { taken: [grant.hash, offer.hash], waiting: [], refused: [] } })
  // a grant passed on waits for its parent
  const child = s.say(ag, 'grant', { kind: 'shop', scope: { acts: ['promise'], until: DAY } }, { to: bob.id, parent: grant.hash })
  door('needs: a grant passed on rests on its parent', 'needs', [child], { expect: [child.refs.prev, grant.hash], exact: true })
  door('accept: a grant passed on waits for its parent (its scope is judged once, against it)', 'accept', [[child], s.without(grant, offer, child), null, null], { expect: { taken: [], waiting: [{ hash: child.hash, needs: [child.refs.prev, grant.hash] }] } })
  // a rotation by the recovery key waits for the block it counts to
  const cy = s.person('ccy'), early = s.say(cy, 'observe', { kind: 'note', text: 'mine' }), late = s.say(cy, 'observe', { kind: 'note', text: 'a thief' })
  const fresh = keyOf('ccy_new')
  const rot = s.keep(keyGrant(cy.id, fresh.public_key_sign, { private_key: cy.recovery.private_key, recoveryKey: cy.recovery.public_key_sign, last: null }, { replaces: cy.key.public_key_sign, countedTo: early.hash, at: at() }))
  const heldCy = s.held.filter((b) => b.refs?.author === cy.id || b.hash === cy.id)
  door('needs: a rotation rests on the block it counts to', 'needs', [rot], { expect: [rot.refs.prev, early.hash], exact: true })
  door('accept: a rotation by the recovery key waits for its counted_to', 'accept', [[rot], heldCy.filter((b) => b !== early && b !== late && b !== rot), null, null], { expect: { taken: [], waiting: [{ hash: rot.hash, needs: [early.hash] }] } })
  door('key_timeline: a rotation that is not whole is not read: the old key keeps speaking', 'key_timeline', [cy.id, heldCy.filter((b) => b !== early && b !== late), null], { expect: [{ key: cy.key.public_key_sign }] })
  const withRot = door('key_timeline: once its counted_to is held the new key comes in', 'key_timeline', [cy.id, heldCy, null], { expect: [{ key: cy.key.public_key_sign }, { key: fresh.public_key_sign }] })
  assert.equal(withRot.length, 2)
  // the new key sees the old chain without help from the client
  door('past_of: a rotation sees the block it counts to, and so the old chain up to it', 'past_of', [rot, heldCy], { expect: sorted([cy.id, early.hash]), exact: true })
  const first = s.say(cy, 'observe', { kind: 'note', text: 'back' }, {}, { key: 'ccy_new', link: { seq: 1, prev: rot.hash } })
  door('sees: the new key\'s first block sees the old chain', 'sees', [first, early, s.held.filter((b) => b.refs?.author === cy.id || b.hash === cy.id)], { expect: true })
  door('sees: and not what the old key wrote after counted_to', 'sees', [first, late, s.held.filter((b) => b.refs?.author === cy.id || b.hash === cy.id)], { expect: false })
}

// ---- 2. Equivocation: the same pair is listed whichever of the two arrives together ----
{
  const s = story(), eve = s.person('ceve')
  const base = s.say(eve, 'observe', { kind: 'note', text: 'base' })
  const one = s.say(eve, 'observe', { kind: 'note', text: 'one' }, {}, { link: { seq: 2, prev: base.hash } })
  const two = s.say(eve, 'observe', { kind: 'note', text: 'two' }, {}, { link: { seq: 2, prev: base.hash } })
  const pair = sorted([one.hash, two.hash])
  const held = s.without(one, two)
  door('accept: two blocks of one key naming one prev that arrive together: neither is taken, the pair is listed', 'accept', [[one, two], held, null, null], { expect: { taken: [], waiting: [], refused: [], equivocations: [pair] }, exact: false })
  door('accept: the same push in the other order gives the same answer', 'accept', [[two, one], held, null, null], { expect: { taken: [], equivocations: [pair] } })
  door('accept: a block that forks one already held is the later: not taken, the pair listed', 'accept', [[two], s.without(two), null, null], { expect: { taken: [], equivocations: [pair] } })
}

// ---- 3. The promise fold: live offers, the offer the binding accept answers, accepts that cross ----
{
  const s = story(), ann = s.person('pann'), bob = s.person('pbob')
  const device = keyOf('pann_device')
  const grantDevice = s.keep(keyGrant(ann.id, device.public_key_sign, { private_key: ann.key.private_key, last: null, broughtIn: ann.id }, { at: at() }))
  const eggs = s.say(ann, 'thing', { kind: 'eggs' })
  const offer = s.say(ann, 'promise', { terms: { price: M(450), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash })
  const counterAs = (price) => s.say(bob, 'promise', { terms: { price: M(price), expires: DAY } }, { from: ann.id, to: bob.id, what: eggs.hash, answers: offer.hash, for: offer.hash, after: [offer.hash] })
  const c1 = counterAs(400), c2 = counterAs(350)
  door('promise_stage: two counters to one offer both stand: two live offers, and none is named', 'promise_stage', [offer, s.held, {}], { expect: { stage: 'offered', offer: null, accept: null, live: sorted([c1.hash, c2.hash]) } })
  door('promise_stage: a promise that rests on blocks not held has no stage', 'promise_stage', [offer, s.without(eggs), {}], { expect: null })
  const accept1 = s.say(ann, 'promise', { status: 'accepted' }, { answers: c1.hash, for: offer.hash, after: [c1.hash] })
  door('promise_stage: the accept binds the offer it answers', 'promise_stage', [offer, s.held, {}], { expect: { stage: 'accepted', offer: c1.hash, accept: accept1.hash, forks: [] } })
  // two accepts that do not see each other (two devices of one side): neither binds
  const accept2 = s.say(ann, 'promise', { status: 'accepted' }, { answers: c2.hash, for: offer.hash, after: [c2.hash] }, { key: 'pann_device', link: { seq: 1, prev: grantDevice.hash } })
  door('promise_stage: two accepts of two live offers that do not see each other prove the accepter\'s lie: neither binds', 'promise_stage', [offer, s.held, {}], { expect: { stage: 'offered', accept: null, forks: sorted([accept1.hash, accept2.hash]) } })
}

// ---- 4. The circle: heads, the cut, the removal that has not seen the answer ----
{
  const s = story(), fay = s.person('fay'), mo = s.person('mo'), nell = s.person('nell'), ola = s.person('ola')
  const circle = s.say(fay, 'actor', { kind: 'circle', name: 'Bakery', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }, { name: 'orders', powers: ['sign'] }, { name: 'speak', powers: [] }] })
  const invite = (who, roles) => s.say(fay, 'grant', { kind: 'member', roles }, { subject: circle.hash, as: circle.hash, to: who.id })
  const yes = (who, inv) => s.say(who, 'grant', { kind: 'member', status: 'accepted' }, { answers: inv.hash, subject: circle.hash, after: [inv.hash] })
  const note = (who, text, after = []) => s.say(who, 'observe', { kind: 'note', text }, { as: circle.hash, ...(after.length ? { after } : {}) })
  const invMo = invite(mo, ['orders']), yesMo = yes(mo, invMo)
  const moBefore = note(mo, 'flour ordered'), moAfter = note(mo, 'more flour')
  const removeMo = s.say(fay, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: moBefore.hash }, { updates: invMo.hash, subject: circle.hash, as: circle.hash, after: [invMo.hash, moBefore.hash, yesMo.hash] })
  const blocks = s.held
  door('may_act_as: a block of the removed member up to the counted_to counts', 'may_act_as', [moBefore, circle.hash, blocks, null], { expect: true })
  door('may_act_as: a block after counted_to carries no authority for the circle, though it never saw the removal', 'may_act_as', [moAfter, circle.hash, blocks, null], { expect: false })
  door('may_act_as: and without the removal held the same block counts (a reader that has not met it)', 'may_act_as', [moAfter, circle.hash, s.without(removeMo), null], { expect: true })
  const moState = call('circle_state', circle.hash, blocks, null)
  assert.equal(moState.removed[mo.id], moBefore.hash)
  door('circle_state: the removal keeps the counted_to the stop named', 'circle_state', [circle.hash, blocks, null], { expect: { removed: { [mo.id]: moBefore.hash } } })
  // a stop that names no counted_to cuts at the stop itself: what it saw counts, what it did not see does not
  const invNell = invite(nell, ['orders']), yesNell = yes(nell, invNell)
  const nellSeen = note(nell, 'seen by the removal'), nellUnseen = note(nell, 'not seen by the removal')
  s.say(fay, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: invNell.hash, subject: circle.hash, as: circle.hash, after: [invNell.hash, nellSeen.hash, yesNell.hash] })
  door('circle_state: a removal that names no counted_to keeps null', 'circle_state', [circle.hash, s.held, null], { expect: { removed: { [nell.id]: null } } })
  door('may_act_as: with no counted_to the stop is the cut: a block it saw counts', 'may_act_as', [nellSeen, circle.hash, s.held, null], { expect: true })
  door('may_act_as: with no counted_to a block the stop did not see does not', 'may_act_as', [nellUnseen, circle.hash, s.held, null], { expect: false })
  // heads: a second accepted grant supersedes the first; ending it ends membership
  const invOla = invite(ola, ['speak']), yesOla = yes(ola, invOla)
  const invOla2 = invite(ola, ['orders'])
  const yesOla2 = s.say(ola, 'grant', { kind: 'member', status: 'accepted' }, { answers: invOla2.hash, subject: circle.hash, after: [invOla2.hash, yesOla.hash] })
  door('circle_state: a member who accepts a second grant holds the newer one\'s roles', 'circle_state', [circle.hash, s.held, null], { expect: { members: { [ola.id]: { roles: ['orders'], grant: invOla2.hash } } } })
  s.say(fay, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: invOla2.hash, subject: circle.hash, as: circle.hash, after: [invOla2.hash, yesOla2.hash] })
  const olaOut = call('circle_state', circle.hash, s.held, null)
  assert.ok(!olaOut.members[ola.id] && ola.id in olaOut.removed)
  door('circle_state: ending the newest grant removes the member; the older one is not revived', 'circle_state', [circle.hash, s.held, null], { expect: { removed: { [ola.id]: null } } })
}
{
  // a removal that has not seen the member's answer comes before it: the answer accepts nothing
  const s = story(), fay = s.person('fay2'), pat = s.person('pat2')
  const circle = s.say(fay, 'actor', { kind: 'circle', name: 'Co-op', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }, { name: 'orders', powers: ['sign'] }] })
  const inv = s.say(fay, 'grant', { kind: 'member', roles: ['orders'] }, { subject: circle.hash, as: circle.hash, to: pat.id })
  const stop = s.say(fay, 'grant', { kind: 'member', status: 'stopped', stop: 'onward' }, { updates: inv.hash, subject: circle.hash, as: circle.hash, after: [inv.hash] })
  const yes = s.say(pat, 'grant', { kind: 'member', status: 'accepted' }, { answers: inv.hash, subject: circle.hash, after: [inv.hash] })
  const lateNote = s.say(pat, 'observe', { kind: 'note', text: 'ordering' }, { as: circle.hash })
  const state = call('circle_state', circle.hash, s.held, null)
  assert.ok(!state.members[pat.id] && !(pat.id in state.removed))
  door('circle_state: a stop that has not seen the answer ends the invitation: the member never joined, and is not removed', 'circle_state', [circle.hash, s.held, null], { expect: { removed: {} } })
  door('may_act_as: and what that member signed as the circle carries no authority', 'may_act_as', [lateNote, circle.hash, s.held, null], { expect: false })
  void stop; void yes
}

// ---- 5. Consent follows the principal ----
{
  const s = story(), sal = s.person('sal'), pat = s.person('pat'), ag = s.person('cag', { kind: 'agent' }), other = s.person('cother', { kind: 'agent' })
  const grant = s.say(pat, 'grant', { kind: 'shop', scope: { acts: ['promise'], until: LATER } }, { to: ag.id })
  const circle = s.say(pat, 'actor', { kind: 'circle', name: 'Pat\'s', roles: [{ name: 'admin', powers: ['sign', 'admit', 'remove'] }] })
  const memberGrant = s.say(pat, 'grant', { kind: 'member', roles: ['admin'] }, { subject: circle.hash, as: circle.hash, to: other.id })
  const yes = s.say(sal, 'observe', { kind: 'consent', word: 'yes' }, { subject: pat.id })
  door('consent: a yes to the person is a yes to her agent acting under her live grant', 'consent', [sal.id, ag.id, s.held, grant.hash], { expect: { word: 'yes', block: yes.hash } })
  door('consent: the agent\'s block names no grant: the yes names someone else', 'consent', [sal.id, ag.id, s.held, null], { expect: { word: null, block: null } })
  door('consent: a member grant is not one others act under: it makes no principal', 'consent', [sal.id, other.id, s.held, memberGrant.hash], { expect: { word: null, block: null } })
  const stop = s.say(sal, 'observe', { kind: 'consent', word: 'stop' }, { subject: pat.id })
  door('consent: a STOP naming the person binds her agent acting under her grant', 'consent', [sal.id, ag.id, s.held, grant.hash], { expect: { word: 'stop', block: stop.hash } })
  const post = fb.write('promise', { terms: { expires: DAY } }, { from: pat.id, to: sal.id, what: grant.hash, under: grant.hash }, { author: ag.id, key: keyOf('cag'), held: s.held, at: at(), audience: 'public' })
  door('admission_refusals: the agent\'s first block to a person who has stopped its principal is refused: stopped', 'admission_refusals', [post, sal.id, s.held, {}, 0], { codes: ['not_human', 'stopped'] })
}

// ---- 6. The sealed blocks of a push: the core checks the public header; a header and a body are two halves of one block ----
{
  const s = story(), una = s.person('sealu'), vic = s.person('sealv')
  const n1 = s.say(una, 'observe', { kind: 'note', text: 'one' })
  const sign = (header, who = una) => call('sign_message', header, keyOf(who.name).private_key, 'std')
  const message = (header, who = una) => { const signed = sign(header, who); const { signature, ...h } = signed; return { version: '1.6', header: h, header_signature: signature } }
  const hash = (text) => sha(text)
  const h2 = { author: una.id, seq: 2, prev: n1.hash, hash: hash('sealed two') }
  const m2 = message(h2)
  const base = s.held
  door('accept_sealed: a header signed by a key of its author, the same key\'s next seq, no rival: taken', 'accept_sealed', [[m2], base, null], { expect: { taken: [h2.hash], waiting: [], refused: [], equivocations: [] } })
  const h3 = { author: una.id, seq: 3, prev: h2.hash, hash: hash('sealed three') }
  const m3 = message(h3)
  door('accept_sealed: a header whose prev is not held waits for it', 'accept_sealed', [[m3], base, null], { expect: { taken: [], waiting: [{ hash: h3.hash, needs: [h2.hash] }] } })
  door('accept_sealed: and is taken with it when they arrive together', 'accept_sealed', [[m3, m2], base, null], { expect: { taken: [h2.hash, h3.hash], waiting: [] } })
  door('accept_sealed: a header signed by another identity\'s key is refused: bad_signature', 'accept_sealed', [[message(h2, vic)], base.concat([vic.g]), null], { expect: { taken: [], refused: [{ code: 'bad_signature' }] } })
  door('accept_sealed: a header that skips seq without saying so is refused: chain', 'accept_sealed', [[message({ ...h2, seq: 4 })], base, null], { expect: { taken: [], refused: [{ code: 'chain' }] } })
  door('accept_sealed: a header that says skip may jump forward', 'accept_sealed', [[message({ ...h2, seq: 9, skip: true })], base, null], { expect: { taken: [h2.hash], refused: [] } })
  door('accept_sealed: a header that does not start from the block that brought the key in must continue it: seq 1 after a note is refused', 'accept_sealed', [[message({ ...h2, seq: 1 })], base, null], { expect: { taken: [], refused: [{ code: 'chain' }] } })
  const rival = { author: una.id, seq: 2, prev: n1.hash, hash: hash('sealed two, rival') }
  door('accept_sealed: two headers of one key naming one prev that arrive together: neither is taken, the pair is listed', 'accept_sealed', [[m2, message(rival)], base, null], { expect: { taken: [], equivocations: [sorted([h2.hash, rival.hash])] } })
  const pubTwo = fb.write('observe', { kind: 'note', text: 'public two' }, {}, { author: una.id, key: keyOf('sealu'), held: base, at: at(), audience: 'public', link: { seq: 2, prev: n1.hash } })
  door('accept_sealed: a header that forks a whole block held is the later: not taken, listed', 'accept_sealed', [[m2], base.concat([pubTwo]), null], { expect: { taken: [], equivocations: [sorted([h2.hash, pubTwo.hash])] } })
  // the two halves of one block
  const body = s.say(una, 'observe', { kind: 'note', text: 'two, whole' }, {}, { link: { seq: 2, prev: n1.hash } })
  const headerOfBody = message(fb.header(body))
  const withoutBody = s.without(body)
  door('accept: a body that arrives for a header already held is taken as the other half, never a duplicate', 'accept', [[body], withoutBody.concat([headerOfBody]), null, null], { expect: { taken: [body.hash], waiting: [], refused: [] } })
  door('accept: a body is a duplicate only of a whole block', 'accept', [[body], s.held, null, null], { expect: { taken: [], waiting: [], refused: [] } })
  door('accept_sealed: a header that arrives for a body held is taken as the other half', 'accept_sealed', [[headerOfBody], s.held, null], { expect: { taken: [body.hash], refused: [] } })
  door('accept_sealed: a header that does not describe the body held under its hash is refused: bad_hash', 'accept_sealed', [[message({ ...fb.header(body), seq: 7 })], s.held, null], { expect: { taken: [], refused: [{ code: 'bad_hash' }] } })
  door('accept_sealed: a header already held changes nothing', 'accept_sealed', [[m2], withoutBody.concat([m2]), null], { expect: { taken: [], waiting: [], refused: [], equivocations: [] } })
}

// ---- 7. One refusal rule: the first check that finds anything, every code of that check, in the order of the list ----
{
  const s = story(), who = s.person('rule')
  const n1 = s.say(who, 'observe', { kind: 'note', text: 'one' })
  const base = s.held
  const blk = (type, state, refs) => ({ type, state, refs })
  // a bad time (check 2) and a missing seq (check 4): only check 2 speaks
  const bad = fb.sign ? blk('observe', { at: '2026-02-30T00:00:00.000Z', audience: 'public', kind: 'note' }, { author: who.id, prev: n1.hash }) : null
  door('valid: a bad calendar day and a missing seq: only the first check that finds anything speaks', 'valid', [{ ...bad, signature: '00'.repeat(64) }, base], { codes: ['calendar'] })
  door('strict_text: the same rule over bytes alone', 'strict_text', [JSON.stringify(bad)], { codes: ['calendar'] })
  door('valid: several codes of one check are all listed, in the order of the list', 'valid', [{ ...blk('observe', { at: '2026-02-30T00:00:00.000Z', audience: 'public', kind: 'note', expires: 'nope' }, { author: who.id, prev: n1.hash }), signature: '00'.repeat(64) }, base], { codes: ['time', 'calendar'] })
}

// ---- 8. The strictness inside terms, scope, roles, status ----
{
  const A = 'a'.repeat(64), B = 'b'.repeat(64)
  const common = { seq: 1, at: '2026-10-16T12:00:00.000Z', audience: 'public' }
  const refs = { author: A, prev: A }
  check('a term the protocol does not list is an undeclared field', { type: 'promise', state: { ...common, terms: { expires: DAY, x: 1 }, what: 'x' }, refs: { ...refs, from: A } }, ['undeclared_field'])
  check('a scope key the protocol does not list is an undeclared field', { type: 'grant', state: { ...common, kind: 'shop', scope: { until: LATER, mood: 'x' } }, refs }, ['undeclared_field'])
  check('a grant others act under with no scope has no scope.until', { type: 'grant', state: { ...common, kind: 'shop' }, refs }, ['scope_until'])
  check('a member grant lists role names, as text', { type: 'grant', state: { ...common, kind: 'member', roles: [[]] }, refs: { ...refs, subject: B, as: B } }, ['shape'])
  check('a member grant is signed as the circle', { type: 'grant', state: { ...common, kind: 'member', roles: ['orders'] }, refs: { ...refs, subject: B } }, ['required'])
  check('a role is { name, powers } and nothing else', { type: 'actor', state: { ...common, kind: 'circle', name: 'C', roles: [{ name: 'admin', powers: ['sign'], note: 'x' }] }, refs }, ['bad_roles'])
  check('a stop without a status is refused', { type: 'grant', state: { ...common, kind: 'member', stop: 'onward' }, refs: { ...refs, subject: B, as: B, updates: B } }, ['bad_status'])
  check('a grant\'s status goes with an answer or its author\'s own stop', { type: 'grant', state: { ...common, kind: 'member', status: 'stopped', stop: 'before' }, refs: { ...refs, subject: B, as: B } }, ['status_not_answer'])
  check('an answer carries a status, a grant\'s too', { type: 'grant', state: { ...common, kind: 'member' }, refs: { ...refs, subject: B, answers: B } }, ['required'])
  check('terms is an object', { type: 'promise', state: { ...common, terms: [{ expires: DAY }], what: 'x' }, refs: { ...refs, from: A } }, ['shape'])
  check('skip is true, or left out', { type: 'observe', state: { ...common, kind: 'note', skip: [true] }, refs }, ['shape'])
  check('a promise names what moves, even as text that is not truthy', { type: 'promise', state: { ...common, terms: { expires: DAY }, what: 0 }, refs: { ...refs, from: A } }, ['shape'])
  check('an amount\'s unit is text, not empty', { type: 'promise', state: { ...common, terms: { expires: DAY, quantity: { value: '2', unit: '' } }, what: 'x' }, refs: { ...refs, from: A } }, ['shape'])
  check('a price that is none of money, money per unit or a share is refused', { type: 'promise', state: { ...common, terms: { expires: DAY, price: { minor: 5, currency: 'GBP', place: 'x' } }, what: 'x' }, refs: { ...refs, from: A } }, ['shape'])
  check('an id field holds an id wherever it is written: counted_to', { type: 'observe', state: { ...common, kind: 'note', counted_to: 'nope' }, refs }, ['grammar'])
}

// ---- 9. A protocol constant ----
door('the protocol names how many missing seq numbers check_chain lists', 'spec', [], { expect: { protocol: { limits: { gaps_max: 10000 } } } })

// ---- write ----
fs.writeFileSync(FILE, JSON.stringify(V, null, 1) + '\n')
console.log(`${made.size} cases written to ${path.relative(process.cwd(), FILE)}`)
