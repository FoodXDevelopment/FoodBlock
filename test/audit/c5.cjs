const { fb, oracle, World } = require('./lib.cjs')
const show = (n, ...a) => console.log('>>', n, ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))
const w = new World('case5 portable worker record')
const alice = w.person('alice'), wes = w.person('wes')
const biz = w.w(alice, 'actor', { kind: 'circle', name: 'Bakery', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }, { name: 'baker', powers: ['sign'] }] }, {}, 'circle')
const mg = w.w(alice, 'grant', { kind: 'member', roles: ['baker'] }, { subject: biz.hash, to: wes.id, as: biz.hash }, 'wes member grant')
const ma = w.w(wes, 'grant', { status: 'accepted', kind: 'member' }, { answers: mg.hash, subject: biz.hash }, 'wes accepts')
const work = []
for (let i = 0; i < 3; i++) work.push(w.w(wes, 'observe', { kind: 'work', text: 'baked batch ' + i }, { as: biz.hash }, 'wes work as bakery ' + i))
// key rotation (before leaving): wes gets a new key; old key counted_to = work[1]
const newKeys = fb.generateKeypair()
const rot = fb.identity.keyGrant(wes.id, newKeys.public_key_sign, { private_key: wes.keys.private_key, last: work[2], broughtIn: wes.id }, { replaces: wes.keys.public_key_sign, countedTo: work[2].hash, at: '2026-10-02T00:00:00.000Z' })
w.add(rot, 'wes rotates key (counted_to work[2])')
const wes2 = { ...wes, keys: { ...newKeys } }
// new key chain: next link
const nl = fb.identity.nextLinkFor(wes.id, newKeys.public_key_sign, w.blocks); show('next link for new key', nl)
const post = w.w(wes2, 'observe', { kind: 'work', text: 'baked batch 3 (new key)' }, { as: biz.hash }, 'wes work as bakery with NEW key', { link: nl })
// old key keeps writing after rotation (thief or stale device)
const stale = w.raw(wes, 'observe', { kind: 'work', text: 'old key after counted_to' }, { as: biz.hash }, 'old key block after counted_to')
// removal by alice with counted_to = post? wes leaves: counted_to = the new-key post block
const stop = w.w(alice, 'grant', { kind: 'member', status: 'stopped', stop: 'onward', counted_to: post.hash }, { updates: mg.hash, subject: biz.hash, as: biz.hash }, 'alice removes wes counted_to post (his last good)')
const after = w.w(wes2, 'observe', { kind: 'work', text: 'after leaving, still claims bakery' }, { as: biz.hash, after: [stop.hash] }, 'wes writes AFTER the cut as bakery')
const cs = fb.circleState(biz, w.blocks); show('circle removed', cs.removed, 'members', Object.keys(cs.members).map(k => k.slice(0, 6)))
for (const [n, b] of [['work0', work[0]], ['work2', work[2]], ['post(new key)', post], ['stale(old key after counted_to)', stale], ['after cut', after]]) {
  const mine = fb.fold.mayActAs(b, biz, w.blocks), orc = oracle.mayActAs(b, biz.hash, w.blocks), by = fb.identity.signedByAuthor(b, w.blocks)
  show('may_act_as', n, 'sdk', mine, 'oracle', orc, 'signed_by_author', by)
}
// portable bundle: only wes's own blocks + the circle's blocks needed (circle actor, member grant, acceptance, stop) + his genesis + key grant
const mine = w.blocks.filter(b => b.refs.author === wes.id || b.hash === wes.id)
const circleBits = [biz, mg, stop]
const bundle = [...new Map([...mine, ...circleBits].map(b => [b.hash, b])).values()]
show('bundle sizes', bundle.length, 'of', w.blocks.length, 'missing needs for bundle:', bundle.map(b => oracle.door('needs', b, bundle)).flat().length)
// verify with only the bundle (alice's genesis is also needed: the circle's author and the stop's author)
const bundle2 = [...bundle, w.blocks.find(b => b.hash === alice.id), ...w.blocks.filter(b => b.refs.author === alice.id)]
const ids = bundle2.map(b => b.hash)
for (const [n, b] of [['work0', work[0]], ['post', post], ['after', after]]) {
  show('bundle verify may_act_as', n, fb.fold.mayActAs(b, biz, bundle2), 'valid in bundle', JSON.stringify(fb.valid(b, bundle2.filter(x => x.hash !== b.hash)).map(x => x.code)))
}
// Missing alice chain gaps: valid needs prev chain of alice (acts 'unmet')
show('valid(stop) with only [alice genesis, circle, mg, stop-prev?]', JSON.stringify(fb.valid(stop, [biz, mg, w.blocks.find(b => b.hash === alice.id)]).map(x => x.code)))
w.report()
