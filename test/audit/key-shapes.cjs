// Keys: the shape of a key grant and a genesis as written (identity.md, Her voices), and what refs.key may name. Each case is asked
// of `valid` in both engines; `run.cjs` compares their codes. `require` it for `{ questions }`.
const o = require('../../spec/oracle/fb.cjs'); const { call } = require('../../sdk/javascript/src/core.cjs')
const crypto=require('crypto')
const kp=(n)=>{const k=o.keypair(crypto.createHash('sha256').update(n).digest('hex'),'std');return {pub:k.public_key_sign,priv:k.private_key}}
const a=kp('a'), b=kp('b')
const g={type:'actor',state:{kind:'person',at:'2026-11-01T00:00:00.000Z',audience:'public',public_key_sign:a.pub},refs:{}}
const G={hash:o.hashOfBlock(g,'std'),...g,signature:o.signBlock(g,a.priv,'std')}
const id=G.hash
const sign=(blk,k)=>({hash:o.hashOfBlock(blk,'std'),...blk,signature:o.signBlock(blk,k.priv,'std')})
const base=(state,refs)=>({type:'grant',state:{kind:'key',at:'2026-11-01T01:00:00.000Z',audience:'public',seq:1,...state},refs:{author:id,prev:id,subject:id,...refs}})
const cases={
 'list and key together':base({voices:[{key:a.pub}],public_key_sign:b.pub},{updates:id}),
 'list with no updates':base({voices:[{key:a.pub}]},{}),
 'keepers with no list':base({public_key_sign:b.pub,clocks:{names:[id]}},{}),
 'reach on a key grant':base({voices:[{key:a.pub}],reach:'P1D'},{updates:id}),
 'empty list':base({voices:[]},{updates:id}),
 'voice wait not a duration':base({voices:[{key:a.pub,wait:'soon'}],clocks:{names:[id]}},{updates:id}),
 'names unsorted':base({voices:[{key:a.pub},{names:['f'.repeat(64),'e'.repeat(64)],needed:1}]},{updates:id}),
 'keepers names unsorted':base({voices:[{key:a.pub,reach:'P1D'}],clocks:{names:['f'.repeat(64),'e'.repeat(64)],needed:1}},{updates:id}),
 'refs.key names a block not held':{type:'observe',state:{kind:'note',at:'2026-11-01T01:00:00.000Z',audience:'public',seq:1},refs:{author:id,prev:'9'.repeat(64),key:'9'.repeat(64)}},
 'refs.key names the genesis':{type:'observe',state:{kind:'note',at:'2026-11-01T01:00:00.000Z',audience:'public',seq:1},refs:{author:id,prev:id,key:id}},
 'lock with text reach':{type:'grant',state:{kind:'stop',how:'hand',reach:'the roller',at:'2026-11-01T01:00:00.000Z',audience:'public',seq:1},refs:{author:id,prev:id,subject:id}},
}
cases['genesis reach not a duration'] = { type: 'actor', state: { kind: 'person', at: '2026-11-01T00:00:00.000Z', audience: 'public', public_key_sign: a.pub, reach: 'soon', clocks: { names: [id] } }, refs: {} }
const questions = Object.entries(cases).map(([n, blk]) => {
  const B = n.startsWith('genesis') ? { hash: o.hashOfBlock(blk, 'std'), ...blk, signature: o.signBlock(blk, a.priv, 'std') } : sign(blk, n.startsWith('refs.key') ? b : a)
  const blocks = n.startsWith('genesis') ? [] : [G]
  return { world: 'k1 shapes', question: n, op: 'valid', args: [B, blocks], core: call('valid', B, blocks), oracleAnswer: o.door('valid', B, blocks) }
})
module.exports = { questions }
if (require.main === module) for (const q of questions) console.log(q.question, '| core', q.core.map((r) => r.code).join(','), '| oracle', q.oracleAnswer.map((r) => r.code).join(','))
