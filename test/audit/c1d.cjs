// Rule 1 in 1.9 circles: Alice founds the café and owns every part. Bob is seated by a grant `as` the café whose scope names only `observe`
// (1.7's guest, with no power to sign); Eve owns no part and holds no grant. Neither's word on a promise speaks for the café's owners.
const { fb, oracle, World } = require('./lib.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')
const w = new World('repro: circle sign power in promise_stage')
const alice = w.person('alice'), eve = w.person('eve'), bob = w.person('bob')
const cafe = w.w(alice, 'actor', { kind: 'circle', name: 'Cafe', pack: { value: '100', unit: 'part' }, rules: [{ parts: 1, scope: { types: ['promise', 'transfer', 'transform', 'observe', 'thing', 'grant'] } }] }, {}, 'circle')
// bob's seat: a grant as the cafe for observations only
const seat = w.w(alice, 'grant', { kind: 'tool', scope: { types: ['observe'] } }, { to: bob.id, as: cafe.hash }, 'bob seat grant (observe only)')
const thing = w.w(alice, 'thing', { kind: 'eggs' }, {}, 'eggs kind')
const offer = w.w(alice, 'promise', { terms: { price: { value: '1', unit: 'GBP' }, expires: '2027-01-01T00:00:00.000Z' } }, { from: alice.id, to: cafe.hash, what: thing.hash }, 'alice offers eggs to cafe')
const show = (...a) => console.log('>>', ...a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)))
show('before: stage', fb.promiseStage(offer, w.blocks).stage)
const e = w.w(eve, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, as: cafe.hash }, 'eve (no part, no grant) accepts as cafe')
show('after eve-as-cafe accept: stage', fb.promiseStage(offer, w.blocks).stage, '| row_holds(eve block)=', call('row_holds', e, w.blocks), '| valid=', w.log[w.log.length - 1].sdk)
// the guest declines under his seat, whose scope names no promise
w.w(bob, 'promise', { status: 'declined' }, { answers: offer.hash, for: offer.hash, under: seat.hash }, 'bob (seated for observe only) declines under his seat')
show('after guest decline: stage', fb.promiseStage(offer, w.blocks).stage, 'oracle', oracle.door('promise_stage', offer, w.blocks).stage)
w.report()
