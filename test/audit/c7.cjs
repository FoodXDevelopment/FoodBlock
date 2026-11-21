const { fb, oracle, World } = require('./lib.cjs')
const show = (n, ...a) => console.log('>>', n, ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))
const w = new World('case7 teaching')
const teacher = w.person('teacher'), learner = w.person('learner')
const recipe0 = w.w(teacher, 'thing', { kind: 'recipe', name: 'sourdough' }, {}, 'teacher recipe')
const revSchema = w.w(learner, 'thing', { kind: 'schema', target: 'observe.sales', name: 'revenue from loaves of the derived recipe', fields: { revenue: 'amount' } }, {}, 'revenue schema')
const teach = w.w(teacher, 'promise', { what: 'teach sourdough, 2 hours', terms: { quantity: { value: '2', unit: 'h' }, expires: '2027-01-01T00:00:00.000Z' } }, { from: teacher.id, to: learner.id, derives_from: recipe0.hash }, 'promise to teach (the 5% lineage share is written on the make)')
w.w(learner, 'promise', { status: 'accepted' }, { answers: teach.hash, for: teach.hash }, 'learner accepts')
const lesson = w.w(teacher, 'observe', { kind: 'work', text: 'taught 2h', amount: { value: '2', unit: 'h' } }, { for: teach.hash }, 'teacher work: lesson')
let s = fb.promiseStage(teach, w.blocks); show('stage after accept (before work accepted)', s.stage, 'total', s.total)
w.w(learner, 'observe', { status: 'accepted' }, { answers: lesson.hash, for: teach.hash }, 'learner answers lesson accepted (confirmation)')
s = fb.promiseStage(teach, w.blocks); show('stage after learner accepts the lesson', s.stage, 'total', s.total, 'paid', s.paid, 'oracle', oracle.door('promise_stage', teach, w.blocks).stage)
// make: the learner's recipe derives from the teacher's. A recipe is cited, never consumed (things.md, A make): an idea is not property, so no
// share of it is drawn on; a lineage payment to the teacher is a promise of the learner's, never an input of the make.
const tf = w.w(learner, 'transform', { kind: 'adapt' }, { derives_from: recipe0.hash, for: teach.hash }, 'learner transform: adapt recipe (cited)')
const recipe1 = w.w(learner, 'thing', { kind: 'recipe', name: 'my sourdough' }, { derives_from: tf.hash }, 'learner recipe (derives_from transform)')
show('the adapted recipe is valid', w.log.filter(l => l.note.startsWith('learner transform')).map(l => l.sdk))
// `inputs` probes (things.md, A make: `[{ from, amount }]`, `from` one of its derives_from, `amount` zero or more)
const probe = (label, inputs) => { try { fb.write('transform', { kind: 'adapt', inputs }, { derives_from: recipe0.hash }, { author: learner.id, key: learner.keys, held: w.blocks, audience: 'public', at: '2026-10-09T00:00:00.000Z' }); show(label, 'accepted by write check') } catch (e) { show(label, 'refused', e.refused && e.refused.map(x => x.code)) } }
probe('an input not in derives_from', [{ from: 'a'.repeat(64), amount: { value: '0.5', unit: 'kg' } }])
probe('an input below zero', [{ from: recipe0.hash, amount: { value: '-1', unit: 'kg' } }])
// is there any fold exposing derivation/shares?
show('SDK fold names', Object.keys(fb.fold))
w.report()
