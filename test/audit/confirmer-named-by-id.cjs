const { fb, oracle, World } = require('./lib.cjs')
const GBP = (value) => ({ value, unit: 'GBP' })
// Circles: the judge is named by id, never by a role such as `pool#assessor`.
for (const mode of ['direct id']) {
  const w = new World('case3b ' + mode)
  const nia = w.person('nia'), mia = w.person('mia'), ned = w.person('ned')
  const pool = w.w(nia, 'actor', { kind: 'circle', name: 'pool', pack: { value: '100', unit: 'part' }, rules: [{ parts: 1, scope: { parties: 'any', on: 'any', types: ['promise', 'transfer', 'observe', 'thing', 'grant'] } }] }, {}, 'pool')
  const schema = w.w(nia, 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'hail damage occurred', confirms: ['observe'], bench: { names: [ned.id] } } }, {}, 'schema')
  const cover = w.w(nia, 'promise', { what: 'cover hail damage up to 500', terms: { lines: [{ id: 'cover', price: GBP('0') }], condition: { peril: 'hail' }, expires: '2027-06-01T00:00:00.000Z' } }, { from: pool.hash, to: mia.id, as: pool.hash, schema: schema.hash }, 'cover')
  w.w(mia, 'promise', { status: 'accepted' }, { answers: cover.hash, for: cover.hash }, 'mia accepts')
  const claim = w.w(mia, 'observe', { kind: 'claim', text: 'hail damaged my roof' }, { for: cover.hash }, 'claim')
  const pay = w.w(nia, 'transfer', { amount: GBP('5') }, { to_owner: mia.id, for: cover.hash, as: pool.hash }, 'payout (money from->to)')
  const work = w.w(nia, 'observe', { kind: 'work', text: 'paid out 500' }, { for: cover.hash, derives_from: pay.hash, as: pool.hash }, 'payout as work')
  let s = fb.promiseStage(cover, w.blocks); console.log(mode, '| before confirm:', s.stage, '| oracle', oracle.door('promise_stage', cover, w.blocks).stage)
  const confirm = w.w(ned, 'observe', { kind: 'confirm' }, { confirms: work.hash, for: cover.hash }, 'ned confirms the work')
  if (confirm.refusedWrite) throw new Error(`${mode}: the confirm was refused: ${(confirm.error.wrong || [confirm.error.message]).join(' | ')}`)
  s = fb.promiseStage(cover, w.blocks); console.log(mode, '| after named judge confirms work:', s.stage, '| oracle', oracle.door('promise_stage', cover, w.blocks).stage)
  const o = oracle.door('promise_stage', cover, w.blocks).stage
  if (s.stage !== o) throw new Error(`${mode}: core says ${s.stage}, oracle says ${o}`)
  // does it need mia's accept when confirmed? also members_then using a later block
  const last = w.blocks[w.blocks.length - 1]
  console.log(mode, '| members_then (the pool\'s owners) at last block', fb.membersThen(last, pool.hash, w.blocks).map(x => x.slice(0, 6)), 'nia', nia.id.slice(0, 6), 'oracle', oracle.membersThen(last, pool.hash, w.blocks).map(x => x.slice(0, 6)))
  // same, via a confirmers option
  const s2 = fb.promiseStage(cover, w.blocks, { confirmers: [ned.id] }); console.log(mode, '| with confirmers option [ned]:', s2.stage)
  // the "work" counted for a payout: what if the judge confirms the TRANSFER (money from->to)
  const w2 = w.problems; if (w2.length) console.log(w2)
}
