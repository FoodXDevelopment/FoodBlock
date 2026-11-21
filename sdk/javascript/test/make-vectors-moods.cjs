// Adds to spec/vectors.json the cases of the three moods (core.md, Types): a decline is a reading, an `observe` that `answers` the block it
// declines, and a decline written before the three moods, with the type of the block it answers, is read the same (append-only). The legacy
// shape stays in the makers that wrote it. `node test/make-vectors-moods.cjs`, after `node scripts/build-wasm.cjs`. Idempotent.
// Every expectation is written here by hand from the spec text and checked against the Rust core; the oracle then checks the file.
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { fb, call, story, door, check, stage, M, DAY, answer } = kit

// the decline as a reading: an observe answering the block it declines, naming the deal in `for` when it is a deal
const decline = (s, who, anchor, refs = {}) => s.say(who, 'observe', { status: 'declined' }, { answers: anchor.hash, after: [anchor.hash], ...refs })

// ---- a promise: the other side's decline ends it ----
{
  const s = story(), ann = s.person('mdAnn'), bob = s.person('mdBob'), eggs = s.say(ann, 'thing', { kind: 'eggs' })
  const offer = s.say(ann, 'promise', { terms: { price: M(450) } }, { from: ann.id, to: bob.id, what: eggs.hash })
  decline(s, bob, offer, { for: offer.hash })
  stage('moods: a decline that is an observe answering the offer ends it: declined', offer, s.held, { stage: 'declined' })

  // an observe that says accepted is no answer to a promise (promises.md, Answers): only the decline may be a reading
  const s2 = story(), ann2 = s2.person('mdAnn2'), bob2 = s2.person('mdBob2'), eggs2 = s2.say(ann2, 'thing', { kind: 'eggs' })
  const offer2 = s2.say(ann2, 'promise', { terms: { price: M(450) } }, { from: ann2.id, to: bob2.id, what: eggs2.hash })
  s2.say(bob2, 'observe', { status: 'accepted' }, { answers: offer2.hash, for: offer2.hash, after: [offer2.hash] })
  stage('moods: an observe that says accepted is no accept: the offer stays offered', offer2, s2.held, { stage: 'offered' })

  // the offerer's own decline of the offer reaches no one: a side cannot decline its own offer
  const s3 = story(), ann3 = s3.person('mdAnn3'), bob3 = s3.person('mdBob3'), eggs3 = s3.say(ann3, 'thing', { kind: 'eggs' })
  const offer3 = s3.say(ann3, 'promise', { terms: { price: M(450) } }, { from: ann3.id, to: bob3.id, what: eggs3.hash })
  decline(s3, ann3, offer3, { for: offer3.hash })
  stage('moods: the offerer\'s own observe saying declined does not end its offer', offer3, s3.held, { stage: 'offered' })
}

// ---- an offer that carried expires: the offerer's decline (a reading) of an accept that reached it late voids that accept ----
{
  const s = story(), tia = s.person('mdTia4'), ugo = s.person('mdUgo4'), eggs = s.say(tia, 'thing', { kind: 'eggs' })
  const firm = s.say(tia, 'promise', { terms: { price: M(450) } }, { from: tia.id, to: ugo.id, what: eggs.hash })
  const yes = answer(s, ugo, firm, { status: 'accepted' })
  decline(s, tia, yes, { for: firm.hash })
  stage('moods: an offer with no expires is firm: the offerer\'s observe declining an accept of it voids nothing', firm, s.held, { stage: 'accepted', accept: yes.hash })
  const timed = s.say(tia, 'promise', { terms: { price: M(450), expires: DAY } }, { from: tia.id, to: ugo.id, what: eggs.hash })
  const yes2 = answer(s, ugo, timed, { status: 'accepted' })
  decline(s, tia, yes2, { for: timed.hash })
  stage('moods: on an offer that carried expires, the offerer\'s observe declining an accept (one that reached her late) voids it', timed, s.held, { stage: 'offered', accept: null })
}

// ---- a transfer: the giver's decline of a late accept, only when the transfer carried expires ----
{
  const s = story(), sal = s.person('mdSal5'), xan = s.person('mdXan5')
  const kind = s.say(sal, 'thing', { kind: 'tray' }), t1 = s.say(sal, 'thing', { kind: 'tray' }, { of: kind.hash }), t2 = s.say(sal, 'thing', { kind: 'tray' }, { of: kind.hash })
  const timed = s.say(sal, 'transfer', { expires: DAY }, { what: t1.hash, to_owner: xan.id })
  const late = s.say(xan, 'transfer', { status: 'accepted' }, { answers: timed.hash })
  decline(s, sal, late)
  door('moods: on a transfer that carried expires, the giver\'s observe declining a late accept keeps it with the giver', 'ownership', [t1, s.held], { expect: { owner: sal.id, transfers: [] }, exact: false })
  const firm = s.say(sal, 'transfer', {}, { what: t2.hash, to_owner: xan.id })
  const yes = s.say(xan, 'transfer', { status: 'accepted' }, { answers: firm.hash })
  decline(s, sal, yes)
  door('moods: on a transfer with no expires, the giver\'s observe declining voids nothing: the receiver owns it', 'ownership', [t2, s.held], { expect: { owner: xan.id, transfers: [firm.hash] }, exact: false })
}

// ---- a conditioned transfer: the receiver lets it go by her own decline, a reading, signed before the condition held ----
for (const lets of [false, true]) {
  const s = story(), fem = s.person('mdFem6' + lets), cafe = s.person('mdCafe6' + lets), mixerKind = s.say(fem, 'thing', { kind: 'mixer' }), mixer = s.say(fem, 'thing', { kind: 'mixer' }, { of: mixerKind.hash })
  const sale = s.say(fem, 'promise', { terms: { price: M(120000) } }, { from: fem.id, to: cafe.id, what: mixer.hash })
  answer(s, cafe, sale, { status: 'accepted' })
  const title = s.say(fem, 'transfer', { condition: { paid: sale.hash } }, { what: mixer.hash, to_owner: cafe.id, for: sale.hash })
  if (lets) decline(s, cafe, title, { for: sale.hash }); else s.say(cafe, 'transfer', { status: 'accepted' }, { answers: title.hash, for: sale.hash })
  const pay = s.say(cafe, 'transfer', { money: M(120000) }, { to_owner: fem.id, for: sale.hash })
  s.say(fem, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: sale.hash })
  const got = call('ownership', mixer, s.held, null)
  assert.equal(got.owner, lets ? fem.id : cafe.id, JSON.stringify(got))
  door(lets ? 'moods: a conditioned transfer its receiver let go by an observe declining it, before it was paid, stays with the giver though it is paid after'
    : 'moods: a conditioned transfer nobody let go moves to its receiver once it is paid', 'ownership', [mixer, s.held, null], { expect: lets ? { owner: fem.id } : { owner: cafe.id }, exact: false })
}

// ---- a stranger: her decline, a reading, keeps him a stranger ----
{
  const s = story(), pia = s.person('mdPia7'), eve = s.person('mdEve7'), eggs = s.say(pia, 'thing', { kind: 'eggs' })
  const offer = s.say(eve, 'promise', { terms: { price: M(300), expires: DAY } }, { from: eve.id, to: pia.id, what: eggs.hash })
  decline(s, pia, offer, { for: offer.hash })
  door('moods: is_stranger: her observe declining his offer keeps him a stranger', 'is_stranger', [pia.id, eve.id, s.held], { expect: true, exact: true })
}

// ---- a grant: the receiver's decline, a reading, ends it; a member's decline of a grant they accepted is a leaving ----
{
  const s = story(), op = s.person('mdOp8'), bot = s.person('mdBot8', { kind: 'agent' })
  const og = s.say(op, 'grant', { kind: 'operator' }, { to: bot.id })
  const yes = s.say(bot, 'grant', { status: 'accepted' }, { answers: og.hash })
  const k1 = s.say(op, 'grant', { kind: 'key', public_key_sign: kit.keyOf('mdk8a').public_key_sign }, { subject: bot.id, under: og.hash, after: [yes.hash] })
  decline(s, bot, og, { after: [k1.hash] })
  const mid = call('key_timeline', bot.id, s.held, null)
  assert.ok(mid.some((k) => k.key === kit.keyOf('mdk8a').public_key_sign))
  s.say(op, 'grant', { kind: 'key', public_key_sign: kit.keyOf('mdk8b').public_key_sign }, { subject: bot.id, under: og.hash })
  const after = call('key_timeline', bot.id, s.held, null)
  assert.ok(!after.some((k) => k.key === kit.keyOf('mdk8b').public_key_sign))
  door('moods: a machine that declines its operator grant by an observe ends it for the blocks that see the decline', 'key_timeline', [bot.id, s.held, null], { expect: after, exact: true })
}
{
  // a member who declines a grant they accepted leaves: the decline is an observe (a reading); one written as a grant before the moods reads the same
  const s = story(), ann = s.person('mdAnn9'), b = s.person('mdB9')
  const club = s.say(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Club', roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }] })
  const gb = s.say(ann, 'grant', { kind: 'member', roles: ['mem'] }, { subject: club.hash, to: b.id, as: club.hash })
  const yb = s.say(b, 'grant', { status: 'accepted', kind: 'member' }, { answers: gb.hash, subject: club.hash })
  assert.ok(call('circle_state', club.hash, s.held).members[b.id])
  decline(s, b, gb, { subject: club.hash, after: [yb.hash] })
  door('moods: a member who declines a grant they accepted, by an observe, leaves', 'circle_state', [club.hash, s.held], { expect: { removed: { [b.id]: null } } })
}

vectorsFile.save(V, tags)
