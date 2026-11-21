// Adds to spec/vectors.json the cases of a job's notice period (promises.md, Terms: notice) and of the Counts door `count_of` (folds.md, Counts).
// `node test/make-vectors-notice.cjs`, after `node scripts/build-wasm.cjs`. Idempotent. Each expectation is written here by hand from the spec text.
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { fb, check, door, story } = kit

const s = story(), pat = s.person('notice-pat'), bo = s.person('notice-bo')
const job = (terms) => ({ type: 'promise', state: { what: 'work the morning shift', terms }, refs: { from: pat.id, to: bo.id } })
const GBP = (minor) => fb.money(minor, 'GBP')

check('notice: a period alone is well formed', job({ notice: 'P14D' }), [], s.held)
check('notice: a period beside a forfeit sum is well formed: leaving inside it costs the sum', job({ notice: 'P14D', forfeit: GBP(20000) }), [], s.held)
check('notice: a period that is no duration is refused', job({ notice: 'two weeks' }), ['time'], s.held)
check('notice: a notice that is a sum is refused: the word is a duration', job({ notice: GBP(20000) }), ['time'], s.held)

const signed = s.say(pat, 'promise', { what: 'work the morning shift', terms: { notice: 'P14D', forfeit: GBP(20000) } }, { from: pat.id, to: bo.id })
door('notice: a signed job promise with a notice period and a forfeit sum is valid', 'valid', [signed, s.held.filter((b) => b.hash !== signed.hash), null], { expect: [], exact: true })

const count = (name, needed, members, expect) => door('count_of: ' + name, 'count_of', [needed, members], { expect, exact: true })
count('a whole number is itself', 3, 5, 3)
count('a number as large as the set is itself', 5, 5, 5)
count('a number above the size of the set names no count', 6, 5, null)
count('zero names no count', 0, 5, null)
count('all is every member', 'all', 13, 13)
count('a share is rounded up: two thirds of 10 is 7', { of_members: '2/3' }, 10, 7)
count('a share is never below one', { of_members: '1/10' }, 3, 1)
count('a whole share is every member', { of_members: '3/3' }, 4, 4)
count('a share that is not p/q names no count', { of_members: '2/1' }, 10, null)
count('a share with another key beside it names no count', { of_members: '1/2', x: 1 }, 10, null)
count('a threshold that is text but not all names no count', 'most', 10, null)
count('no threshold stated names no count: none is filled in', null, 10, null)
count('a set with no voice names no count', 'all', 0, null)
V.door = V.door.filter((c) => c.name !== 'count_of: members that is no whole number is an argument error')
V.door.push({ name: 'count_of: members that is no whole number is an argument error', op: 'count_of', args: [3, 'ten'], error: { kind: 'argument' } })
vectorsFile.save(V, tags)
