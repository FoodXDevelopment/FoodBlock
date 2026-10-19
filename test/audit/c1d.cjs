const { fb, oracle, World } = require('./lib.cjs')
const w = new World('repro: circle sign power in promise_stage')
const alice = w.person('alice'), eve = w.person('eve'), bob = w.person('bob')
const cafe = w.w(alice, 'actor', { kind: 'circle', name: 'Cafe', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'guest', powers: [] }] }, {}, 'circle')
// bob joins as guest (no sign power), eve is not a member at all
const mg = w.w(alice, 'grant', { kind: 'member', roles: ['guest'] }, { subject: cafe.hash, to: bob.id, as: cafe.hash }, 'bob guest grant')
w.w(bob, 'grant', { status: 'accepted', kind: 'member' }, { answers: mg.hash, subject: cafe.hash }, 'bob accepts')
const thing = w.w(alice, 'thing', { kind: 'eggs' }, {}, 'eggs kind')
const offer = w.w(alice, 'promise', { terms: { price: { minor: 100, currency: 'GBP' }, expires: '2027-01-01T00:00:00.000Z' } }, { from: alice.id, to: cafe.hash, what: thing.hash }, 'alice offers eggs to cafe')
const show = (...a) => console.log('>>', ...a)
show('before: stage', fb.promiseStage(offer, w.blocks).stage)
const e = w.w(eve, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, as: cafe.hash }, 'eve (not a member) accepts as cafe')
show('after eve-as-cafe accept: stage', fb.promiseStage(offer, w.blocks).stage, '| may_act_as(eve block)=', fb.fold.mayActAs(e, cafe, w.blocks), '| valid=', w.log[w.log.length - 1].sdk)
const w2 = new World('x'); 
// guest only
const b = w.w(bob, 'promise', { status: 'declined' }, { answers: offer.hash, for: offer.hash, as: cafe.hash }, 'bob (guest, no sign) declines as cafe')
show('after guest-as-cafe decline: stage', fb.promiseStage(offer, w.blocks).stage, 'oracle', oracle.door('promise_stage', offer, w.blocks).stage)
