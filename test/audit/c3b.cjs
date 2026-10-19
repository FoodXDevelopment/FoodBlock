const { fb, oracle, World } = require('./lib.cjs')
const GBP = (m) => ({ minor: m, currency: 'GBP' })
for (const mode of ['direct id', 'pool#assessor role']) {
  const w = new World('case3b ' + mode)
  const nia = w.person('nia'), mia = w.person('mia'), ned = w.person('ned')
  const pool = w.w(nia, 'actor', { kind: 'circle', name: 'pool', roles: [{ name: 'steward', powers: ['sign', 'admit', 'remove'] }, { name: 'assessor', powers: [] }] }, {}, 'pool')
  const g = w.w(nia, 'grant', { kind: 'member', roles: ['assessor'] }, { subject: pool.hash, to: ned.id, as: pool.hash }, 'ned grant'); w.w(ned, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: pool.hash }, 'ned accepts')
  const schema = w.w(nia, 'thing', { kind: 'schema', target: 'promise', grounds: { event: 'hail damage occurred', confirms: ['observe'], confirmers: [mode === 'direct id' ? ned.id : pool.hash + '#assessor'] } }, {}, 'schema')
  const cover = w.w(nia, 'promise', { what: 'cover hail damage up to 500', terms: { price: GBP(0), condition: { peril: 'hail' }, expires: '2027-06-01T00:00:00.000Z' } }, { from: pool.hash, to: mia.id, as: pool.hash, schema: schema.hash }, 'cover')
  w.w(mia, 'promise', { status: 'accepted' }, { answers: cover.hash, for: cover.hash }, 'mia accepts')
  const claim = w.w(mia, 'observe', { kind: 'claim', text: 'hail damaged my roof' }, { for: cover.hash }, 'claim')
  const pay = w.w(nia, 'transfer', { money: GBP(500) }, { to_owner: mia.id, for: cover.hash, as: pool.hash }, 'payout (money from->to)')
  const work = w.w(nia, 'observe', { kind: 'work', text: 'paid out 500' }, { for: cover.hash, derives_from: pay.hash, as: pool.hash }, 'payout as work')
  let s = fb.promiseStage(cover, w.blocks); console.log(mode, '| before confirm:', s.stage, '| oracle', oracle.door('promise_stage', cover, w.blocks).stage)
  w.w(ned, 'observe', { kind: 'confirm', confidence: '1' }, { confirms: work.hash, for: cover.hash }, 'ned confirms the work')
  s = fb.promiseStage(cover, w.blocks); console.log(mode, '| after named confirmer confirms work:', s.stage, '| oracle', oracle.door('promise_stage', cover, w.blocks).stage)
  // does it need mia's accept when confirmed? also members_then using a later block
  const last = w.blocks[w.blocks.length - 1]
  console.log(mode, '| members_then assessor at last block', fb.membersThen(last, pool.hash + '#assessor', w.blocks).map(x => x.slice(0, 6)), 'ned', ned.id.slice(0, 6), 'oracle', oracle.membersThen(last, pool.hash + '#assessor', w.blocks).map(x => x.slice(0, 6)))
  // same, via the confirmers option
  const s2 = fb.promiseStage(cover, w.blocks, { confirmers: [ned.id] }); console.log(mode, '| with confirmers option [ned]:', s2.stage)
  // the "work" counted for a payout: what if the confirmer confirms the TRANSFER (money from->to)
  const w2 = w.problems; if (w2.length) console.log(w2)
}
