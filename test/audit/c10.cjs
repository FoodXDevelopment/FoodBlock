// Acceptances and stops carry only `status`: no `kind`, no `subject`. What they answer or update says what they are for.
// 1.9 circles (changes-1.9/06-circles.md): member grants are gone. Mo joins by taking parts (Ann's transfer, his bare yes). Nan is seated by a
// grant `as` the co-op that a head-count row names (C11, added by a version, since a row naming a later block comes by one); she says a bare
// yes, and Ann ends the seat by a bare stop `as` the co-op.
const { fb, World } = require('./lib.cjs')
const w = new World('case10 bare acceptance')
const ann = w.person('ann'), mo = w.person('mo'), nan = w.person('nan')
const types = ['promise', 'transfer', 'transform', 'observe', 'thing', 'grant']
const pack = { value: '10', unit: 'part' }
const co = w.w(ann, 'actor', { kind: 'circle', name: 'Co-op', pack, rules: [{ parts: 1, scope: { types } }] }, {}, 'circle')
const gNan = w.w(ann, 'grant', { kind: 'members', scope: { types: ['observe'] } }, { to: nan.id, as: co.hash }, 'seat nan')
const yes = w.w(nan, 'grant', { status: 'accepted' }, { answers: gNan.hash }, 'nan accepts with status alone')
// the head-count row names the seat grant: a version, signed while Ann owns every part
const v = w.w(ann, 'actor', { kind: 'circle', name: 'Co-op', pack, rules: [{ parts: 1, scope: { types } }, { to: gNan.hash, needed: 1, scope: { types: ['observe'] } }] }, { updates: co.hash, as: co.hash, after: [yes.hash] }, 'version: a head-count row on the seat')
const tMo = w.w(ann, 'transfer', { amount: { value: '3', unit: 'part' } }, { what: co.hash, to_owner: mo.id, after: [v.hash] }, 'ann hands mo 3 parts')
w.w(mo, 'transfer', { status: 'accepted' }, { answers: tMo.hash }, 'mo accepts with status alone')
w.w(nan, 'observe', { kind: 'note', text: 'stock counted' }, { as: co.hash, after: [v.hash] }, 'nan counts stock as the co-op (seated)')
const stop = w.w(ann, 'grant', { status: 'stopped', stop: 'onward' }, { updates: gNan.hash, as: co.hash, after: [v.hash] }, 'ann stops nan\'s grant with status alone')
w.w(nan, 'observe', { kind: 'note', text: 'stock counted again' }, { as: co.hash, after: [stop.hash] }, 'nan counts stock as the co-op after the stop')
w.report()
